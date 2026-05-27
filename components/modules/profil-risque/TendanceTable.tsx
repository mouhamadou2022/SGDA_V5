// components/modules/profil-risque/TendanceTable.tsx
// Tableau des tendances par critère C1-C5 avec prédictions et intervalles de confiance
// 0 shadcn/ui — classes du design system uniquement

'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Info, AlertTriangle, CheckCircle } from 'lucide-react'
import { ProfilRisque } from '@/lib/store'

interface TendanceTableProps {
  profil: ProfilRisque
}

interface CritereInfo {
  key: keyof Pick<ProfilRisque, 'c1' | 'c2' | 'c3' | 'c4' | 'c5'>
  label: string
  labelCourt: string
  poids: number
  description: string
  impact: string
}

const CRITERES: CritereInfo[] = [
  { key: 'c1', label: 'C1 — Maturité SGS', labelCourt: 'C1', poids: 20, description: 'Maturité & Culture SGS', impact: 'Fondation de la sécurité' },
  { key: 'c2', label: 'C2 — Efficacité PAC', labelCourt: 'C2', poids: 25, description: 'Efficacité & Réactivité PAC', impact: 'Traitement des écarts' },
  { key: 'c3', label: 'C3 — Conformité', labelCourt: 'C3', poids: 20, description: 'Conformité Technique', impact: 'Respect des normes' },
  { key: 'c4', label: 'C4 — Charge Critique', labelCourt: 'C4', poids: 20, description: 'Charge Critique Non Résolue', impact: 'Pression sur système' },
  { key: 'c5', label: 'C5 — Résilience', labelCourt: 'C5', poids: 15, description: 'Résilience & Historique Sécurité', impact: 'Capacité de récupération' },
]

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-primary'
  if (score >= 30) return 'text-warning'
  return 'text-danger'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-success-soft'
  if (score >= 60) return 'bg-primary-soft'
  if (score >= 30) return 'bg-warning-soft'
  return 'bg-danger-soft'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Faible'
  if (score >= 60) return 'Moyen'
  if (score >= 30) return 'Élevé'
  return 'Critique'
}

function getBadgeClass(score: number): string {
  if (score >= 80) return 'badge success'
  if (score >= 60) return 'badge primary'
  if (score >= 30) return 'badge warning'
  return 'badge danger'
}

function getProgressClass(score: number): string {
  if (score >= 80) return 'progress-faible'
  if (score >= 60) return 'progress-moyen'
  if (score >= 30) return 'progress-eleve'
  return 'progress-critique'
}

function getCritereTendance(
  score: number,
  globalTendance: ProfilRisque['tendance'],
  historique?: number[]
): 'hausse' | 'baisse' | 'stable' {
  if (historique && historique.length >= 3) {
    const recent = historique.slice(-3)
    const moyenne = recent.reduce((a, b) => a + b, 0) / recent.length
    const derniere = recent[recent.length - 1]
    if (derniere > moyenne + 2) return 'hausse'
    if (derniere < moyenne - 2) return 'baisse'
  }

  if (score < 30) return 'baisse'
  if (score < 50 && globalTendance === 'hausse') return 'stable'
  if (score >= 80 && globalTendance === 'baisse') return 'stable'
  if (score >= 70) return 'hausse'
  return globalTendance
}

function computeCriterePrediction(
  score: number,
  tendance: 'hausse' | 'baisse' | 'stable',
  months: number
): { valeur: number; intervalle: [number, number] } {
  const deltaMensuel = tendance === 'hausse' ? 1.2 : tendance === 'baisse' ? -1.2 : 0
  const prediction = score + deltaMensuel * months
  const intervalleBase = Math.max(3, Math.abs(deltaMensuel * months) * 0.8)

  return {
    valeur: Math.min(100, Math.max(0, Math.round(prediction))),
    intervalle: [
      Math.min(100, Math.max(0, Math.round(prediction - intervalleBase))),
      Math.min(100, Math.max(0, Math.round(prediction + intervalleBase)))
    ]
  }
}

