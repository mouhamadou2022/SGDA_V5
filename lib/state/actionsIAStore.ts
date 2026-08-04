// lib/state/actionsIAStore.ts
// Store zustand partagé (non persistant) pour les actions IA générées.
// Évite que l'onglet « Anticipation » et l'onglet « Actions » appellent tous les
// deux /api/ai/actions avec le même payload : l'onglet Actions est la source,
// l'onglet Anticipation relit simplement le résultat depuis ce store.

'use client'

import { create } from 'zustand'
import type { ActionConcrete } from '@/lib/risque/recommendations'

interface ActionsIAState {
  actions: ActionConcrete[]
  parAerodrome: Record<string, ActionConcrete[]>
  setActions: (aerodromeId: string, actions: ActionConcrete[]) => void
  getActions: (aerodromeId: string) => ActionConcrete[]
  clear: () => void
}

export const useActionsIAStore = create<ActionsIAState>((set, get) => ({
  actions: [],
  parAerodrome: {},
  setActions: (aerodromeId, actions) => {
    set((state) => ({
      actions,
      parAerodrome: { ...state.parAerodrome, [aerodromeId]: actions },
    }))
  },
  getActions: (aerodromeId) => get().parAerodrome[aerodromeId] ?? [],
  clear: () => set({ actions: [], parAerodrome: {} }),
}))
