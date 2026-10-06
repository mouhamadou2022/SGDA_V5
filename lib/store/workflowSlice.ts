// lib/store/workflowSlice.ts — Phase 2 (monolithe modulaire) + Phase 3 (saga)
// SAGA de coordination des statuts surveillance : les mutations awaited
// inter-tranches (updateSurveillance, addEcart, updateEcart,
// updateDelegation) sont le MÉTIER de cette tranche — les convertir en
// événements fire-and-forget casserait la persistance awaited (la
// transmission doit finir d'écrire avant de continuer). Toute la logique
// pure est extraite dans lib/workflow/ (extractionEcarts,
// reglesSignature, conversionEcarts) et testée isolément ; ici ne reste
// que l'orchestration.
// Lectures inter-slices via get() (autorisées). Notifications + sync
// planning via ÉVÉNEMENTS (storeEvents).

import type { StateCreator } from 'zustand'
import type { AppStore, Ecart } from '../store'
import type { Surveillance } from './surveillancesSlice'
import type { SignatureInfo } from '../store'
import type { EcartRedaction } from './ecartsRedactionSlice'
import * as datastore from '../datastore'
import { calculerDelaisEcart, normaliserIdEcart, normaliserNiveauEcart } from '../flux'
import { storeEvents } from './eventBus'
import type { EvaluationSGS } from '@/types/checklist'
// (EcartRedaction/Ecart déjà importés ci-dessus pour le typage strict
// des réparations — remplace les `any` historiques.)
import { registreUtils } from '../registreUtils'
// Logique pure extraite (saga mince) — voir lib/workflow/.
import { extractEcartsFromRapportHtml } from '../workflow/extractionEcarts'
import { fusionnerSignatures, evaluerAvancement, buildPatchSignatureDelegation } from '../workflow/reglesSignature'
import { buildEcartOfficiel } from '../workflow/conversionEcarts'
import { qualiteCompte, signatairesRequisRapport } from '../domaines'

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface WorkflowSlice {
  /**
   * Point d'entrée UNIQUE pour toute signature de checklist (standard, suivi
   * écarts, PAC, évaluation SGS). Fusionne les signatures, fait avancer les
   * délégations du signataire et décide de l'avancement du statut selon la
   * portée : SGS seul → signature SGS suffisante ; portée mixte → SGS ET
   * standard requis ; sans portée → avancement direct (types dédiés).
   */
  signerChecklistSurveillance: (
    surveillanceId: string,
    opts: {
      signataire_id: string
      signataire_nom: string
      signature_url: string
      score_global?: number
      marque_sgs?: boolean
    }
  ) => Promise<{ ok: boolean; avancee: boolean; raison?: string }>
  passerEtapeSuivante: (surveillanceId: string) => Promise<{ ok: boolean; raison?: string }>
  peutPasserEtape: (surveillanceId: string) => { peut: boolean; raison?: string }
  verifierAvantTransmission: (surveillanceId: string) => {
    ok: boolean
    checklistSignee: boolean
    ecartsTraites: boolean
    rapportSigne: boolean
    lettreSigneeDG: boolean
    manquants: string[]
  }
  getProchaineEtape: (surveillance: Surveillance) => {
    type: 'checklist' | 'ecarts' | 'rapport' | 'lettre' | 'transmission' | null
    label: string
  }
  addSignature: (surveillanceId: string, type: string, signature: SignatureInfo) => void
  /**
   * Répare les écarts manquants pour une surveillance déjà transmise :
   * lit les ecartsRedaction (IDB du navigateur) ou Supabase ecarts_redaction
   * et crée les écarts officiels manquants dans la table ecarts.
   */
  reparerEcartsManquants: (surveillanceId: string) => Promise<{ repaired: number; message: string }>
  reparerEcartsTransmisPourAerodrome: (aerodromeId: string) => Promise<{ repaired: number; surveillances: number }>
  /**
   * Rattrapage one-shot (bug Saint-Louis) : signatures SGS déjà posées dont
   * la maturité n'a jamais été reportée. Idempotent (divergents seuls).
   */
  reparerMaturiteSGSNonReportee: () => Promise<number>
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createWorkflowSlice)
// ─────────────────────────────────────────────────────────────

