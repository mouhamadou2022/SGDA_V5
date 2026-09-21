// lib/store/riskIndexFeedbackSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Feedback RiskIndex extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface RiskIndexFeedback {
  id: string;
  aerodrome_id: string;
  date: string;
  contexte: {
    score_global: number;
    c1: number;
    c2: number;
    c3: number;
    c4: number;
    c5: number;
    velocity: number;
    nb_ecarts_critiques: number;
    nb_nv: number;
    nb_ns: number;
  };
  suggestion_systeme: {
    probabilite: 1 | 2 | 3 | 4 | 5;
    gravite: 'A' | 'B' | 'C' | 'D' | 'E';
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  };
  choix_inspecteur: {
    probabilite: 1 | 2 | 3 | 4 | 5;
    gravite: 'A' | 'B' | 'C' | 'D' | 'E';
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  };
  ecart: number;
  commentaire?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface RiskIndexFeedbackSlice {
  riskIndexFeedbacks: RiskIndexFeedback[];
  setRiskIndexFeedbacks: (feedbacks: RiskIndexFeedback[]) => void;
  addRiskIndexFeedback: (feedback: Omit<RiskIndexFeedback, 'id'>) => void;
  getFeedbacksByAerodrome: (aerodromeId: string) => RiskIndexFeedback[];
  getRiskIndexLearningStats: () => { totalFeedbacks: number; modelVersion: number; lastCalibrated: string; adjustmentsCount: number };
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createRiskIndexFeedbackSlice)
// ─────────────────────────────────────────────────────────────

export const createRiskIndexFeedbackSlice: StateCreator<AppStore, [], [], RiskIndexFeedbackSlice> = (set, get) => ({
  riskIndexFeedbacks: [],

  setRiskIndexFeedbacks: (feedbacks) => set({ riskIndexFeedbacks: feedbacks }),

  addRiskIndexFeedback: (feedback) => {
    const newFeedback: RiskIndexFeedback = {
      id: crypto.randomUUID(),
      ...feedback,
    };
    set((state) => ({
      riskIndexFeedbacks: [...state.riskIndexFeedbacks, newFeedback]
    }));
  },

  getFeedbacksByAerodrome: (aerodromeId) => {
    return get().riskIndexFeedbacks.filter(f => f.aerodrome_id === aerodromeId);
  },

  getRiskIndexLearningStats: () => {
    const feedbacks = get().riskIndexFeedbacks;
    const uniqueModels = new Set(feedbacks.map(f => `${f.contexte.score_global}_${f.contexte.c4}`));
    return {
      totalFeedbacks: feedbacks.length,
      modelVersion: 1,
      lastCalibrated: new Date().toISOString(),
      adjustmentsCount: uniqueModels.size,
    };
  },
})
