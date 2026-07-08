// lib/risque/naiveBayesC5.ts
// Réseau bayésien Naive Bayes pour l'explicabilité causale du score C5.
// Structure : C5 (classe) → C1, C2, C3, C4 (features conditionnellement indépendants)
//
// Utilité :
//   - Propager l'observation de C1-C4 vers une inférence causale sur C5
//   - Identifier quel critère contribue le plus à la résilience estimée
//   - Détecter les configurations anormales (C1-C4 observés improbables ensemble)
//   - Fournir une explication "bayésienne" utilisable dans les rapports OACI

import type { ProfilRisque } from '@/lib/store'
import type { ScoreHistoryPoint } from '@/lib/store'

// ────────────────────────────────────────────
// DISCRÉTISATION
// 3 états (bas/moyen/eleve) seuils 40/70 pour l'inférence bayésienne Naive Bayes.
// Choix différent de scoreToLabel (randomForest.ts) qui utilise 4 états (critique/
// eleve/moyen/faible) seuils 30/60/80. Les deux coexistent car leurs rôles sont
// distincts : discretisation pour l'inférence CPT (NB) vs classification de niveau
// de risque (RF). Ne PAS aligner.
// ────────────────────────────────────────────

export type NiveauC5 = 'bas' | 'moyen' | 'eleve'
export type NiveauCritere = 'bas' | 'moyen' | 'eleve'

const SEUILS_BAS = 40
const SEUILS_MOYEN = 70

export function discretizeC5(score: number): NiveauC5 {
  if (score < SEUILS_BAS) return 'bas'
  if (score < SEUILS_MOYEN) return 'moyen'
  return 'eleve'
}

export function discretizeCritere(score: number): NiveauCritere {
  if (score < SEUILS_BAS) return 'bas'
  if (score < SEUILS_MOYEN) return 'moyen'
  return 'eleve'
}

// ────────────────────────────────────────────
// TYPE DU MODÈLE APPRIS
// ────────────────────────────────────────────

export interface NaiveBayesC5Model {
  /** P(C5 = niveau) — distribution a priori */
  prior: Record<NiveauC5, number>
  /** P(C_i = niveau | C5 = etat) — vraisemblances */
  likelihoods: Record<'c1' | 'c2' | 'c3' | 'c4', Record<NiveauC5, Record<NiveauCritere, number>>>
  /** Nombre d'échantillons utilisés pour l'apprentissage */
  sampleSize: number
}

// ────────────────────────────────────────────
// APPRENTISSAGE DES PARAMÈTRES (CPT)
// ────────────────────────────────────────────

function countNiveaux(history: ScoreHistoryPoint[]): {
  c5Counts: Record<NiveauC5, number>
  c5GivenCritere: Record<'c1' | 'c2' | 'c3' | 'c4', Record<NiveauC5, Record<NiveauCritere, number>>>
  total: number
} {
  const c5Counts: Record<NiveauC5, number> = { bas: 0, moyen: 0, eleve: 0 }
  const c5GivenCritere: Record<'c1' | 'c2' | 'c3' | 'c4', Record<NiveauC5, Record<NiveauCritere, number>>> = {
    c1: { bas: { bas: 0, moyen: 0, eleve: 0 }, moyen: { bas: 0, moyen: 0, eleve: 0 }, eleve: { bas: 0, moyen: 0, eleve: 0 } },
    c2: { bas: { bas: 0, moyen: 0, eleve: 0 }, moyen: { bas: 0, moyen: 0, eleve: 0 }, eleve: { bas: 0, moyen: 0, eleve: 0 } },
    c3: { bas: { bas: 0, moyen: 0, eleve: 0 }, moyen: { bas: 0, moyen: 0, eleve: 0 }, eleve: { bas: 0, moyen: 0, eleve: 0 } },
    c4: { bas: { bas: 0, moyen: 0, eleve: 0 }, moyen: { bas: 0, moyen: 0, eleve: 0 }, eleve: { bas: 0, moyen: 0, eleve: 0 } },
  }
  let total = 0

  for (const pt of history) {
    if (pt.c5 === undefined) continue
    const c5n = discretizeC5(pt.c5)
    c5Counts[c5n]++
    total++

    for (const key of ['c1', 'c2', 'c3', 'c4'] as const) {
      const val = pt[key]
      if (val === undefined) continue
      const cn = discretizeCritere(val)
      c5GivenCritere[key][c5n][cn]++
    }
  }

  return { c5Counts, c5GivenCritere, total }
}

