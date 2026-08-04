// lib/ia/digitalTwin.ts
// Moteur du jumeau numérique interactif AERORISQ.
// À partir des leviers manipulables par l'utilisateur (critères C1-C5,
// horizon de projection, facteurs aggravants, cygne noir, actions
// correctives) et des données réelles (profil, écarts, historique des
// scores), il calcule l'état projeté du jumeau : score global pondéré,
// niveaux, maturité SGS, scénarios what-if et série de projection.
//
// Purement déterministe et testable : aucune dépendance UI ni réseau.

import { calculateGlobalScore, RISK_LEVELS, getRiskLevel } from '@/lib/risque'
import { generateAllScenarios } from '@/lib/risque/scenarios'
import type { Ecart, ProfilRisque, ScoreHistoryPoint } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'

export type NiveauJumeau = keyof typeof RISK_LEVELS

/** Leviers exposés dans l'interface — seules valeurs modifiées par l'utilisateur. */
export interface LeviersJumeau {
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  /** Horizon de projection en mois (3 / 6 / 12). */
  horizon: number
  /** Multiplicateur des facteurs aggravants (0 = aucun, jusqu'à 3). */
  aggravators: number
  blackSwan: boolean
  /** Action corrective : traiter les écarts critiques ouverts. */
  fermerEcartsCritiques: boolean
  /** Action corrective : renforcer la surveillance. */
  renforcerSurveillance: boolean
  /** Action corrective : renforcer la formation (maturité SGS). */
  renforcerFormation: boolean
}

/** Scénario what-if projeté (copie stricte des 4 scénarios du moteur). */
export interface ScenarioProjete {
  nom: string
  probabilite: number
  scoreProjecte: number
  intervalleConfiance: [number, number]
  actionsRecommandees: string[]
}

/** État complet simulé du jumeau. */
export interface EtatJumeau {
  criteres: { c1: number; c2: number; c3: number; c4: number; c5: number }
  bonus: { c1: number; c2: number; c3: number; c4: number; c5: number }
  scoreJumeau: number
  scorePhysique: number
  delta: number
  niveauPhysique: NiveauJumeau
  niveauJumeau: NiveauJumeau
  maturiteC1Physique: string
  maturiteC1Jumeau: string
  ecartsCritiquesOuverts: number
  ecartsTotalOuverts: number
  scenarios: ScenarioProjete[]
}

/** Point de la trajectoire de projection (physique + jumeau + 4 scénarios). */
export interface PointProjection {
  label: string
  historique: number | null
  jumeau: number | null
  optimiste: number | null
  realiste: number | null
  pessimiste: number | null
  catastrophe: number | null
}

const clamp = (v: number): number => Math.max(0, Math.min(100, v))

/** Leviers par défaut, alignés sur l'état réel du profil. */
export function leviersParDefaut(profil: ProfilRisque): LeviersJumeau {
  return {
    c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5,
    horizon: 6,
    aggravators: 1,
    blackSwan: profil.bayesian_black_swan ?? false,
    fermerEcartsCritiques: false,
    renforcerSurveillance: false,
    renforcerFormation: false,
  }
}

/** Compte les écarts ouverts (total et critiques) — alimente les leviers. */
export function compterEcartsOuverts(ecarts: Ecart[]): { critiques: number; total: number } {
  const ouverts = ecarts.filter(e => e.statut === 'ouvert')
  const critiques = ouverts.filter(e => e.niveau_risque === 'critique').length
  return { critiques, total: ouverts.length }
}

/** Bonus appliqués aux critères selon les actions correctives engagées. */
function calculerBonus(leviers: LeviersJumeau, nbCritiques: number): { c1: number; c2: number; c3: number; c4: number; c5: number } {
  let c4 = 0
  if (leviers.fermerEcartsCritiques && nbCritiques > 0) {
    c4 = Math.min(25, 10 + nbCritiques * 3)
  }
  let c5 = 0, c3 = 0
  if (leviers.renforcerSurveillance) { c5 += 12; c3 += 6 }
  let c1 = 0, c2 = 0
  if (leviers.renforcerFormation) { c1 += 10; c2 += 5 }
  return { c1, c2, c3, c4, c5 }
}

