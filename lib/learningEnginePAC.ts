// lib/learningEnginePAC.ts
'use client';

export interface PACLearningFeedback {
  id: string;
  date: string;
  ecart_id: string;
  aerodrome_id: string;
  contexte: {
    score_global: number;
    tendance: string;
    c4: number;
    nb_ecarts_critiques: number;
    type_inspection: string;
    delai_restant: number;
  };
  criteres_suggere: string[];
  criteres_inspecteur: string[];
  decision_systeme: 'accepte' | 'refuse';
  decision_inspecteur: 'accepte' | 'refuse';
  concordance: boolean;
  feedback_utilite: 'oui' | 'peu' | 'non';
  commentaire?: string;
}

export interface PreuveLearningFeedback {
  id: string;
  date: string;
  ecart_id: string;
  aerodrome_id: string;
  contexte: {
    score_global: number;
    nb_preuves: number;
    delai_restant: number;
  };
  criteres_suggere: string[];
  criteres_inspecteur: string[];
  decision_systeme: 'valide' | 'refuse';
  decision_inspecteur: 'valide' | 'refuse';
  concordance: boolean;
  feedback_utilite: 'oui' | 'peu' | 'non';
  commentaire?: string;
}

// Pondérations des critères (ajustables par apprentissage)
let ponderationsCriterePAC: Record<string, number> = {
  pertinence: 1.0,
  exhaustivite: 1.0,
  precision: 1.0,
  specificite: 1.0,
  realisme: 1.0,
  coherence: 1.0,
};

let ponderationsPriorisation: Record<string, number> = {
  score_critique: 30,
  tendance_baisse: 20,
  ecart_critique: 25,
  delai_expire: 25,
};

let feedbacksPAC: PACLearningFeedback[] = [];
let feedbacksPreuves: PreuveLearningFeedback[] = [];

/**
 * Enregistrer un feedback d'évaluation PAC
 */
export function enregistrerFeedbackPAC(
  ecart_id: string,
  aerodrome_id: string,
  contexte: PACLearningFeedback['contexte'],
  criteresSuggere: string[],
  criteresInspecteur: string[],
  decisionSysteme: 'accepte' | 'refuse',
  decisionInspecteur: 'accepte' | 'refuse',
  feedbackUtilite: 'oui' | 'peu' | 'non',
  commentaire?: string
): PACLearningFeedback {
  const concordance = decisionSysteme === decisionInspecteur;
  const feedback: PACLearningFeedback = {
    id: `fb-pac-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    date: new Date().toISOString(),
    ecart_id,
    aerodrome_id,
    contexte,
    criteres_suggere: criteresSuggere,
    criteres_inspecteur: criteresInspecteur,
    decision_systeme: decisionSysteme,
    decision_inspecteur: decisionInspecteur,
    concordance,
    feedback_utilite: feedbackUtilite,
    commentaire,
  };

  feedbacksPAC.push(feedback);
  ajusterPonderationsPAC(feedback);
  return feedback;
}

/**
 * Enregistrer un feedback d'évaluation des preuves
 */
export function enregistrerFeedbackPreuves(
  ecart_id: string,
  aerodrome_id: string,
  contexte: PreuveLearningFeedback['contexte'],
  criteresSuggere: string[],
  criteresInspecteur: string[],
  decisionSysteme: 'valide' | 'refuse',
  decisionInspecteur: 'valide' | 'refuse',
  feedbackUtilite: 'oui' | 'peu' | 'non',
  commentaire?: string
): PreuveLearningFeedback {
  const concordance = decisionSysteme === decisionInspecteur;
  const feedback: PreuveLearningFeedback = {
    id: `fb-preuve-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    date: new Date().toISOString(),
    ecart_id,
    aerodrome_id,
    contexte,
    criteres_suggere: criteresSuggere,
    criteres_inspecteur: criteresInspecteur,
    decision_systeme: decisionSysteme,
    decision_inspecteur: decisionInspecteur,
    concordance,
    feedback_utilite: feedbackUtilite,
    commentaire,
  };

  feedbacksPreuves.push(feedback);
  ajusterPonderationsPreuves(feedback);
  return feedback;
}

/**
 * Ajuster les pondérations des critères PAC
 */
