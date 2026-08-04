// lib/ia/benchmark/models/mlp.ts
// MLP (réseau de neurones) léger en pur TS : 1 couche cachée ReLU + softmax,
// entraînement par rétropropagation / descente de gradient stochastique.
// 0 dépendance, 100% client. Classification multiclasse.

import type { BenchmarkSample, BenchmarkPrediction, ModeleBenchmark, ModeleBenchmarkInfo } from '../types'
import { softmax } from '../types'

export class MLPModel implements ModeleBenchmark {
  readonly info: ModeleBenchmarkInfo = {
    id: 'mlp',
    nom: 'MLP (réseau neuronal)',
    description: 'Perceptron multicouche 1 couche cachée (ReLU) + softmax — référence neural.',
    famille: 'neural',
  }

  private classOrder: string[] = []
  private inputDim = 0
  private hiddenDim: number
  private epochs: number
  private learningRate: number

  private W1: number[][] = [] // hiddenDim x inputDim
  private b1: number[] = []
  private W2: number[][] = [] // k x hiddenDim
  private b2: number[] = []

  private featureMeans: number[] = []
  private featureStds: number[] = []
  private trained = false

  constructor(options?: { hiddenDim?: number; epochs?: number; learningRate?: number }) {
    this.hiddenDim = options?.hiddenDim ?? 12
    this.epochs = options?.epochs ?? 200
    this.learningRate = options?.learningRate ?? 0.1
  }

  private initWeights(k: number, d: number): void {
    const scale = Math.sqrt(2 / d)
    this.W1 = Array.from({ length: this.hiddenDim }, () =>
      Array.from({ length: d }, () => (Math.random() * 2 - 1) * scale))
    this.b1 = new Array(this.hiddenDim).fill(0)
    this.W2 = Array.from({ length: k }, () =>
      Array.from({ length: this.hiddenDim }, () => (Math.random() * 2 - 1) * scale))
    this.b2 = new Array(k).fill(0)
  }

  private standardize(features: number[]): number[] {
    return features.map((v, i) => {
      const std = this.featureStds[i] ?? 1
      return std > 1e-6 ? (v - (this.featureMeans[i] ?? 0)) / std : 0
    })
  }

  async train(samples: BenchmarkSample[], options?: { verbose?: boolean }): Promise<void> {
    this.classOrder = [...new Set(samples.map(s => s.label))].sort()
    const k = this.classOrder.length
    const n = samples.length
    const d = samples[0].features.length
    this.inputDim = d

    // Normalisation Z-score
    this.featureMeans = new Array(d).fill(0)
    for (const s of samples) for (let f = 0; f < d; f++) this.featureMeans[f] += s.features[f]
    for (let f = 0; f < d; f++) this.featureMeans[f] /= n
    this.featureStds = new Array(d).fill(0)
    for (const s of samples) for (let f = 0; f < d; f++) this.featureStds[f] += (s.features[f] - this.featureMeans[f]) ** 2
    for (let f = 0; f < d; f++) this.featureStds[f] = Math.sqrt(this.featureStds[f] / n)

    this.initWeights(k, d)
    const X = samples.map(s => this.standardize(s.features))
    const y = samples.map(s => this.classOrder.indexOf(s.label))

    for (let epoch = 0; epoch < this.epochs; epoch++) {
      let loss = 0
      // SGD en batch complet (déterministe) pour un entraînement stable
      const gradW2 = Array.from({ length: k }, () => new Array(this.hiddenDim).fill(0))
      const gradB2 = new Array(k).fill(0)
      const gradW1 = Array.from({ length: this.hiddenDim }, () => new Array(d).fill(0))
      const gradB1 = new Array(this.hiddenDim).fill(0)

      for (let i = 0; i < n; i++) {
        const hidden = new Array(this.hiddenDim).fill(0)
        for (let h = 0; h < this.hiddenDim; h++) {
          let z = this.b1[h]
          for (let f = 0; f < d; f++) z += this.W1[h][f] * X[i][f]
          hidden[h] = z > 0 ? z : 0 // ReLU
        }
        const logits = new Array(k).fill(0)
        for (let c = 0; c < k; c++) {
          let z = this.b2[c]
          for (let h = 0; h < this.hiddenDim; h++) z += this.W2[c][h] * hidden[h]
          logits[c] = z
        }
        const probs = softmax(logits)

        // Loss cross-entropy
        loss += -Math.log(Math.max(1e-9, probs[y[i]]))

        // Gradient sortie
        for (let c = 0; c < k; c++) {
          const delta = probs[c] - (c === y[i] ? 1 : 0)
          gradB2[c] += delta
          for (let h = 0; h < this.hiddenDim; h++) gradW2[c][h] += delta * hidden[h]
        }
        // Gradient caché
        for (let h = 0; h < this.hiddenDim; h++) {
          if (hidden[h] <= 0) continue
          let back = 0
          for (let c = 0; c < k; c++) back += (probs[c] - (c === y[i] ? 1 : 0)) * this.W2[c][h]
          gradB1[h] += back
          for (let f = 0; f < d; f++) gradW1[h][f] += back * X[i][f]
        }
      }

      const lr = this.learningRate
      for (let c = 0; c < k; c++) {
        this.b2[c] -= (lr * gradB2[c]) / n
        for (let h = 0; h < this.hiddenDim; h++) this.W2[c][h] -= (lr * gradW2[c][h]) / n
      }
      for (let h = 0; h < this.hiddenDim; h++) {
        this.b1[h] -= (lr * gradB1[h]) / n
        for (let f = 0; f < d; f++) this.W1[h][f] -= (lr * gradW1[h][f]) / n
      }

      if (options?.verbose && (epoch + 1) % 50 === 0) {
        console.log(`[MLP] Epoch ${epoch + 1}/${this.epochs}, loss=${(loss / n).toFixed(4)}`)
      }
    }

    this.trained = true
    if (options?.verbose) console.log(`[MLP] entraîné: ${n} échantillons, ${k} classes, ${this.epochs} epochs`)
  }

  predict(features: number[]): BenchmarkPrediction {
    if (!this.trained) {
      const probs = this.classOrder.length > 0
        ? Object.fromEntries(this.classOrder.map(c => [c, 1 / this.classOrder.length]))
        : { moyen: 1 }
      return { prediction: this.classOrder[0] ?? 'moyen', probabilities: probs, confidence: 50 }
    }
    const x = this.standardize(features)
    const hidden = new Array(this.hiddenDim).fill(0)
    for (let h = 0; h < this.hiddenDim; h++) {
      let z = this.b1[h]
      for (let f = 0; f < x.length; f++) z += this.W1[h][f] * x[f]
      hidden[h] = z > 0 ? z : 0
    }
    const logits = new Array(this.classOrder.length).fill(0)
    for (let c = 0; c < this.classOrder.length; c++) {
      let z = this.b2[c]
      for (let h = 0; h < this.hiddenDim; h++) z += this.W2[c][h] * hidden[h]
      logits[c] = z
    }
    const probsArr = softmax(logits)
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
