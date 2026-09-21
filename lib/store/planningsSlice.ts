// lib/store/planningsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Plannings (+ propositions N+1) extraite du store monolithique,
// comportement identique.
// Appels inter-slices via get() (store composé) : inspecteurs, utilisateurs,
// aerodromes, addNotification, addPlanning, updatePlanning, incrementerVersion.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { storeEvents } from './eventBus'
import type { DomaineChecklist } from './checklistSlice'
import { normalizePlanningType, type PlanningStatut, type PlanningType } from '../planning'
import { evaluerDepassementPlanning } from '../vigie'
import { genererPlanning } from '../services/planningGenerator'
import * as datastore from '../datastore'

export interface Planning {
  id: string
  aerodrome_id: string
  // Vocabulaire canonique : voir lib/planning.ts. Les aliases historiques
  // ('programmee', 'inopinee') restent acceptés en lecture et sont normalisés
  // via normalizePlanningType() — ne plus stocker de nouvelles valeurs legacy.
  type: PlanningType
  date_debut: string
  date_fin: string
  portee: string[]
  equipe_ids: string[]
  chef_id: string
  // Cycle Planning uniquement : reste `en_cours` pendant le déroulement de la
  // surveillance liée, puis `realisee` (sync auto dans passerEtapeSuivante).
  // Ne JAMAIS affecter les statuts Surveillance (checklist_signee, …, transmise).
  statut: PlanningStatut
  priorite: 'basse' | 'moyenne' | 'haute' | 'critique'
  declencheur?: 'automatique' | 'manuel' | 'renouvellement' | 'evenement' | 'demande_dg'
  objectifs: string
  observations?: string
  est_proposition: boolean
  annee_cible: number
  surveillance_id?: string
  checklist_hierarchy?: DomaineChecklist[]
  checklist_pac?: any[]
  checklist_suivi_ecarts?: any[]
  sgs_evaluation_prepa?: any  // EvaluationSGS — sauvegardée lors de la préparation
  // Délégations préparatoires { domaine_code → inspecteur_id }
  delegations?: Record<string, string>
  // Fiche de briefing pré-mission générée par l'IA (Préparation / préparation-checklist)
  briefing_fiche?: FicheBriefing
  // Rappels avant surveillance
  rappels_envoyes?: { j30?: boolean; j15?: boolean; j7?: boolean; overdue?: boolean }
  // Confirmation par l'inspecteur
  confirme_le?: string
  confirme_par?: string
  date_confirmee?: string
  motif_report?: string
  planning_modifications?: string  // JSON array [{date, utilisateur_id, utilisateur_nom, champ, ancien, nouveau}]
  created_at: string
  updated_at: string
  deleted_at?: string
  deleted_by?: string
}

export interface FicheBriefing {
  reference: string
  type_mission: string
  aerodrome?: string
  periode: string
  objectifs: string[]
  portee: string[]
  equipe: string[]
  points_attention: string[]
  preuves_a_verifier: string[]
  recommandations: string[]
  confiance: number
  genere_le: string
  // ── Enrichissement contexte — données structurées réelles (pas de contenu inventé)
  synthese?: string
  contexte_profil?: {
    score_global: number
    niveau: string
    tendance: string
    c1: number
    c2: number
    c3: number
    c4: number
    c5: number
  }
  contexte_historique?: Array<{
    type: string
    date: string
    statut: string
    score_global?: number
  }>
  contexte_ecarts?: Array<{
    reference: string
    libelle: string
    niveau_risque: string
    statut: string
    ref_reglementaire?: string
    pac: boolean
    delai_pac?: string
  }>
  contexte_evenements?: Array<{
    date: string
    type: string
    gravite: string
    description: string
  }>
}


// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface PlanningSlice {
  plannings: Planning[]
  currentPlanning: Planning | null
  propositionsN1: Planning[]
  setPlannings: (plannings: Planning[]) => void
  setCurrentPlanning: (planning: Planning | null) => void
  setPropositionsN1: (proposals: Planning[]) => void
  addPlanning: (planning: Planning) => Promise<void>
  updatePlanning: (id: string, data: Partial<Planning>) => Promise<void>
  deletePlanning: (id: string) => Promise<void>
  genererPlanningN1: (aerodromeId: string, annee: number) => Planning[]
  validerPropositionN1: (id: string) => Promise<void>
  refuserPropositionN1: (id: string, motif: string) => void
  consoliderPropositionsN1: (ids: string[]) => Promise<void>
  /**
   * Transitions déclenchées par ÉVÉNEMENTS (abonnées dans
   * registerStoreSubscriptions) — la tranche plannings reste propriétaire
   * de ses mutations, le bus ne transporte que l'intention.
   */
  /** Une mission transmise/archivée termine son planning (sauf annulé). */
  marquerMissionTerminee: (planning_id: string, surveillance_id: string) => void
  /** Une surveillance supprimée restaure son planning à planifiée. */
  restaurerMissionAnnulee: (planning_id: string) => void
  /**
   * Marque les flags de rappels envoyés (vigie retard). Déclenché par
   * l'événement 'planning:marquer-rappels' (voir registerStoreSubscriptions).
   */
  marquerRappelsEnvoyes: (
    planning_id: string,
    rappels: { j30?: boolean; j15?: boolean; j7?: boolean; overdue?: boolean },
  ) => void
  /**
   * Vigie des plannings dont la date de fin est dépassée (sans clôture).
   * Déménagé de ecartsSlice.verifierRappelsAutomatiques : chaque tranche
   * est propriétaire de sa vigie. Décision pure dans lib/vigie.ts.
   */
  verifierPlanningsDepasses: () => void
}


// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createPlanningsSlice)
// ─────────────────────────────────────────────────────────────

