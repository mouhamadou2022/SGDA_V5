// lib/store/uiSlice.ts — Phase 2 (monolithe modulaire)
// Tranche UI (module actif, département, thème, filtres, chargement) extraite
// du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface UISlice {
  activeModule: string
  setActiveModule: (module: string) => void
  activeDepartement: 'DNSA' | 'DNA'
  setActiveDepartement: (dep: 'DNSA' | 'DNA') => void
  activeSurveillanceId: string | null
  setActiveSurveillanceId: (id: string | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  filters: {
    search: string
    region: string[]
    type: string[]
    statut: string[]
    niveauRisque: string[]
  }
  viewMode: 'list' | 'grid' | 'map'
  setFilters: (filters: Partial<UISlice['filters']>) => void
  setViewMode: (mode: 'list' | 'grid' | 'map') => void
  isLoading: Record<string, boolean>
  setLoading: (key: string, loading: boolean) => void
  _hydrated: boolean
  pendingRegistreSource: { type: 'certification' | 'homologation'; id: string; aerodrome_id: string } | null
  setPendingRegistreSource: (source: UISlice['pendingRegistreSource']) => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createUISlice)
// ─────────────────────────────────────────────────────────────

export const createUISlice: StateCreator<AppStore, [], [], UISlice> = (set) => ({
  activeModule: typeof window !== 'undefined' ? (() => { try { return localStorage.getItem('sgda-last-module') || 'dashboard' } catch { return 'dashboard' } })() : 'dashboard',
  setActiveModule: (module) => {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sgda-last-module', module) } catch { /* ignore */ }
    }
    set({ activeModule: module })
  },
  activeDepartement: typeof window !== 'undefined' ? (() => { try { return (localStorage.getItem('sgda-departement') as 'DNSA' | 'DNA') || 'DNSA' } catch { return 'DNSA' } })() : 'DNSA',
  setActiveDepartement: (dep) => {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sgda-departement', dep) } catch { /* ignore */ }
    }
    set({ activeDepartement: dep, activeModule: 'dashboard' })
  },
  activeSurveillanceId: null,
  setActiveSurveillanceId: (id) => set({ activeSurveillanceId: id }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  theme: typeof window !== 'undefined' ? (() => { try { return (localStorage.getItem('sgda-theme') as 'light' | 'dark' | 'system') || 'system' } catch { console.warn('[Store] Erreur chargement thème'); return 'system' } })() : 'system',
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sgda-theme', theme)
      } catch (error) {
        console.warn('[Store] Erreur sauvegarde thème:', error)
      }
    }
    set({ theme })
  },

  filters: {
    search: '',
    region: [],
    type: [],
    statut: [],
    niveauRisque: [],
  },
  viewMode: 'list',
  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters }
  })),
  setViewMode: (mode) => set({ viewMode: mode }),

  isLoading: {},
  setLoading: (key, loading) => set((state) => ({
    isLoading: { ...state.isLoading, [key]: loading }
  })),
  _hydrated: false,
  pendingRegistreSource: null,
  setPendingRegistreSource: (source) => set({ pendingRegistreSource: source }),
})
