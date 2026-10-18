// lib/ia/models/randomForest.ts
// Random Forest en pur TS — implémentation réelle (pas d'approximation) :
//   · critère de split = baisse d'impureté pondérée (Gini en classification,
//     variance en régression) ;
//   · feuilles = distribution de classes (classification) ou moyenne (régression) ;
//   · probabilités = moyenne des distributions de feuilles sur tous les arbres ;
//   · importance des features = baisse d'impureté pondérée par le nombre
//     d'échantillons de chaque nœud (MDI), moyennée sur les arbres ;
//   · minSamplesLeaf réellement appliqué ; seuils candidats = points médians ;
//   · RNG seedé (mulberry32) → entraînement reproductible.
// 0 API externe, 0 coût, 100% local.

'use client'

// ============================================================
// TYPES
// ============================================================

export interface RandomForestConfig {
  nTrees: number
  maxDepth: number
  minSamplesSplit: number
  minSamplesLeaf: number
  maxFeatures: number | 'sqrt' | 'log2'
  bootstrap: boolean
  sampleSize: number
  /** Graine pour la reproductibilité (bootstrap + sous-ensemble de features). */
  seed?: number
}

export interface RandomForestPrediction {
  prediction: string | number
  /** Probabilités par classe (fractions dans [0,1]) — classification uniquement. */
  probabilities?: Record<string, number>
  confidence: number
  treeVotes: Record<string, number>
  anomalyScore?: number
}

export interface TrainingSample {
  features: number[]
  label: string | number
  weight?: number
}

type TaskType = 'classification' | 'regression'

// ============================================================
// CONSTANTES / RNG
// ============================================================

