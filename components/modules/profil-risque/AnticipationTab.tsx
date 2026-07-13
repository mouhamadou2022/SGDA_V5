// components/modules/profil-risque/AnticipationTab.tsx
// Points de vigilance inspecteur generes par IA (Groq) à partir des donnees brutes du profil
// Aucune regle hardcodee — chaque point est analyse formule par le LLM

'use client'

import { useState, useEffect, useCallback } from 'react'
import { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, Brain, Activity, Target, Shield, Clock, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import ScenarioSimulator from './ScenarioSimulator'
import type { ActionConcrete } from '@/lib/risque/recommendations'

interface AnticipationTabProps {
  profil: ProfilRisque
  historicalScores: ScoreHistoryPoint[]
  evenements: any[]
  aerodromeCode?: string
}

const PRIORITE_LABEL: Record<string, { label: string; badge: string }> = {
  immediate: { label: 'Immédiat', badge: 'badge danger' },
  haute: { label: 'Prioritaire', badge: 'badge warning' },
  moyenne: { label: 'À planifier', badge: 'badge primary' },
  basse: { label: 'Secondaire', badge: 'badge neutral' },
}

export default function AnticipationTab({ profil, historicalScores, evenements, aerodromeCode }: AnticipationTabProps) {
  const [actions, setActions] = useState<ActionConcrete[]>([])
  const [iaLoading, setIaLoading] = useState(true)
  const [iaError, setIaError] = useState(false)

  const fetchActions = useCallback(async () => {
    setIaLoading(true)
    setIaError(false)
    try {
      const res = await fetch('/api/ai/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profil }),
      })
      const data = await res.json()
      if (data.actions && Array.isArray(data.actions)) {
        setActions(data.actions)
      } else {
        setIaError(true)
      }
    } catch {
      setIaError(true)
    } finally {
      setIaLoading(false)
    }
  }, [profil])

  useEffect(() => { fetchActions() }, [fetchActions])

  return (
    <div className="space-y-8 animate-fade-up" data-module="anticipation-tab">
      {/* ═══ ROW 1 — Ce qui va arriver ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="role" title="Prédictions temporelles" icon={<Target className="w-4 h-4" />} size="sm">
          <div className="flex items-center justify-around">
            {([
              { label: '3 mois', val: profil.prediction_3m, ic: profil.prediction_interval_3m },
              { label: '6 mois', val: profil.prediction_6m, ic: profil.prediction_interval_6m },
              { label: '12 mois', val: profil.prediction_12m, ic: null },
            ] as const).map((p) => {
              if (p.val === undefined) return null
              const cls = p.val >= 80 ? 'text-danger' : p.val >= 60 ? 'text-warning' : p.val >= 30 ? 'text-primary' : 'text-success'
              return (
                <div key={p.label} className="text-center">
                  <div className={`text-2xl font-bold ${cls}`}>{Math.round(p.val)}</div>
                  <div className="text-xs text-foreground">{p.label}</div>
                  {p.ic && <div className="text-[10px] text-foreground italic">IC95 [{Math.round(p.ic.lower)}–{Math.round(p.ic.upper)}]</div>}
                </div>
              )
            })}
          </div>
          {profil.ensemble_confidence !== undefined && (
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border text-xs text-foreground">
              <span>Confiance ensemble</span>
              <div className="progress flex-1 h-1.5">
                <div className="progress-bar" style={{ width: `${Math.round(profil.ensemble_confidence * 100)}%`, background: `var(--color-${profil.ensemble_confidence >= 0.7 ? 'success' : profil.ensemble_confidence >= 0.4 ? 'warning' : 'danger'})` }} />
              </div>
              <span className="font-mono">{Math.round(profil.ensemble_confidence * 100)}%</span>
            </div>
          )}
        </Card>

        <Card variant="role" title="Risques incidents & extrêmes" icon={<AlertTriangle className="w-4 h-4" />} size="sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-danger/5">
              <div className="text-xs text-foreground">Incident 3m</div>
              <div className="text-lg font-bold text-danger">{profil.incident_prediction_3m ?? '—'}</div>
            </div>
            <div className="p-2 rounded-lg bg-warning/5">
              <div className="text-xs text-foreground">Incident 6m</div>
              <div className="text-lg font-bold text-warning">{profil.incident_prediction_6m ?? '—'}</div>
            </div>
            <div className="p-2 rounded-lg bg-role-primary-soft">
              <div className="text-xs text-foreground">Incident 12m</div>
              <div className="text-lg font-bold text-role-primary">{profil.incident_prediction_12m ?? '—'}</div>
            </div>
          </div>
          {profil.extreme_risk && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border text-xs text-foreground">
              <span className={`badge ${profil.extreme_risk.isHeavyTailed ? 'danger' : 'success'}`}>{profil.extreme_risk.isHeavyTailed ? 'Queue lourde' : 'Queue normale'}</span>
              <span>Risque extrême: {(profil.extreme_risk.tailRisk * 100).toFixed(0)}%</span>
              <span>Max 12m: {profil.extreme_risk.maxExpected12m}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ═══ ROW 2 — Points de vigilance inspecteur (IA) ═══ */}
      <Card
        title="Points de vigilance — inspecteur"
        icon={iaLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
        variant="level"
        levelColor={
          iaLoading ? 'none' :
          iaError ? 'none' :
          actions.some(a => a.priorite === 'immediate') ? 'danger' :
          actions.some(a => a.priorite === 'haute') ? 'warning' : 'primary'
        }
      >
        {iaLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 rounded-full border-2 border-role-primary border-t-transparent animate-spin" />
            <p className="text-sm text-foreground">Analyse des signaux profil par IA...</p>
            <p className="text-xs text-foreground">Génération des points de vigilance personnalisés</p>
          </div>
        ) : iaError ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="w-10 h-10 text-warning" />
            <p className="text-sm text-foreground">Service IA momentanément indisponible</p>
            <p className="text-xs text-foreground text-center max-w-md">Les points de vigilance n'ont pas pu être générés. Vérifiez que la clé API Groq est configurée.</p>
            <button onClick={fetchActions} className="btn btn-sm btn-primary gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </button>
          </div>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
            <p className="text-sm text-foreground">Aucun point de vigilance — l'IA n'a identifié aucun signal necessitant une attention particulière.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {actions.map((a, i) => (
              <ActionCard key={i} action={a} />
            ))}
          </div>
        )}
      </Card>

      {/* ═══ ROW 3 — Ce qui pourrait arriver (What-if) ═══ */}
      <ScenarioSimulator profil={profil} aerodromeName={aerodromeCode || profil.aerodrome_id} userRole="admin" />

      {/* ═══ ROW 4 — Signalements contextuels ═══ */}
      {evenements && evenements.length > 0 && (
        <Card variant="role" title="Signalements par type d'incident" icon={<Brain className="w-4 h-4" />} size="sm">
          <div className="space-y-2">
            {(() => {
              const eventTypes = new Map<string, number>()
              for (const evt of evenements) {
                const t = (evt as any).type_incident || (evt as any).type || (evt as any).gravite || 'incident'
                eventTypes.set(t, (eventTypes.get(t) || 0) + 1)
              }
              const sorted = Array.from(eventTypes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
              return sorted.map(([type, count]) => {
                const prob = Math.min(95, Math.round((count / Math.max(1, evenements.length)) * ((profil.incident_prediction_6m ?? 0) > 0 ? profil.incident_prediction_6m! : 50)))
                return (
                  <div key={type} className={`flex items-center justify-between gap-3 p-2 rounded-lg ${prob > 50 ? 'bg-danger-soft' : prob > 30 ? 'bg-warning-soft' : 'bg-muted/20'}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${prob > 50 ? 'bg-danger' : prob > 30 ? 'bg-warning' : 'bg-primary'}`} />
                    <span className="text-xs text-foreground flex-1 capitalize">{type.toLowerCase().replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-bold ${prob > 50 ? 'text-danger' : prob > 30 ? 'text-warning' : 'text-primary'}`}>{prob}%</span>
                    <span className="text-[10px] text-foreground">({count} occ.)</span>
                  </div>
                )
              })
            })()}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Sous-composant : un point de vigilance IA ──
function ActionCard({ action }: { action: ActionConcrete }) {
  const cfg = PRIORITE_LABEL[action.priorite] || PRIORITE_LABEL.moyenne

  return (
    <div className={`rounded-xl border ${action.priorite === 'immediate' ? 'border-danger/30 bg-danger-soft' : action.priorite === 'haute' ? 'border-warning/30 bg-warning-soft' : 'border-border bg-background/30'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${action.priorite === 'immediate' ? 'bg-danger' : action.priorite === 'haute' ? 'bg-warning' : 'bg-role-primary'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{action.titre}</p>
              <span className={`badge text-[10px] ${cfg.badge}`}>{cfg.label}</span>
            </div>

            <p className="text-xs text-foreground mt-2">
              <span className="font-medium">Constat : </span>{action.constat}
            </p>

            <div className="mt-2 p-3 rounded-lg bg-background/60 border border-border/50">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Target className="w-3 h-3 text-role-primary" />
                Vérification recommandée :
              </p>
              <p className="text-xs text-foreground mt-1">{action.verification}</p>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Échéance: <span className="font-semibold">{action.echeance}</span>
              </span>
              <span className="flex items-center gap-1 text-success">
                <ArrowRight className="w-3 h-3" />
                {action.impactAttendu}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
