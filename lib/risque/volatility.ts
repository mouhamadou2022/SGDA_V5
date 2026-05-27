// lib/risque/volatility.ts
// Métriques de volatilité et stabilité pour les scores de risque

export type StabiliteNiveau = 'tres_stable' | 'stable' | 'instable' | 'tres_instable'

export function computeMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function computeStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = computeMean(values)
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function computeRelativeVolatility(scores: number[]): number {
  if (scores.length < 2) return 0
  const mean = computeMean(scores)
  if (mean === 0) return 0
  return (computeStandardDeviation(scores) / mean) * 100
}

export function getStabilityLevel(volatility: number): StabiliteNiveau {
  if (volatility <= 5) return 'tres_stable'
  if (volatility <= 12) return 'stable'
  if (volatility <= 22) return 'instable'
  return 'tres_instable'
}

export function computeDeviationFromNational(score: number, national: number): number {
  return score - national
}

export interface VolatilityIndicators {
  standardDeviation: number
  relativeVolatility: number
  stabiliteNiveau: StabiliteNiveau
  min: number
  max: number
  range: number
  trend: 'hausse' | 'baisse' | 'stable'
}

export function computeVolatilityIndicators(scores: number[]): VolatilityIndicators {
  if (scores.length === 0) {
    return { standardDeviation: 0, relativeVolatility: 0, stabiliteNiveau: 'tres_stable', min: 0, max: 0, range: 0, trend: 'stable' }
  }
  const std = computeStandardDeviation(scores)
  const rel = computeRelativeVolatility(scores)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const first = scores[0]
  const last = scores[scores.length - 1]
  const trend: 'hausse' | 'baisse' | 'stable' = last > first + 2 ? 'hausse' : last < first - 2 ? 'baisse' : 'stable'
  return {
    standardDeviation: std,
    relativeVolatility: rel,
    stabiliteNiveau: getStabilityLevel(rel),
    min,
    max,
    range: max - min,
    trend,
  }
}

export function computeRollingVolatility(scores: number[], windowSize = 3): number[] {
  if (scores.length < windowSize) return [computeStandardDeviation(scores)]
  const result: number[] = []
  for (let i = windowSize - 1; i < scores.length; i++) {
    const window = scores.slice(i - windowSize + 1, i + 1)
    result.push(computeStandardDeviation(window))
  }
  return result
}

export function isVolatilityAbnormal(volatility: number, threshold = 20): boolean {
  return volatility > threshold
}

export function getStabilityClass(niveau: StabiliteNiveau): string {
  switch (niveau) {
    case 'tres_stable': return 'badge success'
    case 'stable': return 'badge primary'
    case 'instable': return 'badge warning'
    case 'tres_instable': return 'badge danger'
  }
}

export function getStabilityIcon(niveau: StabiliteNiveau): string {
  switch (niveau) {
    case 'tres_stable': return '🟢'
    case 'stable': return '🔵'
    case 'instable': return '🟡'
    case 'tres_instable': return '🔴'
  }
}