export const createWorkflowSlice: StateCreator<AppStore, [], [], WorkflowSlice> = (set, get) => ({
      addSignature: (surveillanceId: string, type: string, signature: SignatureInfo) => {
        set((state) => {
          const surveillance = state.surveillances.find(s => s.id === surveillanceId)
          if (!surveillance) return state
          const field = `signatures_${type}` as keyof Surveillance
          const currentSignatures = (surveillance[field] as SignatureInfo[] | undefined) || []
          if (currentSignatures.some((s: SignatureInfo) => s.signataire_id === signature.signataire_id)) {
            return state
          }
          const updatedSurveillance = {
            ...surveillance,
            [field]: [...currentSignatures, signature]
          }
          return {
            surveillances: state.surveillances.map(s => 
              s.id === surveillanceId ? updatedSurveillance : s
            )
          }
        })
      },

      // ─── Réparation des écarts manquants (surveillances déjà transmises) ──────
      reparerEcartsManquants: async (surveillanceId) => {
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) return { repaired: 0, message: 'Surveillance introuvable' }

        // 1. Chercher les ecartsRedaction — store IDB en priorité, sinon Supabase
        // any[] volontaire : 3 sources hétérogènes (entités store, lignes
        // partielles Supabase, partiels extraits du HTML) unifiées plus bas
        // avec fallbacks et casts explicites.
        let ecartsRedaction: any[] = get().ecartsRedaction.filter(
          (e: any) => e.surveillance_id === surveillanceId
        )
        if (ecartsRedaction.length === 0) {
          console.log('[reparerEcartsManquants] Store vide, tentative Supabase ecarts_redaction...')
          ecartsRedaction = await datastore.fetchEcartsRedactionBySurveillance(surveillanceId)
        }
        if (ecartsRedaction.length === 0) {
          ecartsRedaction = extractEcartsFromRapportHtml(surveillance)
          if (ecartsRedaction.length > 0) {
            console.log('[reparerEcartsManquants] Écarts reconstruits depuis le rapport signé')
          }
        }
        if (ecartsRedaction.length === 0) {
          return { repaired: 0, message: 'Aucun brouillon d\'écart trouvé (ni store, ni Supabase, ni rapport signé).' }
        }

        // 2. Écarts officiels déjà existants pour cette surveillance
        const existingIds  = new Set(get().ecarts.filter((e: any) => e.surveillance_id === surveillanceId).map((e: any) => e.id))
        const existingRefs = new Set(get().ecarts.filter((e: any) => e.surveillance_id === surveillanceId).map((e: any) => e.reference))

        const now = new Date().toISOString()

        let repaired = 0
        const errors: string[] = []

        for (const er of ecartsRedaction) {
          if (existingIds.has(er.id) || existingRefs.has(er.reference)) continue

          // Barème et identifiants via le contrat de flux (lib/flux.ts).
          const ecartId = normaliserIdEcart(er.id, () => crypto.randomUUID())
          const niveau  = normaliserNiveauEcart(er.niveau || (er as { niveau_risque?: string }).niveau_risque) as Ecart['niveau_risque']
          const delais  = calculerDelaisEcart(niveau)

          const newEcart: Ecart = {
            id:                    ecartId,
            aerodrome_id:          surveillance.aerodrome_id || '',
            surveillance_id:       surveillanceId,
            domaine:               er.domaine || surveillance.portee?.[0] || 'SGS',
            reference:             er.reference || `${new Date().getFullYear()}-REP-${String(repaired + 1).padStart(2, '0')}`,
            ref_reglementaire:     er.ref_reglementaire || '',
            libelle:               er.libelle || '',
            niveau_risque:         niveau,
            cellule_risque_oaci:   er.cellule_risque_oaci,
            probabilite_risque:    er.probabilite_risque,
            gravite_risque:        er.gravite_risque,
            justification_risque_ia: er.justification_risque_ia,
            cellule_ia_suggeree:   er.cellule_ia_suggeree,
            statut:                'pac_attendu',
            delai_pac:             delais.delai_pac,
            delai_regularisation:  delais.delai_regularisation,
            inspecteur_ref_id:     surveillance.chef_id || '',
            created_at:            er.created_at || now,
            updated_at:            now,
          }

          // Ajouter au store local
          set((state: any) => ({ ecarts: [...state.ecarts, newEcart] }))

          // Persister dans Supabase
          const result = await datastore.createEcart(newEcart)
          if (result.error) {
            errors.push(`${newEcart.reference}: ${result.error}`)
            console.error('[reparerEcartsManquants] createEcart error:', result.error)
          } else {
            repaired++
          }
        }

        const msg = errors.length > 0
          ? `${repaired} écart(s) réparé(s). Erreurs: ${errors.join(', ')}`
          : `${repaired} écart(s) récupéré(s) et enregistré(s) en Supabase.`
        console.log('[reparerEcartsManquants]', msg)
        return { repaired, message: msg }
      },

      reparerEcartsTransmisPourAerodrome: async (aerodromeId) => {
        if (!aerodromeId) return { repaired: 0, surveillances: 0 }

        const surveillancesAReparer = get().surveillances.filter(s => {
          if (s.aerodrome_id !== aerodromeId) return false
          if (!['transmise', 'archivee'].includes(s.statut)) return false
          const aUnRapport = !!(s.rapport_html || s.rapport_fichier_url || s.rapport_sig_url)
          const aDesEcartsOfficiels = get().ecarts.some(e => e.surveillance_id === s.id)
          return aUnRapport && !aDesEcartsOfficiels
        })

        let repaired = 0
        for (const surveillance of surveillancesAReparer) {
          const result = await get().reparerEcartsManquants(surveillance.id)
          repaired += result.repaired
        }

        return { repaired, surveillances: surveillancesAReparer.length }
      },

      signerChecklistSurveillance: async (surveillanceId, opts) => {
        const fresh = get().surveillances.find(s => s.id === surveillanceId)
        if (!fresh) return { ok: false, avancee: false, raison: 'Surveillance introuvable' }

        // R3 — qualité verrouillée : observateurs (stagiaires, cadres) ne
        // signent pas. Seuls titulaires et principaux signent.
        {
          const st = get()
          const compte = (st.utilisateurs || []).find(u => u.id === opts.signataire_id)
          if (qualiteCompte(st.inspecteurs || [], compte) === 'observateur') {
            return { ok: false, avancee: false, raison: 'Signature réservée aux inspecteurs titulaires et principaux (observateurs exclus)' }
          }
        }

        // Logique pure (lib/workflow/reglesSignature) — la saga ne fait
        // qu'orchestrer les écritures awaited.
        const now = new Date().toISOString()
        const allSigs = fusionnerSignatures(fresh.signatures_checklist, opts, now)

        const updateData: Partial<Surveillance> = { signatures_checklist: allSigs }
        if (opts.score_global != null) updateData.score_global = opts.score_global
        if (opts.marque_sgs) updateData.sgs_evaluation_signee_le = now

        // Toutes les personnes déléguées QUALIFIÉES doivent avoir signé pour
        // avancer (les observateurs ne sont jamais délégables — leurs
        // délégations résiduelles éventuelles ne bloquent pas).
        const delegations = get().getDelegationsBySurveillance(surveillanceId)
        const stQualite = get()
        const delegatedIds = [...new Set(
          delegations
            .map(d => d.assigne_a)
            .filter(Boolean)
            .filter(id => {
              const compte = (stQualite.utilisateurs || []).find(u => u.id === id)
              return qualiteCompte(stQualite.inspecteurs || [], compte) !== 'observateur'
            }),
        )]
        const decision = evaluerAvancement({
          statut: fresh.statut,
          portee: fresh.portee || [],
          delegatedIds,
          signatures: allSigs,
          marqueSgs: !!opts.marque_sgs,
          sgsEvaluationPrepa: fresh.sgs_evaluation_prepa,
          sgsEvaluationSigneeLe: fresh.sgs_evaluation_signee_le,
          scoreGlobalExistant: fresh.score_global,
          scoreGlobalPropose: opts.score_global,
        })

        if (decision.peutAvancer) updateData.statut = 'checklist_signee'

        await get().updateSurveillance(surveillanceId, updateData)

        // Report maturité SGS → aérodrome (SOURCE UNIQUE) : toute signature
        // marquée SGS avec une évaluation persistée met à jour maturite_sgs +
        // maturite_sgs_detaille. updateAerodrome émet le recalcul (C1) via bus,
        // d'où profil, module aérodrome et portail suivent automatiquement.
        // Sans ceci, N1→N3 restait invisible partout (bug Saint-Louis).
        if (opts.marque_sgs) {
          const prepa = get().surveillances.find(s => s.id === surveillanceId)?.sgs_evaluation_prepa as EvaluationSGS | null | undefined
          if (prepa && typeof prepa.scoreGlobal === 'number') {
            const aeroId = fresh.aerodrome_id
            await get().updateAerodrome(aeroId, {
              maturite_sgs: prepa.scoreGlobal,
              maturite_sgs_detaille: {
                composantes: Object.fromEntries(
                  (prepa.composantes || []).map(c => [c.id, {
                    score: c.score,
                    niveauGlobal: c.niveauGlobal,
                    elements: (c.elements || []).map(e => ({
                      elementId: e.elementId,
                      niveau: e.niveauGlobal,
                      questions: (e.questions || []).map(q => ({
                        questionId: q.id, niveau: q.niveau, justification: q.justification,
                      })),
                    })),
                  }])
                ),
                scoreGlobal: prepa.scoreGlobal,
                evalueLe: prepa.date || now,
                evaluePar: opts.signataire_nom || '',
              } as never,
            })
          }
        }

        // Avancement automatique des délégations du signataire.
        const patchDelegation = buildPatchSignatureDelegation(opts.signature_url, now)
        delegations
          .filter(d => d.assigne_a === opts.signataire_id)
          .forEach(d => {
            get().updateDelegation(d.id, patchDelegation)
          })

        return { ok: true, avancee: decision.peutAvancer, raison: decision.raison }
      },

      /**
       * Rattrapage one-shot (bug Saint-Louis) : signatures SGS déjà posées
       * dont la maturité n'a jamais été reportée à l'aérodrome (ancien code
       * par chemin + id OACI au lieu de l'id). Idempotent : par aérodrome,
       * seule la signature la plus récente est appliquée, et seulement si
       * divergente. Retourne le nombre d'aérodromes réparés.
       */
      reparerMaturiteSGSNonReportee: async () => {
        let repares = 0
        const now = new Date().toISOString()
        const { normaliserScoreSgs } = await import('../utils')
        // Dernière signature SGS par aérodrome (jamais d'écrasement par une vieille).
        const dernieres = new Map<string, Surveillance>()
        for (const s of get().surveillances) {
          if (!s.sgs_evaluation_signee_le) continue
          const precedent = dernieres.get(s.aerodrome_id)
          if (!precedent || (precedent.sgs_evaluation_signee_le || '') < (s.sgs_evaluation_signee_le || '')) {
            dernieres.set(s.aerodrome_id, s)
          }
        }
        for (const s of dernieres.values()) {
          const prepa = s.sgs_evaluation_prepa as EvaluationSGS | null | undefined
          if (!prepa || typeof prepa.scoreGlobal !== 'number') continue
          const aero = get().aerodromes.find(a => a.id === s.aerodrome_id)
          if (!aero) continue
          const attendu = normaliserScoreSgs(prepa.scoreGlobal, 50)
          const actuel = normaliserScoreSgs(aero.maturite_sgs, 50)
          if (attendu === actuel) continue
          await get().updateAerodrome(aero.id, {
            maturite_sgs: prepa.scoreGlobal,
            maturite_sgs_detaille: {
              composantes: Object.fromEntries(
                (prepa.composantes || []).map(c => [c.id, {
                  score: c.score,
                  niveauGlobal: c.niveauGlobal,
                  elements: (c.elements || []).map(e => ({
                    elementId: e.elementId,
                    niveau: e.niveauGlobal,
                    questions: (e.questions || []).map(q => ({
                      questionId: q.id, niveau: q.niveau, justification: q.justification,
                    })),
                  })),
                }])
              ),
              scoreGlobal: prepa.scoreGlobal,
              evalueLe: prepa.date || now,
              evaluePar: prepa.inspecteurNom || '',
            } as never,
          })
          repares++
        }
        return repares
      },

      getProchaineEtape: (surveillance) => {
        const mapping: Record<Surveillance['statut'], { type: 'checklist' | 'ecarts' | 'rapport' | 'lettre' | 'transmission' | null; label: string }> = {
          'planifiee': { type: 'checklist', label: 'Démarrer la checklist' },
          'en_cours': { type: 'checklist', label: 'Continuer la checklist' },
          'checklist_signee': { type: 'ecarts', label: 'Rédiger les écarts' },
          'ecarts_signes': { type: 'rapport', label: 'Rédiger le rapport' },
          'rapport_signe': { type: 'lettre', label: 'Rédiger la lettre' },
          'lettre_signee': { type: 'transmission', label: 'Transmettre' },
          'transmise': { type: null, label: 'Terminée' },
          'archivee': { type: null, label: 'Archivée' }
        }
        return mapping[surveillance.statut]
      },
      
      peutPasserEtape: (surveillanceId) => {
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) return { peut: false, raison: 'Surveillance introuvable' }
        const items = get().checklistItems?.[surveillanceId] || []
        const ecarts = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
        const itemsNSNV = get().getItemsNSNV(surveillanceId)
        switch (surveillance.statut) {
          case 'planifiee': return { peut: true }
          case 'en_cours': {
            // Portée SGS seule : pas d'items de checklist standard — la
            // signature de l'évaluation SGS (PAOE) fait foi.
            const portee = surveillance.portee || []
            const isSgsOnly = portee.length === 1 && portee[0] === 'SGS'
            if (isSgsOnly) {
              return surveillance.sgs_evaluation_signee_le
                ? { peut: true }
                : { peut: false, raison: "L'évaluation SGS doit être renseignée et signée" }
            }
            const progression = get().calculerProgression(surveillanceId)
            if (progression < 100) {
              return { peut: false, raison: `${100 - progression}% des items non renseignés` }
            }
            // Chaque décision NS doit être justifiée (observation ou stylet) :
            // sans constat écrit, pas d'écart traçable derrière.
            const surv = get().surveillances.find(s => s.id === surveillanceId)
            const hierarchie = (surv?.checklist_hierarchy || []) as Array<{
              items?: Array<{ resultat?: string; observation?: string; observation_stylus_data?: string }>
              sousDomaines?: Array<{
                items?: Array<{ resultat?: string; observation?: string; observation_stylus_data?: string }>
                sousSousDomaines?: Array<{ items?: Array<{ resultat?: string; observation?: string; observation_stylus_data?: string }> }>
              }>
            }>
            let nsSansObs = 0
            let nvSansMotif = 0
            const compter = (items?: Array<{ resultat?: string; observation?: string; observation_stylus_data?: string }>) => {
              for (const i of items || []) {
                const sansMotif = !(i.observation || '').trim() && !(i.observation_stylus_data || '').trim()
                if ((i.resultat || '').toUpperCase() === 'NS' && sansMotif) nsSansObs++
                // NV sans motif : on ne signe pas sans savoir pourquoi ce n'est pas vérifié.
                if ((i.resultat || '').toUpperCase() === 'NV' && sansMotif) nvSansMotif++
              }
            }
            if (hierarchie.length > 0) {
              for (const d of hierarchie) {
                compter(d.items)
                for (const sd of d.sousDomaines || []) {
                  compter(sd.items)
                  for (const ssd of sd.sousSousDomaines || []) compter(ssd.items)
                }
              }
            } else {
              compter((get().checklistItems?.[surveillanceId] || []) as Array<{ resultat?: string; observation?: string; observation_stylus_data?: string }>)
            }
            if (nsSansObs > 0) {
              return { peut: false, raison: `${nsSansObs} item(s) NS sans observation — justifiez chaque non-conformité avant de signer` }
            }
            if (nvSansMotif > 0) {
              return { peut: false, raison: `${nvSansMotif} item(s) NV sans motif — dites pourquoi chaque item n'est pas vérifié avant de signer` }
            }
            return { peut: true }
          }
          case 'checklist_signee': {
            if (itemsNSNV.length > 0 && ecarts.length === 0) {
              return { peut: false, raison: 'Des items NS/NV nécessitent la rédaction d\'écarts' }
            }
            return { peut: true }
          }
          case 'ecarts_signes': return { peut: true }
          case 'rapport_signe': {
            // R3 — le rapport est signé par tous les titulaires et principaux
            // de l'équipe (chef compris), observateurs exclus.
            const signatures = surveillance.signatures_rapport || []
            const stRapport = get()
            const requis = signatairesRequisRapport(
              surveillance.equipe_ids, surveillance.chef_id,
              stRapport.inspecteurs || [], stRapport.utilisateurs || [],
            )
            const signataires = new Set(signatures.map(s => s.signataire_id))
            const manquants = requis.filter(id => !signataires.has(id))
            if (manquants.length > 0) {
              return { peut: false, raison: `Signature du rapport : ${manquants.length} signataire(s) qualifié(s) manquant(s) — titulaires et principaux uniquement` }
            }
            return { peut: true }
          }
          case 'lettre_signee': return { peut: surveillance.lettre_signee_url ? true : false }
          case 'transmise': {
            // Archivage possible quand tous les écarts sont clôturés
            const ecartsLies = get().ecarts.filter(e => e.surveillance_id === surveillanceId)
            if (ecartsLies.length > 0 && ecartsLies.some(e => e.statut !== 'cloture')) {
              return { peut: false, raison: 'Tous les écarts doivent être clôturés avant l\'archivage' }
            }
            return { peut: true }
          }
          default: return { peut: false }
        }
      },
      
      passerEtapeSuivante: async (surveillanceId) => {
        const { peut, raison } = get().peutPasserEtape(surveillanceId)
        if (!peut) {
          console.warn('[passerEtapeSuivante] Bloqué:', raison)
          const surveillance = get().surveillances.find(s => s.id === surveillanceId)
          if (surveillance) {
            storeEvents.emit('notification:envoyer', {
              user_id: get().user?.id || '',
              type: 'warning',
              title: 'Étape suivante indisponible',
              message: raison || 'Les conditions pour passer à l\'étape suivante ne sont pas réunies',
              canal: 'in_app',
            })
          }
          return { ok: false, raison }
        }
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) return { ok: false, raison: 'Surveillance introuvable' }
        const mappingStatut: Record<Surveillance['statut'], Surveillance['statut']> = {
          'planifiee': 'en_cours',
          'en_cours': 'checklist_signee',
          'checklist_signee': 'ecarts_signes',
          'ecarts_signes': 'rapport_signe',
          'rapport_signe': 'lettre_signee',
          'lettre_signee': 'transmise',
          'transmise': 'archivee',
          'archivee': 'archivee'
        }
        const nouveauStatut = mappingStatut[surveillance.statut]
        // Statut terminal ou inconnu : rien à faire, la transition est un succès no-op
        if (!nouveauStatut || nouveauStatut === surveillance.statut) return { ok: true }
        {
          if (nouveauStatut !== 'transmise') {
            const updateData: Partial<Surveillance> = { statut: nouveauStatut }
            // Au moment de la signature checklist, persister la hiérarchie complète sur la surveillance
            // pour que l'exploitant puisse voir les résultats après rechargement
            if (nouveauStatut === 'checklist_signee') {
              const hierarchy = get().checklistHierarchy?.[surveillanceId]
              if (hierarchy && hierarchy.length > 0) {
                updateData.checklist_hierarchy = hierarchy
              }
            }
            await get().updateSurveillance(surveillanceId, updateData)
            // Sync Planning lors de l'archivage : le planning lié bascule à
            // `realisee` via événement (le slice plannings s'abonne).
            if (nouveauStatut === 'archivee') {
              const survLiee = get().surveillances.find(s => s.id === surveillanceId)
              storeEvents.emit('planning:mission-terminee', {
                planning_id: survLiee?.planning_id ?? '',
                surveillance_id: surveillanceId,
              })
            }
            // Feedback AERORISQ : ingérer les résultats de checklist pour recalibrage
            if (nouveauStatut === 'checklist_signee') {
              setTimeout(async () => {
                try {
                  const { checklistFeedbackEngine } = await import('@/lib/ia/agents/checklistFeedbackEngine')
                  await checklistFeedbackEngine.ingestSurveillanceResults(surveillanceId)
                } catch (err) {
                  console.warn('[passerEtapeSuivante] Erreur feedback AERORISQ:', err)
                }
                // Vérification de couverture documentaire
                try {
                  const { checklistVerificationEngine } = await import('@/lib/ia/agents/checklistVerificationEngine')
                  const report = await checklistVerificationEngine.verifier(surveillanceId)
                  if (report) {
                    const storeNow = get()
                    storeNow.updateSurveillance(surveillanceId, {
                      verification_report: {
                        dateVerification: report.dateVerification,
                        documents: report.documents.map(d => ({
                          docId: d.docId, docNom: d.docNom, aEvolue: d.aEvolue,
                          versionDoc: d.versionDoc, versionGeneree: d.versionGeneree,
                        })),
                        gapsCount: report.gaps.length,
                        scoreCouverture: report.scoreCouverture,
                        synthese: report.synthese,
                      },
                    })
                    if (report.scoreCouverture < 80 || report.documents.some(d => d.aEvolue)) {
                      console.warn(`[passerEtapeSuivante] Alerte couverture ${report.scoreCouverture}% — ${report.synthese}`)
                    }
                  }
                } catch (err) {
                  console.warn('[passerEtapeSuivante] Erreur vérification couverture:', err)
                }
              }, 0)
            }
            return { ok: true }
          }

          // Quand la surveillance est transmise, convertir les ecartsRedaction en ecarts officiels puis basculer à pac_attendu
            const now = new Date().toISOString()
            // Lire depuis le store Zustand en priorité
            let ecartsRedaction = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
            // Fallback Supabase — si le store est vide (page rechargée entre la rédaction et la transmission)
            if (ecartsRedaction.length === 0) {
              console.log('[passerEtapeSuivante] ecartsRedaction vide en mémoire, chargement depuis Supabase...')
              ecartsRedaction = await datastore.fetchEcartsRedactionBySurveillance(surveillanceId)
              if (ecartsRedaction.length > 0) {
                // Remettre dans le store pour les prochains accès
                set((state: any) => ({
                  ecartsRedaction: [
                    ...state.ecartsRedaction.filter((e: any) => e.surveillance_id !== surveillanceId),
                    ...ecartsRedaction,
                  ],
                }))
              }
            }
            if (ecartsRedaction.length === 0) {
              ecartsRedaction = extractEcartsFromRapportHtml(surveillance) as EcartRedaction[]
              if (ecartsRedaction.length > 0) {
                console.log('[passerEtapeSuivante] Écarts reconstruits depuis le rapport signé')
              }
            }
            console.log(`[passerEtapeSuivante] ${ecartsRedaction.length} écarts(s) à convertir pour ${surveillanceId}`)
            
            // Convertir chaque ecartRedaction en ecart officiel
            for (const ecartRedaction of ecartsRedaction) {
              // Vérifier si l'écart existe déjà dans le tableau principal
              const ecartExistant = get().ecarts.find(e => e.id === ecartRedaction.id || e.reference === ecartRedaction.reference)
              
              if (!ecartExistant) {
                // Écart officiel via le constructeur pur
                // (lib/workflow/conversionEcarts) — la saga await la création.
                const newEcart = buildEcartOfficiel(ecartRedaction, surveillance, now)

                await get().addEcart(newEcart)

                // Notifier les operators
                const aerodrome = get().aerodromes.find(a => a.id === surveillance.aerodrome_id)
                const focalOperators = get().utilisateurs.filter(u => 
                  (u.role === 'focal_operator' || u.role === 'dg_operator' || u.role === 'staff_operator') && 
                  u.aerodrome_id === surveillance.aerodrome_id
                )
                
                focalOperators.forEach(operator => {
                  storeEvents.emit('notification:envoyer', {
                    user_id: operator.id,
                    type: 'warning',
                    title: 'Nouvel écart à traiter',
                    message: `Écart ${newEcart.reference} détecté lors de la surveillance ${surveillance.type}${aerodrome ? ` - ${aerodrome.code_oaci}` : ''}. Veuillez soumettre un PAC avant le ${new Date(newEcart.delai_pac).toLocaleDateString('fr-FR')}.`,
                    link: `/portail-exploitant/ecarts`,
                    canal: 'in_app'
                  })
                  
                  if (operator.notifications_email && (operator.notification_email || operator.email)) {
                    fetch('/api/notifications/email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        to: operator.notification_email || operator.email,
                        subject: `SGDA - Écart ${newEcart.reference} - PAC requis`,
                        template: 'ecart-pac-requis',
                        data: {
                          reference: newEcart.reference,
                          aerodrome: aerodrome?.nom || '',
                          libelle: newEcart.libelle,
                          niveau: newEcart.niveau_risque,
                          delai: new Date(newEcart.delai_pac).toLocaleDateString('fr-FR'),
                          lien: `/portail-exploitant/ecarts`
                        }
                      })
                    })
                    .catch(error => console.error('[Notification] Erreur:', error))
                  }
                })
              } else if (ecartExistant.statut === 'ouvert') {
                // L'écart existe déjà mais est encore ouvert → basculer à pac_attendu
                await get().updateEcart(ecartExistant.id, { statut: 'pac_attendu' })
              }
            }

            // Aussi gérer les écarts déjà dans le tableau principal (cas legacy)
            const ecartsOuverts = get().ecarts.filter((e: Ecart) => 
              e.surveillance_id === surveillanceId && 
              e.statut === 'ouvert' &&
              !ecartsRedaction.some(er => er.id === e.id || er.reference === e.reference)
            )
            for (const ecart of ecartsOuverts) {
              await get().updateEcart(ecart.id, { statut: 'pac_attendu' })
            }

            await get().updateSurveillance(surveillanceId, { statut: nouveauStatut, transmitted_at: now })

            // Sync Planning : la mission est terminée côté surveillance → le
            // planning lié bascule à `realisee` via événement (le slice
            // plannings s'abonne). Best-effort : ne bloque jamais la transmission.
            {
              const survLiee = get().surveillances.find(s => s.id === surveillanceId)
              storeEvents.emit('planning:mission-terminee', {
                planning_id: survLiee?.planning_id ?? '',
                surveillance_id: surveillanceId,
              })
            }

            // Publier le dossier PDF (checklist signée + rapport signé) vers le portail
            // exploitant. Best-effort : ne bloque jamais la transmission en cas d'échec.
            try {
              const { publierDossier } = await import('@/lib/services/dossierTransmission')
              const urls = await publierDossier(surveillanceId)
              const dossierUpdate: Partial<Surveillance> = {}
              if (urls.rapportPdfUrl) dossierUpdate.rapport_pdf_url = urls.rapportPdfUrl
              if (urls.checklistPdfUrl) dossierUpdate.checklist_pdf_url = urls.checklistPdfUrl
              if (Object.keys(dossierUpdate).length > 0) {
                await get().updateSurveillance(surveillanceId, dossierUpdate)
              }
            } catch (err) {
              console.warn('[passerEtapeSuivante] Erreur publication dossier PDF:', err)
            }

            // Créer l'entrée dans le registre via événement (tranche registres propriétaire)
            const surv = get().surveillances.find(s => s.id === surveillanceId)
            if (surv) {
              const aero = get().aerodromes.find(a => a.id === surv.aerodrome_id)
              const entryData = registreUtils.toRegistreEntryFromSurveillance(surv, aero)
              storeEvents.emit('registre:ajouter', {
                id: crypto.randomUUID(),
                ...entryData,
                created_at: now,
              })
            }

            return { ok: true }
        }
      },

      verifierAvantTransmission: (surveillanceId) => {
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) {
          return {
            ok: false,
            checklistSignee: false,
            ecartsTraites: false,
            rapportSigne: false,
            lettreSigneeDG: false,
            manquants: ['Surveillance introuvable']
          }
        }
        const items = get().checklistItems?.[surveillanceId] || []
        const itemsNSNV = get().getItemsNSNV(surveillanceId)
        const ecarts = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
        // La UI enregistre souvent une signature unique (tableau de taille 1) pour le signataire courant.
        // On valide donc sur l'existence d'au moins 1 signature, plutôt que sur (nombre signatures >= taille équipe).
        const checklistSignee = (surveillance.signatures_checklist?.length || 0) >= 1
        const ecartsTraites = itemsNSNV.length === ecarts.length
        // Cohérent avec la garde : tous les signataires qualifiés (R3).
        const requisRapport = signatairesRequisRapport(
          surveillance.equipe_ids, surveillance.chef_id,
          get().inspecteurs || [], get().utilisateurs || [],
        )
        const signatairesRapport = new Set((surveillance.signatures_rapport || []).map(s => s.signataire_id))
        const rapportSigne = requisRapport.length > 0 && requisRapport.every(id => signatairesRapport.has(id))
        const lettreSigneeDG = !!surveillance.lettre_signee_url
        const manquants: string[] = []
        if (!checklistSignee) manquants.push('Checklist non signée par toute l\'équipe')
        if (!ecartsTraites) manquants.push('Des écarts restent à traiter')
        if (!rapportSigne) manquants.push('Rapport non signé')
        if (!lettreSigneeDG) manquants.push('Lettre non signée par le DG')
        return {
          ok: checklistSignee && ecartsTraites && rapportSigne && lettreSigneeDG,
          checklistSignee,
          ecartsTraites,
          rapportSigne,
          lettreSigneeDG,
          manquants
        }
      },
})
