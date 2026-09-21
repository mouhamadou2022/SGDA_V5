// lib/store/evenementsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Événements de sécurité extraite du store monolithique, comportement identique.
// Appels inter-slices via get() (store composé) :
// addNotification, addEcart (via creerEcartLie), utilisateurs, aerodromes, ecarts.
// Recalcul risque via ÉVÉNEMENT 'risque:recalcul-demande' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore, Ecart } from '../store'
import * as datastore from '../datastore'
import { storeEvents } from './eventBus'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface EvenementSecurite {
  id: string
  aerodrome_id: string
  reference: string
  type: string
  gravite: 'critique' | 'eleve' | 'moyen' | 'faible'
  date: string
  heure: string
  localisation: string
  description: string
  declarant_nom?: string
  aeronef?: {
    immatriculation: string
    type: string
    exploitant: string
  }
  blesses?: {
    mortels: number
    graves: number
    legers: number
    indemnes: number
  }
  dommages_desc?: string
  dommages_estimation?: number
  actions_immediates: string
  services_alertes: string[]
  statut: 'recu' | 'assigne' | 'accepte' | 'refuse' | 'attente_operateur' | 'en_cours' | 'analyse' | 'ecart_cree' | 'rapport_redige' | 'soumis_validation' | 'retourne' | 'cloture'
  inspecteur_id?: string
  date_assignation?: string
  date_acceptation?: string
  motif_refus?: string
  date_cloture?: string
  ecart_ids?: string[]
  rapport_final_url?: string
  // Workflow événement
  classification?: 'accident' | 'incident' | 'incident_grave'
  analyse_preliminaire?: string
  recommandations?: string
  demande_complement?: string
  reponse_operateur?: string
  date_reponse_operateur?: string
  causes?: string[]
  facteurs_contributifs?: { humain: boolean; technique: boolean; environnemental: boolean; organisationnel: boolean }
  rapport_investigation?: string
  rapport_final_contenu?: string
  validation_admin?: 'en_attente' | 'valide' | 'retourne'
  validation_admin_commentaire?: string
  impact_securite?: 'moyen' | 'faible'
  created_at: string
  updated_at: string
  created_by: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface EvenementSlice {
  evenements: EvenementSecurite[]
  currentEvenement: EvenementSecurite | null
  setEvenements: (evenements: EvenementSecurite[]) => void
  setCurrentEvenement: (evenement: EvenementSecurite | null) => void
  addEvenement: (evenement: Omit<EvenementSecurite, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateEvenement: (id: string, data: Partial<EvenementSecurite>) => Promise<void>
  deleteEvenement: (id: string) => void
  assignerInspecteur: (evenementId: string, inspecteurId: string) => void
  accepterAssignation: (evenementId: string) => void
  refuserAssignation: (evenementId: string, motif: string) => void
  soumettreValidation: (evenementId: string) => void
  validerCloture: (evenementId: string) => void
  retournerInspecteur: (evenementId: string, commentaire: string) => void
  demanderComplement: (evenementId: string, question: string) => void
  repondreComplement: (evenementId: string, reponse: string) => void
  relancerOperateur: (evenementId: string) => void
  creerEcartLie: (evenementId: string, ecartData: Partial<Ecart>) => void
  getEvenementsByAerodrome: (aerodromeId: string) => EvenementSecurite[]
  getEvenementsUrgents: () => EvenementSecurite[]
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createEvenementsSlice)
// ─────────────────────────────────────────────────────────────

export const createEvenementsSlice: StateCreator<AppStore, [], [], EvenementSlice> = (set, get) => ({
  evenements: [],
  currentEvenement: null,

  setEvenements: (evenements) => set({ evenements }),

  setCurrentEvenement: (evenement) => set({ currentEvenement: evenement }),

  addEvenement: async (evenement) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newEvent = { ...evenement, id, created_at: now, updated_at: now } as EvenementSecurite
    set((state) => ({ evenements: [...state.evenements, newEvent] }))
    try {
      const { createEvenementAPI } = await import('@/lib/api/evenements')
      const result = await createEvenementAPI(newEvent)
      if (result.error) throw new Error(result.error)
      if (result.data?.id) {
        set((state) => ({ evenements: state.evenements.map(e => e.id === id ? { ...e, id: result.data!.id } : e) }))
      }
    } catch (error) {
      console.error('Erreur création événement Supabase, rollback:', error)
      set((state) => ({ evenements: state.evenements.filter(e => e.id !== id) }))
      return
    }
    storeEvents.emit('risque:recalcul-demande', { aerodrome_id: newEvent.aerodrome_id })
    import('@/lib/risque/bayesian').then(({ updatePriorAfterIncident }) => {
      const graviteMap: Record<string, 'mineur' | 'majeur' | 'critique' | 'catastrophique'> = {
        critique: 'critique', eleve: 'majeur', moyen: 'mineur', faible: 'mineur',
      }
      const bayesianGravite = graviteMap[newEvent.gravite] ?? 'mineur'
      updatePriorAfterIncident(0.3, bayesianGravite)
    }).catch(() => {})
  },

  updateEvenement: async (id, data) => {
    const eventAvant = get().evenements.find(e => e.id === id)
    const snapshot = get().evenements
    set((state) => ({
      evenements: state.evenements.map(e => e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e)
    }))
    try {
      const { updateEvenementAPI } = await import('@/lib/api/evenements')
      const result = await updateEvenementAPI(id, data)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('Erreur update événement Supabase, rollback:', error)
      set({ evenements: snapshot })
      return
    }
    if (eventAvant) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: eventAvant.aerodrome_id })
    }
  },

  deleteEvenement: async (id) => {
    const eventAvant = get().evenements.find(e => e.id === id)
    const snapshot = get().evenements
    set((state) => ({
      evenements: state.evenements.filter(e => e.id !== id),
      currentEvenement: state.currentEvenement?.id === id ? null : state.currentEvenement,
    }))
    try {
      const result = await datastore.deleteEvenement(id)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('Erreur delete événement Supabase, rollback:', error)
      set({ evenements: snapshot })
      return
    }
    if (eventAvant) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: eventAvant.aerodrome_id })
    }
  },

  assignerInspecteur: async (evenementId, inspecteurId) => {
    const snapshot = get().evenements
    const now = new Date().toISOString()
    const inspecteurNom = get().utilisateurs.find(u => u.id === inspecteurId)
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, inspecteur_id: inspecteurId, statut: 'assigne' as const, date_assignation: now } : e)
    }))
    try {
      const result = await datastore.updateEvenement(evenementId, { inspecteur_id: inspecteurId, statut: 'assigne', date_assignation: now })
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('Erreur assignation inspecteur Supabase, rollback:', error)
      set({ evenements: snapshot })
    }
    // Notifier l'inspecteur assigné
    storeEvents.emit('notification:envoyer', {
      user_id: inspecteurId,
      type: 'info',
      title: 'Nouvel événement assigné',
      message: `Un événement vous a été assigné. Connectez-vous pour l'analyser.`,
      canal: 'in_app',
      link: '/?module=evenements',
    })
  },

  creerEcartLie: async (evenementId, ecartData) => {
    const now = new Date().toISOString()
    const ecartId = crypto.randomUUID()
    const newEcart: Ecart = {
      id: ecartId,
      aerodrome_id: ecartData.aerodrome_id || '',
      surveillance_id: ecartData.surveillance_id || '',
      domaine: ecartData.domaine || 'SGS',
       reference: ecartData.reference || `${new Date().getFullYear()}-EVT-${String(get().ecarts.length + 1).padStart(2, '0')}`,
      ref_reglementaire: ecartData.ref_reglementaire || '',
      libelle: ecartData.libelle || '',
      niveau_risque: ecartData.niveau_risque || 'moyen',
      statut: 'ouvert',
      delai_pac: ecartData.delai_pac || new Date(Date.now() + 15 * 86400000).toISOString(),
      delai_regularisation: ecartData.delai_regularisation || new Date(Date.now() + 90 * 86400000).toISOString(),
      inspecteur_ref_id: ecartData.inspecteur_ref_id || '',
      created_at: now,
      updated_at: now,
      evenement_id: evenementId,
    }
    // Persister dans Supabase comme addEcart (surveillance)
    const result = await datastore.createEcart(newEcart)
    if (result.error) {
      console.error('[creerEcartLie] Erreur création écart Supabase:', result.error)
      set((state) => ({ ecarts: [...state.ecarts, newEcart] })) // fallback local
    }
    const savedEcart = (result.data || newEcart) as Ecart
    // Intégration via événement (tranche écarts propriétaire, idempotente).
    storeEvents.emit('ecart:integrer-externe', savedEcart)
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId
        ? { ...e, statut: 'ecart_cree' as const, ecart_ids: [...(e.ecart_ids || []), savedEcart.id] }
        : e
      )
    }))

    // Notifier le focal_operator de l'aérodrome
    const aerodrome = get().aerodromes.find(a => a.id === savedEcart.aerodrome_id)
    const evenement = get().evenements.find(e => e.id === evenementId)
    const focalOperators = get().utilisateurs.filter(u =>
      (u.role === 'focal_operator' || u.role === 'dg_operator') &&
      u.aerodrome_id === savedEcart.aerodrome_id
    )

    focalOperators.forEach(operator => {
      storeEvents.emit('notification:envoyer', {
        user_id: operator.id,
        type: 'warning',
        title: 'Écart créé suite à un événement',
        message: `Écart ${savedEcart.reference} lié à l'événement ${evenement?.reference || ''}${aerodrome ? ` - ${aerodrome.code_oaci}` : ''}. Un PAC sera requis après évaluation.`,
        link: `/portail-exploitant/ecarts`,
        canal: 'in_app'
      })

      if (operator.notifications_email && (operator.notification_email || operator.email)) {
        fetch('/api/notifications/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: operator.notification_email || operator.email,
            subject: `SGDA - Écart ${savedEcart.reference} - Événement ${evenement?.reference || ''}`,
            template: 'ecart-evenement',
            data: {
              reference: savedEcart.reference,
              evenement: evenement?.reference || '',
              aerodrome: aerodrome?.nom || '',
              libelle: newEcart.libelle,
              niveau: newEcart.niveau_risque,
              lien: `/portail-exploitant/ecarts`
            }
          })
        })
        .catch(error => console.error('[Notification] Erreur:', error))
      }
    })
  },

  getEvenementsByAerodrome: (aerodromeId) => get().evenements.filter(e => e.aerodrome_id === aerodromeId),

  getEvenementsUrgents: () => get().evenements.filter(e => e.gravite === 'critique' || e.gravite === 'eleve'),

  accepterAssignation: async (evenementId) => {
    const now = new Date().toISOString()
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, statut: 'accepte' as const, date_acceptation: now } : e)
    }))
    await datastore.updateEvenement(evenementId, { statut: 'accepte', date_acceptation: now }).catch(() => {})
    const evt = get().evenements.find(e => e.id === evenementId)
    if (!evt?.inspecteur_id) return
    // Notifier admin de l'acceptation
    const admins = get().utilisateurs.filter(u => u.role === 'admin')
    admins.forEach(admin => {
      storeEvents.emit('notification:envoyer', {
        user_id: admin.id,
        type: 'success',
        title: 'Assignation acceptée',
        message: `L'inspecteur a accepté l'événement ${evt.reference}`,
        canal: 'in_app',
      })
    })
  },

  refuserAssignation: async (evenementId, motif) => {
    const now = new Date().toISOString()
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, inspecteur_id: undefined, statut: 'refuse' as const, motif_refus: motif, date_assignation: undefined } : e)
    }))
    await datastore.updateEvenement(evenementId, { inspecteur_id: '', statut: 'recu', motif_refus: motif }).catch(() => {})
    const evt = get().evenements.find(e => e.id === evenementId)
    // Notifier l'admin
    const admins = get().utilisateurs.filter(u => u.role === 'admin')
    admins.forEach(admin => {
      storeEvents.emit('notification:envoyer', {
        user_id: admin.id,
        type: 'warning',
        title: 'Assignation refusée',
        message: `Assignation refusée pour ${evt?.reference || ''} : ${motif}`,
        canal: 'in_app',
      })
    })
  },

  soumettreValidation: async (evenementId) => {
    const now = new Date().toISOString()
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, statut: 'soumis_validation' as const, validation_admin: 'en_attente' } : e)
    }))
    await datastore.updateEvenement(evenementId, { statut: 'soumis_validation', validation_admin: 'en_attente' }).catch(() => {})
    const evt = get().evenements.find(e => e.id === evenementId)
    // Notifier tous les admins
    const admins = get().utilisateurs.filter(u => u.role === 'admin')
    admins.forEach(admin => {
      storeEvents.emit('notification:envoyer', {
        user_id: admin.id,
        type: 'info',
        title: 'Validation requise',
        message: `L'événement ${evt?.reference || ''} est soumis pour validation par l'inspecteur.`,
        canal: 'in_app',
        link: '/?module=evenements',
      })
    })
  },

  validerCloture: async (evenementId) => {
    const now = new Date().toISOString()
    const evt = get().evenements.find(e => e.id === evenementId)
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, statut: 'cloture' as const, date_cloture: now, validation_admin: 'valide' } : e)
    }))
    await datastore.updateEvenement(evenementId, { statut: 'cloture', date_cloture: now, validation_admin: 'valide' }).catch(() => {})
    // Notifier l'inspecteur
    if (evt?.inspecteur_id) {
      storeEvents.emit('notification:envoyer', {
        user_id: evt.inspecteur_id,
        type: 'success',
        title: 'Événement validé et clôturé',
        message: `L'admin a validé et clôturé l'événement ${evt.reference}.`,
        canal: 'in_app',
      })
    }
    // Notifier les exploitants
    const operateurs = get().utilisateurs.filter(u =>
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role) &&
      u.aerodrome_id === evt?.aerodrome_id
    )
    const aerodrome = get().aerodromes.find(a => a.id === evt?.aerodrome_id)
    operateurs.forEach(op => {
      storeEvents.emit('notification:envoyer', {
        user_id: op.id,
        type: 'info',
        title: `Événement clôturé — ${evt?.reference || ''}`,
        message: `L'événement ${evt?.type || ''} à ${aerodrome?.code_oaci || evt?.aerodrome_id} a été traité et clôturé.`,
        canal: 'in_app',
        link: '/?module=operator-evenements',
      })
    })
  },

  retournerInspecteur: async (evenementId, commentaire) => {
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, statut: 'retourne' as const, validation_admin: 'retourne', validation_admin_commentaire: commentaire } : e)
    }))
    await datastore.updateEvenement(evenementId, { statut: 'retourne', validation_admin: 'retourne', validation_admin_commentaire: commentaire }).catch(() => {})
    const evt = get().evenements.find(e => e.id === evenementId)
    if (evt?.inspecteur_id) {
      storeEvents.emit('notification:envoyer', {
        user_id: evt.inspecteur_id,
        type: 'warning',
        title: 'Modifications demandées',
        message: `${commentaire}`,
        canal: 'in_app',
        link: '/?module=evenements',
      })
    }
  },

  demanderComplement: async (evenementId, question) => {
    const now = new Date().toISOString()
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, statut: 'attente_operateur' as const, demande_complement: question, date_reponse_operateur: undefined } : e)
    }))
    await datastore.updateEvenement(evenementId, { statut: 'attente_operateur', demande_complement: question }).catch(() => {})
    const evt = get().evenements.find(e => e.id === evenementId)
    // Notifier les exploitants de l'aérodrome
    const operateurs = get().utilisateurs.filter(u =>
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role) &&
      u.aerodrome_id === evt?.aerodrome_id
    )
    operateurs.forEach(op => {
      storeEvents.emit('notification:envoyer', {
        user_id: op.id,
        type: 'info',
        title: `Information complémentaire requise — ${evt?.reference || ''}`,
        message: question,
        canal: 'in_app',
        link: '/?module=operator-evenements',
      })
    })
  },

  repondreComplement: async (evenementId, reponse) => {
    const now = new Date().toISOString()
    set((state) => ({
      evenements: state.evenements.map(e => e.id === evenementId ? { ...e, statut: 'accepte' as const, reponse_operateur: reponse, date_reponse_operateur: now } : e)
    }))
    await datastore.updateEvenement(evenementId, { statut: 'accepte', reponse_operateur: reponse, date_reponse_operateur: now }).catch(() => {})
    const evt = get().evenements.find(e => e.id === evenementId)
    if (evt?.inspecteur_id) {
      storeEvents.emit('notification:envoyer', {
        user_id: evt.inspecteur_id,
        type: 'success',
        title: 'Réponse exploitant reçue',
        message: `L'exploitant a répondu à votre demande concernant ${evt.reference}.`,
        canal: 'in_app',
        link: '/?module=evenements',
      })
    }
  },

  relancerOperateur: async (evenementId) => {
    const evt = get().evenements.find(e => e.id === evenementId)
    if (!evt) return
    const operateurs = get().utilisateurs.filter(u =>
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role) &&
      u.aerodrome_id === evt.aerodrome_id
    )
    operateurs.forEach(op => {
      storeEvents.emit('notification:envoyer', {
        user_id: op.id,
        type: 'warning',
        title: `Rappel — ${evt.reference || ''}`,
        message: evt.demande_complement
          ? `Relance de l'inspecteur : ${evt.demande_complement}`
          : `Réponse attendue de votre part concernant l'événement ${evt.reference}.`,
        canal: 'in_app',
        link: '/?module=operator-evenements',
      })
    })
  },
})
