// lib/risque/trends.ts
// Analyse des tendances (12 mois et 3 mois)
// Détection des inflexions et des points de rupture
// 0 style inline, 0 fetch direct

import { Tendance } from './types'

// Types pour les résultats d'analyse
export interface TrendAnalysis {
  tendance: Tendance
  pente: number
  intercept: number
  coefficientCorrelation: number
  pointsAnalyse: number
}

export interface InflexionPoint {
  date: string
  index: number
  valeurAvant: number
  valeurApres: number
  direction: 'hausse' | 'baisse'
  amplitude: number
}

/**
 * Calcule la régression linéaire pondérée sur une série temporelle
 * Les points récents ont plus de poids (décroissance exponentielle)
 */
export function linearRegression(values: number[], options?: {
  decayFactor?: number  // Facteur de décroissance (0-1), défaut 0.85
}): {
  slope: number
  intercept: number
  r2: number
  stdError: number      // Erreur standard de l'estimation
  confidenceMargin95: number // Marge de confiance à 95%
} {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0, stdError: 0, confidenceMargin95: 0 }
  
  const decayFactor = options?.decayFactor ?? 0.85
  const weights = Array.from({ length: n }, (_, i) => Math.pow(decayFactor, n - 1 - i))
  const sumW = weights.reduce((a, b) => a + b, 0)
  
  // Moyennes pondérées
  const x = Array.from({ length: n }, (_, i) => i)
  const meanX = x.reduce((sum, xi, i) => sum + weights[i] * xi, 0) / sumW
  const meanY = values.reduce((sum, yi, i) => sum + weights[i] * yi, 0) / sumW
  
  // Régression pondérée
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    num += weights[i] * dx * (values[i] - meanY)
    den += weights[i] * dx * dx
  }
  
  const slope = den !== 0 ? num / den : 0
  const intercept = meanY - slope * meanX
  
  // R² pondéré
  const ssRes = values.reduce((sum, yi, i) => sum + weights[i] * Math.pow(yi - (slope * i + intercept), 2), 0)
  const ssTot = values.reduce((sum, yi, i) => sum + weights[i] * Math.pow(yi - meanY, 2), 0)
  const r2 = ssTot !== 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0
  
  // Erreur standard et intervalle de confiance à 95%
  const dof = Math.max(1, n - 2) // Degrés de liberté
  const stdError = Math.sqrt(ssRes / dof)
  const tValue95 = n > 30 ? 1.96 : n > 10 ? 2.23 : 4.30 // Approximation t-Student
  const confidenceMargin95 = tValue95 * stdError
  
  return { slope, intercept, r2, stdError, confidenceMargin95 }
}

/**
 * Détermine la tendance à partir de la pente avec seuil adaptatif
 * Le seuil est basé sur l'erreur standard pour éviter les faux positifs
 */
export function getTrendFromSlope(slope: number, stdError?: number): Tendance {
  // Seuil adaptatif : si stdError connu, on exige que la pente soit
  // significativement différente de 0 (> 1x stdError)
  const seuil = stdError ? stdError : 0.5
  if (slope > seuil) return 'hausse'
  if (slope < -seuil) return 'baisse'
  return 'stable'
}

/**
 * Calcule la tendance sur une période (12 mois par défaut)
 */
export function computeTrend(
  scores: number[],
  periodeMois: number = 12
): TrendAnalysis & { stdError: number; confidenceMargin95: number } {
  const points = scores.slice(-periodeMois)
  const { slope, intercept, r2, stdError, confidenceMargin95 } = linearRegression(points)
  const tendance = getTrendFromSlope(slope, stdError)
  
  return {
    tendance,
    pente: slope,
    intercept,
    coefficientCorrelation: r2,
    pointsAnalyse: points.length,
    stdError,
    confidenceMargin95,
  }
}

/**
 * Calcule la tendance à long terme (12 mois)
 */
export function computeLongTermTrend(scores: number[]): TrendAnalysis {
  return computeTrend(scores, 12)
}

/**
 * Calcule la tendance à court terme (3 mois)
 */
export function computeShortTermTrend(scores: number[]): TrendAnalysis {
  return computeTrend(scores, 3)
}

/**
 * Détecte les points d'inflexion (changements de direction)
 */
export function detectInflexions(
  scores: number[],
  dates: string[],
  seuilAmplitude: number = 5
): InflexionPoint[] {
  const inflexions: InflexionPoint[] = []
  
  if (scores.length < 4) return inflexions
  
  // Calcul des différences
  const differences: number[] = []
  for (let i = 1; i < scores.length; i++) {
    differences.push(scores[i] - scores[i-1])
  }
  
  // Détection des changements de signe
  for (let i = 1; i < differences.length; i++) {
    const avant = differences[i-1]
    const apres = differences[i]
    
    if (avant * apres < 0) {
      // Changement de signe -> inflexion
      const amplitude = Math.abs(avant) + Math.abs(apres)
      
      if (amplitude >= seuilAmplitude) {
        inflexions.push({
          date: dates[i],
          index: i,
          valeurAvant: scores[i-1],
          valeurApres: scores[i],
          direction: apres > 0 ? 'hausse' : 'baisse',
          amplitude,
        })
      }
    }
  }
  
  return inflexions
}

/**
 * Calcule la moyenne mobile pour lisser la série
 */
export function computeMovingAverage(
  scores: number[],
  windowSize: number = 3
): number[] {
  if (scores.length < windowSize) return []
  
  const result: number[] = []
  
  for (let i = 0; i <= scores.length - windowSize; i++) {
    const window = scores.slice(i, i + windowSize)
    const avg = window.reduce((a, b) => a + b, 0) / windowSize
    result.push(avg)
  }
  
  return result
}

/**
 * Compare les tendances récente et historique
 */
export function compareTrends(
  recentTrend: Tendance,
  historicalTrend: Tendance
): 'meilleure' | 'identique' | 'pire' {
  const ordre: Record<Tendance, number> = { hausse: 3, stable: 2, baisse: 1 }
  
  if (ordre[recentTrend] > ordre[historicalTrend]) return 'meilleure'
  if (ordre[recentTrend] < ordre[historicalTrend]) return 'pire'
  return 'identique'
}

/**
 * Obtient la classe CSS pour la tendance
 */
export function getTrendClass(tendance: Tendance): string {
  switch (tendance) {
    case 'hausse':
      return 'text-green-600'
    case 'baisse':
      return 'text-red-600 animate-pulse'
    default:
      return 'text-gray-500'
  }
}

/**
 * Obtient l'icône pour la tendance
 */
export function getTrendIcon(tendance: Tendance): string {
  switch (tendance) {
    case 'hausse': return '📈'
    case 'baisse': return '📉'
    default: return '➡️'
  }
}

/**
 * Obtient la description textuelle de la tendance
 */
export function getTrendDescription(tendance: Tendance, pente: number): string {
  const absPente = Math.abs(pente)
  
  switch (tendance) {
    case 'hausse':
      if (absPente > 2) return `Forte hausse (${pente.toFixed(1)} pts/mois)`
      if (absPente > 1) return `Hausse modérée (${pente.toFixed(1)} pts/mois)`
      return `Légère hausse (${pente.toFixed(1)} pts/mois)`
    case 'baisse':
      if (absPente > 2) return `Forte baisse (${Math.abs(pente).toFixed(1)} pts/mois)`
      if (absPente > 1) return `Baisse modérée (${Math.abs(pente).toFixed(1)} pts/mois)`
      return `Légère baisse (${Math.abs(pente).toFixed(1)} pts/mois)`
    default:
      return 'Tendance stable'
  }
}