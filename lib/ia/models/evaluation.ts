// lib/ia/models/evaluation.ts
// Métriques d'évaluation PROBABILISTE honnêtes (aucune approximation) :
//   · Brier score (binaire / multi-classe) ;
//   · log-loss (entropie croisée) ;
//   · courbe de fiabilité + Expected/Maximum Calibration Error (ECE/MCE) ;
//   · couverture empirique des intervalles de prédiction ;
//   · temperature scaling (calibration post-hoc réelle, minimise la NLL).
// 0 dépendance externe, 100% local et déterministe.

'use client'

// ============================================================
// PERTE PROBABILISTE
// ============================================================

/** Brier score multi-classe : moyenne de Σ_k (p_k − 1{y=k})². Plus bas = mieux. */
export function brierScoreMulticlass(probs: number[][], yTrue: number[], nClasses?: number): number {
  if (probs.length === 0) return 0
  const K = nClasses ?? probs[0].length
  let total = 0
  for (let i = 0; i < probs.length; i++) {
    for (let k = 0; k < K; k++) {
      const p = probs[i][k] ?? 0
      const y = yTrue[i] === k ? 1 : 0
      total += (p - y) * (p - y)
    }
  }
  return total / probs.length
}

/** Log-loss (entropie croisée) multi-classe. Plus bas = mieux. */
export function logLossMulticlass(probs: number[][], yTrue: number[]): number {
  if (probs.length === 0) return 0
  let total = 0
  for (let i = 0; i < probs.length; i++) {
    const p = Math.max(1e-12, probs[i][yTrue[i]] ?? 1e-12)
    total += -Math.log(p)
  }
  return total / probs.length
}

// ============================================================
// CALIBRATION
// ============================================================

export interface ReliabilityBin {
  binLower: number
  binUpper: number
  count: number
  /** Confiance moyenne prédite dans le bin. */
  avgConfidence: number
  /** Fréquence réelle observée dans le bin. */
  accuracy: number
}

/**
 * Transformer des probabilités multi-classe en (confiance de la classe prédite,
 * correction) — base de la courbe de fiabilité.
 */
export function topLabelConfidence(
  probs: number[][],
  yTrue: number[],
): { confidences: number[]; correct: number[]; predictions: number[] } {
  const confidences: number[] = []
  const correct: number[] = []
  const predictions: number[] = []
  for (let i = 0; i < probs.length; i++) {
    let best = 0
    const row = probs[i]
    for (let k = 1; k < row.length; k++) if (row[k] > row[best]) best = k
    predictions.push(best)
    confidences.push(row[best] ?? 0)
    correct.push(best === yTrue[i] ? 1 : 0)
  }
  return { confidences, correct, predictions }
}

/**
 * Courbe de fiabilité (reliability diagram) à `nBins` intervalles.
 * @param confidences confiance de la classe prédite ∈ [0,1]
 * @param correct 1 si la prédiction est correcte, 0 sinon
 */
export function reliabilityCurve(
  confidences: number[],
  correct: number[],
  nBins = 10,
): ReliabilityBin[] {
  const bins: ReliabilityBin[] = []
  for (let b = 0; b < nBins; b++) {
    bins.push({
      binLower: b / nBins,
      binUpper: (b + 1) / nBins,
      count: 0,
      avgConfidence: 0,
      accuracy: 0,
    })
  }
  for (let i = 0; i < confidences.length; i++) {
    const c = Math.min(1, Math.max(0, confidences[i]))
    const idx = Math.min(nBins - 1, Math.floor(c * nBins))
    const bin = bins[idx]
    bin.count++
    bin.avgConfidence += c
    bin.accuracy += correct[i]
  }
  for (const bin of bins) {
    if (bin.count > 0) {
      bin.avgConfidence /= bin.count
      bin.accuracy /= bin.count
    }
  }
  return bins
}

/** Expected Calibration Error : Σ (n_b/N)·|acc_b − conf_b|. */
export function expectedCalibrationError(
  confidences: number[],
  correct: number[],
  nBins = 10,
): { ece: number; mce: number; bins: ReliabilityBin[] } {
  const bins = reliabilityCurve(confidences, correct, nBins)
  const N = confidences.length || 1
  let ece = 0
  let mce = 0
  for (const bin of bins) {
    if (bin.count === 0) continue
    const gap = Math.abs(bin.accuracy - bin.avgConfidence)
    ece += (bin.count / N) * gap
    if (gap > mce) mce = gap
  }
  return { ece, mce, bins }
}

