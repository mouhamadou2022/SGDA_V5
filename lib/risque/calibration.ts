// lib/risque/calibration.ts
// Auto-calibration du modèle basée sur les feedbacks inspecteurs
// Détection et correction des biais
// 0 style inline, 0 fetch direct

import { FeedbackInspecteur, CorrectionModele, MatricePerformance } from './types'

// Seuils pour la calibration
const SEUIL_CORRECTION_MAE = 10 // MAE > 10 → correction nécessaire
const SEUIL_CORRECTION_BIAS = 5 // |Bias| > 5 → correction nécessaire
const SEUIL_COVERAGE_MIN = 85 // Coverage < 85% → problème

/**
 * Calcule l'erreur moyenne absolue (MAE) sur les feedbacks
 */
export function computeMAE(feedbacks: FeedbackInspecteur[]): number {
  if (feedbacks.length === 0) return 0
  
  const totalError = feedbacks.reduce((sum, f) => sum + Math.abs(f.erreur), 0)
  return totalError / feedbacks.length
}

/**
 * Calcule le biais moyen (surestime ou sous-estime)
 */
export function computeBias(feedbacks: FeedbackInspecteur[]): number {
  if (feedbacks.length === 0) return 0
  
  const totalBias = feedbacks.reduce((sum, f) => sum + f.erreur, 0)
  return totalBias / feedbacks.length
}

/**
 * Calcule le taux de couverture des intervalles de confiance
 */
export function computeCoverage(
  predictions: Array<{ predite: number; reelle: number; intervalle: [number, number] }>
): number {
  if (predictions.length === 0) return 0
  
  let covered = 0
  for (const p of predictions) {
    if (p.reelle >= p.intervalle[0] && p.reelle <= p.intervalle[1]) {
      covered++
    }
  }
  
  return (covered / predictions.length) * 100
}

/**
 * Calcule un coverage95 empirique depuis la distribution des erreurs.
 * Approximation : % d'erreurs dans l'intervalle ±1.96σ (normale théorique).
 * Retourne null si pas assez de feedbacks.
 */
function computeCoverageFromFeedbacks(feedbacks: FeedbackInspecteur[]): number | null {
  if (feedbacks.length < 5) return null
  const errors = feedbacks.map(f => Math.abs(f.erreur))
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length
  const variance = errors.reduce((sq, e) => sq + (e - mean) ** 2, 0) / errors.length
  const std = Math.sqrt(variance)
  if (std === 0) return 100
  const threshold = 1.96 * std
  const covered = errors.filter(e => e <= threshold).length
  return Math.round((covered / errors.length) * 100)
}

/**
 * Calcule les métriques de performance du modèle
 */
export function computeModelPerformance(
  feedbacks: FeedbackInspecteur[],
  seuilJours: number = 90
): MatricePerformance {
  const feedbacks3m = feedbacks.filter(f => f.type === 'prediction_3m')
  const feedbacks6m = feedbacks.filter(f => f.type === 'prediction_6m')
  
  return {
    mae3m: computeMAE(feedbacks3m),
    mae6m: computeMAE(feedbacks6m),
    biais3m: computeBias(feedbacks3m),
    biais6m: computeBias(feedbacks6m),
    coverage95: computeCoverageFromFeedbacks(feedbacks),
    derniereCalibration: new Date().toISOString(),
    nbObservations: feedbacks.length,
  }
}

/**
 * Détecte si une correction est nécessaire
 */
