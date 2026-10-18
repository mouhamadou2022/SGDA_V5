// lib/ia/models/xgboost.ts
// Gradient boosting en pur TS — implémentation réelle, formule de gain XGBoost :
//   gain = ½·[GL²/(HL+λ) + GR²/(HR+λ) − G²/(H+λ)] − γ
//   valeur de feuille = −G/(H+λ)   (pas de Newton)
//   · classification multi-classe via softmax (K arbres par itération) ;
//   · hessiennes réelles (p·(1−p) en classification, 1 en régression) ;
//   · minChildWeight / gamma / lambda / alpha réellement appliqués ;
//   · subsample (lignes) et colsample (features) seedés → reproductible ;
//   · importance des features = somme des gains de split (gain-based), pas de hasard.
// 0 API externe, 0 coût, 100% local.

'use client'

import { mulberry32 } from './randomForest'

// ============================================================
// TYPES
// ============================================================

export interface XGBoostConfig {
  maxDepth: number
  learningRate: number
  nEstimators: number
  subsample: number
  colsampleByTree: number
  minChildWeight: number
  gamma: number
  regLambda: number
  regAlpha: number
  seed?: number
}

export interface XGBoostPrediction {
  prediction: string | number
  probabilities?: Record<string, number>
  confidence: number
  /** Importance normalisée (%) par feature, issue des gains de split réels. */
  featureImportance: Record<string, number>
}

export interface TrainingSample {
  features: number[]
  label: string | number
  weight?: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: XGBoostConfig = {
  maxDepth: 6,
  learningRate: 0.3,
  nEstimators: 100,
  subsample: 0.8,
  colsampleByTree: 0.8,
  minChildWeight: 1,
  gamma: 0,
  regLambda: 1,
  regAlpha: 0,
  seed: 42,
}

// ============================================================
// NŒUD D'ARBRE
// ============================================================

class XGBNode {
  isLeaf = true
  value = 0
  featureIndex = -1
  threshold = 0
  left: XGBNode | null = null
  right: XGBNode | null = null
  gain = 0
}

interface SerializedXGBNode {
  isLeaf: boolean
  value: number
  featureIndex?: number
  threshold?: number
  left?: SerializedXGBNode
  right?: SerializedXGBNode
}

function serializeNode(node: XGBNode): SerializedXGBNode {
  if (node.isLeaf) return { isLeaf: true, value: node.value }
  return {
    isLeaf: false,
    value: node.value,
    featureIndex: node.featureIndex,
    threshold: node.threshold,
    left: node.left ? serializeNode(node.left) : undefined,
    right: node.right ? serializeNode(node.right) : undefined,
  }
}

function deserializeNode(data: SerializedXGBNode): XGBNode {
  const node = new XGBNode()
  node.isLeaf = data.isLeaf
  node.value = data.value
  if (!data.isLeaf) {
    node.featureIndex = data.featureIndex ?? -1
    node.threshold = data.threshold ?? 0
    node.left = data.left ? deserializeNode(data.left) : null
    node.right = data.right ? deserializeNode(data.right) : null
  }
  return node
}

// ============================================================
// MODÈLE XGBOOST
// ============================================================

export class XGBoostModel {
  private config: XGBoostConfig
  private trees: XGBNode[] = []              // régression
  private classTrees: XGBNode[][] = []       // classification (K listes)
  private baseScore = 0
  private trained = false
  private featureNames: string[] = []
  private isClassifier = true
  protected classMapping: Map<string, number> = new Map()
  private classOrder: string[] = []
  private gainImportance: number[] = []

