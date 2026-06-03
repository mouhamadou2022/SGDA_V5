// lib/risque/bowTieEngine.ts
// Data-Driven Risk Assessment via Bow-Tie + OACI Matrix
// Calcule risque initial, résiduel, et trajectoire pour chaque écart

import type { Ecart } from '@/lib/store'

// OACI Matrix references
type OACIProb = 1 | 2 | 3 | 4 | 5
type OACIGrav = 'A' | 'B' | 'C' | 'D' | 'E'

export interface OACICell {
  probabilite: OACIProb
  gravite: OACIGrav
  cellule: string  // "4A", "2B", etc.
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  couleur: string
}

export interface RiskAssessment {
  celluleInitiale: OACICell
  justificationInitiale: string
  celluleResiduelle?: OACICell  // Après PAC
  gainPAC?: string
  celluleApresPreuves?: OACICell  // Après validation preuves
  gainPreuves?: string
  celluleFinale?: OACICell  // Après clôture
}

// OACI Matrix — gravity never changes for a given danger
const GRAVITE_MAP: Record<string, OACIGrav> = {
  critique: 'A', eleve: 'B', moyen: 'C', faible: 'D',
}

// Cell → risk level
function getCellNiveau(p: number, g: string): 'critique' | 'eleve' | 'moyen' | 'faible' {
  const key = `${p}${g}`
  if (['5A', '5B', '4A', '3A', '5C'].includes(key)) return 'critique'
  if (['4B', '3B', '5D', '4C', '2A', '1A'].includes(key)) return 'eleve'
  if (['3C', '4D', '5E', '2B', '3D', '4E'].includes(key)) return 'moyen'
  return 'faible'
}

const CELL_COLORS: Record<string, string> = {
  critique: '#dc2626', eleve: '#ea580c', moyen: '#eab308', faible: '#16a34a',
}

/**
 * Calcule la cellule OACI initiale pour un écart
 * Basé sur les données réelles : niveau de risque de l'écart, domaine, récurrence
 */
