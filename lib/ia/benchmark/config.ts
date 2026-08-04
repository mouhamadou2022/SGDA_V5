// lib/ia/benchmark/config.ts
// Configuration des hyperparamètres par modèle, éditable depuis l'interface de
// monitoring ML. Chaque paramètre est borné (min/max/step) pour l'UI et les
// valeurs sont persistées en localStorage, puis rejouées au prochain benchmark
// et lors de l'entraînement du modèle actif.

import type { ModeleBenchmarkId } from './types'

export interface HyperParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
}

export type BenchmarkConfig = Record<ModeleBenchmarkId, Record<string, number>>

/** Valeurs par défaut — alignées sur les constructeurs des modèles. */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  random_forest: { nTrees: 20, maxDepth: 6 },
  xgboost: { nEstimators: 40, learningRate: 0.2, maxDepth: 6 },
  lightgbm: { nEstimators: 60, learningRate: 0.3, maxLeaves: 12 },
  catboost: { nEstimators: 50, learningRate: 0.2, maxDepth: 3 },
  mlp: { hiddenDim: 12, epochs: 200, learningRate: 0.1 },
}

/** Bornes et libellés pour les contrôles de l'interface. */
export const MODEL_HYPERPARAMS: Record<ModeleBenchmarkId, HyperParamDef[]> = {
  random_forest: [
    { key: 'nTrees', label: 'Nombre d’arbres', min: 5, max: 100, step: 5 },
    { key: 'maxDepth', label: 'Profondeur max', min: 2, max: 14, step: 1 },
  ],
  xgboost: [
    { key: 'nEstimators', label: 'Nombre d’itérations', min: 10, max: 100, step: 5 },
    { key: 'learningRate', label: 'Taux d’apprentissage', min: 0.05, max: 0.5, step: 0.05 },
    { key: 'maxDepth', label: 'Profondeur max', min: 2, max: 10, step: 1 },
  ],
  lightgbm: [
    { key: 'nEstimators', label: 'Nombre d’itérations', min: 10, max: 100, step: 5 },
    { key: 'learningRate', label: 'Taux d’apprentissage', min: 0.05, max: 0.5, step: 0.05 },
    { key: 'maxLeaves', label: 'Feuilles max', min: 4, max: 40, step: 2 },
  ],
  catboost: [
    { key: 'nEstimators', label: 'Nombre d’itérations', min: 10, max: 100, step: 5 },
    { key: 'learningRate', label: 'Taux d’apprentissage', min: 0.05, max: 0.5, step: 0.05 },
    { key: 'maxDepth', label: 'Profondeur max', min: 2, max: 8, step: 1 },
  ],
  mlp: [
    { key: 'hiddenDim', label: 'Neurones cachés', min: 4, max: 48, step: 2 },
    { key: 'epochs', label: 'Époques', min: 20, max: 600, step: 20 },
    { key: 'learningRate', label: 'Taux d’apprentissage', min: 0.01, max: 0.5, step: 0.01 },
  ],
}

const CONFIG_KEY = 'sgda_benchmark_config'

export function persisterBenchmarkConfig(config: BenchmarkConfig): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch { /* localStorage indisponible */ }
}

export function lireBenchmarkConfig(): BenchmarkConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    return validerBenchmarkConfig(JSON.parse(raw) as Partial<BenchmarkConfig>)
  } catch { return null }
}

/** Restitue une config valide : valeurs par défaut, bornées dans [min, max]. */
export function validerBenchmarkConfig(config: Partial<BenchmarkConfig> | null | undefined): BenchmarkConfig {
  const out: BenchmarkConfig = {
    random_forest: { ...DEFAULT_BENCHMARK_CONFIG.random_forest },
    xgboost: { ...DEFAULT_BENCHMARK_CONFIG.xgboost },
    lightgbm: { ...DEFAULT_BENCHMARK_CONFIG.lightgbm },
    catboost: { ...DEFAULT_BENCHMARK_CONFIG.catboost },
    mlp: { ...DEFAULT_BENCHMARK_CONFIG.mlp },
  }
  if (!config) return out
  ;(Object.keys(out) as ModeleBenchmarkId[]).forEach(id => {
    MODEL_HYPERPARAMS[id].forEach(def => {
      const v = config[id]?.[def.key]
      if (typeof v === 'number' && !Number.isNaN(v)) {
        out[id][def.key] = Math.min(def.max, Math.max(def.min, v))
      }
    })
  })
  return out
}

/** Vrai dès qu'un paramètre diffère des valeurs par défaut. */
export function configEstPersonnalisee(config: BenchmarkConfig): boolean {
  return (Object.keys(config) as ModeleBenchmarkId[]).some(id =>
    MODEL_HYPERPARAMS[id].some(def => config[id][def.key] !== DEFAULT_BENCHMARK_CONFIG[id][def.key]))
}
