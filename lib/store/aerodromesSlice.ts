// lib/store/aerodromesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Aérodromes extraite du store monolithique, comportement identique.
// Appels inter-slices via get() (store composé) :
// codesAcces, utilisateurs, addNotification, incrementerVersion.
// Recalcul risque via ÉVÉNEMENT 'risque:recalcul-demande' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { TypeEntiteAerodrome } from '../store'
import type { HelistationData } from '../types/helistation'
import * as datastore from '../datastore'
import { storeEvents } from './eventBus'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface PhaseCertification {
  phase: number
  intitule: string
  documents: { nom: string; url: string; date_upload: string }[]
}

export interface Aerodrome {
  id: string
  departement?: 'DNSA' | 'DNA'
  nom: string
  code_oaci: string
  type: 'international' | 'national'
  type_entite: TypeEntiteAerodrome
  categorie_sslia: string
  region: string
  exploitant_id?: string
  exploitant_nom?: string
  exploitant_adresse?: string
  exploitant_telephone?: string
  maturite_sgs: number
  maturite_sgs_detaille?: {
    composantes: Record<1 | 2 | 3 | 4 | 5, { score: number; niveauGlobal: string; elements: { elementId: string; niveau: string; justification?: string }[] }>;
    scoreGlobal: number;
    evalueLe: string;
    evaluePar: string;
  }
  statut_sgs?: 'complet' | 'simplifie' | 'non_applicable'
  statut: 'brouillon' | 'actif' | 'suspendu' | 'ferme'
  lat: number
  lon: number
  altitude: number
  piste_principale?: {
    longueur: number
    largeur: number
    orientation: string
    revetement: string
    pcr: number
    code_reference: string
    type_approche?: 'a_vue' | 'classique' | 'cat1' | 'cat2'
    avion_reference?: string
  }
  helistation?: HelistationData
  horaires?: 'jour' | 'h24'
  aides_visuelles?: string[]
  statut_certification?: 'certifie' | 'homologue' | 'non_certifie' | 'non_homologue'
  certifie_le?: string
  numero_certificat?: string
  homologue_le?: string
  numero_homologation?: string
  phases_certification?: PhaseCertification[]
  phases_homologation?: PhaseCertification[]
  checklist_template?: any[]
  sgs_checklist_template?: Record<string, any[]>
  sgs_checklist_template_version?: string
  contacts?: {
    nom: string
    poste: string
    email: string
    telephone: string
  }[]
  created_at: string
  updated_at: string
  deleted_at?: string
  deleted_by?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface AerodromeSlice {
  aerodromes: Aerodrome[]
  selectedAerodrome: Aerodrome | null
  currentAerodrome: Aerodrome | null
  setAerodromes: (aerodromes: Aerodrome[]) => void
  setSelectedAerodrome: (aerodrome: Aerodrome | null) => void
  setCurrentAerodrome: (aerodrome: Aerodrome | null) => void
  addAerodrome: (aerodrome: Aerodrome) => Promise<Aerodrome>
  updateAerodrome: (id: string, data: Partial<Aerodrome>) => Promise<void>
  deleteAerodrome: (id: string) => Promise<void>
  getActiveAerodromes: () => Aerodrome[]
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createAerodromesSlice)
// ─────────────────────────────────────────────────────────────

export const createAerodromesSlice: StateCreator<AppStore, [], [], AerodromeSlice> = (set, get) => ({
  aerodromes: [],
  selectedAerodrome: null,
  currentAerodrome: null,

  setAerodromes: (aerodromes) => set({ aerodromes }),

  setSelectedAerodrome: (aerodrome) => set({ selectedAerodrome: aerodrome }),

  setCurrentAerodrome: (aerodrome) => set({ currentAerodrome: aerodrome }),

  addAerodrome: async (aerodrome) => {
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const tempAerodrome = { ...aerodrome, id: tempId, created_at: now, updated_at: now } as Aerodrome
    set((state) => ({ aerodromes: [...state.aerodromes, tempAerodrome] }))
    try {
      const result = await datastore.createAerodrome(aerodrome as any)
      if (result.error) throw new Error(result.error)
      const saved = result.data as Aerodrome
      set((state) => ({ aerodromes: state.aerodromes.map(a => a.id === tempId ? saved : a) }))
      return saved
    } catch (error) {
      set((state) => ({ aerodromes: state.aerodromes.filter(a => a.id !== tempId) }))
      throw error
    }
  },

  updateAerodrome: async (id, data) => {
    const snapshot = get().aerodromes
    const snapshotCurrent = get().currentAerodrome
    set((state) => ({
      aerodromes: state.aerodromes.map((a) => a.id === id ? { ...a, ...data, updated_at: new Date().toISOString() } : a),
      currentAerodrome: state.currentAerodrome?.id === id
        ? { ...state.currentAerodrome, ...data }
        : state.currentAerodrome,
    }))
    try {
      const result = await datastore.updateAerodrome(id, data)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      set({ aerodromes: snapshot, currentAerodrome: snapshotCurrent })
      throw error
    }
    // Non-critical: ne PAS rollback la sauvegarde si ce calcul échoue (ex: 403 Supabase).
    // Via bus (le slice profils s'abonne) — plus d'appel direct inter-slice.
    storeEvents.emit('risque:recalcul-demande', { aerodrome_id: id })
  },

  deleteAerodrome: async (id: string) => {
    const state = get()
    const aerodrome = state.aerodromes.find(a => a.id === id)
    if (!aerodrome) return

    const userId = get().user?.id || ''
    const deletedBy = state.user ? `${state.user.prenom} ${state.user.nom}` : 'Administrateur'

    // Révoquer tous les codes acces actifs de l'aérodrome dans Supabase
    const codesActifs = state.codesAcces.filter(c => c.aerodrome_id === id && c.statut === 'actif')
    if (codesActifs.length > 0) {
      const results = await Promise.allSettled(codesActifs.map(c => datastore.revokeCodeAcces(c.id)))
      results.forEach((r, i) => { if (r.status === 'rejected') console.error('Erreur révocation code accès:', codesActifs[i].id, r.reason) })
    }

    // Supprimer dans Supabase (cascade sur toutes les tables liées)
    await datastore.deleteAerodrome(id)

    // Désaffecter les utilisateurs rattachés à cet aérodrome
    const exploitants = state.utilisateurs.filter(u => u.aerodrome_id === id)
    if (exploitants.length > 0) {
      await Promise.allSettled(exploitants.map(u =>
        datastore.updateUtilisateur(u.id, { aerodrome_id: null } as any)
      ))
      // Notifier chaque exploitant par email personnalisé
      exploitants.forEach(u => {
        const prenom = u.prenom || u.email || 'Cher exploitant'
        const emailTo = u.notification_email || u.email
        if (emailTo) {
          fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: emailTo,
              subject: `SGDA - Aérodrome ${aerodrome.code_oaci} supprimé`,
              message: `Bonjour ${prenom},\n\nL'aérodrome ${aerodrome.nom} (${aerodrome.code_oaci}) a été supprimé du système SGDA par ${deletedBy}.\n\nVotre compte utilisateur est conservé mais n'est plus rattaché à aucun aérodrome.\n\nCordialement,\nANACIM - SGDA`,
              link: `${typeof window !== 'undefined' ? window.location.origin : ''}/parametres`,
            })
          }).catch(() => {})
        }
      })
    }

    // Hard delete du store local avec cascade
    set((state) => ({
      aerodromes: state.aerodromes.filter(a => a.id !== id),
      utilisateurs: state.utilisateurs.map(u => u.aerodrome_id === id ? { ...u, aerodrome_id: undefined } : u),
      surveillances: state.surveillances.filter(s => s.aerodrome_id !== id),
      certifications: state.certifications.filter(c => c.aerodrome_id !== id),
      homologations: state.homologations.filter(h => h.aerodrome_id !== id),
      ecarts: state.ecarts.filter(e => e.aerodrome_id !== id),
      plannings: state.plannings.filter(p => p.aerodrome_id !== id),
      profilsRisque: Object.fromEntries(
        Object.entries(state.profilsRisque || {}).filter(([key]) => key !== id)
      ),
      codesAcces: state.codesAcces.filter(c => c.aerodrome_id !== id),
      iaSuggestions: state.iaSuggestions.filter(s => s.aerodrome_id !== id),
    }))

    // Notification email au DG et point focal + admins
    const { notifyAerodromeDeleted } = await import('../notifications')
    notifyAerodromeDeleted(aerodrome.nom, aerodrome.code_oaci, deletedBy)

    const cascadeMsg = exploitants.length > 0
      ? `, ${exploitants.length} exploitant(s) désaffecté(s)`
      : ''

    storeEvents.emit('notification:envoyer', {
      user_id: userId,
      type: 'warning',
      message: `L'aérodrome ${aerodrome.code_oaci} - ${aerodrome.nom} a été supprimé avec cascade (codes révoqués, surveillances, certifications, homologations, écarts, plannings${cascadeMsg})`,
      canal: 'in_app'
    })
    get().incrementerVersion()
  },

  getActiveAerodromes: () => {
    return get().aerodromes.filter(a => !a.deleted_at)
  },
})
