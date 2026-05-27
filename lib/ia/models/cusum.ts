// lib/ia/models/cusum.ts
// Modèle CUSUM (Cumulative Sum) - Détection de rupture
// Version adaptative avec seuil dynamique basé sur la volatilité historique
// 0 API externe, 0 coût, 100% local

'use client'

// ============================================================
// TYPES
// ============================================================

export interface CUSUMResult {
  alerte: boolean
  seuilDepasse: number
  pointsCumules: number[]
  tempsDepuisDetection: number
  magnitude: number
  pointDetection?: number
  dateDetection?: string
}

export interface CUSUMConfig {
  seuil: number
  driftAutorise: number
  adaptatif: boolean
  fenetreHistorique: number
}

export interface AdaptiveThreshold {
  current: number
  historical: number[]
  volatility: number
}

export interface ChangePoint {
  index: number
  date: string
  valeurAvant: number
  valeurApres: number
  magnitude: number
  direction: 'hausse' | 'baisse'
  confidence: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: CUSUMConfig = {
  seuil: 5,
  driftAutorise: 0.5,
  adaptatif: true,
  fenetreHistorique: 10
}

// ============================================================
// MODÈLE CUSUM
// ============================================================

export class CUSUMModel {
  private config: CUSUMConfig
  private lastDetectionDate: Date | null = null
  private detectionsCount: number = 0
  private historicalThresholds: number[] = []

