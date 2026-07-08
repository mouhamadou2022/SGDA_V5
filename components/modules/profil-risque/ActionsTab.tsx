// components/modules/profil-risque/ActionsTab.tsx
// Plan d'action inspecteur : checklist generee par IA (Groq) à partir des donnees brutes du profil
// Aucune regle hardcodee — chaque action est analysee et formulee par le LLM
// Thompson Sampling conserve (unique à cet onglet)

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import type { ActionConcrete } from '@/lib/risque/recommendations'
import {
  CheckCircle2, RefreshCw, Download, Brain,
  Clock, Target, ListChecks, Circle, CheckCircle,
  BarChart3, AlertCircle,
} from 'lucide-react'
import { FeedbackSection } from './FeedbackSection'
import { CalibrationPanel } from './CalibrationPanel'

interface ActionsTabProps {
  profil: ProfilRisque
  aerodromeId: string
  aerodromeCode?: string
  userRole: string
  onRecalculate: () => void
}

type ActionStatus = 'a_faire' | 'en_cours' | 'traite' | 'verifie'
type FilterMode = 'all' | 'a_faire' | 'en_cours' | 'traite' | 'verifie'

const STATUT_LABEL: Record<ActionStatus, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  traite: 'Traité',
  verifie: 'Vérifié',
}

const PRIORITE_CONFIG: Record<string, {
  label: string
  badge: string
  levelColor: 'danger' | 'warning' | 'primary' | 'neutral'
  dot: string
}> = {
  immediate: { label: 'Immédiat', badge: 'badge danger', levelColor: 'danger', dot: 'bg-danger' },
  haute: { label: 'Haute', badge: 'badge warning', levelColor: 'warning', dot: 'bg-warning' },
  moyenne: { label: 'Moyenne', badge: 'badge primary', levelColor: 'primary', dot: 'bg-role-primary' },
  basse: { label: 'Basse', badge: 'badge neutral', levelColor: 'neutral', dot: 'bg-foreground/40' },
}

function nextStatus(s: ActionStatus): ActionStatus {
  const cycle: ActionStatus[] = ['a_faire', 'en_cours', 'traite', 'verifie']
  return cycle[(cycle.indexOf(s) + 1) % cycle.length]
}

