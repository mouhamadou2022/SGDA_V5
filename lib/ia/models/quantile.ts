// lib/ia/models/quantile.ts
// Modèle de régression quantile pour prédictions avec distribution
// Version améliorée avec conformal prediction et intervalles adaptatifs
// 0 API externe, 0 coût, 100% local

'use client'

// ============================================================
// TYPES
// ============================================================

export interface QuantilePrediction {
  q10: number
  q25: number
  q50: number
  q75: number
  q90: number
  q95: number
  q99: number
  asymetrie: 'haussiere' | 'baissiere' | 'symetrique'
  iqr: number
  outlierThreshold: {
    low: number
    high: number
  }
}

export interface ConformalInterval {
  lower: number
  upper: number
  coverageGuarantee: number
  calibrationSetSize: number
  adaptatif: boolean
}

export interface DistributionStats {
  mean: number
  median: number
  mode: number
  variance: number
  skewness: number
  kurtosis: number
}

export interface PredictionWithDistribution {
  point: number
  quantiles: QuantilePrediction
  conformal: ConformalInterval
  distribution: DistributionStats
  confidence: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
const DEFAULT_CONFIDENCE = 0.95
const MIN_CALIBRATION_SIZE = 10

// ============================================================
// MODÈLE DE RÉGRESSION QUANTILE
// ============================================================

export class QuantileModel {
  private calibrationSet: { pred: number; actual: number }[] = []
  private lastCalibration: Date | null = null

