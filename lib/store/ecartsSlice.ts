// lib/store/ecartsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Écarts (+PAC, preuves, historique, rappels) extraite du store
// monolithique, comportement identique.
// Appels inter-slices via get() (store composé) : utilisateurs, aerodromes,
// addNotification, getUtilisateur.
// Recalcul risque via ÉVÉNEMENT 'risque:recalcul-demande' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { storeEvents } from './eventBus'
import type { Surveillance } from './surveillancesSlice'
import { NIVEAUX_RISQUE_ECART } from '../config'
import { evaluatePAC } from '../risque/bowTieEngine'
import * as datastore from '../datastore'
import { plansActionsUtils } from '../plansActionsUtils'
// Décisions pures des rappels (la tranche applique : set/emit).
import { evaluerRappelsEcart, evaluerDelaisInspecteur, calculerDelaiRestant } from '../ecarts-rappels'
import { estEnRetardAccepte, qualiteCompte } from '../domaines'

import type {
  Ecart,
  SoumissionPAC,
  EvaluationPAC,
  SoumissionPreuves,
  ValidationPreuves,
  HistoriqueEcart,
  StatistiquesPAC,
} from './ecartsTypes';

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface EcartSlice {
  ecarts: Ecart[]
  currentEcart: Ecart | null
  historiqueEcarts: Record<string, HistoriqueEcart[]>
  setEcarts: (ecarts: Ecart[]) => void
  setCurrentEcart: (ecart: Ecart | null) => void
  addEcart: (ecart: Ecart) => Promise<void>
  updateEcart: (id: string, data: Partial<Ecart>) => Promise<void>
  /**
   * Réajuste les échéances convenues (délais négociés avec l'exploitant).
   * Tracé : historique + notification exploitants + recalcul risque
   * (via updateEcart, les délais étant des clés risque).
   */
  reajusterDelaisEcart: (ecartId: string, delais: { delai_pac?: string; delai_regularisation?: string }, motif?: string) => Promise<void>
  soumettrePAC: (ecartId: string, pacData: SoumissionPAC) => Promise<void>
  evaluerPAC: (ecartId: string, evaluation: EvaluationPAC) => Promise<void>
  soumettrePreuves: (ecartId: string, preuves: SoumissionPreuves) => Promise<void>
  evaluerPreuves: (ecartId: string, validation: ValidationPreuves) => Promise<void>
  validerEvaluationChef: (ecartId: string, action: 'approuve' | 'revision', commentaire?: string) => Promise<void>
  getEcartsByType: (aerodromeId?: string, typeSource?: 'surveillance' | 'evenement') => Ecart[]
  getDelaiRestant: (ecart: Ecart) => { jours: number; couleur: 'vert' | 'orange' | 'rouge'; depasse: boolean }
  getHistoriqueEcart: (ecartId: string) => HistoriqueEcart[]
  addHistoriqueEntry: (ecartId: string, entry: Omit<HistoriqueEcart, 'id'>) => void
  getStatistiquesPAC: (aerodromeId?: string) => StatistiquesPAC
  /**
   * Vigie périodique des écarts (retard + échéances + délais inspecteur).
   * Les vigies dossiers/plannings vivent dans leurs tranches
   * (verifierRappelsDossiers, verifierPlanningsDepasses) — chaque tranche
   * est propriétaire de sa vigie.
   */
  verifierRappelsEcarts: () => void
  marquerEcartEnRetard: (ecartId: string) => void
  envoyerRappelEcart: (ecartId: string, typeRappel: string) => void
  getActiveEcarts: () => Ecart[]
  /**
   * Intègre un écart construit par un autre module (création depuis
   * événement). Idempotent par id — doublon ignoré. Déclenché par
   * l'événement 'ecart:integrer-externe' (voir registerStoreSubscriptions).
   */
  integrerEcartExterne: (ecart: Ecart) => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createEcartsSlice)
// ─────────────────────────────────────────────────────────────

