// lib/risque/modelEvaluator.ts
// Évalue la performance réelle des modèles ML (train/test split + historique)
// 0 dépendance externe

import type { TrainingSample } from './randomForest'
import { trainTestSplit } from './randomForest'

export interface ModelEvaluation {
  accuracy: number
  precision: Record<string, number>
  recall: Record<string, number>
  f1Score: Record<string, number>
  confusionMatrix: Record<string, Record<string, number>>
  testSize: number
  trainSize: number
  evaluatedAt: string
}

export interface EvaluationHistoryPoint {
  date: string
  modelName: string
  accuracy: number
  testSize: number
}

const EVAL_HISTORY_KEY = 'sgda_model_eval_history'
const MAX_HISTORY = 100

/**
 * Évalue un modèle de prédiction sur un jeu de test.
 * @param predictFn Fonction de prédiction (ex: (features) => label)
 * @param test Échantillons de test
 * @param classes Liste des classes possibles
 */
export function evaluateModel(
  predictFn: (features: Record<string, number>) => string,
  test: TrainingSample[],
  classes: string[] = ['critique', 'eleve', 'moyen', 'faible'],
): ModelEvaluation {
  const confusionMatrix: Record<string, Record<string, number>> = {}
  classes.forEach(c => {
    confusionMatrix[c] = {}
    classes.forEach(c2 => { confusionMatrix[c][c2] = 0 })
  })

  let correct = 0
  test.forEach(s => {
    const predicted = predictFn(s.features)
    const actual = s.label
    if (predicted === actual) correct++
    if (!confusionMatrix[actual]) confusionMatrix[actual] = {}
    confusionMatrix[actual][predicted] = (confusionMatrix[actual][predicted] || 0) + 1
  })

  const accuracy = test.length > 0 ? correct / test.length : 0

  const precision: Record<string, number> = {}
  const recall: Record<string, number> = {}
  const f1Score: Record<string, number> = {}

  classes.forEach(c => {
    const tp = confusionMatrix[c]?.[c] || 0
    const fp = classes.reduce((sum, c2) => sum + (confusionMatrix[c2]?.[c] || 0), 0) - tp
    const fn = classes.reduce((sum, c2) => sum + (confusionMatrix[c]?.[c2] || 0), 0) - tp
    precision[c] = tp + fp > 0 ? tp / (tp + fp) : 0
    recall[c] = tp + fn > 0 ? tp / (tp + fn) : 0
    f1Score[c] = precision[c] + recall[c] > 0 ? 2 * (precision[c] * recall[c]) / (precision[c] + recall[c]) : 0
  })

  return {
    accuracy,
    precision,
    recall,
    f1Score,
    confusionMatrix,
    testSize: test.length,
    trainSize: 0,
    evaluatedAt: new Date().toISOString(),
  }
}

/**
 * Entraîne et évalue un modèle avec split train/test.
 * @param trainFn Fonction d'entraînement async
 * @param predictFn Fonction de prédiction
 * @param samples Tous les échantillons
 * @param testRatio Ratio de test (défaut: 0.2)
 * @param seed Graine pour reproductibilité
 */
export async function trainAndEvaluate(
  trainFn: (samples: TrainingSample[]) => Promise<void>,
  predictFn: (features: Record<string, number>) => string,
  samples: TrainingSample[],
  testRatio: number = 0.2,
  seed?: number,
): Promise<{ evaluation: ModelEvaluation; trainSize: number }> {
  const { train, test } = trainTestSplit(samples, testRatio, seed)
  await trainFn(train)
  const evaluation = evaluateModel(predictFn, test)
  evaluation.trainSize = train.length
  return { evaluation, trainSize: train.length }
}

/**
 * Sauvegarde un point d'historique d'évaluation dans localStorage.
 */
export function saveEvaluationHistory(point: EvaluationHistoryPoint): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(EVAL_HISTORY_KEY)
    const history: EvaluationHistoryPoint[] = raw ? JSON.parse(raw) : []
    history.push(point)
    localStorage.setItem(EVAL_HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch { /* localStorage indisponible */ }
}

/**
 * Récupère l'historique des évaluations.
 */
export function getEvaluationHistory(modelName?: string): EvaluationHistoryPoint[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(EVAL_HISTORY_KEY)
    const history: EvaluationHistoryPoint[] = raw ? JSON.parse(raw) : []
    return modelName ? history.filter(h => h.modelName === modelName) : history
  } catch { return [] }
}

/**
 * Calcule la tendance d'accuracy sur les N dernières évaluations.
 */
export function getAccuracyTrend(modelName: string): 'up' | 'down' | 'stable' {
  const history = getEvaluationHistory(modelName)
  if (history.length < 3) return 'stable'
  const recent = history.slice(-3)
  if (recent[2].accuracy > recent[0].accuracy) return 'up'
  if (recent[2].accuracy < recent[0].accuracy) return 'down'
  return 'stable'
}

/**
 * Niveau de confiance textuel basé sur l'accuracy.
 */
export function getConfidenceLevel(accuracy: number): { label: string; color: string; icon: string } {
  if (accuracy >= 0.85) return { label: 'Fiable', color: 'text-success', icon: '🟢' }
  if (accuracy >= 0.7) return { label: 'Moyen', color: 'text-warning', icon: '🟡' }
  if (accuracy >= 0.5) return { label: 'Faible', color: 'text-orange', icon: '🟠' }
  return { label: 'Non fiable', color: 'text-danger', icon: '🔴' }
}