export const createPlanningsSlice: StateCreator<AppStore, [], [], PlanningSlice> = (set, get) => ({
      plannings: [],
      currentPlanning: null,
      propositionsN1: [],
      setPlannings: (plannings) => set({ plannings }),
      setCurrentPlanning: (planning) => set({ currentPlanning: planning }),
      setPropositionsN1: (proposals) => set({
        propositionsN1: proposals.map(p => ({
          ...p,
          id: p.id && /^[0-9a-f]{8}-/i.test(p.id) ? p.id : crypto.randomUUID(),
        })),
      }),
      addPlanning: async (planning) => {
        // Nettoyer les champs vides — assigner un chef par défaut si vide
        // Normaliser le type vers le vocabulaire canonique (lib/planning.ts) :
        // les valeurs legacy ne sont plus stockées.
        const cleanPlanning = { ...planning, type: normalizePlanningType(planning.type) as Planning['type'] }
        if (!cleanPlanning.date_fin) cleanPlanning.date_fin = undefined as any;
        if (!cleanPlanning.chef_id || cleanPlanning.chef_id === '') cleanPlanning.chef_id = undefined as any;
        if (!cleanPlanning.chef_id || cleanPlanning.chef_id === '00000000-0000-0000-0000-000000000000') {
          // 1) Inspecteur principal ou titulaire
          const inspecteurs = get().inspecteurs || []
          const chefDefaut = inspecteurs.find(i => i.type === 'inspecteur_principal' && i.statut === 'en_service' && !i.deleted_at)
            || inspecteurs.find(i => i.type === 'inspecteur_titulaire' && i.statut === 'en_service' && !i.deleted_at)
            || inspecteurs.find(i => !i.deleted_at)
          if (chefDefaut?.user_id) {
            cleanPlanning.chef_id = chefDefaut.user_id
          } else {
            // 2) Utilisateur actif ou admin
            const utilisateurs = get().utilisateurs || []
            const userDefaut = get().user
              || utilisateurs.find(u => u.role === 'admin' && u.statut === 'actif')
              || utilisateurs.find(u => u.statut === 'actif')
            cleanPlanning.chef_id = userDefaut?.id || crypto.randomUUID()
          }
        }
        const result = await datastore.createPlanning(cleanPlanning)
        if (result.error) {
          console.error('Erreur création planning Supabase:', result.error)
          throw new Error(result.error)
        }
        set((state) => ({ plannings: [...state.plannings, result.data as Planning] }))

        // Notifier les membres de l'équipe par email
        if (cleanPlanning.equipe_ids?.length) {
          const _aero = get().aerodromes.find(a => a.id === cleanPlanning.aerodrome_id)
          const _codeOaci = _aero?.code_oaci ?? ''
          const _typeLabel = (cleanPlanning.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
          const _dateDebut = cleanPlanning.date_debut ? new Date(cleanPlanning.date_debut).toLocaleDateString('fr-FR') : '—'
          const _dateFin = cleanPlanning.date_fin ? new Date(cleanPlanning.date_fin).toLocaleDateString('fr-FR') : '—'
          cleanPlanning.equipe_ids.forEach((uid: string) => {
            const u = get().getUtilisateur(uid)
            const emailTo = u?.notification_email || u?.email
            if (u && emailTo) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: emailTo,
                  subject: `SGDA - Nouvelle assignation — ${_codeOaci}`,
                  message: `Bonjour ${u.prenom},\n\nVous avez été assigné à la surveillance ${_typeLabel} de ${_codeOaci} du ${_dateDebut} au ${_dateFin}.\n\nMerci de préparer votre mission.\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
        }
      },
      updatePlanning: async (id, data) => {
        const oldPlanning = get().plannings.find(p => p.id === id)
        const normalizedData = data.type
          ? { ...data, type: normalizePlanningType(data.type) as Planning['type'] }
          : data
        const result = await datastore.updatePlanning(id, normalizedData)
        if (result.error) {
          console.error('Erreur update planning Supabase:', result.error)
          return
        }
        set((state) => ({
          plannings: state.plannings.map((p) => p.id === id ? { ...p, ...normalizedData, ...result.data } : p),
          currentPlanning: state.currentPlanning?.id === id ? { ...state.currentPlanning, ...normalizedData, ...result.data } : state.currentPlanning,
        }))

        if (!oldPlanning) return
        const _aerodrome = get().aerodromes.find(a => a.id === oldPlanning.aerodrome_id)
        const _codeOaci = _aerodrome?.code_oaci ?? oldPlanning.aerodrome_id
        const _typeLabel = (oldPlanning.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
        const _equipeIds: string[] = (normalizedData.equipe_ids ?? oldPlanning.equipe_ids) || []
        const _exploitants = get().utilisateurs.filter(u =>
          u.aerodrome_id === oldPlanning.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        const _notifyAll = (type: 'info' | 'success' | 'warning' | 'danger', title: string, message: string) => {
          ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
            storeEvents.emit('notification:envoyer', { user_id: uid, type, title, message, canal: 'in_app' })
          )
          // Email aux membres de l'équipe
          ;[...new Set(_equipeIds)].forEach(uid => {
            const u = get().getUtilisateur(uid)
            const emailTo = u?.notification_email || u?.email
            if (u && emailTo && u.notifications_email !== false) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: emailTo,
                  subject: `SGDA - ${title}`,
                  message: `Bonjour ${u.prenom},\n\n${message}\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
          // Email aux exploitants
          _exploitants.forEach(op => {
            const emailTo = op.notification_email || op.email
            if (emailTo && op.notifications_email !== false) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: emailTo,
                  subject: `SGDA - ${title}`,
                  message: `Bonjour ${op.prenom || 'Exploitant'},\n\n${message}\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
        }

        // ── Confirmation par l'inspecteur → notifier les exploitants ──
        if (data.confirme_le && !oldPlanning?.confirme_le) {
          const dateConfirmee = data.date_confirmee || oldPlanning.date_debut
          const dateStr = new Date(dateConfirmee).toLocaleDateString('fr-FR')
          const motif = data.motif_report ? `\nMotif du report : ${data.motif_report}` : ''
          const user = get().user
          const confirmePar = user ? `${user.prenom} ${user.nom}` : 'ANACIM'
          _exploitants.forEach(op => {
            storeEvents.emit('notification:envoyer', {
              user_id: op.id,
              type: 'success',
              title: `✅ Surveillance confirmée — ${_codeOaci}`,
              message: `La surveillance ${_typeLabel} de ${_codeOaci} est confirmée pour le ${dateStr} par ${confirmePar}.${motif}\nPréparez vos documents et registres.`,
              canal: 'in_app',
            })
            // Email à l'exploitant
            if (op.notifications_email && (op.notification_email || op.email)) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: op.notification_email || op.email,
                  subject: `SGDA - Surveillance confirmée ${_codeOaci} - ${dateStr}`,
                  message: `Bonjour,\n\nLa surveillance ${_typeLabel} de votre aérodrome (${_codeOaci}) est confirmée pour le ${dateStr}.\nDomaines concernés : ${(oldPlanning.portee || []).join(', ') || 'tous'}.\n\nMerci de préparer les documents et registres nécessaires.\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
        }

        // ── Statut change ──────────────────────────────────────────────
        if (data.statut && data.statut !== oldPlanning.statut) {
          switch (data.statut as string) {
            case 'annulee':
              _notifyAll('danger', `❌ Surveillance annulée — ${_codeOaci}`, `La surveillance ${_typeLabel} prévue pour ${_codeOaci} a été annulée.`)
              break
            case 'realisee':
              _notifyAll('success', `✅ Surveillance réalisée — ${_codeOaci}`, `La surveillance ${_typeLabel} de ${_codeOaci} est marquée comme réalisée.`)
              break
            case 'en_retard':
              _notifyAll('warning', `⏰ Surveillance en retard — ${_codeOaci}`, `La surveillance ${_typeLabel} prévue pour ${_codeOaci} accuse du retard.`)
              break
            case 'en_cours':
              _equipeIds.forEach(uid =>
                storeEvents.emit('notification:envoyer', { user_id: uid, type: 'info', title: `🔍 Surveillance démarrée — ${_codeOaci}`, message: `La surveillance ${_typeLabel} de ${_codeOaci} est maintenant en cours.`, canal: 'in_app' })
              )
              break
          }
        }

        // ── Date changes ───────────────────────────────────────────────
        const _dateChanged =
          (data.date_debut && data.date_debut !== oldPlanning.date_debut) ||
          (data.date_fin   && data.date_fin   !== oldPlanning.date_fin)
        if (_dateChanged) {
          const _dateDebut = new Date(data.date_debut ?? oldPlanning.date_debut).toLocaleDateString('fr-FR')
          const _dateFin   = new Date(data.date_fin   ?? oldPlanning.date_fin).toLocaleDateString('fr-FR')
          _notifyAll('warning', `📅 Dates modifiées — ${_codeOaci}`, `La surveillance ${_typeLabel} de ${_codeOaci} a été reprogrammée du ${_dateDebut} au ${_dateFin}.`)
        }

        // ── Equipe changes ─────────────────────────────────────────────
        if (data.equipe_ids) {
          const _ancienne = new Set<string>(oldPlanning.equipe_ids || [])
          const _nouvelle = new Set<string>(data.equipe_ids)
          ;data.equipe_ids.filter((uid: string) => !_ancienne.has(uid)).forEach((uid: string) => {
            storeEvents.emit('notification:envoyer', { user_id: uid, type: 'info', title: `📋 Nouvelle assignation — ${_codeOaci}`, message: `Vous avez été assigné à la surveillance ${_typeLabel} de ${_codeOaci}.`, canal: 'in_app' })
            const u = get().getUtilisateur(uid)
            const emailTo = u?.notification_email || u?.email
            if (u && emailTo && u.notifications_email !== false) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: emailTo,
                  subject: `SGDA - Nouvelle assignation — ${_codeOaci}`,
                  message: `Bonjour ${u.prenom},\n\nVous avez été assigné à la surveillance ${_typeLabel} de ${_codeOaci}.\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
          ;[..._ancienne].filter(uid => !_nouvelle.has(uid)).forEach(uid => {
            storeEvents.emit('notification:envoyer', { user_id: uid, type: 'warning', title: `📋 Désassignation — ${_codeOaci}`, message: `Vous avez été retiré de la surveillance ${_typeLabel} de ${_codeOaci}.`, canal: 'in_app' })
            const u = get().getUtilisateur(uid)
            const emailTo = u?.notification_email || u?.email
            if (u && emailTo && u.notifications_email !== false) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: emailTo,
                  subject: `SGDA - Désassignation — ${_codeOaci}`,
                  message: `Bonjour ${u.prenom},\n\nVous avez été retiré de la surveillance ${_typeLabel} de ${_codeOaci}.\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
        }
      },
      deletePlanning: async (id) => {
        const _planning = get().plannings.find(p => p.id === id)
        const result = await datastore.deletePlanning(id)
        if (result.error) {
          console.error('Erreur delete planning Supabase:', result.error)
          return
        }
        set((state) => ({
          plannings: state.plannings.filter((p) => p.id !== id),
          currentPlanning: state.currentPlanning?.id === id ? null : state.currentPlanning,
        }))

        if (!_planning) return
        const _aerodrome = get().aerodromes.find(a => a.id === _planning.aerodrome_id)
        const _codeOaci = _aerodrome?.code_oaci ?? _planning.aerodrome_id
        const _typeLabel = (_planning.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
        const _dateDebut = new Date(_planning.date_debut).toLocaleDateString('fr-FR')
        const _equipeIds = _planning.equipe_ids || []
        const _exploitants = get().utilisateurs.filter(u =>
          u.aerodrome_id === _planning.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
          storeEvents.emit('notification:envoyer', {
            user_id: uid,
            type: 'danger',
            title: `🗑 Planning supprimé — ${_codeOaci}`,
            message: `Le planning de surveillance ${_typeLabel} de ${_codeOaci} prévu le ${_dateDebut} a été supprimé.`,
            canal: 'in_app',
          }          )
        )

        // ── Nettoyer les références dans les processus liés ──
        // Mutations propriétaires via événements (tranches cert/homolog).
        if (_planning.type === 'certification') {
          storeEvents.emit('certification:nettoyer-lien-planning', { aerodrome_id: _planning.aerodrome_id, planning_id: id });
        } else if (_planning.type === 'homologation') {
          storeEvents.emit('homologation:nettoyer-lien-planning', { aerodrome_id: _planning.aerodrome_id, planning_id: id });
        }

        // Purger les délégations liées à la surveillance du planning supprimé
        if (_planning.surveillance_id) {
          set((s) => ({ delegations: s.delegations.filter(d => d.surveillance_id !== _planning.surveillance_id) }))
        }
      },

      genererPlanningN1: (aerodromeId, annee) => {
        const state = get()
        const profil = state.profilsRisque?.[aerodromeId]
        const historique = state.surveillances
          .filter(s => s.aerodrome_id === aerodromeId && ['transmise', 'archivee'].includes(s.statut))
          .map(s => ({ type: normalizePlanningType(s.type), date: s.date_debut, domaines: s.portee || [] }))
        const ecarts = (state.ecarts || []).filter(e => e.aerodrome_id === aerodromeId)
        const certs = (state.certifications || []).filter(c => c.aerodrome_id === aerodromeId)
        const homos = (state.homologations || []).filter(h => h.aerodrome_id === aerodromeId)
        const inspecteurs = (state.inspecteurs || []).filter(i => !i.deleted_at)
          .map(i => ({ id: i.id, prenom: i.prenom, nom: i.nom, competences: i.competences }))

        // Nouveau générateur centralisé (profil + carry-over + certif)
        const aerodrome = state.aerodromes.find(a => a.id === aerodromeId)
        const proposals = genererPlanning({
          aerodromeId, annee,
          profilRisque: profil,
          ecartsActifs: ecarts,
          certifications: certs,
          homologations: homos,
          inspecteurs,
          historiqueSurveillances: historique,
          statut_sgs: aerodrome?.statut_sgs,
          type_entite: aerodrome?.type_entite,
        })
        return proposals as unknown as Planning[]
      },

      validerPropositionN1: async (id) => {
        const prop = get().propositionsN1.find(p => p.id === id)
        if (!prop) return
        const { sort_order, source, ...cleanProp } = prop as any
        const planning = { ...cleanProp, id: crypto.randomUUID(), est_proposition: false, updated_at: new Date().toISOString() } as any
        await get().addPlanning(planning)
        set((s) => ({ propositionsN1: s.propositionsN1.filter(p => p.id !== id) }))
      },

      refuserPropositionN1: (id, motif) => {
        set((s) => ({ propositionsN1: s.propositionsN1.filter(p => p.id !== id) }))
      },

      consoliderPropositionsN1: async (ids) => {
        const state = get()
        for (const id of ids) {
          const prop = state.propositionsN1.find(p => p.id === id)
          if (!prop) continue
          const { sort_order, source, ...cleanProp } = prop as any
          const planning = { ...cleanProp, id: crypto.randomUUID(), est_proposition: false, updated_at: new Date().toISOString() }
          await get().addPlanning(planning)
        }
        set((s) => ({ propositionsN1: s.propositionsN1.filter(p => !ids.includes(p.id)) }))
      },

      marquerMissionTerminee: (planning_id, surveillance_id) => {
        // Recherche identique à l'ancien code inline : par planning_id de la
        // surveillance, repli sur surveillance_id du planning, puis id direct.
        const state = get()
        const survLiee = state.surveillances.find(s => s.id === surveillance_id)
        const planningLie = state.plannings.find(p =>
          (survLiee?.planning_id && p.id === survLiee.planning_id) ||
          (survLiee && p.surveillance_id === surveillance_id),
        ) ?? state.plannings.find(p => p.id === planning_id)
        if (planningLie && planningLie.statut !== 'realisee' && planningLie.statut !== 'annulee') {
          get().updatePlanning(planningLie.id, { statut: 'realisee' }).catch(() => {})
        }
      },

      restaurerMissionAnnulee: (planning_id) => {
        set((state) => ({
          plannings: state.plannings.map(p =>
            p.id === planning_id
              ? { ...p, surveillance_id: undefined, statut: 'planifiee' as const, updated_at: new Date().toISOString() }
              : p
          ),
        }))
      },

      marquerRappelsEnvoyes: (planning_id, rappels) => {
        set((state) => ({
          plannings: state.plannings.map(p =>
            p.id === planning_id
              ? { ...p, rappels_envoyes: { ...p.rappels_envoyes, ...rappels } }
              : p
          ),
        }))
      },

      verifierPlanningsDepasses: () => {
        const state = get()
        const maintenantMs = Date.now()
        // Source unique : lib/planning.ts — le Planning ne porte jamais les
        // statuts Surveillance ; la surveillance liée est prise en compte.
        state.plannings?.forEach(planning => {
          // Décision pure (lib/vigie) — la tranche applique.
          const decision = evaluerDepassementPlanning(planning, state.surveillances, maintenantMs)
          if (!decision.depasse) return

          const updated = { ...planning.rappels_envoyes, overdue: true }
          storeEvents.emit('planning:marquer-rappels', { planning_id: planning.id, rappels: updated })

          const aerodrome = state.aerodromes.find(a => a.id === planning.aerodrome_id)
          const codeOaci = aerodrome?.code_oaci || planning.aerodrome_id
          const typeLabel = (planning.type as string)?.replace(/_/g, ' ') || 'surveillance'
          const dateStr = new Date(planning.date_fin || planning.date_debut).toLocaleDateString('fr-FR')
          const message = `Le planning ${typeLabel} de ${codeOaci} a dépassé sa date de fin (${dateStr}, ${decision.joursRetard} j de retard) sans être clôturé. Réajustez les dates ou clôturez-le.`

          const equipeIds = planning.equipe_ids || []
          const cibles = [...equipeIds]
          if (planning.chef_id && !cibles.includes(planning.chef_id)) cibles.push(planning.chef_id)
          cibles.forEach(uid => {
            storeEvents.emit('notification:envoyer', {
              user_id: uid, type: 'danger',
              title: `⛔ Planning dépassé — ${codeOaci}`,
              message, canal: 'in_app', link: `/planning`,
            })
          })

          const exploitants = state.utilisateurs?.filter(u =>
            u.aerodrome_id === planning.aerodrome_id &&
            ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
          ) || []
          exploitants.forEach(op => {
            storeEvents.emit('notification:envoyer', {
              user_id: op.id, type: 'warning',
              title: `⛔ Surveillance dépassée — ${codeOaci}`,
              message: `La surveillance ${typeLabel} dont la date de fin était le ${dateStr} n'a pas eu lieu. Contactez l'équipe ANACIM pour connaître les nouvelles dates.`,
              canal: 'in_app', link: `/operatorDashboard`,
            })
          })
        })
      },
})
