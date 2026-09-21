// lib/store/suggestionFeedbacksSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Feedbacks de suggestions extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface SuggestionFeedback {
  id: string;
  aerodrome_id: string;
  suggestion_type: 'surveillance_pac' | 'surveillance_ecarts' | 'surveillance_mixte' | 'audit_complet';
  mission_type_suggeree: string;
  mission_type_effectif?: string;
  etait_pertinent: boolean;
  raison_inexactitude?: string;
  contexte_json?: string;
  ecart_ids?: string[];
  date_suggestion: string;
  date_feedback?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface SuggestionFeedbackSlice {
  suggestionFeedbacks: SuggestionFeedback[];
  setSuggestionFeedbacks: (feedbacks: SuggestionFeedback[]) => void;
  submitSuggestionFeedback: (feedback: Omit<SuggestionFeedback, 'id'>) => void;
  getSuggestionFeedbacksByAerodrome: (aerodromeId: string) => SuggestionFeedback[];
  getSuggestionAccuracy: (aerodromeId?: string) => { total: number; pertinents: number; rate: number };
  getAdjustedThreshold: (aerodromeId: string, baseThreshold: number, suggestionType: string) => number;
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createSuggestionFeedbacksSlice)
// ─────────────────────────────────────────────────────────────

export const createSuggestionFeedbacksSlice: StateCreator<AppStore, [], [], SuggestionFeedbackSlice> = (set, get) => ({
  suggestionFeedbacks: [],

  setSuggestionFeedbacks: (feedbacks) => set({ suggestionFeedbacks: feedbacks }),

  submitSuggestionFeedback: (feedback) => {
    const newFeedback: SuggestionFeedback = {
      id: crypto.randomUUID(),
      date_feedback: new Date().toISOString(),
      ...feedback,
    };
    set((state) => ({
      suggestionFeedbacks: [...state.suggestionFeedbacks, newFeedback]
    }));
  },

  getSuggestionFeedbacksByAerodrome: (aerodromeId) => {
    return get().suggestionFeedbacks.filter(f => f.aerodrome_id === aerodromeId);
  },

  getSuggestionAccuracy: (aerodromeId) => {
    const feedbacks = aerodromeId
      ? get().suggestionFeedbacks.filter(f => f.aerodrome_id === aerodromeId)
      : get().suggestionFeedbacks;
    const pertinents = feedbacks.filter(f => f.etait_pertinent).length;
    return {
      total: feedbacks.length,
      pertinents,
      rate: feedbacks.length > 0 ? pertinents / feedbacks.length : 1,
    };
  },

  getAdjustedThreshold: (aerodromeId, baseThreshold, suggestionType) => {
    const feedbacks = get().suggestionFeedbacks.filter(
      f => f.aerodrome_id === aerodromeId && f.mission_type_suggeree === suggestionType
    );
    if (feedbacks.length < 5) return baseThreshold;
    const negativeRate = feedbacks.filter(f => !f.etait_pertinent).length / feedbacks.length;
    if (negativeRate > 0.8) return baseThreshold * 0.75;
    if (negativeRate > 0.6) return baseThreshold * 0.85;
    if (negativeRate < 0.2) return baseThreshold * 1.1;
    return baseThreshold;
  },
})