// ============================================================
// COUVERTURE DES INTERVALLES
// ============================================================

export interface IntervalPrediction {
  lower: number
  upper: number
  actual: number
}

export interface IntervalCoverage {
  /** % d'observations réellement couvertes par l'intervalle. */
  coverage: number
  /** Largeur moyenne des intervalles. */
  meanWidth: number
  /** Niveau nominal annoncé (ex. 0.9 pour un IC90). */
  nominal: number
  count: number
  /** Vrai si la couverture observée est proche du nominal (±5 pts). */
  wellCalibrated: boolean
}

export function intervalCoverage(
  predictions: IntervalPrediction[],
  nominal = 0.9,
): IntervalCoverage {
  if (predictions.length === 0) {
    return { coverage: 0, meanWidth: 0, nominal, count: 0, wellCalibrated: false }
  }
  let covered = 0
  let widthSum = 0
  for (const p of predictions) {
    if (p.actual >= p.lower && p.actual <= p.upper) covered++
    widthSum += Math.max(0, p.upper - p.lower)
  }
  const coverage = covered / predictions.length
  return {
    coverage,
    meanWidth: widthSum / predictions.length,
    nominal,
    count: predictions.length,
    wellCalibrated: Math.abs(coverage - nominal) <= 0.05,
  }
}

// ============================================================
// SYNTHÈSE : évaluation probabilitste d'une matrice de probabilités
// ============================================================

export interface ProbabilisticEvaluation {
  /** Brier score multi-classe (plus bas = mieux). */
  brierScore: number
  /** Entropie croisée (plus bas = mieux). */
  logLoss: number
  /** Expected Calibration Error (0 = parfaitement calibré). */
  ece: number
  /** Maximum Calibration Error. */
  mce: number
  accuracy: number
  sampleSize: number
}

/**
 * Évalue des probabilités prédites (matrice [échantillon][classe]).
 * Mesure la QUALITÉ des probabilités, pas seulement la classe gagnante.
 */
export function evaluateProbabilities(
  probs: number[][],
  yTrue: number[],
  nClasses?: number,
): ProbabilisticEvaluation {
  const { confidences, correct } = topLabelConfidence(probs, yTrue)
  const { ece, mce } = expectedCalibrationError(confidences, correct)
  const n = correct.length
  return {
    brierScore: brierScoreMulticlass(probs, yTrue, nClasses),
    logLoss: logLossMulticlass(probs, yTrue),
    ece,
    mce,
    accuracy: n > 0 ? correct.reduce((a, b) => a + b, 0) / n : 0,
    sampleSize: n,
  }
}

// ============================================================
// TEMPERATURE SCALING (calibration post-hoc)
// ============================================================

export function applyTemperature(logits: number[][], temperature: number): number[][] {
  const T = temperature > 1e-6 ? temperature : 1e-6
  return logits.map(row => softmax(row.map(v => v / T)))
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores)
  const exps = scores.map(s => Math.exp(s - max))
  const sum = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map(e => e / sum)
}

/**
 * Ajuste une température T qui minimise la NLL des logits fournis
 * (recherche par section dorée sur [0.05, 5]). Calibration post-hoc réelle.
 */
export function temperatureScaling(
  logits: number[][],
  yTrue: number[],
): { temperature: number; nllBefore: number; nllAfter: number } {
  const nllFor = (T: number) => logLossMulticlass(applyTemperature(logits, T), yTrue)
  const nllBefore = nllFor(1)

  let lo = 0.05
  let hi = 5
  const phi = (Math.sqrt(5) - 1) / 2
  for (let iter = 0; iter < 60; iter++) {
    const c = hi - phi * (hi - lo)
    const d = lo + phi * (hi - lo)
    if (nllFor(c) < nllFor(d)) hi = d
    else lo = c
  }
  const temperature = (lo + hi) / 2
  return { temperature, nllBefore, nllAfter: nllFor(temperature) }
}
