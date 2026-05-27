// lib/ia/agents/learningAgent.ts
// Agent 7 - Apprentissage et Auto-calibration
// Entraînement périodique des modèles, calibration automatique, évaluation des performances
// Gère les feedbacks des inspecteurs pour améliorer les prédictions
// Supporte l'export/import des modèles entraînés
// 0 API externe, 0 coût, 100% local

'use client'

import { useAppStore, ProfilRisque, ChecklistItem, Ecart } from '@/lib/store'
import { checklistMemory } from '@/lib/checklistMemory'
import { riskAgent } from './riskAgent'
import { checklistAgent } from './checklistAgent'
import { ecartAgent } from './ecartAgent'
import { reportAgent } from './reportAgent'

// ============================================================
// TYPES
// ============================================================

export interface TrainingRequest {
  type: 'risk' | 'checklist' | 'ecart' | 'report' | 'all'
  forceFullTraining?: boolean
  useRecentDataOnly?: boolean
  recentMonths?: number
}

export interface TrainingReport {
  id: string
  type: string
  timestamp: string
  duration: number
  metrics: ModelMetrics
  improvements: {
    previousScore: number
    newScore: number
    delta: number
  }
  status: 'success' | 'partial' | 'failed'
  errors: string[]
}

export interface ModelMetrics {
  precision: number
  recall: number
  f1Score: number
  mae: number // Mean Absolute Error
  rmse: number // Root Mean Square Error
  r2: number // Coefficient de détermination
  calibrationError: number
  sampleSize: number
}

export interface Feedback {
  id: string
  type: 'prediction' | 'decision' | 'evaluation' | 'suggestion'
  content: any
  userAction: 'accept' | 'reject' | 'modify'
  userComment?: string
  timestamp: string
  userId: string
  aerodromeId?: string
}

export interface CalibrationRequest {
  modelType: 'risk' | 'checklist' | 'ecart' | 'report' | 'all'
  calibrationParams?: Partial<CalibrationParams>
  forceRecalibration?: boolean
}

export interface CalibrationParams {
  learningRate: number
  explorationRate: number
  confidenceThresholds: {
    tresBonne: number
    bonne: number
    moyenne: number
  }
  weightAdjustment: Record<string, number>
}

export interface PerformanceHistory {
  timestamp: string
  metrics: ModelMetrics
  modelType: string
  sampleSize: number
}

// ============================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================

const DEFAULT_CALIBRATION_PARAMS: CalibrationParams = {
  learningRate: 0.1,
  explorationRate: 0.2,
  confidenceThresholds: {
    tresBonne: 85,
    bonne: 70,
    moyenne: 50,
  },
  weightAdjustment: {
    historique_SA_consecutif: 40,
    historique_NS_consecutif: 35,
    taux_conformite_eleve: 25,
    taux_conformite_faible: 20,
    recence: 15,
    stabilite: 10,
    feedback_positif: 5,
  },
}

const PERFORMANCE_HISTORY_MAX_SIZE = 100

// ============================================================
// AGENT APPRENTISSAGE
// ============================================================

export class LearningAgent {
  private initialized: boolean = false
  private feedbacks: Feedback[] = []
  private performanceHistory: PerformanceHistory[] = []
  private currentCalibration: CalibrationParams = { ...DEFAULT_CALIBRATION_PARAMS }
  private lastTrainingDate: Map<string, Date> = new Map()
  private trainingInProgress: boolean = false

  async init(storeData: any): Promise<void> {
    // Charger les feedbacks sauvegardés
    await this.loadFeedbacks()
    
    // Charger l'historique des performances
    await this.loadPerformanceHistory()
    
    // Charger les paramètres de calibration
    await this.loadCalibrationParams()
    
    this.initialized = true
    console.log('[LearningAgent] Initialisé avec', this.feedbacks.length, 'feedbacks')
  }

  // ============================================================
  // ENREGISTREMENT DE FEEDBACK
  // ============================================================

