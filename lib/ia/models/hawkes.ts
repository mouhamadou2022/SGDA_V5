// lib/ia/models/hawkes.ts
// Modèle Hawkes - Contagion des écarts entre domaines
// Version améliorée avec calibration dynamique de la matrice de propagation
// Hawkes univarié et multivarié
// 0 API externe, 0 coût, 100% local

'use client'

import { Ecart } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface HawkesIntensity {
  currentIntensity: number
  riskNext30Days: number
  expectedNewEcarts: number
  contributions: {
    background: number
    triggered: number
  }
}

export interface HawkesMultivariateResult {
  intensities: {
    sgs: number
    pac: number
    conformite: number
    critique: number
    resilience: number
  }
  propagationMatrix: number[][]
  nextWeekRisk: number
  mostInfluentialDomain: string
  calibrationQuality: number
}

export interface HawkesCalibrationData {
  ecarts: Array<{ createdAt: string; niveau?: string; domaine?: string }>
  windowDays?: number
  minEvents?: number
}

export interface CalibratedParams {
  mu: number
  alpha: number
  beta: number
  stationarity: boolean
  logLikelihood: number
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_PARAMS = {
  mu: 0.03,
  alpha: 0.40,
  beta: 0.60,
}

const DOMAIN_MAPPING: Record<string, number> = {
  'SGS': 0,
  'C2': 1,
  'C3': 2,
  'C4': 3,
  'C5': 4,
  'sgs': 0,
  'pac': 1,
  'conformite': 2,
  'critique': 3,
  'resilience': 4,
}

const DOMAIN_NAMES = ['sgs', 'pac', 'conformite', 'critique', 'resilience']

// ============================================================
// HAWKES UNIVARIÉ
// ============================================================

export class HawkesModel {
  private calibratedParams: CalibratedParams | null = null
  private lastCalibrationDate: Date | null = null

  /**
   * Calcule l'intensité de contagion Hawkes (version univariée)
   */
  computeIntensity(
    ecarts: Array<{ createdAt: string; niveau?: string }>,
    params?: { mu?: number; alpha?: number; beta?: number }
  ): HawkesIntensity {
    const mu = params?.mu ?? this.calibratedParams?.mu ?? DEFAULT_PARAMS.mu
    const alpha = params?.alpha ?? this.calibratedParams?.alpha ?? DEFAULT_PARAMS.alpha
    const beta = params?.beta ?? this.calibratedParams?.beta ?? DEFAULT_PARAMS.beta
    
    const now = Date.now()
    let intensity = mu
    let triggeredContribution = 0
    
    const recentEcarts = ecarts.filter(e => {
      const age = (now - new Date(e.createdAt).getTime()) / (1000 * 3600 * 24)
      return age <= 90
    })
    
    for (const ecart of recentEcarts) {
      const ageJours = (now - new Date(ecart.createdAt).getTime()) / (1000 * 3600 * 24)
      let contribution = alpha * beta * Math.exp(-beta * ageJours)
      
      if (ecart.niveau === 'critique') {
        contribution *= 1.8
      } else if (ecart.niveau === 'eleve') {
        contribution *= 1.3
      } else if (ecart.niveau === 'moyen') {
        contribution *= 1.1
      }
      
      intensity += contribution
      triggeredContribution += contribution
    }
    
    const proba30j = 1 - Math.exp(-intensity * 30)
    const expectedNewEcarts = intensity * 30
    
    return {
      currentIntensity: Math.round(intensity * 100) / 100,
      riskNext30Days: Math.min(100, Math.round(proba30j * 100)),
      expectedNewEcarts: Math.round(expectedNewEcarts * 10) / 10,
      contributions: {
        background: Math.round(mu * 100) / 100,
        triggered: Math.round(triggeredContribution * 100) / 100
      }
    }
  }

