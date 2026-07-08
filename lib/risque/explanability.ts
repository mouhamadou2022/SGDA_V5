import type { ProfilRisque } from '@/lib/store'
import type { MLRiskCorrelationData } from '@/lib/store/advancedModelsSlice'
import { inferNaiveBayesC5, getC5Label as _getC5Label, getC5Color as _getC5Color } from './naiveBayesC5'

export const getC5Label = _getC5Label
export const getC5Color = _getC5Color

export interface FeatureContribution {
  name: string
  key: string
  importance: number
  currentValue: number
  previousValue: number | null
  delta: number | null
  direction: 'up' | 'down' | 'stable'
}

export interface BayesianExplainData {
  /** Distribution a priori P(C5) */
  prior: Record<string, number>
  /** Distribution a posteriori P(C5 | C1..C4) */
  posterior: Record<string, number>
  /** État C5 prédit par le réseau bayésien */
  predictedC5: string
  /** Confiance dans la prédiction */
  confidence: number
  /** Facteurs de Bayes pointant vers le driver le plus influent */
  topDrivers: Array<{ key: string; name: string; factor: number }>
  /** La configuration courante est-elle anormale ? */
  isAnomalous: boolean
}

const FEATURE_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
const FEATURE_NAMES: Record<string, string> = {
  c1: 'Maturité SGS',
  c2: 'Efficacité PAC',
  c3: 'Conformité technique',
  c4: 'Charge critique',
  c5: 'Résilience',
}
const DEFAULT_WEIGHTS: Record<string, number> = {
  c1: 0.20, c2: 0.25, c3: 0.20, c4: 0.20, c5: 0.15,
}

export function computeFeatureContributions(
  profil: ProfilRisque,
  correlation: MLRiskCorrelationData | null
): FeatureContribution[] {
  const history = profil.historical_scores || []
  const lastMonth = history.length >= 2 ? history[history.length - 2] : null

  const importanceMap: Record<string, number> = {}
  if (correlation) {
    for (const f of correlation.featureAlignment) {
      if (FEATURE_KEYS.includes(f.feature as any)) {
        importanceMap[f.feature] = f.importance
      }
    }
  }

  const contributions: FeatureContribution[] = FEATURE_KEYS.map(key => {
    const currentValue = (profil as any)[key] ?? 50
    const previousValue = lastMonth ? (lastMonth as any)[key] ?? null : null
    const delta = previousValue !== null ? currentValue - previousValue : null
    const importance = importanceMap[key] ?? DEFAULT_WEIGHTS[key]

    let direction: 'up' | 'down' | 'stable' = 'stable'
    if (delta !== null) {
      if (delta > 2) direction = 'up'
      else if (delta < -2) direction = 'down'
    }

    return {
      name: FEATURE_NAMES[key] || key,
      key,
      importance,
      currentValue,
      previousValue,
      delta,
      direction,
    }
  })

  return contributions.sort((a, b) => a.currentValue - b.currentValue)
}

/**
 * Calcule l'inférence Naive Bayes C5 pour l'explicabilité causale.
 * Retourne null si l'historique est insuffisant (< 2 points).
 */
export function computeBayesianExplainability(profil: ProfilRisque): BayesianExplainData | null {
  const history = profil.historical_scores || []
  const result = inferNaiveBayesC5(profil, history)
  if (!result) return null

  return {
    prior: { bas: result.prior.bas, moyen: result.prior.moyen, eleve: result.prior.eleve },
    posterior: { bas: result.posterior.bas, moyen: result.posterior.moyen, eleve: result.posterior.eleve },
    predictedC5: result.predictedC5,
    confidence: result.confidence,
    topDrivers: result.topDrivers,
    isAnomalous: result.isAnomalous,
  }
}
