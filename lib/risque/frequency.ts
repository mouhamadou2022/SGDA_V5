// lib/risque/frequency.ts
// Calcul de la fréquence de surveillance basée sur les risques
// 0 style inline, 0 fetch direct

import { NiveauRisque, Tendance } from './types'

// Fréquence de base par niveau de risque (nombre de missions par an)
const FREQUENCE_BASE: Record<NiveauRisque, number> = {
  critique: 12,
  eleve: 4,
  moyen: 2,
  faible: 1,
  tres_faible: 0.5,
}

// Valeur par défaut
const FREQUENCE_DEFAUT = 2

// Facteurs multiplicateurs
const FACTEUR_TYPE_AEROPORT: Record<string, number> = {
  international: 1.2,
  national: 1.0,
}

const FACTEUR_TYPE_MISSION: Record<string, number> = {
  audit_complet: 0.8, // Moins fréquent car plus lourd
  suivi_ecarts: 1.2,  // Plus fréquent car ciblé
  programmee: 1.0,
  inopinee: 0.6,      // Déclenchée par événement
}

/**
 * Calcule la fréquence de base selon le niveau de risque
 */
export function computeBaseFrequency(riskLevel: NiveauRisque): number {
  return FREQUENCE_BASE[riskLevel] || FREQUENCE_DEFAUT
}

/**
 * Applique les multiplicateurs à la fréquence
 */
export function applyMultipliers(
  baseFrequency: number,
  multipliers: number[]
): number {
  let result = baseFrequency
  for (const m of multipliers) {
    result *= m
  }
  return Math.min(12, Math.max(1, Math.round(result)))
}

/**
 * Calcule les multiplicateurs selon le contexte
 *
 * ATTENTION — hasCriticalEcarts et hasAggravators peuvent se recouper :
 * un écart critique active à la fois le multiplicateur 1.5 (hasCriticalEcarts)
 * ET potentiellement hasAggravators (via surcharge si ≥5 écarts). Le double-comptage
 * est intentionnel dans la mesure où ces deux canaux représentent des mécanismes distincts
 * (écart critique immédiat vs dégradation globale), mais l'appelant doit être conscient
 * que leur produit multiplicatif (1.5 × 1.3 = 1.95×) peut amplifier un même signal.
 */
export function computeMultipliers(params: {
  typeAeroport?: 'international' | 'national'
  typeMission?: string
  hasCriticalEcarts?: boolean
  tendance?: Tendance
  hasTriggers?: boolean
  hasAggravators?: boolean
}): number[] {
  const multipliers: number[] = []
  
  // Type d'aéroport
  if (params.typeAeroport) {
    multipliers.push(FACTEUR_TYPE_AEROPORT[params.typeAeroport] || 1.0)
  }
  
  // Type de mission
  if (params.typeMission) {
    const factor = FACTEUR_TYPE_MISSION[params.typeMission]
    if (factor) multipliers.push(factor)
  }
  
  // Écarts critiques actifs
  if (params.hasCriticalEcarts) {
    multipliers.push(1.5)
  }
  
  // Tendance à la baisse
  if (params.tendance === 'baisse') {
    multipliers.push(1.3)
  }
  
  // Présence de triggers
  if (params.hasTriggers) {
    multipliers.push(1.2)
  }
  
  // Présence d'aggravators
  if (params.hasAggravators) {
    multipliers.push(1.3)
  }
  
  return multipliers
}

/**
 * Calcule la fréquence finale de surveillance
 */
export function computeFinalFrequency(params: {
  riskLevel: NiveauRisque
  typeAeroport?: 'international' | 'national'
  typeMission?: string
  hasCriticalEcarts?: boolean
  tendance?: Tendance
  hasTriggers?: boolean
  hasAggravators?: boolean
}): {
  frequencyPerYear: number
  monthsInterval: number
  recommendations: string[]
} {
  const base = computeBaseFrequency(params.riskLevel)
  const multipliers = computeMultipliers(params)
  const finalFrequency = applyMultipliers(base, multipliers)
  const monthsInterval = Math.round(12 / finalFrequency)
  
  const recommendations: string[] = []
  
  if (finalFrequency >= 12) {
    recommendations.push('Surveillance mensuelle requise')
  } else if (finalFrequency >= 4) {
    recommendations.push(`Surveillance tous les ${monthsInterval} mois`)
  } else if (finalFrequency >= 2) {
    recommendations.push(`Surveillance ${monthsInterval === 6 ? 'semestrielle' : `${monthsInterval} mois`}`)
  } else {
    recommendations.push('Surveillance annuelle')
  }
  
  if (params.hasCriticalEcarts) {
    recommendations.push('Priorité aux domaines avec écarts critiques')
  }
  
  if (params.tendance === 'baisse') {
    recommendations.push('Tendance baissière - Surveillance renforcée')
  }
  
  return {
    frequencyPerYear: finalFrequency,
    monthsInterval,
    recommendations,
  }
}

/**
 * Suggère le type de mission selon le contexte
 */
export function suggestMissionType(params: {
  riskLevel: NiveauRisque
  hasCriticalEcarts: boolean
  hasPacInProgress: boolean
  isCertificationPhase: boolean
}): string {
  if (params.riskLevel === 'critique') {
    return 'audit_complet'
  }
  
  if (params.hasCriticalEcarts) {
    return 'suivi_ecarts'
  }
  
  if (params.hasPacInProgress) {
    return 'mise_oeuvre_pac'
  }
  
  if (params.isCertificationPhase) {
    return 'certification'
  }
  
  return 'programmee'
}

/**
 * Obtient la classe CSS pour la fréquence
 */
export function getFrequencyClass(frequency: number): string {
  if (frequency >= 12) return 'badge danger'
  if (frequency >= 4) return 'badge warning'
  if (frequency >= 2) return 'badge primary'
  return 'badge success'
}

/**
 * Obtient le libellé de la fréquence
 */
export function getFrequencyLabel(frequencyPerYear: number): string {
  if (frequencyPerYear >= 12) return 'Mensuelle'
  if (frequencyPerYear >= 6) return 'Bimensuelle'
  if (frequencyPerYear >= 4) return 'Trimestrielle'
  if (frequencyPerYear >= 2) return 'Semestrielle'
  return 'Annuelle'
}