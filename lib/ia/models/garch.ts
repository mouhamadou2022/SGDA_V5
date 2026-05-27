// lib/ia/models/garch.ts
// Modèle GARCH (Generalized Autoregressive Conditional Heteroskedasticity)
// Modélisation de la volatilité et des chocs dans les séries de risque
// 0 API externe, 0 coût, 100% local

'use client'

import { ScoreHistoryPoint } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface GARCHResult {
  conditionalVariance: number[]
  volatility: number[]
  residuals: number[]
  alpha: number
  beta: number
  omega: number
  persistence: number
  halfLife: number
}

export interface VolatilityForecast {
  pointForecast: number
  interval: { lower: number; upper: number }
  horizon: number
  confidence: number
}

export interface ShockAnalysis {
  shockMagnitude: number
  impactDuration: number
  recoveryTime: number
  peakVolatility: number
  areaUnderCurve: number
}

export interface GARCHConfig {
  maxIterations: number
  tolerance: number
  p: number // ARCH order
  q: number // GARCH order
  initialAlpha: number
  initialBeta: number
  initialOmega: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: GARCHConfig = {
  maxIterations: 500,
  tolerance: 1e-6,
  p: 1,
  q: 1,
  initialAlpha: 0.1,
  initialBeta: 0.8,
  initialOmega: 0.1
}

const STATIONARITY_THRESHOLD = 0.999
const MIN_DATA_POINTS = 20

// ============================================================
// MODÈLE GARCH
// ============================================================

export class GARCHModel {
  private config: GARCHConfig
  private lastResult: GARCHResult | null = null
  private lastFitDate: Date | null = null

  constructor(config: Partial<GARCHConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // ESTIMATION DU MODÈLE
  // ============================================================

  /**
   * Estime les paramètres GARCH sur une série de rendements
   */
  fit(returns: number[]): GARCHResult {
    const n = returns.length
    
    if (n < MIN_DATA_POINTS) {
      throw new Error(`Pas assez de données: besoin de ${MIN_DATA_POINTS}, reçu ${n}`)
    }
    
    let alpha = this.config.initialAlpha
    let beta = this.config.initialBeta
    let omega = this.config.initialOmega
    
    // Maximisation de la vraisemblance (algorithme simplifié)
    let prevLogLikelihood = -Infinity
    
    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      // Calcul des variances conditionnelles
      const conditionalVariance: number[] = []
      const residuals: number[] = []
      
      // Variance initiale
      let currentVariance = omega / (1 - alpha - beta)
      if (currentVariance <= 0) currentVariance = 1
      
      for (let t = 0; t < n; t++) {
        conditionalVariance.push(currentVariance)
        const residual = returns[t]
        residuals.push(residual)
        currentVariance = omega + alpha * residual * residual + beta * currentVariance
        if (currentVariance <= 0) currentVariance = 1e-6
      }
      
      // Log-vraisemblance (distribution normale)
      let logLikelihood = 0
      for (let t = 0; t < n; t++) {
        logLikelihood += -0.5 * Math.log(2 * Math.PI * conditionalVariance[t]) - 
                         0.5 * (returns[t] * returns[t]) / conditionalVariance[t]
      }
      
      // Vérifier la convergence
      if (Math.abs(logLikelihood - prevLogLikelihood) < this.config.tolerance) {
        break
      }
      prevLogLikelihood = logLikelihood
      
      // Mise à jour des paramètres (gradient ascendant simplifié)
      const gradient = this.computeGradient(returns, conditionalVariance, alpha, beta, omega)
      const stepSize = 0.001
      
      alpha += stepSize * gradient.dAlpha
      beta += stepSize * gradient.dBeta
      omega += stepSize * gradient.dOmega
      
      // Contraintes de stationnarité
      alpha = Math.max(0.01, Math.min(0.5, alpha))
      beta = Math.max(0.5, Math.min(0.99, beta))
      omega = Math.max(0.0001, Math.min(1, omega))
    }
    
    // Calcul final des variances
    const conditionalVariance: number[] = []
    const residuals: number[] = []
    let currentVariance = omega / (1 - alpha - beta)
    if (currentVariance <= 0) currentVariance = 1
    
    for (let t = 0; t < n; t++) {
      conditionalVariance.push(currentVariance)
      const residual = returns[t]
      residuals.push(residual)
      currentVariance = omega + alpha * residual * residual + beta * currentVariance
      if (currentVariance <= 0) currentVariance = 1e-6
    }
    
    const volatility = conditionalVariance.map(v => Math.sqrt(v) * 100)
    const persistence = alpha + beta
    const halfLife = persistence < 1 ? Math.log(0.5) / Math.log(persistence) : Infinity
    
    const result: GARCHResult = {
      conditionalVariance,
      volatility,
      residuals,
      alpha: Math.round(alpha * 1000) / 1000,
      beta: Math.round(beta * 1000) / 1000,
      omega: Math.round(omega * 1000) / 1000,
      persistence: Math.round(persistence * 1000) / 1000,
      halfLife: Math.round(halfLife)
    }
    
    this.lastResult = result
    this.lastFitDate = new Date()
    
    return result
  }

