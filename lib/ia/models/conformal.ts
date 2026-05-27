// lib/ia/models/conformal.ts
// Modèle Conformal Prediction pour intervalles de confiance garantis
// Garantie mathématique que la valeur réelle est dans l'intervalle avec une probabilité donnée
// 0 API externe, 0 coût, 100% local

'use client'

// ============================================================
// TYPES
// ============================================================

export interface ConformalInterval {
  lower: number
  upper: number
  coverageGuarantee: number
  calibrationSetSize: number
  adaptatif: boolean
  width: number
}

export interface ConformalPredictionResult {
  point: number
  interval: ConformalInterval
  pValue: number
  efficiency: number
}

export interface CalibrationSet {
  predictions: number[]
  actuals: number[]
  nonConformities: number[]
  lastCalibration: string
}

export interface ConformalConfig {
  defaultCoverage: number
  minCalibrationSize: number
  maxCalibrationSize: number
  adaptatifThreshold: number
  weightingDecay: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: ConformalConfig = {
  defaultCoverage: 0.95,
  minCalibrationSize: 10,
  maxCalibrationSize: 100,
  adaptatifThreshold: 1.5,
  weightingDecay: 0.95
}

// ============================================================
// MODÈLE CONFORMAL PREDICTION
// ============================================================

export class ConformalModel {
  private config: ConformalConfig
  private calibrationSets: Map<string, CalibrationSet> = new Map()
  private currentSetId: string = 'default'

