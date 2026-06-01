// components/cards/RiskCard.tsx — Card profil de risque partagée
// Accepte ProfilRisque du store, utilisable par dashboard et RisqueModule

'use client'

import { ProfilRisque } from '@/lib/store'
import { TrendingUp, TrendingDown, Minus, Activity, Eye, Brain } from 'lucide-react'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName?: string
  nbEcartsCritiques?: number
  onView?: () => void
  compact?: boolean
}

export function RiskCard({ profil, aerodromeCode, aerodromeName, nbEcartsCritiques = 0, onView, compact = false }: Props) {
  const score = profil.score_global
  const getScoreClr = (s: number) => s >= 80 ? 'text-success' : s >= 60 ? 'text-primary' : s >= 30 ? 'text-warning' : 'text-danger'
  const getNiveauBadge = () => {
    if (score >= 80) return 'badge success'
    if (score >= 60) return 'badge primary'
    if (score >= 30) return 'badge warning'
    return 'badge danger'
  }
  const getBorderClr = () => {
    if (score >= 80) return 'border-l-success'
    if (score >= 60) return 'border-l-primary'
    if (score >= 30) return 'border-l-warning'
    return 'border-l-danger'
  }

  const tendance = profil.tendance || 'stable'
  const TendanceIcon = tendance === 'hausse' ? TrendingUp : tendance === 'baisse' ? TrendingDown : Minus
  const tendanceClr = tendance === 'hausse' ? 'text-success' : tendance === 'baisse' ? 'text-danger' : 'text-muted-foreground'
  const tendanceLabel = tendance === 'hausse' ? 'Amélioration' : tendance === 'baisse' ? 'Dégradation' : 'Stable'

  const criteres = [
    { k: 'c1' as const, label: 'SGS', full: 'Maturité SGS', isMaturite: true },
    { k: 'c2' as const, label: 'PAC', full: 'Efficacité PAC' },
    { k: 'c3' as const, label: 'Conform.', full: 'Conformité technique' },
    { k: 'c4' as const, label: 'Charge', full: 'Charge critique' },
    { k: 'c5' as const, label: 'Résil.', full: 'Résilience' },
  ]

  function getMaturiteLevel(score: number): string {
    if (score >= 80) return 'N5 Efficace'
    if (score >= 60) return 'N4 Opérationnel'
    if (score >= 40) return 'N3 Approprié'
    if (score >= 20) return 'N2 Présent'
    return 'N1 Absent'
  }

  if (compact) return (
    <div className={`card p-3 hover:shadow-md transition-shadow cursor-pointer border-l-4 ${getBorderClr()}`} onClick={onView}>
      <div className="flex items-center justify-between mb-1">
        <span className="code-oaci-badge text-xs">{aerodromeCode}</span>
        <div className="flex items-center gap-1">
          <TendanceIcon className={`w-3 h-3 ${tendanceClr}`} />
          <span className={getNiveauBadge()}>{profil.niveau}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Score</span>
        <span className={`font-bold ${getScoreClr(score)}`}>{score}/100</span>
      </div>
      <div className="progress h-1.5 mt-1"><div className="progress-bar" style={{ width: `${score}%` }} /></div>
    </div>
  )

  return (
    <div className={`card hover:shadow-lg transition-shadow cursor-pointer border-l-4 ${getBorderClr()}`} onClick={onView}>
      <div className="card-header border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-9 h-9 rounded-lg bg-role-primary-soft flex items-center justify-center">
            <Activity className="w-5 h-5 text-role-primary" />
          </div>
          <span className="code-oaci-badge text-sm">{aerodromeCode}</span>
          {aerodromeName && <span className="font-semibold text-sm truncate max-w-[140px]">{aerodromeName}</span>}
          <span className={`badge text-xs ml-auto ${getNiveauBadge()}`}>{profil.niveau}</span>
        </div>
      </div>

      <div className="card-content p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Score global</p>
            <span className={`text-2xl font-bold ${getScoreClr(score)}`}>{score}/100</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Tendance</p>
            <span className="flex items-center gap-1 text-xs">
              <TendanceIcon className={`w-3.5 h-3.5 ${tendanceClr}`} />
              <span className={tendanceClr}>{tendanceLabel}</span>
            </span>
          </div>
        </div>

        {/* C1-C5 mini radar */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Critères C1-C5</p>
          <div className="grid grid-cols-5 gap-1">
            {criteres.map(({ k, label, isMaturite }) => {
              const v = (profil as any)[k] as number
              const cls = v < 40 ? 'bg-danger' : v < 60 ? 'bg-warning' : 'bg-success'
              const clrTxt = v < 40 ? 'text-danger' : v < 60 ? 'text-warning' : 'text-success'
              return (
                <div key={k} className="text-center" title={criteres.find(c => c.k === k)?.full}>
                  <span className="text-[9px] text-muted-foreground block mb-0.5">{label}</span>
                  <div className="w-full bg-muted/30 rounded-full h-1.5 mb-0.5">
                    <div className={`h-1.5 rounded-full ${cls}`} style={{ width: `${v}%` }} />
                  </div>
                  <span className={`text-[9px] font-bold ${clrTxt}`}>
                    {isMaturite ? getMaturiteLevel(v) : v}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Prédictions */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-role-primary-soft/20 rounded-md p-2">
          <div><p className="text-muted-foreground">Prédiction 3 mois</p><p className={`font-semibold ${getScoreClr(profil.prediction_3m)}`}>{profil.prediction_3m}/100</p></div>
          <div><p className="text-muted-foreground">Prédiction 6 mois</p><p className={`font-semibold ${getScoreClr(profil.prediction_6m)}`}>{profil.prediction_6m}/100</p></div>
        </div>

        {/* Indicateurs */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {profil.hmm_state?.isTransitioning && <span className="badge danger animate-pulse">Transition HMM</span>}
          {profil.bayesian_black_swan && <span className="badge danger">Black Swan</span>}
          {profil.survival_metrics && profil.survival_metrics.hazard90d > 0.5 && <span className="badge warning">Risque 90j {Math.round(profil.survival_metrics.hazard90d * 100)}%</span>}
          {nbEcartsCritiques > 0 && <span className="badge danger">{nbEcartsCritiques} écarts critiques</span>}
        </div>
      </div>

      <div className="card-footer border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">MAJ: {profil.computed_at ? new Date(profil.computed_at).toLocaleDateString('fr-FR') : 'N/A'}</span>
        <div className="flex gap-1">
          {profil.hmm_state && (
            <span className={`text-xs flex items-center gap-1 ${profil.hmm_state.currentStateName === 'critique' ? 'text-danger' : profil.hmm_state.currentStateName === 'dégradation' ? 'text-warning' : 'text-success'}`}>
              <Brain className="w-3 h-3" />{profil.hmm_state.currentStateName}
            </span>
          )}
          {onView && <button className="action-button hover:text-role-primary" onClick={e => { e.stopPropagation(); onView() }} title="Voir détails"><Eye className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  )
}
