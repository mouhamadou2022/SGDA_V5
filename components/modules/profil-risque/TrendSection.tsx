'use client'

import { useMemo } from 'react'
import { ScoreHistoryPoint } from '@/lib/store'
import { linearRegression, detectInflexions } from '@/lib/risque/trends'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Minus, Activity, AlertTriangle } from 'lucide-react'

interface TrendSectionProps {
  historicalScores: ScoreHistoryPoint[]
}

function TrendBadge({ slope, r2 }: { slope: number; r2: number }) {
  const dir = slope > 0.5 ? 'hausse' : slope < -0.5 ? 'baisse' : 'stable'
  const icon =
    dir === 'hausse' ? (
      <TrendingUp className="w-3.5 h-3.5 text-success" />
    ) : dir === 'baisse' ? (
      <TrendingDown className="w-3.5 h-3.5 text-danger" />
    ) : (
      <Minus className="w-3.5 h-3.5 text-muted-foreground" />
    )
  const label = dir === 'hausse' ? 'Hausse' : dir === 'baisse' ? 'Baisse' : 'Stable'
  const bgCls =
    dir === 'hausse'
      ? 'bg-success/10 text-success border border-success/20'
      : dir === 'baisse'
        ? 'bg-danger/10 text-danger border border-danger/20'
        : 'bg-muted/20 text-muted-foreground border border-muted/30'

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bgCls}`}>
      {icon}
      {label} (R²={r2.toFixed(2)})
    </div>
  )
}

export function TrendSection({ historicalScores }: TrendSectionProps) {
  const longTermAnalysis = useMemo(() => {
    if (historicalScores.length < 3) return null
    const scores = historicalScores.map(p => p.score)
    return linearRegression(scores)
  }, [historicalScores])

  const shortTermAnalysis = useMemo(() => {
    if (historicalScores.length < 3) return null
    const recent = historicalScores.slice(-3)
    const scores = recent.map(p => p.score)
    return linearRegression(scores)
  }, [historicalScores])

  const inflexions = useMemo(() => {
    if (historicalScores.length < 4) return []
    const scores = historicalScores.map(p => p.score)
    const dates = historicalScores.map(p => p.date)
    return detectInflexions(scores, dates, 3)
  }, [historicalScores])

  const chartData = useMemo(
    () =>
      historicalScores.map(p => ({
        date: new Date(p.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        score: p.score,
      })),
    [historicalScores]
  )

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Analyse des tendances
        </div>
      </div>
      <div className="card-content space-y-4">
        {historicalScores.length < 2 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Données historiques insuffisantes.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {longTermAnalysis && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Tendance long terme
                  </span>
                  <TrendBadge slope={longTermAnalysis.slope} r2={longTermAnalysis.r2} />
                </div>
              )}

              {shortTermAnalysis && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Tendance court terme
                  </span>
                  <TrendBadge slope={shortTermAnalysis.slope} r2={shortTermAnalysis.r2} />
                </div>
              )}
            </div>

            {longTermAnalysis && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 rounded-lg bg-muted/20">
                  <p className="text-[10px] text-muted-foreground uppercase">Pente</p>
                  <p className="text-sm font-mono font-semibold text-foreground">
                    {longTermAnalysis.slope >= 0 ? '+' : ''}{longTermAnalysis.slope.toFixed(2)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/20">
                  <p className="text-[10px] text-muted-foreground uppercase">R²</p>
                  <p className="text-sm font-mono font-semibold text-foreground">
                    {longTermAnalysis.r2.toFixed(3)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/20">
                  <p className="text-[10px] text-muted-foreground uppercase">Marge ±95%</p>
                  <p className="text-sm font-mono font-semibold text-foreground">
                    ±{longTermAnalysis.confidenceMargin95.toFixed(1)}
                  </p>
                </div>
              </div>
            )}

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #6b7280)' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #6b7280)' }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: 'none',
                      borderRadius: 8,
                      background: 'var(--color-card, #fff)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {inflexions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  Points d'inflexion détectés
                </div>
                {inflexions.map((inf, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-warning/10 border border-warning/20 text-xs"
                  >
                    <span className="font-medium text-foreground">
                      {new Date(inf.date).toLocaleDateString('fr-FR')}
                    </span>
                    <span className="text-muted-foreground">
                      {inf.valeurAvant} → {inf.valeurApres}
                    </span>
                    <span
                      className={
                        inf.direction === 'hausse'
                          ? 'text-success font-semibold'
                          : 'text-danger font-semibold'
                      }
                    >
                      {inf.direction === 'hausse' ? '+' : '-'}
                      {inf.amplitude.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
