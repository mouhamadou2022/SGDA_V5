// lib/planning.ts — SGDA V5
// Référentiel canonique du module Planning (source unique).
//
// Cause racine corrigée :
// - Le statut d'un Planning et celui d'une Surveillance sont deux cycles de vie
//   distincts. Le Planning ne prend JAMAIS les statuts intermédiaires de la
//   surveillance (checklist_signee, ecarts_signes, rapport_signe, lettre_signee,
//   transmise, archivee). Il reste `en_cours` pendant le déroulement puis passe
//   à `realisee` quand la surveillance liée est transmise/archivée (sync dans
//   `passerEtapeSuivante`), ou à `annulee`.
// - Les prédicats ci-dessous prennent la surveillance liée en compte au lieu de
//   tester `planning.statut` contre des valeurs qu'il ne porte jamais.
// - Les doublons historiques de type (`programmee`→`periodique`,
//   `inopinee`→`inopine`) sont normalisés à la lecture, sans migration
//   destructive : les valeurs legacy restent acceptées en entrée.

import { expandDomaines, getDomaineCode, getDomaineInfo } from './domaines'

// ─────────────────────────────────────────────────────────────
// TYPES CANONIQUES
// ─────────────────────────────────────────────────────────────

export type PlanningTypeCanonique =
  | 'periodique'
  | 'inopine'
  | 'speciale'
  | 'suivi_ecarts'
  | 'mise_oeuvre_pac'
  | 'certification'
  | 'homologation'
  | 'audit_complet'
  | 'urgence'
  | 'maintien'

/** Aliases historiques encore présents en base — acceptés puis normalisés. */
export type PlanningTypeLegacy = 'programmee' | 'inopinee'

export type PlanningType = PlanningTypeCanonique | PlanningTypeLegacy

export type PlanningStatut =
  | 'planifiee'
  | 'en_cours'
  | 'realisee'
  | 'annulee'
  | 'en_retard'

/** Statuts du cycle Surveillance (rappel — ne sont PAS des statuts Planning). */
export type SurveillanceStatutTerminal = 'transmise' | 'archivee'

const SURVEILLANCE_TERMINALES: readonly string[] = ['transmise', 'archivee']
const SURVEILLANCE_AVANCEES: readonly string[] = [
  'checklist_signee',
  'ecarts_signes',
  'rapport_signe',
  'lettre_signee',
  'transmise',
  'archivee',
]

// ─────────────────────────────────────────────────────────────
// NORMALISATION DES TYPES (legacy → canonique)
// ─────────────────────────────────────────────────────────────

const TYPE_ALIASES: Record<string, PlanningTypeCanonique> = {
  programmee: 'periodique',
  periodique: 'periodique',
  inopinee: 'inopine',
  inopine: 'inopine',
  speciale: 'speciale',
  suivi_ecarts: 'suivi_ecarts',
  mise_oeuvre_pac: 'mise_oeuvre_pac',
  certification: 'certification',
  homologation: 'homologation',
  audit_complet: 'audit_complet',
  urgence: 'urgence',
  maintien: 'maintien',
}

/** Normalise un type de planning/surveillance vers le vocabulaire canonique. */
export function normalizePlanningType(type?: string | null): PlanningTypeCanonique {
  if (!type) return 'periodique'
  return TYPE_ALIASES[type] ?? (type as PlanningTypeCanonique)
}

/** Vrai si le type brut est un alias historique (à normaliser, pas à stocker). */
export function isLegacyPlanningType(type?: string | null): boolean {
  return type === 'programmee' || type === 'inopinee'
}

export const PLANNING_TYPE_LABELS: Record<PlanningTypeCanonique, string> = {
  periodique: 'Périodique',
  inopine: 'Inopinée',
  speciale: 'Spéciale',
  suivi_ecarts: 'Suivi écarts',
  mise_oeuvre_pac: 'Mise en œuvre PAC',
  certification: 'Certification',
  homologation: 'Homologation',
  audit_complet: 'Audit complet',
  urgence: 'Urgence',
  maintien: 'Maintien',
}

export function getPlanningTypeLabel(type?: string | null): string {
  return PLANNING_TYPE_LABELS[normalizePlanningType(type)] ?? (type || 'Périodique')
}

// ─────────────────────────────────────────────────────────────
// PRÉDICATS DE STATUT (Planning + surveillance liée)
// ─────────────────────────────────────────────────────────────

interface PlanningLike {
  statut: string
  est_proposition?: boolean
  date_fin?: string
  date_debut?: string
  surveillance_id?: string
  planning_id?: string
  id?: string
}

interface SurveillanceLike {
  id?: string
  planning_id?: string
  statut: string
}

/** Retrouve la surveillance liée à un planning (par id ou par planning_id). */
export function findLinkedSurveillance(
  planning: PlanningLike,
  surveillances: SurveillanceLike[] = [],
): SurveillanceLike | undefined {
  if (surveillances.length === 0) return undefined
  if (planning.surveillance_id) {
    const direct = surveillances.find((s) => s.id === planning.surveillance_id)
    if (direct) return direct
  }
  if (planning.id) {
    const inverse = surveillances.find((s) => s.planning_id === planning.id)
    if (inverse) return inverse
  }
  return undefined
}

