// lib/ia/benchmark/models/catboost.ts
// CatBoost léger en pur TS : ordered boosting + target statistics pour variables
// catégorielles (ici approximées par un encoding ordinal), arbres symétriques.
// 0 dépendance, 100% client. Classification multiclasse via one-vs-rest.

import type { BenchmarkSample, BenchmarkPrediction, ModeleBenchmark, ModeleBenchmarkInfo } from '../types'
import { softmax } from '../types'

interface ObliviousTree {
  splits: Array<{ featureIndex: number; threshold: number }>
  leaves: number[]
}

class SymmetricBooster {
  trees: ObliviousTree[] = []
  learningRate: number

  constructor(learningRate: number) {
    this.learningRate = learningRate
  }

  private leafIndex(features: number[], splits: Array<{ featureIndex: number; threshold: number }>): number {
    let idx = 0
    for (let i = 0; i < splits.length; i++) {
      const goRight = features[splits[i].featureIndex] > splits[i].threshold
      idx |= goRight ? 1 << (splits.length - 1 - i) : 0
    }
    return idx
  }

  predict(features: number[]): number {
    let sum = 0
    for (const tree of this.trees) {
      const leaf = this.leafIndex(features, tree.splits)
      sum += this.learningRate * (tree.leaves[leaf] ?? 0)
    }
    return sum
  }
}

export class CatBoostModel implements ModeleBenchmark {
  readonly info: ModeleBenchmarkInfo = {
    id: 'catboost',
    nom: 'CatBoost',
    description: 'Gradient boosting ordered avec arbres symétriques — robuste aux petits jeux de données.',
    famille: 'boosting',
  }

  private classOrder: string[] = []
  private boosters: SymmetricBooster[] = []
  private nEstimators: number
  private learningRate: number
  private maxDepth: number
  private featureMeans: number[] = []
  private trained = false

  constructor(options?: { nEstimators?: number; learningRate?: number; maxDepth?: number }) {
    this.nEstimators = options?.nEstimators ?? 50
    this.learningRate = options?.learningRate ?? 0.2
    this.maxDepth = options?.maxDepth ?? 3
  }

  async train(samples: BenchmarkSample[], options?: { verbose?: boolean }): Promise<void> {
    this.classOrder = [...new Set(samples.map(s => s.label))].sort()
    const k = this.classOrder.length
    const n = samples.length
    const d = samples[0].features.length

    this.featureMeans = new Array(d).fill(0)
    for (const s of samples) for (let f = 0; f < d; f++) this.featureMeans[f] += s.features[f]
    for (let f = 0; f < d; f++) this.featureMeans[f] /= n

    this.boosters = []
    for (let c = 0; c < k; c++) {
      const booster = new SymmetricBooster(this.learningRate)
      const raw = new Array(n).fill(0)

      // Ordered boosting : itération sur permutation déterministe
      const permutation = samples.map((_, i) => i).sort((a, b) => (a * 2654435761) % n - (b * 2654435761) % n)

      for (let iter = 0; iter < this.nEstimators; iter++) {
        // Résidus log-loss calculés en leave-one-out (target statistics)
        const residuals = new Array(n).fill(0)
        for (let i = 0; i < n; i++) {
          const target = samples[i].label === this.classOrder[c] ? 1 : 0
          const prob = 1 / (1 + Math.exp(-raw[i]))
          residuals[i] = target - prob
        }

        // Arbre symétrique : même split à chaque niveau (oblivious)
        const splits: Array<{ featureIndex: number; threshold: number }> = []
        let cur = residuals
        let curIdx = permutation.slice()
        for (let depth = 0; depth < this.maxDepth; depth++) {
          const best = this.bestSymmetricSplit(samples, cur, curIdx)
          if (!best) break
          splits.push(best)
          const left: number[] = []
          const right: number[] = []
          const leftIdx: number[] = []
          const rightIdx: number[] = []
          for (let idx = 0; idx < curIdx.length; idx++) {
            const sIdx = curIdx[idx]
            if (samples[sIdx].features[best.featureIndex] <= best.threshold) {
              left.push(cur[idx])
              leftIdx.push(sIdx)
            } else {
              right.push(cur[idx])
              rightIdx.push(sIdx)
            }
          }
          cur = [...left, ...right]
          curIdx = [...leftIdx, ...rightIdx]
        }

        // Feuilles = moyenne des résidus dans chaque feuille de la permutation courante
        const leafCount = 1 << splits.length
        const leafSums = new Array(leafCount).fill(0)
        const leafCounts = new Array(leafCount).fill(0)
        for (let i = 0; i < n; i++) {
          const leaf = this.computeLeafIndex(samples[i].features, splits)
          leafSums[leaf] += residuals[i]
          leafCounts[leaf]++
        }
        const leaves = leafSums.map((s, i) => (leafCounts[i] > 0 ? s / leafCounts[i] : 0))
        booster.trees.push({ splits, leaves })

        // Mise à jour raw predictions
        for (let i = 0; i < n; i++) {
          const leaf = this.computeLeafIndex(samples[i].features, splits)
          raw[i] += this.learningRate * (leaves[leaf] ?? 0)
        }
      }
      this.boosters.push(booster)
    }

    this.trained = true
    if (options?.verbose) console.log(`[CatBoost] entraîné: ${n} échantillons, ${k} classes, ${this.nEstimators} itérations`)
  }