const DEFAULT_CONFIG: RandomForestConfig = {
  nTrees: 100,
  maxDepth: 10,
  minSamplesSplit: 2,
  minSamplesLeaf: 1,
  maxFeatures: 'sqrt',
  bootstrap: true,
  sampleSize: 1.0,
  seed: 42,
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================================================
// NŒUD D'ARBRE
// ============================================================

class TreeNode {
  isLeaf = true
  featureIndex = -1
  threshold = 0
  /** Valeur de régression (moyenne). */
  value = 0
  /** Distribution de classes (classification) — indexée sur l'ordre des classes. */
  proba: number[] = []
  left: TreeNode | null = null
  right: TreeNode | null = null
  nSamples = 0
  impurity = 0
}

// ============================================================
// ARBRE DE DÉCISION
// ============================================================

interface TreeConfig {
  maxDepth: number
  minSamplesSplit: number
  minSamplesLeaf: number
  featureIndices: number[]
  maxFeatures: number | 'sqrt' | 'log2'
  taskType: TaskType
  nClasses: number
  rng: () => number
}

class DecisionTree {
  root: TreeNode | null = null
  /** Baisse d'impureté pondérée cumulée par feature (non normalisée). */
  featureImportance: number[] = []
  private cfg: TreeConfig
  private totalN = 0

  constructor(cfg: TreeConfig) {
    this.cfg = cfg
  }

  train(samples: TrainingSample[]): void {
    this.totalN = Math.max(1, samples.length)
    this.featureImportance = new Array(samples[0]?.features.length ?? 0).fill(0)
    this.root = this.buildTree(samples, 0)
  }

  private nFeaturesToSample(total: number): number {
    const mf = this.cfg.maxFeatures
    if (typeof mf === 'number') return Math.max(1, Math.min(total, mf))
    if (mf === 'log2') return Math.max(1, Math.floor(Math.log2(Math.max(2, total))))
    return Math.max(1, Math.floor(Math.sqrt(total)))
  }

  private selectFeatureSubset(total: number): number[] {
    const n = this.nFeaturesToSample(total)
    if (n >= total) {
      // Pas de sous-échantillonnage : on garde toutes les features (ordre stable).
      return this.cfg.featureIndices.slice()
    }
    const pool = this.cfg.featureIndices.slice()
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.cfg.rng() * (i + 1))
      const tmp = pool[i]
      pool[i] = pool[j]
      pool[j] = tmp
    }
    return pool.slice(0, n)
  }

  private buildTree(samples: TrainingSample[], depth: number): TreeNode {
    const node = new TreeNode()
    node.nSamples = samples.length

    const stopping =
      depth >= this.cfg.maxDepth ||
      samples.length < this.cfg.minSamplesSplit

    if (stopping || this.isPure(samples)) {
      this.makeLeaf(node, samples)
      return node
    }

    node.impurity = this.impurity(samples)
    const totalFeatures = samples[0].features.length
    const featureSubset = this.selectFeatureSubset(totalFeatures)

    let bestGain = 0
    let bestFeature = -1
    let bestThreshold = 0

    for (const f of featureSubset) {
      const values = samples.map(s => s.features[f]).sort((a, b) => a - b)
      for (let k = 0; k < values.length - 1; k++) {
        if (values[k] === values[k + 1]) continue
        const threshold = (values[k] + values[k + 1]) / 2
        let nLeft = 0
        for (let i = 0; i < samples.length; i++) {
          if (samples[i].features[f] <= threshold) nLeft++
        }
        const nRight = samples.length - nLeft
        // minSamplesLeaf réellement appliqué
        if (nLeft < this.cfg.minSamplesLeaf || nRight < this.cfg.minSamplesLeaf) continue

        const left: TrainingSample[] = []
        const right: TrainingSample[] = []
        for (let i = 0; i < samples.length; i++) {
          if (samples[i].features[f] <= threshold) left.push(samples[i])
          else right.push(samples[i])
        }
        const gain = this.impurityGain(samples, left, right, node.impurity)
        if (gain > bestGain + 1e-12) {
          bestGain = gain
          bestFeature = f
          bestThreshold = threshold
        }
      }
    }

    if (bestFeature === -1) {
      this.makeLeaf(node, samples)
      return node
    }

    // Importance MDI : baisse d'impureté pondérée par la part d'échantillons du nœud
    this.featureImportance[bestFeature] += (node.nSamples / this.totalN) * bestGain

    const leftSamples: TrainingSample[] = []
    const rightSamples: TrainingSample[] = []
    for (const sample of samples) {
      if (sample.features[bestFeature] <= bestThreshold) leftSamples.push(sample)
      else rightSamples.push(sample)
    }

    node.isLeaf = false
    node.featureIndex = bestFeature
    node.threshold = bestThreshold
    node.left = this.buildTree(leftSamples, depth + 1)
    node.right = this.buildTree(rightSamples, depth + 1)
    return node
  }

  private makeLeaf(node: TreeNode, samples: TrainingSample[]): void {
    if (this.cfg.taskType === 'classification') {
      const counts = new Array(this.cfg.nClasses).fill(0)
      for (const s of samples) {
        const idx = this.labelToIndex(s.label)
        if (idx >= 0) counts[idx]++
      }
      const total = counts.reduce((a, b) => a + b, 0) || 1
      node.proba = counts.map(c => c / total)
      let best = 0
      for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i
      node.value = best
      node.impurity = giniFromCounts(counts)
    } else {
      node.value = mean(samples.map(s => Number(s.label)))
      node.proba = []
      node.impurity = variance(samples.map(s => Number(s.label)))
    }
  }

  private labelToIndex(label: string | number): number {
    // Les labels de classification sont mappés en amont sur des indices numériques.
    const idx = typeof label === 'number' ? label : Number(label)
    return Number.isInteger(idx) ? idx : -1
  }

  private isPure(samples: TrainingSample[]): boolean {
    const first = samples[0].label
    return samples.every(s => s.label === first)
  }

  private impurity(samples: TrainingSample[]): number {
    if (this.cfg.taskType === 'classification') {
      const counts = new Array(this.cfg.nClasses).fill(0)
      for (const s of samples) {
        const idx = this.labelToIndex(s.label)
        if (idx >= 0) counts[idx]++
      }
      return giniFromCounts(counts)
    }
    return variance(samples.map(s => Number(s.label)))
  }

  private impurityGain(
    parent: TrainingSample[],
    left: TrainingSample[],
    right: TrainingSample[],
    parentImpurity: number,
  ): number {
    const p = parent.length || 1
    const weighted =
      (left.length / p) * this.impurity(left) +
      (right.length / p) * this.impurity(right)
    return parentImpurity - weighted
  }

  predictValue(features: number[]): number {
    let node = this.root
    while (node && !node.isLeaf) {
      node = features[node.featureIndex] <= node.threshold ? node.left : node.right
    }
    return node ? node.value : 0
  }

  predictProbas(features: number[], nClasses: number): number[] {
    let node = this.root
    while (node && !node.isLeaf) {
      node = features[node.featureIndex] <= node.threshold ? node.left : node.right
    }
    const out = new Array(nClasses).fill(0)
    if (node && node.proba.length) {
      for (let i = 0; i < nClasses; i++) out[i] = node.proba[i] ?? 0
    }
    return out
  }

  getPathLength(features: number[]): number {
    let node = this.root
    let depth = 0
    while (node && !node.isLeaf) {
      depth++
      node = features[node.featureIndex] <= node.threshold ? node.left : node.right
    }
    return depth
  }

  serialize(): SerializedNode | null {
    return this.root ? serializeNode(this.root) : null
  }

  static fromSerialized(data: SerializedNode | null): TreeNode | null {
    return data ? deserializeNode(data) : null
  }
}

