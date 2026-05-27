// lib/ia/models/randomForest.ts
// Modèle Random Forest pour classification et régression
// Version légère pour prédiction de résultats de checklist et détection d'anomalies
// 0 API externe, 0 coût, 100% local

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
}

export interface RandomForestPrediction {
  prediction: string | number
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

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: RandomForestConfig = {
  nTrees: 100,
  maxDepth: 10,
  minSamplesSplit: 2,
  minSamplesLeaf: 1,
  maxFeatures: 'sqrt',
  bootstrap: true,
  sampleSize: 1.0
}

const RESULTS = ['SA', 'NS', 'NA', 'NV']

class DecisionTreeNode {
  isLeaf: boolean = false
  value: number = 0
  featureIndex: number = 0
  threshold: number = 0
  left: DecisionTreeNode | null = null
  right: DecisionTreeNode | null = null
  samples: number = 0
  impurity: number = 0
}

// ============================================================
// ARBRE DE DÉCISION POUR RANDOM FOREST
// ============================================================

class DecisionTree {
  private maxDepth: number
  private minSamplesSplit: number
  private minSamplesLeaf: number
  private maxFeatures: number | 'sqrt' | 'log2'
  private featureIndices: number[]
  root: DecisionTreeNode | null = null
  private isClassifier: boolean = true
  private classMapping: Map<string, number> = new Map()
  
  constructor(config: {
    maxDepth: number
    minSamplesSplit: number
    minSamplesLeaf: number
    featureIndices: number[]
    maxFeatures?: number | 'sqrt' | 'log2'
  }) {
    this.maxDepth = config.maxDepth
    this.minSamplesSplit = config.minSamplesSplit
    this.minSamplesLeaf = config.minSamplesLeaf
    this.featureIndices = config.featureIndices
    this.maxFeatures = config.maxFeatures ?? 'sqrt'
  }
  
  train(samples: TrainingSample[], isClassifier: boolean = true): void {
    this.isClassifier = isClassifier
    
    if (isClassifier) {
      const uniqueClasses = [...new Set(samples.map(s => s.label as string))]
      uniqueClasses.forEach((cls, idx) => {
        this.classMapping.set(cls, idx)
      })
    }
    
    this.root = this.buildTree(samples, 0)
  }
  
  private buildTree(samples: TrainingSample[], depth: number): DecisionTreeNode {
    const node = new DecisionTreeNode()
    
    // Vérifier les conditions d'arrêt
    if (depth >= this.maxDepth ||
        samples.length < this.minSamplesSplit ||
        this.isPure(samples)) {
      node.isLeaf = true
      node.value = this.getLeafValue(samples)
      return node
    }
    
    // Trouver la meilleure split
    let bestGain = -Infinity
    let bestFeature = -1
    let bestThreshold = 0
    
    const featuresCount = samples[0].features.length
    const featureSubset = this.selectFeatureSubset(featuresCount)
    
    for (const f of featureSubset) {
      const values = samples.map(s => s.features[f])
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b)
      
      for (let i = 0; i < Math.min(uniqueValues.length, 10); i++) {
        const threshold = uniqueValues[i]
        const leftIndices: number[] = []
        const rightIndices: number[] = []
        
        for (let j = 0; j < samples.length; j++) {
          if (samples[j].features[f] <= threshold) {
            leftIndices.push(j)
          } else {
            rightIndices.push(j)
          }
        }
        
        if (leftIndices.length === 0 || rightIndices.length === 0) continue
        
        const leftSamples = leftIndices.map(i => samples[i])
        const rightSamples = rightIndices.map(i => samples[i])
        
        const gain = this.computeGain(samples, leftSamples, rightSamples)
        
        if (gain > bestGain) {
          bestGain = gain
          bestFeature = f
          bestThreshold = threshold
        }
      }
    }
    
    if (bestFeature === -1) {
      node.isLeaf = true
      node.value = this.getLeafValue(samples)
      return node
    }
    
    // Splitter les données
    const leftSamples: TrainingSample[] = []
    const rightSamples: TrainingSample[] = []
    
    for (const sample of samples) {
      if (sample.features[bestFeature] <= bestThreshold) {
        leftSamples.push(sample)
      } else {
        rightSamples.push(sample)
      }
    }
    
    node.featureIndex = bestFeature
    node.threshold = bestThreshold
    node.isLeaf = false
    node.left = this.buildTree(leftSamples, depth + 1)
    node.right = this.buildTree(rightSamples, depth + 1)
    
    return node
  }
  
  private isPure(samples: TrainingSample[]): boolean {
    if (!this.isClassifier) return false
    
    const firstLabel = samples[0].label as string
    return samples.every(s => s.label === firstLabel)
  }
  
