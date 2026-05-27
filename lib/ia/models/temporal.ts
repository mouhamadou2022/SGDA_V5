// lib/ia/models/temporal.ts
// Modèle de détection de patterns temporels (saisonnalité, tendances cycliques)
// Style Prophet pour la détection de saisonnalité dans les scores de risque
// 0 API externe, 0 coût, 100% local

'use client'

import { ScoreHistoryPoint } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface TemporalPattern {
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  period: number
  amplitude: number
  phase: number
  confidence: number
  strength: number
}

export interface TrendAnalysis {
  slope: number
  intercept: number
  trendType: 'hausse' | 'baisse' | 'stable'
  strength: number
  confidence: number
}

export interface SeasonalityResult {
  patterns: TemporalPattern[]
  dominantPattern: TemporalPattern | null
  explainedVariance: number
  recommendedAdjustment: number
}

export interface ForecastPoint {
  date: string
  value: number
  lower: number
  upper: number
  components: {
    trend: number
    seasonal: number
    residual: number
  }
}

export interface TimeSeriesDecomposition {
  trend: number[]
  seasonal: number[]
  residual: number[]
  original: number[]
  dates: string[]
}

// ============================================================
// CONSTANTES
// ============================================================

const PERIODS = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365
}

const MIN_DATA_POINTS = 6
const MAX_PERIOD_TO_DETECT = 365

// ============================================================
// MODÈLE TEMPOREL
// ============================================================

export class TemporalModel {
  private lastDecomposition: TimeSeriesDecomposition | null = null
  private lastPatterns: TemporalPattern[] = []

  // ============================================================
  // DÉCOMPOSITION DE SÉRIE TEMPORELLE
  // ============================================================

