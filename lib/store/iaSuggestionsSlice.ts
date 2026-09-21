// lib/store/iaSuggestionsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Suggestions IA extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore, Planning } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface IaSuggestion {
  id: string;
  aerodrome_id: string;
  type: Planning['type'];
  portee: string[];
  date_debut: string;
  date_fin: string;
  equipe_ids: string[];
  chef_id: string;
  priorite: Planning['priorite'];
  objectifs: string;
  raison: string;
  confiance: number;
  source: 'risque_critique' | 'sgs_absent' | 'sgs_faible' | 'certification_fraiche' | 'homologation_fraiche' | 'ecart_actif' | 'evenement' | 'periodique' | 'declencheur_urgent';
  created_at: string;
  equipe_justification?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface IaSuggestionSlice {
  iaSuggestions: IaSuggestion[];
  setIaSuggestions: (suggestions: IaSuggestion[]) => void;
  addIaSuggestion: (suggestion: IaSuggestion) => void;
  removeIaSuggestion: (id: string) => void;
  clearIaSuggestions: () => void;
  getIaSuggestionsByAerodrome: (aerodromeId: string) => IaSuggestion[];
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createIaSuggestionsSlice)
// ─────────────────────────────────────────────────────────────

export const createIaSuggestionsSlice: StateCreator<AppStore, [], [], IaSuggestionSlice> = (set, get) => ({
  iaSuggestions: [],

  setIaSuggestions: (suggestions) => set({ iaSuggestions: suggestions }),

  addIaSuggestion: (suggestion) => set((state) => ({
    iaSuggestions: [...state.iaSuggestions, suggestion]
  })),

  removeIaSuggestion: (id) => set((state) => ({
    iaSuggestions: state.iaSuggestions.filter(s => s.id !== id)
  })),

  clearIaSuggestions: () => set({ iaSuggestions: [] }),

  getIaSuggestionsByAerodrome: (aerodromeId) => {
    return get().iaSuggestions.filter(s => s.aerodrome_id === aerodromeId);
  },
})
