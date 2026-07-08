import type { ScoreHistoryPoint } from '@/lib/store'

export type DriftSeverity = 'critique' | 'eleve' | 'moyen' | 'normal'

export interface FeatureDrift {
  feature: string
  label: string
  currentValue: number
  historicalMean: number
  historicalStd: number
  zScore: number
  severity: DriftSeverity
  direction: 'hausse' | 'baisse' | 'stable'
  description: string
}

export interface DriftAnalysis {
  drifts: FeatureDrift[]
  hasAnomaly: boolean
  criticalCount: number
  summary: string
}

const FEATURE_LABELS: Record<string, string> = {
  score: 'Score global',
  c1: 'Maturité SGS',
  c2: 'Efficacité PAC',
  c3: 'Conformité technique',
  c4: 'Charge critique',
  c5: 'Résilience',
}

const FEATURE_KEYS = ['score', 'c1', 'c2', 'c3', 'c4', 'c5'] as const

function computeMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function computeStd(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function getSeverity(z: number): DriftSeverity {
  const abs = Math.abs(z)
  if (abs > 3) return 'critique'
  if (abs > 2) return 'eleve'
  if (abs > 1.5) return 'moyen'
  return 'normal'
}

export function analyzeDrift(
  history: ScoreHistoryPoint[],
  currentScores: { score: number; c1: number; c2: number; c3: number; c4: number; c5: number }
): DriftAnalysis {
  if (history.length < 3) {
    return { drifts: [], hasAnomaly: false, criticalCount: 0, summary: 'Historique insuffisant pour analyser les dérives.' }
  }

  const drifts: FeatureDrift[] = []

  for (const key of FEATURE_KEYS) {
    const label = FEATURE_LABELS[key]
    const currentVal = key === 'score' ? currentScores.score : currentScores[key as keyof typeof currentScores]

    const historicalValues = history
      .map(h => (key === 'score' ? h.score : (h as any)[key]))
      .filter((v): v is number => v !== undefined && v !== null)

    if (historicalValues.length < 3) continue

    const mean = computeMean(historicalValues)
    const std = computeStd(historicalValues, mean)
    if (std === 0) continue

    const zScore = (currentVal - mean) / std
    const severity = getSeverity(zScore)

    let direction: 'hausse' | 'baisse' | 'stable' = 'stable'
    if (zScore > 1.5) direction = 'hausse'
    else if (zScore < -1.5) direction = 'baisse'

    let description: string
    if (severity === 'normal') {
      description = `${label} dans la norme historique`
    } else {
      const ecart = (currentVal - mean).toFixed(1)
      const signe = currentVal > mean ? 'supérieur' : 'inférieur'
      description = `${label} anormalement ${signe} (${ecart} pts, Z=${zScore.toFixed(2)})`
    }

    drifts.push({
      feature: key,
      label,
      currentValue: currentVal,
      historicalMean: mean,
      historicalStd: std,
      zScore,
      severity,
      direction,
      description,
    })
  }

  drifts.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

  const anomalies = drifts.filter(d => d.severity === 'critique' || d.severity === 'eleve')
  const hasAnomaly = anomalies.length > 0
  const criticalCount = drifts.filter(d => d.severity === 'critique').length

  let summary: string
  if (criticalCount > 0) {
    const noms = drifts.filter(d => d.severity === 'critique').map(d => d.label).join(', ')
    summary = `${criticalCount} dérive(s) critique(s) détectée(s) : ${noms}. Inspection recommandée.`
  } else if (anomalies.length > 0) {
    const noms = anomalies.map(d => d.label).join(', ')
    summary = `${anomalies.length} dérive(s) anormale(s) sur ${noms}. Surveillance renforcée conseillée.`
  } else {
    summary = 'Aucune dérive anormale détectée. Profil stable.'
  }

  return { drifts, hasAnomaly, criticalCount, summary }
}