  /**
   * Décompose une série temporelle en tendance, saisonnalité et résidu
   */
  decompose(
    points: ScoreHistoryPoint[],
    period: number = 30
  ): TimeSeriesDecomposition {
    const scores = points.map(p => p.score)
    const dates = points.map(p => p.date)
    const n = scores.length
    
    if (n < MIN_DATA_POINTS) {
      const mean = scores.reduce((a, b) => a + b, 0) / n
      return {
        trend: new Array(n).fill(mean),
        seasonal: new Array(n).fill(0),
        residual: scores.map(s => s - mean),
        original: scores,
        dates
      }
    }
    
    // 1. Extraction de la tendance (moyenne mobile)
    const windowSize = Math.min(period, Math.floor(n / 3))
    const trend: number[] = []
    
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - windowSize)
      const end = Math.min(n, i + windowSize + 1)
      const window = scores.slice(start, end)
      const mean = window.reduce((a, b) => a + b, 0) / window.length
      trend.push(mean)
    }
    
    // 2. Extraction de la saisonnalité
    const detrended = scores.map((s, i) => s - trend[i])
    const seasonal: number[] = new Array(n).fill(0)
    
    if (n >= period * 2) {
      // Calculer la moyenne pour chaque position dans la période
      const nPeriods = Math.floor(n / period)
      for (let pos = 0; pos < period; pos++) {
        let sum = 0
        let count = 0
        for (let p = 0; p < nPeriods; p++) {
          const idx = pos + p * period
          if (idx < n) {
            sum += detrended[idx]
            count++
          }
        }
        const seasonalValue = count > 0 ? sum / count : 0
        
        for (let p = 0; p < nPeriods; p++) {
          const idx = pos + p * period
          if (idx < n) {
            seasonal[idx] = seasonalValue
          }
        }
      }
    }
    
    // 3. Résidus
    const residual = scores.map((s, i) => s - trend[i] - seasonal[i])
    
    this.lastDecomposition = {
      trend,
      seasonal,
      residual,
      original: scores,
      dates
    }
    
    return this.lastDecomposition
  }

  // ============================================================
  // DÉTECTION DE SAISONNALITÉ
  // ============================================================

  /**
   * Détecte les patterns saisonniers dans une série temporelle
   */
  detectSeasonality(points: ScoreHistoryPoint[]): SeasonalityResult {
    const scores = points.map(p => p.score)
    const n = scores.length
    
    if (n < MIN_DATA_POINTS) {
      return {
        patterns: [],
        dominantPattern: null,
        explainedVariance: 0,
        recommendedAdjustment: 0
      }
    }
    
    const decomposition = this.decompose(points, 30)
    const patterns: TemporalPattern[] = []
    
    // Détection de saisonnalité mensuelle (30 jours)
    if (n >= 60) {
      const monthlyPattern = this.detectPatternOfPeriod(points, 30)
      if (monthlyPattern && monthlyPattern.strength > 0.3) {
        patterns.push(monthlyPattern)
      }
    }
    
    // Détection de saisonnalité trimestrielle (90 jours)
    if (n >= 180) {
      const quarterlyPattern = this.detectPatternOfPeriod(points, 90)
      if (quarterlyPattern && quarterlyPattern.strength > 0.3) {
        patterns.push(quarterlyPattern)
      }
    }
    
    // Détection de saisonnalité annuelle (365 jours)
    if (n >= 365) {
      const yearlyPattern = this.detectPatternOfPeriod(points, 365)
      if (yearlyPattern && yearlyPattern.strength > 0.3) {
        patterns.push(yearlyPattern)
      }
    }
    
    // Calcul de la variance expliquée
    let totalVariance = 0
    let seasonalVariance = 0
    
    for (let i = 0; i < n; i++) {
      totalVariance += Math.pow(scores[i] - decomposition.trend[i], 2)
      seasonalVariance += Math.pow(decomposition.seasonal[i], 2)
    }
    
    const explainedVariance = totalVariance > 0 
      ? (seasonalVariance / totalVariance) * 100 
      : 0
    
    // Pattern dominant
    let dominantPattern: TemporalPattern | null = null
    if (patterns.length > 0) {
      dominantPattern = patterns.reduce((a, b) => 
        a.strength > b.strength ? a : b
      )
    }
    
    // Recommandation d'ajustement
    let recommendedAdjustment = 0
    if (dominantPattern && dominantPattern.amplitude > 5) {
      recommendedAdjustment = Math.round(dominantPattern.amplitude)
    }
    
    this.lastPatterns = patterns
    
    return {
      patterns,
      dominantPattern,
      explainedVariance: Math.round(explainedVariance),
      recommendedAdjustment
    }
  }

  private detectPatternOfPeriod(
    points: ScoreHistoryPoint[],
    period: number
  ): TemporalPattern | null {
    const scores = points.map(p => p.score)
    const n = scores.length
    
    if (n < period * 2) return null
    
    // Calculer la moyenne pour chaque phase
    const nPeriods = Math.floor(n / period)
    const phaseValues: number[][] = Array(period).fill(null).map(() => [])
    
    for (let p = 0; p < nPeriods; p++) {
      for (let i = 0; i < period; i++) {
        const idx = p * period + i
        if (idx < n) {
          phaseValues[i].push(scores[idx])
        }
      }
    }
    
    // Calculer la moyenne et l'amplitude par phase
    const phaseMeans: number[] = []
    let minMean = Infinity
    let maxMean = -Infinity
    
    for (let i = 0; i < period; i++) {
      const values = phaseValues[i]
      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        phaseMeans.push(mean)
        minMean = Math.min(minMean, mean)
        maxMean = Math.max(maxMean, mean)
      } else {
        phaseMeans.push(0)
      }
    }
    
    const amplitude = maxMean - minMean
    const globalMean = phaseMeans.reduce((a, b) => a + b, 0) / phaseMeans.length
    
    // Trouver la phase (décalage)
    let phase = 0
    let maxDeviation = -Infinity
    for (let i = 0; i < period; i++) {
      const deviation = Math.abs(phaseMeans[i] - globalMean)
      if (deviation > maxDeviation) {
        maxDeviation = deviation
        phase = i
      }
    }
    
    // Force du pattern (basée sur l'amplitude relative)
    const strength = Math.min(100, (amplitude / globalMean) * 100)
    
    if (strength < 15) return null
    
    let type: TemporalPattern['type'] = 'custom'
    if (period === 7) type = 'weekly'
    else if (period === 30) type = 'monthly'
    else if (period === 90) type = 'quarterly'
    else if (period === 365) type = 'yearly'
    
    return {
      type,
      period,
      amplitude: Math.round(amplitude),
      phase,
      confidence: Math.min(95, 60 + strength),
      strength: Math.round(strength)
    }
  }

  // ============================================================
  // ANALYSE DE TENDANCE
  // ============================================================

  /**
   * Analyse la tendance d'une série temporelle
   */
  analyzeTrend(points: ScoreHistoryPoint[]): TrendAnalysis {
    const scores = points.map(p => p.score)
    const n = scores.length
    
    if (n < 2) {
      return {
        slope: 0,
        intercept: scores[0] || 50,
        trendType: 'stable',
        strength: 0,
        confidence: 0
      }
    }
    
    // Régression linéaire
    const x = Array.from({ length: n }, (_, i) => i)
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = scores.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((a, b, i) => a + b * scores[i], 0)
    const sumXX = x.reduce((a, b) => a + b * b, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // Calculer la force de la tendance (R²)
    const predicted = scores.map((_, i) => intercept + slope * i)
    const ssRes = scores.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0)
    const ssTot = scores.reduce((sum, y) => sum + Math.pow(y - sumY / n, 2), 0)
    const r2 = 1 - (ssRes / ssTot)
    
    let trendType: 'hausse' | 'baisse' | 'stable'
    if (slope > 0.5) trendType = 'hausse'
    else if (slope < -0.5) trendType = 'baisse'
    else trendType = 'stable'
    
    // Confiance basée sur R²
    const confidence = Math.min(95, Math.max(30, Math.round(r2 * 100)))
    const strength = Math.min(100, Math.round(Math.abs(slope) * 20))
    
    return {
      slope: Math.round(slope * 10) / 10,
      intercept: Math.round(intercept),
      trendType,
      strength,
      confidence
    }
  }

  // ============================================================
  // PRÉDICTION
  // ============================================================

  /**
   * Prédit les valeurs futures avec ajustement saisonnier
   */
  forecast(
    points: ScoreHistoryPoint[],
    horizon: number = 12,
    includeSeasonality: boolean = true
  ): ForecastPoint[] {
    const n = points.length
    
    if (n < MIN_DATA_POINTS) {
      // Prédiction simple
      const lastValue = points[points.length - 1]?.score || 50
      const forecast: ForecastPoint[] = []
      const now = new Date()
      
      for (let i = 1; i <= horizon; i++) {
        const date = new Date(now)
        date.setMonth(date.getMonth() + i)
        forecast.push({
          date: date.toISOString(),
          value: lastValue,
          lower: Math.max(0, lastValue - 10),
          upper: Math.min(100, lastValue + 10),
          components: { trend: lastValue, seasonal: 0, residual: 0 }
        })
      }
      return forecast
    }
    
    // Décomposition
    const decomposition = this.decompose(points, 30)
    const trendAnalysis = this.analyzeTrend(points)
    const seasonality = includeSeasonality ? this.detectSeasonality(points) : null
    
    // Prédiction de la tendance
    const lastIndex = n - 1
    const lastTrend = decomposition.trend[lastIndex]
    
    const forecast: ForecastPoint[] = []
    const now = new Date(points[points.length - 1].date)
    
    for (let h = 1; h <= horizon; h++) {
      // Tendance
      const trendValue = lastTrend + trendAnalysis.slope * h
      
      // Saisonnalité
      let seasonalValue = 0
      if (seasonality && seasonality.dominantPattern) {
        const pattern = seasonality.dominantPattern
        const phaseInCycle = (h % pattern.period) + pattern.phase
        seasonalValue = pattern.amplitude * Math.sin(2 * Math.PI * phaseInCycle / pattern.period)
      }
      
      const value = Math.min(100, Math.max(0, trendValue + seasonalValue))
      const uncertainty = 5 + Math.abs(trendAnalysis.slope) * h
      
      const date = new Date(now)
      date.setMonth(date.getMonth() + h)
      
      forecast.push({
        date: date.toISOString(),
        value: Math.round(value),
        lower: Math.max(0, Math.round(value - uncertainty)),
        upper: Math.min(100, Math.round(value + uncertainty)),
        components: {
          trend: Math.round(trendValue),
          seasonal: Math.round(seasonalValue),
          residual: 0
        }
      })
    }
    
    return forecast
  }

  // ============================================================
  // DÉTECTION DE POINTS DE CHANGEMENT
  // ============================================================

  /**
   * Détecte les points de changement significatifs
   */
  detectChangePoints(
    points: ScoreHistoryPoint[],
    threshold: number = 5
  ): { index: number; date: string; magnitude: number; direction: 'hausse' | 'baisse' }[] {
    const scores = points.map(p => p.score)
    const dates = points.map(p => p.date)
    const n = scores.length
    
    if (n < 5) return []
    
    const changePoints: { index: number; date: string; magnitude: number; direction: 'hausse' | 'baisse' }[] = []
    
    for (let i = 2; i < n - 2; i++) {
      const beforeAvg = (scores[i-2] + scores[i-1]) / 2
      const afterAvg = (scores[i+1] + scores[i+2]) / 2
      const delta = afterAvg - beforeAvg
      
      if (Math.abs(delta) >= threshold) {
        changePoints.push({
          index: i,
          date: dates[i],
          magnitude: Math.round(Math.abs(delta)),
          direction: delta > 0 ? 'hausse' : 'baisse'
        })
      }
    }
    
    return changePoints
  }

  // ============================================================
  // AIDE À LA DÉCISION
  // ============================================================

  /**
   * Recommande une action basée sur les patterns détectés
   */
  getRecommendation(points: ScoreHistoryPoint[]): {
    action: 'renforcer' | 'maintenir' | 'reduire' | 'surveiller'
    justification: string
    priority: 'haute' | 'moyenne' | 'basse'
  } {
    const trend = this.analyzeTrend(points)
    const seasonality = this.detectSeasonality(points)
    const lastValue = points[points.length - 1]?.score || 50
    
    let action: 'renforcer' | 'maintenir' | 'reduire' | 'surveiller' = 'maintenir'
    let justification = ''
    let priority: 'haute' | 'moyenne' | 'basse' = 'moyenne'
    
    if (trend.trendType === 'baisse' && trend.strength > 30) {
      action = 'renforcer'
      justification = `Tendance baissière forte (${trend.slope} pts/mois) - action requise`
      priority = 'haute'
    } else if (trend.trendType === 'hausse' && trend.strength > 30) {
      action = 'reduire'
      justification = `Tendance haussière forte (${trend.slope} pts/mois) - maintenir les bonnes pratiques`
      priority = 'basse'
    } else if (seasonality.dominantPattern && seasonality.dominantPattern.amplitude > 10) {
      action = 'surveiller'
      justification = `Variation saisonnière détectée (amplitude ${seasonality.dominantPattern.amplitude} pts)`
      priority = 'moyenne'
    } else if (lastValue < 40) {
      action = 'renforcer'
      justification = `Score bas (${lastValue}/100) - action recommandée`
      priority = 'haute'
    } else if (lastValue > 80) {
      action = 'maintenir'
      justification = `Score excellent (${lastValue}/100) - maintenir les efforts`
      priority = 'basse'
    } else {
      justification = 'Situation stable - poursuivre la surveillance'
    }
    
    return { action, justification, priority }
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  getLastDecomposition(): TimeSeriesDecomposition | null {
    return this.lastDecomposition
  }

  getLastPatterns(): TemporalPattern[] {
    return this.lastPatterns
  }

  reset(): void {
    this.lastDecomposition = null
    this.lastPatterns = []
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const temporalModel = new TemporalModel()