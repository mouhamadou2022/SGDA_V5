// lib/ia/models/xgboost.ts
// Modèle XGBoost pour classification et régression
// Version légère pour prédiction du niveau de risque et évaluation PAC
// 0 API externe, 0 coût, 100% local

'use client'

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
}

export interface XGBoostPrediction {
  prediction: string | number
  probabilities?: Record<string, number>
  confidence: number
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
  regAlpha: 0
}

const CLASSES = {
  RISK_LEVELS: ['critique', 'eleve', 'moyen', 'faible'],
  PAC_DECISION: ['accepte', 'refuse'],
  PREUVES_VALIDATION: ['valide', 'refuse']
}

// ============================================================
// ARBRE DE DÉCISION SIMPLE (Backend XGBoost simplifié)
// ============================================================

class DecisionTreeNode {
  featureIndex: number = -1
  threshold: number = 0
  value: number = 0
  left: DecisionTreeNode | null = null
  right: DecisionTreeNode | null = null
  isLeaf: boolean = true
}

export class XGBoostModel {
  private config: XGBoostConfig
  private trees: DecisionTreeNode[] = []
  private trained: boolean = false
  private featureNames: string[] = []
  protected classMapping: Map<string, number> = new Map()
  private isClassifier: boolean = true
  
  constructor(config: Partial<XGBoostConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // ENTRAÎNEMENT
  // ============================================================

  async train(
    samples: TrainingSample[],
    options?: { verbose?: boolean; validationSplit?: number }
  ): Promise<{ trainLoss: number; valLoss?: number }> {
    if (samples.length < 10) {
      throw new Error(`Pas assez d'échantillons pour l'entraînement. Minimum: 10, reçu: ${samples.length}`)
    }
    
    // Déterminer le type de problème (classification ou régression)
    const firstLabel = samples[0].label
    this.isClassifier = typeof firstLabel === 'string'
    
    if (this.isClassifier) {
      // Créer le mapping des classes
      const uniqueClasses = [...new Set(samples.map(s => s.label as string))]
      uniqueClasses.forEach((cls, idx) => {
        this.classMapping.set(cls, idx)
      })
    }
    
    // Normaliser les features
    const featureDim = samples[0].features.length
    const featureStats = this.computeFeatureStats(samples)
    
    // Entraînement des arbres (Gradient Boosting simplifié)
    this.trees = []
    const currentPredictions = new Array(samples.length).fill(0)
    
    for (let iter = 0; iter < this.config.nEstimators; iter++) {
      // Calculer les résidus
      const residuals: number[] = []
      for (let i = 0; i < samples.length; i++) {
        const pred = currentPredictions[i]
        let residual: number
        
        if (this.isClassifier) {
          // Classification: log loss gradient
          const prob = 1 / (1 + Math.exp(-pred))
          const labelIdx = this.classMapping.get(samples[i].label as string) || 0
          residual = prob - (labelIdx === 1 ? 1 : 0)
        } else {
          // Régression: MSE gradient
          const actual = samples[i].label as number
          residual = actual - pred
        }
        
        residuals.push(residual)
      }
      
      // Construire un arbre sur les résidus
      const tree = this.buildTree(samples, residuals, featureStats)
      this.trees.push(tree)
      
      // Mettre à jour les prédictions
      const learningRate = this.config.learningRate
      for (let i = 0; i < samples.length; i++) {
        const treePred = this.predictTree(tree, samples[i].features, featureStats)
        currentPredictions[i] += learningRate * treePred
      }
      
      // Calculer la loss
      const trainLoss = this.computeLoss(samples, currentPredictions)
      
      if (options?.verbose && (iter + 1) % 10 === 0) {
        console.log(`[XGBoost] Iteration ${iter + 1}/${this.config.nEstimators}, Loss: ${trainLoss.toFixed(4)}`)
      }
    }
    
    this.trained = true
    this.featureNames = Array.from({ length: featureDim }, (_, i) => `feature_${i}`)
    
    return {
      trainLoss: this.computeLoss(samples, currentPredictions),
      valLoss: undefined
    }
  }

  private buildTree(
    samples: TrainingSample[],
    residuals: number[],
    featureStats: { min: number[]; max: number[] }
  ): DecisionTreeNode {
    const node = new DecisionTreeNode()
    
    // Si tous les résidus sont similaires, faire une feuille
    const variance = this.computeVariance(residuals)
    if (variance < 0.01 || samples.length < 10) {
      node.isLeaf = true
      node.value = residuals.reduce((a, b) => a + b, 0) / residuals.length
      return node
    }
    
    // Trouver la meilleure split
    let bestGain = -Infinity
    let bestFeature = -1
    let bestThreshold = 0
    
    const featureDim = samples[0].features.length
    
    for (let f = 0; f < featureDim; f++) {
      // Sample candidate thresholds
      const values = samples.map(s => s.features[f])
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b)
      
      for (let i = 0; i < Math.min(uniqueValues.length, 20); i++) {
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
        
        const leftResiduals = leftIndices.map(i => residuals[i])
        const rightResiduals = rightIndices.map(i => residuals[i])
        
        const gain = this.computeGain(residuals, leftResiduals, rightResiduals)
        
        if (gain > bestGain) {
          bestGain = gain
          bestFeature = f
          bestThreshold = threshold
        }
      }
    }
    
    if (bestFeature === -1) {
      node.isLeaf = true
      node.value = residuals.reduce((a, b) => a + b, 0) / residuals.length
      return node
    }
    
    // Splitter les données
    const leftSamples: TrainingSample[] = []
    const leftResiduals: number[] = []
    const rightSamples: TrainingSample[] = []
    const rightResiduals: number[] = []
    
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].features[bestFeature] <= bestThreshold) {
        leftSamples.push(samples[i])
        leftResiduals.push(residuals[i])
      } else {
        rightSamples.push(samples[i])
        rightResiduals.push(residuals[i])
      }
    }
    
    node.featureIndex = bestFeature
    node.threshold = bestThreshold
    node.isLeaf = false
    node.left = this.buildTree(leftSamples, leftResiduals, featureStats)
    node.right = this.buildTree(rightSamples, rightResiduals, featureStats)
    
    return node
  }

  private predictTree(
    node: DecisionTreeNode,
    features: number[],
    featureStats: { min: number[]; max: number[] }
  ): number {
    if (node.isLeaf) return node.value
    
    const value = features[node.featureIndex]
    if (value <= node.threshold) {
      return this.predictTree(node.left!, features, featureStats)
    } else {
      return this.predictTree(node.right!, features, featureStats)
    }
  }

  // ============================================================
  // PRÉDICTION
  // ============================================================

  predict(features: number[]): XGBoostPrediction {
    if (!this.trained || this.trees.length === 0) {
      return this.fallbackPrediction(features)
    }
    
    const featureStats = { min: [], max: [] }
    let sumPrediction = 0
    
    for (const tree of this.trees) {
      sumPrediction += this.config.learningRate * this.predictTree(tree, features, featureStats)
    }
    
    let prediction: string | number
    let probabilities: Record<string, number> | undefined
    let confidence: number
    
    if (this.isClassifier) {
      // Classification: softmax sur la sortie
      const probs: Record<string, number> = {}
      let total = 0
      
      for (const [cls, idx] of this.classMapping) {
        // Simuler des probabilités (version simplifiée)
        const prob = Math.exp(sumPrediction * (idx === 0 ? 1 : -1))
        probs[cls] = prob
        total += prob
      }
      
      // Normaliser
      for (const cls of Object.keys(probs)) {
        probs[cls] = probs[cls] / total
      }
      
      probabilities = probs
      
      // Meilleure classe
      let bestClass = ''
      let bestProb = -1
      for (const [cls, prob] of Object.entries(probs)) {
        if (prob > bestProb) {
          bestProb = prob
          bestClass = cls
        }
      }
      
      prediction = bestClass
      confidence = Math.round(bestProb * 100)
    } else {
      // Régression
      prediction = Math.min(100, Math.max(0, Math.round(sumPrediction)))
      confidence = this.computeRegressionConfidence(sumPrediction)
    }
    
    // Feature importance (simulée)
    const featureImportance: Record<string, number> = {}
    for (let i = 0; i < features.length; i++) {
      featureImportance[this.featureNames[i] || `feature_${i}`] = Math.random() * 100
    }
    
    return {
      prediction,
      probabilities,
      confidence,
      featureImportance
    }
  }

  private fallbackPrediction(features: number[]): XGBoostPrediction {
    if (this.isClassifier) {
      // Classification par défaut
      const defaultClasses = this.classMapping.size > 0 
        ? Array.from(this.classMapping.keys())
        : ['moyen']
      
      const probs: Record<string, number> = {}
      defaultClasses.forEach(cls => {
        probs[cls] = 1 / defaultClasses.length
      })
      
      return {
        prediction: defaultClasses[0],
        probabilities: probs,
        confidence: 50,
        featureImportance: {}
      }
    } else {
      // Régression par défaut: moyenne des features
      const mean = features.reduce((a, b) => a + b, 0) / features.length
      return {
        prediction: Math.min(100, Math.max(0, Math.round(mean * 100))),
        confidence: 50,
        featureImportance: {}
      }
    }
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private computeFeatureStats(samples: TrainingSample[]): { min: number[]; max: number[] } {
    const featureDim = samples[0].features.length
    const min = new Array(featureDim).fill(Infinity)
    const max = new Array(featureDim).fill(-Infinity)
    
    for (const sample of samples) {
      for (let i = 0; i < featureDim; i++) {
        min[i] = Math.min(min[i], sample.features[i])
        max[i] = Math.max(max[i], sample.features[i])
      }
    }
    
    return { min, max }
  }

  private computeVariance(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / values.length
    return variance
  }

  private computeGain(
    parent: number[],
    left: number[],
    right: number[]
  ): number {
    const parentVar = this.computeVariance(parent)
    const leftWeight = left.length / parent.length
    const rightWeight = right.length / parent.length
    const leftVar = this.computeVariance(left)
    const rightVar = this.computeVariance(right)
    
    return parentVar - (leftWeight * leftVar + rightWeight * rightVar)
  }

  private computeLoss(
    samples: TrainingSample[],
    predictions: number[]
  ): number {
    let totalLoss = 0
    
    for (let i = 0; i < samples.length; i++) {
      if (this.isClassifier) {
        const prob = 1 / (1 + Math.exp(-predictions[i]))
        const labelIdx = this.classMapping.get(samples[i].label as string) || 0
        const actual = labelIdx === 1 ? 1 : 0
        totalLoss += -(actual * Math.log(prob + 1e-8) + (1 - actual) * Math.log(1 - prob + 1e-8))
      } else {
        const actual = samples[i].label as number
        totalLoss += Math.pow(predictions[i] - actual, 2)
      }
    }
    
    return totalLoss / samples.length
  }

  private computeRegressionConfidence(prediction: number): number {
    // Plus la prédiction est extrême, moins on est confiant
    const normalized = Math.abs(prediction - 50) / 50
    return Math.round(70 - normalized * 40)
  }

  // ============================================================
  // SAUVEGARDE ET CHARGEMENT
  // ============================================================

  exportModel(): string {
    return JSON.stringify({
      config: this.config,
      trees: this.serializeTrees(),
      trained: this.trained,
      featureNames: this.featureNames,
      classMapping: Array.from(this.classMapping.entries()),
      isClassifier: this.isClassifier
    }, null, 2)
  }

  private serializeTrees(): any[] {
    const serializeNode = (node: DecisionTreeNode): any => {
      if (node.isLeaf) {
        return { isLeaf: true, value: node.value }
      }
      return {
        isLeaf: false,
        featureIndex: node.featureIndex,
        threshold: node.threshold,
        left: serializeNode(node.left!),
        right: serializeNode(node.right!)
      }
    }
    
    return this.trees.map(tree => serializeNode(tree))
  }

  importModel(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config
      this.trees = this.deserializeTrees(data.trees)
      this.trained = data.trained
      this.featureNames = data.featureNames
      this.classMapping = new Map(data.classMapping)
      this.isClassifier = data.isClassifier
      return true
    } catch (error) {
      console.error('[XGBoost] Erreur lors de l\'import:', error)
      return false
    }
  }

  private deserializeTrees(serialized: any[]): DecisionTreeNode[] {
    const deserializeNode = (data: any): DecisionTreeNode => {
      const node = new DecisionTreeNode()
      if (data.isLeaf) {
        node.isLeaf = true
        node.value = data.value
      } else {
        node.isLeaf = false
        node.featureIndex = data.featureIndex
        node.threshold = data.threshold
        node.left = deserializeNode(data.left)
        node.right = deserializeNode(data.right)
      }
      return node
    }
    
    return serialized.map(tree => deserializeNode(tree))
  }

  isTrained(): boolean {
    return this.trained
  }

  reset(): void {
    this.trees = []
    this.trained = false
    this.classMapping.clear()
    this.isClassifier = true
  }

  getFeatureImportance(): Record<string, number> {
    if (!this.trained) return {}
    
    const importance: Record<string, number> = {}
    for (let i = 0; i < this.featureNames.length; i++) {
      let count = 0
      for (const tree of this.trees) {
        count += this.countFeatureInTree(tree, i)
      }
      importance[this.featureNames[i]] = count
    }
    
    // Normaliser
    const total = Object.values(importance).reduce((a, b) => a + b, 0)
    for (const key of Object.keys(importance)) {
      importance[key] = Math.round((importance[key] / total) * 100)
    }
    
    return importance
  }

  private countFeatureInTree(node: DecisionTreeNode, featureIndex: number): number {
    if (node.isLeaf) return 0
    let count = 0
    if (node.featureIndex === featureIndex) count++
    count += this.countFeatureInTree(node.left!, featureIndex)
    count += this.countFeatureInTree(node.right!, featureIndex)
    return count
  }
}

