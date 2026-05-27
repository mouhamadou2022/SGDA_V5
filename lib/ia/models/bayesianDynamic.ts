// lib/ia/models/bayesianDynamic.ts
// Modèle Bayésien paramétrique évolutif
// Version améliorée avec apprentissage continu des priors
// Supporte le transfer learning entre aérodromes similaires
// 0 API externe, 0 coût, 100% local

'use client'

import { Aerodrome, ProfilRisque, ScoreHistoryPoint } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface BayesianPrediction {
  posteriorProbability: number
  priorProbability: number
  likelihood: number
  credibleInterval: [number, number]
  estBlackSwan: boolean
  confidence: number
}

export interface DynamicPrior {
  mean: number
  variance: number
  sampleSize: number
  lastUpdated: string
  source: 'global' | 'similar' | 'custom'
}

export interface BayesianState {
  priors: Map<string, DynamicPrior>
  observations: Map<string, number[]>
  lastUpdate: string
  totalUpdates: number
}

export interface TransferLearningConfig {
  enabled: boolean
  minSimilarityScore: number
  maxSourceAerodromes: number
  weightSimilarity: boolean
}

export interface Evidence {
  type: 'NS' | 'NV' | 'ecart_critique' | 'ecart_eleve' | 'incident_grave' | 'absence_barriere'
  likelihood: number
  domaine?: string
  date?: string
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_LIKELIHOODS: Record<string, number> = {
  'NS': 0.8,
  'NV': 0.7,
  'ecart_critique': 0.9,
  'ecart_eleve': 0.6,
  'incident_grave': 0.95,
  'absence_barriere': 0.85,
}

const DEFAULT_PRIORS: Record<string, { mean: number; variance: number }> = {
  'SGS': { mean: 0.15, variance: 0.02 },
  'SLI': { mean: 0.20, variance: 0.03 },
  'PHY': { mean: 0.25, variance: 0.04 },
  'OLS': { mean: 0.18, variance: 0.02 },
  'RA': { mean: 0.10, variance: 0.01 },
  'ELEC': { mean: 0.22, variance: 0.03 },
  'MFP': { mean: 0.16, variance: 0.02 },
  'COP': { mean: 0.12, variance: 0.01 },
  'OPS': { mean: 0.20, variance: 0.03 },
  'AGA': { mean: 0.18, variance: 0.02 },
}

const DECAY_FACTOR = 0.95 // Facteur d'atténuation temporelle
const MIN_OBSERVATIONS = 5
const UPDATE_THRESHOLD = 10

// ============================================================
// MODÈLE BAYÉSIEN DYNAMIQUE
// ============================================================

export class BayesianDynamicModel {
  private state: BayesianState
  private transferConfig: TransferLearningConfig
  private aerodromeSimilarityCache: Map<string, Map<string, number>> = new Map()

  constructor() {
    this.state = {
      priors: new Map(),
      observations: new Map(),
      lastUpdate: new Date().toISOString(),
      totalUpdates: 0,
    }
    this.transferConfig = {
      enabled: true,
      minSimilarityScore: 30,
      maxSourceAerodromes: 3,
      weightSimilarity: true,
    }
  }

  // ============================================================
  // INITIALISATION
  // ============================================================

  /**
   * Initialise les priors pour un domaine
   */
  initPrior(domaine: string, customPrior?: { mean: number; variance: number }): void {
    const defaultPrior = DEFAULT_PRIORS[domaine] || { mean: 0.15, variance: 0.03 }
    const prior = customPrior || defaultPrior
    
    this.state.priors.set(domaine, {
      mean: prior.mean,
      variance: prior.variance,
      sampleSize: 0,
      lastUpdated: new Date().toISOString(),
      source: 'global',
    })
  }

