// lib/ia/benchmark/benchmarkEngine.ts
// Protocole de benchmark : entraîne les 5 modèles sur le même split train/test,
// calcule accuracy/precision/recall/F1/ROC-AUC + temps train/predict,
// classe les modèles et persiste le meilleur (sélection pilotant les prédictions).

import type {
  BenchmarkOutcome,
  BenchmarkResult,
  BenchmarkSample,
  ModeleBenchmark,
  ModeleBenchmarkId,
} from './types'
import { buildConfusionMatrix } from './types'
import { accuracy, precisionMacro, recallMacro, f1Macro, rocAucOvR } from './metrics'
import { RandomForestBenchmark, XGBoostBenchmark } from './adapters'
import { LightGBMModel } from './models/lightgbm'
import { CatBoostModel } from './models/catboost'
import { MLPModel } from './models/mlp'
import {
  DEFAULT_BENCHMARK_CONFIG,
  lireBenchmarkConfig,
  validerBenchmarkConfig,
  type BenchmarkConfig,
} from './config'
import { getSgsMaturiteLabel } from '@/lib/utils'

const SELECTION_KEY = 'sgda_benchmark_selection'
const OUTCOME_KEY = 'sgda_benchmark_outcome'

/** Instancie les 5 modèles avec les hyperparamètres fournis (défauts sinon). */
export function creerModelesBenchmark(config?: BenchmarkConfig): ModeleBenchmark[] {
  const c = config ? validerBenchmarkConfig(config) : (lireBenchmarkConfig() ?? DEFAULT_BENCHMARK_CONFIG)
  return [
    new RandomForestBenchmark({ nTrees: c.random_forest.nTrees, maxDepth: c.random_forest.maxDepth }),
    new XGBoostBenchmark({
      nEstimators: c.xgboost.nEstimators,
      learningRate: c.xgboost.learningRate,
      maxDepth: c.xgboost.maxDepth,
    }),
    new LightGBMModel({
      nEstimators: c.lightgbm.nEstimators,
      learningRate: c.lightgbm.learningRate,
      maxLeaves: c.lightgbm.maxLeaves,
    }),
    new CatBoostModel({
      nEstimators: c.catboost.nEstimators,
      learningRate: c.catboost.learningRate,
      maxDepth: c.catboost.maxDepth,
    }),
    new MLPModel({
      hiddenDim: c.mlp.hiddenDim,
      epochs: c.mlp.epochs,
      learningRate: c.mlp.learningRate,
    }),
  ]
}

export const MODELE_LABELS: Record<ModeleBenchmarkId, string> = {
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  lightgbm: 'LightGBM',
  catboost: 'CatBoost',
  mlp: 'MLP (neural)',
}

/** Convertit les échantillons du store (features dict + label) vers le format benchmark. */
export function toBenchmarkSamples(
  samples: Array<{ features: Record<string, number>; label: string }>,
  featuresOrder?: string[],
): BenchmarkSample[] {
  const order = featuresOrder && featuresOrder.length > 0
    ? featuresOrder
    : samples[0] ? Object.keys(samples[0].features) : []
  return samples.map(s => ({
    features: order.map(k => s.features[k] ?? 0),
    label: s.label,
  }))
}

function toResult(
  model: ModeleBenchmark,
  metrics: { accuracy: number; precision: number; recall: number; f1Score: number; rocAuc: number; trainTimeMs: number; predictTimeMs: number; testSize: number; trainSize: number },
): BenchmarkResult {
  const score = Math.round(
    (metrics.accuracy * 0.4 + metrics.f1Score * 0.3 + metrics.rocAuc * 0.3) * 100,
  )
  const maturite = score
  return {
    modelId: model.info.id,
    nom: model.info.nom,
    ...metrics,
    score,
    maturite,
    maturiteLabel: getSgsMaturiteLabel(maturite),
  }
}

export interface RunBenchmarkOptions {
  testRatio?: number
  seed?: number
  verbose?: boolean
  /** Hyperparamètres par modèle — utilisés pour instancier les modèles. */
  config?: BenchmarkConfig
}