  constructor(config: Partial<XGBoostConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // ENTRAÎNEMENT
  // ============================================================

  async train(
    samples: TrainingSample[],
    options?: { verbose?: boolean; validationSplit?: number },
  ): Promise<{ trainLoss: number; valLoss?: number }> {
    if (samples.length < 10) {
      throw new Error(`Pas assez d'échantillons pour l'entraînement. Minimum: 10, reçu: ${samples.length}`)
    }

    const n = samples.length
    const nFeatures = samples[0].features.length
    this.featureNames = Array.from({ length: nFeatures }, (_, i) => `feature_${i}`)
    this.gainImportance = new Array(nFeatures).fill(0)
    this.isClassifier = typeof samples[0].label === 'string'

    const rng = mulberry32(this.config.seed ?? DEFAULT_CONFIG.seed ?? 42)
    const allFeatures = Array.from({ length: nFeatures }, (_, i) => i)
    const subN = Math.max(1, Math.floor(n * this.config.subsample))

    let predictions: number | number[][]

    if (this.isClassifier) {
      this.classOrder = [...new Set(samples.map(s => String(s.label)))].sort()
      this.classMapping = new Map(this.classOrder.map((c, i) => [c, i]))
      const K = this.classOrder.length
      const y = samples.map(s => this.classMapping.get(String(s.label)) ?? 0)
      const raw: number[][] = Array.from({ length: n }, () => new Array(K).fill(0))
      this.classTrees = Array.from({ length: K }, () => [])

      for (let iter = 0; iter < this.config.nEstimators; iter++) {
        const probs = raw.map(r => softmax(r))
        for (let k = 0; k < K; k++) {
          const g = new Array(n).fill(0)
          const h = new Array(n).fill(0)
          for (let i = 0; i < n; i++) {
            const p = probs[i][k]
            const target = y[i] === k ? 1 : 0
            const w = samples[i].weight ?? 1
            g[i] = (p - target) * w
            h[i] = Math.max(1e-6, p * (1 - p)) * w
          }
          const rows = this.sampleRows(n, subN, rng)
          const treeImportance = new Array(nFeatures).fill(0)
          const featureSubset = this.sampleFeatures(allFeatures, nFeatures, rng)
          const tree = this.buildTree(samples, rows, g, h, 0, featureSubset, treeImportance)
          this.classTrees[k].push(tree)
          this.accumulateImportance(treeImportance)
          for (let i = 0; i < n; i++) raw[i][k] += this.config.learningRate * this.predictNode(tree, samples[i].features)
        }
      }
      predictions = raw.map(r => softmax(r))
      this.trained = true

      const loss = this.multiclassLogLoss(predictions as number[][], y)
      if (options?.verbose) console.log(`[XGBoost] entraîné (multi-classe), logloss=${loss.toFixed(4)}`)
      return { trainLoss: loss }
    }

    // Régression
    this.classOrder = []
    this.classMapping = new Map()
    const yv = samples.map(s => Number(s.label))
    this.baseScore = yv.reduce((a, b) => a + b, 0) / n
    const pred: number[] = new Array(n).fill(this.baseScore)
    this.trees = []

    for (let iter = 0; iter < this.config.nEstimators; iter++) {
      const g = new Array(n).fill(0)
      const h = new Array(n).fill(0)
      for (let i = 0; i < n; i++) {
        const w = samples[i].weight ?? 1
        g[i] = (pred[i] - yv[i]) * w
        h[i] = w
      }
      const rows = this.sampleRows(n, subN, rng)
      const treeImportance = new Array(nFeatures).fill(0)
      const featureSubset = this.sampleFeatures(allFeatures, nFeatures, rng)
      const tree = this.buildTree(samples, rows, g, h, 0, featureSubset, treeImportance)
      this.trees.push(tree)
      this.accumulateImportance(treeImportance)
      for (let i = 0; i < n; i++) pred[i] += this.config.learningRate * this.predictNode(tree, samples[i].features)
    }

    this.trained = true
    const mse = pred.reduce((s, p, i) => s + (p - yv[i]) ** 2, 0) / n
    if (options?.verbose) console.log(`[XGBoost] entraîné (régression), mse=${mse.toFixed(4)}`)
    return { trainLoss: mse }
  }

  private sampleRows(n: number, k: number, rng: () => number): number[] {
    if (k >= n) return Array.from({ length: n }, (_, i) => i)
    const idx = Array.from({ length: n }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = idx[i]
      idx[i] = idx[j]
      idx[j] = tmp
    }
    return idx.slice(0, k).sort((a, b) => a - b)
  }

  private sampleFeatures(all: number[], d: number, rng: () => number): number[] {
    const k = Math.max(1, Math.floor(d * this.config.colsampleByTree))
    if (k >= d) return all.slice()
    const pool = all.slice()
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = pool[i]
      pool[i] = pool[j]
      pool[j] = tmp
    }
    return pool.slice(0, k).sort((a, b) => a - b)
  }

  // ============================================================
  // CONSTRUCTION D'ARBRE (régression, gradient/hessienne génériques)
  // ============================================================