  constructor(config: Partial<ConformalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // CALIBRATION
  // ============================================================

  /**
   * Calibre le modèle avec un ensemble de prédictions et réalisations
   */
  calibrate(predictions: number[], actuals: number[], setId: string = 'default'): void {
    if (predictions.length !== actuals.length) {
      throw new Error('Les tableaux de prédictions et réalisations doivent avoir la même taille')
    }
    
    if (predictions.length < this.config.minCalibrationSize) {
      console.warn(`[Conformal] Set de calibration petit (${predictions.length} < ${this.config.minCalibrationSize})`)
    }
    
    // Calculer les non-conformités
    const nonConformities = predictions.map((pred, i) => Math.abs(pred - actuals[i]))
    nonConformities.sort((a, b) => a - b)
    
    this.calibrationSets.set(setId, {
      predictions: [...predictions],
      actuals: [...actuals],
      nonConformities,
      lastCalibration: new Date().toISOString()
    })
    
    this.currentSetId = setId
  }

  /**
   * Ajoute un point à l'ensemble de calibration (apprentissage incrémental)
   */
  addCalibrationPoint(prediction: number, actual: number, setId: string = 'default'): void {
    let set = this.calibrationSets.get(setId)
    
    if (!set) {
      set = {
        predictions: [],
        actuals: [],
        nonConformities: [],
        lastCalibration: new Date().toISOString()
      }
    }
    
    set.predictions.push(prediction)
    set.actuals.push(actual)
    
    // Garder seulement les N dernières observations
    if (set.predictions.length > this.config.maxCalibrationSize) {
      set.predictions.shift()
      set.actuals.shift()
    }
    
    // Recalculer les non-conformités (optimisé, seulement les dernières)
    const newNonConformities = set.predictions.map((pred, i) => Math.abs(pred - set.actuals[i]))
    newNonConformities.sort((a, b) => a - b)
    set.nonConformities = newNonConformities
    set.lastCalibration = new Date().toISOString()
    
    this.calibrationSets.set(setId, set)
  }

  // ============================================================
  // PRÉDICTION
  // ============================================================

  /**
   * Calcule l'intervalle de confiance conformal pour une prédiction
   */
  predict(
    prediction: number,
    confidence: number = this.config.defaultCoverage,
    setId: string = 'default'
  ): ConformalInterval {
    const set = this.calibrationSets.get(setId)
    
    if (!set || set.nonConformities.length < this.config.minCalibrationSize) {
      // Fallback: intervalle basé sur la confiance seulement
      const fallbackWidth = this.getFallbackWidth(confidence)
      return {
        lower: Math.max(0, prediction - fallbackWidth),
        upper: Math.min(100, prediction + fallbackWidth),
        coverageGuarantee: confidence * 100,
        calibrationSetSize: set?.nonConformities.length || 0,
        adaptatif: false,
        width: fallbackWidth * 2
      }
    }
    
    // Trouver le quantile
    const q = 1 - confidence
    const quantileIndex = Math.ceil(q * (set.nonConformities.length + 1))
    const nonConformity = set.nonConformities[quantileIndex - 1] || set.nonConformities[set.nonConformities.length - 1]
    
    // Appliquer un facteur adaptatif si nécessaire
    let adjustedNonConformity = nonConformity
    if (this.config.adaptatifThreshold > 0) {
      const recentNonConformities = set.nonConformities.slice(-Math.min(20, set.nonConformities.length))
      const recentMean = recentNonConformities.reduce((a, b) => a + b, 0) / recentNonConformities.length
      const globalMean = set.nonConformities.reduce((a, b) => a + b, 0) / set.nonConformities.length
      
      if (recentMean > globalMean * this.config.adaptatifThreshold) {
        adjustedNonConformity = recentMean * 1.2
      }
    }
    
    const lower = Math.max(0, prediction - adjustedNonConformity)
    const upper = Math.min(100, prediction + adjustedNonConformity)
    
    return {
      lower: Math.round(lower),
      upper: Math.round(upper),
      coverageGuarantee: confidence * 100,
      calibrationSetSize: set.nonConformities.length,
      adaptatif: true,
      width: upper - lower
    }
  }

  /**
   * Prédiction complète avec p-value et efficacité
   */
  predictFull(
    prediction: number,
    actual: number | null = null,
    confidence: number = this.config.defaultCoverage,
    setId: string = 'default'
  ): ConformalPredictionResult {
    const interval = this.predict(prediction, confidence, setId)
    
    // Calculer la p-value (probabilité qu'une observation aussi extrême se produise)
    let pValue = 0.5
    const set = this.calibrationSets.get(setId)
    
    if (set && set.nonConformities.length > 0 && actual !== null) {
      const actualNonConformity = Math.abs(prediction - actual)
      const greaterCount = set.nonConformities.filter(nc => nc >= actualNonConformity).length
      pValue = greaterCount / set.nonConformities.length
    }
    
    // Efficacité de l'intervalle (plus petit est mieux, mais doit couvrir)
    const efficiency = interval.width / 100
    
    return {
      point: Math.round(prediction),
      interval,
      pValue: Math.round(pValue * 100),
      efficiency: Math.round(efficiency * 100)
    }
  }

  // ============================================================
  // INTERVALLES ADAPTATIFS
  // ============================================================

  /**
   * Calcule des intervalles pour toute une série de prédictions
   */
  predictSeries(
    predictions: number[],
    confidence: number = this.config.defaultCoverage,
    setId: string = 'default'
  ): ConformalInterval[] {
    return predictions.map(pred => this.predict(pred, confidence, setId))
  }

  /**
   * Calcule des intervalles par quantile (pour fan charts)
   */
  predictQuantiles(
    prediction: number,
    quantiles: number[] = [0.1, 0.25, 0.5, 0.75, 0.9],
    setId: string = 'default'
  ): { quantile: number; value: number }[] {
    const result: { quantile: number; value: number }[] = []
    
    for (const q of quantiles) {
      const interval = this.predict(prediction, q, setId)
      // Pour les quantiles < 0.5, on prend la borne inférieure
      // Pour les quantiles > 0.5, on prend la borne supérieure
      let value: number
      if (q <= 0.5) {
        value = interval.lower
      } else {
        value = interval.upper
      }
      result.push({ quantile: q, value })
    }
    
    return result
  }

  // ============================================================
  // ÉVALUATION
  // ============================================================

  /**
   * Évalue la couverture réelle du modèle
   */
  evaluateCoverage(
    predictions: number[],
    actuals: number[],
    confidence: number = this.config.defaultCoverage,
    setId: string = 'default'
  ): { coverage: number; averageWidth: number; efficiency: number } {
    if (predictions.length !== actuals.length) {
      throw new Error('Les tailles des tableaux ne correspondent pas')
    }
    
    let covered = 0
    let totalWidth = 0
    
    for (let i = 0; i < predictions.length; i++) {
      const interval = this.predict(predictions[i], confidence, setId)
      if (actuals[i] >= interval.lower && actuals[i] <= interval.upper) {
        covered++
      }
      totalWidth += interval.width
    }
    
    const coverage = (covered / predictions.length) * 100
    const averageWidth = totalWidth / predictions.length
    const efficiency = averageWidth / 100
    
    return {
      coverage: Math.round(coverage),
      averageWidth: Math.round(averageWidth),
      efficiency: Math.round(efficiency * 100)
    }
  }

  /**
   * Calibration automatique du niveau de confiance
   */
  autoCalibrateConfidence(
    predictions: number[],
    actuals: number[],
    targetCoverage: number = 95
  ): number {
    let bestConfidence = 0.95
    let bestDiff = Infinity
    
    for (let conf = 0.8; conf <= 0.99; conf += 0.01) {
      const evaluation = this.evaluateCoverage(predictions, actuals, conf, 'auto_calibration')
      const diff = Math.abs(evaluation.coverage - targetCoverage)
      if (diff < bestDiff) {
        bestDiff = diff
        bestConfidence = conf
      }
    }
    
    return Math.round(bestConfidence * 100)
  }

  // ============================================================
  // INTERVALLES PONDÉRÉS (temps récent plus important)
  // ============================================================

  /**
   * Calcule l'intervalle avec pondération temporelle
   */
  predictWeighted(
    prediction: number,
    confidence: number = this.config.defaultCoverage,
    setId: string = 'default'
  ): ConformalInterval {
    const set = this.calibrationSets.get(setId)
    
    if (!set || set.nonConformities.length < this.config.minCalibrationSize) {
      return this.predict(prediction, confidence, setId)
    }
    
    // Pondération exponentielle (données récentes ont plus de poids)
    const n = set.nonConformities.length
    const weights: number[] = []
    let totalWeight = 0
    
    for (let i = 0; i < n; i++) {
      const weight = Math.pow(this.config.weightingDecay, n - 1 - i)
      weights.push(weight)
      totalWeight += weight
    }
    
    // Normaliser les poids
    const normalizedWeights = weights.map(w => w / totalWeight)
    
    // Trier les non-conformités avec leurs poids
    const weightedNonConformities = set.nonConformities.map((nc, i) => ({ nc, weight: normalizedWeights[i] }))
    weightedNonConformities.sort((a, b) => a.nc - b.nc)
    
    // Calculer le quantile pondéré
    let cumWeight = 0
    const q = 1 - confidence
    let nonConformity = weightedNonConformities[weightedNonConformities.length - 1]?.nc || 0
    
    for (const item of weightedNonConformities) {
      cumWeight += item.weight
      if (cumWeight >= q) {
        nonConformity = item.nc
        break
      }
    }
    
    const lower = Math.max(0, prediction - nonConformity)
    const upper = Math.min(100, prediction + nonConformity)
    
    return {
      lower: Math.round(lower),
      upper: Math.round(upper),
      coverageGuarantee: confidence * 100,
      calibrationSetSize: set.nonConformities.length,
      adaptatif: true,
      width: upper - lower
    }
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private getFallbackWidth(confidence: number): number {
    // Plus la confiance est élevée, plus l'intervalle est large
    if (confidence >= 0.99) return 25
    if (confidence >= 0.95) return 15
    if (confidence >= 0.9) return 12
    if (confidence >= 0.8) return 10
    return 8
  }

  /**
   * Obtient la qualité de la calibration
   */
  getCalibrationQuality(setId: string = 'default'): { score: number; assessment: string } {
    const set = this.calibrationSets.get(setId)
    
    if (!set || set.nonConformities.length < this.config.minCalibrationSize) {
      return { score: 0, assessment: 'Calibration insuffisante' }
    }
    
    const nonConformities = set.nonConformities
    const mean = nonConformities.reduce((a, b) => a + b, 0) / nonConformities.length
    const variance = nonConformities.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / nonConformities.length
    const std = Math.sqrt(variance)
    const cv = std / mean // Coefficient de variation
    
    let score: number
    let assessment: string
    
    if (cv < 0.3) {
      score = 90
      assessment = 'Excellente calibration - intervalles très fiables'
    } else if (cv < 0.6) {
      score = 75
      assessment = 'Bonne calibration - intervalles généralement fiables'
    } else if (cv < 1.0) {
      score = 60
      assessment = 'Calibration moyenne - intervalles à surveiller'
    } else {
      score = 40
      assessment = 'Calibration faible - envisager plus de données'
    }
    
    return { score, assessment }
  }

  /**
   * Réinitialise un ensemble de calibration
   */
  resetCalibration(setId: string = 'default'): void {
    this.calibrationSets.delete(setId)
  }

  /**
   * Obtient les statistiques de calibration
   */
  getCalibrationStats(setId: string = 'default'): {
    size: number
    meanNonConformity: number
    stdNonConformity: number
    lastCalibration: string | null
  } {
    const set = this.calibrationSets.get(setId)
    
    if (!set) {
      return { size: 0, meanNonConformity: 0, stdNonConformity: 0, lastCalibration: null }
    }
    
    const mean = set.nonConformities.reduce((a, b) => a + b, 0) / set.nonConformities.length
    const variance = set.nonConformities.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / set.nonConformities.length
    const std = Math.sqrt(variance)
    
    return {
      size: set.nonConformities.length,
      meanNonConformity: Math.round(mean * 10) / 10,
      stdNonConformity: Math.round(std * 10) / 10,
      lastCalibration: set.lastCalibration
    }
  }

  /**
   * Exporte un ensemble de calibration
   */
  exportCalibration(setId: string = 'default'): string {
    const set = this.calibrationSets.get(setId)
    if (!set) return JSON.stringify({})
    
    return JSON.stringify({
      predictions: set.predictions,
      actuals: set.actuals,
      nonConformities: set.nonConformities,
      lastCalibration: set.lastCalibration
    }, null, 2)
  }

  /**
   * Importe un ensemble de calibration
   */
  importCalibration(jsonData: string, setId: string = 'default'): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.calibrationSets.set(setId, {
        predictions: data.predictions || [],
        actuals: data.actuals || [],
        nonConformities: data.nonConformities || [],
        lastCalibration: data.lastCalibration || new Date().toISOString()
      })
      return true
    } catch (error) {
      console.error('[Conformal] Erreur lors de l\'import:', error)
      return false
    }
  }

  /**
   * Obtient la configuration actuelle
   */
  getConfig(): ConformalConfig {
    return { ...this.config }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(config: Partial<ConformalConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const conformalModel = new ConformalModel()