export function ActionsTab({
  profil,
  aerodromeId: _aerodromeId,
  aerodromeCode,
  userRole,
  onRecalculate,
}: ActionsTabProps) {
  const [loading, setLoading] = useState(false)
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  const [actions, setActions] = useState<ActionConcrete[]>([])
  const [iaLoading, setIaLoading] = useState(true)
  const [iaError, setIaError] = useState(false)
  const tsMetrics = profil.ts_metrics

  const [statusMap, setStatusMap] = useState<Record<number, ActionStatus>>({})

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

  const actionStatus = (i: number): ActionStatus => statusMap[i] || 'a_faire'

  const toggleStatus = (i: number) => {
    setStatusMap(prev => ({ ...prev, [i]: nextStatus(prev[i] || 'a_faire') }))
  }

  const visible = useMemo(() => {
    if (filterMode === 'all') return actions
    return actions.filter((_, i) => actionStatus(i) === filterMode)
  }, [actions, filterMode, statusMap])

  const counts = useMemo(() => {
    const c = { total: actions.length, a_faire: 0, en_cours: 0, traite: 0, verifie: 0 }
    actions.forEach((_, i) => { c[actionStatus(i)]++ })
    return c
  }, [actions, statusMap])

  const pctComplete = actions.length > 0
    ? Math.round(((counts.traite + counts.verifie) / counts.total) * 100)
    : 0

  const handleRecalculate = async () => {
    setLoading(true)
    try {
      onRecalculate()
    } finally {
      setTimeout(() => setLoading(false), 800)
    }
  }

  const codeExport = aerodromeCode || profil.aerodrome_id

  const handleExportReport = () => {
    const lines: string[] = []
    lines.push(`RAPPORT PLAN D'ACTION — SGDA V5`)
    lines.push(`Aérodrome: ${codeExport}`)
    lines.push(`Date: ${profil.computed_at ? new Date(profil.computed_at).toLocaleDateString('fr-FR') : 'N/A'}`)
    lines.push(`Score: ${profil.score_global}/100 — ${profil.niveau || ''}`)
    lines.push(``)
    actions.forEach((a, i) => {
      const s = actionStatus(i)
      lines.push(`[${STATUT_LABEL[s].toUpperCase()}] ${a.titre}`)
      lines.push(`  → ${a.constat}`)
      lines.push(`  → ${a.verification}`)
      lines.push(`  Échéance: ${a.echeance} | Impact: ${a.impactAttendu}`)
      lines.push(``)
    })
    if (tsMetrics) lines.push(`Action Thompson Sampling: ${tsMetrics.recommendedAction} (${tsMetrics.bestProbability}%)`)
    lines.push(``)
    lines.push(`--- Généré par SGDA V5 ---`)
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `SGDA_PlanAction_${codeExport}_${new Date().toISOString().split('T')[0]}.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8 animate-fade-up" data-module="actions-tab">

      {/* Thompson Sampling — unique à cet onglet */}
      {tsMetrics && (
        <Card variant="role" title="IA — Thompson Sampling" icon={<Brain className="w-4 h-4" />}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-role-primary-soft flex items-center justify-center flex-shrink-0">
              <Brain className="w-6 h-6 text-role-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge primary">IA — Thompson Sampling</span>
                <span className="text-xs text-foreground">
                  Confiance: <strong className="text-role-primary">{tsMetrics.bestProbability}%</strong>
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground mt-2">
                Action recommandee: {tsMetrics.recommendedAction}
              </p>
              <p className="text-xs text-foreground mt-1">
                Selectionnee par echantillonnage de Thompson, optimisant le compromis exploration/exploitation parmi les actions disponibles.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Plan d'action — checklist inspecteur */}
      <Card
        title="Plan d'action — inspecteur"
        subtitle={iaLoading ? 'Génération IA en cours...' : undefined}
        icon={iaLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
        variant="level"
        levelColor={
          iaError ? 'none' :
          iaLoading ? 'none' :
          actions.some((_, i) => actionStatus(i) === 'a_faire' && actions[i].priorite === 'immediate')
            ? 'danger'
            : actions.some((_, i) => actionStatus(i) === 'a_faire')
            ? 'warning'
            : 'primary'
        }
      >
        {iaLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 rounded-full border-2 border-role-primary border-t-transparent animate-spin" />
            <p className="text-sm text-foreground">Analyse des données profil en cours par IA...</p>
            <p className="text-xs text-foreground">Génération des actions de vérification personnalisées</p>
          </div>
        ) : iaError ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="w-10 h-10 text-warning" />
            <p className="text-sm text-foreground">Service IA momentanément indisponible</p>
            <p className="text-xs text-foreground text-center max-w-md">Les actions de vérification n'ont pas pu être générées automatiquement. Vérifiez que la clé API Groq est configurée.</p>
            <button onClick={fetchActions} className="btn btn-sm btn-primary gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </button>
          </div>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
            <p className="text-sm text-foreground">Aucune action requise — l'IA n'a identifié aucun signal necessitant une verification.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-4 h-4 text-foreground" />
              <div className="progress flex-1 h-2">
                <div className="progress-bar" style={{ width: `${pctComplete}%` }} />
              </div>
              <span className="text-xs text-foreground font-mono">{counts.traite + counts.verifie}/{counts.total} ({pctComplete}%)</span>
            </div>
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              {(['all', 'a_faire', 'en_cours', 'traite', 'verifie'] as const).map(f => {
                const label = f === 'all' ? 'Tous' : STATUT_LABEL[f]
                const c = f === 'all' ? counts.total : counts[f]
                return (
                  <button key={f} onClick={() => setFilterMode(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      filterMode === f
                        ? 'bg-role-primary-soft text-role-primary'
                        : 'text-foreground hover:bg-muted/20'
                    }`}>
                    {label} {c > 0 && <span className="font-mono ml-0.5">({c})</span>}
                  </button>
                )
              })}
            </div>
            <div className="space-y-3">
              {visible.map((a, i) => {
                const s = actionStatus(i)
                const cfg = PRIORITE_CONFIG[a.priorite] || PRIORITE_CONFIG.moyenne
                const estTermine = s === 'traite' || s === 'verifie'
                return (
                  <div key={`${a.titre}-${i}`}
                    className={`rounded-xl border transition-all ${
                      estTermine ? 'border-success/30 bg-success-soft/10' : cfg.levelColor === 'danger' ? 'border-danger/20 bg-danger-soft/5' : 'border-border bg-background/30'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleStatus(i)}
                          className="mt-0.5 shrink-0 focus:outline-none"
                          title={`Marquer comme ${STATUT_LABEL[nextStatus(s)]}`}
                        >
                          {s === 'a_faire' && <Circle className="w-5 h-5 text-foreground/40 hover:text-role-primary transition-colors" />}
                          {s === 'en_cours' && <div className="w-5 h-5 rounded-full border-2 border-warning flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-full bg-warning" /></div>}
                          {s === 'traite' && <CheckCircle className="w-5 h-5 text-success" />}
                          {s === 'verifie' && <CheckCircle2 className="w-5 h-5 text-role-primary" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${estTermine ? 'text-success line-through decoration-1' : 'text-foreground'}`}>
                              {a.titre}
                            </span>
                            <span className={`badge text-[10px] ${cfg.badge}`}>{cfg.label}</span>
                            <span className={`badge text-[10px] ${s === 'verifie' ? 'success' : s === 'traite' ? 'success' : s === 'en_cours' ? 'warning' : 'neutral'}`}>
                              {STATUT_LABEL[s]}
                            </span>
                          </div>
                          <p className="text-xs text-foreground mt-2">
                            <span className="font-medium">Constat : </span>{a.constat}
                          </p>
                          <div className="mt-2 p-3 rounded-lg bg-background/60 border border-border/50">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                              <Target className="w-3 h-3 text-role-primary" />
                              Verification recommandee :
                            </p>
                            <p className="text-xs text-foreground mt-1">{a.verification}</p>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Echeance: <span className="font-semibold">{a.echeance}</span>
                            </span>
                            <span className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="w-3 h-3" />
                              {a.impactAttendu}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {/* Barre d'actions */}
      <div className="flex items-center gap-3 flex-wrap pt-2">
        <FeedbackSection aerodromeId={profil.aerodrome_id} userRole={userRole} predictedScore={profil.score_global} />
        <button onClick={handleRecalculate} disabled={loading} className="btn btn-primary gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Recalcul en cours...' : 'Recalculer le profil'}
        </button>
        <button className="btn btn-secondary gap-2" onClick={handleExportReport}>
          <Download className="w-4 h-4" />
          Exporter le plan d'action
        </button>
        {userRole === 'admin' && (
          <button className="btn btn-outline gap-2" onClick={() => setCalibrationOpen(v => !v)}>
            <Brain className="w-4 h-4" />
            Calibration des modeles
          </button>
        )}
      </div>

      {calibrationOpen && (
        <CalibrationPanel aerodromeId={profil.aerodrome_id} onClose={() => setCalibrationOpen(false)} />
      )}

    </div>
  )
}

export default ActionsTab