export const createEcartsSlice: StateCreator<AppStore, [], [], EcartSlice> = (set, get) => ({
      ecarts: [],
      currentEcart: null,
      historiqueEcarts: {},
      
      setEcarts: (ecarts) => set({ ecarts }),
      setCurrentEcart: (ecart) => set({ currentEcart: ecart }),
      
      addEcart: async (ecart) => {
        // Valider l'accès à l'aérodrome (sécurité)
        const currentUser = get().user
        const operatorRoles = ['focal_operator', 'dg_operator', 'staff_operator']
        if (currentUser && operatorRoles.includes(currentUser.role)) {
          if (ecart.aerodrome_id !== currentUser.aerodrome_id) {
            throw new Error("Vous ne pouvez créer des écarts que sur votre aérodrome")
          }
        }
        const historiqueEntry: HistoriqueEcart = {
          id: crypto.randomUUID(),
          type: 'creation',
          date: new Date().toISOString(),
          acteur: get().user?.id || 'system',
          role_acteur: get().user?.role || 'system',
          description: `Création de l'écart ${ecart.reference}`
        }
        const result = await datastore.createEcart(ecart)
        if (result.error) {
          console.error('Erreur création écart Supabase:', result.error)
          throw new Error(result.error)
        }
        const savedEcart = result.data as Ecart
        set((state) => ({
          ecarts: [...state.ecarts, savedEcart],
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [savedEcart.id]: [historiqueEntry]
          }
        }))
        // Notifier les exploitants de l'aérodrome concerné
        try {
          const operators = get().utilisateurs.filter(u => 
            ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role) && 
            u.aerodrome_id === ecart.aerodrome_id
          )
          const aero = get().aerodromes.find(a => a.id === ecart.aerodrome_id)
          operators.forEach(op => {
            storeEvents.emit('notification:envoyer', {
              user_id: op.id,
              type: 'warning',
              title: `Nouvel écart — ${aero?.code_oaci || ''}`,
              message: `Écart ${savedEcart.reference} : ${savedEcart.libelle?.substring(0, 100) || 'sans libellé'} (niveau ${savedEcart.niveau_risque})`,
              canal: 'in_app',
              link: '/portail-exploitant/ecarts',
            })
          })
        } catch { /* notification non critique */ }

        // Recalcul immédiat du profil de risque : la création d'un constat
        // critique/élevé (ou sa conversion à la transmission) doit dégrader
        // le score en temps réel, pas attendre le cron quotidien.
        if (savedEcart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: savedEcart.aerodrome_id })
        }
      },
      updateEcart: async (id, data) => {
        const result = await datastore.updateEcart(id, data)
        if (result.error) {
          console.error('Erreur update écart Supabase:', result.error)
          return
        }
        const avant = get().ecarts.find(e => e.id === id)
        set((state) => ({
          ecarts: state.ecarts.map((e) => e.id === id ? { ...e, ...data, ...result.data, updated_at: new Date().toISOString() } : e),
          currentEcart: state.currentEcart?.id === id ? { ...state.currentEcart, ...data, ...result.data } : state.currentEcart,
        }))
        // Dynamisme C2/C4 : uniquement si un champ à impact risque change
        // (évite les recalculs sur retouches de libellé/commentaire).
        const CLES_RISQUE_ECART = ['statut', 'niveau_risque', 'delai_pac', 'delai_regularisation', 'cellule_risque_oaci', 'cellule_risque_reevalue', 'pac', 'evaluation_pac', 'preuves', 'validation_preuves', 'cloture_le']
        if (avant?.aerodrome_id && Object.keys(data || {}).some(k => CLES_RISQUE_ECART.includes(k))) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: avant.aerodrome_id })
        }
      },

      reajusterDelaisEcart: async (ecartId, delais, motif) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        const patch: Partial<Ecart> = {}
        if (delais.delai_pac) patch.delai_pac = delais.delai_pac
        if (delais.delai_regularisation) patch.delai_regularisation = delais.delai_regularisation
        if (Object.keys(patch).length === 0) return
        await get().updateEcart(ecartId, patch)
        const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'
        get().addHistoriqueEntry(ecartId, {
          type: 'ajustement_delais',
          date: new Date().toISOString(),
          acteur: state.user?.id || 'system',
          role_acteur: state.user?.role || 'system',
          description: `Échéances réajustées — PAC : ${fmt(patch.delai_pac ?? ecart.delai_pac)}, régularisation : ${fmt(patch.delai_regularisation ?? ecart.delai_regularisation)}${motif ? ` — ${motif}` : ''}`,
          details: {
            avant: { delai_pac: ecart.delai_pac, delai_regularisation: ecart.delai_regularisation },
            apres: { delai_pac: patch.delai_pac ?? ecart.delai_pac, delai_regularisation: patch.delai_regularisation ?? ecart.delai_regularisation },
            motif,
          },
        })
        try {
          const operators = state.utilisateurs.filter(u =>
            ['focal_operator', 'dg_operator'].includes(u.role) &&
            u.aerodrome_id === ecart.aerodrome_id)
          operators.forEach(op => {
            storeEvents.emit('notification:envoyer', {
              user_id: op.id,
              type: 'info',
              title: `Échéances ajustées — ${ecart.reference}`,
              message: `Nouvelles échéances convenues${motif ? ` (${motif})` : ''} — PAC : ${fmt(patch.delai_pac ?? ecart.delai_pac)}, régularisation : ${fmt(patch.delai_regularisation ?? ecart.delai_regularisation)}`,
              canal: 'in_app',
              link: '/portail-exploitant/ecarts',
            })
          })
        } catch { /* notification non critique */ }
      },
      soumettrePAC: async (ecartId, pacData) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) return
        const now = new Date().toISOString()
        const nouvelleVersion = (ecart.pac?.version || 0) + 1
        const pacPayload = {
          ...pacData,
          soumis_le: now,
          version: nouvelleVersion
        }

        // Sync Supabase EN PREMIER — upsert car l'écart peut exister seulement en local
        // (créé par reparerEcartsManquants si createEcart avait échoué au moment de la transmission)
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: 'pac_soumis',
          pac: pacPayload,
          updated_at: now
        })
        if (syncResult.error) {
          console.error('[soumettrePAC] Échec sync Supabase:', syncResult.error)
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → mise à jour du store local + Bow-Tie risk evaluation
        // Calculer la deadline pour l'évaluation par l'inspecteur
        const niveau = ecart.niveau_risque as keyof typeof NIVEAUX_RISQUE_ECART
        const delaiEvalJours = NIVEAUX_RISQUE_ECART[niveau]?.delai_evaluation_pac ?? 15
        const deadlineEval = new Date(Date.now() + delaiEvalJours * 24 * 60 * 60 * 1000).toISOString()
        // Bow-Tie : évaluer le risque résiduel après PAC
        let pacCellule: string | undefined
        let pacJustification: string | undefined
        try {
          const celluleInit = { probabilite: ecart.probabilite_risque || 3, gravite: ecart.gravite_risque || 'C', cellule: ecart.cellule_risque_oaci || '3C', niveau: (ecart.niveau_risque || 'moyen') as 'critique' | 'eleve' | 'moyen' | 'faible', couleur: '#eab308' }
          const nbActions = (pacData.actions || []).length
          const assessment = evaluatePAC(celluleInit, nbActions, pacData.actions || [])
          if (assessment.celluleResiduelle) {
            pacCellule = assessment.celluleResiduelle.cellule
            pacJustification = assessment.gainPAC
          }
        } catch (err) { console.warn('[BowTie] evaluatePAC échoué:', err) }

        set((state) => {
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? {
                  ...e,
                  statut: 'pac_soumis',
                  pac: pacPayload,
                  // Partiel volontaire (deadline posée à la soumission, notes à
                  // l'évaluation) — cible documentée par l'assertion.
                  evaluation_pac: { deadline: deadlineEval } as Ecart['evaluation_pac'],
                  updated_at: now,
                  ...(pacCellule ? { cellule_risque_reevalue: pacCellule, justification_risque_pac: pacJustification } : {})
                }
              : e
          ) as Ecart[])
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'soumission_pac',
            date: now,
            acteur: pacData.soumis_par,
            role_acteur: 'focal_operator',
            description: `Soumission du PAC version ${nouvelleVersion} — ${(pacData.actions || []).length} action(s) corrective(s)`,
            fichiers: pacData.fichiers,
            // Instantané pour la chronologie (versions passées restées lisibles).
            details: {
              version: nouvelleVersion,
              actions: (pacData.actions || []).map(a => ({
                description: a.description,
                responsable: a.responsable,
                date_prevue: a.date_prevue,
                livrables: a.livrables || [],
              })),
              observations: pacData.observations,
            },
          }
          // DEBUG: vérifier l'état après mise à jour
          const ecartApres = updatedEcarts.find(e => e.id === ecartId)
          console.log('[soumettrePAC] Après set() — statut:', ecartApres?.statut, 'pac:', ecartApres?.pac ? 'PRÉSENT' : 'ABSENT')
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })

        const utilisateur = get().getUtilisateur(ecart.inspecteur_ref_id)
        const dateButoir = new Date(deadlineEval).toLocaleDateString('fr-FR')
        storeEvents.emit('notification:envoyer', {
          user_id: ecart.inspecteur_ref_id,
          type: 'info',
          title: 'Nouveau PAC soumis',
          message: `PAC soumis pour l'écart ${ecart.reference} — À évaluer avant le ${dateButoir}`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
        if (utilisateur?.notifications_email) {
          await fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: utilisateur.notification_email || utilisateur.email,
              subject: `SGDA - Nouveau PAC soumis - ${ecart.reference}`,
              template: 'pac-soumis',
              data: {
                reference: ecart.reference,
                aerodrome: state.aerodromes.find(a => a.id === ecart.aerodrome_id)?.nom,
                lien: `/plans-actions/${ecartId}`
              }
            })
          })
        }
        if (utilisateur?.notifications_sms && utilisateur.telephone) {
          await fetch('/api/notifications/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: utilisateur.telephone,
              message: `SGDA: PAC soumis pour écart ${ecart.reference}. À évaluer.`
            })
          })
        }
        // Dynamisme C2/C4 : PAC soumis → risque à jour via bus.
        if (ecart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
        }
      },

      evaluerPAC: async (ecartId, evaluation) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        // Garde : on n'évalue qu'un PAC soumis (jamais sans soumission exploitant).
        if (ecart.statut !== 'pac_soumis') throw new Error(`Évaluation impossible — l'écart ${ecart.reference} n'a pas de PAC soumis (statut : ${ecart.statut})`)
        // R4 — seuls titulaires et principaux évaluent (observateurs exclus).
        {
          const validateur = state.utilisateurs.find(u => u.id === evaluation.evalue_par)
          if (qualiteCompte(state.inspecteurs || [], validateur) === 'observateur') {
            throw new Error('Évaluation réservée aux inspecteurs titulaires et principaux (observateurs exclus)')
          }
        }
        // Vérifier que l'évaluateur a participé à la surveillance
        if (ecart.surveillance_id) {
          const surv = state.surveillances.find(s => s.id === ecart.surveillance_id)
          const delegue = state.delegations.find(d =>
            d.surveillance_id === ecart.surveillance_id &&
            d.domaine === ecart.domaine &&
            d.assigne_a === evaluation.evalue_par
          )
          const estMembreEquipe = surv?.equipe_ids?.includes(evaluation.evalue_par)
          const estChef = surv?.chef_id === evaluation.evalue_par
          if (!estMembreEquipe && !estChef && !delegue) {
            throw new Error('Vous n\'êtes pas autorisé à évaluer cet écart — seuls les membres de l\'équipe de surveillance peuvent évaluer les PAC')
          }
        }
        const now = new Date().toISOString()
        const dateSoumission = new Date(ecart.pac?.soumis_le || ecart.created_at)
        const dateEvaluation = new Date(evaluation.evalue_le || now)
        const delaiTraitement = Math.ceil((dateEvaluation.getTime() - dateSoumission.getTime()) / (1000 * 60 * 60 * 24))
        // Partiel réel (evalue_le complété à la validation chef) —
        // cible documentée par l'assertion, runtime inchangé.
        const evaluationPac = {
          ...evaluation,
          note_globale: plansActionsUtils.calculerNoteGlobale(evaluation),
          delai_traitement: delaiTraitement
        } as NonNullable<Ecart['evaluation_pac']>
        const validationChef = { type: 'evaluation_pac' as const, statut: 'en_attente' as const }

        // Supabase EN PREMIER
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: 'en_attente_validation_chef',
          evaluation_pac: evaluationPac,
          validation_chef: validationChef,
          updated_at: now
        })
        if (syncResult.error) {
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → store local
        set((state) => {
          const updatedFields: Partial<Ecart> = { statut: 'en_attente_validation_chef', evaluation_pac: evaluationPac, validation_chef: validationChef, updated_at: now }
          if (evaluation.niveau_risque_reevalue) {
            updatedFields.niveau_risque = evaluation.niveau_risque_reevalue
            // Partiel réel (notes détaillées calculées plus tard) — cible documentée.
            updatedFields.evaluation_niveau_risque = {
              note_globale: evaluation.note_globale,
              niveau_suggere: evaluation.niveau_risque_reevalue,
              evalue_par: evaluation.evalue_par,
              evalue_le: evaluation.evalue_le || now,
            } as NonNullable<Ecart['evaluation_niveau_risque']>
          }
          if (evaluation.cellule_risque_oaci_reevaluee) {
            updatedFields.cellule_risque_oaci = evaluation.cellule_risque_oaci_reevaluee
          }
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, ...updatedFields }
              : e
          ) as Ecart[])
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'evaluation_pac',
            date: now,
            acteur: evaluation.evalue_par,
            role_acteur: 'inspector',
            description: `Évaluation PAC soumise au chef — ${evaluation.decision === 'accepte' ? 'accepté' : evaluation.decision === 'reserve' ? 'accepté avec réserves' : 'refusé'}`,
            // Notes à plat (même forme que l'état courant — la chronologie
            // réutilise le même affichage pour versions passées et actuelles).
            details: {
              decision: evaluation.decision,
              note_globale: evaluationPac.note_globale,
              note_pertinence: evaluation.note_pertinence,
              note_exhaustivite: evaluation.note_exhaustivite,
              note_precision: evaluation.note_precision,
              note_specificite: evaluation.note_specificite,
              note_coherence: evaluation.note_coherence,
              note_tracabilite: evaluation.note_tracabilite,
              note_realisme: evaluation.note_realisme,
              commentaire_refus: evaluation.commentaire_refus,
              niveau_risque_reevalue: evaluation.niveau_risque_reevalue,
              delai_traitement: evaluationPac.delai_traitement,
            }
          }
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })

        // Si l'évaluateur est le chef lui-même (participation directe), auto-validation
        const surveillance = get().surveillances.find(s => s.id === ecart.surveillance_id)
        const chefId = surveillance?.chef_id
        if (chefId === evaluation.evalue_par) {
          // Auto-validation : le chef évalue son propre domaine → appliquer directement
          await get().validerEvaluationChef(ecartId, 'approuve')
          return
        }
        // Notification au chef d'équipe
        if (chefId) {
          storeEvents.emit('notification:envoyer', {
            user_id: chefId,
            type: 'info',
            title: 'Validation chef requise',
            message: `L'évaluation du PAC pour l'écart ${ecart.reference} est en attente de votre validation`,
            link: `/plans-actions/${ecartId}`,
            canal: 'in_app'
          })
        }
        // Dynamisme C2 (note/globale, niveau réévalué) via bus.
        if (ecart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
        }
      },

      soumettrePreuves: async (ecartId, preuves) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        // Garde verrouillée : pas de preuves sans PAC accepté (ni contournement
        // du verrouillage acceptation → checklist PAC). Resoumission admise après
        // évaluation (preuves_evaluees) et en retard-accepté.
        if (ecart.statut !== 'pac_accepte' && ecart.statut !== 'preuves_evaluees' && !estEnRetardAccepte(ecart)) {
          throw new Error(`Dépôt impossible — le PAC de l'écart ${ecart.reference} n'est pas accepté (statut : ${ecart.statut})`)
        }
        const now = new Date().toISOString()
        const preuvesPayload = { ...preuves, soumis_le: now }

        // Calculer la deadline pour la validation par l'inspecteur
        const niveau = ecart.niveau_risque as keyof typeof NIVEAUX_RISQUE_ECART
        const delaiEvalJours = NIVEAUX_RISQUE_ECART[niveau]?.delai_evaluation_preuves ?? 10
        const deadlineValidation = new Date(Date.now() + delaiEvalJours * 24 * 60 * 60 * 1000).toISOString()

        // Supabase EN PREMIER
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: 'preuves_soumises',
          preuves: preuvesPayload,
                            // Partiel réel (décision à la soumission) — cible documentée.
                            validation_preuves: { ...(ecart.validation_preuves || {}), deadline: deadlineValidation } as NonNullable<Ecart['validation_preuves']>,
          updated_at: now
        })
        if (syncResult.error) {
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → store local
        set((state) => {
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? {
                  ...e,
                  statut: 'preuves_soumises',
                  preuves: preuvesPayload,
                  validation_preuves: { ...(e.validation_preuves || {}), deadline: deadlineValidation } as NonNullable<Ecart['validation_preuves']>,
                  updated_at: now
                }
              : e
          ) as Ecart[])
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'soumission_preuves',
            date: now,
            acteur: preuves.soumis_par,
            role_acteur: 'focal_operator',
            description: `Soumission des preuves de levée (${(preuves.fichiers || []).length} fichier(s))`,
            fichiers: preuves.fichiers.map(f => f.url),
            details: { commentaire: preuves.commentaire },
          }
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })
        const dateButoirPreuves = new Date(deadlineValidation).toLocaleDateString('fr-FR')
        storeEvents.emit('notification:envoyer', {
          user_id: ecart.inspecteur_ref_id,
          type: 'info',
          title: 'Preuves soumises',
          message: `Des preuves ont été soumises pour l'écart ${ecart.reference} — À valider avant le ${dateButoirPreuves}`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
        // Dynamisme C2/C4 via bus.
        if (ecart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
        }
      },

      evaluerPreuves: async (ecartId, validation) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        // Garde : on ne valide que des preuves soumises.
        if (ecart.statut !== 'preuves_soumises') throw new Error(`Validation impossible — aucune preuve soumise pour l'écart ${ecart.reference} (statut : ${ecart.statut})`)
        // R4 — seuls titulaires et principaux valident (observateurs exclus).
        {
          const validateur = state.utilisateurs.find(u => u.id === validation.valide_par)
          if (qualiteCompte(state.inspecteurs || [], validateur) === 'observateur') {
            throw new Error('Validation réservée aux inspecteurs titulaires et principaux (observateurs exclus)')
          }
        }
        // Vérifier que le validateur a participé à la surveillance
        if (ecart.surveillance_id) {
          const surv = state.surveillances.find(s => s.id === ecart.surveillance_id)
          const delegue = state.delegations.find(d =>
            d.surveillance_id === ecart.surveillance_id &&
            d.domaine === ecart.domaine &&
            d.assigne_a === validation.valide_par
          )
          const estMembreEquipe = surv?.equipe_ids?.includes(validation.valide_par)
          const estChef = surv?.chef_id === validation.valide_par
          if (!estMembreEquipe && !estChef && !delegue) {
            throw new Error('Vous n\'êtes pas autorisé à valider cet écart — seuls les membres de l\'équipe de surveillance peuvent valider les preuves')
          }
        }
        const now = new Date().toISOString()
        const validationChef = { type: 'validation_preuves' as const, statut: 'en_attente' as const }

        // Supabase EN PREMIER
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: 'en_attente_validation_chef',
          validation_preuves: validation,
          validation_chef: validationChef,
          updated_at: now
        })
        if (syncResult.error) {
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → store local
        set((state) => {
          const updatedFields: Partial<Ecart> = {
            statut: 'en_attente_validation_chef',
            validation_preuves: validation,
            validation_chef: validationChef,
            updated_at: now
          }
          if (validation.niveau_risque_reevalue) {
            updatedFields.niveau_risque = validation.niveau_risque_reevalue
          }
          if (validation.cellule_risque_oaci_reevaluee) {
            updatedFields.cellule_risque_oaci = validation.cellule_risque_oaci_reevaluee
          }
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, ...updatedFields }
              : e
          ) as Ecart[])
          const descriptionMap = {
            valide: 'Validation preuves soumise au chef',
            reserve: 'Preuves acceptées avec réserves (attente chef)',
            refuse: 'Preuves refusées (attente chef)',
          }
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'validation_preuves',
            date: now,
            acteur: validation.valide_par,
            role_acteur: 'inspector',
            description: descriptionMap[validation.decision],
            details: {
              commentaire: validation.commentaire,
              notes_criteres: validation.notes_criteres,
              note_globale: validation.note_globale,
              verification_ia: validation.verification_ia,
              reserves: validation.reserves,
            }
          }
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })

        // Si l'évaluateur est le chef lui-même (participation directe), auto-validation
        const surveillance = get().surveillances.find(s => s.id === ecart.surveillance_id)
        const chefId = surveillance?.chef_id
        if (chefId === validation.valide_par) {
          await get().validerEvaluationChef(ecartId, 'approuve')
          return
        }
        // Notification au chef d'équipe
        if (chefId) {
          storeEvents.emit('notification:envoyer', {
            user_id: chefId,
            type: 'info',
            title: 'Validation chef requise',
            message: `La validation des preuves pour l'écart ${ecart.reference} est en attente de votre validation`,
            link: `/plans-actions/${ecartId}`,
            canal: 'in_app'
          })
        }
        // Dynamisme C2 (notes, niveau réévalué) via bus.
        if (ecart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
        }
      },

      validerEvaluationChef: async (ecartId, action, commentaire) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        if (ecart.statut !== 'en_attente_validation_chef') throw new Error('Écart non en attente de validation chef')
        if (!ecart.validation_chef) throw new Error('Aucune validation chef en attente')

        const now = new Date().toISOString()
        const currentUser = state.user

        if (action === 'approuve') {
          // ── PAC ──────────────────────────────────
          if (ecart.validation_chef.type === 'evaluation_pac') {
            const decision = ecart.evaluation_pac?.decision
            const nouveauStatut = (decision === 'accepte' || decision === 'reserve') ? 'pac_accepte' : 'pac_refuse'

            // Délai de régularisation recalculé à partir de l'acceptation du PAC :
            // le compteur repart de la date d'acceptation (sinon le délai fixé à la création
            // peut être déjà dépassé avant même l'acceptation, bloquant la suite du workflow).
            const niveau = ecart.niveau_risque as keyof typeof NIVEAUX_RISQUE_ECART
            const nouveauDelaiReg = nouveauStatut === 'pac_accepte'
              ? new Date(Date.now() + (NIVEAUX_RISQUE_ECART[niveau]?.delai_regularisation ?? 90) * 86400000).toISOString()
              : null

            const syncResult = await datastore.upsertEcart({
              ...ecart,
              statut: nouveauStatut,
              delai_regularisation: nouveauDelaiReg ?? ecart.delai_regularisation,
              validation_chef: { ...ecart.validation_chef, statut: 'approuve', approuve_par: currentUser?.id, approuve_le: now, commentaire },
              updated_at: now
            })
            if (syncResult.error) throw new Error(`Erreur sync: ${syncResult.error}`)

            set((s) => ({
              ecarts: s.ecarts.map(e =>
                e.id === ecartId
                  ? { ...e, statut: nouveauStatut, delai_regularisation: nouveauDelaiReg ?? e.delai_regularisation, validation_chef: { ...e.validation_chef!, statut: 'approuve', approuve_par: currentUser?.id, approuve_le: now, commentaire }, updated_at: now }
                  : e
              )
            }))

            // Chronologie : décision du chef (accepté / réserves / refusé).
            get().addHistoriqueEntry(ecartId, {
              type: 'validation_chef',
              date: now,
              acteur: currentUser?.id || 'system',
              role_acteur: currentUser?.role || 'system',
              description: decision === 'refuse'
                ? `PAC refusé par le chef${commentaire ? ` — ${commentaire}` : ''}`
                : `PAC ${decision === 'reserve' ? 'accepté avec réserves' : 'accepté'} par le chef`,
              details: { objet: 'evaluation_pac', action: 'approuve', decision, commentaire },
            })

            // Création surveillance suivi PAC (anciennement dans evaluerPAC)
            if ((decision === 'accepte' || decision === 'reserve') && ecart.surveillance_id) {
              const surveillanceOriginale = state.surveillances.find(s => s.id === ecart.surveillance_id)
              if (surveillanceOriginale) {
                const delaiReg = new Date(nouveauDelaiReg ?? ecart.delai_regularisation)
                const newSurveillance: Surveillance = {
                  id: crypto.randomUUID(),
                  aerodrome_id: ecart.aerodrome_id,
                  planning_id: surveillanceOriginale.planning_id,
                  type: 'mise_oeuvre_pac',
                  portee: surveillanceOriginale.portee,
                  equipe_ids: surveillanceOriginale.equipe_ids,
                  chef_id: surveillanceOriginale.chef_id,
                  date_debut: now,
                  date_fin: delaiReg.toISOString(),
                  statut: 'planifiee',
                  progression: 0,
                  created_at: now,
                  updated_at: now,
                  created_by: currentUser?.id || '',
                  updated_by: currentUser?.id || '',
                }
                set((s) => ({ surveillances: [...s.surveillances, newSurveillance] }))
                storeEvents.emit('notification:envoyer', {
                  user_id: surveillanceOriginale.chef_id,
                  type: 'info',
                  title: 'Surveillance de suivi PAC créée',
                  message: `Suivi PAC automatique pour l'écart ${ecart.reference}`,
                  link: `/surveillance/${newSurveillance.id}/checklist`,
                  canal: 'in_app',
                })
              }
            }

            // Notification exploitant (anciennement dans evaluerPAC)
            const soumisPar = ecart.pac?.soumis_par
            if (soumisPar) {
              const decisionLabel = decision === 'accepte' || decision === 'reserve' ? 'accepté' : 'refusé'
              const utilisateur = get().getUtilisateur(soumisPar)
              storeEvents.emit('notification:envoyer', {
                user_id: soumisPar,
                type: (decision === 'accepte' || decision === 'reserve') ? 'success' : 'warning',
                title: `PAC ${decisionLabel}`,
                message: `Votre PAC pour l'écart ${ecart.reference} a été ${decisionLabel}${decision === 'refuse' ? '. Veuillez le réviser et le soumettre à nouveau.' : ''}`,
                link: utilisateur?.role === 'focal_operator' || utilisateur?.role === 'dg_operator'
                  ? `/portail-exploitant/ecarts` : `/plans-actions/${ecartId}`,
                canal: 'in_app'
              })
              if (utilisateur?.notifications_email) {
                await fetch('/api/notifications/email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: utilisateur.notification_email || utilisateur.email,
                    subject: `SGDA - PAC ${decisionLabel} - ${ecart.reference}`,
                    template: decision === 'accepte' || decision === 'reserve' ? 'pac-accepte' : 'pac-refuse',
                    data: {
                      reference: ecart.reference,
                      commentaire: ecart.evaluation_pac?.commentaire_refus,
                      lien: utilisateur?.role === 'focal_operator' || utilisateur?.role === 'dg_operator'
                        ? `/portail-exploitant/ecarts` : `/plans-actions/${ecartId}`
                    }
                  })
                })
              }
            }

            // Risque
            if (ecart.aerodrome_id) storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
          }

          // ── Preuves ──────────────────────────────
          else if (ecart.validation_chef.type === 'validation_preuves') {
            const decision = ecart.validation_preuves?.decision
            const nouveauStatut = decision === 'valide' ? 'cloture' : 'preuves_evaluees'

            const syncResult = await datastore.upsertEcart({
              ...ecart,
              statut: nouveauStatut,
              validation_chef: { ...ecart.validation_chef, statut: 'approuve', approuve_par: currentUser?.id, approuve_le: now, commentaire },
              cloture_le: decision === 'valide' ? now : undefined,
              updated_at: now
            })
            if (syncResult.error) throw new Error(`Erreur sync: ${syncResult.error}`)

            set((s) => ({
              ecarts: s.ecarts.map(e =>
                e.id === ecartId
                  ? {
                      ...e,
                      statut: nouveauStatut,
                      validation_chef: { ...e.validation_chef!, statut: 'approuve', approuve_par: currentUser?.id, approuve_le: now, commentaire },
                      cloture_le: decision === 'valide' ? now : undefined,
                      updated_at: now
                    }
                  : e
              )
            }))

            // Chronologie : décision du chef + clôture éventuelle.
            get().addHistoriqueEntry(ecartId, {
              type: 'validation_chef',
              date: now,
              acteur: currentUser?.id || 'system',
              role_acteur: currentUser?.role || 'system',
              description: decision === 'valide'
                ? 'Preuves validées par le chef — écart clôturé'
                : decision === 'reserve'
                  ? `Preuves acceptées avec réserves par le chef${commentaire ? ` — ${commentaire}` : ''}`
                  : `Preuves refusées par le chef${commentaire ? ` — ${commentaire}` : ''}`,
              details: { objet: 'validation_preuves', action: 'approuve', decision, commentaire },
            })
            if (decision === 'valide') {
              get().addHistoriqueEntry(ecartId, {
                type: 'cloture',
                date: now,
                acteur: currentUser?.id || 'system',
                role_acteur: currentUser?.role || 'system',
                description: 'Écart clôturé — preuves validées',
                details: { decision },
              })
            }

            // Notification exploitant (anciennement dans evaluerPreuves)
            const soumisPar = ecart.preuves?.soumis_par
            if (soumisPar) {
              if (decision === 'valide') {
                storeEvents.emit('notification:envoyer', {
                  user_id: soumisPar, type: 'success',
                  title: 'Écart clôturé',
                  message: `L'écart ${ecart.reference} a été clôturé avec succès`,
                  link: `/plans-actions/${ecartId}`, canal: 'in_app'
                })
              } else if (decision === 'reserve') {
                storeEvents.emit('notification:envoyer', {
                  user_id: soumisPar, type: 'warning',
                  title: 'Preuves acceptées avec réserves',
                  message: `Les preuves pour l'écart ${ecart.reference} sont acceptées avec réserves. Corrections requises: ${ecart.validation_preuves?.commentaire}`,
                  link: `/plans-actions/${ecartId}`, canal: 'in_app'
                })
              } else {
                storeEvents.emit('notification:envoyer', {
                  user_id: soumisPar, type: 'warning',
                  title: 'Preuves refusées',
                  message: `Les preuves pour l'écart ${ecart.reference} ont été refusées: ${ecart.validation_preuves?.commentaire}`,
                  link: `/plans-actions/${ecartId}`, canal: 'in_app'
                })
              }
            }

            // Risque
            if (ecart.aerodrome_id) storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
          }
        }

        else if (action === 'revision') {
          // ── PAC revision ─────────────────────────
          if (ecart.validation_chef.type === 'evaluation_pac') {
            const syncResult = await datastore.upsertEcart({
              ...ecart,
              statut: 'pac_soumis',
              validation_chef: { ...ecart.validation_chef, statut: 'revision', approuve_par: currentUser?.id, approuve_le: now, commentaire },
              updated_at: now
            })
            if (syncResult.error) throw new Error(`Erreur sync: ${syncResult.error}`)

            set((s) => ({
              ecarts: s.ecarts.map(e =>
                e.id === ecartId
                  ? { ...e, statut: 'pac_soumis', validation_chef: { ...e.validation_chef!, statut: 'revision', approuve_par: currentUser?.id, approuve_le: now, commentaire }, updated_at: now }
                  : e
              )
            }))

            get().addHistoriqueEntry(ecartId, {
              type: 'validation_chef',
              date: now,
              acteur: currentUser?.id || 'system',
              role_acteur: currentUser?.role || 'system',
              description: `Révision de l'évaluation PAC demandée par le chef${commentaire ? ` — ${commentaire}` : ''}`,
              details: { objet: 'evaluation_pac', action: 'revision', commentaire },
            })

            // Notification à l'inspecteur
            storeEvents.emit('notification:envoyer', {
              user_id: ecart.inspecteur_ref_id,
              type: 'warning',
              title: 'Révision d\'évaluation demandée',
              message: `Le chef demande une révision de votre évaluation du PAC pour l'écart ${ecart.reference}${commentaire ? ` : ${commentaire}` : ''}`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }

          // ── Preuves revision ─────────────────────
          else if (ecart.validation_chef.type === 'validation_preuves') {
            const syncResult = await datastore.upsertEcart({
              ...ecart,
              statut: 'preuves_soumises',
              validation_chef: { ...ecart.validation_chef, statut: 'revision', approuve_par: currentUser?.id, approuve_le: now, commentaire },
              updated_at: now
            })
            if (syncResult.error) throw new Error(`Erreur sync: ${syncResult.error}`)

            set((s) => ({
              ecarts: s.ecarts.map(e =>
                e.id === ecartId
                  ? { ...e, statut: 'preuves_soumises', validation_chef: { ...e.validation_chef!, statut: 'revision', approuve_par: currentUser?.id, approuve_le: now, commentaire }, updated_at: now }
                  : e
              )
            }))

            get().addHistoriqueEntry(ecartId, {
              type: 'validation_chef',
              date: now,
              acteur: currentUser?.id || 'system',
              role_acteur: currentUser?.role || 'system',
              description: `Révision de la validation des preuves demandée par le chef${commentaire ? ` — ${commentaire}` : ''}`,
              details: { objet: 'validation_preuves', action: 'revision', commentaire },
            })

            // Notification à l'inspecteur
            storeEvents.emit('notification:envoyer', {
              user_id: ecart.inspecteur_ref_id,
              type: 'warning',
              title: 'Révision de validation demandée',
              message: `Le chef demande une révision de votre validation des preuves pour l'écart ${ecart.reference}${commentaire ? ` : ${commentaire}` : ''}`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }
        }
      },

      verifierRappelsEcarts: () => {
        const state = get()
        const maintenant = new Date()
        state.ecarts.forEach(ecart => {
          // Décisions pures (lib/ecarts-rappels) — le slice applique.
          const decision = evaluerRappelsEcart(ecart, maintenant)
          if (decision.passerEnRetard) {
            get().marquerEcartEnRetard(ecart.id)
          }
          decision.rappels.forEach((type) => {
            get().envoyerRappelEcart(ecart.id, type)
          })

          // ── Délais d'évaluation inspecteur (PAC soumis) ───────────
          const delaisInsp = evaluerDelaisInspecteur(ecart, maintenant)
          if (delaisInsp.marquerRetardEvalPAC) {
              // Marquer le retard ANACIM
              set((s) => ({
                ecarts: s.ecarts.map(e =>
                  e.id === ecart.id
                    ? { ...e, retard_inspecteur: true, evaluation_pac: { ...e.evaluation_pac!, retard_inspecteur: true } }
                    : e
                )
              }))
              // Escalade au supérieur
              const chefSna = state.utilisateurs.find(u => u.poste === 'chef_sna')
              if (chefSna) {
                storeEvents.emit('notification:envoyer', {
                  user_id: chefSna.id, type: 'danger',
                  title: 'Délai d\'évaluation PAC dépassé',
                  message: `L'inspecteur n'a pas évalué le PAC pour l'écart ${ecart.reference} dans le délai imparti`,
                  link: `/plans-actions/${ecart.id}`, canal: 'in_app'
                })
              }
              storeEvents.emit('notification:envoyer', {
                user_id: ecart.inspecteur_ref_id, type: 'danger',
                title: 'Évaluation PAC en retard',
                message: `Vous avez dépassé le délai d'évaluation du PAC pour l'écart ${ecart.reference}. Une notification a été envoyée à votre supérieur.`,
                link: `/plans-actions/${ecart.id}`, canal: 'in_app'
              })
            } else {
              // Garde : PAC soumis SANS évaluation démarrée (pas de deadline) —
              // rien à rappeler ni à dater (plantait en .deadline sur null).
              const deadlineStr = ecart.evaluation_pac?.deadline
              if (!deadlineStr) return
              const deadlineInsp = new Date(deadlineStr)
              delaisInsp.rappelsEvalPAC.forEach((joursRestantsInsp) => {
                const key: string = `_rappel_eval_j${joursRestantsInsp}`
                storeEvents.emit('notification:envoyer', {
                  user_id: ecart.inspecteur_ref_id, type: 'warning',
                  title: `Rappel évaluation PAC J-${joursRestantsInsp}`,
                  message: `Le PAC pour l'écart ${ecart.reference} doit être évalué avant le ${deadlineInsp.toLocaleDateString('fr-FR')}`,
                  link: `/plans-actions/${ecart.id}`, canal: 'in_app'
                })
                set((s) => ({
                  ecarts: s.ecarts.map(e => e.id === ecart.id ? { ...e, [key]: true } : e)
                }))
              })
            }

          // ── Délais de validation preuves (preuves soumises) ──────
          if (delaisInsp.marquerRetardValidation) {
              set((s) => ({
                ecarts: s.ecarts.map(e =>
                  e.id === ecart.id
                    ? { ...e, retard_inspecteur: true, validation_preuves: { ...e.validation_preuves!, retard_inspecteur: true } }
                    : e
                )
              }))
              const chefSna = state.utilisateurs.find(u => u.poste === 'chef_sna')
              if (chefSna) {
                storeEvents.emit('notification:envoyer', {
                  user_id: chefSna.id, type: 'danger',
                  title: 'Délai de validation preuves dépassé',
                  message: `L'inspecteur n'a pas validé les preuves pour l'écart ${ecart.reference} dans le délai imparti`,
                  link: `/plans-actions/${ecart.id}`, canal: 'in_app'
                })
              }
              storeEvents.emit('notification:envoyer', {
                user_id: ecart.inspecteur_ref_id, type: 'danger',
                title: 'Validation preuves en retard',
                message: `Vous avez dépassé le délai de validation des preuves pour l'écart ${ecart.reference}. Notification envoyée à votre supérieur.`,
                link: `/plans-actions/${ecart.id}`, canal: 'in_app'
              })
            } else {
              const deadlineInsp = new Date(ecart.validation_preuves!.deadline!)
              delaisInsp.rappelsValidation.forEach((joursRestantsInsp) => {
                const key: string = `_rappel_val_j${joursRestantsInsp}`
                storeEvents.emit('notification:envoyer', {
                  user_id: ecart.inspecteur_ref_id, type: 'warning',
                  title: `Rappel validation preuves J-${joursRestantsInsp}`,
                  message: `Les preuves pour l'écart ${ecart.reference} doivent être validées avant le ${deadlineInsp.toLocaleDateString('fr-FR')}`,
                  link: `/plans-actions/${ecart.id}`, canal: 'in_app'
                })
                set((s) => ({
                  ecarts: s.ecarts.map(e => e.id === ecart.id ? { ...e, [key]: true } : e)
                }))
              })
            }
        })
      },

      marquerEcartEnRetard: (ecartId) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart || ecart.statut === 'en_retard') return
        // Vérifier si le retard est dû à l'inspecteur (PAC soumis/preuves soumises en attente d'évaluation)
        const retardInsp = ecart.statut === 'pac_soumis' && ecart.evaluation_pac?.deadline && new Date(ecart.evaluation_pac.deadline) < new Date()
          || ecart.statut === 'preuves_soumises' && ecart.validation_preuves?.deadline && new Date(ecart.validation_preuves.deadline) < new Date()
        set((state) => ({
          ecarts: state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, statut: 'en_retard', retard_inspecteur: retardInsp || e.retard_inspecteur, updated_at: new Date().toISOString() }
              : e
          )
        }))
        const historiqueEntry: HistoriqueEcart = {
          id: crypto.randomUUID(),
          type: 'retard',
          date: new Date().toISOString(),
          acteur: 'system',
          role_acteur: 'system',
          description: `Écart en retard - délai dépassé`
        }
        set((state) => ({
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
          }
        }))
        const utilisateur = get().getUtilisateur(ecart.inspecteur_ref_id)
        if (retardInsp) {
          // Retard imputable à l'inspecteur → escalade au chef SNA
          storeEvents.emit('notification:envoyer', {
            user_id: ecart.inspecteur_ref_id,
            type: 'danger',
            title: 'Évaluation en retard',
            message: `Vous avez dépassé le délai d'évaluation pour l'écart ${ecart.reference}`,
            link: `/plans-actions/${ecartId}`,
            canal: 'in_app'
          })
          const chefSna = state.utilisateurs.find(u => u.poste === 'chef_sna')
          if (chefSna) {
            storeEvents.emit('notification:envoyer', {
              user_id: chefSna.id, type: 'danger',
              title: 'Retard évaluation inspecteur',
              message: `L'inspecteur a dépassé le délai d'évaluation pour l'écart ${ecart.reference}`,
              link: `/plans-actions/${ecartId}`, canal: 'in_app'
            })
          }
          if (utilisateur?.notifications_sms && utilisateur.telephone) {
            fetch('/api/notifications/sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: utilisateur.telephone,
                message: `URGENT: Évaluation écart ${ecart.reference} en retard. Action immédiate requise.`
              })
            }).catch(error => console.error('[Notification] Erreur SMS:', error))
          }
        } else {
          storeEvents.emit('notification:envoyer', {
            user_id: ecart.inspecteur_ref_id,
            type: 'danger',
            title: 'Écart en retard',
            message: `L'écart ${ecart.reference} a dépassé son délai`,
            link: `/plans-actions/${ecartId}`,
            canal: 'in_app'
          })
          if (utilisateur?.notifications_sms && utilisateur.telephone) {
            fetch('/api/notifications/sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: utilisateur.telephone,
                message: `URGENT: Écart ${ecart.reference} en retard. Action requise.`
              })
            }).catch(error => console.error('[Notification] Erreur:', error))
          }
        }
        if (ecart.niveau_risque === 'critique') {
          const dg = state.utilisateurs.find(u => u.role === 'dg_anacim')
          if (dg) {
            storeEvents.emit('notification:envoyer', {
              user_id: dg.id,
              type: 'danger',
              title: 'Écart critique en retard',
              message: `Écart critique ${ecart.reference} en retard - action immédiate requise`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }
        }
        // Dynamisme C4 (recrudescence des retards) via bus — une seule fois
        // (garde anti-doublon en tête de fonction).
        if (ecart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
        }
      },

      envoyerRappelEcart: (ecartId, typeRappel) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) return
        set((state) => ({
          ecarts: state.ecarts.map(e =>
            e.id === ecartId
              ? {
                  ...e,
                  rappels_envoyes: {
                    ...e.rappels_envoyes,
                    [`j${typeRappel.replace('J-', '')}`]: true
                  }
                }
              : e
          )
        }))
        const historiqueEntry: HistoriqueEcart = {
          id: crypto.randomUUID(),
          type: 'rappel',
          date: new Date().toISOString(),
          acteur: 'system',
          role_acteur: 'system',
          description: `Rappel automatique ${typeRappel} envoyé`
        }
        set((state) => ({
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
          }
        }))
        storeEvents.emit('notification:envoyer', {
          user_id: ecart.inspecteur_ref_id,
          type: 'warning',
          title: `Rappel ${typeRappel}`,
          message: `Le délai pour l'écart ${ecart.reference} approche`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
      },

      // Règle d'affichage unique (lib/ecarts-rappels, testée).
      getDelaiRestant: (ecart) => calculerDelaiRestant(ecart),

      getHistoriqueEcart: (ecartId) => {
        return get().historiqueEcarts?.[ecartId] || []
      },

      addHistoriqueEntry: (ecartId, entry) => {
        set((state) => ({
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [ecartId]: [...(state.historiqueEcarts[ecartId] || []), { ...entry, id: crypto.randomUUID() }]
          }
        }))
      },

      getStatistiquesPAC: (aerodromeId) => {
        return plansActionsUtils.getStatistiquesPAC(get().ecarts, aerodromeId)
      },

      getEcartsByType: (aerodromeId, typeSource) => {
        return get().ecarts.filter(e => {
          if (aerodromeId && e.aerodrome_id !== aerodromeId) return false
          if (typeSource === 'surveillance' && !e.surveillance_id) return false
          if (typeSource === 'evenement' && !e.evenement_id) return false
          return true
        })
      },

      getActiveEcarts: () => get().ecarts.filter((e: Ecart) => e.statut !== 'cloture'),

      integrerEcartExterne: (ecart) => {
        const exists = get().ecarts.some(e => e.id === ecart.id)
        if (exists) return
        set((state) => ({ ecarts: [...state.ecarts, ecart] }))
        // Chronologie : tout écart a une naissance traçable (issu d'événement).
        get().addHistoriqueEntry(ecart.id, {
          type: 'creation',
          date: ecart.created_at || new Date().toISOString(),
          acteur: 'system',
          role_acteur: 'system',
          description: `Écart constaté${ecart.evenement_id ? ' depuis un événement de sécurité' : ' lors de la surveillance terrain'}`,
          details: ecart.evenement_id ? { evenement_id: ecart.evenement_id } : undefined,
        })
        if (ecart.aerodrome_id) {
          storeEvents.emit('risque:recalcul-demande', { aerodrome_id: ecart.aerodrome_id })
        }
      },
})
