// lib/risque/bayesian.ts
// Modèle bayésien pour la détection des failles cachées
// Théorème de Bayes: P(A|B) = P(B|A) * P(A) / P(B)
// 0 style inline, 0 fetch direct

import { PredictionBayesienne } from './types'
export type { PredictionBayesienne } from './types'
import { getDomainesIndividuelsCodes } from '../domaines'

// Vraisemblances par défaut P(Signal|Faille)
const LIKELIHOOD_PAR_DEFAUT: Record<string, number> = {
  'NS': 0.8,
  'NV': 0.7,
  'ecart_critique': 0.9,
  'ecart_eleve': 0.6,
  'incident_grave': 0.95,
  'absence_barriere': 0.85,
}

// Probabilité a priori par défaut par domaine
const PRIOR_PAR_DEFAUT: Record<string, number> = {
  'SGS': 0.15,
  'SLI': 0.20,
  'PHY': 0.25,
  'OLS': 0.18,
  'RA': 0.22,
  'ELEC': 0.22,
  'MFP': 0.16,
  'COP': 0.14,
  'OPS': 0.20,
}

// Facteur d'atténuation après période sans incident (10% par mois)
const ATTENUATION_FACTOR = 0.9

/**
 * Calcule la probabilité a priori pour un domaine
 * Basée sur l'historique du domaine
 */
export function computePriorProbability(
  domaine: string,
  incidentsCount: number,
  moisSansIncident: number,
  customPrior?: number
): number {
  let prior = customPrior || PRIOR_PAR_DEFAUT[domaine] || 0.15
  
  // Ajustement basé sur l'historique des incidents
  if (incidentsCount > 0) {
    prior = Math.min(0.5, prior + (incidentsCount * 0.05))
  }
  
  // Atténuation si période sans incident
  if (moisSansIncident > 0) {
    prior = prior * Math.pow(ATTENUATION_FACTOR, moisSansIncident)
  }
  
  return Math.min(0.95, Math.max(0.01, prior))
}

/**
 * Calcule la probabilité marginale P(B)
 */
export function computeMarginalProbability(
  prior: number,
  likelihood: number,
  falsePositiveRate: number = 0.1
): number {
  return prior * likelihood + (1 - prior) * falsePositiveRate
}

/**
 * Calcule la probabilité a posteriori P(Faille|Signaux)
 * Théorème de Bayes complet
 */
export function computePosteriorProbability(
  prior: number,
  likelihood: number,
  marginal: number
): number {
  if (marginal === 0) return prior
  return (likelihood * prior) / marginal
}

/**
 * Calcule la probabilité combinée de plusieurs signaux
 */
export function computeCombinedPosterior(
  prior: number,
  signaux: Array<{ type: string; likelihood?: number }>
): number {
  let currentPosterior = prior
  
  for (const signal of signaux) {
    const likelihood = signal.likelihood || LIKELIHOOD_PAR_DEFAUT[signal.type] || 0.5
    const marginal = computeMarginalProbability(currentPosterior, likelihood)
    currentPosterior = computePosteriorProbability(currentPosterior, likelihood, marginal)
  }
  
  return currentPosterior
}

/**
 * Calcule l'intervalle crédible (distribution Beta)
 */
export function computeCredibleInterval(
  successCount: number,
  totalCount: number,
  confidence: number = 0.95
): [number, number] {
  if (totalCount === 0) return [0, 1]
  
  const alpha = 1 - confidence
  const a = successCount + 1
  const b = totalCount - successCount + 1
  
  // Approximation normale pour Beta
  const mean = a / (a + b)
  const variance = (a * b) / ((a + b) ** 2 * (a + b + 1))
  const stdDev = Math.sqrt(variance)
  const z = 1.96 // pour 95%
  
  const lower = Math.max(0, mean - z * stdDev)
  const upper = Math.min(1, mean + z * stdDev)
  
  return [Math.round(lower * 100), Math.round(upper * 100)]
}

/**
 * Détection des Black Swans (événements improbables mais catastrophiques)
 * Condition: posterior > seuil ALORS que prior < seuil_faible
 */
export function detectBlackSwan(
  prior: number,
  posterior: number,
  seuilPosterior: number = 0.3,
  seuilPrior: number = 0.1
): boolean {
  return posterior > seuilPosterior && prior < seuilPrior
}

/**
 * Calcule la prédiction bayésienne complète
 */
export function computeBayesianPrediction(
  domaine: string,
  signaux: Array<{ type: string; likelihood?: number }>,
  incidentsCount: number,
  moisSansIncident: number,
  customPrior?: number,
  sampleSize: number = 50
): PredictionBayesienne {
  const prior = computePriorProbability(domaine, incidentsCount, moisSansIncident, customPrior)
  const posterior = computeCombinedPosterior(prior, signaux)
  const credibleInterval = computeCredibleInterval(
    Math.round(posterior * sampleSize),
    sampleSize,
    0.95
  )
  const estBlackSwan = detectBlackSwan(prior, posterior)
  
  // Calcul de la vraisemblance moyenne des signaux
  let avgLikelihood = 0
  for (const signal of signaux) {
    avgLikelihood += signal.likelihood || LIKELIHOOD_PAR_DEFAUT[signal.type] || 0.5
  }
  avgLikelihood = signaux.length > 0 ? avgLikelihood / signaux.length : 0.5
  
  return {
    posteriorProbability: Math.round(posterior * 100),
    priorProbability: Math.round(prior * 100),
    likelihood: Math.round(avgLikelihood * 100),
    credibleInterval,
    estBlackSwan,
  }
}

/**
 * Met à jour les probabilités a priori après un incident
 */
export function updatePriorAfterIncident(
  priorActuel: number,
  graviteIncident: 'mineur' | 'majeur' | 'critique' | 'catastrophique'
): number {
  const ajustements: Record<string, number> = {
    mineur: 0.05,
    majeur: 0.10,
    critique: 0.20,
    catastrophique: 0.30,
  }
  
  const ajustement = ajustements[graviteIncident] || 0.10
  return Math.min(0.95, priorActuel + ajustement)
}

/**
 * Calcule le niveau de confiance de la prédiction
 */
export function computeConfidenceLevel(
  posterior: number,
  intervalle: [number, number]
): 'haute' | 'moyenne' | 'faible' {
  const largeur = intervalle[1] - intervalle[0]
  
  if (largeur < 20) return 'haute'
  if (largeur < 40) return 'moyenne'
  return 'faible'
}

/**
 * Obtient la classe CSS pour le niveau de confiance
 */
export function getConfidenceClass(niveau: 'haute' | 'moyenne' | 'faible'): string {
  switch (niveau) {
    case 'haute':
      return 'badge success'
    case 'moyenne':
      return 'badge warning'
    default:
      return 'badge neutral'
  }
}