  constructor(config: Partial<CUSUMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Détection de rupture CUSUM standard
   */
  detectChange(
    valeurs: number[],
    dates: string[],
    config?: Partial<CUSUMConfig>
  ): CUSUMResult {
    const activeConfig = { ...this.config, ...config }
    
    if (valeurs.length < 4) {
      return {
        alerte: false,
        seuilDepasse: 0,
        pointsCumules: [],
        tempsDepuisDetection: 0,
        magnitude: 0
      }
    }

    // Calculer le seuil adaptatif si demandé
    let seuil = activeConfig.seuil
    if (activeConfig.adaptatif && this.historicalThresholds.length > 0) {
      const meanThreshold = this.historicalThresholds.reduce((a, b) => a + b, 0) / this.historicalThresholds.length
      const stdThreshold = Math.sqrt(
        this.historicalThresholds.reduce((sq, v) => sq + Math.pow(v - meanThreshold, 2), 0) / this.historicalThresholds.length
      )
      seuil = Math.max(activeConfig.seuil, meanThreshold + stdThreshold)
    }

    // La référence CUSUM est la moyenne historique
    const historique = valeurs.slice(0, -1)
    const target = historique.reduce((a, b) => a + b, 0) / historique.length
    
    let cumulPositif = 0
    let cumulNegatif = 0
    const pointsCumules: number[] = []
    let pointDetection: number | undefined
    let dateDetection: string | undefined
    
    for (let i = 0; i < valeurs.length; i++) {
      const deviation = valeurs[i] - target - activeConfig.driftAutorise
      cumulPositif = Math.max(0, cumulPositif + deviation)
      cumulNegatif = Math.min(0, cumulNegatif + deviation)
      const cumulActuel = Math.max(cumulPositif, -cumulNegatif)
      pointsCumules.push(cumulActuel)
      
      if (!pointDetection && cumulActuel > seuil) {
        pointDetection = i
        dateDetection = dates[i]
        this.lastDetectionDate = new Date(dates[i])
        this.detectionsCount++
      }
    }
    
    const maxCumul = Math.max(...pointsCumules)
    const alerte = maxCumul > seuil
    const seuilDepasse = Math.round(maxCumul)
    
    // Enregistrer le seuil pour l'historique
    this.historicalThresholds.push(seuil)
    if (this.historicalThresholds.length > 50) {
      this.historicalThresholds.shift()
    }
    
    const magnitude = Math.min(100, Math.round((maxCumul / seuil) * 100))
    
    let tempsDepuisDetection = 0
    if (this.lastDetectionDate) {
      tempsDepuisDetection = Math.floor((Date.now() - this.lastDetectionDate.getTime()) / (1000 * 60 * 60 * 24))
    }
    
    return {
      alerte,
      seuilDepasse,
      pointsCumules,
      tempsDepuisDetection,
      magnitude,
      pointDetection,
      dateDetection
    }
  }

  /**
   * Détection avec seuil adaptatif basé sur la volatilité
   */
  detectWithAdaptiveThreshold(
    valeurs: number[],
    dates: string[],
    windowSize: number = 10
  ): CUSUMResult & { adaptiveThreshold: number } {
    // Calculer la volatilité glissante
    const volatilite = this.computeRollingVolatility(valeurs, windowSize)
    const seuilAdaptatif = Math.max(DEFAULT_CONFIG.seuil, volatilite * 0.8)
    
    const result = this.detectChange(valeurs, dates, { seuil: seuilAdaptatif })
    
    return {
      ...result,
      adaptiveThreshold: Math.round(seuilAdaptatif * 10) / 10
    }
  }

  /**
   * Détection de multiples points de changement
   */
  detectMultipleChanges(
    valeurs: number[],
    dates: string[],
    minDistance: number = 5
  ): ChangePoint[] {
    const changePoints: ChangePoint[] = []
    
    if (valeurs.length < minDistance * 2) return changePoints
    
    let currentStart = 0
    
    while (currentStart + minDistance < valeurs.length) {
      const windowValeurs = valeurs.slice(currentStart, currentStart + minDistance * 2)
      const windowDates = dates.slice(currentStart, currentStart + minDistance * 2)
      
      const result = this.detectChange(windowValeurs, windowDates)
      
      if (result.alerte && result.pointDetection !== undefined) {
        const absoluteIndex = currentStart + result.pointDetection
        const idx = absoluteIndex
        
        // Éviter les doublons
        if (changePoints.length === 0 || changePoints[changePoints.length - 1].index + minDistance <= idx) {
          const valeurAvant = valeurs[idx - 1] || valeurs[idx]
          const valeurApres = valeurs[idx] || valeurs[idx]
          
          changePoints.push({
            index: idx,
            date: dates[idx],
            valeurAvant,
            valeurApres,
            magnitude: Math.abs(valeurApres - valeurAvant),
            direction: valeurApres > valeurAvant ? 'hausse' : 'baisse',
            confidence: Math.min(95, result.magnitude)
          })
        }
        
        currentStart = idx + minDistance
      } else {
        currentStart++
      }
    }
    
    return changePoints
  }

  /**
   * Calcule la volatilité glissante
   */
  private computeRollingVolatility(values: number[], windowSize: number): number {
    if (values.length < windowSize) return 5
    
    const recentValues = values.slice(-windowSize)
    const mean = recentValues.reduce((a, b) => a + b, 0) / windowSize
    const variance = recentValues.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / windowSize
    
    return Math.sqrt(variance)
  }

  /**
   * Calcule la probabilité de dépassement de seuil
   */
  computeOverflowProbability(
    valeurs: number[],
    horizonJours: number = 30
  ): {
    probabilite: number
    datePrevue: string | null
    intervalleConfiance: [number, number]
  } {
    if (valeurs.length < 6) {
      return {
        probabilite: 0,
        datePrevue: null,
        intervalleConfiance: [0, 0]
      }
    }
    
    // Calculer la tendance récente
    const recentValues = valeurs.slice(-6)
    const pente = (recentValues[recentValues.length - 1] - recentValues[0]) / recentValues.length
    
    if (pente >= 0) {
      return {
        probabilite: 0,
        datePrevue: null,
        intervalleConfiance: [0, 0]
      }
    }
    
    // Calculer le nombre de jours avant dépassement
    const currentValue = valeurs[valeurs.length - 1]
    const targetValue = this.config.seuil * 2 // seuil critique
    const daysToCritical = currentValue > targetValue ? 0 : Math.ceil((targetValue - currentValue) / Math.abs(pente))
    
    const probabilite = daysToCritical <= horizonJours ? Math.min(95, 100 - daysToCritical * 2) : 0
    
    const datePrevue = daysToCritical <= horizonJours 
      ? new Date(Date.now() + daysToCritical * 24 * 3600 * 1000).toISOString()
      : null
    
    return {
      probabilite: Math.max(0, Math.min(100, Math.round(probabilite))),
      datePrevue,
      intervalleConfiance: [
        Math.max(0, daysToCritical - 3),
        daysToCritical + 3
      ]
    }
  }

  /**
   * Analyse de rupture par segmentation binaire
   */
  binarySegmentation(
    valeurs: number[],
    dates: string[],
    minSegmentSize: number = 5
  ): ChangePoint[] {
    const changePoints: ChangePoint[] = []
    
    const recursiveSearch = (start: number, end: number) => {
      if (end - start < minSegmentSize * 2) return
      
      const segmentValeurs = valeurs.slice(start, end)
      const segmentDates = dates.slice(start, end)
      
      const result = this.detectChange(segmentValeurs, segmentDates)
      
      if (result.alerte && result.pointDetection !== undefined) {
        const absoluteIndex = start + result.pointDetection
        
        changePoints.push({
          index: absoluteIndex,
          date: dates[absoluteIndex],
          valeurAvant: valeurs[absoluteIndex - 1] || valeurs[absoluteIndex],
          valeurApres: valeurs[absoluteIndex],
          magnitude: result.magnitude,
          direction: valeurs[absoluteIndex] > (valeurs[absoluteIndex - 1] || valeurs[absoluteIndex]) ? 'hausse' : 'baisse',
          confidence: result.magnitude
        })
        
        // Rechercher dans les sous-segments
        recursiveSearch(start, absoluteIndex)
        recursiveSearch(absoluteIndex, end)
      }
    }
    
    recursiveSearch(0, valeurs.length)
    
    return changePoints.sort((a, b) => a.index - b.index)
  }

  /**
   * Calcule l'intervalle de confiance pour la détection
   */
  computeConfidenceInterval(
    valeurs: number[],
    confidence: number = 0.95
  ): [number, number] {
    if (valeurs.length < 2) return [0, 100]
    
    const sorted = [...valeurs].sort((a, b) => a - b)
    const alpha = 1 - confidence
    const lowerIndex = Math.floor(alpha / 2 * sorted.length)
    const upperIndex = Math.floor((1 - alpha / 2) * sorted.length)
    
    return [
      Math.max(0, sorted[lowerIndex]),
      Math.min(100, sorted[upperIndex])
    ]
  }

  /**
   * Évalue la qualité de la détection
   */
  evaluateDetection(
    historique: number[],
    knownChanges: number[]
  ): {
    precision: number
    recall: number
    f1Score: number
    detectedChanges: number[]
    missedChanges: number[]
    falsePositives: number[]
  } {
    const result = this.binarySegmentation(historique, historique.map((_, i) => `point_${i}`))
    const detected = result.map(cp => cp.index)
    
    const detectedChanges = detected.filter(d => knownChanges.some(k => Math.abs(k - d) <= 2))
    const missedChanges = knownChanges.filter(k => !detected.some(d => Math.abs(d - k) <= 2))
    const falsePositives = detected.filter(d => !knownChanges.some(k => Math.abs(k - d) <= 2))
    
    const precision = detected.length > 0 ? (detectedChanges.length / detected.length) * 100 : 0
    const recall = knownChanges.length > 0 ? (detectedChanges.length / knownChanges.length) * 100 : 0
    const f1Score = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0
    
    return {
      precision: Math.round(precision),
      recall: Math.round(recall),
      f1Score: Math.round(f1Score),
      detectedChanges,
      missedChanges,
      falsePositives
    }
  }

  /**
   * Réinitialise le modèle
   */
  reset(): void {
    this.lastDetectionDate = null
    this.detectionsCount = 0
    this.historicalThresholds = []
  }

  /**
   * Obtient les statistiques du modèle
   */
  getStats(): {
    detectionsCount: number
    lastDetectionDate: Date | null
    config: CUSUMConfig
    averageThreshold: number
  } {
    const avgThreshold = this.historicalThresholds.length > 0
      ? this.historicalThresholds.reduce((a, b) => a + b, 0) / this.historicalThresholds.length
      : this.config.seuil
    
    return {
      detectionsCount: this.detectionsCount,
      lastDetectionDate: this.lastDetectionDate,
      config: this.config,
      averageThreshold: Math.round(avgThreshold * 10) / 10
    }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(config: Partial<CUSUMConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const cusumModel = new CUSUMModel()