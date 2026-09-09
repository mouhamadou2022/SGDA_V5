// lib/risque/profilScoreEngine.ts
// Moteur unique de calcul des dimensions C1-C5 et du score global.
// Utilisé par le store (client) ET le cron de recalcul (serveur) pour
// garantir la convergence des scores (fini l'oscillation store/cron).

import {
  calculateC1,
  calculateC2FromEcarts,
  calculateC3,
  calculateC4FromEcarts,
  calculateC5,
  calculateGlobalScore,
} from '../risque'
import { calculeMalusC3 } from './amdecEngine'

export type NiveauRisque = 'faible' | 'moyen' | 'eleve' | 'critique'

export type StatutSgs = 'complet' | 'simplifie' | 'non_applicable'

export interface AerodromeDim {
  statut_sgs?: StatutSgs | null
  maturite_sgs?: number | null
  created_at?: string | null
  type?: string | null
  type_entite?: string | null
  categorie_sslia?: string | null
  region?: string | null
}

export interface ComputeProfilScoreInput {
  aerodrome?: AerodromeDim | null
  ecarts: any[]
  surveillances: any[]
  evenements: any[]
  scoreC1Enquetes?: number
  weights?: Record<string, number>
  now?: number
}

export interface ComputeProfilScoreOutput {
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  scoreGlobal: number
  sgsNonApplicable: boolean
  niveau: NiveauRisque
}

const saniC = (v: number, fb: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fb)

export function computeProfilScore(input: ComputeProfilScoreInput): ComputeProfilScoreOutput {
  const { aerodrome, ecarts, surveillances, evenements, scoreC1Enquetes, weights, now } = input

  // C1 : SGS non applicable → pas de donnée (0), exclu du score global
  const sgsNonApplicable = aerodrome?.statut_sgs === 'non_applicable'
  const maturiteSGS = sgsNonApplicable ? 0 : (aerodrome?.maturite_sgs ?? 50)
  const c1 = saniC(calculateC1(maturiteSGS, scoreC1Enquetes, aerodrome?.statut_sgs || undefined), 50)

  // C2 : dégradée par l'âge de l'aérodrome si pas d'écarts actifs
  let c2 = saniC(calculateC2FromEcarts(ecarts), 50)
  const ecartsActifs = ecarts.filter((e: any) => e.statut !== 'cloture')
  if (ecartsActifs.length === 0 && aerodrome?.created_at) {
    const ageJours = ((now ?? Date.now()) - new Date(aerodrome.created_at).getTime()) / 86400000
    if (ageJours > 365) c2 = Math.min(c2, 70)
    if (ageJours > 730) c2 = Math.min(c2, 55)
  }

  // C3 : toutes les surveillances terminées (checklist_signee, transmise, archivee)
  const surveillancesAvecScore = surveillances.filter(
    (s: any) =>
      s.score_global !== undefined && s.score_global !== null &&
      ['checklist_signee', 'transmise', 'archivee'].includes(s.statut)
  )
  const c3 = saniC(
    surveillancesAvecScore.length > 0
      ? calculateC3(surveillancesAvecScore.map((s: any) => ({
          score: s.score_global as number,
          date: s.date_debut as string,
        })))
      : aerodrome
        ? Math.round(
            (aerodrome.type === 'international' ? 55 : aerodrome.type === 'national' ? 70 : 80) * 0.25 +
            ((aerodrome.maturite_sgs ?? 50) * 0.25) +
            ((aerodrome.type_entite === 'helistation' || aerodrome.type_entite === 'mixte' ? 55 : 70) * 0.15) +
            (80 - Math.max(0, (parseInt(aerodrome.categorie_sslia ?? '', 10) || 1) - 3) * 2) * 0.15 +
            ((aerodrome.region === 'Ziguinchor' || aerodrome.region === 'Kolda' || aerodrome.region === 'Tambacounda') ? 50 : 75) * 0.10
          )
        : 30,
    30
  )

  const c4 = saniC(calculateC4FromEcarts(ecarts), 50)
  const c5 = saniC(
    calculateC5(evenements.map((e: any) => ({
      gravite: (e.gravite ?? 'moyen') as string,
      date: e.date || e.created_at,
    }))),
    50
  )

  const scoreGlobal = saniC(
    calculateGlobalScore({ c1, c2, c3, c4, c5 }, weights, sgsNonApplicable),
    50
  )

  let niveau: NiveauRisque = 'faible'
  if (scoreGlobal >= 80) niveau = 'faible'
  else if (scoreGlobal >= 60) niveau = 'moyen'
  else if (scoreGlobal >= 30) niveau = 'eleve'
  else niveau = 'critique'

  return { c1, c2, c3, c4, c5, scoreGlobal, sgsNonApplicable, niveau }
}

// Malus AMDEC : modes de défaillance à criticité élevée non corrigés → dégrade C3.
// Partagé store/cron pour que le score converge.
export function appliqueMalusAmdec(c3: number, analysesAmdec: any[]): number {
  if (!analysesAmdec || analysesAmdec.length === 0) return c3
  const malus = calculeMalusC3(analysesAmdec)
  return malus > 0 ? Math.min(100, Math.max(0, c3 - malus)) : c3
}