  /**
   * Calcule les quantiles à partir d'une série temporelle
   */
  predictQuantiles(
    historique: number[],
    horizon: number = 1,
    quantiles: number[] = DEFAULT_QUANTILES
  ): QuantilePrediction {
    if (historique.length < 4) {
      const mean = historique.length > 0 ? historique[historique.length - 1] : 50
      const defaultValue = 15
      
      return {
        q10: Math.max(0, mean - defaultValue * 1.5),
        q25: Math.max(0, mean - defaultValue),
        q50: mean,
        q75: Math.min(100, mean + defaultValue),
        q90: Math.min(100, mean + defaultValue * 1.5),
        q95: Math.min(100, mean + defaultValue * 1.8),
        q99: Math.min(100, mean + defaultValue * 2),
        asymetrie: 'symetrique',
        iqr: defaultValue * 2,
        outlierThreshold: {
          low: Math.max(0, mean - defaultValue * 3),
          high: Math.min(100, mean + defaultValue * 3)
        }
      }
    }
    
    // Calcul de la tendance locale
    const n = historique.length
    const x = Array.from({ length: n }, (_, i) => i)
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = historique.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((a, b, i) => a + b * historique[i], 0)
    const sumXX = x.reduce((a, b) => a + b * b, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    const prediction = intercept + slope * (n + horizon - 1)
    
    // Calcul des résidus pour la distribution
    const residuals: number[] = []
    for (let i = 0; i < n; i++) {
      const fitted = intercept + slope * i
      residuals.push(historique[i] - fitted)
    }
    
    const sortedResiduals = [...residuals].sort((a, b) => a - b)
    
    const getQuantile = (p: number): number => {
      const idx = Math.floor(p * (sortedResiduals.length - 1))
      return sortedResiduals[Math.max(0, Math.min(sortedResiduals.length - 1, idx))]
    }
    
    // Calcul des quantiles
    const q10 = prediction + getQuantile(0.1)
    const q25 = prediction + getQuantile(0.25)
    const q50 = prediction + getQuantile(0.5)
    const q75 = prediction + getQuantile(0.75)
    const q90 = prediction + getQuantile(0.9)
    const q95 = prediction + getQuantile(0.95)
    const q99 = prediction + getQuantile(0.99)
    
    // Asymétrie
    const q1 = q25
    const q3 = q75
    const median = q50
    const asymetrie = (q3 - median) - (median - q1)
    
    let asymType: 'haussiere' | 'baissiere' | 'symetrique' = 'symetrique'
    if (asymetrie > 2) asymType = 'haussiere'
    else if (asymetrie < -2) asymType = 'baissiere'
    
    const iqr = q3 - q1
    
    return {
      q10: Math.min(100, Math.max(0, Math.round(q10))),
      q25: Math.min(100, Math.max(0, Math.round(q25))),
      q50: Math.min(100, Math.max(0, Math.round(q50))),
      q75: Math.min(100, Math.max(0, Math.round(q75))),
      q90: Math.min(100, Math.max(0, Math.round(q90))),
      q95: Math.min(100, Math.max(0, Math.round(q95))),
      q99: Math.min(100, Math.max(0, Math.round(q99))),
      asymetrie: asymType,
      iqr: Math.round(iqr),
      outlierThreshold: {
        low: Math.min(100, Math.max(0, Math.round(q10 - iqr * 1.5))),
        high: Math.min(100, Math.max(0, Math.round(q90 + iqr * 1.5)))
      }
    }
  }

  /**
   * Prédiction avec intervalle de confiance conformal
   */
  predictWithConformal(
    historique: number[],
    horizon: number = 1,
    confidence: number = DEFAULT_CONFIDENCE
  ): ConformalInterval {
    if (this.calibrationSet.length < MIN_CALIBRATION_SIZE) {
      // Fallback sur la méthode classique
      const quantiles = this.predictQuantiles(historique, horizon)
      const halfWidth = (quantiles.q90 - quantiles.q10) / 2
      
      return {
        lower: Math.max(0, quantiles.q50 - halfWidth),
        upper: Math.min(100, quantiles.q50 + halfWidth),
        coverageGuarantee: confidence * 100,
        calibrationSetSize: this.calibrationSet.length,
        adaptatif: false
      }
    }
    
    // Calculer les non-conformités sur le set de calibration
    const nonConformities = this.calibrationSet.map(
      item => Math.abs(item.pred - item.actual)
    )
    nonConformities.sort((a, b) => a - b)
    
    const quantileIndex = Math.ceil((1 - confidence) * (nonConformities.length + 1))
    const q = nonConformities[quantileIndex - 1] || nonConformities[nonConformities.length - 1]
    
    // Prédiction ponctuelle
    const pointPrediction = this.predictQuantiles(historique, horizon).q50
    
    return {
      lower: Math.max(0, pointPrediction - q),
      upper: Math.min(100, pointPrediction + q),
      coverageGuarantee: confidence * 100,
      calibrationSetSize: this.calibrationSet.length,
      adaptatif: true
    }
  }

  /**
   * Prédiction complète avec distribution
   */
  predictFull(
    historique: number[],
    horizon: number = 1,
    confidence: number = DEFAULT_CONFIDENCE
  ): PredictionWithDistribution {
    const quantiles = this.predictQuantiles(historique, horizon)
    const conformal = this.predictWithConformal(historique, horizon, confidence)
    const distribution = this.computeDistribution(historique)
    
    // Calcul du niveau de confiance basé sur la stabilité
    let confidenceScore = 70
    
    if (historique.length >= 12) confidenceScore += 10
    if (this.calibrationSet.length >= 20) confidenceScore += 10
    if (quantiles.iqr < 20) confidenceScore += 10
    if (Math.abs(distribution.skewness) < 0.5) confidenceScore += 5
    
    return {
      point: quantiles.q50,
      quantiles,
      conformal,
      distribution,
      confidence: Math.min(95, confidenceScore)
    }
  }

  /**
   * Calcule les statistiques de distribution
   */
  computeDistribution(values: number[]): DistributionStats {
    if (values.length === 0) {
      return {
        mean: 0,
        median: 0,
        mode: 0,
        variance: 0,
        skewness: 0,
        kurtosis: 0
      }
    }
    
    const n = values.length
    const mean = values.reduce((a, b) => a + b, 0) / n
    
    // Médiane
    const sorted = [...values].sort((a, b) => a - b)
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)]
    
