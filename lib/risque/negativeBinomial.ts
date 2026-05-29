// lib/risque/negativeBinomial.ts
// Negative Binomial — meilleur que Poisson pour les comptages surdispersés
// Les incidents aériens arrivent par grappes (météo = plusieurs FOD le même jour)

export interface NBPrediction {
  mean: number               // nombre moyen d'incidents par période
  variance: number           // variance ( > mean = surdispersion)
  dispersion: number         // paramètre de surdispersion r (r petit = forte surdispersion)
  probabilityOfK: (k: number) => number  // P(N = k)
  probabilityAtLeast: (k: number) => number  // P(N ≥ k)
  probabilityOfExactly: number[]  // P(N = 0), P(N = 1), ... P(N = 10)
  expectedMax: number        // nombre max attendu (95e percentile)
  isOverdispersed: boolean   // variance > mean ?
  recommendedDistribution: 'poisson' | 'negbin'  // quel modèle utiliser
}

/**
 * Estimation des paramètres par méthode des moments
 * r = mean² / (variance - mean)  [paramètre de dispersion]
 * p = mean / variance            [probabilité de succès]
 *
 * P(N = k) = C(k + r - 1, k) × (1-p)^r × p^k
 */
export function fitNegativeBinomial(
  counts: number[]
): { r: number; p: number; mean: number; variance: number } {
  const n = counts.length
  if (n === 0) return { r: 1, p: 0.5, mean: 1, variance: 2 }

  const mean = counts.reduce((a, b) => a + b, 0) / n
  const variance = counts.reduce((s, x) => s + (x - mean) ** 2, 0) / n

  if (variance <= mean) {
    // Pas de surdispersion → Poisson suffit
    return { r: 100, p: mean / (mean + 100), mean, variance: mean }
  }

  // Méthode des moments
  const r = Math.max(0.1, mean * mean / (variance - mean))
  const p = Math.min(0.99, Math.max(0.01, mean / variance))

  return { r, p, mean, variance }
}

/**
 * Fonction de masse P(N = k) pour NB(r, p)
 */
function nbPMF(k: number, r: number, p: number): number {
  if (k < 0) return 0
  // C(k + r - 1, k) = Γ(k+r) / (Γ(k+1) × Γ(r))
  // Approximation par produit pour éviter les overflow
  let binom = 1
  for (let i = 1; i <= k; i++) {
    binom *= (r + i - 1) / i
  }
  return binom * Math.pow(1 - p, r) * Math.pow(p, k)
}

/**
 * Prédiction NB complète
 */
export function predictNB(counts: number[]): NBPrediction {
  const { r, p, mean, variance } = fitNegativeBinomial(counts)
  const isOverdispersed = variance > mean * 1.2

  const probabilityOfK = (k: number) => {
    if (isOverdispersed) return nbPMF(k, r, p)
    // Poisson: λ^k × e^(-λ) / k!
    const lambda = mean
    let poisson = Math.exp(-lambda)
    for (let i = 1; i <= k; i++) poisson *= lambda / i
    return poisson
  }

  // P(N = 0) à P(N = 10)
  const probArray: number[] = []
  for (let k = 0; k <= 10; k++) probArray.push(probabilityOfK(k))

  // P(N ≥ k)
  const probabilityAtLeast = (k: number) => {
    let sum = 0
    for (let i = 0; i < k; i++) sum += probabilityOfK(i)
    return Math.round((1 - sum) * 1000) / 1000
  }

  // 95e percentile
  let cum = 0, expectedMax = 0
  for (let k = 0; k <= 100; k++) {
    cum += probabilityOfK(k)
    if (cum >= 0.95) { expectedMax = k; break }
  }

  return {
    mean: Math.round(mean * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    dispersion: Math.round(r * 100) / 100,
    probabilityOfK,
    probabilityAtLeast,
    probabilityOfExactly: probArray.map(p => Math.round(p * 1000) / 1000),
    expectedMax,
    isOverdispersed,
    recommendedDistribution: isOverdispersed ? 'negbin' : 'poisson',
  }
}