// ============================================================
// HELPERS PURS
// ============================================================

function giniFromCounts(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let sumSq = 0
  for (const c of counts) {
    const p = c / total
    sumSq += p * p
  }
  return 1 - sumSq
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function variance(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length
}

interface SerializedNode {
  isLeaf: boolean
  featureIndex?: number
  threshold?: number
  value: number
  proba?: number[]
  left?: SerializedNode
  right?: SerializedNode
}

function serializeNode(node: TreeNode): SerializedNode {
  if (node.isLeaf) {
    return { isLeaf: true, value: node.value, proba: node.proba }
  }
  return {
    isLeaf: false,
    featureIndex: node.featureIndex,
    threshold: node.threshold,
    value: node.value,
    left: node.left ? serializeNode(node.left) : undefined,
    right: node.right ? serializeNode(node.right) : undefined,
  }
}

function deserializeNode(data: SerializedNode): TreeNode {
  const node = new TreeNode()
  node.isLeaf = data.isLeaf
  node.value = data.value
  node.proba = data.proba ?? []
  if (!data.isLeaf) {
    node.featureIndex = data.featureIndex ?? -1
    node.threshold = data.threshold ?? 0
    node.left = data.left ? deserializeNode(data.left) : null
    node.right = data.right ? deserializeNode(data.right) : null
  }
  return node
}

// ============================================================
// RANDOM FOREST
// ============================================================

export class RandomForestModel {
  private config: RandomForestConfig
  private trees: DecisionTree[] = []
  private trained = false
  private featureNames: string[] = []
  private classOrder: string[] = []
  private labelToIdx = new Map<string, number>()
  private taskType: TaskType = 'classification'
  private featureImportance: number[] = []

  constructor(config: Partial<RandomForestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // ENTRAÎNEMENT
  // ============================================================

  async train(
    samples: TrainingSample[],
    options?: { verbose?: boolean },
  ): Promise<{ accuracy: number; oobScore?: number }> {
    if (samples.length < 10) {
      throw new Error(`Pas assez d'échantillons pour l'entraînement. Minimum: 10, reçu: ${samples.length}`)
    }

    this.taskType = typeof samples[0].label === 'string' ? 'classification' : 'regression'
    const nFeatures = samples[0].features.length

    // Mapping des classes (classification) vers indices entiers
    if (this.taskType === 'classification') {
      this.classOrder = [...new Set(samples.map(s => String(s.label)))].sort()
      this.labelToIdx = new Map(this.classOrder.map((c, i) => [c, i]))
    } else {
      this.classOrder = []
      this.labelToIdx = new Map()
    }
    const nClasses = this.classOrder.length

    // Conversion des labels de classification en indices numériques (pour l'arbre)
    const encoded: TrainingSample[] = samples.map(s => ({
      features: s.features,
      label: this.taskType === 'classification' ? this.labelToIdx.get(String(s.label)) ?? 0 : s.label,
      weight: s.weight,
    }))

    const rng = mulberry32(this.config.seed ?? DEFAULT_CONFIG.seed ?? 42)
    const allFeatureIndices = Array.from({ length: nFeatures }, (_, i) => i)
    const sampleSize = Math.max(1, Math.floor(samples.length * this.config.sampleSize))

    this.trees = []
    this.featureImportance = new Array(nFeatures).fill(0)

    for (let t = 0; t < this.config.nTrees; t++) {
      const bootstrap = this.config.bootstrap
        ? this.bootstrapSample(encoded, sampleSize, rng)
        : encoded

      const tree = new DecisionTree({
        maxDepth: this.config.maxDepth,
        minSamplesSplit: this.config.minSamplesSplit,
        minSamplesLeaf: this.config.minSamplesLeaf,
        featureIndices: allFeatureIndices,
        maxFeatures: this.config.maxFeatures,
        taskType: this.taskType,
        nClasses: Math.max(1, nClasses),
        rng,
      })
      tree.train(bootstrap)
      this.trees.push(tree)

      for (let f = 0; f < nFeatures; f++) {
        this.featureImportance[f] += tree.featureImportance[f] ?? 0
      }

      if (options?.verbose && (t + 1) % 10 === 0) {
        console.log(`[RandomForest] Arbre ${t + 1}/${this.config.nTrees} entraîné`)
      }
    }

    // Importance moyenne sur les arbres, normalisée en pourcentage
    for (let f = 0; f < nFeatures; f++) this.featureImportance[f] /= this.trees.length
    const totalImportance = this.featureImportance.reduce((a, b) => a + b, 0)
    if (totalImportance > 0) {
      for (let f = 0; f < nFeatures; f++) this.featureImportance[f] = (this.featureImportance[f] / totalImportance) * 100
    }

    this.trained = true
    this.featureNames = Array.from({ length: nFeatures }, (_, i) => `feature_${i}`)

    return { accuracy: this.evaluate(samples), oobScore: undefined }
  }

  private bootstrapSample(
    samples: TrainingSample[],
    size: number,
    rng: () => number,
  ): TrainingSample[] {
    const out: TrainingSample[] = []
    for (let i = 0; i < size; i++) {
      out.push(samples[Math.floor(rng() * samples.length)])
    }
    return out
  }

  // ============================================================
  // PRÉDICTION
  // ============================================================

  predict(features: number[]): RandomForestPrediction {
    if (!this.trained || this.trees.length === 0) {
      return this.fallbackPrediction(features)
    }

    if (this.taskType === 'classification') {
      const nClasses = this.classOrder.length
      const agg = new Array(nClasses).fill(0)
      const votes: Record<string, number> = {}

      for (const tree of this.trees) {
        const proba = tree.predictProbas(features, nClasses)
        let best = 0
        for (let i = 0; i < nClasses; i++) {
          agg[i] += proba[i]
          if (proba[i] > proba[best]) best = i
        }
        const cls = this.classOrder[best]
        votes[cls] = (votes[cls] || 0) + 1
      }

      const probabilities: Record<string, number> = {}
      let bestIdx = 0
      for (let i = 0; i < nClasses; i++) {
        const p = agg[i] / this.trees.length
        probabilities[this.classOrder[i]] = p
        if (p > agg[bestIdx] / this.trees.length) bestIdx = i
      }

      return {
        prediction: this.classOrder[bestIdx],
        probabilities,
        confidence: Math.round((agg[bestIdx] / this.trees.length) * 100),
        treeVotes: votes,
      }
    }

    // Régression
    const preds = this.trees.map(t => t.predictValue(features))
    const prediction = mean(preds)
    const varianceTrees = variance(preds)
    return {
      prediction: Math.min(100, Math.max(0, Math.round(prediction))),
      confidence: Math.max(30, Math.min(95, Math.round(100 - varianceTrees))),
      treeVotes: {},
      anomalyScore: varianceTrees > 50 ? varianceTrees / 100 : undefined,
    }
  }

  private fallbackPrediction(features: number[]): RandomForestPrediction {
    if (this.taskType === 'classification') {
      const probs: Record<string, number> = {}
      const classes = this.classOrder.length > 0 ? this.classOrder : ['moyen']
      classes.forEach(c => { probs[c] = 1 / classes.length })
      return {
        prediction: classes[0],
        probabilities: probs,
        confidence: 50,
        treeVotes: {},
      }
    }
    const m = mean(features)
    return {
      prediction: Math.min(100, Math.max(0, Math.round(m))),
      confidence: 50,
      treeVotes: {},
    }
  }

  // ============================================================
  // ÉVALUATION
  // ============================================================

  evaluate(samples: TrainingSample[]): number {
    if (!this.trained) return 0
    let correct = 0
    for (const sample of samples) {
      const prediction = this.predict(sample.features)
      if (this.taskType === 'classification') {
        if (String(prediction.prediction) === String(sample.label)) correct++
      } else {
        if (Math.abs((prediction.prediction as number) - Number(sample.label)) <= 5) correct++
      }
    }
    return Math.round((correct / samples.length) * 100)
  }

  // ============================================================
  // DÉTECTION D'ANOMALIES (profondeur moyenne de chemin, style Isolation Forest)
  // ============================================================

  detectAnomaly(features: number[]): { isAnomaly: boolean; score: number; threshold: number } {
    if (!this.trained || this.trees.length === 0) {
      return { isAnomaly: false, score: 0, threshold: 0.7 }
    }
    const avgPath =
      this.trees.reduce((sum, t) => sum + t.getPathLength(features), 0) / this.trees.length
    const score = Math.min(1, 1 - Math.exp(-avgPath / 10))
    return { isAnomaly: score > 0.7, score, threshold: 0.7 }
  }

  // ============================================================
  // IMPORTANCE DES FEATURES
  // ============================================================

  getFeatureImportance(): Record<string, number> {
    if (!this.featureImportance.length) return {}
    const result: Record<string, number> = {}
    for (let i = 0; i < this.featureNames.length; i++) {
      result[this.featureNames[i]] = Math.round(this.featureImportance[i])
    }
    return result
  }

  // ============================================================
  // SAUVEGARDE ET CHARGEMENT
  // ============================================================

  exportModel(): string {
    return JSON.stringify({
      config: this.config,
      taskType: this.taskType,
      featureNames: this.featureNames,
      classOrder: this.classOrder,
      featureImportance: this.featureImportance,
      trees: this.trees.map(t => t.serialize()),
      trained: this.trained,
    })
  }

  importModel(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config ?? this.config
      this.taskType = data.taskType ?? 'classification'
      this.featureNames = data.featureNames ?? []
      this.classOrder = data.classOrder ?? []
      this.labelToIdx = new Map(this.classOrder.map((c: string, i: number) => [c, i]))
      this.featureImportance = data.featureImportance ?? []

      const roots = (data.trees ?? []).map((s: SerializedNode | null) => DecisionTree.fromSerialized(s))
      // Reconstuire les DecisionTree à partir des racines sérialisées
      this.trees = roots.map((root: TreeNode | null) => {
        const t = new DecisionTree({
          maxDepth: this.config.maxDepth,
          minSamplesSplit: this.config.minSamplesSplit,
          minSamplesLeaf: this.config.minSamplesLeaf,
          featureIndices: [],
          maxFeatures: this.config.maxFeatures,
          taskType: this.taskType,
          nClasses: Math.max(1, this.classOrder.length),
          rng: mulberry32(0),
        })
        t.root = root
        return t
      })
      this.trained = data.trained === true && this.trees.length > 0
      return true
    } catch (error) {
      console.error('[RandomForest] Erreur lors de l\'import:', error)
      return false
    }
  }

  isTrained(): boolean {
    return this.trained
  }

  reset(): void {
    this.trees = []
    this.trained = false
    this.classOrder = []
    this.labelToIdx.clear()
    this.featureImportance = []
  }

  getTreeCount(): number {
    return this.trees.length
  }
}

// ============================================================
// CLASSIFIEURS SPÉCIFIQUES POUR CHECKLIST
// ============================================================

export class ChecklistResultPredictor extends RandomForestModel {
  constructor() {
    super({
      nTrees: 50,
      maxDepth: 8,
      minSamplesSplit: 5,
      minSamplesLeaf: 2,
      maxFeatures: 'sqrt',
    })
  }

  async trainOnData(
    features: number[][],
    labels: ('SA' | 'NS' | 'NA' | 'NV')[],
  ): Promise<void> {
    const samples: TrainingSample[] = features.map((f, i) => ({ features: f, label: labels[i] }))
    await this.train(samples)
  }

  predictResult(features: number[]): {
    resultat: 'SA' | 'NS' | 'NA' | 'NV'
    confidence: number
    probabilities: Record<string, number>
  } {
    const result = this.predict(features)
    return {
      resultat: result.prediction as 'SA' | 'NS' | 'NA' | 'NV',
      confidence: result.confidence,
      probabilities: result.probabilities || {},
    }
  }

  detectAnomalyInChecklist(features: number[]): {
    isAnomaly: boolean
    confidence: number
    suggestion: string
  } {
    const anomaly = this.detectAnomaly(features)
    return {
      isAnomaly: anomaly.isAnomaly,
      confidence: Math.round((1 - anomaly.score) * 100),
      suggestion: anomaly.isAnomaly
        ? 'Réponse inhabituelle détectée - vérification manuelle recommandée'
        : 'Pattern conforme aux données historiques',
    }
  }
}

export class AnomalyDetector extends RandomForestModel {
  constructor() {
    super({
      nTrees: 30,
      maxDepth: 6,
      minSamplesSplit: 10,
      bootstrap: true,
      sampleSize: 0.8,
    })
  }

  async trainOnNormalData(features: number[][]): Promise<void> {
    const samples: TrainingSample[] = features.map(f => ({ features: f, label: 'normal' }))
    await this.train(samples)
  }

  detect(features: number[]): {
    niveau: 'normal' | 'suspect' | 'anormal'
    score: number
    justification: string
  } {
    const result = this.detectAnomaly(features)
    let niveau: 'normal' | 'suspect' | 'anormal'
    let justification: string
    if (result.score >= 0.8) {
      niveau = 'anormal'
      justification = 'Comportement très inhabituel - investigation requise'
    } else if (result.score >= 0.5) {
      niveau = 'suspect'
      justification = 'Comportement légèrement inhabituel - à surveiller'
    } else {
      niveau = 'normal'
      justification = 'Comportement conforme aux données historiques'
    }
    return { niveau, score: Math.round(result.score * 100), justification }
  }
}

// ============================================================
// SINGLETONS
// ============================================================

export const checklistPredictor = new ChecklistResultPredictor()
export const anomalyDetector = new AnomalyDetector()
