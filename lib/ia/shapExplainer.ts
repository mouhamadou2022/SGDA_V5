// lib/ia/shapExplainer.ts
// Explicabilité « SHAP-like » du score global AERORISQ.
// Le score est une somme pondérée linéaire des critères C1-C5 :
//   score = Σ (W_i · x_i) / 100
// Pour ce modèle, l'attribution additive est EXACTE : chaque critère reçoit
//   φ_i = W_i · (x_i − μ_i) / 100
// où μ_i est la valeur de référence (baseline), et l'on vérifie que
//   baseline + Σ φ_i = score
// C'est l'analogue exact d'une valeur de Shapley pour un modèle linéaire :
// les contributions se somment exactement à la prédiction, sans approximation.
// Purement déterministe et testable — aucune dépendance UI.

import type { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'
import { calculateGlobalScore } from '@/lib/risque'
import { DEFAULT_WEIGHTS } from './weightController'

export type ModeBaselineShap = 'neutre' | 'moyenne' | 'precedent'

export type CleCritere = 'c1' | 'c2' | 'c3' | 'c4' | 'c5'

export interface ContributionShap {
  key: CleCritere
  nom: string
  poids: number
  valeurCourante: number
  valeurReference: number
  phi: number
  direction: 'hausse' | 'baisse' | 'stable'
  part: number
}

export interface ExplicationShap {
  baseline: { mode: ModeBaselineShap; valeur: number; libelle: string }
  score: number
  scoreStocke: number
  somme: number
  ecart: number
  variation: number
  totalHausse: number
  totalBaisse: number
  contributions: ContributionShap[]
}

const CRITERES: CleCritere[] = ['c1', 'c2', 'c3', 'c4', 'c5']
const NOMS: Record<CleCritere, string> = {
  c1: 'Maturité SGS', c2: 'Efficacité PAC', c3: 'Conformité technique',
  c4: 'Charge critique', c5: 'Résilience',
}

/** Critères réellement pris en compte dans le score (C1 exclu si SGS non applicable). */
function criteresEffectifs(statutSgs?: string): CleCritere[] {
  return statutSgs === 'non_applicable' ? (['c2', 'c3', 'c4', 'c5'] as CleCritere[]) : CRITERES
}

/**
 * Poids efficaces normalisés sur 100 pour le sous-ensemble de critères retenu :
 * garantit que base + Σφ ≡ score, même quand C1 est exclu.
 */
function poidsEffectifs(criteres: CleCritere[], w: Record<CleCritere, number>): Record<CleCritere, number> {
  const total = criteres.reduce((s, k) => s + w[k], 0) || 1
  const eff = {} as Record<CleCritere, number>
  for (const k of criteres) eff[k] = (100 * w[k]) / total
  return eff
}

/** Référence de chaque critère selon le mode de baseline choisi. */
function referencesParMode(
  mode: ModeBaselineShap,
  profil: ProfilRisque,
  historique: ScoreHistoryPoint[],
  criteres: CleCritere[],
  wEff: Record<CleCritere, number>,
): { base: number; refs: Record<CleCritere, number>; libelle: string } {
  const defauts = (v: number) => { const o = {} as Record<CleCritere, number>; for (const k of criteres) o[k] = v; return o }
  if (mode === 'neutre') {
    return {
      base: 50,
      refs: defauts(50),
      libelle: 'Référence neutre (50/100)',
    }
  }

  if (mode === 'precedent') {
    const last = historique[historique.length - 1]
    if (!last) {
      return {
        base: 50,
        refs: defauts(50),
        libelle: 'Référence neutre (50/100) — aucun historique',
      }
    }
    const refs = defauts(50)
    for (const k of criteres) refs[k] = (last[k as unknown as keyof ScoreHistoryPoint] as number | undefined) ?? 50
    // La référence est la prédiction attendue du modèle au point précédent
    // (Σ W_i·refs_i / 100), ce qui garantit l'exactitude additive : somme ≡ score.
    const base = criteres.reduce((s, k) => s + (refs[k] * wEff[k]) / 100, 0)
    return {
      base: Math.round(base),
      refs,
      libelle: `Mois précédent (${new Date(last.date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })})`,
    }
  }

  // mode === 'moyenne' : moyenne historique, critère par critère
  const refs = defauts(50)
  for (const k of criteres) {
    const values = historique
      .filter(p => p[k as unknown as keyof ScoreHistoryPoint] != null)
      .map(p => p[k as unknown as keyof ScoreHistoryPoint] as unknown as number)
    refs[k] = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 50
  }
  const base = criteres.reduce((s, k) => s + (refs[k] * wEff[k]) / 100, 0)
  return {
    base: Math.round(base),
    refs,
    libelle: historique.length > 0 ? `Moyenne historique (${historique.length} points)` : 'Référence neutre (50/100) — aucun historique',
  }
}

/**
 * Calcule l'attribution additive SHAP-like du score pour un profil.
 * @param profil  profil courant
 * @param historique  points d'historique (pour les modes moyenne / précédent)
 * @param mode  baseline : neutre (50), moyenne historique ou mois précédent
 * @param statutSgs  statut SGS de l'aérodrome — C1 exclu de la décomposition si « non_applicable »
 */
export function calculerExplicationShap(
  profil: ProfilRisque,
  historique: ScoreHistoryPoint[] = [],
  mode: ModeBaselineShap = 'moyenne',
  statutSgs?: string,
): ExplicationShap {
  const w = DEFAULT_WEIGHTS
  const criteres = criteresEffectifs(statutSgs)
  const wEff = poidsEffectifs(criteres, w)
  const { base, refs, libelle } = referencesParMode(mode, profil, historique, criteres, wEff)

  const phiRaw: Record<CleCritere, number> = {} as Record<CleCritere, number>
  let somme = base
  for (const k of criteres) {
    const phi = (wEff[k] / 100) * ((profil[k] as number) - refs[k])
    phiRaw[k] = phi
    somme += phi
  }

  const score = calculateGlobalScore({ c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5 }, undefined, statutSgs === 'non_applicable')
  const ecart = score - somme

  const sommeAbs = criteres.reduce((s, k) => s + Math.abs(phiRaw[k]), 0) || 1
  const contributions: ContributionShap[] = criteres.map(k => {
    const phi = Math.round(phiRaw[k] * 100) / 100
    const direction: ContributionShap['direction'] = phi > 0.5 ? 'hausse' : phi < -0.5 ? 'baisse' : 'stable'
    return {
      key: k,
      nom: NOMS[k],
      poids: Math.round(wEff[k] * 10) / 10,
      valeurCourante: profil[k] as number,
      valeurReference: Math.round(refs[k] * 10) / 10,
      phi,
      direction,
      part: Math.abs(phi) / sommeAbs,
    }
  })

  const totalHausse = Math.round(contributions.filter(c => c.phi > 0).reduce((s, c) => s + c.phi, 0) * 100) / 100
  const totalBaisse = Math.round(contributions.filter(c => c.phi < 0).reduce((s, c) => s + c.phi, 0) * 100) / 100

  return {
    baseline: { mode, valeur: base, libelle },
    score,
    scoreStocke: profil.score_global,
    somme: Math.round(somme * 100) / 100,
    ecart: Math.round(ecart * 100) / 100,
    variation: score - base,
    totalHausse,
    totalBaisse,
    contributions,
  }
}

/** Narration en langage clair de la décomposition SHAP-like. */
export function construireNarrationShap(explication: ExplicationShap): string {
  const tri = [...explication.contributions].sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi))
  const dominant = tri[0]
  if (!dominant || dominant.phi === 0) {
    return `Le score ${explication.score}/100 est exactement aligné sur la référence ${explication.baseline.libelle.toLowerCase()} (${explication.baseline.valeur}/100) : aucun critère ne tire le profil dans un sens ou l'autre.`
  }

  const partieDominante = dominant.phi > 0
    ? `Le critère le plus influent est ${dominant.nom} (+${dominant.phi.toFixed(1)} pts) : son niveau (${dominant.valeurCourante}/100 contre ${dominant.valeurReference}/100 en référence) soutient le score.`
    : `Le critère le plus influent est ${dominant.nom} (${dominant.phi.toFixed(1)} pts) : son niveau (${dominant.valeurCourante}/100 contre ${dominant.valeurReference}/100 en référence) pèse sur le score.`

  let bilan = ''
  const balance = explication.totalHausse + explication.totalBaisse
  if (balance > 1) {
    bilan = ` Au total, les critères ajoutent ${explication.totalHausse.toFixed(1)} pts et retirent ${Math.abs(explication.totalBaisse).toFixed(1)} pts, pour un écart net de ${explication.variation > 0 ? '+' : ''}${explication.variation} pts par rapport à la référence ${explication.baseline.valeur}/100.`
  }

  return `Le score ${explication.score}/100 s\'explique à partir de la ${explication.baseline.libelle.toLowerCase()} (${explication.baseline.valeur}/100). ${partieDominante}${bilan}`
}