  private computeGradient(
    returns: number[],
    variances: number[],
    alpha: number,
    beta: number,
    omega: number
  ): { dAlpha: number; dBeta: number; dOmega: number } {
    // Gradient approximé par différences finies
    const epsilon = 1e-5
    const currentLL = this.computeLogLikelihood(returns, variances)
    
    const llAlpha = this.computeLogLikelihoodWithParams(returns, alpha + epsilon, beta, omega)
    const llBeta = this.computeLogLikelihoodWithParams(returns, alpha, beta + epsilon, omega)
    const llOmega = this.computeLogLikelihoodWithParams(returns, alpha, beta, omega + epsilon)
    
    return {
      dAlpha: (llAlpha - currentLL) / epsilon,
      dBeta: (llBeta - currentLL) / epsilon,
      dOmega: (llOmega - currentLL) / epsilon
    }
  }

  private computeLogLikelihood(returns: number[], variances: number[]): number {
    let ll = 0
    for (let t = 0; t < returns.length; t++) {
      ll += -0.5 * Math.log(2 * Math.PI * variances[t]) - 
            0.5 * (returns[t] * returns[t]) / variances[t]
    }
    return ll
  }

  private computeLogLikelihoodWithParams(
    returns: number[],
    alpha: number,
    beta: number,
    omega: number
  ): number {
    let currentVariance = omega / (1 - alpha - beta)
    if (currentVariance <= 0) currentVariance = 1
    let ll = 0
    
    for (let t = 0; t < returns.length; t++) {
      ll += -0.5 * Math.log(2 * Math.PI * currentVariance) - 
            0.5 * (returns[t] * returns[t]) / currentVariance
      currentVariance = omega + alpha * returns[t] * returns[t] + beta * currentVariance
      if (currentVariance <= 0) currentVariance = 1e-6
    }
    
    return ll
  }

  // ============================================================
  // PRÉDICTION DE VOLATILITÉ
  // ============================================================

  /**
   * Prédit la volatilité future
   */
  forecastVolatility(
    returns: number[],
    horizon: number = 30,
    confidence: number = 0.95
  ): VolatilityForecast[] {
    if (!this.lastResult) {
      this.fit(returns)
    }
    
    const result = this.lastResult!
    const forecasts: VolatilityForecast[] = []
    
    let currentVariance = result.conditionalVariance[result.conditionalVariance.length - 1]
    const unconditionalVariance = result.omega / (1 - result.alpha - result.beta)
    
    for (let h = 1; h <= horizon; h++) {
      const predictedVariance = unconditionalVariance + 
        Math.pow(result.alpha + result.beta, h) * (currentVariance - unconditionalVariance)
      
      const predictedVol = Math.sqrt(predictedVariance) * 100
      const stdError = predictedVol * 0.2 // Approximation
      const z = 1.96 // 95% confiance
      
      forecasts.push({
        pointForecast: Math.round(predictedVol),
        interval: {
          lower: Math.max(0, Math.round(predictedVol - z * stdError)),
          upper: Math.min(200, Math.round(predictedVol + z * stdError))
        },
        horizon: h,
        confidence: confidence * 100
      })
    }
    
    return forecasts
  }

