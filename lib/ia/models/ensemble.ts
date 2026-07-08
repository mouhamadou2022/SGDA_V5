// lib/ia/models/ensemble.ts
// Modèle Ensemble - Combinaison de tous les modèles pour des prédictions robustes
// Voting, stacking, weighted averaging entre tous les modèles
// 0 API externe, 0 coût, 100% local

'use client'

import { ScoreHistoryPoint } from '@/lib/store'
import { bayesianDynamicModel } from './bayesianDynamic'
import { lstmModel } from './lstm'
import { riskClassifier } from './xgboost'
import { checklistPredictor } from './randomForest'

// ============================================================
// TYPES
// ============================================================

export interface EnsemblePrediction {
  point: number
  confidence: number
  interval: { lower: number; upper: number }
  modelContributions: {
    name: string
    weight: number
    prediction: number
  }[]
  metadata: {
    nModels: number
    consensus: 'fort' | 'modere' | 'faible'
    variance: number
  }
}

export interface EnsembleConfig {
  weights: Record<string, number>
  minConfidence: number
  useDynamicWeights: boolean
  learningRate: number
  fallbackToMedian: boolean
}

export interface ModelPerformance {
  name: string
  mae: number
  rmse: number
  weight: number
  lastUsed: string
  nPredictions: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: EnsembleConfig = {
  weights: {
    hawkes: 0.15,
    lstm: 0.20,
    quantile: 0.15,
    bayesian: 0.15,
    temporal: 0.15,
    garch: 0.10,
    xgboost: 0.10
  },
  minConfidence: 30,
  useDynamicWeights: true,
  learningRate: 0.05,
  fallbackToMedian: true
}

const MODEL_NAMES = ['lstm', 'bayesian', 'xgboost']

// ============================================================
// MODÈLE ENSEMBLE
// ============================================================

export class EnsembleModel {
  private config: EnsembleConfig
  private performances: Map<string, ModelPerformance> = new Map()
  private predictionHistory: { timestamp: string; actual: number; predictions: Record<string, number> }[] = []
  private lastUpdate: Date | null = null

  constructor(config: Partial<EnsembleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initPerformances()
  }

  private initPerformances(): void {
    for (const name of MODEL_NAMES) {
      this.performances.set(name, {
        name,
        mae: 0,
        rmse: 0,
        weight: this.config.weights[name] || 0.1,
        lastUsed: new Date().toISOString(),
        nPredictions: 0
      })
    }
  }

  // ============================================================
  // PRÉDICTION ENSEMBLE
  // ============================================================

  /**
   * Prédiction combinant tous les modèles
   */
  async predict(
    historique: ScoreHistoryPoint[],
    horizon: number = 1,
    options?: { useAllModels?: boolean; customWeights?: Record<string, number> }
  ): Promise<EnsemblePrediction> {
    const predictions: { name: string; prediction: number; confidence?: number }[] = []

    // 1. LSTM (deep learning — nécessite ≥30 points pour être fiable)
    if (historique.length >= 30) {
      try {
        if (!lstmModel.isTrained()) {
          await lstmModel.train(historique, { epochs: 10, verbose: false })
        }
        const lstmPred = lstmModel.predict(historique, horizon)
        predictions.push({ name: 'lstm', prediction: lstmPred.predictions[0], confidence: Math.min(80, lstmPred.confidence ? lstmPred.confidence[0] : 50) })
      } catch { predictions.push({ name: 'lstm', prediction: 50, confidence: 30 }) }
    }

    // 2. Bayesian dynamique (toujours dispo, s'améliore avec les données)
    try {
      const lastScores = historique.slice(-6).map(h => h.score)
      const mean = lastScores.reduce((a, b) => a + b, 0) / lastScores.length
      const prior = mean / 100

      // Vraisemblance informée par la tendance récente et la volatilité
      // (au lieu du 0.5 neutre qui diluait le prior)
      const recent = historique.slice(-3).map(h => h.score)
      const trend = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0
      const v = lastScores
      const vMean = v.reduce((a, b) => a + b, 0) / v.length
      const variance = v.reduce((sq, val) => sq + (val - vMean) ** 2, 0) / v.length
      const vol = Math.sqrt(variance)
      // Tendance négative = risque qui augmente → likelihood > 0.5
      let lh = 0.5 + (trend < -2 ? 0.25 : trend > 2 ? -0.2 : 0)
      // Volatilité élevée → on se rapproche de 0.5 (incertitude)
      const volWeight = Math.min(0.3, vol / 100)
      lh = lh * (1 - volWeight) + 0.5 * volWeight
      const likelihood = Math.min(0.9, Math.max(0.1, lh))

      const { posterior } = bayesianDynamicModel.computePosterior(prior, [likelihood])
      predictions.push({ name: 'bayesian', prediction: posterior * 100, confidence: 65 })
    } catch { predictions.push({ name: 'bayesian', prediction: 50, confidence: 30 }) }

    // 3. XGBoost (nécessite ≥50 échantillons labellisés)
    try {
      const features = this.extractFeatures(historique)
      if (historique.length >= 20) {
        const result = riskClassifier.predict(features)
        const xgboostPred = typeof result.prediction === 'number' ? result.prediction : this.classToScore(result.prediction as string)
        predictions.push({ name: 'xgboost', prediction: xgboostPred, confidence: result.confidence })
      }
    } catch { /* XGBoost indisponible */ }

    // 4. Random Forest (checklist predictions — utilisé ailleurs)
    // Le RF est utilisé séparément via checklistPredictor, pas dans l'ensemble de score

    if (predictions.length < 2) {
      // Fallback : pas assez de modèles disponibles
      const avg = historique.length > 0 ? historique.reduce((s, h) => s + h.score, 0) / historique.length : 50
      return {
        point: avg, confidence: 30,
        interval: { lower: Math.max(0, avg - 15), upper: Math.min(100, avg + 15) },
        modelContributions: [{ name: 'fallback', weight: 1, prediction: avg }],
        metadata: { nModels: 0, consensus: 'faible', variance: 0 }
      }
    }
    // Calcul des poids
    const weights = this.getWeights(predictions, options?.customWeights)
    
    // Prédiction pondérée
    let totalWeight = 0
    let weightedSum = 0
    const contributions: { name: string; weight: number; prediction: number }[] = []
    
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i]
      const weight = weights[i]
      if (pred.confidence && pred.confidence >= this.config.minConfidence) {
        weightedSum += pred.prediction * weight
        totalWeight += weight
        contributions.push({
          name: pred.name,
          weight: Math.round(weight * 100) / 100,
          prediction: Math.round(pred.prediction)
        })
      }
    }
    