  /**
   * Calibre automatiquement les paramètres Hawkes à partir des données historiques
   */
  calibrate(data: HawkesCalibrationData): CalibratedParams {
    const { ecarts, windowDays = 90, minEvents = 10 } = data
    
    if (ecarts.length < minEvents) {
      return {
        mu: DEFAULT_PARAMS.mu,
        alpha: DEFAULT_PARAMS.alpha,
        beta: DEFAULT_PARAMS.beta,
        stationarity: true,
        logLikelihood: -Infinity
      }
    }
    
    // Méthode de maximisation de la vraisemblance (simplifiée)
    // En production, utiliserait un algorithme EM ou optimisation numérique
    let bestMu = DEFAULT_PARAMS.mu
    let bestAlpha = DEFAULT_PARAMS.alpha
    let bestBeta = DEFAULT_PARAMS.beta
    let bestLL = -Infinity
    
    // Grille de recherche simple
    const muValues = [0.01, 0.02, 0.03, 0.04, 0.05]
    const alphaValues = [0.2, 0.3, 0.4, 0.5, 0.6]
    const betaValues = [0.4, 0.5, 0.6, 0.7, 0.8]
    
    for (const mu of muValues) {
      for (const alpha of alphaValues) {
        for (const beta of betaValues) {
          // Vérifier la stationnarité: alpha/beta < 1
          if (alpha / beta >= 1) continue
          
          const ll = this.computeLogLikelihood(ecarts, { mu, alpha, beta })
          if (ll > bestLL) {
            bestLL = ll
            bestMu = mu
            bestAlpha = alpha
            bestBeta = beta
          }
        }
      }
    }
    
    const stationarity = bestAlpha / bestBeta < 1
    
    this.calibratedParams = {
      mu: bestMu,
      alpha: bestAlpha,
      beta: bestBeta,
      stationarity,
      logLikelihood: bestLL
    }
    
    this.lastCalibrationDate = new Date()
    
    return this.calibratedParams
  }

  /**
   * Calcule la log-vraisemblance pour un jeu de paramètres donné
   */
  private computeLogLikelihood(
    ecarts: Array<{ createdAt: string }>,
    params: { mu: number; alpha: number; beta: number }
  ): number {
    const { mu, alpha, beta } = params
    const now = Date.now()
    let ll = 0
    
    // Ordonner les événements par date
    const sortedEvents = [...ecarts].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    
    for (let i = 0; i < sortedEvents.length; i++) {
      const ti = new Date(sortedEvents[i].createdAt).getTime()
      
      // Intensité au moment de l'événement
      let intensity = mu
      for (let j = 0; j < i; j++) {
        const tj = new Date(sortedEvents[j].createdAt).getTime()
        const dt = (ti - tj) / (1000 * 3600 * 24) // jours
        intensity += alpha * beta * Math.exp(-beta * dt)
      }
      
      ll += Math.log(intensity + 0.001) // éviter log(0)
      
      // Pénalité pour les grands intervalles
      if (i < sortedEvents.length - 1) {
        const nextTi = new Date(sortedEvents[i + 1].createdAt).getTime()
        const dt = (nextTi - ti) / (1000 * 3600 * 24)
        ll -= mu * dt
        for (let j = 0; j <= i; j++) {
          const tj = new Date(sortedEvents[j].createdAt).getTime()
          const dtj = (nextTi - tj) / (1000 * 3600 * 24)
          ll -= alpha * (1 - Math.exp(-beta * dtj))
        }
      }
    }
    
    return ll
  }

  /**
   * Prédit le nombre d'écarts dans les N prochains jours
   */
  predictFutureEcarts(
    ecarts: Array<{ createdAt: string; niveau?: string }>,
    horizonJours: number = 30
  ): { expected: number; lower: number; upper: number } {
    const intensity = this.computeIntensity(ecarts)
    const expected = intensity.expectedNewEcarts
    
    // Intervalle de prédiction basé sur la distribution de Poisson
    const lambda = expected
    const lower = Math.max(0, Math.round(lambda - 1.96 * Math.sqrt(lambda)))
    const upper = Math.round(lambda + 1.96 * Math.sqrt(lambda))
    
    return {
      expected: Math.round(expected * 10) / 10,
      lower,
      upper
    }
  }

  getCalibratedParams(): CalibratedParams | null {
    return this.calibratedParams
  }

  getLastCalibrationDate(): Date | null {
    return this.lastCalibrationDate
  }
}

// ============================================================
// HAWKES MULTIVARIÉ
// ============================================================

export class HawkesMultivariateModel {
  private propagationMatrix: number[][] = [
    [0.6, 0.2, 0.1, 0.05, 0.05],
    [0.3, 0.5, 0.1, 0.05, 0.05],
    [0.1, 0.2, 0.5, 0.1, 0.1],
    [0.05, 0.1, 0.2, 0.6, 0.05],
    [0.1, 0.1, 0.1, 0.1, 0.6]
  ]
  