export function computeInitialCell(ecart: Partial<Ecart>, ecartsSimilaires: Ecart[] = []): RiskAssessment {
  // Gravité = intrinsèque au danger, ne change pas
  const gravite: OACIGrav = GRAVITE_MAP[ecart.niveau_risque || 'moyen'] || 'C'

  // Probabilité initiale basée sur :
  // 1. Nombre d'écarts similaires (même domaine) dans l'historique
  // 2. Niveau de risque
  const nbSimilaires = ecartsSimilaires.length
  let prob: OACIProb = 3 // défaut moyen
  if (ecart.niveau_risque === 'critique') prob = 4
  else if (ecart.niveau_risque === 'eleve') prob = 3
  else if (ecart.niveau_risque === 'moyen') prob = 2

  // Bonus de probabilité si récurrent
  if (nbSimilaires >= 5) prob = Math.min(5, prob + 2) as OACIProb
  else if (nbSimilaires >= 3) prob = Math.min(5, prob + 1) as OACIProb

  const cellule = `${prob}${gravite}`
  const niveau = getCellNiveau(prob, gravite)

  const reasons: string[] = []
  if (ecart.niveau_risque === 'critique') reasons.push('niveau critique intrinsèque')
  if (nbSimilaires > 0) reasons.push(`${nbSimilaires} écart(s) similaire(s) détecté(s) sur ce domaine`)

  return {
    celluleInitiale: { probabilite: prob, gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
    justificationInitiale: reasons.length > 0 ? reasons.join(' — ') : 'Écart isolé, risque modéré',
  }
}

/**
 * Évalue le risque résiduel après soumission d'un PAC
 * Chaque action du PAC = une barrière qui réduit la probabilité
 */
export function evaluatePAC(initialCell: OACICell, nbActions: number, actionsDetail: { description: string; responsable: string; date_prevue: string }[] = []): RiskAssessment {
  // Chaque action réduit la probabilité (maximum -2)
  let probReduction = Math.min(2, Math.floor(nbActions / 2))
  if (nbActions >= 5) probReduction = 2
  if (nbActions >= 3 && nbActions < 5) probReduction = 1
  if (nbActions <= 0) probReduction = 0

  let nouvelleProb = Math.max(1, initialCell.probabilite - probReduction) as OACIProb
  const cellule = `${nouvelleProb}${initialCell.gravite}`
  const niveau = getCellNiveau(nouvelleProb, initialCell.gravite)

  const gain = probReduction > 0
    ? `-${probReduction} niveau de probabilité grâce à ${nbActions} action(s) corrective(s)`
    : 'Aucune réduction — PAC insuffisant'

  const reasons: string[] = []
  if (probReduction > 0) reasons.push(`${nbActions} barrières ajoutées, BSV consolidé réduit la probabilité de ${probReduction} niveau(x)`)
  if (actionsDetail.length > 0) reasons.push(`${actionsDetail.length} action(s) documentée(s) avec responsable et échéance`)

  return {
    celluleInitiale: initialCell,
    justificationInitiale: '',
    celluleResiduelle: { probabilite: nouvelleProb, gravite: initialCell.gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
    gainPAC: `${gain}${reasons.length > 0 ? ' — ' + reasons.join(' ; ') : ''}`,
  }
}

/**
 * Évalue après soumission des preuves
 * Les preuves confirment (ou non) les barrières
 */
export function evaluatePreuves(
  celluleResiduelle: OACICell,
  nbPreuves: number,
  preuvesConformes: number,
  barriereInitiale?: OACICell
): RiskAssessment {
  const ratio = nbPreuves > 0 ? preuvesConformes / nbPreuves : 0
  // Ratio > 80% → -1 probabilité supplémentaire
  // Ratio 50-80% → stable
  // Ratio < 50% → +1 probabilité (dégradation)
  let probAjustement = 0
  if (ratio >= 0.8) probAjustement = -1
  else if (ratio < 0.5) probAjustement = 1

  let nouvelleProb = Math.max(1, Math.min(5, celluleResiduelle.probabilite + probAjustement)) as OACIProb
  const cellule = `${nouvelleProb}${celluleResiduelle.gravite}`
  const niveau = getCellNiveau(nouvelleProb, celluleResiduelle.gravite)

  const gain = ratio >= 0.8
    ? `Preuves confirmées (${Math.round(ratio * 100)}%) — probabilité réduite`
    : ratio < 0.5
    ? `Preuves insuffisantes (${Math.round(ratio * 100)}%) — risque de dégradation`
    : `Preuves partiellement validées (${Math.round(ratio * 100)}%)`

  return {
    celluleInitiale: barriereInitiale || celluleResiduelle,
    justificationInitiale: '',
    celluleResiduelle: celluleResiduelle,
    celluleApresPreuves: { probabilite: nouvelleProb, gravite: celluleResiduelle.gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
    gainPreuves: gain,
    celluleFinale: { probabilite: nouvelleProb, gravite: celluleResiduelle.gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
  }
}

/**
 * Récupère la trajectoire complète pour un écart
 */
export function getRiskTrajectory(ecart: any): {
  initial: string
  afterPAC?: string
  afterPreuves?: string
  final: string
  trend: 'improving' | 'stable' | 'degrading'
} {
  const initial = ecart.cellule_risque_oaci || ecart.cellule_risque || `${ecart.probabilite_risque || 3}${ecart.gravite_risque || 'C'}`
  const afterPAC = ecart.cellule_pac_evaluee || ecart.cellule_risque_oaci || undefined
  const afterPreuves = ecart.cellule_preuves_evaluee || undefined

  // Determine trend
  const getProb = (cell: string) => parseInt(cell[0]) || 3
  const initProb = getProb(initial)
  const finalProb = afterPreuves ? getProb(afterPreuves) : afterPAC ? getProb(afterPAC) : initProb

  let trend: 'improving' | 'stable' | 'degrading' = 'stable'
  if (finalProb < initProb) trend = 'improving'
  else if (finalProb > initProb) trend = 'degrading'

  return {
    initial,
    afterPAC,
    afterPreuves,
    final: afterPreuves || afterPAC || initial,
    trend,
  }
}