  recordFeedback(feedback: Omit<Feedback, 'id' | 'timestamp'>): Feedback {
    const newFeedback: Feedback = {
      ...feedback,
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
    }
    
    this.feedbacks.push(newFeedback)
    this.saveFeedbacks()
    
    // Déclencher une calibration si nécessaire
    this.checkAndTriggerCalibration()
    
    return newFeedback
  }

  getFeedbacks(type?: string, aerodromeId?: string): Feedback[] {
    let filtered = this.feedbacks
    if (type) filtered = filtered.filter(f => f.type === type)
    if (aerodromeId) filtered = filtered.filter(f => f.aerodromeId === aerodromeId)
    return filtered
  }

  getFeedbackStats(): {
    total: number
    byType: Record<string, number>
    acceptanceRate: number
    recentCount: number
  } {
    const total = this.feedbacks.length
    const byType: Record<string, number> = {}
    let accepted = 0
    
    for (const fb of this.feedbacks) {
      byType[fb.type] = (byType[fb.type] || 0) + 1
      if (fb.userAction === 'accept') accepted++
    }
    
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentCount = this.feedbacks.filter(f => new Date(f.timestamp) >= thirtyDaysAgo).length
    
    return {
      total,
      byType,
      acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      recentCount,
    }
  }

  // ============================================================
  // ENTRAÎNEMENT DES MODÈLES
  // ============================================================

  async train(request: TrainingRequest): Promise<TrainingReport> {
    if (this.trainingInProgress) {
      throw new Error('Un entraînement est déjà en cours')
    }
    
    this.trainingInProgress = true
    const startTime = Date.now()
    const errors: string[] = []
    let status: 'success' | 'partial' | 'failed' = 'success'
    
    const modelsToTrain = request.type === 'all' 
      ? ['risk', 'checklist', 'ecart', 'report'] 
      : [request.type]
    
    let previousScore = 0
    let newScore = 0
    
    for (const modelType of modelsToTrain) {
      try {
        const result = await this.trainModel(modelType as any, request)
        previousScore += result.metrics.f1Score
        newScore += result.metrics.f1Score
      } catch (error) {
        errors.push(`Erreur lors de l'entraînement de ${modelType}: ${error}`)
        status = 'partial'
      }
    }
    
    const duration = Date.now() - startTime
    const lastTraining = this.lastTrainingDate.get(request.type) || new Date()
    
    // Calculer les métriques globales
    const metrics = await this.computeGlobalMetrics()
    
    const report: TrainingReport = {
      id: `train_${Date.now()}`,
      type: request.type,
      timestamp: new Date().toISOString(),
      duration,
      metrics,
      improvements: {
        previousScore: previousScore / modelsToTrain.length,
        newScore: newScore / modelsToTrain.length,
        delta: (newScore - previousScore) / modelsToTrain.length,
      },
      status,
      errors,
    }
    
    // Mettre à jour l'historique des performances
    this.performanceHistory.push({
      timestamp: report.timestamp,
      metrics,
      modelType: request.type,
      sampleSize: this.feedbacks.length,
    })
    
    while (this.performanceHistory.length > PERFORMANCE_HISTORY_MAX_SIZE) {
      this.performanceHistory.shift()
    }
    
    this.lastTrainingDate.set(request.type, new Date())
    await this.savePerformanceHistory()
    
    this.trainingInProgress = false
    return report
  }

  private async trainModel(
    modelType: 'risk' | 'checklist' | 'ecart' | 'report',
    request: TrainingRequest
  ): Promise<{ metrics: ModelMetrics }> {
    const store = useAppStore.getState()
    
    // Récupérer les données d'entraînement
    const feedbacks = this.getFeedbacks(modelType)
    const recentFeedbacks = request.useRecentDataOnly 
      ? feedbacks.filter(f => {
          const date = new Date(f.timestamp)
          const cutoff = new Date()
          cutoff.setMonth(cutoff.getMonth() - (request.recentMonths || 6))
          return date >= cutoff
        })
      : feedbacks
    
    if (recentFeedbacks.length < 10) {
      throw new Error(`Pas assez de données pour entraîner ${modelType} (${recentFeedbacks.length}/10)`)
    }
    
    // Simuler l'entraînement (en production, cela utiliserait des modèles ML réels)
    await this.simulateTraining(modelType, recentFeedbacks.length)
    
    // Calculer les métriques post-entraînement
    const metrics = await this.computeModelMetrics(modelType)
    
    // Mettre à jour la calibration si nécessaire
    await this.updateCalibrationFromTraining(modelType, metrics)
    
    return { metrics }
  }