  // ============================================================
  // ANALYSE DES CHOCS
  // ============================================================

  /**
   * Analyse l'impact d'un choc sur la volatilité
   */
  analyzeShock(
    returns: number[],
    shockSize: number = 2 // écart-type
  ): ShockAnalysis {
    if (!this.lastResult) {
      this.fit(returns)
    }
    
    const result = this.lastResult!
    const currentVariance = result.conditionalVariance[result.conditionalVariance.length - 1]
    const shock = shockSize * Math.sqrt(currentVariance)
    
    const unconditionalVariance = result.omega / (1 - result.alpha - result.beta)
    
    // Impact du choc
    let impactVariance = currentVariance + result.alpha * shock * shock
    let halfLifeReached = false
    let recoveryTime = 0
    let peakVolatility = Math.sqrt(impactVariance) * 100
    
    for (let t = 1; t <= 100; t++) {
      impactVariance = result.omega + result.alpha * shock * shock + result.beta * impactVariance
      const impactVol = Math.sqrt(impactVariance) * 100
      
      if (!halfLifeReached && impactVol <= peakVolatility / 2) {
        halfLifeReached = true
        recoveryTime = t
      }
    }
    
    // Aire sous la courbe d'impact
    let areaUnderCurve = 0
    let tempVariance = currentVariance + result.alpha * shock * shock
    for (let t = 0; t < 50; t++) {
      areaUnderCurve += Math.sqrt(tempVariance) * 100
      tempVariance = result.omega + result.alpha * shock * shock + result.beta * tempVariance
    }
    
    return {
      shockMagnitude: Math.round(shock * 100),
      impactDuration: Math.ceil(Math.log(0.01) / Math.log(result.persistence)),
      recoveryTime,
      peakVolatility: Math.round(peakVolatility),
      areaUnderCurve: Math.round(areaUnderCurve)
    }
  }

  // ============================================================
  // PRÉPARATION DES DONNÉES
  // ============================================================

  /**
   * Convertit les scores de risque en rendements (log-rendements)
   */
  scoresToReturns(scores: number[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < scores.length; i++) {
      if (scores[i-1] > 0) {
        const ret = Math.log(scores[i] / scores[i-1])
        returns.push(ret)
      } else {
        returns.push(0)
      }
    }
    return returns
  }

  /**
   * Calibre le modèle sur une série de scores
   */
  calibrateOnScores(points: ScoreHistoryPoint[]): GARCHResult {
    const scores = points.map(p => p.score)
    const returns = this.scoresToReturns(scores)
    return this.fit(returns)
  }

  // ============================================================
  // INTERPRÉTATION
  // ============================================================

  /**
   * Interprète les résultats du modèle
   */
  interpret(): {
    regime: 'stable' | 'modere' | 'volatile' | 'tres_volatile'
    persistence: string
    recommendations: string[]
  } {
    if (!this.lastResult) {
      return {
        regime: 'stable',
        persistence: 'non calculée',
        recommendations: ['Calculez d\'abord le modèle']
      }
    }
    
    const volatility = this.lastResult.volatility
    const avgVolatility = volatility.reduce((a, b) => a + b, 0) / volatility.length
    const maxVolatility = Math.max(...volatility)
    
    let regime: 'stable' | 'modere' | 'volatile' | 'tres_volatile'
    let recommendations: string[] = []
    
    if (avgVolatility < 5) {
      regime = 'stable'
      recommendations.push('Volatilité très faible - situation maîtrisée')
    } else if (avgVolatility < 10) {
      regime = 'modere'
      recommendations.push('Volatilité modérée - surveillance normale')
    } else if (avgVolatility < 20) {
      regime = 'volatile'
      recommendations.push('Volatilité élevée - renforcer les contrôles')
      recommendations.push('Analyser les causes de la variabilité')
    } else {
      regime = 'tres_volatile'
      recommendations.push('Volatilité critique - action immédiate requise')
      recommendations.push('Audit approfondi recommandé')
    }
    
    if (maxVolatility > 30) {
      recommendations.push('Pic de volatilité détecté - analyser l\'événement déclencheur')
    }
    
    let persistence: string
    if (this.lastResult.persistence < 0.7) {
      persistence = 'faible (chocs s\'estompent rapidement)'
    } else if (this.lastResult.persistence < 0.9) {
      persistence = 'modérée (chocs persistent quelques mois)'
    } else {
      persistence = 'forte (chocs durables - effet mémoire)'
      recommendations.push('Effet mémoire fort - renforcer la résilience')
    }
    
    return { regime, persistence, recommendations }
  }

