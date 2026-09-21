// lib/store/surveillancesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Surveillances extraite du store monolithique, comportement identique.
// Appels inter-slices via get()/set() (store composé) : plannings,
// certifications, homologations, delegations, aerodromes, utilisateurs,
// addNotification, updateCertification, updateHomologation,
// incrementerVersion.
// Sync planning via ÉVÉNEMENTS (storeEvents) : 'planning:mission-annulee'
// (plus de mutation directe de la tranche plannings).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { TypeSurveillanceContinue, TypeChecklist } from '../domaines'
import type { SignatureInfo } from '../store'
import type { DomaineChecklist } from './checklistSlice'
import * as datastore from '../datastore'
import { supabase } from '../supabase'
import { toast } from '../toast'
import { storeEvents } from './eventBus'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Surveillance {
  id: string
  aerodrome_id: string
  planning_id?: string
  type: TypeSurveillanceContinue | 'programmee' | 'inopinee' | 'speciale' | 'suivi_ecarts' | 'mise_oeuvre_pac' | 'certification' | 'homologation' | 'audit_complet' | 'urgence'
  portee: string[]
  equipe_ids: string[]
  chef_id: string
  date_debut: string
  date_fin: string
  statut:
    | 'planifiee' | 'en_cours' | 'checklist_signee'
    | 'ecarts_signes' | 'rapport_signe' | 'lettre_signee'
    | 'transmise' | 'archivee'
  score_global?: number
  observations?: string
  justification_declenchement?: string
  suggestions_maintien?: {
    domaines: string[]
    types_checklist: TypeChecklist[]
    raison: string
  }[]

  rapport_html?: string
  rapport_sections?: string  // JSON des sections du rapport (persistance locale)
  rapport_versions?: string  // JSON array: historique des snapshots [{version, sections, modifie_par, modifie_le, diff}]
  rapport_type?: 'redige' | 'charge'
  rapport_fichier_url?: string
  rapport_fichier_nom?: string
  rapport_signe_par?: string
  rapport_signe_le?: string
  rapport_sig_url?: string
  rapport_pdf_url?: string
  checklist_pdf_url?: string
  lettre_html?: string
  lettre_signee_url?: string

  signatures_checklist?: SignatureInfo[]
  signatures_ecarts?: SignatureInfo[]
  signatures_rapport?: SignatureInfo[]

  transmitted_at?: string
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
  progression?: number
  checklist_hierarchy?: DomaineChecklist[]
  checklist_suivi_ecarts?: { items: Array<Record<string, unknown>>; observations_generales?: string }  // onSaveSuivi (Suivi des écarts)
  checklist_pac?: { items: Array<Record<string, unknown>>; observations_generales?: string }           // onSavePAC (Mise en œuvre PAC)
  sgs_evaluation_prepa?: any  // EvaluationSGS — transférée depuis le planning lors du lancement
  sgs_evaluation_signee_le?: string  // date ISO de signature de l'évaluation SGS (PAOE)
  sgs_ecarts_signes_le?: string      // date ISO de signature des écarts SGS
  verification_report?: {
    dateVerification: string
    documents: Array<{ docId: string; docNom: string; aEvolue: boolean; versionDoc: string; versionGeneree: string | null }>
    gapsCount: number
    scoreCouverture: number
    synthese: string
  }
  deleted_at?: string
  deleted_by?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface SurveillanceSlice {
  surveillances: Surveillance[]
  currentSurveillance: Surveillance | null
  setSurveillances: (surveillances: Surveillance[]) => void
  setCurrentSurveillance: (surveillance: Surveillance | null) => void
  addSurveillance: (surveillance: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'>) => Promise<Surveillance>
  updateSurveillance: (id: string, data: Partial<Surveillance>) => Promise<void>
  deleteSurveillance: (id: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createSurveillancesSlice)
// ─────────────────────────────────────────────────────────────

export const createSurveillancesSlice: StateCreator<AppStore, [], [], SurveillanceSlice> = (set, get) => ({
  surveillances: [],
  currentSurveillance: null,

  setSurveillances: (surveillances) => set({ surveillances }),

  setCurrentSurveillance: (surveillance) => set({ currentSurveillance: surveillance }),

  addSurveillance: async (surveillanceData) => {
    const now = new Date().toISOString()

    // Vérifier que le planning_id référence bien un planning existant (FK Supabase).
    // On interroge toujours Supabase en priorité (source de vérité), et on ne se
    // rabat sur le store local qu'en cas d'échec réseau de la requête elle-même.
    if (surveillanceData.planning_id) {
      let planningExiste = false
      try {
        const { data: planning, error } = await supabase
          .from('plannings')
          .select('id')
          .eq('id', surveillanceData.planning_id)
          .maybeSingle()
        if (error) throw error
        planningExiste = !!planning
      } catch {
        planningExiste = !!get().plannings?.some(p => p.id === surveillanceData.planning_id)
      }
      if (!planningExiste) {
        delete surveillanceData.planning_id
      }
    }

    // Chef par défaut si vide
    const defautChefId = surveillanceData.chef_id && surveillanceData.chef_id !== '00000000-0000-0000-0000-000000000000'
      ? surveillanceData.chef_id
      : (() => {
          const inspecteurs = get().inspecteurs || []
          const defaut = inspecteurs.find(i => i.type === 'inspecteur_principal' && i.statut === 'en_service' && !i.deleted_at)
            || inspecteurs.find(i => i.type === 'inspecteur_titulaire' && i.statut === 'en_service' && !i.deleted_at)
            || inspecteurs.find(i => !i.deleted_at)
          if (defaut?.user_id) return defaut.user_id
          const utilisateurs = get().utilisateurs || []
          const userDefaut = get().user
            || utilisateurs.find(u => u.role === 'admin' && u.statut === 'actif')
            || utilisateurs.find(u => u.statut === 'actif')
          // Ne JAMAIS inventer un UUID aléatoire ici : un chef_id qui ne référence
          // aucun utilisateur/inspecteur réel provoque la même violation de
          // contrainte FK que pour planning_id, mais sans message clair pour l'aider
          // à diagnostiquer. On préfère échouer tôt avec un message explicite.
          return userDefaut?.id || null
        })()
    if (!defautChefId) {
      const message = 'Impossible de déterminer un chef de mission valide : aucun inspecteur ou utilisateur actif disponible.'
      toast('error', 'Erreur création surveillance', message)
      throw new Error(message)
    }
    const newSurveillance: Surveillance = {
      id: crypto.randomUUID(),
      ...surveillanceData,
      chef_id: defautChefId,
      statut: surveillanceData.statut || 'planifiee',
      progression: 0,
      signatures_checklist: [],
      signatures_ecarts: [],
      signatures_rapport: [],
      created_at: now,
      updated_at: now,
      created_by: get().user?.id || defautChefId,
      updated_by: get().user?.id || defautChefId,
    }
    const payload = { ...surveillanceData, chef_id: defautChefId, created_by: newSurveillance.created_by, updated_by: newSurveillance.updated_by }
    let result = await datastore.createSurveillance(payload)
    const isPlanningFkError = (err: unknown) =>
      typeof err === 'string' && err.toLowerCase().includes('surveillances_planning_id_fkey')
    if (result.error && isPlanningFkError(result.error) && 'planning_id' in payload) {
      delete payload.planning_id
      result = await datastore.createSurveillance(payload)
    }
    if (result.error) {
      console.error('Erreur création surveillance Supabase:', result.error)
      toast('error', 'Erreur création surveillance', result.error)
      throw new Error(result.error)
    }
    const savedSurveillance = result.data as Surveillance
    set((state) => ({ surveillances: [...state.surveillances, savedSurveillance] }))
    toast('success', 'Surveillance créée', savedSurveillance.type.replace(/_/g, ' '))
    storeEvents.emit('notification:envoyer', {
      user_id: get().user?.id || '',
      type: 'info',
      message: `Nouvelle surveillance créée`,
      link: `/surveillance/${savedSurveillance.id}`,
      canal: 'in_app'
    })
    get().incrementerVersion()
    return savedSurveillance
  },

  updateSurveillance: async (id, data) => {
    const oldSurveillance = get().surveillances.find(s => s.id === id)
    if (!oldSurveillance) return
    const snapshot = {
      surveillances: get().surveillances,
      currentSurveillance: get().currentSurveillance,
    }
    set((state) => ({
      surveillances: state.surveillances.map((s) => s.id === id ? { ...s, ...data, updated_at: new Date().toISOString() } : s),
      currentSurveillance: state.currentSurveillance?.id === id ? { ...state.currentSurveillance, ...data } : state.currentSurveillance,
    }))
    // Persistance complète : l'évaluation SGS signée, le suivi des écarts,
    // la checklist PAC et le rapport font partie du dossier légal et
    // survivent au rechargement (colonnes ajoutées en base — Section 13.A
    // de SGDA_v5_FINAL_COMPLET.sql).
    const result = await datastore.updateSurveillance(id, data)
    if (result.error) {
      console.error('Erreur update surveillance Supabase, rollback:', result.error)
      toast('error', 'Échec de la mise à jour', 'Les modifications n\'ont pas pu être sauvegardées')
      set({ surveillances: snapshot.surveillances, currentSurveillance: snapshot.currentSurveillance })
      return
    }

    if (!oldSurveillance || !data.statut || data.statut === oldSurveillance.statut) return
    const _aerodrome = get().aerodromes.find(a => a.id === oldSurveillance.aerodrome_id)
    const _codeOaci = _aerodrome?.code_oaci ?? oldSurveillance.aerodrome_id
    const _typeLabel = (oldSurveillance.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
    const _equipeIds = oldSurveillance.equipe_ids || []
    const _exploitants = get().utilisateurs.filter(u =>
      u.aerodrome_id === oldSurveillance.aerodrome_id &&
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
    )
    const _link = `/surveillance/${id}`
    const _newStatut = data.statut as string
    switch (_newStatut) {
      case 'transmise':
        _exploitants.forEach(u =>
          storeEvents.emit('notification:envoyer', { user_id: u.id, type: 'success', title: `📨 Rapport transmis — ${_codeOaci}`, message: `Le rapport de surveillance ${_typeLabel} de ${_codeOaci} vous a été transmis.`, canal: 'in_app', link: _link })
        )
        _equipeIds.forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'success', title: `📨 Rapport transmis — ${_codeOaci}`, message: `Le rapport de surveillance ${_typeLabel} de ${_codeOaci} a été transmis à l'exploitant.`, canal: 'in_app', link: _link })
        )
        break
      case 'annulee':
        ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'danger', title: `❌ Surveillance annulée — ${_codeOaci}`, message: `La surveillance ${_typeLabel} de ${_codeOaci} a été annulée.`, canal: 'in_app' })
        )
        break
      case 'checklist_signee':
        ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'success', title: `✅ Checklist signée — ${_codeOaci}`, message: `La checklist de la surveillance ${_typeLabel} de ${_codeOaci} a été signée. Les résultats sont disponibles.`, canal: 'in_app', link: _link })
        )
        break
      case 'ecarts_signes':
        _equipeIds.forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'info', title: `📋 Écarts signés — ${_codeOaci}`, message: `Les écarts de la surveillance ${_typeLabel} de ${_codeOaci} ont été signés.`, canal: 'in_app', link: _link })
        )
        break
      case 'rapport_signe':
        _equipeIds.forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'success', title: `✍️ Rapport signé — ${_codeOaci}`, message: `Le rapport de la surveillance ${_typeLabel} de ${_codeOaci} a été signé.`, canal: 'in_app', link: _link })
        )
        break
      case 'lettre_signee':
        ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'info', title: `✉️ Lettre signée — ${_codeOaci}`, message: `La lettre de transmission de la surveillance ${_typeLabel} de ${_codeOaci} a été signée.`, canal: 'in_app', link: _link })
        )
        break
      case 'archivee':
        _equipeIds.forEach(uid =>
          storeEvents.emit('notification:envoyer', { user_id: uid, type: 'info', title: `🗄 Surveillance archivée — ${_codeOaci}`, message: `La surveillance ${_typeLabel} de ${_codeOaci} a été archivée.`, canal: 'in_app' })
        )
        break
    }
    get().incrementerVersion()
  },

  deleteSurveillance: async (id: string) => {
    const state = get()
    const surveillance = state.surveillances.find(s => s.id === id)
    if (!surveillance) return

    const planningsSnapshot = state.plannings
    const surveillancesSnapshot = state.surveillances

    // Restaurer le planning associé via événement (le slice plannings
    // s'abonne) — plus de mutation directe d'une autre tranche.
    if (surveillance.planning_id) {
      storeEvents.emit('planning:mission-annulee', { planning_id: surveillance.planning_id })
    }

    set((state) => ({ surveillances: state.surveillances.filter(s => s.id !== id) }))

    const result = await datastore.deleteSurveillance(id)
    if (result.error) {
      console.error('Erreur delete surveillance Supabase, rollback:', result.error)
      toast('error', 'Échec de la suppression', 'La surveillance n\'a pas pu être supprimée')
      set({ surveillances: surveillancesSnapshot, plannings: planningsSnapshot })
      return
    }

    // Purger les délégations orphelines liées à la surveillance supprimée
    set((s) => ({ delegations: s.delegations.filter(d => d.surveillance_id !== id) }))
    const equipeIds = surveillance.equipe_ids || []
    equipeIds.forEach(userId => {
      storeEvents.emit('notification:envoyer', {
        user_id: userId,
        type: 'info',
        message: `La surveillance du ${new Date(surveillance.date_debut).toLocaleDateString('fr-FR')} a été supprimée`,
        canal: 'in_app'
      })
    })

    // ── Nettoyer les références dans les processus liés (via événements,
    // les tranches propriétaires font le ménage elles-mêmes) ──
    if (surveillance.planning_id) {
      const planning = state.plannings.find(p => p.id === surveillance.planning_id);
      if (planning?.type === 'certification') {
        storeEvents.emit('certification:nettoyer-lien-surveillance', {
          aerodrome_id: planning.aerodrome_id, surveillance_id: id,
        });
      } else if (planning?.type === 'homologation') {
        storeEvents.emit('homologation:nettoyer-lien-surveillance', {
          aerodrome_id: planning.aerodrome_id, surveillance_id: id,
        });
      }
    }

    // ── Rappels planning (surveillances programmées) ──
    const maintenant2 = new Date()
    const rappelsSurveillance = [
      { jours: 30, cle: 'j30' as const, label: 'J-30' },
      { jours: 15, cle: 'j15' as const, label: 'J-15' },
      { jours: 7, cle: 'j7' as const, label: 'J-7' },
    ]
    state.plannings?.filter(p => p.statut === 'planifiee' && !p.deleted_at).forEach(planning => {
      const dateDebut = new Date(planning.date_debut)
      const joursAvant = Math.ceil((dateDebut.getTime() - maintenant2.getTime()) / (1000 * 60 * 60 * 24))
      if (joursAvant < 0) return

      rappelsSurveillance.forEach(({ jours, cle, label }) => {
        if (joursAvant === jours) {
          const dejaEnvoye = planning.rappels_envoyes?.[cle]
          if (!dejaEnvoye) {
            // Marquer le flag via événement (tranche plannings propriétaire).
            storeEvents.emit('planning:marquer-rappels', {
              planning_id: planning.id,
              rappels: { ...planning.rappels_envoyes, [cle]: true },
            })

            const aerodrome = state.aerodromes.find(a => a.id === planning.aerodrome_id)
            const codeOaci = aerodrome?.code_oaci || planning.aerodrome_id
            const dateStr = new Date(planning.date_debut).toLocaleDateString('fr-FR')
            const typeLabel = (planning.type as string)?.replace(/_/g, ' ') || 'surveillance'
            const domaines = (planning.portee || []).slice(0, 3).join(', ')

            // Notifier les inspecteurs de l'équipe
            const equipeIds = planning.equipe_ids || []
            equipeIds.forEach(uid => {
              storeEvents.emit('notification:envoyer', {
                user_id: uid,
                type: jours <= 7 ? 'danger' : jours <= 15 ? 'warning' : 'info',
                title: `⏰ Surveillance ${label} — ${codeOaci}`,
                message: `La surveillance ${typeLabel} de ${codeOaci} est prévue le ${dateStr} (dans ${jours} jours). Domaines : ${domaines || 'tous'}. Confirmez ou réajustez les dates si nécessaire.`,
                canal: 'in_app',
                link: `/planning`,
              })
            })

            // Notifier le chef
            if (planning.chef_id && !equipeIds.includes(planning.chef_id)) {
              storeEvents.emit('notification:envoyer', {
                user_id: planning.chef_id,
                type: jours <= 7 ? 'danger' : jours <= 15 ? 'warning' : 'info',
                title: `⏰ Surveillance ${label} — ${codeOaci}`,
                message: `En tant que chef d'équipe, confirmez la surveillance ${typeLabel} du ${dateStr} (J-${jours}).`,
                canal: 'in_app',
                link: `/planning`,
              })
            }

            // J-7 : notifier aussi les exploitants
            if (jours <= 7) {
              const exploitants = state.utilisateurs?.filter(u =>
                u.aerodrome_id === planning.aerodrome_id &&
                ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
              ) || []
              exploitants.forEach(op => {
                storeEvents.emit('notification:envoyer', {
                  user_id: op.id,
                  type: 'warning',
                  title: `📋 Surveillance imminente — ${codeOaci}`,
                  message: `La surveillance ${typeLabel} aura lieu le ${dateStr}. Domaines : ${domaines || 'tous'}. Préparez vos documents et registres.`,
                  canal: 'in_app',
                  link: `/operatorDashboard`,
                })
              })
            }
          }
        }
      })
    })
  },
})