  private async simulateTraining(modelType: string, sampleSize: number): Promise<void> {
    // Simuler un délai d'entraînement
    await new Promise(resolve => setTimeout(resolve, 500))
    console.log(`[LearningAgent] Entraînement de ${modelType} terminé sur ${sampleSize} échantillons`)
  }

  // ============================================================
  // CALIBRATION DES MODÈLES
  // ============================================================

  async calibrate(request: CalibrationRequest): Promise<CalibrationParams> {
    const newParams = { ...this.currentCalibration }

    // Ajuster les paramètres en fonction des performances
    // Pour 'all', on utilise les métriques globales agrégées
    const metrics = request.modelType === 'all'
      ? await this.computeGlobalMetrics()
      : await this.computeModelMetrics(request.modelType)
    
    // Ajuster le learning rate en fonction de l'erreur
    if (metrics.mae > 15) {
      newParams.learningRate = Math.min(0.3, this.currentCalibration.learningRate + 0.05)
    } else if (metrics.mae < 5) {
      newParams.learningRate = Math.max(0.05, this.currentCalibration.learningRate - 0.02)
    }
    
    // Ajuster les seuils de confiance
    if (metrics.calibrationError > 10) {
      newParams.confidenceThresholds.bonne = Math.min(90, this.currentCalibration.confidenceThresholds.bonne + 5)
    } else if (metrics.calibrationError < -10) {
      newParams.confidenceThresholds.bonne = Math.max(60, this.currentCalibration.confidenceThresholds.bonne - 5)
    }
    
    // Appliquer les paramètres personnalisés
    if (request.calibrationParams) {
      Object.assign(newParams, request.calibrationParams)
    }
    
    this.currentCalibration = newParams
    await this.saveCalibrationParams()
    
    console.log('[LearningAgent] Calibration terminée', this.currentCalibration)
    return this.currentCalibration
  }

