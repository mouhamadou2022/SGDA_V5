// lib/risque/matrix.ts
// Matrice OACI 5×5 : probabilité × gravité

import type { NiveauProbabilite, NiveauGravite, NiveauRisque } from './types'
import type { RisqueDomaine, CalculProbabiliteParams, CalculGraviteParams } from './types'

// ============================================================
// CONSTANTES DE LA MATRICE
// ============================================================

import { OACI_URGENCY_MAP, urgencyToNiveau } from './oaciReference'

// Délègue à OACI_URGENCY_MAP (oaciReference.ts) qui est la référence canonique 25 cellules.
// Ce fichier garde un cache local pour performance mais la source de vérité est l'oaciReference.
const MATRICE_CELLULES: Record<string, NiveauRisque> = Object.fromEntries(
  Object.entries(OACI_URGENCY_MAP).map(([cell, entry]) => [cell, urgencyToNiveau(entry.urgence) as NiveauRisque])
)

const MATRICE_CELLULES_5: Record<string, NiveauRisque> = {
  ...MATRICE_CELLULES,
  '3E': 'tres_faible', '2D': 'tres_faible', '2E': 'tres_faible',
  '1C': 'tres_faible', '1D': 'tres_faible', '1E': 'tres_faible',
}

const COULEUR_PAR_DEFAUT = 'bg-green-500 text-white'
const POIDS_NS = 1.0
const POIDS_NV = 0.7

// ============================================================
// FONCTIONS DE LA MATRICE OACI
// ============================================================

export function computeProbabilityLevel(params: CalculProbabiliteParams): NiveauProbabilite {
  const { nbNS, nbNV, nbTotal, nbEcarts, nbIncidents } = params
  if (nbTotal === 0) return 1
  // Les trois termes sont normalisés par nbTotal pour que le score reste un ratio
  // comparable entre aérodromes de tailles différentes. Sans normalisation, un grand
  // aérodrome très inspecté voyait son premier terme dilué mais gardait le même bonus
  // absolu pour nbEcarts/nbIncidents qu'un petit aérodrome — injuste statistiquement.
  let score = (nbNS * POIDS_NS + nbNV * POIDS_NV) / nbTotal
  score += (nbEcarts * 0.1) / nbTotal
  score += (nbIncidents * 0.2) / nbTotal
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

// Reconstruit la meilleure valeur OACI disponible depuis un objet écart
export interface HasOACI {
  cellule_risque_oaci?: string | null;
  probabilite_risque?: number | null;
  gravite_risque?: string | null;
  niveau_risque?: string | null;
}
export function getOACIValue(ecart: HasOACI): string | null {
  // 1. Valeur stockée valide
  const c = ecart.cellule_risque_oaci;
  if (c && /^[1-5][A-E]$/i.test(c)) return c.toUpperCase();
  // 2. Reconstruction depuis probabilite + gravite
  const p = ecart.probabilite_risque;
  const g = ecart.gravite_risque;
  if (p != null && g != null) {
    const rebuilt = `${p}${g}`.toUpperCase();
    if (/^[1-5][A-E]$/.test(rebuilt)) return rebuilt;
  }
  // 3. Dérivation depuis le niveau de risque
  const niveauMap: Record<string, string> = { critique: '5A', eleve: '4B', moyen: '3C', faible: '2D', tres_faible: '1E' };
  const nr = ecart.niveau_risque;
  if (nr && niveauMap[nr]) return niveauMap[nr];
  return null;
}

export function getRiskLevelFromCell(cellule: string): NiveauRisque {
  // Les 25 cellules OACI sont couvertes explicitement ci-dessus.
  // Le fallback ne devrait jamais être atteint pour une cellule valide.
  const niveau = MATRICE_CELLULES[cellule]
  if (!niveau) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[matrix] Cellule OACI inconnue: "${cellule}" — vérifier la couverture MATRICE_CELLULES`)
    }
    return 'faible'
  }
  return niveau
}

export function getRiskLevelFromCell5(cellule: string): NiveauRisque {
  return MATRICE_CELLULES_5[cellule] || 'tres_faible'
}

export function getCellColor(cellule: string): string {
  if (!cellule || !/^[1-5][A-E]$/.test(cellule)) return 'bg-gray-200 text-gray-500';
  const niveau = getRiskLevelFromCell(cellule)
  switch (niveau) {
    case 'critique': return 'bg-red-600 text-white'
    case 'eleve': return 'bg-orange-500 text-white'
    case 'moyen': return 'bg-yellow-500 text-black'
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

export function getRiskLevelVariant(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'danger'
    case 'eleve': return 'warning'
    case 'moyen': return 'primary'
    case 'faible': return 'success'
    default: return 'neutral'
  }
}

export function getRiskLevelBgColor(niveau: string): string {
  if (!niveau) return 'bg-gray-200 text-gray-500';
  switch (niveau) {
    case 'critique': return 'bg-red-600 text-white'
    case 'eleve': return 'bg-orange-500 text-white'
    case 'moyen': return 'bg-yellow-500 text-black'
    case 'faible': return 'bg-green-500 text-white'
    default: return 'bg-gray-200 text-gray-500'
  }
}

export function getRiskLevelBgVariant(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'bg-danger'
    case 'eleve': return 'bg-warning'
    case 'moyen': return 'bg-primary'
    case 'faible': return 'bg-success'
    default: return 'bg-neutral'
  }
}

export function getRiskLevelBorderVariant(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'border-danger'
    case 'eleve': return 'border-warning'
    case 'moyen': return 'border-primary'
    case 'faible': return 'border-success'
    default: return 'border-border'
  }
}