    // Mode (estimation simple)
    const buckets = new Map<number, number>()
    for (const v of values) {
      const bucket = Math.round(v / 10) * 10
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
    }
    let mode = mean
    let maxCount = 0
    for (const [bucket, count] of buckets) {
      if (count > maxCount) {
        maxCount = count
        mode = bucket + 5
      }
    }
    
    // Variance, skewness, kurtosis
    let variance = 0
    let m3 = 0
    let m4 = 0
    
    for (const v of values) {
      const diff = v - mean
      variance += diff * diff
      m3 += diff * diff * diff
      m4 += diff * diff * diff * diff
    }
    
    variance /= n
    const std = Math.sqrt(variance)
    const skewness = n > 2 ? m3 / (n * std * std * std) : 0
    const kurtosis = n > 3 ? m4 / (n * variance * variance) - 3 : 0
    
    return {
      mean: Math.round(mean * 10) / 10,
      median: Math.round(median),
      mode: Math.round(mode),
      variance: Math.round(variance * 10) / 10,
      skewness: Math.round(skewness * 100) / 100,
      kurtosis: Math.round(kurtosis * 100) / 100
    }
  }

  // ============================================================
  // CALIBRATION ET APPRENTISSAGE
  // ============================================================

  /**
   * Calibre le modèle avec des données réelles
   */
  calibrate(predictions: number[], actuals: number[]): void {
    if (predictions.length !== actuals.length) {
      throw new Error('Les tableaux de prédictions et réalisations doivent avoir la même taille')
    }
    
    for (let i = 0; i < predictions.length; i++) {
      this.calibrationSet.push({ pred: predictions[i], actual: actuals[i] })
    }
    
    // Garder seulement les 100 dernières observations
    if (this.calibrationSet.length > 100) {
      this.calibrationSet = this.calibrationSet.slice(-100)
    }
    
    this.lastCalibration = new Date()
  }

  /**
   * Évalue la qualité de la calibration
   */
  evaluateCalibration(): {
    mae: number
    rmse: number
    coverage: number
    calibrationError: number
  } {
    if (this.calibrationSet.length === 0) {
      return { mae: 0, rmse: 0, coverage: 0, calibrationError: 0 }
    }
    
    let totalAbsError = 0
    let totalSqError = 0
    let covered = 0
    
    for (const item of this.calibrationSet) {
      const error = Math.abs(item.pred - item.actual)
      totalAbsError += error
      totalSqError += error * error
      
      // Vérifier si la valeur réelle est dans l'intervalle de confiance
      const interval = this.predictWithConformal(
        [item.pred],
        1,
        DEFAULT_CONFIDENCE
      )
      if (item.actual >= interval.lower && item.actual <= interval.upper) {
        covered++
      }
    }
    
    const mae = totalAbsError / this.calibrationSet.length
    const rmse = Math.sqrt(totalSqError / this.calibrationSet.length)
    const coverage = (covered / this.calibrationSet.length) * 100
    const calibrationError = coverage - DEFAULT_CONFIDENCE * 100
    
    return {
      mae: Math.round(mae * 10) / 10,
      rmse: Math.round(rmse * 10) / 10,
      coverage: Math.round(coverage),
      calibrationError: Math.round(calibrationError)
    }
  }

  // ============================================================
  // DÉTECTION D'ANOMALIES
  // ============================================================

  /**
   * Détecte les valeurs aberrantes
   */
  detectOutliers(values: number[]): {
    outliers: number[]
    indices: number[]
    severity: ('faible' | 'modere' | 'eleve')[]
  } {
    const quantiles = this.predictQuantiles(values)
    const { low, high } = quantiles.outlierThreshold
    const iqr = quantiles.iqr
    
    const outliers: number[] = []
    const indices: number[] = []
    const severity: ('faible' | 'modere' | 'eleve')[] = []
    
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (v < low || v > high) {
        outliers.push(v)
        indices.push(i)
        
        const distanceToThreshold = Math.min(
          Math.abs(v - low),
          Math.abs(v - high)
        )
        if (distanceToThreshold > iqr * 2) {
          severity.push('eleve')
        } else if (distanceToThreshold > iqr) {
          severity.push('modere')
        } else {
          severity.push('faible')
        }
      }
    }
    
