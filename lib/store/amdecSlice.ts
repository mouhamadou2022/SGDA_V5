// lib/store/amdecSlice.ts — Phase 2 (monolithe modulaire)
// Tranche AMDEC extraite du store monolithique, comportement identique.
// Recalcul risque via ÉVÉNEMENT 'risque:recalcul-demande' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { storeEvents } from './eventBus'
import type { AmdecAnalyse } from '../risque/amdecEngine'
import * as datastore from '../datastore'

// ─────────────────────────────────────────────────────────────
// Interface publique du slice (types dans lib/risque/amdecEngine)
// ─────────────────────────────────────────────────────────────

export interface AmdecSlice {
  amdecAnalyses: AmdecAnalyse[]
  setAmdecAnalyses: (analyses: AmdecAnalyse[]) => void
  /** Initialise les analyses AMDEC d'un aérodrome depuis le catalogue (modes non encore analysés) */
  initializeAmdecForAerodrome: (aerodromeId: string) => Promise<void>
  addAmdecAnalyse: (analyse: Omit<AmdecAnalyse, 'id' | 'created_at' | 'updated_at'>) => Promise<AmdecAnalyse | null>
  updateAmdecAnalyse: (id: string, data: Partial<AmdecAnalyse>) => Promise<void>
  deleteAmdecAnalyse: (id: string) => Promise<void>
  getAmdecByAerodrome: (aerodromeId: string) => AmdecAnalyse[]
  /** Lien écart créé depuis une analyse AMDEC */
  lierEcartAmdec: (analyseId: string, ecartId: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createAmdecSlice)
// ─────────────────────────────────────────────────────────────

export const createAmdecSlice: StateCreator<AppStore, [], [], AmdecSlice> = (set, get) => ({
  amdecAnalyses: [],

  setAmdecAnalyses: (analyses) => set({ amdecAnalyses: analyses }),

  initializeAmdecForAerodrome: async (aerodromeId) => {
    try {
      const { CATALOGUE_AMDEC, analyseDepuisCatalogue } = await import('../risque/amdecEngine')
      const existantes = get().amdecAnalyses.filter(a => a.aerodrome_id === aerodromeId)
      const modeIdsExistants = new Set(existantes.map(a => a.mode_id))
      const aCreer = CATALOGUE_AMDEC.filter(m => !modeIdsExistants.has(m.id))
      if (aCreer.length === 0) return
      const nouvelles: AmdecAnalyse[] = aCreer.map(m => analyseDepuisCatalogue(m, aerodromeId))
      set((state) => ({ amdecAnalyses: [...state.amdecAnalyses, ...nouvelles] }))
      for (const analyse of nouvelles) {
        await datastore.createAmdecAnalyse(analyse)
      }
    } catch (error) {
      console.error('[Store] Erreur initialisation AMDEC:', error)
    }
  },

  addAmdecAnalyse: async (analyse) => {
    const now = new Date().toISOString()
    const nouvelle: AmdecAnalyse = { ...analyse, id: crypto.randomUUID(), created_at: now, updated_at: now }
    set((state) => ({ amdecAnalyses: [nouvelle, ...state.amdecAnalyses] }))
    try {
      const result = await datastore.createAmdecAnalyse(nouvelle)
      if (result.error) throw new Error(result.error)
      if (result.data?.id) {
        set((state) => ({ amdecAnalyses: state.amdecAnalyses.map(a => a.id === nouvelle.id ? { ...a, id: result.data!.id } : a) }))
      }
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: nouvelle.aerodrome_id })
      return result.data ?? nouvelle
    } catch (error) {
      console.error('[Store] Erreur création analyse AMDEC, rollback:', error)
      set((state) => ({ amdecAnalyses: state.amdecAnalyses.filter(a => a.id !== nouvelle.id) }))
      return null
    }
  },

  updateAmdecAnalyse: async (id, data) => {
    const analyseAvant = get().amdecAnalyses.find(a => a.id === id)
    const snapshot = get().amdecAnalyses
    // Recalculer IPR/niveau si gravite/probabilite/detection_score modifiés
    const patch: Partial<AmdecAnalyse> = { ...data }
    if (data.gravite !== undefined || data.probabilite !== undefined || data.detection_score !== undefined) {
      const { calculeIPR, getIPRNiveau } = await import('../risque/amdecEngine')
      const base = analyseAvant ?? (patch as AmdecAnalyse)
      const gravite = (data.gravite ?? base.gravite)
      const probabilite = data.probabilite ?? base.probabilite
      const detection_score = data.detection_score ?? base.detection_score
      patch.ipr = calculeIPR(gravite, probabilite, detection_score)
      patch.niveau = getIPRNiveau(patch.ipr)
    }
    set((state) => ({ amdecAnalyses: state.amdecAnalyses.map(a => a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } : a) }))
    try {
      const result = await datastore.updateAmdecAnalyse(id, patch)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('[Store] Erreur update analyse AMDEC, rollback:', error)
      set({ amdecAnalyses: snapshot })
      return
    }
    if (analyseAvant) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: analyseAvant.aerodrome_id })
    }
  },

  deleteAmdecAnalyse: async (id) => {
    const analyseAvant = get().amdecAnalyses.find(a => a.id === id)
    const snapshot = get().amdecAnalyses
    set((state) => ({ amdecAnalyses: state.amdecAnalyses.filter(a => a.id !== id) }))
    try {
      const result = await datastore.deleteAmdecAnalyse(id)
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('[Store] Erreur delete analyse AMDEC, rollback:', error)
      set({ amdecAnalyses: snapshot })
      return
    }
    if (analyseAvant) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: analyseAvant.aerodrome_id })
    }
  },

  getAmdecByAerodrome: (aerodromeId) => get().amdecAnalyses.filter(a => a.aerodrome_id === aerodromeId),

  lierEcartAmdec: async (analyseId, ecartId) => {
    const analyseAvant = get().amdecAnalyses.find(a => a.id === analyseId)
    set((state) => ({ amdecAnalyses: state.amdecAnalyses.map(a => a.id === analyseId ? { ...a, ecart_id: ecartId, statut: 'surveille' as const, updated_at: new Date().toISOString() } : a) }))
    try {
      const result = await datastore.updateAmdecAnalyse(analyseId, { ecart_id: ecartId, statut: 'surveille' })
      if (result.error) throw new Error(result.error)
    } catch (error) {
      console.error('[Store] Erreur lien écart AMDEC, rollback:', error)
      set((state) => ({ amdecAnalyses: state.amdecAnalyses.map(a => a.id === analyseId ? analyseAvant! : a) }))
      return
    }
    if (analyseAvant) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: analyseAvant.aerodrome_id })
    }
  },
})