  private lastCalibrationDate: Date | null = null
  private calibrationQuality: number = 0

  /**
   * Calcule les intensités multivariées
   */
  computeIntensities(
    ecartsParDomaine: {
      sgs: Array<{ createdAt: string }>
      pac: Array<{ createdAt: string }>
      conformite: Array<{ createdAt: string }>
      critique: Array<{ createdAt: string }>
      resilience: Array<{ createdAt: string }>
    }
  ): HawkesMultivariateResult {
    const now = Date.now()
    const beta = 0.5
    const intensities: Record<string, number> = {
      sgs: 0.02, pac: 0.02, conformite: 0.02, critique: 0.02, resilience: 0.02
    }
    
    const domainData = [
      ecartsParDomaine.sgs,
      ecartsParDomaine.pac,
      ecartsParDomaine.conformite,
      ecartsParDomaine.critique,
      ecartsParDomaine.resilience
    ]
    
    // Calcul des intensités
    for (let i = 0; i < 5; i++) {
      let total = 0.02
      for (let j = 0; j < 5; j++) {
        const alphaij = this.propagationMatrix[j][i]
        for (const ecart of domainData[j]) {
          const age = (now - new Date(ecart.createdAt).getTime()) / (1000 * 3600 * 24)
          if (age <= 90) {
            total += alphaij * beta * Math.exp(-beta * age)
          }
        }
      }
      intensities[DOMAIN_NAMES[i]] = Math.round(total * 100) / 100
    }
    
    // Risque dans les 7 prochains jours
    const totalIntensity = Object.values(intensities).reduce((a, b) => a + b, 0)
    const nextWeekRisk = Math.min(100, Math.round((1 - Math.exp(-totalIntensity * 7)) * 100))
    
    // Domaine le plus influent
    let mostInfluentialDomain = DOMAIN_NAMES[0]
    let maxIntensity = intensities[mostInfluentialDomain]
    for (const d of DOMAIN_NAMES) {
      if (intensities[d] > maxIntensity) {
        maxIntensity = intensities[d]
        mostInfluentialDomain = d
      }
    }
    
    const domainMap: Record<string, string> = {
      sgs: 'C1 Maturité SGS',
      pac: 'C2 Efficacité PAC',
      conformite: 'C3 Conformité',
      critique: 'C4 Charge Critique',
      resilience: 'C5 Résilience'
    }
    
    return {
      intensities: intensities as { sgs: number; pac: number; conformite: number; critique: number; resilience: number },
      propagationMatrix: this.propagationMatrix,
      nextWeekRisk,
      mostInfluentialDomain: domainMap[mostInfluentialDomain] || mostInfluentialDomain,
      calibrationQuality: this.calibrationQuality
    }
  }

  /**
   * Calibre dynamiquement la matrice de propagation
   */
  calibratePropagationMatrix(
    ecartsHistorique: Array<{ createdAt: string; domaine: string }>,
    minEcarts: number = 50
  ): { matrix: number[][]; quality: number } {
    if (ecartsHistorique.length < minEcarts) {
      return { matrix: this.propagationMatrix, quality: 0 }
    }
    
    // Initialiser la matrice de co-occurrence
    const coOccurrence = Array(5).fill(0).map(() => Array(5).fill(0))
    const totalBySource = Array(5).fill(0)
    
    // Fenêtre de temps pour les co-occurrences (7 jours)
    const windowMs = 7 * 24 * 3600 * 1000
    
    for (let i = 0; i < ecartsHistorique.length; i++) {
      const event1 = ecartsHistorique[i]
      const domaine1 = DOMAIN_MAPPING[event1.domaine] ?? 0
      
      for (let j = i + 1; j < ecartsHistorique.length; j++) {
        const event2 = ecartsHistorique[j]
        const domaine2 = DOMAIN_MAPPING[event2.domaine] ?? 0
        
        const timeDiff = Math.abs(
          new Date(event2.createdAt).getTime() - new Date(event1.createdAt).getTime()
        )
        
        if (timeDiff <= windowMs) {
          coOccurrence[domaine1][domaine2]++
          totalBySource[domaine1]++
        }
      }
    }
    
    // Transformer en probabilités conditionnelles
    const newMatrix = Array(5).fill(0).map(() => Array(5).fill(0))
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (totalBySource[i] > 0) {
          newMatrix[i][j] = Math.min(0.9, coOccurrence[i][j] / totalBySource[i])
        } else {
          newMatrix[i][j] = this.propagationMatrix[i][j]
        }
      }
    }
    