    let finalPrediction = totalWeight > 0 ? weightedSum / totalWeight : 50
    
    // Fallback sur la médiane si nécessaire
    if (this.config.fallbackToMedian && (totalWeight === 0 || finalPrediction < 0 || finalPrediction > 100)) {
      const validPredictions = predictions
        .filter(p => p.confidence && p.confidence >= this.config.minConfidence)
        .map(p => p.prediction)
      if (validPredictions.length > 0) {
        validPredictions.sort((a, b) => a - b)
        const mid = Math.floor(validPredictions.length / 2)
        finalPrediction = validPredictions.length % 2 === 0
          ? (validPredictions[mid - 1] + validPredictions[mid]) / 2
          : validPredictions[mid]
      }
    }
    
    finalPrediction = Math.min(100, Math.max(0, Math.round(finalPrediction)))
    
    // Intervalle de confiance (basé sur la variance des prédictions)
    const allPredictions = predictions.map(p => p.prediction)
    const variance = this.variance(allPredictions)
    const stdDev = Math.sqrt(variance)
    const margin = Math.min(25, stdDev * 1.5)
    
    // Calcul du consensus
    const consensusScore = this.computeConsensus(predictions)
    let consensus: 'fort' | 'modere' | 'faible' = 'modere'
    if (consensusScore > 0.8) consensus = 'fort'
    else if (consensusScore < 0.5) consensus = 'faible'
    
