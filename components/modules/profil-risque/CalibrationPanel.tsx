'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Brain, CheckCircle2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
import {
  computeModelPerformance,
  isCorrectionNeeded,
  computeBiasCorrection,
  generateCorrection,
  getPerformanceClass,
} from '@/lib/risque/calibration'
import type { FeedbackInspecteur, MatricePerformance } from '@/lib/risque/types'

interface Props {
  aerodromeId: string
  onClose: () => void
}

const STORAGE_KEY = 'sgda_feedbacks'
const CORRECTIONS_KEY = 'sgda_corrections'

function loadAllFeedbacks(aerodromeId: string): FeedbackInspecteur[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const all: FeedbackInspecteur[] = JSON.parse(raw)
    return all.filter(f => f.aerodrome_id === aerodromeId)
  } catch { return [] }
}

function clearFeedbacks(aerodromeId: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const all: FeedbackInspecteur[] = JSON.parse(raw)
    const filtered = all.filter(f => f.aerodrome_id !== aerodromeId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch { /* ignore */ }
}

function MetricCard({ label, value, unit, cls }: { label: string; value: string | number; unit?: string; cls?: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
      <p className="text-[10px] text-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 ${cls || 'text-foreground'}`}>{value}{unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>}</p>
    </div>
  )
}

export function CalibrationPanel({ aerodromeId, onClose }: Props) {
  const [feedbacks, setFeedbacks] = useState(() => loadAllFeedbacks(aerodromeId))
  const [applied, setApplied] = useState(false)
  const [cleared, setCleared] = useState(false)

  const performance = useMemo((): MatricePerformance | null => {
    if (feedbacks.length === 0) return null
    return computeModelPerformance(feedbacks)
  }, [feedbacks])

  const { besoin, raisons } = useMemo(() => {
    if (!performance) return { besoin: false, raisons: [] }
    return isCorrectionNeeded(performance)
  }, [performance])

  const handleApplyCorrection = () => {
    const perf = performance
    if (!perf) return

    const corrections: Record<string, any>[] = []
    if (perf.biais3m != null && Math.abs(perf.biais3m) > 5) {
      corrections.push(generateCorrection('matrix', 'seuil', 50, 50 + computeBiasCorrection(perf.biais3m), 'Correction auto par feedback', true))
    }
    if (perf.biais6m != null && Math.abs(perf.biais6m) > 5) {
      corrections.push(generateCorrection('bayesian', 'vraisemblance', 0.5, 0.5 + computeBiasCorrection(perf.biais6m) / 100, 'Correction auto par feedback', true))
    }

    try {
      const raw = localStorage.getItem(CORRECTIONS_KEY)
      const existing = raw ? JSON.parse(raw) : []
      existing.push(...corrections)
      localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(existing))
    } catch { /* ignore */ }

    setApplied(true)
  }

  const handleClear = () => {
    clearFeedbacks(aerodromeId)
    setFeedbacks([])
    setCleared(true)
  }

  return (
    <Card variant="role" title="Calibration des modèles" icon={<Brain className="w-4 h-4" />}>
      <div className="space-y-4">
        {feedbacks.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success" />
            <p className="text-sm text-foreground">
              {cleared ? 'Données de calibration effacées.' : 'Aucun feedback inspecteur disponible pour ce site.'}
            </p>
            <p className="text-xs text-foreground mt-1">
              Les évaluations de précision des inspecteurs servent à recalibrer les modèles de prédiction.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground">
                {feedbacks.length} feedback{feedbacks.length > 1 ? 's' : ''} collecté{feedbacks.length > 1 ? 's' : ''}
              </span>
              <button onClick={handleClear} className="btn btn-ghost btn-sm text-xs gap-1 text-foreground">
                <Trash2 className="w-3 h-3" />Effacer
              </button>
            </div>

            {/* Métriques */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="MAE 3m" value={performance?.mae3m?.toFixed(1) ?? '—'} cls={performance?.mae3m != null ? getPerformanceClass(performance.mae3m) : undefined} />
              <MetricCard label="MAE 6m" value={performance?.mae6m?.toFixed(1) ?? '—'} cls={performance?.mae6m != null ? getPerformanceClass(performance.mae6m) : undefined} />
              <MetricCard label="Biais 3m" value={performance?.biais3m != null ? (performance.biais3m > 0 ? '+' : '') + performance.biais3m.toFixed(1) : '—'}
                cls={performance?.biais3m != null ? (Math.abs(performance.biais3m) > 5 ? 'text-danger' : Math.abs(performance.biais3m) > 2 ? 'text-warning' : 'text-success') : undefined} />
              <MetricCard label="Biais 6m" value={performance?.biais6m != null ? (performance.biais6m > 0 ? '+' : '') + performance.biais6m.toFixed(1) : '—'}
                cls={performance?.biais6m != null ? (Math.abs(performance.biais6m) > 5 ? 'text-danger' : Math.abs(performance.biais6m) > 2 ? 'text-warning' : 'text-success') : undefined} />
            </div>

            {/* Statut calibration */}
            {besoin && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Correction nécessaire</p>
                  <ul className="mt-1 space-y-0.5">
                    {raisons.map((r, i) => (
                      <li key={i} className="text-xs text-foreground">• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {!besoin && feedbacks.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <p className="text-xs text-foreground">Modèle bien calibré — aucune correction nécessaire</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              {besoin && !applied && (
                <button onClick={handleApplyCorrection} className="btn btn-sm bg-role-primary hover:bg-role-primary/80 text-white gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />Appliquer correction
                </button>
              )}
              {applied && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success/30">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-xs text-foreground">Correction appliquée</span>
                </div>
              )}
              <button onClick={onClose} className="btn btn-sm btn-secondary">
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