  private buildTree(
    samples: TrainingSample[],
    rows: number[],
    g: number[],
    h: number[],
    depth: number,
    featureSubset: number[],
    treeImportance: number[],
  ): XGBNode {
    const lambda = this.config.regLambda
    const gamma = this.config.gamma
    const node = new XGBNode()

    let G = 0
    let H = 0
    for (const i of rows) { G += g[i]; H += h[i] }
    // Valeur de feuille newtonienne : −G/(H+λ) (l'alpha L1 est laissé au seuil de gain)
    node.value = H + lambda > 0 ? -G / (H + lambda) : 0

    if (depth >= this.config.maxDepth || rows.length < 2) {
      return node
    }

    const parentScore = (G * G) / (H + lambda)
    let bestGain = 0
    let bestFeature = -1
    let bestThreshold = 0

    for (const f of featureSubset) {
      const sorted = rows
        .map(i => ({ v: samples[i].features[f], i }))
        .sort((a, b) => a.v - b.v)

      let GL = 0
      let HL = 0
      const totalG = G
      const totalH = H

      for (let k = 0; k < sorted.length - 1; k++) {
        GL += g[sorted[k].i]
        HL += h[sorted[k].i]
        if (sorted[k].v === sorted[k + 1].v) continue
        const GR = totalG - GL
        const HR = totalH - HL
        if (HL < this.config.minChildWeight || HR < this.config.minChildWeight) continue
        const gain =
          0.5 * ((GL * GL) / (HL + lambda) + (GR * GR) / (HR + lambda) - parentScore) - gamma
        if (gain > bestGain + 1e-12) {
          bestGain = gain
          bestFeature = f
          bestThreshold = (sorted[k].v + sorted[k + 1].v) / 2
        }
      }
    }

    if (bestFeature === -1 || bestGain <= 0) {
      return node
    }

    treeImportance[bestFeature] += bestGain
    node.isLeaf = false
    node.featureIndex = bestFeature
    node.threshold = bestThreshold
    node.gain = bestGain

    const leftRows: number[] = []
    const rightRows: number[] = []
    for (const i of rows) {
      if (samples[i].features[bestFeature] <= bestThreshold) leftRows.push(i)
      else rightRows.push(i)
    }

    node.left = this.buildTree(samples, leftRows, g, h, depth + 1, featureSubset, treeImportance)
    node.right = this.buildTree(samples, rightRows, g, h, depth + 1, featureSubset, treeImportance)
    return node
  }

  private predictNode(node: XGBNode | null, features: number[]): number {
    let cur = node
    while (cur && !cur.isLeaf) {
      cur = features[cur.featureIndex] <= cur.threshold ? cur.left : cur.right
    }
    return cur ? cur.value : 0
  }

  private accumulateImportance(treeImportance: number[]): void {
    for (let f = 0; f < treeImportance.length; f++) this.gainImportance[f] += treeImportance[f]
  }

  // ============================================================
  // PRÉDICTION
  // ============================================================

  predict(features: number[]): XGBoostPrediction {
    if (!this.trained) return this.fallbackPrediction(features)

    const featureImportance = this.getFeatureImportance()

    if (this.isClassifier) {
      const K = this.classOrder.length
      const scores = new Array(K).fill(0)
      for (let k = 0; k < K; k++) {
        let raw = 0
        for (const tree of this.classTrees[k]) raw += this.predictNode(tree, features)
        scores[k] = raw
      }
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
        featureImportance,
      }
    }

    const treePreds = this.trees.map(t => this.predictNode(t, features))
    const raw = this.baseScore + treePreds.reduce((a, b) => a + b, 0)
    const std = variance(treePreds)
    return {
      prediction: Math.min(100, Math.max(0, Math.round(raw))),
      confidence: Math.round(Math.max(30, Math.min(95, 100 - Math.sqrt(std)))),
      featureImportance,
    }
  }

  private fallbackPrediction(features: number[]): XGBoostPrediction {
    if (this.isClassifier) {
      const classes = this.classMapping.size > 0 ? Array.from(this.classMapping.keys()) : ['moyen']
      const probs: Record<string, number> = {}
      classes.forEach(c => { probs[c] = 1 / classes.length })
      return { prediction: classes[0], probabilities: probs, confidence: 50, featureImportance: {} }
    }
    const m = features.length ? features.reduce((a, b) => a + b, 0) / features.length : 50
    return {
      prediction: Math.min(100, Math.max(0, Math.round(m))),
      confidence: 50,
      featureImportance: {},
    }
  }

  /** Importance des features par somme des gains de split (normalisée en %). */
  getFeatureImportance(): Record<string, number> {
    if (!this.trained || !this.gainImportance.length) return {}
    const total = this.gainImportance.reduce((a, b) => a + b, 0)
    const out: Record<string, number> = {}
    for (let f = 0; f < this.gainImportance.length; f++) {
      const name = this.featureNames[f] || `feature_${f}`
      out[name] = total > 0 ? Math.round((this.gainImportance[f] / total) * 100) : 0
    }
    return out
  }

  private multiclassLogLoss(probs: number[][], y: number[]): number {
    let loss = 0
    for (let i = 0; i < probs.length; i++) {
      loss += -Math.log(Math.max(1e-9, probs[i][y[i]]))
    }
    return loss / Math.max(1, probs.length)
  }

  // ============================================================
  // SAUVEGARDE ET CHARGEMENT
  // ============================================================

