// lib/ia/training/feedback.ts
// Module de gestion des feedbacks utilisateurs pour l'apprentissage continu
// Collecte, analyse et exploitation des retours d'inspecteurs
// 0 API externe, 0 coût, 100% local

'use client'

import { useAppStore } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface Feedback {
  id: string
  type: 'prediction' | 'decision' | 'evaluation' | 'suggestion' | 'correction'
  modelName: string
  input: any
  predictedOutput: any
  actualOutput: any
  userAction: 'accept' | 'reject' | 'modify'
  userComment?: string
  confidence: number
  timestamp: string
  userId: string
  aerodromeId?: string
  sessionId?: string
}

export interface FeedbackStats {
  total: number
  byType: Record<string, number>
  byModel: Record<string, number>
  acceptanceRate: number
  averageConfidence: number
  recentTrend: 'up' | 'down' | 'stable'
  lastWeekCount: number
}

export interface FeedbackAnalysis {
  modelName: string
  accuracy: number
  commonErrors: Array<{ pattern: string; count: number; percentage: number }>
  improvementSuggestions: string[]
  needsRecalibration: boolean
  recalibrationUrgency: 'low' | 'medium' | 'high'
}

// ============================================================
// CONSTANTES
// ============================================================

const FEEDBACK_STORAGE_KEY = 'sgda_ia_feedbacks'
const ANALYSIS_THRESHOLD = 20

// ============================================================
// GESTIONNAIRE DE FEEDBACKS
// ============================================================

export class FeedbackManager {
  private feedbacks: Feedback[] = []
  private listeners: ((feedbacks: Feedback[]) => void)[] = []
  private lastAnalysis: Map<string, Date> = new Map()

  constructor() {
    this.loadFeedbacks()
  }

  // ============================================================
  // ENREGISTREMENT
  // ============================================================

  /**
   * Enregistre un nouveau feedback
   */
  recordFeedback(feedback: Omit<Feedback, 'id' | 'timestamp'>): Feedback {
    const newFeedback: Feedback = {
      ...feedback,
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString()
    }
    
    this.feedbacks.push(newFeedback)
    this.saveFeedbacks()
    this.notifyListeners()
    
    // Vérifier si une analyse est nécessaire
    this.checkAndAnalyze(newFeedback.modelName)
    
    return newFeedback
  }

  /**
   * Enregistre un feedback de correction de prédiction
   */
  recordCorrection(
    modelName: string,
    input: any,
    predicted: any,
    actual: any,
    userId: string,
    comment?: string
  ): Feedback {
    return this.recordFeedback({
      type: 'correction',
      modelName,
      input,
      predictedOutput: predicted,
      actualOutput: actual,
      userAction: predicted === actual ? 'accept' : 'modify',
      userComment: comment,
      confidence: 80,
      userId
    })
  }

  /**
   * Enregistre un feedback d'acceptation/refus de décision
   */
  recordDecision(
    modelName: string,
    input: any,
    decision: any,
    accepted: boolean,
    userId: string,
    comment?: string
  ): Feedback {
    return this.recordFeedback({
      type: 'decision',
      modelName,
      input,
      predictedOutput: decision,
      actualOutput: decision,
      userAction: accepted ? 'accept' : 'reject',
      userComment: comment,
      confidence: 70,
      userId
    })
  }

  // ============================================================
  // ANALYSE PAR MODÈLE
  // ============================================================

