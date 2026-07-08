'use client'

import { useMemo } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'
import { analyzeDrift, type FeatureDrift } from '@/lib/risque/drift'

interface Props {
  profil: ProfilRisque
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critique': return 'var(--color-danger)'
    case 'eleve': return 'var(--color-warning)'
    case 'moyen': return 'var(--color-primary)'
    default: return 'var(--color-success)'
  }
}

function getSeverityText(severity: string): string {
  switch (severity) {
    case 'critique': return 'Critique'
    case 'eleve': return 'Anormal'
    case 'moyen': return 'Léger'
    default: return 'Normal'
  }
}

function getSeverityBadge(severity: string): string {
  switch (severity) {
    case 'critique': return 'badge danger'
    case 'eleve': return 'badge warning'
    case 'moyen': return 'badge primary'
    default: return 'badge success'
  }
}

function DriftRow({ drift }: { drift: FeatureDrift }) {
  const barColor = getSeverityColor(drift.severity)
  const barWidth = Math.min(100, Math.abs(drift.zScore) * 25)

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{drift.label}</span>
            <span className={`${getSeverityBadge(drift.severity)} text-[10px]`}>{getSeverityText(drift.severity)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-bold text-foreground">{drift.currentValue}</span>
            <span className="text-[10px] font-mono text-muted-foreground">μ {drift.historicalMean.toFixed(1)}</span>
            {drift.direction !== 'stable' && (
              <span className={drift.direction === 'hausse' ? 'text-success' : 'text-danger'}>
                {drift.direction === 'hausse' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              </span>
            )}
          </div>
        </div>
        <div className="progress h-1 mt-1">
          <div className="progress-bar" style={{ width: `${barWidth}%`, background: barColor }} />
        </div>
        {drift.severity !== 'normal' && (
          <p className="text-[10px] text-foreground mt-1 opacity-70">{drift.description}</p>
        )}
      </div>
    </div>
  )
}

export function FeatureDriftCard({ profil }: Props) {
  const analysis = useMemo(() => {
    const history = profil.historical_scores || []
    return analyzeDrift(history, {
      score: profil.score_global,
      c1: profil.c1,
      c2: profil.c2,
      c3: profil.c3,
      c4: profil.c4,
      c5: profil.c5,
    })
  }, [profil])

  const anomalies = analysis.drifts.filter(d => d.severity === 'critique' || d.severity === 'eleve')
  const normals = analysis.drifts.filter(d => d.severity === 'normal')

  if (!analysis.hasAnomaly && analysis.drifts.length === 0) {
    return null
  }

  return (
    <Card
      variant={analysis.hasAnomaly ? 'alert' : 'role'}
      alertBg={analysis.criticalCount > 0 ? 'danger' : 'warning'}
      title="Dérives des indicateurs"
      icon={analysis.hasAnomaly ? <AlertTriangle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
      badge={analysis.hasAnomaly ? <span className={`badge ${analysis.criticalCount > 0 ? 'danger' : 'warning'} animate-pulse`}>{anomalies.length}</span> : undefined}
    >
      <div className="space-y-1">
        {analysis.hasAnomaly && (
          <p className="text-xs text-foreground mb-2 leading-relaxed">{analysis.summary}</p>
        )}

        {anomalies.length > 0 && (
          <div className="divide-y divide-border">
            {anomalies.map(d => (
              <DriftRow key={d.feature} drift={d} />
            ))}
          </div>
        )}

        {!analysis.hasAnomaly && (
          <p className="text-xs text-foreground text-center py-3">
            <Minus className="w-3 h-3 inline mr-1" />
            Aucune dérive anormale détectée — profil stable
          </p>
        )}
      </div>
    </Card>
  )
}
