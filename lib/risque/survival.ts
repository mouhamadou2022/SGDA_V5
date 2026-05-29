// lib/risque/survival.ts
// Survival Analysis — Kaplan-Meier + Cox Proportional Hazards
// Prédit QUAND un événement arrivera, pas juste la probabilité
// 0 dépendance externe

export interface SurvivalEvent {
  time: number       // jours depuis le début d'observation
  event: boolean     // true = incident survenu, false = censuré (fin observation sans incident)
  score?: number     // score C5 au moment de l'événement
  covariates?: number[]  // variables explicatives (nb écarts, score, etc.)
}

export interface SurvivalPrediction {
  medianSurvivalDays: number     // 50% de chance d'incident d'ici X jours
  hazard90days: number           // probabilité d'incident dans 90 jours
  hazard180days: number          // probabilité d'incident dans 180 jours
  hazard365days: number          // probabilité d'incident dans 365 jours
  survivalCurve: { time: number; survival: number }[]  // courbe complète
  coxCoefficients: number[]      // coefficients de régression de Cox
  baselineHazard: number         // λ₀(t)
}

/**
 * Estimateur de Kaplan-Meier
 * S(t) = ∏ (1 - d_i/n_i) pour tous les t_i ≤ t
 */
export function kaplanMeier(
  events: SurvivalEvent[],
  maxTime: number = 365
): { time: number; survival: number; ci_lower: number; ci_upper: number }[] {
  if (events.length === 0) return [{ time: 0, survival: 1, ci_lower: 1, ci_upper: 1 }]

  const sorted = [...events].sort((a, b) => a.time - b.time)
  const uniqueTimes = [...new Set(sorted.filter(e => e.event).map(e => e.time))].sort((a, b) => a - b)
  if (uniqueTimes.length === 0) return [{ time: maxTime, survival: 1, ci_lower: 1, ci_upper: 1 }]

  const n = sorted.length
  let survival = 1
  let cumulativeSE = 0
  const curve: { time: number; survival: number; ci_lower: number; ci_upper: number }[] = []
  let ni = n

  for (const t of uniqueTimes) {
    const di = sorted.filter(e => e.time === t && e.event).length
    const ci = sorted.filter(e => e.time < t || (e.time === t && !e.event)).length
    ni = n - ci
    if (ni <= 0) break
    const hazard = di / ni
    survival *= (1 - hazard)
    cumulativeSE += hazard / (ni * (1 - hazard))
    const se = survival * Math.sqrt(cumulativeSE)
    curve.push({
      time: t,
      survival: Math.max(0, Math.min(1, survival)),
      ci_lower: Math.max(0, survival - 1.96 * se),
      ci_upper: Math.min(1, survival + 1.96 * se),
    })
  }

  if (curve.length === 0 || curve[curve.length - 1].time < maxTime) {
    const lastS = curve.length > 0 ? curve[curve.length - 1].survival : 1
    curve.push({ time: maxTime, survival: lastS, ci_lower: lastS * 0.8, ci_upper: Math.min(1, lastS * 1.2) })
  }

  return curve
}

/**
 * Modèle de Cox (proportional hazards)
 * h(t|X) = h₀(t) × exp(β₁X₁ + β₂X₂ + ...)
 * Estimation simplifiée par régression logistique partielle
 */
export function coxRegression(
  events: SurvivalEvent[],
  maxIterations: number = 50
): { coefficients: number[]; baselineHazard: number; logLikelihood: number } {
  if (events.length < 3) return { coefficients: [], baselineHazard: 0.01, logLikelihood: 0 }

  const nCovariates = events[0].covariates?.length || 0
  if (nCovariates === 0) {
    const totalEvents = events.filter(e => e.event).length
    const totalTime = events.reduce((s, e) => s + e.time, 0)
    return { coefficients: [], baselineHazard: totalEvents / Math.max(totalTime, 1), logLikelihood: -totalEvents * Math.log(Math.max(totalTime, 1)) }
  }

  const betas = new Array(nCovariates).fill(0)
  const learningRate = 0.01

  for (let iter = 0; iter < maxIterations; iter++) {
    const gradients = new Array(nCovariates).fill(0)

    for (let i = 0; i < events.length; i++) {
      if (!events[i].event) continue
      const xi = events[i].covariates || []
      let riskSum = 0, weightedRiskSum = new Array(nCovariates).fill(0)

      for (let j = 0; j < events.length; j++) {
        if (events[j].time >= events[i].time) {
          const xj = events[j].covariates || []
          let eta = 0
          for (let k = 0; k < nCovariates; k++) eta += betas[k] * (xj[k] || 0)
          const risk = Math.exp(eta)
          riskSum += risk
          for (let k = 0; k < nCovariates; k++) weightedRiskSum[k] += risk * (xj[k] || 0)
        }
      }

      for (let k = 0; k < nCovariates; k++) {
        gradients[k] += (xi[k] || 0) - weightedRiskSum[k] / Math.max(riskSum, 1e-8)
      }
    }

    for (let k = 0; k < nCovariates; k++) betas[k] += learningRate * gradients[k] / events.length
  }

  const totalEvents = events.filter(e => e.event).length
  const totalTime = events.reduce((s, e) => s + e.time, 0)
  const baselineHazard = totalEvents / Math.max(totalTime, 1)
  const logLikelihood = -totalEvents * Math.log(Math.max(totalTime, 1))

  return { coefficients: betas, baselineHazard, logLikelihood }
}

/**
 * Prédiction de survie complète
 */
export function predictSurvival(
  events: SurvivalEvent[],
  covariates?: number[]
): SurvivalPrediction {
  const km = kaplanMeier(events)
  const cox = coxRegression(events)

  // Ajuster le hazard baseline avec les covariables de Cox
  let hazardMultiplier = 1
  if (covariates && cox.coefficients.length > 0) {
    let eta = 0
    for (let k = 0; k < cox.coefficients.length; k++) eta += cox.coefficients[k] * (covariates[k] || 0)
    hazardMultiplier = Math.exp(eta)
  }

  const baselineHazard = cox.baselineHazard * hazardMultiplier

  // Survival function: S(t) = exp(-H(t))
  const surv365 = Math.exp(-baselineHazard * 365)
  const surv180 = Math.exp(-baselineHazard * 180)
  const surv90 = Math.exp(-baselineHazard * 90)

  // Median survival: S(t) = 0.5 → t = ln(2)/λ
  const medianSurvival = baselineHazard > 0 ? Math.log(2) / baselineHazard : 365

  return {
    medianSurvivalDays: Math.round(medianSurvival),
    hazard90days: Math.round((1 - surv90) * 100),
    hazard180days: Math.round((1 - surv180) * 100),
    hazard365days: Math.round((1 - surv365) * 100),
    survivalCurve: km.map(p => ({ time: p.time, survival: p.survival })),
    coxCoefficients: cox.coefficients,
    baselineHazard,
  }
}
