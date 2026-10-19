// lib/risque/infrastructureComplexite.ts
// Indice de complexité de l'infrastructure aérodrome (pistes, voies de
// circulation, aire de trafic) → pénalité appliquée à C3 (domaine physique).
//
// Pur, sans dépendance : la description est passée en paramètre. Le repli est
// NEUTRE (indice 0, pénalité 0, applicable=false) quand aucune donnée
// exploitable n'est fournie — un aérodrome existant sans ce bloc conserve donc
// exactement son comportement de score antérieur (non-régression).

export type ConfigurationPistes = 'unique' | 'paralleles' | 'croisees' | 'mixte'

export interface InfrastructureComplexite {
  /** Nombre de pistes (1, 2, 3…). */
  nombre_pistes?: number
  /** Agencement des pistes. */
  configuration_pistes?: ConfigurationPistes
  /** Nombre de voies de circulation (taxiways). */
  nombre_voies_circulation?: number
  /** Nombre d'accès de piste (positions d'attente / entrées). */
  nombre_acces_piste?: number
  /** Nombre de postes de stationnement (aire de trafic). */
  nombre_postes_stationnement?: number
  /** Points chauds (hotspots) déclarés sur l'aire de mouvement. */
  points_chauds?: number
}

export interface ComposanteComplexite {
  cle: string
  label: string
  valeur: number
  contribution: number
}

export interface ResultatComplexite {
  /** Indice 0-100 — plus haut = plus complexe (donc plus risqué). */
  indice: number
  /** Points retirés à C3 (0-20). */
  penaliteC3: number
  /** Vrai si au moins une donnée exploitable a été fournie. */
  applicable: boolean
  /** Détail transparent par composante. */
  composantes: ComposanteComplexite[]
  raison: string
}

/** Plafond de la pénalité C3 appliquée (points sur 100). */
export const PENALITE_C3_MAX = 20

function nombrePistes(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
  if (n <= 1) return 0
  if (n === 2) return 15
  return 25
}

const CONTRIB_CONFIG: Record<ConfigurationPistes, number> = {
  unique: 0,
  paralleles: 10,
  croisees: 20,
  mixte: 25,
}

function contribVoies(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
  if (n <= 2) return 0
  if (n <= 5) return 8
  return 15
}

function contribAcces(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
  if (n <= 2) return 0
  if (n <= 4) return 8
  return 15
}

function contribPostes(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
  if (n <= 5) return 0
  if (n <= 15) return 8
  return 15
}

function contribPointsChauds(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0
  if (n <= 0) return 0
  return Math.min(20, Math.round(n) * 8)
}

/**
 * Calcule l'indice de complexité et la pénalité C3 associée.
 * Purement déterministe et sans dépendance externe.
 */
export function computeInfrastructureComplexite(
  infra?: InfrastructureComplexite | null,
): ResultatComplexite {
  const vide: ResultatComplexite = {
    indice: 0,
    penaliteC3: 0,
    applicable: false,
    composantes: [],
    raison: 'Aucune donnée de complexité d\'infrastructure',
  }
  if (!infra) return vide

  const composantes: ComposanteComplexite[] = [
    { cle: 'nombre_pistes', label: 'Nombre de pistes', valeur: infra.nombre_pistes ?? 0, contribution: nombrePistes(infra.nombre_pistes) },
    { cle: 'configuration_pistes', label: 'Configuration des pistes', valeur: infra.configuration_pistes ? 1 : 0, contribution: infra.configuration_pistes ? CONTRIB_CONFIG[infra.configuration_pistes] : 0 },
    { cle: 'nombre_voies_circulation', label: 'Voies de circulation', valeur: infra.nombre_voies_circulation ?? 0, contribution: contribVoies(infra.nombre_voies_circulation) },
    { cle: 'nombre_acces_piste', label: 'Accès de piste', valeur: infra.nombre_acces_piste ?? 0, contribution: contribAcces(infra.nombre_acces_piste) },
    { cle: 'nombre_postes_stationnement', label: 'Postes de stationnement', valeur: infra.nombre_postes_stationnement ?? 0, contribution: contribPostes(infra.nombre_postes_stationnement) },
    { cle: 'points_chauds', label: 'Points chauds', valeur: infra.points_chauds ?? 0, contribution: contribPointsChauds(infra.points_chauds) },
  ]

  const renseignees = composantes.filter(c => c.contribution > 0 || c.valeur > 0)
  const applicable = renseignees.length > 0
  if (!applicable) return vide

  const brut = composantes.reduce((s, c) => s + c.contribution, 0)
  const indice = Math.min(100, Math.max(0, Math.round(brut)))
  const penaliteC3 = Math.round(indice / 100 * PENALITE_C3_MAX)

  const detail = composantes
    .filter(c => c.contribution > 0)
    .map(c => `${c.label} (+${c.contribution})`)
    .join(', ')

  return {
    indice,
    penaliteC3,
    applicable: true,
    composantes: composantes.filter(c => c.valeur > 0 || c.contribution > 0),
    raison: penaliteC3 > 0
      ? `Complexité ${indice}/100 → C3 -${penaliteC3} (${detail})`
      : `Complexité ${indice}/100 (faible, aucune pénalité)`,
  }
}

/** Applique la pénalité de complexité à un score C3 (borné 0-100). */
export function applyComplexiteC3(c3: number, resultat: ResultatComplexite): number {
  if (!resultat.applicable || resultat.penaliteC3 <= 0) return c3
  return Math.min(100, Math.max(0, Math.round(c3 - resultat.penaliteC3)))
}