/** Construit la série de scores (historique réel + état jumeau) pour les scénarios. */
export function construireSerieHistorique(historique: ScoreHistoryPoint[], scoreJumeau: number): number[] {
  const scores = historique.map(h => h.score)
  if (scores.length === 0) return [Math.max(0, scoreJumeau - 8), scoreJumeau]
  if (scores.length === 1) return [scores[0], scoreJumeau]
  return [...scores, scoreJumeau]
}

/** Simule l'état projeté du jumeau numérique. */
export function simulerJumeauNumerique(params: {
  profil: ProfilRisque
  ecarts: Ecart[]
  historique: ScoreHistoryPoint[]
  leviers: LeviersJumeau
}): EtatJumeau {
  const { profil, ecarts, historique, leviers } = params
  const { critiques: nbCritiques } = compterEcartsOuverts(ecarts)

  const bonus = calculerBonus(leviers, nbCritiques)
  const criteres = {
    c1: clamp(leviers.c1 + bonus.c1),
    c2: clamp(leviers.c2 + bonus.c2),
    c3: clamp(leviers.c3 + bonus.c3),
    c4: clamp(leviers.c4 + bonus.c4),
    c5: clamp(leviers.c5 + bonus.c5),
  }

  const scoreJumeau = calculateGlobalScore(criteres)
  const scorePhysique = profil.score_global

  const serie = construireSerieHistorique(historique, scoreJumeau)
  const scenarios: ScenarioProjete[] = generateAllScenarios(serie, leviers.aggravators, leviers.blackSwan).map(s => ({
    nom: s.nom,
    probabilite: s.probabilite,
    scoreProjecte: s.scoreProjecte,
    intervalleConfiance: s.intervalleConfiance,
    actionsRecommandees: s.actionsRecommandees,
  }))

  return {
    criteres, bonus,
    scoreJumeau, scorePhysique,
    delta: scoreJumeau - scorePhysique,
    niveauPhysique: getRiskLevel(scorePhysique),
    niveauJumeau: getRiskLevel(scoreJumeau),
    maturiteC1Physique: getSgsMaturiteLabel(profil.c1),
    maturiteC1Jumeau: getSgsMaturiteLabel(criteres.c1),
    ecartsCritiquesOuverts: leviers.fermerEcartsCritiques ? 0 : nbCritiques,
    ecartsTotalOuverts: ecarts.filter(e => e.statut === 'ouvert').length,
    scenarios,
  }
}

/** Construit la série de projection pour le tracé : historique + aujourd'hui + horizon. */
export function construireProjection(params: {
  historique: ScoreHistoryPoint[]
  etat: EtatJumeau
  horizon: number
}): PointProjection[] {
  const { historique, etat, horizon } = params
  const points: PointProjection[] = []

  historique.slice(-8).forEach(h => {
    points.push({
      label: new Date(h.date).toLocaleDateString('fr-FR', { month: 'short' }),
      historique: h.score, jumeau: null,
      optimiste: null, realiste: null, pessimiste: null, catastrophe: null,
    })
  })

  points.push({
    label: 'Aujourd\'hui', historique: etat.scoreJumeau, jumeau: etat.scoreJumeau,
    optimiste: etat.scoreJumeau, realiste: etat.scoreJumeau, pessimiste: etat.scoreJumeau, catastrophe: etat.scoreJumeau,
  })

  const byNom = (n: string) => etat.scenarios.find(s => s.nom === n)
  points.push({
    label: `${horizon}m`, historique: null, jumeau: null,
    optimiste: byNom('optimiste')?.scoreProjecte ?? null,
    realiste: byNom('realiste')?.scoreProjecte ?? null,
    pessimiste: byNom('pessimiste')?.scoreProjecte ?? null,
    catastrophe: byNom('catastrophe')?.scoreProjecte ?? null,
  })

  return points
}