const ALPHA = 1 // Dirichlet prior (lissage additif)

/**
 * Apprend le modèle Naive Bayes C5 à partir des données historiques.
 * Calcule P(C5) et P(C_i | C5) avec lissage Dirichlet (α=1).
 */
export function learnNaiveBayesC5(history: ScoreHistoryPoint[]): NaiveBayesC5Model {
  const { c5Counts, c5GivenCritere, total } = countNiveaux(history)

  // Prior P(C5) avec lissage
  const prior: Record<NiveauC5, number> = { bas: 0, moyen: 0, eleve: 0 }
  for (const n of ['bas', 'moyen', 'eleve'] as NiveauC5[]) {
    prior[n] = (c5Counts[n] + ALPHA) / (total + 3 * ALPHA)
  }

  // Likelihood P(C_i | C5) avec lissage
  const c5States: NiveauC5[] = ['bas', 'moyen', 'eleve']
  const criteStates: NiveauCritere[] = ['bas', 'moyen', 'eleve']
  const likelihoods: NaiveBayesC5Model['likelihoods'] = {
    c1: {} as any, c2: {} as any, c3: {} as any, c4: {} as any,
  }

  for (const key of ['c1', 'c2', 'c3', 'c4'] as const) {
    for (const c5n of c5States) {
      const denom = c5Counts[c5n] + 3 * ALPHA
      likelihoods[key][c5n] = { bas: 0, moyen: 0, eleve: 0 }
      for (const cn of criteStates) {
        likelihoods[key][c5n][cn] = (c5GivenCritere[key][c5n][cn] + ALPHA) / denom
      }
    }
  }

  return { prior, likelihoods, sampleSize: total }
}

// ────────────────────────────────────────────
// INFÉRENCE
// ────────────────────────────────────────────

export interface BayesExplainResult {
  /** Distribution a priori P(C5) */
  prior: Record<NiveauC5, number>
  /** Distribution a posteriori P(C5 | C1, C2, C3, C4) */
  posterior: Record<NiveauC5, number>
  /** État C5 le plus probable a posteriori */
  predictedC5: NiveauC5
  /** Confiance dans la prédiction (probabilité postérieure max) */
  confidence: number
  /** Facteurs de Bayes par critère : contribution individuelle à la divergence
   *  entre prior et posterior. > 1 signifie que ce critère soutient C5_pred
   *  plus que la moyenne des autres états. */
  bayesFactors: Record<'c1' | 'c2' | 'c3' | 'c4', number>
  /** Critères classés par contribution décroissante */
  topDrivers: Array<{ key: string; name: string; factor: number }>
  /** La probabilité conjointe observée est-elle inhabituellement basse ?
   *  (anomalie : configuration C1-C4 rare sous le modèle) */
  isAnomalous: boolean
  /** Score d'anomalie : -log(P(C1..C4 | modèle)) normalisé */
  anomalyScore: number
}

const CRITERE_NAMES: Record<string, string> = {
  c1: 'Maturité SGS', c2: 'Efficacité PAC', c3: 'Conformité technique', c4: 'Charge critique',
}

/**
 * Infère P(C5 | C1, C2, C3, C4) par la règle de Bayes avec l'hypothèse
 * d'indépendance conditionnelle Naive Bayes.
 *
 * Calcule aussi les facteurs de Bayes par critère et un score d'anomalie
 * pour détecter les configurations improbables.
 */
