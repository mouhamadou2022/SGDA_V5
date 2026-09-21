// lib/store/pacLearningSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Apprentissage PAC/preuves extraite du store monolithique,
// comportement identique. Délègue à lib/learningEnginePAC (singleton).

import type { StateCreator } from 'zustand'
import type { AppStore, PACLearningFeedbackRecord, PreuveLearningFeedbackRecord } from '../store'
import { learningEnginePAC, type PACLearningFeedback, type PreuveLearningFeedback } from '../learningEnginePAC'

export interface PACLearningEngineSlice {
  // Feedbacks collectés
  pacFeedbacks: PACLearningFeedbackRecord[];
  preuveFeedbacks: PreuveLearningFeedbackRecord[];

  // Pondérations courantes (mises à jour après chaque feedback)
  ponderationsCriteres: Record<string, number>;
  ponderationsPriorisation: Record<string, number>;

  // Méthodes
  enregistrerFeedbackPAC: (
    ecartId: string,
    aerodromeId: string,
    contexte: PACLearningFeedback['contexte'],
    criteresSuggere: string[],
    criteresInspecteur: string[],
    decisionSysteme: 'accepte' | 'refuse',
    decisionInspecteur: 'accepte' | 'refuse',
    utilite: 'oui' | 'peu' | 'non',
    commentaire?: string
  ) => void;

  enregistrerFeedbackPreuves: (
    ecartId: string,
    aerodromeId: string,
    contexte: PreuveLearningFeedback['contexte'],
    criteresSuggere: string[],
    criteresInspecteur: string[],
    decisionSysteme: 'valide' | 'refuse',
    decisionInspecteur: 'valide' | 'refuse',
    utilite: 'oui' | 'peu' | 'non',
    commentaire?: string
  ) => void;

  getPACPriorite: (contexte: PACLearningFeedback['contexte']) => number;
  getLearningStatsPAC: () => {
    total_feedbacks: number;
    taux_concordance: number;
    taux_utilite: number;
    ponderations_criteres: Record<string, number>;
    ponderations_priorisation: Record<string, number>;
  };
}

export const createPacLearningSlice: StateCreator<AppStore, [], [], PACLearningEngineSlice> = (set, get) => ({
      // ============================================================

      pacFeedbacks: [],
      preuveFeedbacks: [],
      ponderationsCriteres: {
        pertinence: 1.0,
        exhaustivite: 1.0,
        precision: 1.0,
        specificite: 1.0,
        realisme: 1.0,
        coherence: 1.0,
      },
      ponderationsPriorisation: {
        score_critique: 30,
        tendance_baisse: 20,
        ecart_critique: 25,
        delai_expire: 25,
      },

      enregistrerFeedbackPAC: (
        ecartId, aerodromeId, contexte,
        criteresSuggere, criteresInspecteur,
        decisionSysteme, decisionInspecteur,
        utilite, commentaire
      ) => {
        const feedback = learningEnginePAC.enregistrerFeedbackPAC(
          ecartId, aerodromeId, contexte,
          criteresSuggere, criteresInspecteur,
          decisionSysteme, decisionInspecteur,
          utilite, commentaire
        );
        const stats = learningEnginePAC.getLearningStatsPAC();
        set((state) => ({
          pacFeedbacks: [feedback, ...state.pacFeedbacks],
          ponderationsCriteres: stats.ponderations_criteres ?? state.ponderationsCriteres,
          ponderationsPriorisation: stats.ponderations_priorisation ?? state.ponderationsPriorisation,
        }));
      },

      enregistrerFeedbackPreuves: (
        ecartId, aerodromeId, contexte,
        criteresSuggere, criteresInspecteur,
        decisionSysteme, decisionInspecteur,
        utilite, commentaire
      ) => {
        const feedback = learningEnginePAC.enregistrerFeedbackPreuves(
          ecartId, aerodromeId, contexte,
          criteresSuggere, criteresInspecteur,
          decisionSysteme, decisionInspecteur,
          utilite, commentaire
        );
        set((state) => ({
          preuveFeedbacks: [feedback, ...state.preuveFeedbacks],
        }));
      },

      getPACPriorite: (contexte) => {
        return learningEnginePAC.getPACPriorite(contexte);
      },

      getLearningStatsPAC: () => {
        return learningEnginePAC.getLearningStatsPAC();
      }
})