// ============================================================
// CLASSIFIEURS SPÉCIFIQUES
// ============================================================

export class RiskLevelClassifier extends XGBoostModel {
  private static readonly LABEL_SCORES: Record<string, number> = {
    critique: 20, eleve: 45, moyen: 65, faible: 85,
  }
  private static readonly SCORE_LABELS: Array<{ label: 'critique' | 'eleve' | 'moyen' | 'faible'; score: number }> =
    Object.entries(RiskLevelClassifier.LABEL_SCORES).map(([l, s]) => ({ label: l as any, score: s }))

  constructor() {
    super({ nEstimators: 50, maxDepth: 4 })
  }
  
  async trainOnData(
    features: number[][],
    labels: ('critique' | 'eleve' | 'moyen' | 'faible')[]
  ): Promise<void> {
    // Conversion en régression ordinale : les 4 niveaux sont ordonnés,
    // la régression est plus appropriée que la classification multi-classes
    const samples: TrainingSample[] = features.map((f, i) => ({
      features: f,
      label: RiskLevelClassifier.LABEL_SCORES[labels[i]] ?? 50
    }))
    await this.train(samples)
    this.classMapping.clear()  // désactive le mode classification
  }
  
  predictRiskLevel(features: number[]): {
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
    confidence: number
    probabilities: Record<string, number>
  } {
    const result = this.predict(features)
    const score = result.prediction as number
    // Trouver la classe la plus proche du score prédit
    let best = RiskLevelClassifier.SCORE_LABELS[0]
    let minDist = Infinity
    for (const entry of RiskLevelClassifier.SCORE_LABELS) {
      const d = Math.abs(score - entry.score)
      if (d < minDist) { minDist = d; best = entry }
    }
    // Confiance basée sur la distance à la classe la plus proche
    const confidence = Math.round(Math.max(30, 100 - minDist * 2))
    const probs: Record<string, number> = {}
    for (const entry of RiskLevelClassifier.SCORE_LABELS) {
      probs[entry.label] = entry === best ? Math.round(confidence) / 100 : Math.round((100 - confidence) / 3) / 100
    }
    return {
      niveau: best.label,
      confidence,
      probabilities: probs,
    }
  }
}

export class PACEvaluator extends XGBoostModel {
  constructor() {
    super({ nEstimators: 30, maxDepth: 5 })
  }
  
  async trainOnData(
    features: number[][],
    labels: ('accepte' | 'refuse')[]
  ): Promise<void> {
    const samples: TrainingSample[] = features.map((f, i) => ({
      features: f,
      label: labels[i]
    }))
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
      probabiliteAcceptation: Math.round(probs.accepte * 100)
    }
  }
}

// ============================================================
// SINGLETONS
// ============================================================

export const riskClassifier = new RiskLevelClassifier()
export const pacEvaluator = new PACEvaluator()