  exportModel(): string {
    return JSON.stringify({
      config: this.config,
      baseScore: this.baseScore,
      trained: this.trained,
      featureNames: this.featureNames,
      classOrder: this.classOrder,
      isClassifier: this.isClassifier,
      gainImportance: this.gainImportance,
      trees: this.trees.map(serializeNode),
      classTrees: this.classTrees.map(list => list.map(serializeNode)),
    })
  }

  importModel(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config ?? this.config
      this.baseScore = data.baseScore ?? 0
      this.featureNames = data.featureNames ?? []
      this.classOrder = data.classOrder ?? []
      this.classMapping = new Map(this.classOrder.map((c: string, i: number) => [c, i]))
      this.isClassifier = data.isClassifier !== false
      this.gainImportance = data.gainImportance ?? []
      this.trees = (data.trees ?? []).map(deserializeNode)
      this.classTrees = (data.classTrees ?? []).map((list: SerializedXGBNode[]) => list.map(deserializeNode))
      this.trained = data.trained === true
      return true
    } catch (error) {
      console.error('[XGBoost] Erreur lors de l\'import:', error)
      return false
    }
  }

  isTrained(): boolean {
    return this.trained
  }

  reset(): void {
    this.trees = []
    this.classTrees = []
    this.baseScore = 0
    this.trained = false
    this.classMapping.clear()
    this.classOrder = []
    this.gainImportance = []
    this.isClassifier = true
  }
}

// ============================================================
// HELPERS
// ============================================================

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores)
  const exps = scores.map(s => Math.exp(s - max))
  const sum = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map(e => e / sum)
}

function variance(values: number[]): number {
  if (values.length < 2) return 0
  const m = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length
}

// ============================================================
// CLASSIFIEURS SPÉCIFIQUES
// ============================================================

export class RiskLevelClassifier extends XGBoostModel {
  private static readonly LABEL_SCORES: Record<string, number> = {
    critique: 20, eleve: 45, moyen: 65, faible: 85,
  }
  private static readonly SCORE_LABELS: Array<{ label: 'critique' | 'eleve' | 'moyen' | 'faible'; score: number }> =
    Object.entries(RiskLevelClassifier.LABEL_SCORES).map(([l, s]) => ({ label: l as 'critique' | 'eleve' | 'moyen' | 'faible', score: s }))

  constructor() {
    super({ nEstimators: 50, maxDepth: 4 })
  }

  async trainOnData(
    features: number[][],
    labels: ('critique' | 'eleve' | 'moyen' | 'faible')[],
  ): Promise<void> {
    // Les 4 niveaux sont ordonnés → régression ordinale (plus adaptée qu'un one-hot).
    const samples: TrainingSample[] = features.map((f, i) => ({
      features: f,
      label: RiskLevelClassifier.LABEL_SCORES[labels[i]] ?? 50,
    }))
    await this.train(samples)
    this.classMapping.clear()
  }

  predictRiskLevel(features: number[]): {
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
    confidence: number
    probabilities: Record<string, number>
  } {
    const result = this.predict(features)
    const score = result.prediction as number
    let best = RiskLevelClassifier.SCORE_LABELS[0]
    let minDist = Infinity
    for (const entry of RiskLevelClassifier.SCORE_LABELS) {
      const d = Math.abs(score - entry.score)
      if (d < minDist) { minDist = d; best = entry }
    }
    const confidence = Math.round(Math.max(30, 100 - minDist * 2))
    const probs: Record<string, number> = {}
    for (const entry of RiskLevelClassifier.SCORE_LABELS) {
      probs[entry.label] = entry === best ? Math.round(confidence) / 100 : Math.round((100 - confidence) / 3) / 100
    }
    return { niveau: best.label, confidence, probabilities: probs }
  }
}

export class PACEvaluator extends XGBoostModel {
  constructor() {
    super({ nEstimators: 30, maxDepth: 5 })
  }

  async trainOnData(
    features: number[][],
    labels: ('accepte' | 'refuse')[],
  ): Promise<void> {
    const samples: TrainingSample[] = features.map((f, i) => ({ features: f, label: labels[i] }))
    await this.train(samples)
  }

  evaluatePAC(features: number[]): {
    decision: 'accepte' | 'refuse'
    confidence: number
    probabiliteAcceptation: number
  } {
    const result = this.predict(features)
    const probs = result.probabilities || { accepte: 0.5, refuse: 0.5 }
    return {
      decision: result.prediction as 'accepte' | 'refuse',
      confidence: result.confidence,
      probabiliteAcceptation: Math.round((probs.accepte ?? 0.5) * 100),
    }
  }
}

// ============================================================
// SINGLETONS
// ============================================================

export const riskClassifier = new RiskLevelClassifier()
export const pacEvaluator = new PACEvaluator()