/** Split train/test stratifié par classe, sur des features en tableau (format benchmark). */
export function benchmarkSplit(
  samples: BenchmarkSample[],
  testRatio = 0.25,
  seed?: number,
): { train: BenchmarkSample[]; test: BenchmarkSample[] } {
  if (samples.length < 2 || testRatio <= 0 || testRatio >= 1) {
    return { train: [...samples], test: [] }
  }
  const rng = seed ? seededRandom(seed) : Math.random
  const byClass = new Map<string, BenchmarkSample[]>()
  samples.forEach(s => {
    const list = byClass.get(s.label) || []
    list.push(s)
    byClass.set(s.label, list)
  })
  const train: BenchmarkSample[] = []
  const test: BenchmarkSample[] = []
  for (const [, group] of byClass) {
    const shuffled = [...group].sort(() => rng() - 0.5)
    const splitIdx = Math.max(1, Math.floor(shuffled.length * (1 - testRatio)))
    train.push(...shuffled.slice(0, splitIdx))
    test.push(...shuffled.slice(splitIdx))
  }
  return { train, test }
}

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Lance le benchmark complet : split stratifié, entraînement + évaluation de
 * chaque modèle, mesure des temps, classement.
 * Ne mute aucun état global — conçu pour être appelé depuis le store ou l'UI.
 */
export async function runBenchmark(
  samples: BenchmarkSample[],
  options?: RunBenchmarkOptions,
): Promise<BenchmarkOutcome> {
  if (samples.length < 10) {
    throw new Error(`Pas assez d'échantillons pour le benchmark (minimum 10, reçu ${samples.length})`)
  }
  const { train, test } = benchmarkSplit(samples, options?.testRatio ?? 0.25, options?.seed)

  const classes = [...new Set(samples.map(s => s.label))].sort()
  const classIndex = new Map(classes.map((c, i) => [c, i]))

  const results: BenchmarkResult[] = []
  for (const model of creerModelesBenchmark(options?.config)) {
    const trainStart = performance.now()
    await model.train(train, { verbose: options?.verbose ?? false })
    const trainTimeMs = Math.round(performance.now() - trainStart)

    const predStart = performance.now()
    const yTrue: number[] = []
    const yPred: number[] = []
    const proba: number[][] = []
    for (const t of test) {
      const res = model.predict(t.features)
      yTrue.push(classIndex.get(t.label) ?? 0)
      yPred.push(classIndex.get(res.prediction) ?? 0)
      proba.push(classes.map(c => res.probabilities[c] ?? 0))
    }
    const predictTimeMs = Math.max(1, Math.round((performance.now() - predStart) / Math.max(1, test.length)))

    const matrix = buildConfusionMatrix(yTrue, yPred, classes.length)
    results.push(toResult(model, {
      accuracy: accuracy(matrix),
      precision: precisionMacro(matrix),
      recall: recallMacro(matrix),
      f1Score: f1Macro(matrix),
      rocAuc: rocAucOvR(yTrue, proba),
      trainTimeMs,
      predictTimeMs,
      testSize: test.length,
      trainSize: train.length,
    }))
  }

  const ranked = [...results].sort((a, b) => b.score - a.score)
  const outcome: BenchmarkOutcome = {
    results,
    ranked,
    bestModelId: ranked[0]?.modelId ?? null,
    executedAt: new Date().toISOString(),
    datasetSize: samples.length,
  }
  persistOutcome(outcome)
  return outcome
}

// ============================================================
// PERSISTANCE DE LA SÉLECTION
// ============================================================

/** Persiste le modèle choisi (pilote les prédictions de risque). */
export function persisterSelection(modelId: ModeleBenchmarkId | null): void {
  if (typeof window === 'undefined') return
  try {
    if (modelId) localStorage.setItem(SELECTION_KEY, modelId)
    else localStorage.removeItem(SELECTION_KEY)
  } catch { /* localStorage indisponible */ }
}

export function lireSelection(): ModeleBenchmarkId | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(SELECTION_KEY)
    return v && ['random_forest', 'xgboost', 'lightgbm', 'catboost', 'mlp'].includes(v)
      ? (v as ModeleBenchmarkId)
      : null
  } catch { return null }
}

function persistOutcome(outcome: BenchmarkOutcome): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(OUTCOME_KEY, JSON.stringify(outcome))
  } catch { /* localStorage indisponible */ }
}

export function lireDernierOutcome(): BenchmarkOutcome | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(OUTCOME_KEY)
    return raw ? (JSON.parse(raw) as BenchmarkOutcome) : null
  } catch { return null }
}
