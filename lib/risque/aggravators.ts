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
 *
 * ATTENTION — couplage avec detectIncidentTrigger (triggers.ts) :
 * nbIncidentsDomaine (ici, fenêtre 12mois) et nbIncidentsRecents (trigger, fenêtre 30j)
 * peuvent se recouper si les mêmes incidents alimentent les deux compteurs. L'appelant
 * doit garantir que ce sont des ensembles disjoints ou documenter le choix de recouvrement,
 * faute de quoi un même incident sera compté deux fois dans des mécanismes différents
 * (poids additif × multiplicateur multiplicatif) qui finissent multipliés ensemble
 * dans computeOptimalFrequency.
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
 * Calcule le multiplicateur global des aggravants par saturation douce.
 *
 * Remplace l'ancien produit brut clampé : avec 7 facteurs cumulant jusqu'à 9.56×, le clamp
 * à 3.0 créait un plateau dur où 4 facteurs ou 7 facteurs donnaient le même score (3.0),
 * annulant tout pouvoir discriminant au-delà du seuil.
 *
 * Nouveau modèle : somme des excès (multiplicateur - 1) passée dans une fonction
 * d'approche exponentielle :  1 + maxExcess × (1 − e^{−sum / k})
 * - sum = Σ active (factor - 1)
 * - maxExcess = CLAMP_MAX - 1 = 2.0
 * - k = 1.5 (constante de saturation : plus k est grand, plus la saturation est lente)
 *
 * Résultat : dégradation progressive et monotone, pas de palier artificiel.
 * Avec 1 facteur : 1.27 — 3 facteurs : 1.76 — 7 facteurs : 2.61 (jamais de plateau)
 */
export function computeAggravatorsMultiplier(aggravators: FacteurAggravant[]): number {
  const CLAMP_MAX = 3.0
  const K = 1.5

  const sum = aggravators
    .filter(a => a.actif)
    .reduce((acc, a) => acc + (a.multiplicateur - 1), 0)

  const maxExcess = CLAMP_MAX - 1
  const multiplier = 1 + maxExcess * (1 - Math.exp(-sum / K))

  return Math.min(CLAMP_MAX, multiplier)
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