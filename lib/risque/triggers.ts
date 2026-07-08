// lib/risque/triggers.ts
// Facteurs déclencheurs (Triggers) - 6 types
// Événements qui déclenchent une alerte ou un recalcule
// 0 style inline, 0 fetch direct

import { TypeTrigger, FacteurDeclencheur } from './types'

// Poids par défaut des triggers
const POIDS_TRIGGERS: Record<TypeTrigger, number> = {
  ecart_critique: 0.40,
  delai_expire: 0.30,
  incident: 0.50,
  changement_exploitant: 0.20,
  saison_pluies: 0.25,
  post_inspection: 0.15,
}

// Périodes à risque pour la saison des pluies (juillet à septembre)
const SAISON_PLUIES_MOIS = [6, 7, 8] // 0-indexé: 6=juillet, 7=août, 8=septembre

/**
 * Détecte si un écart critique est actif
 */
export function detectEcartCritiqueTrigger(
  nbEcartsCritiques: number
): FacteurDeclencheur {
  const actif = nbEcartsCritiques > 0
  return {
    type: 'ecart_critique',
    actif,
    poids: POIDS_TRIGGERS.ecart_critique,
    description: actif
      ? `${nbEcartsCritiques} écart(s) critique(s) actif(s)`
      : 'Aucun écart critique actif',
  }
}

/**
 * Détecte si un délai est expiré
 */
export function detectDelaiExpireTrigger(
  nbDelaisDepasses: number
): FacteurDeclencheur {
  const actif = nbDelaisDepasses > 0
  return {
    type: 'delai_expire',
    actif,
    poids: POIDS_TRIGGERS.delai_expire,
    description: actif
      ? `${nbDelaisDepasses} délai(s) expiré(s)`
      : 'Aucun délai expiré',
  }
}

/**
 * Détecte si un incident récent est survenu
 *
 * ATTENTION — couplage avec detectHistoriqueIncidents (aggravators.ts) :
 * nbIncidentsRecents (ici, fenêtre 30j) et nbIncidentsDomaine (aggravator, fenêtre 12mois)
 * peuvent se recouper si les mêmes incidents alimentent les deux compteurs. L'appelant
 * doit garantir que ce sont des ensembles disjoints (ex: incidents récents ≤30j exclus du
 * compteur aggravator) ou au contraire que le recouvrement est intentionnel.
 * Voir aussi : la fonction detectAllTriggers dans triggers.ts et detectAllAggravators.
 */
export function detectIncidentTrigger(
  nbIncidentsRecents: number,
  seuilJours: number = 30
): FacteurDeclencheur {
  const actif = nbIncidentsRecents > 0
  return {
    type: 'incident',
    actif,
    poids: POIDS_TRIGGERS.incident,
    description: actif
      ? `${nbIncidentsRecents} incident(s) dans les ${seuilJours} jours`
      : `Aucun incident dans les ${seuilJours} jours`,
  }
}

/**
 * Détecte un changement d'exploitant
 */
export function detectChangementExploitantTrigger(
  moisDepuisChangement: number | null,
  seuilMois: number = 6
): FacteurDeclencheur {
  const actif = moisDepuisChangement !== null && moisDepuisChangement <= seuilMois
  return {
    type: 'changement_exploitant',
    actif,
    poids: POIDS_TRIGGERS.changement_exploitant,
    description: actif
      ? `Changement d'exploitant il y a ${moisDepuisChangement} mois`
      : 'Pas de changement récent d\'exploitant',
  }
}

/**
 * Détecte la saison des pluies
 */
export function detectSaisonPluiesTrigger(dateActuelle: Date = new Date()): FacteurDeclencheur {
  const mois = dateActuelle.getMonth()
  const actif = SAISON_PLUIES_MOIS.includes(mois)
  return {
    type: 'saison_pluies',
    actif,
    poids: POIDS_TRIGGERS.saison_pluies,
    description: actif
      ? 'Période de saison des pluies (risque accru)'
      : 'Hors saison des pluies',
  }
}

/**
 * Détecte si une inspection a eu lieu récemment
 */
export function detectPostInspectionTrigger(
  joursDepuisDerniereInspection: number | null,
  seuilJours: number = 30
): FacteurDeclencheur {
  const actif = joursDepuisDerniereInspection !== null && joursDepuisDerniereInspection <= seuilJours
  return {
    type: 'post_inspection',
    actif,
    poids: POIDS_TRIGGERS.post_inspection,
    description: actif
      ? `Inspection récente (il y a ${joursDepuisDerniereInspection} jours)`
      : 'Pas d\'inspection récente',
  }
}

/**
 * Détecte tous les triggers actifs
 */
export function detectAllTriggers(params: {
  nbEcartsCritiques: number
  nbDelaisDepasses: number
  nbIncidentsRecents: number
  moisDepuisChangement: number | null
  joursDepuisDerniereInspection: number | null
  dateActuelle?: Date
}): FacteurDeclencheur[] {
  const triggers: FacteurDeclencheur[] = []
  
  triggers.push(detectEcartCritiqueTrigger(params.nbEcartsCritiques))
  triggers.push(detectDelaiExpireTrigger(params.nbDelaisDepasses))
  triggers.push(detectIncidentTrigger(params.nbIncidentsRecents))
  triggers.push(detectChangementExploitantTrigger(params.moisDepuisChangement))
  triggers.push(detectSaisonPluiesTrigger(params.dateActuelle))
  triggers.push(detectPostInspectionTrigger(params.joursDepuisDerniereInspection))
  
  return triggers
}

/**
 * Calcule le score d'impact global des triggers par saturation douce.
 *
 * Remplace l'ancien plateau dur à 2.0 par une fonction d'approche exponentielle
 * cohérente avec computeAggravatorsMultiplier dans aggravators.ts :
 * score = 1 + maxExcess × (1 − e^{−sumPoids / k})
 * où sumPoids = Σ(trigger.poids) des triggers actifs
 *
 * Résultat : dégradation progressive et monotone, pas de palier artificiel.
 */
export function computeTriggersImpact(triggers: FacteurDeclencheur[]): number {
  const MAX_IMPACT = 2.0
  const K = 1.5

  const sum = triggers
    .filter(t => t.actif)
    .reduce((acc, t) => acc + t.poids, 0)

  const maxExcess = MAX_IMPACT - 1
  const score = 1 + maxExcess * (1 - Math.exp(-sum / K))

  return Math.min(MAX_IMPACT, score)
}

/**
 * Obtient la description des triggers actifs
 */
export function getActiveTriggersDescription(triggers: FacteurDeclencheur[]): string {
  const actifs = triggers.filter(t => t.actif)
  
  if (actifs.length === 0) {
    return "Aucun facteur déclencheur actif"
  }
  
  return actifs.map(t => t.description).join(" · ")
}

/**
 * Obtient la classe CSS pour le niveau d'impact des triggers
 */
export function getTriggersImpactClass(impact: number): string {
  if (impact >= 1.5) return 'badge danger'
  if (impact >= 1.2) return 'badge warning'
  return 'badge neutral'
}