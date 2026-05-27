// lib/risque/matrix.ts
// Matrice OACI 5×5 : probabilité × gravité

import type { NiveauProbabilite, NiveauGravite, NiveauRisque } from './types'
import type { RisqueDomaine, CalculProbabiliteParams, CalculGraviteParams } from './types'

// ============================================================
// CONSTANTES DE LA MATRICE
// ============================================================

const MATRICE_CELLULES: Record<string, NiveauRisque> = {
  '5A': 'critique', '5B': 'critique', '5C': 'critique',
  '4A': 'critique', '4B': 'critique', '3A': 'critique',
  '5D': 'eleve', '4C': 'eleve', '3B': 'eleve', '2A': 'eleve',
  '5E': 'moyen', '4D': 'moyen', '3C': 'moyen', '2B': 'moyen', '1A': 'moyen',
}

const COULEUR_PAR_DEFAUT = 'bg-green-500'
const POIDS_NS = 1.0
const POIDS_NV = 0.7

// ============================================================
// FONCTIONS DE LA MATRICE OACI
// ============================================================

export function computeProbabilityLevel(params: CalculProbabiliteParams): NiveauProbabilite {
  const { nbNS, nbNV, nbTotal, nbEcarts, nbIncidents } = params
  if (nbTotal === 0) return 1
  let score = (nbNS * POIDS_NS + nbNV * POIDS_NV) / nbTotal
  score += nbEcarts * 0.1
  score += nbIncidents * 0.2
  score = Math.min(1.0, score)
  if (score >= 0.8) return 5
  if (score >= 0.6) return 4
  if (score >= 0.4) return 3
  if (score >= 0.2) return 2
  return 1
}

export function computeGravityLevel(params: CalculGraviteParams): NiveauGravite {
  const { nbEcartsCritiques, nbEcartsEleves, nbEcartsMoyens, nbIncidentsGraves } = params
  let scoreMax = 0
  if (nbIncidentsGraves > 0) scoreMax = Math.max(scoreMax, 5)
  if (nbEcartsCritiques > 0) scoreMax = Math.max(scoreMax, 4)
  if (nbEcartsEleves > 0) scoreMax = Math.max(scoreMax, 3)
  if (nbEcartsMoyens > 0) scoreMax = Math.max(scoreMax, 2)
  if (scoreMax === 0) scoreMax = 1
  const mapping: Record<number, NiveauGravite> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' }
  return mapping[scoreMax]
}

export function getMatrixCell(probabilite: NiveauProbabilite, gravite: NiveauGravite): string {
  return `${probabilite}${gravite}`
}

export function getRiskLevelFromCell(cellule: string): NiveauRisque {
  return MATRICE_CELLULES[cellule] || 'faible'
}

export function getCellColor(cellule: string): string {
  const niveau = getRiskLevelFromCell(cellule)
  switch (niveau) {
    case 'critique': return 'bg-red-600'
    case 'eleve': return 'bg-orange-500'
    case 'moyen': return 'bg-yellow-500'
    default: return COULEUR_PAR_DEFAUT
  }
}

// ============================================================
// FONCTIONS DE CONFIANCE ET DE DOMAINE
// ============================================================

export function computeConfidenceInterval(values: number[], confidence = 0.95): [number, number] {
  if (values.length < 2) return [0, 100]
  const sorted = [...values].sort((a, b) => a - b)
  const alpha = 1 - confidence
  const lo = Math.floor((alpha / 2) * sorted.length)
  const hi = Math.floor((1 - alpha / 2) * sorted.length)
  return [Math.max(0, sorted[lo]), Math.min(100, sorted[hi] ?? sorted[sorted.length - 1])]
}

export function computeDomainRisk(
  probabilite: NiveauProbabilite,
  gravite: NiveauGravite,
  confiance = 75,
  volatilite = 15,
  tendance: 'hausse' | 'baisse' | 'stable' = 'stable',
  domaine = '',
): RisqueDomaine {
  const cellule = getMatrixCell(probabilite, gravite)
  const niveau = getRiskLevelFromCell(cellule)
  return { domaine, probabilite, gravite, niveau, cellule, confiance, volatilite, tendance }
}

export function computeFullMatrix(): Record<string, string> {
  const probabilites: NiveauProbabilite[] = [1, 2, 3, 4, 5]
  const gravites: NiveauGravite[] = ['A', 'B', 'C', 'D', 'E']
  const matrix: Record<string, string> = {}
  for (const p of probabilites) {
    for (const g of gravites) {
      const cell = getMatrixCell(p, g)
      matrix[cell] = getRiskLevelFromCell(cell)
    }
  }
  return matrix
}

export function getRiskLevelClass(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'badge danger'
    case 'eleve': return 'badge warning'
    case 'moyen': return 'badge primary'
    case 'faible': return 'badge success'
    default: return 'badge neutral'
  }
}

export function getRiskLevelColor(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'text-danger'
    case 'eleve': return 'text-warning'
    case 'moyen': return 'text-primary'
    case 'faible': return 'text-success'
    default: return 'text-muted-foreground'
  }
}