    return {
      point: finalPrediction,
      confidence: Math.min(100, Math.max(0, Math.round(100 - stdDev))),
      interval: {
        lower: Math.max(0, finalPrediction - margin),
        upper: Math.min(100, finalPrediction + margin)
      },
      modelContributions: contributions.sort((a, b) => b.weight - a.weight),
      metadata: {
        nModels: predictions.length,
        consensus,
        variance: Math.round(variance)
      }
    }
  }

  private getWeights(
    predictions: { name: string; prediction: number; confidence?: number }[],
    customWeights?: Record<string, number>
  ): number[] {
    const weights: number[] = []
    let total = 0
    
    for (let i = 0; i < predictions.length; i++) {
      const name = predictions[i].name
      let weight = 1.0
      
      if (customWeights && customWeights[name] !== undefined) {
        weight = customWeights[name]
      } else if (this.config.useDynamicWeights) {
        const perf = this.performances.get(name)
        if (perf && perf.nPredictions > 5) {
          // Poids basé sur la performance inverse de la MAE
          weight = Math.max(0.1, 1 / (perf.mae + 0.1))
        } else {
          weight = this.config.weights[name] || 0.1
        }
      } else {
        weight = this.config.weights[name] || 0.1
      }
      
      weights.push(weight)
      total += weight
    }
    
    // Normalisation
    return weights.map(w => w / total)
  }

  // ============================================================
  // APPRENTISSAGE ET MISE À JOUR
  // ============================================================

  /**
   * Enregistre la prédiction et la valeur réelle pour apprentissage
   */
  recordFeedback(
    predictions: Record<string, number>,
    actual: number,
    timestamp: string = new Date().toISOString()
  ): void {
    this.predictionHistory.push({
      timestamp,
      actual,
      predictions
    })
    
    // Garder seulement les dernières 100 observations
    if (this.predictionHistory.length > 100) {
      this.predictionHistory.shift()
    }
    
    // Mettre à jour les performances des modèles
    this.updatePerformances()
    
    this.lastUpdate = new Date()
  }

  private updatePerformances(): void {
    if (this.predictionHistory.length < 10) return
    
    for (const [name, perf] of this.performances) {
      let totalAbsError = 0
      let totalSqError = 0
      let count = 0
      
      for (const record of this.predictionHistory) {
        const predicted = record.predictions[name]
        if (predicted !== undefined) {
          const error = Math.abs(predicted - record.actual)
          totalAbsError += error
          totalSqError += error * error
          count++
        }
      }
      
      if (count > 0) {
        const mae = totalAbsError / count
        const rmse = Math.sqrt(totalSqError / count)
        
        perf.mae = Math.round(mae * 10) / 10
        perf.rmse = Math.round(rmse * 10) / 10
        perf.nPredictions = count
        perf.lastUsed = new Date().toISOString()
        
        // Mise à jour dynamique des poids
        if (this.config.useDynamicWeights) {
          const newWeight = Math.max(0.05, 1 / (mae + 0.1))
          perf.weight = newWeight
        }
        
        this.performances.set(name, perf)
      }
    }
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private scoresToReturns(scores: number[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < scores.length; i++) {
      // Vérifier les deux valeurs > 0 pour éviter log(0) = -Infinity
      if (scores[i - 1] > 0 && scores[i] > 0) {
        returns.push(Math.log(scores[i] / scores[i - 1]))
      } else {
        returns.push(0)
      }
    }
    return returns
  }

  private extractFeatures(historique: ScoreHistoryPoint[]): number[] {
    const scores = historique.map(h => h.score)
    const recentScores = scores.slice(-10)
    const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length
    const lastValue = scores[scores.length - 1]
    const trend = scores.length >= 2 ? scores[scores.length - 1] - scores[scores.length - 2] : 0
    const volatility = this.variance(recentScores)
    
    return [mean, lastValue, trend, volatility, scores.length]
  }

  private classToScore(className: string): number {
    if (className === 'critique') return 20
    if (className === 'eleve') return 45
    if (className === 'moyen') return 65
    if (className === 'faible') return 85
    return 50
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  }

  private computeConsensus(predictions: { name: string; prediction: number }[]): number {
    const values = predictions.map(p => p.prediction)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const stdDev = Math.sqrt(this.variance(values))
    
    // Plus l'écart-type est faible, plus le consensus est fort
    const normalizedStd = Math.min(1, stdDev / 30)
    return 1 - normalizedStd
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================

  getPerformances(): ModelPerformance[] {
    return Array.from(this.performances.values())
      .sort((a, b) => a.mae - b.mae)
  }

  getBestModel(): ModelPerformance | null {
    const performances = this.getPerformances()
    if (performances.length === 0) return null
    return performances.reduce((a, b) => a.mae < b.mae ? a : b)
  }

  updateConfig(config: Partial<EnsembleConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): EnsembleConfig {
    return { ...this.config }
  }

  getLastUpdate(): Date | null {
    return this.lastUpdate
  }

  reset(): void {
    this.predictionHistory = []
    this.initPerformances()
    this.lastUpdate = null
  }

  // ============================================================
  // SAUVEGARDE
  // ============================================================

  exportState(): string {
    return JSON.stringify({
      config: this.config,
      performances: Array.from(this.performances.entries()),
      predictionHistory: this.predictionHistory,
      lastUpdate: this.lastUpdate?.toISOString()
    }, null, 2)
  }

  importState(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config
      this.performances = new Map(data.performances)
      this.predictionHistory = data.predictionHistory
      this.lastUpdate = data.lastUpdate ? new Date(data.lastUpdate) : null
      return true
    } catch (error) {
      console.error('[EnsembleModel] Erreur lors de l\'import:', error)
      return false
    }
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const ensembleModel = new EnsembleModel()