function TendanceIcon({ tendance, size = 'sm' }: { tendance: 'hausse' | 'baisse' | 'stable'; size?: 'sm' | 'md' }) {
  const iconSize = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'

  if (tendance === 'hausse') {
    return (
      <span className="flex items-center gap-1 text-success text-xs font-medium">
        <TrendingUp className={iconSize} />
        <span className={size === 'md' ? 'text-sm' : 'text-xs'}>Hausse</span>
      </span>
    )
  }
  if (tendance === 'baisse') {
    return (
      <span className="flex items-center gap-1 text-danger text-xs font-medium animate-pulse">
        <TrendingDown className={iconSize} />
        <span className={size === 'md' ? 'text-sm' : 'text-xs'}>Baisse</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs font-medium">
      <Minus className={iconSize} />
      <span className={size === 'md' ? 'text-sm' : 'text-xs'}>Stable</span>
    </span>
  )
}

function ImpactIcon({ score, impact }: { score: number; impact: string }) {
  if (score >= 70) {
    return (
      <span title={`Impact: ${impact}`} className="cursor-help">
        <CheckCircle className="w-3.5 h-3.5 text-success" />
      </span>
    )
  }
  if (score >= 40) {
    return (
      <span title={`Impact: ${impact}`} className="cursor-help">
        <Info className="w-3.5 h-3.5 text-primary" />
      </span>
    )
  }
  return (
    <span title={`Impact: ${impact}`} className="cursor-help">
      <AlertTriangle className="w-3.5 h-3.5 text-warning" />
    </span>
  )
}

export function TendanceTable({ profil }: TendanceTableProps) {
  const memoizedData = useMemo(() => {
    return CRITERES.map((c) => {
      const score = profil[c.key]
      const scoreColor = getScoreColor(score)
      const scoreBg = getScoreBg(score)
      const badgeClass = getBadgeClass(score)
      const progressClass = getProgressClass(score)
      const tendanceCritere = getCritereTendance(score, profil.tendance)
      const pred3m = computeCriterePrediction(score, tendanceCritere, 3)
      const pred6m = computeCriterePrediction(score, tendanceCritere, 6)
      const statusLabel = getScoreLabel(score)

      return {
        ...c,
        score,
        scoreColor,
        scoreBg,
        badgeClass,
        progressClass,
        tendanceCritere,
        pred3m,
        pred6m,
        statusLabel
      }
    })
  }, [profil])

  const statsGlobal = useMemo(() => {
    const scores = [profil.c1, profil.c2, profil.c3, profil.c4, profil.c5]
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const ecartType = Math.sqrt(scores.reduce((sq, v) => sq + Math.pow(v - avg, 2), 0) / scores.length)

    let minCritere = ''
    let maxCritere = ''
    for (const c of CRITERES) {
      if (profil[c.key] === min) minCritere = c.labelCourt
      if (profil[c.key] === max) maxCritere = c.labelCourt
    }

    return { min, max, avg, ecartType, minCritere, maxCritere }
  }, [profil])

  return (
    <div className="space-y-4">
      {/* Cartes récapitulatives */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Score moyen</p>
          <p className={`text-xl font-bold ${getScoreColor(Math.round(statsGlobal.avg))}`}>
            {Math.round(statsGlobal.avg)}
          </p>
          <p className="text-[10px] text-muted-foreground">/100</p>
        </div>
        <div className="bg-muted rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Écart-type</p>
          <p className="text-xl font-bold text-foreground">{statsGlobal.ecartType.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">dispersion</p>
        </div>
        <div className="bg-danger-soft rounded-xl p-3 text-center">
          <p className="text-xs text-danger">Critère min</p>
          <p className="text-xl font-bold text-danger">{statsGlobal.min}</p>
          <p className="text-[10px] text-danger">{statsGlobal.minCritere}</p>
        </div>
        <div className="bg-success-soft rounded-xl p-3 text-center">
          <p className="text-xs text-success">Critère max</p>
          <p className="text-xl font-bold text-success">{statsGlobal.max}</p>
          <p className="text-[10px] text-success">{statsGlobal.maxCritere}</p>
        </div>
      </div>

      {/* Tableau principal */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th className="w-[180px]">Critère</th>
              <th className="w-[60px] text-center">Poids</th>
              <th className="w-[200px]">Score actuel</th>
              <th className="w-[100px] text-center">Tendance</th>
              <th className="w-[130px] text-center">Prédiction 3m</th>
              <th className="w-[130px] text-center">Prédiction 6m</th>
              <th className="w-[100px] text-center">Statut</th>
            </tr>
          </thead>
          <tbody>
            {memoizedData.map((row) => (
              <tr key={row.key} className="group hover:bg-role-primary-soft transition-colors">
                {/* Critère */}
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg ${row.scoreBg} flex items-center justify-center font-bold text-sm ${row.scoreColor}`}>
                      {row.labelCourt}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{row.label}</p>
                      <div className="flex items-center gap-1">
                        <p className="text-xs text-muted-foreground">{row.description}</p>
                        <ImpactIcon score={row.score} impact={row.impact} />
                      </div>
                    </div>
                  </div>
                </td>

                {/* Poids */}
                <td className="text-center">
                  <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {row.poids}%
                  </span>
                </td>

                {/* Score actuel */}
                <td>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold ${row.scoreColor}`}>{row.score}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                    <div className="progress h-2">
                      <div className={`progress-bar ${row.progressClass}`} style={{ width: `${row.score}%` }} />
                    </div>
                  </div>
                </td>

                {/* Tendance */}
                <td className="text-center">
                  <TendanceIcon tendance={row.tendanceCritere} size="md" />
                </td>

                {/* Prédiction 3m */}
                <td className="text-center">
                  <div className="space-y-0.5">
                    <span className={`text-sm font-semibold ${getScoreColor(row.pred3m.valeur)}`}>
                      {row.pred3m.valeur}
                    </span>
                    <div className="text-[10px] text-muted-foreground">
                      IC: [{row.pred3m.intervalle[0]}–{row.pred3m.intervalle[1]}]
                    </div>
                  </div>
                </td>

                {/* Prédiction 6m */}
                <td className="text-center">
                  <div className="space-y-0.5">
                    <span className={`text-sm font-semibold ${getScoreColor(row.pred6m.valeur)}`}>
                      {row.pred6m.valeur}
                    </span>
                    <div className="text-[10px] text-muted-foreground">
                      IC: [{row.pred6m.intervalle[0]}–{row.pred6m.intervalle[1]}]
                    </div>
                  </div>
                </td>

                {/* Statut */}
                <td className="text-center">
                  <span className={`${row.badgeClass} text-xs`}>
                    {row.statusLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Légende et interprétation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="bg-muted rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">📊 Interprétation des tendances</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <TendanceIcon tendance="hausse" size="sm" />
              <span>Amélioration prévue du critère</span>
            </div>
            <div className="flex items-center gap-2">
              <TendanceIcon tendance="baisse" size="sm" />
              <span>Dégradation prévue - action recommandée</span>
            </div>
            <div className="flex items-center gap-2">
              <TendanceIcon tendance="stable" size="sm" />
              <span>Situation stable, maintenir la surveillance</span>
            </div>
          </div>
        </div>

        <div className="bg-muted rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">🎯 Intervalles de confiance</p>
          <p className="text-xs text-muted-foreground">
            Les intervalles IC (95%) représentent la fourchette probable d'évolution du score.
            Plus l'intervalle est large, plus l'incertitude est élevée.
          </p>
        </div>

        <div className="bg-muted rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">⚠️ Recommandations</p>
          <div className="space-y-1 text-xs">
            {statsGlobal.min < 40 && (
              <p className="text-warning">Prioriser l'amélioration du critère {statsGlobal.minCritere}</p>
            )}
            {profil.tendance === 'baisse' && (
              <p className="text-danger">Tendance baissière globale - renforcer la surveillance</p>
            )}
            {statsGlobal.ecartType > 20 && (
              <p className="text-primary">Forte disparité entre critères - approche ciblée recommandée</p>
            )}
            {statsGlobal.min >= 60 && profil.tendance !== 'baisse' && (
              <p className="text-success">Profil équilibré - maintenir les bonnes pratiques</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TendanceTable