  /**
   * Détecte les périodes de stress
   */
  detectStressPeriods(thresholdPercentile: number = 90): {
    indices: number[]
    dates: string[]
    severity: ('faible' | 'modere' | 'eleve')[]
  } {
    if (!this.lastResult) {
      return { indices: [], dates: [], severity: [] }
    }
    
    const volatilities = this.lastResult.volatility
    const threshold = this.percentile(volatilities, thresholdPercentile)
    
    const indices: number[] = []
    const severity: ('faible' | 'modere' | 'eleve')[] = []
    
    for (let i = 0; i < volatilities.length; i++) {
      if (volatilities[i] > threshold) {
        indices.push(i)
        
        let sev: 'faible' | 'modere' | 'eleve'
        if (volatilities[i] > threshold * 1.5) sev = 'eleve'
        else if (volatilities[i] > threshold * 1.2) sev = 'modere'
        else sev = 'faible'
        
        severity.push(sev)
      }
    }
    
    return { indices, dates: [], severity }
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  /**
   * Valide la stationnarité du modèle
   */
  isStationary(): boolean {
    if (!this.lastResult) return false
    return this.lastResult.persistence < STATIONARITY_THRESHOLD
  }

  /**
   * Test de Ljung-Box sur les résidus
   */
  ljungBoxTest(lags: number = 10): { statistic: number; pValue: number; isWhiteNoise: boolean } {
    if (!this.lastResult) {
      return { statistic: 0, pValue: 1, isWhiteNoise: true }
    }
    
    const residuals = this.lastResult.residuals
    const n = residuals.length
    
    let statistic = 0
    for (let k = 1; k <= lags; k++) {
      let autocorr = 0
      let sumSq = 0
      
      for (let i = k; i < n; i++) {
        autocorr += residuals[i] * residuals[i - k]
        sumSq += residuals[i] * residuals[i]
      }
      
      const rk = sumSq > 0 ? autocorr / sumSq : 0
      statistic += (rk * rk) / (n - k)
    }
    
    statistic = n * (n + 2) * statistic
    const pValue = Math.exp(-statistic / (2 * lags))
    const isWhiteNoise = pValue > 0.05
    
    return {
      statistic: Math.round(statistic * 100) / 100,
      pValue: Math.round(pValue * 100) / 100,
      isWhiteNoise
    }
  }

  // ============================================================
  // SAUVEGARDE
  // ============================================================

  getLastResult(): GARCHResult | null {
    return this.lastResult
  }

  getLastFitDate(): Date | null {
    return this.lastFitDate
  }

  reset(): void {
    this.lastResult = null
    this.lastFitDate = null
  }

  exportModel(): string {
    return JSON.stringify({
      config: this.config,
      lastResult: this.lastResult,
      lastFitDate: this.lastFitDate?.toISOString()
    }, null, 2)
  }

  importModel(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config
      this.lastResult = data.lastResult
      this.lastFitDate = data.lastFitDate ? new Date(data.lastFitDate) : null
      return true
    } catch (error) {
      console.error('[GARCH] Erreur lors de l\'import:', error)
      return false
    }
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const garchModel = new GARCHModel()