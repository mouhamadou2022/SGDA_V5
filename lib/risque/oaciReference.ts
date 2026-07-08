// lib/risque/oaciReference.ts
// Référence UNIQUE pour la classification OACI 5×5 (25 cellules).
// Tous les modules (riskEngine.ts, matrix.ts, bowTieEngine.ts) doivent importer depuis ici.
// 0 dépendance externe.

export type UrgenceOACI = 'critique' | 'haute' | 'moyenne' | 'basse'

export interface OACIEntry {
  label: string
  delaiJours: number
  urgence: UrgenceOACI
}

// Couverture 25/25 cellules — la plus complète et la mieux structurée du codebase.
// C'est LA référence canonique pour toute classification OACI.
export const OACI_URGENCY_MAP: Record<string, OACIEntry> = {
  '5A': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '5B': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '4A': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '4B': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '5C': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '5D': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '4C': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '3A': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '3B': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '4D': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '4E': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '3C': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '3D': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '2A': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '2B': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '3E': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '2C': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '2D': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '2E': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1A': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1B': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1C': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1D': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1E': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
}

const URGENCE_TO_NIVEAU: Record<string, string> = {
  critique: 'critique',
  haute: 'eleve',
  moyenne: 'moyen',
  basse: 'faible',
}

const NIVEAU_COULEURS: Record<string, string> = {
  critique: '#dc2626',
  eleve: '#ea580c',
  moyen: '#eab308',
  faible: '#16a34a',
}

/**
 * Fonction de lookup canonique : tous les modules doivent utiliser celle-ci
 * plutôt que de définir leur propre mapping inline.
 */
export function getOACIRiskLevel(cellule: string): { niveau: string; couleur: string } {
  const entry = OACI_URGENCY_MAP[cellule]
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[oaciReference] Cellule inconnue: "${cellule}"`)
      }
      return { niveau: 'faible', couleur: '#16a34a' }
  }
  const niveau = URGENCE_TO_NIVEAU[entry.urgence] || 'faible'
  return { niveau, couleur: NIVEAU_COULEURS[niveau] || '#16a34a' }
}

/**
 * Mapping urgence → niveau risque (4 niveaux)
 */
export function urgencyToNiveau(urgence: UrgenceOACI): string {
  return URGENCE_TO_NIVEAU[urgence] || 'faible'
}

/**
 * Tableau plat de toutes les cellules (utile pour itération UI)
 */
export const ALL_OACI_CELLS = Object.keys(OACI_URGENCY_MAP)
