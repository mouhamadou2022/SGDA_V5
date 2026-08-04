// lib/ia/benchmark/types.ts
// Interface commune des modèles de classification entraînables côté client.
// Les 5 modèles (RF, XGBoost, LightGBM, CatBoost, MLP) implémentent cette interface
// afin d'être comparés sur les mêmes données avec les mêmes métriques.

export interface BenchmarkSample {
  features: number[]
  label: string
}

export interface BenchmarkPrediction {
  prediction: string
  probabilities: Record<string, number>
  confidence: number
}

export type ModeleBenchmarkId = 'random_forest' | 'xgboost' | 'lightgbm' | 'catboost' | 'mlp'

export interface ModeleBenchmarkInfo {
  id: ModeleBenchmarkId
  nom: string
  description: string
  famille: 'ensemble' | 'boosting' | 'neural'
}

export interface ModeleBenchmark {
  readonly info: ModeleBenchmarkInfo
  /** Entraîne le modèle sur les échantillons fournis. Doit être pur (sans état global). */
  train(samples: BenchmarkSample[], options?: { verbose?: boolean }): Promise<void>
  /** Prédit la classe + probabilités pour un vecteur de features. */
  predict(features: number[]): BenchmarkPrediction
}

export interface BenchmarkMetrics {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  rocAuc: number
  trainTimeMs: number
  predictTimeMs: number
  testSize: number
  trainSize: number
}

export interface BenchmarkResult extends BenchmarkMetrics {
  modelId: ModeleBenchmarkId
  nom: string
  /** Score composite 0-100 pour le classement (accuracy + F1 + ROC-AUC) */
  score: number
  /** Maturité N1-N5 du modèle, alignée sur getSgsMaturiteLabel */
  maturite: number
  maturiteLabel: string
}

export interface BenchmarkOutcome {
  results: BenchmarkResult[]
  /** Classement décroissant par score composite */
  ranked: BenchmarkResult[]
  bestModelId: ModeleBenchmarkId | null
  executedAt: string
  datasetSize: number
}

// ============================================================
// Helpers partagés
// ============================================================

export function softmax(scores: number[]): number[] {
  const max = Math.max(...scores)
  const exps = scores.map(s => Math.exp(s - max))
  const sum = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map(e => e / sum)
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/** Matrice de confusion à partir de prédictions réelles (classes 0..K-1). */
export function buildConfusionMatrix(
  yTrue: number[],
  yPred: number[],
  k: number,
): number[][] {
  const matrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(0))
  for (let i = 0; i < yTrue.length; i++) {
    matrix[yTrue[i]][yPred[i]]++
  }
  return matrix
}