  private getLeafValue(samples: TrainingSample[]): number {
    if (this.isClassifier) {
      // Classification: mode des classes
      const counts: Record<string, number> = {}
      for (const sample of samples) {
        const label = sample.label as string
        counts[label] = (counts[label] || 0) + 1
      }
      
      let maxClass = ''
      let maxCount = 0
      for (const [cls, count] of Object.entries(counts)) {
        if (count > maxCount) {
          maxCount = count
          maxClass = cls
        }
      }
      
      return this.classMapping.get(maxClass) || 0
    } else {
      // Régression: moyenne
      return samples.reduce((sum, s) => sum + (s.label as number), 0) / samples.length
    }
  }
  
  private computeGain(
    parent: TrainingSample[],
    left: TrainingSample[],
    right: TrainingSample[]
  ): number {
    const parentImpurity = this.computeImpurity(parent)
    const leftWeight = left.length / parent.length
    const rightWeight = right.length / parent.length
    const leftImpurity = this.computeImpurity(left)
    const rightImpurity = this.computeImpurity(right)
    
    return parentImpurity - (leftWeight * leftImpurity + rightWeight * rightImpurity)
  }
  
  private computeImpurity(samples: TrainingSample[]): number {
    if (samples.length === 0) return 0
    
    if (this.isClassifier) {
      // Entropie pour classification
      const counts: Record<string, number> = {}
      for (const sample of samples) {
        const label = sample.label as string
        counts[label] = (counts[label] || 0) + 1
      }
      
      let entropy = 0
      for (const count of Object.values(counts)) {
        const p = count / samples.length
        if (p > 0) {
          entropy -= p * Math.log2(p)
        }
      }
      return entropy
    } else {
      // Variance pour régression
      const values = samples.map(s => s.label as number)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / values.length
      return variance
    }
  }
  
  private selectFeatureSubset(totalFeatures: number): number[] {
    let nFeatures: number
    
    if (typeof this.maxFeatures === 'number') {
      nFeatures = Math.min(totalFeatures, this.maxFeatures)
    } else if (this.maxFeatures === 'sqrt') {
      nFeatures = Math.floor(Math.sqrt(totalFeatures))
    } else {
      nFeatures = Math.floor(Math.log2(totalFeatures))
    }
    
    nFeatures = Math.max(1, nFeatures)
    
    // Mélanger et prendre les premiers nFeatures
    const shuffled = [...this.featureIndices]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    
    return shuffled.slice(0, nFeatures)
  }
  
  predict(features: number[]): number {
    return this.predictNode(this.root!, features)
  }
  
  private predictNode(node: DecisionTreeNode, features: number[]): number {
    if (node.isLeaf) return node.value
    
    if (features[node.featureIndex] <= node.threshold) {
      return this.predictNode(node.left!, features)
    } else {
      return this.predictNode(node.right!, features)
    }
  }
  
  predictProbas(features: number[], nClasses: number): number[] {
    // Pour la classification, retourner les probabilités (simulées)
    const prediction = this.predict(features)
    const probas = new Array(nClasses).fill(0)
    probas[Math.floor(prediction)] = 0.7
    // Distribuer le reste
    const remaining = 0.3 / (nClasses - 1)
    for (let i = 0; i < nClasses; i++) {
      if (i !== Math.floor(prediction)) {
        probas[i] = remaining
      }
    }
    return probas
  }
}

// ============================================================
// RANDOM FOREST
// ============================================================

export class RandomForestModel {
  private config: RandomForestConfig
  private trees: DecisionTree[] = []
  private trained: boolean = false
  private featureNames: string[] = []
  private classMapping: Map<string, number> = new Map()
  private isClassifier: boolean = true
  private featureImportance: number[] = []
  
  constructor(config: Partial<RandomForestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  // ============================================================
  // ENTRAÎNEMENT
  // ============================================================
  
  async train(
    samples: TrainingSample[],
    options?: { verbose?: boolean }
  ): Promise<{ accuracy: number; oobScore?: number }> {
    if (samples.length < 10) {
      throw new Error(`Pas assez d'échantillons pour l'entraînement. Minimum: 10, reçu: ${samples.length}`)
    }
    
    // Déterminer le type de problème
    const firstLabel = samples[0].label
    this.isClassifier = typeof firstLabel === 'string'
    
    if (this.isClassifier) {
      const uniqueClasses = [...new Set(samples.map(s => s.label as string))]
      uniqueClasses.forEach((cls, idx) => {
        this.classMapping.set(cls, idx)
      })
    }
    
    const nFeatures = samples[0].features.length
    const allFeatureIndices = Array.from({ length: nFeatures }, (_, i) => i)
    
    this.trees = []
    const sampleSize = Math.floor(samples.length * this.config.sampleSize)
    
    for (let i = 0; i < this.config.nTrees; i++) {
      // Bootstrap sampling
      let bootstrapSamples: TrainingSample[]
      if (this.config.bootstrap) {
        bootstrapSamples = this.bootstrapSample(samples, sampleSize)
      } else {
        bootstrapSamples = [...samples]
      }
      
      // Feature subset
      const featureIndices = [...allFeatureIndices]
      for (let j = featureIndices.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1))
        ;[featureIndices[j], featureIndices[k]] = [featureIndices[k], featureIndices[j]]
      }
      
      const tree = new DecisionTree({
        maxDepth: this.config.maxDepth,
        minSamplesSplit: this.config.minSamplesSplit,
        minSamplesLeaf: this.config.minSamplesLeaf,
        featureIndices
      })
      
      tree.train(bootstrapSamples, this.isClassifier)
      this.trees.push(tree)
      
      if (options?.verbose && (i + 1) % 10 === 0) {
        console.log(`[RandomForest] Arbre ${i + 1}/${this.config.nTrees} entraîné`)
      }
    }
    
