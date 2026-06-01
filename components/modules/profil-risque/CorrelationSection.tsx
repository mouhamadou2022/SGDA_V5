'use client'

import { useMemo } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Link2, AlertTriangle } from 'lucide-react'

interface CorrelationSectionProps {
  profil: ProfilRisque
}

const LABELS = ['C1', 'C2', 'C3', 'C4', 'C5']
const KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'] as const

function computePearson(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my)
    vx += (x[i] - mx) ** 2
    vy += (y[i] - my) ** 2
  }
  const denom = Math.sqrt(vx * vy)
  return denom > 0 ? cov / denom : 0
}

function correlationColor(value: number): string {
  const absVal = Math.abs(value)
  if (absVal < 0.3) return 'bg-danger/20 text-danger border border-danger/30'
  if (absVal < 0.6) return 'bg-warning/20 text-warning border border-warning/30'
  return 'bg-success/20 text-success border border-success/30'
}

function correlationBarColor(value: number): string {
  const absVal = Math.abs(value)
  if (absVal < 0.3) return 'var(--color-danger)'
  if (absVal < 0.6) return 'var(--color-warning)'
  return 'var(--color-success)'
}

export function CorrelationSection({ profil }: CorrelationSectionProps) {
  const matrix = useMemo(() => {
    const history = profil.historical_scores
    if (!history || history.length < 2) return null

    const series = KEYS.map(k => history.map(h => (h as any)[k] ?? 0))
    const corr: number[][] = Array.from({ length: 5 }, () => new Array(5).fill(0))
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        corr[i][j] = i === j ? 1 : computePearson(series[i], series[j])
      }
    }
    return corr
  }, [profil.historical_scores])

  const copula = profil.copula_metrics

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          Corrélations C1–C5
        </div>
      </div>
      <div className="card-content space-y-4">
        {!matrix ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Données insuffisantes pour calculer les corrélations.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <td className="w-8" />
                  {LABELS.map((l) => (
                    <td key={l} className="text-center text-xs font-semibold text-muted-foreground px-1 pb-1">
                      {l}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="text-xs font-semibold text-muted-foreground pr-2 text-right">
                      {LABELS[i]}
                    </td>
                    {row.map((val, j) => {
                      if (i === j) {
                        return (
                          <td key={j} className="p-1">
                            <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center text-xs font-bold text-foreground">
                              1
                            </div>
                          </td>
                        )
                      }
                      return (
                        <td key={j} className="p-1">
                          <div
                            className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono font-semibold ${correlationColor(val)}`}
                            title={`${LABELS[i]} ↔ ${LABELS[j]}: ${val.toFixed(2)}`}
                          >
                            {val >= 0 ? '+' : ''}{val.toFixed(1)}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {matrix && (
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const pairs: { i: number; j: number; val: number }[] = []
              for (let i = 0; i < 5; i++) {
                for (let j = i + 1; j < 5; j++) {
                  pairs.push({ i, j, val: Math.abs(matrix[i][j]) })
                }
              }
              pairs.sort((a, b) => b.val - a.val)
              return pairs.slice(0, 3).map((p) => (
                <span
                  key={`${p.i}${p.j}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {LABELS[p.i]}↔{LABELS[p.j]}: {matrix[p.i][p.j].toFixed(2)}
                </span>
              ))
            })()}
          </div>
        )}

        {copula && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {copula.worstCaseDescription}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground">
                  Dépendance queue max:{' '}
                  <span className="font-mono font-semibold text-warning">
                    {(copula.maxTailDependence * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Prob. pire cas:{' '}
                  <span className="font-mono font-semibold text-danger">
                    {copula.worstCaseProbability}%
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