export function isCorrectionNeeded(performance: MatricePerformance): {
  besoin: boolean
  raisons: string[]
} {
  const raisons: string[] = []
  
  if (performance.mae3m && performance.mae3m > SEUIL_CORRECTION_MAE) {
    raisons.push(`MAE 3m trop élevé (${performance.mae3m.toFixed(1)} > ${SEUIL_CORRECTION_MAE})`)
  }
  
  if (performance.mae6m && performance.mae6m > SEUIL_CORRECTION_MAE) {
    raisons.push(`MAE 6m trop élevé (${performance.mae6m.toFixed(1)} > ${SEUIL_CORRECTION_MAE})`)
  }
  
  if (performance.biais3m && Math.abs(performance.biais3m) > SEUIL_CORRECTION_BIAS) {
    const direction = performance.biais3m > 0 ? 'surestime' : 'sous-estime'
    raisons.push(`Biais 3m détecté (${direction}: ${Math.abs(performance.biais3m).toFixed(1)} points)`)
  }
  
  if (performance.biais6m && Math.abs(performance.biais6m) > SEUIL_CORRECTION_BIAS) {
    const direction = performance.biais6m > 0 ? 'surestime' : 'sous-estime'
    raisons.push(`Biais 6m détecté (${direction}: ${Math.abs(performance.biais6m).toFixed(1)} points)`)
  }
  
  if (performance.coverage95 !== null && performance.coverage95 < SEUIL_COVERAGE_MIN) {
    raisons.push(`Coverage IC95 insuffisant (${performance.coverage95.toFixed(1)}% < ${SEUIL_COVERAGE_MIN}%)`)
  }
  
  return {
    besoin: raisons.length > 0,
    raisons,
  }
}

/**
 * Calcule la correction de biais à appliquer
 */
export function computeBiasCorrection(biais: number): number {
  // Correction proportionnelle au biais, limitée à ±15 points
  return Math.min(15, Math.max(-15, -biais * 0.5))
}

/**
 * Génère une correction de modèle
 */
export function generateCorrection(
  modele: 'matrix' | 'bayesian' | 'triggers' | 'aggravators' | 'frequency',
  typeCorrection: 'seuil' | 'poids' | 'vraisemblance',
  ancienneValeur: number,
  nouvelleValeur: number,
  raison: string,
  auto: boolean = true
): CorrectionModele {
  return {
    id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    modele,
    typeCorrection,
    ancienneValeur,
    nouvelleValeur,
    raison,
    appliqueeLe: new Date().toISOString(),
    appliqueePar: auto ? 'auto' : 'admin',
  }
}

/**
 * Calcule le facteur d'apprentissage (poids donné aux feedbacks récents)
 */
export function computeLearningFactor(nbFeedbacks: number): number {
  // Plus on a de feedbacks, plus on donne du poids aux corrections
  return Math.min(0.3, 0.05 + nbFeedbacks * 0.01)
}

/**
 * Ajuste les poids des facteurs en fonction des feedbacks
 */
export function adjustWeights(
  poidsActuels: Record<string, number>,
  feedbacks: FeedbackInspecteur[]
): Record<string, number> {
  if (feedbacks.length === 0) return poidsActuels
  
  const learningFactor = computeLearningFactor(feedbacks.length)
  const nouveauxPoids = { ...poidsActuels }
  
  // Analyse des erreurs pour ajuster les poids
  const erreursParType: Record<string, number[]> = {}
  
  for (const fb of feedbacks) {
    if (fb.type === 'alerte') {
      if (!erreursParType['alerte']) erreursParType['alerte'] = []
      erreursParType['alerte'].push(fb.erreur)
    }
  }
  
  // Ajustement basé sur les erreurs
  for (const [type, erreurs] of Object.entries(erreursParType)) {
    const erreurMoyenne = erreurs.reduce((a, b) => a + b, 0) / erreurs.length
    const ajustement = 1 - (erreurMoyenne / 100) * learningFactor
    
    if (nouveauxPoids[type]) {
      nouveauxPoids[type] = Math.max(0.5, Math.min(1.5, nouveauxPoids[type] * ajustement))
    }
  }
  
  return nouveauxPoids
}

/**
 * Obtient la classe CSS pour la performance
 */
export function getPerformanceClass(mae: number | null): string {
  if (mae === null) return 'badge neutral'
  if (mae <= 5) return 'badge success'
  if (mae <= 10) return 'badge primary'
  if (mae <= 15) return 'badge warning'
  return 'badge danger'
}