    // Normalisation
    for (let i = 0; i < 5; i++) {
      const sum = newMatrix[i].reduce((a, b) => a + b, 0)
      if (sum > 0) {
        for (let j = 0; j < 5; j++) {
          newMatrix[i][j] = newMatrix[i][j] / sum
        }
      }
    }
    
    // Calculer la qualité de calibration (basée sur le nombre d'observations)
    const quality = Math.min(100, Math.round((ecartsHistorique.length / minEcarts) * 50))
    
    this.propagationMatrix = newMatrix
    this.lastCalibrationDate = new Date()
    this.calibrationQuality = quality
    
    return { matrix: newMatrix, quality }
  }

  /**
   * Calcule l'influence d'un domaine sur les autres
   */
  computeDomainInfluence(domaine: string): {
    influences: Record<string, number>
    totalInfluence: number
  } {
    const idx = DOMAIN_MAPPING[domaine] ?? 0
    const influences: Record<string, number> = {}
    let totalInfluence = 0
    
    for (let j = 0; j < 5; j++) {
      const influence = this.propagationMatrix[idx][j]
      influences[DOMAIN_NAMES[j]] = Math.round(influence * 100)
      totalInfluence += influence
    }
    
    return {
      influences,
      totalInfluence: Math.round(totalInfluence * 100)
    }
  }

  /**
   * Prédit le risque de cascade à partir d'un nouvel écart
   */
  predictCascadeRisk(
    newEcart: { domaine: string; niveau: string },
    existingEcarts: Array<{ createdAt: string; domaine: string }>
  ): {
    immediateRisk: number
    weeklyRisk: number
    affectedDomains: string[]
  } {
    const sourceIdx = DOMAIN_MAPPING[newEcart.domaine] ?? 0
    const niveauMultiplier = newEcart.niveau === 'critique' ? 2 : 
                             newEcart.niveau === 'eleve' ? 1.5 : 1
    
    // Risque immédiat (propagation directe)
    const immediateRisks: number[] = []
    for (let j = 0; j < 5; j++) {
      if (j !== sourceIdx) {
        immediateRisks.push(this.propagationMatrix[sourceIdx][j] * niveauMultiplier)
      }
    }
    const immediateRisk = Math.min(100, Math.round(immediateRisks.reduce((a, b) => a + b, 0) * 100))
    
    // Risque à une semaine (prendre en compte les écarts existants)
    const now = Date.now()
    let weeklyRisk = immediateRisk
    const recentEcarts = existingEcarts.filter(e => {
      const age = (now - new Date(e.createdAt).getTime()) / (1000 * 3600 * 24)
      return age <= 7
    })
    
    for (const ecart of recentEcarts) {
      const idx = DOMAIN_MAPPING[ecart.domaine] ?? 0
      weeklyRisk += this.propagationMatrix[idx][sourceIdx] * 50
    }
    
    // Domaines affectés
    const affectedDomains: string[] = []
    for (let j = 0; j < 5; j++) {
      if (j !== sourceIdx && this.propagationMatrix[sourceIdx][j] > 0.1) {
        affectedDomains.push(DOMAIN_NAMES[j])
      }
    }
    
    return {
      immediateRisk: Math.min(100, Math.round(immediateRisk)),
      weeklyRisk: Math.min(100, Math.round(weeklyRisk)),
      affectedDomains
    }
  }

  getPropagationMatrix(): number[][] {
    return this.propagationMatrix
  }

  getLastCalibrationDate(): Date | null {
    return this.lastCalibrationDate
  }

  getCalibrationQuality(): number {
    return this.calibrationQuality
  }

  resetToDefault(): void {
    this.propagationMatrix = [
      [0.6, 0.2, 0.1, 0.05, 0.05],
      [0.3, 0.5, 0.1, 0.05, 0.05],
      [0.1, 0.2, 0.5, 0.1, 0.1],
      [0.05, 0.1, 0.2, 0.6, 0.05],
      [0.1, 0.1, 0.1, 0.1, 0.6]
    ]
    this.calibrationQuality = 0
    this.lastCalibrationDate = null
  }
}

// ============================================================
// SINGLETONS
// ============================================================

export const hawkesModel = new HawkesModel()
export const hawkesMultivariateModel = new HawkesMultivariateModel()