// lib/ia/models/ensemble.ts
// Modèle Ensemble - Combinaison de tous les modèles pour des prédictions robustes
// Voting, stacking, weighted averaging entre tous les modèles
// 0 API externe, 0 coût, 100% local

'use client'

import { ScoreHistoryPoint } from '@/lib/store'
import { hawkesModel, hawkesMultivariateModel } from './hawkes'
import { cusumModel } from './cusum'
import { bayesianDynamicModel } from './bayesianDynamic'
import { quantileModel } from './quantile'
import { lstmModel } from './lstm'
import { riskClassifier } from './xgboost'
import { checklistPredictor } from './randomForest'
import { conformalModel } from './conformal'
import { temporalModel } from './temporal'
import { garchModel } from './garch'

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

const MODEL_NAMES = ['hawkes', 'lstm', 'quantile', 'bayesian', 'temporal', 'garch', 'xgboost']

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
    
    // 1. Hawkes (contagion) — utilise calibrate + intensité de base
    try {
      const ecartsProxy = historique.map(h => ({ createdAt: h.date }))
      const calibrated = hawkesModel.calibrate({ ecarts: ecartsProxy })
      // Intensité basale comme proxy de risque Hawkes normalisé (0–100)
      const hawkesPred = Math.min(100, Math.max(0, Math.round((calibrated.mu / 0.5) * 50)))
      predictions.push({ name: 'hawkes', prediction: hawkesPred || 50, confidence: 70 })
    } catch (e) {
      predictions.push({ name: 'hawkes', prediction: 50, confidence: 30 })
    }
    
    // 2. LSTM (deep learning)
    try {
      await lstmModel.train(historique, { epochs: 10, verbose: false })
      const lstmPred = lstmModel.predict(historique, horizon)
      predictions.push({ name: 'lstm', prediction: lstmPred.predictions[0], confidence: lstmPred.confidence[0] })
    } catch (e) {
      predictions.push({ name: 'lstm', prediction: 50, confidence: 30 })
    }
    
    // 3. Quantile regression
    try {
      const scores = historique.map(h => h.score)
      const quantiles = quantileModel.predictQuantiles(scores, horizon)
      predictions.push({ name: 'quantile', prediction: quantiles.q50, confidence: 75 })
    } catch (e) {
      predictions.push({ name: 'quantile', prediction: 50, confidence: 30 })
    }
    
    // 4. Bayesian dynamique
    try {
      const lastScores = historique.slice(-6).map(h => h.score)
      const mean = lastScores.reduce((a, b) => a + b, 0) / lastScores.length
      const prior = mean / 100
      const likelihoods = [0.5]
      const { posterior } = bayesianDynamicModel.computePosterior(prior, likelihoods)
      const bayesianPred = posterior * 100
      predictions.push({ name: 'bayesian', prediction: bayesianPred, confidence: 65 })
    } catch (e) {
      predictions.push({ name: 'bayesian', prediction: 50, confidence: 30 })
    }
    
    // 5. Temporal (saisonnalité)
    try {
      const forecast = temporalModel.forecast(historique, horizon, true)
      predictions.push({ name: 'temporal', prediction: forecast[0]?.value || 50, confidence: 70 })
    } catch (e) {
      predictions.push({ name: 'temporal', prediction: 50, confidence: 30 })
    }
    
    // 6. GARCH (volatilité)
    try {
      const scores = historique.map(h => h.score)
      const returns = this.scoresToReturns(scores)
      const garchResult = garchModel.fit(returns)
      const lastVol = garchResult.volatility[garchResult.volatility.length - 1]
      const garchPred = Math.max(0, Math.min(100, 50 + (lastVol - 10) * 2))
      predictions.push({ name: 'garch', prediction: garchPred, confidence: 65 })
    } catch (e) {
      predictions.push({ name: 'garch', prediction: 50, confidence: 30 })
    }
    
    // 7. XGBoost
    try {
      const scores = historique.map(h => h.score)
      const features = this.extractFeatures(historique)
      const result = riskClassifier.predict(features)
      const xgboostPred = typeof result.prediction === 'number' 
        ? result.prediction 
        : this.classToScore(result.prediction as string)
      predictions.push({ name: 'xgboost', prediction: xgboostPred, confidence: result.confidence })
    } catch (e) {
      predictions.push({ name: 'xgboost', prediction: 50, confidence: 30 })
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
      confidence: Math.round(100 - stdDev),
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