  /**
   * Analyse les performances d'un modèle à partir des feedbacks
   */
  analyzeModel(modelName: string): FeedbackAnalysis {
    const modelFeedbacks = this.feedbacks.filter(f => f.modelName === modelName)
    
    if (modelFeedbacks.length === 0) {
      return {
        modelName,
        accuracy: 0,
        commonErrors: [],
        improvementSuggestions: ['Collecter plus de feedbacks pour analyse'],
        needsRecalibration: false,
        recalibrationUrgency: 'low'
      }
    }
    
    // Calcul de la précision
    let correct = 0
    const errors: Record<string, number> = {}
    
    for (const fb of modelFeedbacks) {
      let isCorrect = false
      
      if (fb.type === 'correction') {
        isCorrect = fb.predictedOutput === fb.actualOutput
      } else if (fb.type === 'decision') {
        isCorrect = fb.userAction === 'accept'
      } else {
        isCorrect = fb.userAction !== 'reject'
      }
      
      if (isCorrect) {
        correct++
      } else {
        // Enregistrer l'erreur pour analyse
        const errorKey = typeof fb.predictedOutput === 'string' 
          ? `Prédit: ${fb.predictedOutput}, Attendu: ${fb.actualOutput}`
          : `Erreur de ${Math.abs(fb.predictedOutput - fb.actualOutput).toFixed(1)} points`
        
        errors[errorKey] = (errors[errorKey] || 0) + 1
      }
    }
    
    const accuracy = (correct / modelFeedbacks.length) * 100
    
    // Analyser les erreurs courantes
    const commonErrors = Object.entries(errors)
      .map(([pattern, count]) => ({
        pattern,
        count,
        percentage: (count / modelFeedbacks.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    
    // Suggérer des améliorations
    const improvementSuggestions: string[] = []
    
    if (accuracy < 60) {
      improvementSuggestions.push('Précision faible - recalibration recommandée')
      improvementSuggestions.push('Collecter plus de données d\'entraînement')
    } else if (accuracy < 75) {
      improvementSuggestions.push('Précision moyenne - améliorer les données')
    }
    
    if (commonErrors.length > 0 && commonErrors[0].percentage > 20) {
      improvementSuggestions.push(`Erreur fréquente: ${commonErrors[0].pattern}`)
    }
    
    const needsRecalibration = accuracy < 70 || modelFeedbacks.length > ANALYSIS_THRESHOLD
    const recalibrationUrgency = accuracy < 50 ? 'high' : accuracy < 70 ? 'medium' : 'low'
    
    this.lastAnalysis.set(modelName, new Date())
    
    return {
      modelName,
      accuracy: Math.round(accuracy * 10) / 10,
      commonErrors,
      improvementSuggestions,
      needsRecalibration,
      recalibrationUrgency
    }
  }

  private checkAndAnalyze(modelName: string): void {
    const modelFeedbacks = this.feedbacks.filter(f => f.modelName === modelName)
    const lastAnalysisDate = this.lastAnalysis.get(modelName)
    
    if (modelFeedbacks.length >= ANALYSIS_THRESHOLD) {
      const needsAnalysis = !lastAnalysisDate || 
        (Date.now() - lastAnalysisDate.getTime()) > 7 * 24 * 60 * 60 * 1000
      
      if (needsAnalysis) {
        this.analyzeModel(modelName)
      }
    }
  }

  // ============================================================
  // STATISTIQUES
  // ============================================================

  /**
   * Obtient les statistiques globales des feedbacks
   */
  getStats(): FeedbackStats {
    const total = this.feedbacks.length
    const byType: Record<string, number> = {}
    const byModel: Record<string, number> = {}
    let accepted = 0
    let totalConfidence = 0
    
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    let lastWeekCount = 0
    
    for (const fb of this.feedbacks) {
      byType[fb.type] = (byType[fb.type] || 0) + 1
      byModel[fb.modelName] = (byModel[fb.modelName] || 0) + 1
      
      if (fb.userAction === 'accept') accepted++
      totalConfidence += fb.confidence
      
      if (new Date(fb.timestamp).getTime() > oneWeekAgo) {
        lastWeekCount++
      }
    }
    
    const acceptanceRate = total > 0 ? (accepted / total) * 100 : 0
    const averageConfidence = total > 0 ? totalConfidence / total : 0
    
    // Calculer la tendance récente
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (this.feedbacks.length >= 20) {
      const recentAcceptance = this.feedbacks.slice(-20).filter(f => f.userAction === 'accept').length / 20 * 100
      const olderAcceptance = this.feedbacks.slice(0, 20).filter(f => f.userAction === 'accept').length / 20 * 100
      
      if (recentAcceptance > olderAcceptance + 10) trend = 'up'
      else if (recentAcceptance < olderAcceptance - 10) trend = 'down'
    }
    
    return {
      total,
      byType,
      byModel,
      acceptanceRate: Math.round(acceptanceRate),
      averageConfidence: Math.round(averageConfidence),
      recentTrend: trend,
      lastWeekCount
    }
  }

  /**
   * Obtient les feedbacks pour un modèle spécifique
   */
  getFeedbacksByModel(modelName: string): Feedback[] {
    return this.feedbacks.filter(f => f.modelName === modelName)
  }

  /**
   * Obtient les feedbacks récents (nombre spécifié)
   */
  getRecentFeedbacks(limit: number = 50): Feedback[] {
    return [...this.feedbacks]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  // ============================================================
  // APPRENTISSAGE ACTIF
  // ============================================================

  /**
   * Identifie les cas où le modèle est incertain (pour apprentissage actif)
   */
  getUncertainCases(modelName: string, limit: number = 10): Feedback[] {
    const modelFeedbacks = this.feedbacks.filter(f => f.modelName === modelName)
    
    return modelFeedbacks
      .filter(f => f.confidence < 60 || f.userAction === 'modify')
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, limit)
  }

  /**
   * Exporte les feedbacks pour analyse externe
   */
  exportFeedbacks(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['id', 'type', 'modelName', 'userAction', 'confidence', 'timestamp', 'userId']
      const rows = this.feedbacks.map(f => [
        f.id, f.type, f.modelName, f.userAction, f.confidence, f.timestamp, f.userId
      ])
      return [headers, ...rows].map(row => row.join(',')).join('\n')
    }
    
    return JSON.stringify(this.feedbacks, null, 2)
  }

  // ============================================================
  // PERSISTANCE
  // ============================================================

  private saveFeedbacks(): void {
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(this.feedbacks))
    } catch (error) {
      console.error('[FeedbackManager] Erreur sauvegarde:', error)
    }
  }

  private loadFeedbacks(): void {
    try {
      const saved = localStorage.getItem(FEEDBACK_STORAGE_KEY)
      if (saved) {
        this.feedbacks = JSON.parse(saved)
      }
    } catch (error) {
      console.error('[FeedbackManager] Erreur chargement:', error)
    }
  }

  // ============================================================
  // GESTION DES ÉCOUTEURS
  // ============================================================

  subscribe(listener: (feedbacks: Feedback[]) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.feedbacks)
    }
  }

  // ============================================================
  // MAINTENANCE
  // ============================================================

  /**
   * Nettoie les vieux feedbacks (plus de 1 an)
   */
  cleanup(olderThanDays: number = 365): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    const initialCount = this.feedbacks.length
    
    this.feedbacks = this.feedbacks.filter(f => new Date(f.timestamp).getTime() > cutoff)
    this.saveFeedbacks()
    this.notifyListeners()
    
    return initialCount - this.feedbacks.length
  }

  /**
   * Réinitialise tous les feedbacks
   */
  reset(): void {
    this.feedbacks = []
    this.lastAnalysis.clear()
    this.saveFeedbacks()
    this.notifyListeners()
  }

  getFeedbackCount(): number {
    return this.feedbacks.length
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const feedbackManager = new FeedbackManager()