  private async checkAndTriggerCalibration(): Promise<void> {
    const stats = this.getFeedbackStats()
    
    // Déclencher une calibration si:
    // - Plus de 50 nouveaux feedbacks depuis la dernière calibration
    // - Le taux d'acceptation est inférieur à 70%
    // - Dernière calibration datant de plus de 7 jours
    
    const lastCalibrationDate = await this.getLastCalibrationDate()
    const daysSinceLastCalibration = lastCalibrationDate 
      ? (Date.now() - lastCalibrationDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999
    
    const needsCalibration = 
      stats.recentCount > 50 ||
      stats.acceptanceRate < 70 ||
      daysSinceLastCalibration > 7
    
    if (needsCalibration && !this.trainingInProgress) {
      console.log('[LearningAgent] Déclenchement automatique de la calibration')
      await this.calibrate({ modelType: 'all' })
    }
  }

  private async getLastCalibrationDate(): Promise<Date | null> {
    const lastCalibration = this.performanceHistory.find(p => p.modelType === 'calibration')
    return lastCalibration ? new Date(lastCalibration.timestamp) : null
  }

  // ============================================================
  // ÉVALUATION DES PERFORMANCES
  // ============================================================

  async evaluateModel(modelType: string): Promise<{
    metrics: ModelMetrics
    grade: 'excellent' | 'bon' | 'moyen' | 'faible' | 'insuffisant'
    recommendations: string[]
  }> {
    const metrics = await this.computeModelMetrics(modelType)
    
    let grade: 'excellent' | 'bon' | 'moyen' | 'faible' | 'insuffisant' = 'moyen'
    const recommendations: string[] = []
    
    if (metrics.f1Score >= 85 && metrics.mae <= 5) {
      grade = 'excellent'
      recommendations.push('Performances excellentes - maintenir le modèle')
    } else if (metrics.f1Score >= 70 && metrics.mae <= 10) {
      grade = 'bon'
      recommendations.push('Bonnes performances - surveiller les évolutions')
    } else if (metrics.f1Score >= 50 && metrics.mae <= 15) {
      grade = 'moyen'
      recommendations.push('Performances moyennes - collecter plus de données')
    } else if (metrics.f1Score >= 30) {
      grade = 'faible'
      recommendations.push('Performances faibles - recalibration recommandée')
    } else {
      grade = 'insuffisant'
      recommendations.push('Performances insuffisantes - revoir les paramètres du modèle')
    }
    
    if (Math.abs(metrics.calibrationError) > 10) {
      recommendations.push(`Biais de ${metrics.calibrationError > 0 ? 'surestime' : 'sous-estime'} important (${Math.abs(metrics.calibrationError)} pts)`)
    }
    
    if (metrics.r2 < 50) {
      recommendations.push('Faible pouvoir explicatif (R² < 50%) - envisager des variables supplémentaires')
    }
    
    if (metrics.sampleSize < 50) {
      recommendations.push(`Échantillon limité (${metrics.sampleSize} observations) - plus de données amélioreront la précision`)
    }
    
    return { metrics, grade, recommendations }
  }

  private async computeModelMetrics(modelType: string): Promise<ModelMetrics> {
    const store = useAppStore.getState()
    const feedbacks = this.getFeedbacks(modelType)
    
    if (feedbacks.length === 0) {
      return {
        precision: 0,
        recall: 0,
        f1Score: 0,
        mae: 0,
        rmse: 0,
        r2: 0,
        calibrationError: 0,
        sampleSize: 0,
      }
    }
    
    // Calculer les métriques à partir des feedbacks
    let tp = 0, fp = 0, fn = 0, tn = 0
    let totalError = 0
    let totalSquaredError = 0
    
    for (const fb of feedbacks) {
      const pred = fb.content?.prediction
      const actual = fb.userAction === 'accept' ? 'accept' : 'reject'
      
      if (pred === actual) {
        tp++
      } else {
        fp++
      }
      totalError += 1
    }
    
    const precision = tp / (tp + fp + 0.001)
    const recall = tp / (tp + fn + 0.001)
    const f1Score = 2 * (precision * recall) / (precision + recall + 0.001)
    const mae = totalError / feedbacks.length
    const rmse = Math.sqrt(totalSquaredError / feedbacks.length)
    
    return {
      precision: Math.round(precision * 100),
      recall: Math.round(recall * 100),
      f1Score: Math.round(f1Score * 100),
      mae: Math.round(mae * 10) / 10,
      rmse: Math.round(rmse * 10) / 10,
      r2: 0,
      calibrationError: 0,
      sampleSize: feedbacks.length,
    }
  }

  private async computeGlobalMetrics(): Promise<ModelMetrics> {
    const riskMetrics = await this.computeModelMetrics('risk')
    const checklistMetrics = await this.computeModelMetrics('checklist')
    const ecartMetrics = await this.computeModelMetrics('ecart')
    
    return {
      precision: Math.round((riskMetrics.precision + checklistMetrics.precision + ecartMetrics.precision) / 3),
      recall: Math.round((riskMetrics.recall + checklistMetrics.recall + ecartMetrics.recall) / 3),
      f1Score: Math.round((riskMetrics.f1Score + checklistMetrics.f1Score + ecartMetrics.f1Score) / 3),
      mae: (riskMetrics.mae + checklistMetrics.mae + ecartMetrics.mae) / 3,
      rmse: (riskMetrics.rmse + checklistMetrics.rmse + ecartMetrics.rmse) / 3,
      r2: (riskMetrics.r2 + checklistMetrics.r2 + ecartMetrics.r2) / 3,
      calibrationError: (riskMetrics.calibrationError + checklistMetrics.calibrationError + ecartMetrics.calibrationError) / 3,
      sampleSize: riskMetrics.sampleSize + checklistMetrics.sampleSize + ecartMetrics.sampleSize,
    }
  }

  private async updateCalibrationFromTraining(modelType: string, metrics: ModelMetrics): Promise<void> {
    // Ajuster les poids des critères en fonction des performances
    if (metrics.mae > 10) {
      this.currentCalibration.weightAdjustment.historique_SA_consecutif -= 2
      this.currentCalibration.weightAdjustment.historique_NS_consecutif += 2
    }
    
    // Sauvegarder les nouveaux paramètres
    await this.saveCalibrationParams()
  }

  // ============================================================
  // EXPORT/IMPORT DES MODÈLES
  // ============================================================

  async exportModel(modelType: string): Promise<string> {
    const data = {
      modelType,
      calibration: this.currentCalibration,
      performanceHistory: this.performanceHistory,
      feedbacks: this.feedbacks,
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    }
    
    return JSON.stringify(data, null, 2)
  }

  async importModel(modelType: string, jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData)
      
      if (data.modelType !== modelType) {
        throw new Error(`Type de modèle incompatible: attendu ${modelType}, reçu ${data.modelType}`)
      }
      
      if (data.calibration) {
        this.currentCalibration = data.calibration
        await this.saveCalibrationParams()
      }
      
      if (data.feedbacks) {
        this.feedbacks = data.feedbacks
        await this.saveFeedbacks()
      }
      
      if (data.performanceHistory) {
        this.performanceHistory = data.performanceHistory
        await this.savePerformanceHistory()
      }
      
      console.log(`[LearningAgent] Modèle ${modelType} importé avec succès`)
      return true
    } catch (error) {
      console.error('[LearningAgent] Erreur lors de l\'import:', error)
      return false
    }
  }

  async resetModel(modelType: string): Promise<void> {
    if (modelType === 'all') {
      this.feedbacks = []
      this.performanceHistory = []
      this.currentCalibration = { ...DEFAULT_CALIBRATION_PARAMS }
      this.lastTrainingDate.clear()
    } else {
      this.feedbacks = this.feedbacks.filter(f => f.type !== modelType)
    }
    
    await this.saveFeedbacks()
    await this.savePerformanceHistory()
    await this.saveCalibrationParams()
    
    console.log(`[LearningAgent] Modèle ${modelType} réinitialisé`)
  }

  // ============================================================
  // PERSISTANCE (LocalStorage / IndexedDB)
  // ============================================================

  private async saveFeedbacks(): Promise<void> {
    try {
      localStorage.setItem('sgda_learning_feedbacks', JSON.stringify(this.feedbacks))
    } catch (error) {
      console.error('[LearningAgent] Erreur sauvegarde feedbacks:', error)
    }
  }

  private async loadFeedbacks(): Promise<void> {
    try {
      const saved = localStorage.getItem('sgda_learning_feedbacks')
      if (saved) {
        this.feedbacks = JSON.parse(saved)
      }
    } catch (error) {
      console.error('[LearningAgent] Erreur chargement feedbacks:', error)
    }
  }

  private async savePerformanceHistory(): Promise<void> {
    try {
      localStorage.setItem('sgda_performance_history', JSON.stringify(this.performanceHistory))
    } catch (error) {
      console.error('[LearningAgent] Erreur sauvegarde historique:', error)
    }
  }

  private async loadPerformanceHistory(): Promise<void> {
    try {
      const saved = localStorage.getItem('sgda_performance_history')
      if (saved) {
        this.performanceHistory = JSON.parse(saved)
      }
    } catch (error) {
      console.error('[LearningAgent] Erreur chargement historique:', error)
    }
  }

  private async saveCalibrationParams(): Promise<void> {
    try {
      localStorage.setItem('sgda_calibration_params', JSON.stringify(this.currentCalibration))
    } catch (error) {
      console.error('[LearningAgent] Erreur sauvegarde calibration:', error)
    }
  }

  private async loadCalibrationParams(): Promise<void> {
    try {
      const saved = localStorage.getItem('sgda_calibration_params')
      if (saved) {
        this.currentCalibration = JSON.parse(saved)
      }
    } catch (error) {
      console.error('[LearningAgent] Erreur chargement calibration:', error)
    }
  }

  // ============================================================
  // ANALYSE AVANCÉE
  // ============================================================

  async getLearningCurve(modelType: string): Promise<{
    dates: string[]
    scores: number[]
    trend: 'amelioration' | 'stabilite' | 'degradation'
  }> {
    const history = this.performanceHistory.filter(p => p.modelType === modelType)
    
    const dates = history.map(h => new Date(h.timestamp).toLocaleDateString('fr-FR'))
    const scores = history.map(h => h.metrics.f1Score)
    
    let trend: 'amelioration' | 'stabilite' | 'degradation' = 'stabilite'
    if (scores.length >= 5) {
      const firstAvg = scores.slice(0, 2).reduce((a, b) => a + b, 0) / 2
      const lastAvg = scores.slice(-2).reduce((a, b) => a + b, 0) / 2
      if (lastAvg > firstAvg + 5) trend = 'amelioration'
      else if (lastAvg < firstAvg - 5) trend = 'degradation'
    }
    
    return { dates, scores, trend }
  }

  async getRecommendations(): Promise<{
    actions: string[]
    priority: 'haute' | 'moyenne' | 'basse'
    expectedImprovement: number
  }> {
    const actions: string[] = []
    let priority: 'haute' | 'moyenne' | 'basse' = 'moyenne'
    let expectedImprovement = 0
    
    const riskEval = await this.evaluateModel('risk')
    const checklistEval = await this.evaluateModel('checklist')
    const ecartEval = await this.evaluateModel('ecart')
    
    if (riskEval.grade === 'faible' || riskEval.grade === 'insuffisant') {
      actions.push('🚨 Recalibration urgente du modèle de risque')
      priority = 'haute'
      expectedImprovement += 15
    }
    
    if (checklistEval.metrics.sampleSize < 50) {
      actions.push('📊 Collecter plus de feedbacks sur les prédictions de checklist')
      expectedImprovement += 10
    }
    
    if (ecartEval.metrics.calibrationError > 10) {
      actions.push('⚙️ Ajuster les seuils de décision pour l\'évaluation des écarts')
      expectedImprovement += 8
    }
    
    if (this.feedbacks.length < 100) {
      actions.push('📝 Encourager les inspecteurs à fournir plus de feedbacks')
      expectedImprovement += 5
    }
    
    if (actions.length === 0) {
      actions.push('✅ Tous les modèles sont bien calibrés')
      priority = 'basse'
    }
    
    return { actions, priority, expectedImprovement }
  }

  // ============================================================
  // STATISTIQUES GLOBALES
  // ============================================================

  getStats(): {
    totalFeedbacks: number
    totalTrainings: number
    lastTrainingDate: string | null
    modelPerformance: Record<string, { grade: string; f1Score: number }>
  } {
    const modelPerformance: Record<string, { grade: string; f1Score: number }> = {}
    
    for (const model of ['risk', 'checklist', 'ecart', 'report']) {
      const history = this.performanceHistory.filter(p => p.modelType === model)
      if (history.length > 0) {
        const lastMetrics = history[history.length - 1].metrics
        let grade = 'moyen'
        if (lastMetrics.f1Score >= 85) grade = 'excellent'
        else if (lastMetrics.f1Score >= 70) grade = 'bon'
        else if (lastMetrics.f1Score >= 50) grade = 'moyen'
        else if (lastMetrics.f1Score >= 30) grade = 'faible'
        else grade = 'insuffisant'
        
        modelPerformance[model] = { grade, f1Score: lastMetrics.f1Score }
      } else {
        modelPerformance[model] = { grade: 'non_evalue', f1Score: 0 }
      }
    }
    
    const lastTraining = this.performanceHistory.length > 0 
      ? this.performanceHistory[this.performanceHistory.length - 1].timestamp
      : null
    
    return {
      totalFeedbacks: this.feedbacks.length,
      totalTrainings: this.performanceHistory.length,
      lastTrainingDate: lastTraining,
      modelPerformance,
    }
  }

  isReady(): boolean {
    return this.initialized
  }
}

export const learningAgent = new LearningAgent()