function ajusterPonderationsPAC(feedback: PACLearningFeedback): void {
  for (const critere of feedback.criteres_inspecteur) {
    if (!feedback.criteres_suggere.includes(critere)) {
      ponderationsCriterePAC[critere] = Math.min(3.0, (ponderationsCriterePAC[critere] || 1.0) + 0.05);
    }
  }

  if (!feedback.concordance) {
    for (const critere of feedback.criteres_inspecteur) {
      ponderationsCriterePAC[critere] = Math.min(3.0, (ponderationsCriterePAC[critere] || 1.0) + 0.1);
    }
  }

  if (feedback.feedback_utilite === 'non') {
    ponderationsPriorisation.score_critique = Math.max(10, ponderationsPriorisation.score_critique - 5);
    ponderationsPriorisation.tendance_baisse = Math.max(10, ponderationsPriorisation.tendance_baisse - 5);
  }
}

/**
 * Ajuster les pondérations des critères preuves
 */
function ajusterPonderationsPreuves(feedback: PreuveLearningFeedback): void {
  if (!feedback.concordance && feedback.feedback_utilite !== 'non') {
    for (const critere of feedback.criteres_inspecteur) {
      if (!feedback.criteres_suggere.includes(critere)) {
        ponderationsCriterePAC[critere] = Math.min(3.0, (ponderationsCriterePAC[critere] || 1.0) + 0.05);
      }
    }
    for (const critere of feedback.criteres_inspecteur) {
      ponderationsCriterePAC[critere] = Math.min(3.0, (ponderationsCriterePAC[critere] || 1.0) + 0.1);
    }
  }
  if (feedback.feedback_utilite === 'non') {
    ponderationsPriorisation.score_critique = Math.max(10, ponderationsPriorisation.score_critique - 3);
  }
}

/**
 * Obtenir la priorité d'un PAC basée sur le contexte
 */
export function getPACPriorite(contexte: PACLearningFeedback['contexte']): number {
  let score = 0;

  if (contexte.score_global < 30) score += ponderationsPriorisation.score_critique;
  else if (contexte.score_global < 50) score += 15;

  if (contexte.tendance === 'baisse') score += ponderationsPriorisation.tendance_baisse;

  if (contexte.nb_ecarts_critiques > 0) score += ponderationsPriorisation.ecart_critique;

  if (contexte.delai_restant < 0) score += ponderationsPriorisation.delai_expire;

  return Math.min(100, score);
}

/**
 * Obtenir tous les feedbacks PAC
 */
export function getAllFeedbacksPAC(): PACLearningFeedback[] {
  return [...feedbacksPAC];
}

/**
 * Obtenir les feedbacks pour un aérodrome
 */
export function getFeedbacksPACForAerodrome(aerodrome_id: string): PACLearningFeedback[] {
  return feedbacksPAC.filter(f => f.aerodrome_id === aerodrome_id);
}

/**
 * Obtenir les statistiques d'apprentissage
 */
export function getLearningStatsPAC(): {
  total_feedbacks: number;
  taux_concordance: number;
  taux_utilite: number;
  ponderations_criteres: Record<string, number>;
  ponderations_priorisation: Record<string, number>;
} {
  const total = feedbacksPAC.length;
  const concordants = feedbacksPAC.filter(f => f.concordance).length;
  const utiles = feedbacksPAC.filter(f => f.feedback_utilite === 'oui').length;

  return {
    total_feedbacks: total,
    taux_concordance: total > 0 ? Math.round((concordants / total) * 100) : 0,
    taux_utilite: total > 0 ? Math.round((utiles / total) * 100) : 0,
    ponderations_criteres: { ...ponderationsCriterePAC },
    ponderations_priorisation: { ...ponderationsPriorisation },
  };
}

/**
 * Réinitialiser l'apprentissage
 */
export function resetLearningPAC(): void {
  feedbacksPAC = [];
  feedbacksPreuves = [];
  ponderationsCriterePAC = {
    pertinence: 1.0,
    exhaustivite: 1.0,
    precision: 1.0,
    specificite: 1.0,
    realisme: 1.0,
    coherence: 1.0,
  };
  ponderationsPriorisation = {
    score_critique: 30,
    tendance_baisse: 20,
    ecart_critique: 25,
    delai_expire: 25,
  };
}

/**
 * Exporter les utilitaires
 */
export const learningEnginePAC = {
  enregistrerFeedbackPAC,
  enregistrerFeedbackPreuves,
  getPACPriorite,
  getAllFeedbacksPAC,
  getFeedbacksPACForAerodrome,
  getLearningStatsPAC,
  resetLearningPAC,
};