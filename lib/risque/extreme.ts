// lib/risque/extreme.ts
// Extreme Value Theory — GEV + GPD
// Modélise les événements rares et catastrophiques (tail risk)
// « Quel est le pire incident possible dans les 12 prochains mois ? »

export interface ExtremeEvent {
  value: number        // score d'impact (C5, nb d'incidents, etc.)
  date: string
}

export interface EVTPrediction {
  returnLevel1y: number    // niveau attendu 1 fois par an (période de retour 1 an)
  returnLevel5y: number    // niveau attendu 1 fois tous les 5 ans  
  returnLevel10y: number   // niveau attendu 1 fois tous les 10 ans
  shape: number            // paramètre de forme ξ (ξ > 0 = queue lourde, distribution de Fréchet)
  scale: number            // paramètre d'échelle σ
  location: number         // paramètre de position μ
  tailIndex: number        // indice de queue (inverse du shape)
  isHeavyTailed: boolean   // distribution à queue lourde ?
  maxExpected12m: number   // valeur maximale attendue dans les 12 prochains mois
  probabilityExtreme: number // probabilité de dépasser le pire historique dans 12 mois
}

/**
 * Estimateur de Hill pour l'indice de queue (tail index)
 * Valide pour les distributions à queue lourde (Fréchet, ξ > 0)
 */
function hillEstimator(sortedData: number[], k: number = 20): number {
  const n = sortedData.length
  if (n === 0) return 0.5
  const kEff = Math.min(k, Math.floor(n / 3))
  if (kEff <= 1) return 0.5
  // γ = (1/k) Σ ln(X(n-i+1)/X(n-k))
  let sum = 0
  const threshold = sortedData[n - kEff - 1]
  for (let i = 1; i <= kEff; i++) {
    if (sortedData[n - i] > 0 && threshold > 0) {
      sum += Math.log(sortedData[n - i] / threshold)
    }
  }
  return sum / kEff
}

/**
 * Méthode des moments pondérés (PWM) pour estimer les paramètres GEV
 * ξ = shape, σ = scale, μ = location
 */
function fitGEV(data: number[]): { shape: number; scale: number; location: number } {
  const n = data.length
  if (n < 10) return { shape: 0.1, scale: 10, location: 30 }

  const sorted = [...data].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / n

  // Moments pondérés
  let b0 = mean
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < n; i++) {
    const p = (i + 1) / (n + 1)
    b1 += sorted[i] * p / n
    b2 += sorted[i] * p * p / n
  }

  // Estimateur de Hosking pour GEV
  if (b1 <= 0 || b2 <= 0) return { shape: 0.1, scale: 10, location: mean }

  const c = (2 * b1 - b0) / (3 * b2 - b0) - Math.log(2) / Math.log(3)
  const shape = 7.8590 * c + 2.9554 * c * c
  // gamma = Γ(1+|ξ|) approximation
  const absShape = Math.abs(shape)
  const gammaApprox = absShape < 1e-6 ? 1 : Math.sqrt(2 * Math.PI / absShape) * Math.pow(absShape / Math.E, absShape)
  const scale = ((2 * b1 - b0) * shape) / (gammaApprox * (1 - Math.pow(2, -shape)))
  const location = b0 + scale * (gammaApprox - 1) / shape

  return {
    shape: isNaN(shape) ? 0.1 : Math.max(-0.5, Math.min(1, shape)),
    scale: isNaN(scale) ? 10 : Math.max(1, Math.abs(scale)),
    location: isNaN(location) ? mean : location,
  }
}

/**
 * Niveaux de retour (return levels)
 * zp = μ - σ/ξ [1 - (-ln(1-p))^(-ξ)] pour ξ ≠ 0
 * zp = μ - σ ln(-ln(1-p)) pour ξ = 0
 */
function computeReturnLevels(
  shape: number, scale: number, location: number,
  periods: number[] = [1, 5, 10]
): number[] {
  return periods.map(T => {
    const p = 1 - 1 / (T * 12) // probabilité de dépassement par mois sur T ans
    if (Math.abs(shape) < 0.01) {
      return location - scale * Math.log(-Math.log(1 - p))
    }
    return location - (scale / shape) * (1 - Math.pow(-Math.log(1 - p), -shape))
  })
}

/**
 * Prédiction EVT complète
 */
export function predictEVT(
  events: ExtremeEvent[],
  monthsAhead: number = 12
): EVTPrediction {
  if (events.length < 5) {
    return {
      returnLevel1y: 30, returnLevel5y: 50, returnLevel10y: 70,
      shape: 0.1, scale: 10, location: 30,
      tailIndex: 10, isHeavyTailed: false,
      maxExpected12m: 30, probabilityExtreme: 5,
    }
  }

  const values = events.map(e => Math.abs(e.value))
  const gev = fitGEV(values)
  const hill = hillEstimator([...values].sort((a, b) => a - b))

  const returnLevels = computeReturnLevels(gev.shape, gev.scale, gev.location)

  // Probabilité de dépasser le pire historique
  const maxHistoric = Math.max(...values)
  const pExceed = gev.shape > 0.01
    ? Math.exp(-Math.pow(1 + gev.shape * (maxHistoric - gev.location) / gev.scale, -1 / gev.shape))
    : Math.exp(-Math.exp(-(maxHistoric - gev.location) / gev.scale))

  return {
    returnLevel1y: Math.round(returnLevels[0]),
    returnLevel5y: Math.round(returnLevels[1]),
    returnLevel10y: Math.round(returnLevels[2]),
    shape: Math.round(gev.shape * 1000) / 1000,
    scale: Math.round(gev.scale),
    location: Math.round(gev.location),
    tailIndex: Math.round(hill > 0 ? 1 / hill : 10),
    isHeavyTailed: gev.shape > 0.1,
    maxExpected12m: Math.round(Math.max(returnLevels[0], maxHistoric * 0.8)),
    probabilityExtreme: Math.round((1 - pExceed) * 100),
  }
}
