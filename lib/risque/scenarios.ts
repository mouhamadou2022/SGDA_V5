// lib/risque/scenarios.ts
// Génération des 4 scénarios: Optimiste, Pessimiste, Réaliste, Catastrophe
// 0 style inline, 0 fetch direct

import { Scenario } from './types'
import { computeTrend, linearRegression } from './trends'
import { computeStandardDeviation } from './volatility'

/**
 * Calcule le scénario réaliste (basé sur la tendance actuelle)
 */
export function buildRealisticScenario(
  scores: number[],
  horizonMois: number = 6
): Scenario {
  const { slope, intercept, r2, confidenceMargin95 } = linearRegression(scores)
  const dernierScore = scores[scores.length - 1]
  const scoreProjete = Math.min(100, Math.max(0, dernierScore + slope * horizonMois))
  
  // Utilise l'intervalle de confiance de la régression si disponible, sinon volatilité
  const volatilite = computeStandardDeviation(scores)
  const margin = confidenceMargin95 > 0 ? confidenceMargin95 : volatilite * 1.96
  const intervalleConfiance: [number, number] = [
    Math.max(0, scoreProjete - margin),
    Math.min(100, scoreProjete + margin),
  ]
  
  let probabilite = 60
  if (r2 > 0.7) probabilite = 75
  else if (r2 > 0.4) probabilite = 50
  else probabilite = 35
  
  return {
    nom: 'realiste',
    description: `Basé sur la tendance actuelle (confiance ${Math.round(r2 * 100)}%)`,
    probabilite,
    scoreProjecte: Math.round(scoreProjete),
    intervalleConfiance,
    actionsRecommandees: [
      'Maintenir la fréquence de surveillance actuelle',
      'Revoir les actions correctives en cours',
    ],
  }
}

/**
 * Calcule le scénario optimiste (meilleure performance historique)
 */
export function buildOptimisticScenario(
  scores: number[],
  horizonMois: number = 6
): Scenario {
  const meilleurScore = Math.max(...scores)
  const dernierScore = scores[scores.length - 1]
  const penteOptimiste = 2.0 // Amélioration rapide
  const scoreProjete = Math.min(100, dernierScore + penteOptimiste * horizonMois)
  
  const intervalleConfiance: [number, number] = [
    Math.max(0, scoreProjete - 10),
    Math.min(100, scoreProjete + 5),
  ]
  
  return {
    nom: 'optimiste',
    description: 'Meilleur scénario basé sur les périodes de performance maximale',
    probabilite: 20,
    scoreProjecte: Math.round(scoreProjete),
    intervalleConfiance,
    actionsRecommandees: [
      'Capitaliser sur les bonnes pratiques identifiées',
      'Diffuser les actions efficaces aux autres aérodromes',
      'Renforcer la formation du personnel',
    ],
  }
}

/**
 * Calcule le scénario pessimiste (pire performance historique)
 */
export function buildPessimisticScenario(
  scores: number[],
  horizonMois: number = 6,
  aggravatorsMultiplier: number = 1
): Scenario {
  const pireScore = Math.min(...scores)
  const dernierScore = scores[scores.length - 1]
  const pentePessimiste = -1.5 * aggravatorsMultiplier
  let scoreProjete = dernierScore + pentePessimiste * horizonMois
  scoreProjete = Math.min(100, Math.max(0, scoreProjete))
  
  const intervalleConfiance: [number, number] = [
    Math.max(0, scoreProjete - 15),
    Math.min(100, scoreProjete + 10),
  ]
  
  let probabilite = 30
  if (aggravatorsMultiplier > 1.5) probabilite = 50
  
  return {
    nom: 'pessimiste',
    description: aggravatorsMultiplier > 1
      ? 'Scénario pessimiste avec facteurs aggravants actifs'
      : 'Scénario pessimiste sans action corrective',
    probabilite,
    scoreProjecte: Math.round(scoreProjete),
    intervalleConfiance,
    actionsRecommandees: [
      'Déclencher des actions correctives immédiates',
      'Renforcer la surveillance',
      'Auditer les processus défaillants',
    ],
  }
}

/**
 * Calcule le scénario catastrophe (pire cas possible)
 */
export function buildCatastrophicScenario(
  scores: number[],
  horizonMois: number = 6,
  hasBlackSwan: boolean = false
): Scenario {
  const dernierScore = scores[scores.length - 1]
  let scoreProjete = dernierScore - 35
  if (hasBlackSwan) scoreProjete = dernierScore - 50
  scoreProjete = Math.max(5, scoreProjete)
  
  const intervalleConfiance: [number, number] = [
    Math.max(0, scoreProjete - 20),
    Math.min(100, scoreProjete + 15),
  ]
  
  return {
    nom: 'catastrophe',
    description: hasBlackSwan
      ? '⚠️ Scénario catastrophe - Détection de signaux de Black Swan'
      : 'Scénario catastrophe - Pire cas envisageable',
    probabilite: hasBlackSwan ? 15 : 5,
    scoreProjecte: Math.round(scoreProjete),
    intervalleConfiance,
    actionsRecommandees: [
      '🚨 PRÉPARATION CRISE - Activer plan d\'urgence',
      'Notifier immédiatement la Direction',
      'Mobiliser toutes les ressources disponibles',
      'Audit complet et immédiat',
    ],
  }
}

/**
 * Génère tous les scénarios pour un aérodrome
 */
export function generateAllScenarios(
  scores: number[],
  aggravatorsMultiplier: number = 1,
  hasBlackSwan: boolean = false
): Scenario[] {
  return [
    buildOptimisticScenario(scores),
    buildRealisticScenario(scores),
    buildPessimisticScenario(scores, 6, aggravatorsMultiplier),
    buildCatastrophicScenario(scores, 6, hasBlackSwan),
  ]
}

/**
 * Obtient la classe CSS pour un scénario
 */
export function getScenarioClass(scenario: Scenario): string {
  switch (scenario.nom) {
    case 'optimiste':
      return 'border-green-200 bg-green-50'
    case 'realiste':
      return 'border-blue-200 bg-blue-50'
    case 'pessimiste':
      return 'border-orange-200 bg-orange-50'
    case 'catastrophe':
      return 'border-red-200 bg-red-50 animate-pulse'
    default:
      return 'border-gray-200 bg-gray-50'
  }
}

/**
 * Obtient l'icône pour un scénario
 */
export function getScenarioIcon(scenario: Scenario): string {
  switch (scenario.nom) {
    case 'optimiste': return '🌟'
    case 'realiste': return '📊'
    case 'pessimiste': return '⚠️'
    case 'catastrophe': return '🔴'
    default: return '📋'
  }
}