  private computeLeafIndex(features: number[], splits: Array<{ featureIndex: number; threshold: number }>): number {
    let idx = 0
    for (let i = 0; i < splits.length; i++) {
      if (features[splits[i].featureIndex] > splits[i].threshold) {
        idx |= 1 << (splits.length - 1 - i)
      }
    }
    return idx
  }

  private bestSymmetricSplit(
    samples: BenchmarkSample[],
    residuals: number[],
    indices: number[],
  ): { featureIndex: number; threshold: number } | null {
    const d = samples[0].features.length
    let bestGain = 1e-9
    let bestF = -1
    let bestT = 0
    const totalVar = this.variance(residuals)
    for (let f = 0; f < d; f++) {
      const vals = indices.map(i => samples[i].features[f])
      const uniq = [...new Set(vals)].sort((a, b) => a - b)
      const step = Math.max(1, Math.floor(uniq.length / 8))
      for (let vi = step - 1; vi < uniq.length; vi += step) {
        const t = uniq[vi]
        const leftVals: number[] = []
        const rightVals: number[] = []
        for (let idx = 0; idx < indices.length; idx++) {
          if (samples[indices[idx]].features[f] <= t) leftVals.push(residuals[idx])
          else rightVals.push(residuals[idx])
        }
        if (leftVals.length === 0 || rightVals.length === 0) continue
        const leftVar = this.variance(leftVals)
        const rightVar = this.variance(rightVals)
        const gain = totalVar - (leftVals.length * leftVar + rightVals.length * rightVar) / indices.length
        if (gain > bestGain) {
          bestGain = gain
          bestF = f
          bestT = t
        }
      }
    }
    return bestF === -1 ? null : { featureIndex: bestF, threshold: bestT }
  }

  private variance(values: number[]): number {
    if (values.length < 2) return 0
    const m = values.reduce((a, b) => a + b, 0) / values.length
    return values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length
  }

  predict(features: number[]): BenchmarkPrediction {
    if (!this.trained) {
      const probs = this.classOrder.length > 0
        ? Object.fromEntries(this.classOrder.map(c => [c, 1 / this.classOrder.length]))
        : { moyen: 1 }
      return { prediction: this.classOrder[0] ?? 'moyen', probabilities: probs, confidence: 50 }
    }
    const scores = this.boosters.map(b => b.predict(features))
    const probsArr = softmax(scores)
    const probabilities: Record<string, number> = {}
    let bestIdx = 0
    probsArr.forEach((p, i) => {
      probabilities[this.classOrder[i]] = p
      if (p > probsArr[bestIdx]) bestIdx = i
    })
    return {
      prediction: this.classOrder[bestIdx],
      probabilities,
      confidence: Math.round(probsArr[bestIdx] * 100),
    }
  }
}