    return { outliers, indices, severity }
  }

  /**
   * Calcule l'intervalle de prédiction adaptatif
   */
  adaptiveInterval(
    values: number[],
    volatilityFactor: number = 1
  ): { lower: number[]; upper: number[] } {
    const lower: number[] = []
    const upper: number[] = []
    
    for (let i = 0; i < values.length; i++) {
      const windowValues = values.slice(Math.max(0, i - 5), i + 1)
      const quantiles = this.predictQuantiles(windowValues, 0)
      
      const localVolatility = this.computeDistribution(windowValues).variance / 100
      const adjustedFactor = volatilityFactor * (1 + localVolatility)
      
      lower.push(Math.max(0, quantiles.q25 - quantiles.iqr * adjustedFactor))
      upper.push(Math.min(100, quantiles.q75 + quantiles.iqr * adjustedFactor))
    }
    
    return { lower, upper }
  }

  // ============================================================
  // VISUALISATION
  // ============================================================

  /**
   * Génère les données pour un fan chart (graphique de prédiction)
   */
  generateFanChartData(
    historique: number[],
    horizon: number = 6
  ): {
    dates: string[]
    historique: (number | null)[]
    predictions: (number | null)[]
    lower90: (number | null)[]
    upper90: (number | null)[]
    lower50: (number | null)[]
    upper50: (number | null)[]
  } {
    const result: {
      dates: string[]
      historique: (number | null)[]
      predictions: (number | null)[]
      lower90: (number | null)[]
      upper90: (number | null)[]
      lower50: (number | null)[]
      upper50: (number | null)[]
    } = {
      dates: [],
      historique: [],
      predictions: [],
      lower90: [],
      upper90: [],
      lower50: [],
      upper50: []
    }
    
    // Données historiques
    for (let i = 0; i < historique.length; i++) {
      result.dates.push(`t-${historique.length - i}`)
      result.historique.push(historique[i])
      result.predictions.push(null)
      result.lower90.push(null)
      result.upper90.push(null)
      result.lower50.push(null)
      result.upper50.push(null)
    }
    
    // Prédictions
    for (let h = 1; h <= horizon; h++) {
      const quantiles = this.predictQuantiles(historique, h)
      
      result.dates.push(`t+${h}`)
      result.historique.push(null)
      result.predictions.push(quantiles.q50)
      result.lower90.push(quantiles.q10)
      result.upper90.push(quantiles.q90)
      result.lower50.push(quantiles.q25)
      result.upper50.push(quantiles.q75)
    }
    
    return result
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  /**
   * Obtient la calibration set actuelle
   */
  getCalibrationSet(): { pred: number; actual: number }[] {
    return [...this.calibrationSet]
  }

  /**
   * Réinitialise la calibration
   */
  resetCalibration(): void {
    this.calibrationSet = []
    this.lastCalibration = null
  }

  /**
   * Obtient la date de dernière calibration
   */
  getLastCalibration(): Date | null {
    return this.lastCalibration
  }

  /**
   * Exporte la calibration pour sauvegarde
   */
  exportCalibration(): string {
    return JSON.stringify({
      calibrationSet: this.calibrationSet,
      lastCalibration: this.lastCalibration?.toISOString(),
    }, null, 2)
  }

  /**
   * Importe une calibration sauvegardée
   */
  importCalibration(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.calibrationSet = data.calibrationSet || []
      this.lastCalibration = data.lastCalibration ? new Date(data.lastCalibration) : null
      return true
    } catch (error) {
      console.error('[QuantileModel] Erreur lors de l\'import:', error)
      return false
    }
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const quantileModel = new QuantileModel()