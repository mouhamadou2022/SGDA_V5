// lib/ia/benchmark/adapters.ts
// Adaptateurs pour les modèles existants (RandomForest, XGBoost) vers l'interface
// commune ModeleBenchmark, afin de les comparer sur le même protocole.

import { RandomForestModel as ClassRF } from '../models/randomForest'
import { XGBoostModel as ClassXGB } from '../models/xgboost'
import type {
  BenchmarkSample,
  BenchmarkPrediction,
  ModeleBenchmark,
  ModeleBenchmarkInfo,
} from './types'

// ============================================================
// RANDOM FOREST (existant)
// ============================================================

export interface RandomForestBenchmarkParams {
  nTrees?: number
  maxDepth?: number
}

export class RandomForestBenchmark implements ModeleBenchmark {
  readonly info: ModeleBenchmarkInfo = {
    id: 'random_forest',
    nom: 'Random Forest',
    description: 'Forêt d\'arbres de décision bootstrapés — robuste et interprétable.',
    famille: 'ensemble',
  }

  private params: RandomForestBenchmarkParams
  private model: ClassRF | null = null
  private classOrder: string[] = []

  constructor(params: RandomForestBenchmarkParams = {}) {
    this.params = params
  }

  async train(samples: BenchmarkSample[], options?: { verbose?: boolean }): Promise<void> {
    this.classOrder = [...new Set(samples.map(s => s.label))].sort()
    const rf = new ClassRF({
      nTrees: this.params.nTrees ?? 20,
      maxDepth: this.params.maxDepth ?? 6,
      minSamplesSplit: 2,
      minSamplesLeaf: 1,
      maxFeatures: 'sqrt',
      bootstrap: true,
      sampleSize: 1.0,
    })
    await rf.train(
      samples.map(s => ({ features: s.features, label: s.label })),
      { verbose: options?.verbose ?? false },
    )
    this.model = rf
  }

  predict(features: number[]): BenchmarkPrediction {
    if (!this.model) {
      const probs = this.classOrder.length > 0
        ? Object.fromEntries(this.classOrder.map(c => [c, 1 / this.classOrder.length]))
        : { moyen: 1 }
      return { prediction: this.classOrder[0] ?? 'moyen', probabilities: probs, confidence: 50 }
    }
    const res = this.model.predict(features)
    return {
      prediction: String(res.prediction),
      probabilities: res.probabilities ?? { [String(res.prediction)]: 1 },
      confidence: res.confidence,
    }
  }
}

// ============================================================
// XGBOOST (existant)
// ============================================================

export interface XGBoostBenchmarkParams {
  nEstimators?: number
  learningRate?: number
  maxDepth?: number
}

export class XGBoostBenchmark implements ModeleBenchmark {
  readonly info: ModeleBenchmarkInfo = {
    id: 'xgboost',
    nom: 'XGBoost',
    description: 'Gradient boosting régularisé — le moteur de référence actuel.',
    famille: 'boosting',
  }

  private params: XGBoostBenchmarkParams
  private model: ClassXGB | null = null
  private classOrder: string[] = []

  constructor(params: XGBoostBenchmarkParams = {}) {
    this.params = params
  }

  async train(samples: BenchmarkSample[], options?: { verbose?: boolean }): Promise<void> {
    this.classOrder = [...new Set(samples.map(s => s.label))].sort()
    const xgb = new ClassXGB({
      maxDepth: this.params.maxDepth ?? 6,
      learningRate: this.params.learningRate ?? 0.2,
      nEstimators: this.params.nEstimators ?? 40,
      subsample: 0.8,
      colsampleByTree: 0.8,
      minChildWeight: 1,
      gamma: 0,
      regLambda: 1,
      regAlpha: 0,
    })
    await xgb.train(
      samples.map(s => ({ features: s.features, label: s.label })),
      { verbose: options?.verbose ?? false },
    )
    this.model = xgb
  }

  predict(features: number[]): BenchmarkPrediction {
    if (!this.model) {
      const probs = this.classOrder.length > 0
        ? Object.fromEntries(this.classOrder.map(c => [c, 1 / this.classOrder.length]))
        : { moyen: 1 }
      return { prediction: this.classOrder[0] ?? 'moyen', probabilities: probs, confidence: 50 }
    }
    const res = this.model.predict(features)
    return {
      prediction: String(res.prediction),
      probabilities: res.probabilities ?? { [String(res.prediction)]: 1 },
      confidence: res.confidence,
    }
  }
}
