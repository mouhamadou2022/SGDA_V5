// lib/risque/profilScoreEngine.ts
// Moteur unique de calcul des dimensions C1-C5 et du score global.
// Utilisé par le store (client) ET le cron de recalcul (serveur) pour
// garantir la convergence des scores (fini l'oscillation store/cron).

import {
  calculateC1,
  calculateC2FromEcarts,
  calculateC3,
  calculateC3WithExemptions,
  calculateC4FromEcarts,
  calculateC5,
  calculateGlobalScore,
} from '../risque'
import { calculeMalusC3, type AmdecAnalyse } from './amdecEngine'
import { normaliserScoreSgs } from '@/lib/utils'
import { getNiveauFromScore } from '@/lib/config'
// Type canonique unique (lib/risque/types.ts). Le niveau d'un profil utilise
// le sous-ensemble 4 niveaux ; 'tres_faible' est réservé aux cellules de la
// matrice 5×5 et à la fréquence de base.
import type { NiveauRisque } from './types'
export type { NiveauRisque }

export type StatutSgs = 'complet' | 'simplifie' | 'non_applicable'

/** Entrée minimale pour l'ajustement C3 (même forme que calculateC3WithExemptions). */
export interface ExemptionC3Entree {
  id: string
  domaines_concerne: string[]
  mesures: Array<{ statut: string; efficacite_validee?: number }>
}

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
  /** Exemptions actives (déposées par l'appelant qui les détient). */
  exemptionsActives?: ExemptionC3Entree[]
  /** Analyses AMDEC pour le malus C3. */
  analysesAmdec?: AmdecAnalyse[]
  weights?: Record<string, number>
  now?: number
}

export interface ComputeProfilScoreOutput {
  c1: number
  c2: number
  /** C3 brut (avant ajustements exemptions/AMDEC). */
  c3Base: number
  /** C3 final (après ajustements). */
  c3: number
  c4: number
  c5: number
  scoreGlobal: number
  sgsNonApplicable: boolean
  niveau: NiveauRisque
  /** Vrai si au moins un ajustement C3 a été appliqué. */
  c3Ajuste: boolean
}

const saniC = (v: number, fb: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fb)

export function computeProfilScore(input: ComputeProfilScoreInput): ComputeProfilScoreOutput {
  const { aerodrome, ecarts, surveillances, evenements, scoreC1Enquetes, exemptionsActives, analysesAmdec, weights, now } = input

  // C1 : SGS non applicable → pas de donnée (0), exclu du score global.
  // Échelle canonique 0-100 : normalise le legacy 1-5 éventuel.
  const sgsNonApplicable = aerodrome?.statut_sgs === 'non_applicable'
  const maturiteSGS = sgsNonApplicable ? 0 : normaliserScoreSgs(aerodrome?.maturite_sgs, 50)
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
            (normaliserScoreSgs(aerodrome.maturite_sgs, 50) * 0.25) +
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

  // Ajustements C3 centralisés (convergence store/cron) : l'appelant fournit
  // les exemptions qu'il détient — le cron n'a pas de table serveur pour
  // elles et passe un tableau vide (documenté à l'appel).
  const c3Base = c3
  let c3Final = c3
  let c3Ajuste = false
  if (exemptionsActives && exemptionsActives.length > 0) {
    c3Final = saniC(calculateC3WithExemptions(c3Base, exemptionsActives).c3_ajuste, c3Final)
    c3Ajuste = c3Ajuste || c3Final !== c3Base
  }
  const malusAmdec = appliqueMalusAmdec(c3Final, analysesAmdec || [])
  if (malusAmdec !== c3Final) {
    c3Final = malusAmdec
    c3Ajuste = true
  }

  const scoreGlobal = saniC(
    calculateGlobalScore({ c1, c2, c3: c3Final, c4, c5 }, weights, sgsNonApplicable),
    50
  )

  // Seuils uniques (lib/config.ts) — ne pas recopier ici.
  const niveau = getNiveauFromScore(scoreGlobal)

  return { c1, c2, c3Base, c3: c3Final, c4, c5, scoreGlobal, sgsNonApplicable, niveau, c3Ajuste }
}

// Malus AMDEC : modes de défaillance à criticité élevée non corrigés → dégrade C3.
// Partagé store/cron pour que le score converge.
export function appliqueMalusAmdec(c3: number, analysesAmdec: AmdecAnalyse[]): number {
  if (!analysesAmdec || analysesAmdec.length === 0) return c3
  const malus = calculeMalusC3(analysesAmdec)
  return malus > 0 ? Math.min(100, Math.max(0, c3 - malus)) : c3
}