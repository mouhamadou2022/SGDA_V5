// lib/risque/aggravators.ts
// Facteurs aggravants (Exacerbators) - 7 types
// Multiplicateurs de risque basés sur le contexte
// 0 style inline, 0 fetch direct

import { TypeAggravator, FacteurAggravant } from './types'

// Multiplicateurs par défaut des aggravants
const MULTIPLICATEURS_AGRAVATORS: Record<TypeAggravator, number> = {
  nc_recurrente: 1.5,
  absence_barriere: 2.0,
  surcharge: 1.4,
  c1_bas: 1.3,
  rotation_personnel: 1.2,
  absence_formation: 1.3,
  historique_incidents: 1.5,
}

// Seuil pour considérer une non-conformité comme récurrente
const SEUIL_NC_RECURRENTE = 3 // 3 NS sur le même item en 12 mois

// Seuil pour considérer qu'il y a surcharge
const SEUIL_SURCHARGE = 5 // 5 écarts actifs simultanés

// Seuil pour C1 bas
const SEUIL_C1_BAS = 40

// Seuil pour rotation récente du personnel
const SEUIL_ROTATION_MOIS = 6

/**
 * Détecte les non-conformités récurrentes
 */
export function detectNcRecurrente(
  nbNSurItem: number,
  periodeMois: number = 12
): FacteurAggravant {
  const actif = nbNSurItem >= SEUIL_NC_RECURRENTE
  return {
    type: 'nc_recurrente',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.nc_recurrente,
    description: actif
      ? `${nbNSurItem} non-conformités récurrentes sur le même item (${periodeMois} mois)`
      : 'Pas de non-conformité récurrente',
  }
}

/**
 * Détecte l'absence de barrières efficaces
 */
export function detectAbsenceBarriere(
  barriereExistante: boolean,
  barriereEfficace: boolean
): FacteurAggravant {
  const actif = !barriereExistante || !barriereEfficace
  return {
    type: 'absence_barriere',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.absence_barriere,
    description: actif
      ? !barriereExistante
        ? 'Barrière préventive inexistante'
        : 'Barrière préventive inefficace'
      : 'Barrière préventive efficace',
  }
}

/**
 * Détecte la surcharge de l'exploitant
 */
export function detectSurcharge(
  nbEcartsActifs: number
): FacteurAggravant {
  const actif = nbEcartsActifs >= SEUIL_SURCHARGE
  return {
    type: 'surcharge',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.surcharge,
    description: actif
      ? `${nbEcartsActifs} écarts actifs simultanés (surcharge)`
      : `Charge normale (${nbEcartsActifs} écarts actifs)`,
  }
}

/**
 * Détecte si le score C1 (Maturité SGS) est bas
 */
export function detectC1Bas(
  scoreC1: number
): FacteurAggravant {
  const actif = scoreC1 < SEUIL_C1_BAS
  return {
    type: 'c1_bas',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.c1_bas,
    description: actif
      ? `Score C1 bas (${scoreC1}/100) - Maturité SGS insuffisante`
      : `Score C1 correct (${scoreC1}/100)`,
  }
}

/**
 * Détecte une rotation récente du personnel
 */
export function detectRotationPersonnel(
  moisDepuisDerniereRotation: number | null
): FacteurAggravant {
  const actif = moisDepuisDerniereRotation !== null && moisDepuisDerniereRotation <= SEUIL_ROTATION_MOIS
  return {
    type: 'rotation_personnel',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.rotation_personnel,
    description: actif
      ? `Rotation du personnel il y a ${moisDepuisDerniereRotation} mois`
      : 'Pas de rotation récente du personnel',
  }
}

/**
 * Détecte l'absence de formation sur un domaine
 */
export function detectAbsenceFormation(
  aFormationRecente: boolean,
  domaine: string
): FacteurAggravant {
  const actif = !aFormationRecente
  return {
    type: 'absence_formation',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.absence_formation,
    description: actif
      ? `Pas de formation récente sur le domaine ${domaine}`
      : `Formation récente sur le domaine ${domaine}`,
  }
}

/**
 * Détecte un historique d'incidents sur le domaine
 */
export function detectHistoriqueIncidents(
  nbIncidentsDomaine: number,
  periodeMois: number = 12
): FacteurAggravant {
  const actif = nbIncidentsDomaine >= 2
  return {
    type: 'historique_incidents',
    actif,
    multiplicateur: MULTIPLICATEURS_AGRAVATORS.historique_incidents,
    description: actif
      ? `${nbIncidentsDomaine} incidents sur le domaine dans les ${periodeMois} mois`
      : `Aucun incident récent sur le domaine`,
  }
}

/**
 * Détecte tous les aggravants actifs
 */
export function detectAllAggravators(params: {
  nbNSurItem: number
  barriereExistante: boolean
  barriereEfficace: boolean
  nbEcartsActifs: number
  scoreC1: number
  moisDepuisDerniereRotation: number | null
  aFormationRecente: boolean
  domaine: string
  nbIncidentsDomaine: number
}): FacteurAggravant[] {
  const aggravators: FacteurAggravant[] = []
  
  aggravators.push(detectNcRecurrente(params.nbNSurItem))
  aggravators.push(detectAbsenceBarriere(params.barriereExistante, params.barriereEfficace))
  aggravators.push(detectSurcharge(params.nbEcartsActifs))
  aggravators.push(detectC1Bas(params.scoreC1))
  aggravators.push(detectRotationPersonnel(params.moisDepuisDerniereRotation))
  aggravators.push(detectAbsenceFormation(params.aFormationRecente, params.domaine))
  aggravators.push(detectHistoriqueIncidents(params.nbIncidentsDomaine))
  
  return aggravators
}

/**
 * Calcule le multiplicateur global des aggravants
 */
export function computeAggravatorsMultiplier(aggravators: FacteurAggravant[]): number {
  let multiplier = 1.0
  
  for (const agg of aggravators) {
    if (agg.actif) {
      multiplier *= agg.multiplicateur
    }
  }
  
  return Math.min(3.0, multiplier)
}

/**
 * Obtient la description des aggravants actifs
 */
export function getActiveAggravatorsDescription(aggravators: FacteurAggravant[]): string {
  const actifs = aggravators.filter(a => a.actif)
  
  if (actifs.length === 0) {
    return "Aucun facteur aggravant"
  }
  
  return actifs.map(a => a.description).join(" · ")
}

/**
 * Obtient la classe CSS pour le multiplicateur
 */
export function getAggravatorsMultiplierClass(multiplier: number): string {
  if (multiplier >= 2.0) return 'badge danger'
  if (multiplier >= 1.5) return 'badge warning'
  return 'badge neutral'
}