/**
 * Un planning est « réalisé » si son statut propre est `realisee`,
 * ou si la surveillance liée est transmise/archivée (le planning n'a pas
 * encore été basculé — cas des données antérieures à la sync auto).
 */
export function isPlanningRealise(
  planning: PlanningLike,
  surveillances: SurveillanceLike[] = [],
): boolean {
  if (planning.statut === 'realisee') return true
  const liee = findLinkedSurveillance(planning, surveillances)
  return !!liee && SURVEILLANCE_TERMINALES.includes(liee.statut)
}

/**
 * Un planning est « terminal » (plus aucune action attendue) si :
 * annulé, réalisé, ou surveillance liée terminée ou avancée au-delà
 * de `en_cours` (checklist signée et suivantes — la mission est engagée
 * et le planning ne doit plus alerter en « retard »).
 */
export function isPlanningTerminal(
  planning: PlanningLike,
  surveillances: SurveillanceLike[] = [],
): boolean {
  if (planning.statut === 'annulee' || planning.statut === 'realisee') return true
  const liee = findLinkedSurveillance(planning, surveillances)
  if (!liee) return false
  return SURVEILLANCE_AVANCEES.includes(liee.statut)
}

export function estPlanningEnRetard(
  planning: PlanningLike,
  surveillances: SurveillanceLike[] = [],
  now = Date.now(),
): boolean {
  if (planning.statut === 'en_retard') return true
  if (planning.est_proposition) return false
  if (isPlanningTerminal(planning, surveillances)) return false
  const dFin = new Date(planning.date_fin || planning.date_debut || '').getTime()
  return !Number.isNaN(dFin) && dFin < now
}

// ─────────────────────────────────────────────────────────────
// DOMAINES DE PORTÉE (remplace les heuristiques locales)
// ─────────────────────────────────────────────────────────────

/**
 * Résout la portée d'un planning vers des codes domaines individuels valides.
 * Gère : codes directs (SGS, PHY…), `AGA` / `AGA/XXX`, labels stockés par
 * erreur, doublons. Les valeurs inconnues sont conservées telles quelles
 * pour ne pas perdre d'information métier.
 */
export function resolvePorteeDomaines(portee: string[] | undefined | null): string[] {
  if (!portee || portee.length === 0) return []
  const codes = portee.map((p) => getDomaineCode((p || '').trim())).filter(Boolean)
  const etendus = expandDomaines(codes)
  const connus = new Set(
    etendus.filter((c) => getDomaineInfo(c)),
  )
  // Conserve les valeurs non reconnues (ex. portées libres historiques)
  const inconnus = etendus.filter((c) => !getDomaineInfo(c))
  return [...connus, ...inconnus]
}

// ─────────────────────────────────────────────────────────────
// DATES — utilitaires mois (WorkloadView, Gantt, calendrier)
// ─────────────────────────────────────────────────────────────

/** Bornes [début, fin] d'un mois `YYYY-MM` en heure locale. */
export function getMonthBounds(moisYYYYMM: string): { debut: Date; fin: Date } {
  const [y, m] = moisYYYYMM.split('-').map(Number)
  return {
    debut: new Date(y, (m || 1) - 1, 1, 0, 0, 0, 0),
    fin: new Date(y, m || 1, 0, 23, 59, 59, 999),
  }
}

/**
 * Nombre de jours (inclusifs) d chevauchement entre une mission et un mois.
 * Retourne 0 si aucun chevauchement ou dates invalides.
 */
export function joursChevauchementMois(
  dateDebutISO: string,
  dateFinISO: string,
  moisYYYYMM: string,
): number {
  const debut = new Date(dateDebutISO).getTime()
  const fin = new Date(dateFinISO || dateDebutISO).getTime()
  if (Number.isNaN(debut) || Number.isNaN(fin)) return 0
  const { debut: mDebut, fin: mFin } = getMonthBounds(moisYYYYMM)
  const start = Math.max(debut, mDebut.getTime())
  const end = Math.min(fin, mFin.getTime())
  if (end < start) return 0
  return Math.floor((end - start) / 86400000) + 1
}

/** Vrai si la mission chevauche le mois (même partiellement). */
export function missionChevaucheMois(
  dateDebutISO: string,
  dateFinISO: string,
  moisYYYYMM: string,
): boolean {
  return joursChevauchementMois(dateDebutISO, dateFinISO, moisYYYYMM) > 0
}

/** Nombre de jours ouvrés (lun–ven) d'un mois `YYYY-MM`. */
export function joursOuvresDuMois(moisYYYYMM: string): number {
  const { debut, fin } = getMonthBounds(moisYYYYMM)
  let n = 0
  const cursor = new Date(debut)
  while (cursor <= fin) {
    const j = cursor.getDay()
    if (j !== 0 && j !== 6) n += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return Math.max(n, 1)
}
