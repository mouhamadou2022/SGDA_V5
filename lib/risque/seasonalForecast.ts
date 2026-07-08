// lib/risque/seasonalForecast.ts
// Modèle de prévision saisonnière (Prophet-like) purement data-driven
// Décompose : tendance linéaire + facteurs saisonniers mensuels + résidus → IC

export interface ForecastPoint {
  mois: string
  moisIndex: number
  value: number
  lower80: number
  upper80: number
  lower95: number
  upper95: number
  confidence: number
}

export interface SeasonalModel {
  seasonalFactors: number[]
  trend: { slope: number; intercept: number }
  residuals: number[]
  sigma: number
  n: number
  lastMois: number  // mois (0-11) du dernier point d'entraînement, pour l'alignement des prévisions
  meanX: number     // moyenne des indices d'entraînement, pour SEM horizon-dépendant
  Sxx: number       // Σ(i - meanX)², pour SEM horizon-dépendant
}

const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

/**
 * Ajuste un modèle saisonnier à des données mensuelles.
 * Retourne facteurs saisonniers + tendance + résidus.
 */
export function fitSeasonalModel(data: { mois: number; value: number }[]): SeasonalModel {
  const n = data.length
  if (n < 6) {
    // Fallback : pas assez de données, modèle trivial
    return {
      seasonalFactors: Array(12).fill(1),
      trend: { slope: 0, intercept: data.reduce((s, d) => s + d.value, 0) / Math.max(1, n) },
      residuals: [],
      sigma: 5,
      n,
      lastMois: n > 0 ? data[n - 1].mois : 0,
      meanX: (n - 1) / 2,
      Sxx: n > 1 ? (n - 1) * n * (2 * n - 1) / 6 - ((n - 1) * n / 2) ** 2 / n : 1,
    }
  }

  // 1. Estimer la tendance linéaire sur les données brutes
  const sumX = data.reduce((s, d, i) => s + i, 0)
  const sumY = data.reduce((s, d) => s + d.value, 0)
  const sumXY = data.reduce((s, d, i) => s + i * d.value, 0)
  const sumX2 = data.reduce((s, _, i) => s + i * i, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1)
  const intercept = (sumY - slope * sumX) / n

  // 2. Dé-saisonnaliser : valeur observée - tendance → composante saisonnière par mois
  const detrended: { mois: number; residual: number }[] = data.map((d, i) => ({
    mois: d.mois,
    residual: d.value - (intercept + slope * i),
  }))

  // 3. Facteur saisonnier = moyenne des résidus par mois
  const seasonalRaw: number[] = Array(12).fill(0)
  const seasonalCount: number[] = Array(12).fill(0)
  detrended.forEach(d => {
    seasonalRaw[d.mois] += d.residual
    seasonalCount[d.mois]++
  })
  const seasonalFactors = seasonalRaw.map((sum, i) =>
    seasonalCount[i] > 0 ? sum / seasonalCount[i] : 0
  )

  // Normaliser les facteurs saisonniers pour que leur somme = 0
  const meanFactor = seasonalFactors.reduce((s, f) => s + f, 0) / 12
  const normalizedFactors = seasonalFactors.map(f => f - meanFactor)

  // 4. Résidus = valeur - tendance - facteur saisonnier
  const residuals: number[] = data.map((d, i) => {
    const trend = intercept + slope * i
    return d.value - trend - normalizedFactors[d.mois]
  })

  // 5. Écart-type des résidus
  const meanResidual = residuals.reduce((s, r) => s + r, 0) / Math.max(1, residuals.length)
  const sigma = Math.sqrt(
    residuals.reduce((s, r) => s + (r - meanResidual) ** 2, 0) / Math.max(1, residuals.length)
  ) || 5

  // Calculer meanX et Sxx pour l'erreur standard de prédiction horizon-dépendante
  const meanX = (n - 1) / 2
  const Sxx = sumX2 - sumX * sumX / n

  return { seasonalFactors: normalizedFactors, trend: { slope, intercept }, residuals, sigma, n, lastMois: data[n - 1].mois, meanX, Sxx }
}

/**
 * Prédit les `steps` prochains mois à partir du modèle.
 * Retourne valeur, IC 80% et IC 95%.
 */
export function predict(
  model: SeasonalModel,
  steps: number,
  startIndex?: number
): ForecastPoint[] {
  const { seasonalFactors, trend, sigma, lastMois, meanX, Sxx } = model
  const start = startIndex ?? model.n

  const result: ForecastPoint[] = []
  for (let i = 0; i < steps; i++) {
    const moisIndex = (lastMois + 1 + i) % 12
    const t = start + i
    const trendVal = trend.intercept + trend.slope * t
    const seasonalVal = seasonalFactors[moisIndex] || 0
    const forecast = trendVal + seasonalVal
    const value = Math.max(0, Math.round(forecast))

    // Erreur standard de prédiction : sigma × sqrt(1 + 1/n + (t - meanX)² / Sxx)
    // La variance augmente avec l'horizon de prédiction (t - meanX)² / Sxx
    const sem = sigma * Math.sqrt(1 + 1 / Math.max(model.n, 1) + (t - meanX) ** 2 / Math.max(Sxx, 1))
    const z80 = 1.282
    const z95 = 1.96

    result.push({
      mois: MOIS_LABELS[moisIndex],
      moisIndex,
      value,
      lower80: Math.max(0, Math.round(forecast - z80 * sem)),
      upper80: Math.max(0, Math.round(forecast + z80 * sem)),
      lower95: Math.max(0, Math.round(forecast - z95 * sem)),
      upper95: Math.max(0, Math.round(forecast + z95 * sem)),
      confidence: Math.max(0, Math.round(100 - (sigma / Math.max(Math.abs(forecast) || 1, 1)) * 100)),
    })
  }

  return result
}

/**
 * Évalue la qualité du modèle (MAE, RMSE)
 */
export function evaluateModel(model: SeasonalModel, data: { mois: number; value: number }[]): { mae: number; rmse: number } {
  if (data.length === 0 || model.n === 0) return { mae: 0, rmse: 0 }
  const errors = data.map((d, i) => {
    const trend = model.trend.intercept + model.trend.slope * i
    const seasonal = model.seasonalFactors[d.mois] || 0
    return Math.abs(d.value - (trend + seasonal))
  })
  const mae = errors.reduce((s, e) => s + e, 0) / errors.length
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
  return { mae: Math.round(mae * 10) / 10, rmse: Math.round(rmse * 10) / 10 }
}
