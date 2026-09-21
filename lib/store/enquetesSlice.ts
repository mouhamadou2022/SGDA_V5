// lib/store/enquetesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Enquêtes extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface QuestionEnquete {
  id: string
  type: string
  texte: string
  options?: string[]
  obligatoire: boolean
  ordre: number
  impact_c1: boolean
}

export interface Enquete {
  id: string
  reference: string
  titre: string
  description: string
  type_enquete: string
  aerodrome_ids: string[]
  questions: QuestionEnquete[]
  deadline: string
  statut: 'brouillon' | 'active' | 'terminee' | 'archivee'
  created_by: string
  created_at: string
  updated_at: string
}

export interface ReponseEnquete {
  id: string
  enquete_id: string
  aerodrome_id: string
  repondant_id: string
  repondant_nom: string
  repondant_role: string
  reponses: Record<string, unknown>
  score_c1?: number
  submitted_at: string
}

export interface StatistiquesEnquete {
  total_reponses: number
  taux_reponse: number
  score_moyen?: number
  reponses_par_question: Record<string, {
    moyenne?: number
    repartition?: Record<string, number>
  }>
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface EnqueteSlice {
  enquetes: Enquete[]
  reponsesEnquetes: ReponseEnquete[]
  currentEnquete: Enquete | null
  setEnquetes: (enquetes: Enquete[]) => void
  setReponses: (reponses: ReponseEnquete[]) => void
  addEnquete: (enquete: Omit<Enquete, 'id' | 'created_at' | 'updated_at'>) => void
  updateEnquete: (id: string, data: Partial<Enquete>) => void
  deleteEnquete: (id: string) => void
  soumettreReponse: (reponse: Omit<ReponseEnquete, 'id' | 'submitted_at'>) => void
  getStatistiquesEnquete: (enqueteId: string) => StatistiquesEnquete
  calculerImpactC1: (reponses: ReponseEnquete[]) => number
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createEnquetesSlice)
// ─────────────────────────────────────────────────────────────

export const createEnquetesSlice: StateCreator<AppStore, [], [], EnqueteSlice> = (set, get) => ({
  enquetes: [],
  reponsesEnquetes: [],
  currentEnquete: null,

  setEnquetes: (enquetes) => set({ enquetes }),

  setReponses: (reponses) => set({ reponsesEnquetes: reponses }),

  addEnquete: (enquete) => {
    const nouvelle = { ...enquete, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Enquete
    set((state) => ({
      enquetes: [...state.enquetes, nouvelle]
    }))
    // Sync serveur best-effort (Phase 3) : le local reste la source de
    // vérité immédiate — un échec réseau ne bloque jamais l'UI.
    import('../datastore').then(({ createEnquete }) => {
      createEnquete(nouvelle).then(r => {
        if (r.error) console.error('[enquetes] Sync création échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  updateEnquete: (id, data) => {
    set((state) => ({
      enquetes: state.enquetes.map(e => e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e)
    }))
    import('../datastore').then(({ updateEnquete }) => {
      updateEnquete(id, data).then(r => {
        if (r.error) console.error('[enquetes] Sync mise à jour échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  deleteEnquete: (id) => {
    set((state) => ({
      enquetes: state.enquetes.filter(e => e.id !== id),
      currentEnquete: state.currentEnquete?.id === id ? null : state.currentEnquete,
    }))
    import('../datastore').then(({ deleteEnquete }) => {
      deleteEnquete(id).then(r => {
        if (r.error) console.error('[enquetes] Sync suppression échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  soumettreReponse: (reponse) => {
    const nouvelle = { ...reponse, id: crypto.randomUUID(), submitted_at: new Date().toISOString() } as ReponseEnquete
    set((state) => ({
      reponsesEnquetes: [...state.reponsesEnquetes, nouvelle]
    }))
    import('../datastore').then(({ createReponseEnquete }) => {
      createReponseEnquete(nouvelle).then(r => {
        if (r.error) console.error('[enquetes] Sync réponse échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  getStatistiquesEnquete: (enqueteId) => {
    const reponses = get().reponsesEnquetes.filter(r => r.enquete_id === enqueteId)
    const enquete = get().enquetes.find(e => e.id === enqueteId)
    const cible = enquete?.aerodrome_ids?.length || 1
    const taux = Math.round((reponses.length / cible) * 100)
    return { total_reponses: reponses.length, taux_reponse: taux, score_moyen: 0, reponses_par_question: {} } as StatistiquesEnquete
  },

  calculerImpactC1: (reponses) => {
    const scores = reponses.map((r: ReponseEnquete) => r.score_c1).filter((s: number | undefined): s is number => s !== undefined && s !== null)
    if (scores.length === 0) return 50
    const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length
    return Math.round((avg / 5) * 100)
  },
})