export function inferNaiveBayesC5(
  profil: ProfilRisque,
  history: ScoreHistoryPoint[]
): BayesExplainResult | null {
  if (history.length < 2) return null

  const model = learnNaiveBayesC5(history)
  const c5States: NiveauC5[] = ['bas', 'moyen', 'eleve']

  // Discrétiser C1-C4 observés
  const evidence = ['c1', 'c2', 'c3', 'c4'] as const
  const observed: Record<'c1' | 'c2' | 'c3' | 'c4', NiveauCritere> = {} as any
  for (const key of evidence) {
    const val = (profil as any)[key]
    if (val === undefined || val === null) return null
    observed[key] = discretizeCritere(val)
  }

  // Inférence Naive Bayes : P(C5 | C1..C4) ∝ P(C5) × ∏ P(C_i | C5)
  const logPost: Record<NiveauC5, number> = { bas: 0, moyen: 0, eleve: 0 }
  let maxLog = -Infinity
  for (const c5n of c5States) {
    let lp = Math.log(model.prior[c5n])
    for (const key of evidence) {
      lp += Math.log(model.likelihoods[key][c5n][observed[key]])
    }
    logPost[c5n] = lp
    if (lp > maxLog) maxLog = lp
  }

  // Exponentier avec stabilité numérique (soustraire max)
  let sum = 0
  const posterior: Record<NiveauC5, number> = { bas: 0, moyen: 0, eleve: 0 }
  for (const c5n of c5States) {
    posterior[c5n] = Math.exp(logPost[c5n] - maxLog)
    sum += posterior[c5n]
  }
  for (const c5n of c5States) {
    posterior[c5n] /= sum
  }

  // Meilleur état
  let predictedC5: NiveauC5 = 'moyen'
  let maxP = 0
  for (const c5n of c5States) {
    if (posterior[c5n] > maxP) {
      maxP = posterior[c5n]
      predictedC5 = c5n
    }
  }

  // Facteur de Bayes par critère : pour chaque critère, combien P(C_i | C5_pred)
  // est plus grand que la moyenne pondérée P(C_i) = Σ P(C_i|C5_j) × P(C5_j)
  const bayesFactors: Record<'c1' | 'c2' | 'c3' | 'c4', number> = {} as any
  for (const key of evidence) {
    const likelihoodGivenPred = model.likelihoods[key][predictedC5][observed[key]]
    let marginalGivenObs = 0
    for (const c5n of c5States) {
      marginalGivenObs += model.likelihoods[key][c5n][observed[key]] * model.prior[c5n]
    }
    bayesFactors[key] = marginalGivenObs > 0 ? likelihoodGivenPred / marginalGivenObs : 1
  }

  // Top drivers classés par |log(factor)|
  const topDrivers = (['c1', 'c2', 'c3', 'c4'] as const)
    .map(key => ({
      key,
      name: CRITERE_NAMES[key],
      factor: bayesFactors[key],
    }))
    .sort((a, b) => Math.abs(Math.log(b.factor)) - Math.abs(Math.log(a.factor)))

  // Score d'anomalie : -log P(C1..C4 | modèle) = -[log Σ P(C1..C4|C5)P(C5)]
  // Plus le score est élevé, plus la configuration est improbable
  let logEvidence = -Infinity
  for (const c5n of c5States) {
    let lp = Math.log(model.prior[c5n])
    for (const key of evidence) {
      lp += Math.log(model.likelihoods[key][c5n][observed[key]])
    }
    logEvidence = logEvidence === -Infinity ? lp : logEvidence + Math.log(1 + Math.exp(lp - logEvidence))
  }
  const anomalyScore = -logEvidence
  // Seuil empirique : anomalyScore > 9 (≈ 3 écarts-types sous la distribution attendue)
  const isAnomalous = anomalyScore > 9

  return {
    prior: model.prior,
    posterior,
    predictedC5,
    confidence: maxP,
    bayesFactors,
    topDrivers,
    isAnomalous,
    anomalyScore,
  }
}

// ────────────────────────────────────────────
// HELPERS D'AFFICHAGE
// ────────────────────────────────────────────

const C5_LABELS: Record<NiveauC5, string> = {
  bas: 'Résilience faible',
  moyen: 'Résilience modérée',
  eleve: 'Résilience élevée',
}

const C5_COLORS: Record<NiveauC5, string> = {
  bas: 'var(--color-danger)',
  moyen: 'var(--color-warning)',
  eleve: 'var(--color-success)',
}

export function getC5Label(niveau: NiveauC5): string {
  return C5_LABELS[niveau]
}

export function getC5Color(niveau: NiveauC5): string {
  return C5_COLORS[niveau]
}
