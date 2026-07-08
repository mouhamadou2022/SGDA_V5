// lib/ia/evaluateOutcomes.ts
// Boucle d'apprentissage décision → outcome
// Relie chaque décision à l'évolution du score 6 mois après
// Utilisable côté serveur (cron) ou côté client (affichage stats)

import { weightController } from './weightController'
import type { EffectivenessRating } from './types'

export interface DecisionOutcome {
  decision_id: string
  aerodrome_id: string
  score_before: number | null
  score_after_6m: number | null
  delta: number | null
  effectiveness: EffectivenessRating
  evaluated_at: string | null
  auto_evaluated: boolean
}

/** Calcule l'efficacité à partir de l'écart de score.
 *  Logique utilisée par le cron evaluate-decisions. */
export function computeEffectiveness(scoreBefore: number, scoreAfter: number): DecisionOutcome['effectiveness'] {
  const delta = scoreAfter - scoreBefore
  if (delta > 5) return 'efficace'
  if (delta >= -5) return 'partiel'
  return 'inefficace'
}

/**
 * Applique la boucle d'apprentissage complète :
 * 1. Évalue l'efficacité de chaque décision
 * 2. Recalibre les poids C1-C5 en fonction des outcomes
 * 3. Met à jour les seuils dynamiques via thresholdController
 */
export function runLearningCycle(
  outcomes: DecisionOutcome[],
  dimensionsByAerodrome: Map<string, Record<string, number>>,
): { weightAdjustments: import('./weightController').WeightAdjustment[] } {
  const weightAdjustments = weightController.recalibrateFromOutcomes(outcomes, dimensionsByAerodrome)
  return { weightAdjustments }
}
