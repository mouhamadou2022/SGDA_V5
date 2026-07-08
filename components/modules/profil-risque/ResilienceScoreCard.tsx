'use client'

import { useMemo } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Shield, TrendingUp, TrendingDown, Activity, Clock, Gauge } from 'lucide-react'
import { computeVolatilityIndicators, getStabilityClass } from '@/lib/risque/volatility'

interface Props {
  profil: ProfilRisque
}

function computeRecoveryScore(profil: ProfilRisque): number {
  const surv = profil.survival_metrics
  if (!surv) return 50

  const medianDays = surv.medianDays ?? 180
  if (medianDays <= 0) return 30

  // Less median days = faster recovery = better resilience
  if (medianDays >= 365) return 20
  if (medianDays >= 180) return 40
  if (medianDays >= 90) return 60
  if (medianDays >= 45) return 75
  return 90
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'var(--color-success)'
  if (score >= 50) return 'var(--color-primary)'
  if (score >= 30) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

function getScoreTextColor(score: number): string {
  if (score >= 70) return 'text-success'
  if (score >= 50) return 'text-primary'
  if (score >= 30) return 'text-warning'
  return 'text-danger'
}

function getScoreLabel(score: number): string {
  if (score >= 70) return 'Bonne'
  if (score >= 50) return 'Modérée'
  if (score >= 30) return 'Fragile'
  return 'Critique'
}

export function ResilienceScoreCard({ profil }: Props) {
  const scores = (profil.historical_scores || []).map(h => h.score)

  const volatility = useMemo(() =>
    scores.length >= 2 ? computeVolatilityIndicators(scores) : null,
    [scores]
  )

  const resilienceScore = useMemo(() => {
    const c5 = profil.c5 ?? 50
    const volScore = volatility ? Math.max(0, 100 - (volatility.relativeVolatility * 2)) : 50
    const recoveryScore = computeRecoveryScore(profil)

    return Math.round(Math.min(100, Math.max(0, c5 * 0.40 + volScore * 0.30 + recoveryScore * 0.30)))
  }, [profil.c5, volatility, profil.survival_metrics])

  const color = getScoreColor(resilienceScore)
  const textColor = getScoreTextColor(resilienceScore)

  const factors: { label: string; value: number; max: number; weight: string; color: string }[] = [
    {
      label: 'C5 — Résilience',
      value: profil.c5,
      max: 100,
      weight: '40%',
      color: getScoreColor(profil.c5),
    },
    {
      label: 'Volatilité',
      value: volatility ? Math.max(0, 100 - volatility.relativeVolatility * 2) : 50,
      max: 100,
      weight: '30%',
      color: volatility && volatility.stabiliteNiveau.includes('instable') ? 'var(--color-warning)' : 'var(--color-success)',
    },
    {
      label: 'Rétablissement',
      value: computeRecoveryScore(profil),
      max: 100,
      weight: '30%',
      color: getScoreColor(computeRecoveryScore(profil)),
    },
  ]

  return (
    <Card variant="role" title="Résilience" icon={<Shield className="w-4 h-4" />}>
      <div className="space-y-3">
        {/* Score composite */}
        <div className="flex items-center gap-4">
          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-muted)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3"
                strokeDasharray={`${resilienceScore}, 100`}
                strokeLinecap="round" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${textColor}`}>
              {resilienceScore}
            </span>
          </div>
          <div>
            <p className={`text-sm font-bold ${textColor}`}>{getScoreLabel(resilienceScore)}</p>
            <p className="text-[10px] text-foreground">Score composite résilience</p>
          </div>
        </div>

        {/* Facteurs contributeurs */}
        <div className="space-y-2">
          {factors.map(f => (
            <div key={f.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">{f.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold" style={{ color: f.color }}>{Math.round(f.value)}</span>
                  <span className="text-[10px] text-muted-foreground">{f.weight}</span>
                </div>
              </div>
              <div className="progress h-1.5 mt-0.5">
                <div className="progress-bar" style={{ width: `${f.value}%`, background: f.color, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Infos supplémentaires */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border text-[10px] text-foreground">
          {volatility && (
            <span className={`inline-flex items-center gap-1 ${getStabilityClass(volatility.stabiliteNiveau)}`}>
              <Activity className="w-3 h-3" />
              {volatility.stabiliteNiveau.replace('_', ' ')}
            </span>
          )}
          {profil.survival_metrics && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Rétablissement ~{profil.survival_metrics.medianDays}j
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            Hazard 90j: {profil.survival_metrics ? Math.round(profil.survival_metrics.hazard90d * 100) : '—'}%
          </span>
        </div>
      </div>
    </Card>
  )
}