  /**
   * Calcule un prior personnalisé basé sur des aérodromes similaires
   */
  async computeSimilarPrior(
    domaine: string,
    aerodromeId: string,
    aerodromes: Aerodrome[],
    profilsRisque: Record<string, ProfilRisque>
  ): Promise<DynamicPrior | null> {
    if (!this.transferConfig.enabled) return null
    
    const similarAerodromes = this.findSimilarAerodromes(aerodromeId, aerodromes, profilsRisque)
    if (similarAerodromes.length === 0) return null
    
    const priorScores: number[] = []
    const priorWeights: number[] = []
    
    for (const similar of similarAerodromes.slice(0, this.transferConfig.maxSourceAerodromes)) {
      const similarProfil = profilsRisque[similar.id]
      if (similarProfil) {
        let score = 0
        switch (domaine) {
          case 'SGS': score = similarProfil.c1; break
          case 'SLI': score = similarProfil.c5; break
          default: score = similarProfil.score_global
        }
        const prior = (100 - score) / 100
        priorScores.push(prior)
        
        const similarity = this.getSimilarityScore(aerodromeId, similar.id)
        priorWeights.push(this.transferConfig.weightSimilarity ? similarity : 1)
      }
    }
    
    if (priorScores.length === 0) return null
    
    // Moyenne pondérée
    const totalWeight = priorWeights.reduce((a, b) => a + b, 0)
    const weightedMean = priorScores.reduce((sum, score, i) => sum + score * priorWeights[i], 0) / totalWeight
    
    return {
      mean: weightedMean,
      variance: 0.03,
      sampleSize: priorScores.length,
      lastUpdated: new Date().toISOString(),
      source: 'similar',
    }
  }

  /**
   * Trouve les aérodromes similaires
   */
  private findSimilarAerodromes(
    targetId: string,
    aerodromes: Aerodrome[],
    profilsRisque: Record<string, ProfilRisque>
  ): Aerodrome[] {
    const target = aerodromes.find(a => a.id === targetId)
    if (!target) return []
    
    const similarities: { aerodrome: Aerodrome; score: number }[] = []
    
    for (const aero of aerodromes) {
      if (aero.id === targetId) continue
      
      let score = 0
      if (aero.type === target.type) score += 30
      if (aero.region === target.region) score += 25
      
      const targetProfil = profilsRisque[targetId]
      const aeroProfil = profilsRisque[aero.id]
      if (targetProfil && aeroProfil) {
        const scoreDiff = Math.abs(targetProfil.score_global - aeroProfil.score_global)
        score += Math.max(0, 20 - scoreDiff / 5)
      }
      
      similarities.push({ aerodrome: aero, score })
    }
    
    // Mettre en cache pour réutilisation
    const cache = this.aerodromeSimilarityCache.get(targetId) || new Map()
    for (const { aerodrome, score } of similarities) {
      cache.set(aerodrome.id, score)
    }
    this.aerodromeSimilarityCache.set(targetId, cache)
    
    return similarities
      .filter(s => s.score >= this.transferConfig.minSimilarityScore)
      .sort((a, b) => b.score - a.score)
      .map(s => s.aerodrome)
  }

  private getSimilarityScore(aerodromeId1: string, aerodromeId2: string): number {
    const cache = this.aerodromeSimilarityCache.get(aerodromeId1)
    return cache?.get(aerodromeId2) || 0
  }

  // ============================================================
  // MISE À JOUR BAYÉSIENNE
  // ============================================================

  /**
   * Calcule la probabilité a posteriori
   */
  computePosterior(
    prior: number,
    likelihoods: number[],
    falsePositiveRate: number = 0.1
  ): { posterior: number; marginal: number } {
    let posterior = prior
    let marginal = 1
    
    for (const likelihood of likelihoods) {
      marginal = posterior * likelihood + (1 - posterior) * falsePositiveRate
      posterior = (likelihood * posterior) / marginal
    }
    
    return { posterior, marginal }
  }

