// lib/store/ftaSlice.ts — Phase 2 (monolithe modulaire)
// Tranche FTA (arbres de défaillance) extraite du store monolithique,
// comportement identique. Types dans lib/risque/ftaEngine.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { ArbreFTA, NoeudFTA } from '../risque/ftaEngine'
import * as datastore from '../datastore'

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface FtaSlice {
  ftaAnalyses: ArbreFTA[]
  setFtaAnalyses: (arbres: ArbreFTA[]) => void
  /** Crée l'analyse FTA d'un événement depuis le template le plus pertinent */
  initializeFtaForEvenement: (evenement: { id: string; aerodrome_id: string; type?: string; description?: string; causes?: string[] }) => Promise<ArbreFTA | null>
  getFtaByEvenement: (evenementId: string) => ArbreFTA | null
  updateFtaAnalyse: (id: string, data: Partial<ArbreFTA>) => Promise<void>
  /** Met à jour les noeuds (portes, causes, états) et recalcule la probabilité + coupes */
  setFtaNoeuds: (id: string, noeuds: NoeudFTA[]) => Promise<void>
  deleteFtaAnalyse: (id: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createFtaSlice)
// ─────────────────────────────────────────────────────────────

export const createFtaSlice: StateCreator<AppStore, [], [], FtaSlice> = (set, get) => ({
  ftaAnalyses: [],

  setFtaAnalyses: (arbres) => set({ ftaAnalyses: arbres }),

  initializeFtaForEvenement: async (evenement) => {
    const { creerArbreDepuisTemplate } = await import('../risque/ftaEngine')
    const arbre = creerArbreDepuisTemplate(evenement)
    set((state) => ({ ftaAnalyses: [arbre, ...state.ftaAnalyses] }))
    try {
      const result = await datastore.createFtaAnalyse(arbre)
      if (result.error) throw new Error(result.error)
      if (result.data?.id) {
        set((state) => ({ ftaAnalyses: state.ftaAnalyses.map(a => a.id === arbre.id ? { ...a, id: result.data!.id } : a) }))
      }
      return result.data ?? arbre
    } catch (error) {
      console.error('[Store] Erreur création FTA, rollback:', error)
      set((state) => ({ ftaAnalyses: state.ftaAnalyses.filter(a => a.id !== arbre.id) }))
      return null
    }
  },

  getFtaByEvenement: (evenementId) => get().ftaAnalyses.find(a => a.evenementId === evenementId) || null,

  updateFtaAnalyse: async (id, data) => {
    const snapshot = get().ftaAnalyses
    set((state) => ({ ftaAnalyses: state.ftaAnalyses.map(a => a.id === id ? { ...a, ...data, updated_at: new Date().toISOString() } : a) }))
    try {
      const result = await datastore.updateFtaAnalyse(id, data)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('[Store] Erreur update FTA, rollback:', error)
      set({ ftaAnalyses: snapshot })
      return
    }
  },

  setFtaNoeuds: async (id, noeuds) => {
    const arbreAvant = get().ftaAnalyses.find(a => a.id === id)
    const snapshot = get().ftaAnalyses
    const { calculerArbre, getCausesPresentes } = await import('../risque/ftaEngine')
    const base = arbreAvant
    if (!base) return
    const calc = calculerArbre({ ...base, noeuds })
    const causes = getCausesPresentes(noeuds).map((c) => c.label)
    set((state) => ({
      ftaAnalyses: state.ftaAnalyses.map(a => a.id === id ? {
        ...a,
        noeuds,
        updated_at: new Date().toISOString(),
        probabilite_sommet: calc.probabiliteSommet,
        nb_coupes_minimales: calc.coupesMinimales.length,
        causes_identifiees: causes,
      } : a),
    }))
    try {
      const result = await datastore.updateFtaAnalyse(id, {
        noeuds,
        probabilite_sommet: calc.probabiliteSommet,
        nb_coupes_minimales: calc.coupesMinimales.length,
        causes_identifiees: causes,
      })
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('[Store] Erreur noeuds FTA, rollback:', error)
      set({ ftaAnalyses: snapshot })
    }
  },

  deleteFtaAnalyse: async (id) => {
    const snapshot = get().ftaAnalyses
    set((state) => ({ ftaAnalyses: state.ftaAnalyses.filter(a => a.id !== id) }))
    try {
      const result = await datastore.deleteFtaAnalyse(id)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('[Store] Erreur delete FTA, rollback:', error)
      set({ ftaAnalyses: snapshot })
    }
  },
})