    this.trained = true
    this.featureNames = Array.from({ length: nFeatures }, (_, i) => `feature_${i}`)
    
    // Calculer l'importance des features
    this.computeFeatureImportance()
    
    return {
      accuracy: this.evaluate(samples),
      oobScore: undefined
    }
  }
  
  private bootstrapSample(samples: TrainingSample[], size: number): TrainingSample[] {
    const result: TrainingSample[] = []
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(Math.random() * samples.length)
      result.push({ ...samples[idx] })
    }
    return result
  }
  
  // ============================================================
  // PRÉDICTION
  // ============================================================
  
  predict(features: number[]): RandomForestPrediction {
    if (!this.trained || this.trees.length === 0) {
      return this.fallbackPrediction(features)
    }
    
    if (this.isClassifier) {
      // Classification: vote majoritaire
      const votes: Record<string, number> = {}
      
      for (const tree of this.trees) {
        const prediction = tree.predict(features)
        let className = ''
        for (const [cls, idx] of this.classMapping) {
          if (idx === Math.floor(prediction)) {
            className = cls
            break
          }
        }
        votes[className] = (votes[className] || 0) + 1
      }
      
      // Meilleure classe
      let bestClass = ''
      let maxVotes = 0
      for (const [cls, count] of Object.entries(votes)) {
        if (count > maxVotes) {
          maxVotes = count
          bestClass = cls
        }
      }
      
      // Probabilités
      const probabilities: Record<string, number> = {}
      for (const [cls, count] of Object.entries(votes)) {
        probabilities[cls] = Math.round((count / this.trees.length) * 100)
      }
      
      const confidence = Math.round((maxVotes / this.trees.length) * 100)
      
      return {
        prediction: bestClass,
        probabilities,
        confidence,
        treeVotes: votes
      }
    } else {
      // Régression: moyenne des arbres
      let sum = 0
      for (const tree of this.trees) {
        sum += tree.predict(features)
      }
      const prediction = sum / this.trees.length
      const clampedPrediction = Math.min(100, Math.max(0, Math.round(prediction)))
      
      // Calcul de la variance comme mesure de confiance
      const predictions = this.trees.map(t => t.predict(features))
      const variance = this.computeVariance(predictions)
      const confidence = Math.max(30, Math.min(95, 100 - variance))
      
      return {
        prediction: clampedPrediction,
        confidence,
        treeVotes: {},
        anomalyScore: variance > 50 ? variance / 100 : undefined
      }
    }
  }
  
  private fallbackPrediction(features: number[]): RandomForestPrediction {
    if (this.isClassifier) {
      const defaultClass = this.classMapping.size > 0 
        ? Array.from(this.classMapping.keys())[0]
        : 'moyen'
      
      return {
        prediction: defaultClass,
        confidence: 50,
        treeVotes: {},
        anomalyScore: 0.5
      }
    } else {
      const mean = features.reduce((a, b) => a + b, 0) / features.length
      return {
        prediction: Math.min(100, Math.max(0, Math.round(mean * 100))),
        confidence: 50,
        treeVotes: {}
      }
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
      
      if (this.isClassifier) {
        if (prediction.prediction === sample.label) {
          correct++
        }
      } else {
        const error = Math.abs((prediction.prediction as number) - (sample.label as number))
        if (error <= 5) correct++
      }
    }
    
    return Math.round((correct / samples.length) * 100)
  }
  
  // ============================================================
  // DÉTECTION D'ANOMALIES
  // ============================================================
  
  detectAnomaly(features: number[]): {
    isAnomaly: boolean
    score: number
    threshold: number
  } {
    if (!this.trained) {
      return { isAnomaly: false, score: 0, threshold: 0.7 }
    }
    
    // Calculer la similarité avec les arbres
    let totalPathLength = 0
    
    for (const tree of this.trees) {
      totalPathLength += this.getPathLength(tree, features)
    }
    
    const avgPathLength = totalPathLength / this.trees.length
    const normalizedScore = 1 - Math.exp(-avgPathLength / 10)
    const anomalyScore = Math.min(1, normalizedScore)
    
    const threshold = 0.7
    const isAnomaly = anomalyScore > threshold
    
    return {
      isAnomaly,
      score: anomalyScore,
      threshold
    }
  }
  
  private getPathLength(tree: DecisionTree, features: number[]): number {
    let node = tree.root
    let depth = 0
    
    while (node && !node.isLeaf) {
      depth++
      if (features[node.featureIndex] <= node.threshold) {
        node = node.left
      } else {
        node = node.right
      }
    }
    
    return depth
  }
  
  // ============================================================
  // IMPORTANCE DES FEATURES
  // ============================================================
  
  private computeFeatureImportance(): void {
    if (!this.trained) return
    
    const nFeatures = this.featureNames.length
    this.featureImportance = new Array(nFeatures).fill(0)
    
    // Calculer l'importance par permutation (simplifié)
    for (let f = 0; f < nFeatures; f++) {
      let importance = 0
      for (const tree of this.trees) {
        importance += this.getNodeCountForFeature(tree, f)
      }
      this.featureImportance[f] = importance
    }
    
    // Normaliser
    const total = this.featureImportance.reduce((a, b) => a + b, 0)
    if (total > 0) {
      for (let i = 0; i < nFeatures; i++) {
        this.featureImportance[i] = (this.featureImportance[i] / total) * 100
      }
    }
  }
  
  private getNodeCountForFeature(tree: DecisionTree, featureIndex: number): number {
    let count = 0
    const stack = [tree.root]
    
    while (stack.length > 0) {
      const node = stack.pop()
      if (!node) continue
      if (!node.isLeaf) {
        if (node.featureIndex === featureIndex) count++
        stack.push(node.left, node.right)
      }
    }
    
    return count
  }
  
  getFeatureImportance(): Record<string, number> {
    if (!this.featureImportance.length) return {}
    
    const result: Record<string, number> = {}
    for (let i = 0; i < this.featureNames.length; i++) {
      result[this.featureNames[i]] = Math.round(this.featureImportance[i])
    }
    return result
  }
  
  // ============================================================
  // UTILITAIRES
  // ============================================================
  
  private computeVariance(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / values.length
    return variance
  }
  
  // ============================================================
  // SAUVEGARDE ET CHARGEMENT
  // ============================================================
  
  exportModel(): string {
    // Version simplifiée pour l'export
    return JSON.stringify({
      config: this.config,
      trained: this.trained,
      featureNames: this.featureNames,
      classMapping: Array.from(this.classMapping.entries()),
      isClassifier: this.isClassifier,
      featureImportance: this.featureImportance,
      nTrees: this.trees.length
    }, null, 2)
  }
  
  importModel(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config
      this.trained = data.trained
      this.featureNames = data.featureNames
      this.classMapping = new Map(data.classMapping)
      this.isClassifier = data.isClassifier
      this.featureImportance = data.featureImportance || []
      // Note: Les arbres ne sont pas restaurés, nécessite un ré-entraînement
      this.trees = []
      this.trained = false
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
    this.classMapping.clear()
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
      maxFeatures: 'sqrt'
    })
  }
  
  async trainOnData(
    features: number[][],
    labels: ('SA' | 'NS' | 'NA' | 'NV')[]
  ): Promise<void> {
    const samples: TrainingSample[] = features.map((f, i) => ({
      features: f,
      label: labels[i]
    }))
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
      probabilities: result.probabilities || {}
    }
  }
  
  detectAnomalyInChecklist(features: number[]): {
    isAnomaly: boolean
    confidence: number
    suggestion: string
  } {
    const anomaly = this.detectAnomaly(features)
    
    let suggestion = ''
    if (anomaly.isAnomaly) {
      suggestion = 'Réponse inhabituelle détectée - vérification manuelle recommandée'
    } else {
      suggestion = 'Pattern conforme aux données historiques'
    }
    
    return {
      isAnomaly: anomaly.isAnomaly,
      confidence: Math.round((1 - anomaly.score) * 100),
      suggestion
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
      sampleSize: 0.8
    })
  }
  
  async trainOnNormalData(features: number[][]): Promise<void> {
    const samples: TrainingSample[] = features.map((f, i) => ({
      features: f,
      label: 'normal'
    }))
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
    
    return {
      niveau,
      score: Math.round(result.score * 100),
      justification
    }
  }
}

// ============================================================
// SINGLETONS
// ============================================================

export const checklistPredictor = new ChecklistResultPredictor()
export const anomalyDetector = new AnomalyDetector()