  /**
   * Calcule la probabilité a posteriori avec prior dynamique
   */
  async computeDynamicPosterior(
    domaine: string,
    aerodromeId: string,
    evidences: Evidence[],
    aerodromes: Aerodrome[],
    profilsRisque: Record<string, ProfilRisque>
  ): Promise<BayesianPrediction> {
    // Récupérer ou initialiser le prior
    let prior = this.state.priors.get(domaine)
    if (!prior) {
      const similarPrior = await this.computeSimilarPrior(domaine, aerodromeId, aerodromes, profilsRisque)
      if (similarPrior) {
        prior = similarPrior
      } else {
        this.initPrior(domaine)
        prior = this.state.priors.get(domaine)!
      }
    }
    
    // Appliquer le facteur d'atténuation temporelle
    let priorMean = prior.mean
    const daysSinceUpdate = (Date.now() - new Date(prior.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate > 30) {
      priorMean = priorMean * Math.pow(DECAY_FACTOR, daysSinceUpdate / 30)
    }
    
    // Calculer les vraisemblances
    const likelihoods = evidences.map(e => e.likelihood || DEFAULT_LIKELIHOODS[e.type] || 0.5)
    
    // Calcul bayésien
    const { posterior, marginal } = this.computePosterior(priorMean, likelihoods)
    
    // Intervalle crédible
    const credibleInterval = this.computeCredibleInterval(posterior, prior.sampleSize + evidences.length)
    
    // Détection Black Swan
    const estBlackSwan = this.detectBlackSwan(priorMean, posterior)
    
    // Niveau de confiance
    const confidence = this.computeConfidence(prior.sampleSize, evidences.length, posterior)
    
    // Mettre à jour le prior avec la nouvelle observation
    await this.updatePrior(domaine, posterior, evidences.length)
    
    return {
      posteriorProbability: Math.round(posterior * 100),
      priorProbability: Math.round(priorMean * 100),
      likelihood: Math.round(likelihoods.reduce((a, b) => a + b, 0) / likelihoods.length * 100),
      credibleInterval,
      estBlackSwan,
      confidence,
    }
  }

  /**
   * Met à jour le prior dynamique
   */
  async updatePrior(domaine: string, newPosterior: number, weight: number = 1): Promise<void> {
    const currentPrior = this.state.priors.get(domaine)
    if (!currentPrior) return
    
    // Mise à jour incrémentale de la moyenne
    const totalWeight = currentPrior.sampleSize + weight
    const newMean = (currentPrior.mean * currentPrior.sampleSize + newPosterior * weight) / totalWeight
    
    // Mise à jour de la variance (estimateur incrémental)
    const newVariance = currentPrior.variance * (currentPrior.sampleSize / totalWeight) +
      (Math.pow(newPosterior - currentPrior.mean, 2) * currentPrior.sampleSize * weight) / Math.pow(totalWeight, 2)
    
    this.state.priors.set(domaine, {
      ...currentPrior,
      mean: newMean,
      variance: newVariance,
      sampleSize: totalWeight,
      lastUpdated: new Date().toISOString(),
    })
    
    this.state.totalUpdates++
    this.state.lastUpdate = new Date().toISOString()
    
    // Sauvegarder l'observation
    if (!this.state.observations.has(domaine)) {
      this.state.observations.set(domaine, [])
    }
    this.state.observations.get(domaine)!.push(newPosterior)
  }

  // ============================================================
  // CALCULS STATISTIQUES
  // ============================================================

  /**
   * Calcule l'intervalle crédible
   */
  computeCredibleInterval(
    probability: number,
    sampleSize: number,
    confidence: number = 0.95
  ): [number, number] {
    if (sampleSize === 0) {
      const margin = 0.2
      return [
        Math.max(0, Math.round((probability - margin) * 100)),
        Math.min(100, Math.round((probability + margin) * 100))
      ]
    }
    
    // Approximation normale pour la distribution Beta
    const a = probability * sampleSize + 1
    const b = (1 - probability) * sampleSize + 1
    const mean = a / (a + b)
    const variance = (a * b) / ((a + b) ** 2 * (a + b + 1))
    const stdDev = Math.sqrt(variance)
    const z = 1.96
    
    return [
      Math.max(0, Math.round((mean - z * stdDev) * 100)),
      Math.min(100, Math.round((mean + z * stdDev) * 100))
    ]
  }

  /**
   * Détecte un Black Swan (événement improbable mais catastrophique)
   */
  detectBlackSwan(prior: number, posterior: number): boolean {
    return posterior > 0.3 && prior < 0.1
  }

  /**
   * Calcule le niveau de confiance
   */
  computeConfidence(
    priorSampleSize: number,
    evidenceCount: number,
    posterior: number
  ): number {
    let confidence = 50
    
    // Plus d'observations = plus de confiance
    confidence += Math.min(30, priorSampleSize * 2)
    
    // Plus de preuves = plus de confiance
    confidence += Math.min(20, evidenceCount * 5)
    
    // Postérieur extrême = moins de confiance
    if (posterior > 0.9 || posterior < 0.1) {
      confidence -= 10
    }
    
    return Math.min(95, Math.max(30, confidence))
  }

  // ============================================================
  // ANALYSE DE TENDANCE
  // ============================================================

  /**
   * Analyse l'évolution des priors dans le temps
   */
  analyzeTrend(domaine: string): {
    trend: 'hausse' | 'baisse' | 'stable'
    evolution: number
    recentImprovement: boolean
  } {
    const observations = this.state.observations.get(domaine) || []
    if (observations.length < 3) {
      return { trend: 'stable', evolution: 0, recentImprovement: false }
    }
    
    const firstAvg = observations.slice(0, 2).reduce((a, b) => a + b, 0) / 2
    const lastAvg = observations.slice(-2).reduce((a, b) => a + b, 0) / 2
    const evolution = lastAvg - firstAvg
    
    let trend: 'hausse' | 'baisse' | 'stable' = 'stable'
    if (evolution > 0.05) trend = 'hausse'
    else if (evolution < -0.05) trend = 'baisse'
    
    const recentImprovement = observations.length >= 4 &&
      observations[observations.length - 1] < observations[observations.length - 2]
    
    return {
      trend,
      evolution: Math.round(evolution * 100),
      recentImprovement,
    }
  }

  /**
   * Calcule la probabilité de faille cachée
   */
  computeHiddenFailureProbability(
    domaine: string,
    currentScore: number
  ): {
    probability: number
    level: 'faible' | 'moyen' | 'eleve' | 'critique'
    recommendation: string
  } {
    const prior = this.state.priors.get(domaine)
    if (!prior) {
      return {
        probability: 15,
        level: 'faible',
        recommendation: 'Collecter plus de données pour améliorer la prédiction',
      }
    }
    
    // La probabilité est d'autant plus élevée que le score est bas
    const scoreFactor = (100 - currentScore) / 100
    const combinedProbability = (prior.mean + scoreFactor) / 2 * 100
    
    let level: 'faible' | 'moyen' | 'eleve' | 'critique'
    let recommendation: string
    
    if (combinedProbability >= 50) {
      level = 'critique'
      recommendation = 'Action immédiate requise - inspection approfondie recommandée'
    } else if (combinedProbability >= 30) {
      level = 'eleve'
      recommendation = 'Surveillance renforcée recommandée dans les 30 jours'
    } else if (combinedProbability >= 15) {
      level = 'moyen'
      recommendation = 'Vérification périodique à maintenir'
    } else {
      level = 'faible'
      recommendation = 'Situation sous contrôle - poursuivre la surveillance standard'
    }
    
    return {
      probability: Math.round(combinedProbability),
      level,
      recommendation,
    }
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================

  /**
   * Configure le transfer learning
   */
  configureTransferLearning(config: Partial<TransferLearningConfig>): void {
    this.transferConfig = { ...this.transferConfig, ...config }
  }

  /**
   * Obtient l'état actuel du modèle
   */
  getState(): BayesianState {
    return {
      priors: new Map(this.state.priors),
      observations: new Map(this.state.observations),
      lastUpdate: this.state.lastUpdate,
      totalUpdates: this.state.totalUpdates,
    }
  }

  /**
   * Exporte l'état pour sauvegarde
   */
  exportState(): string {
    const exportData = {
      priors: Array.from(this.state.priors.entries()),
      observations: Array.from(this.state.observations.entries()),
      lastUpdate: this.state.lastUpdate,
      totalUpdates: this.state.totalUpdates,
      transferConfig: this.transferConfig,
    }
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Importe un état sauvegardé
   */
  importState(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.state.priors = new Map(data.priors)
      this.state.observations = new Map(data.observations)
      this.state.lastUpdate = data.lastUpdate
      this.state.totalUpdates = data.totalUpdates
      if (data.transferConfig) {
        this.transferConfig = data.transferConfig
      }
      return true
    } catch (error) {
      console.error('[BayesianDynamic] Erreur lors de l\'import:', error)
      return false
    }
  }

  /**
   * Réinitialise le modèle
   */
  reset(): void {
    this.state.priors.clear()
    this.state.observations.clear()
    this.state.lastUpdate = new Date().toISOString()
    this.state.totalUpdates = 0
    this.aerodromeSimilarityCache.clear()
  }

  /**
   * Obtient les statistiques
   */
  getStats(): {
    domainesCount: number
    totalUpdates: number
    lastUpdate: string
    transferEnabled: boolean
  } {
    return {
      domainesCount: this.state.priors.size,
      totalUpdates: this.state.totalUpdates,
      lastUpdate: this.state.lastUpdate,
      transferEnabled: this.transferConfig.enabled,
    }
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const bayesianDynamicModel = new BayesianDynamicModel()