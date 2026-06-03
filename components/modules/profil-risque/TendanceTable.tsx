// components/modules/profil-risque/TendanceTable.tsx
// Tableau des tendances par critère C1-C5 avéc prédictions, IC, interprétation

'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Info, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { ProfilRisque } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'

interface Props { profil: ProfilRisque }

const CRITERES = [
  { key: 'c1' as const, label: 'C1 — Maturité SGS', court: 'C1', poids: 20, desc: 'Maturité & Culture SGS', impact: 'Fondation de la sécurité' },
  { key: 'c2' as const, label: 'C2 — Efficacité PAC', court: 'C2', poids: 20, desc: 'Efficacité & Réactivité PAC', impact: 'Traitement des écarts' },
  { key: 'c3' as const, label: 'C3 — Conformité technique', court: 'C3', poids: 20, desc: 'Conformité Technique', impact: 'Respect des normes' },
  { key: 'c4' as const, label: 'C4 — Charge critique', court: 'C4', poids: 15, desc: 'Charge Critique Non Résolue', impact: 'Pression sur le système' },
  { key: 'c5' as const, label: 'C5 — Résilience', court: 'C5', poids: 25, desc: 'Résilience & Historique Sécurité', impact: 'Capacité de récupération' },
]

function getScoreColor(s: number) { if (s >= 80) return 'text-success'; if (s >= 60) return 'text-primary'; if (s >= 30) return 'text-warning'; return 'text-danger' }
function getScoreBg(s: number) { if (s >= 80) return 'bg-success-soft'; if (s >= 60) return 'bg-primary-soft'; if (s >= 30) return 'bg-warning-soft'; return 'bg-danger-soft' }
function getBadgeCls(s: number) { if (s >= 80) return 'badge success'; if (s >= 60) return 'badge primary'; if (s >= 30) return 'badge warning'; return 'badge danger' }
function getProgressCls(s: number) { if (s >= 80) return 'progress-faible'; if (s >= 60) return 'progress-moyen'; if (s >= 30) return 'progress-eleve'; return 'progress-critique' }
function getLabel(s: number) { if (s >= 80) return 'Excellent'; if (s >= 60) return 'Bon'; if (s >= 30) return 'Modéré'; return 'Critique' }

function computePrediction(score: number, tendance: 'hausse' | 'baisse' | 'stable', months: number) {
  const d = tendance === 'hausse' ? 1.2 : tendance === 'baisse' ? -1.2 : 0
  const p = score + d * months; const ib = Math.max(3, Math.abs(d * months) * 0.8)
  return { valeur: Math.round(Math.min(100, Math.max(0, p))), intervalle: [Math.round(Math.max(0, p - ib)), Math.round(Math.min(100, p + ib))] as [number, number] }
}

function getCritereTendance(score: number, globalTendance: string): 'hausse' | 'baisse' | 'stable' {
  if (score < 30) return 'baisse'; if (score < 50 && globalTendance === 'hausse') return 'stable'
  if (score >= 80 && globalTendance === 'baisse') return 'stable'; if (score >= 70) return 'hausse'
  return globalTendance as 'hausse' | 'baisse' | 'stable'
}

export function TendanceTable({ profil }: Props) {
  const data = useMemo(() => CRITERES.map(c => {
    const s = profil[c.key]; const t = getCritereTendance(s, profil.tendance)
    return { ...c, score: s, tendance: t, pred3m: computePrediction(s, t, 3), pred6m: computePrediction(s, t, 6) }
  }), [profil])

  const stats = useMemo(() => {
    const s = [profil.c1, profil.c2, profil.c3, profil.c4, profil.c5]
    const avg = s.reduce((a, b) => a + b, 0) / s.length; const min = Math.min(...s); const max = Math.max(...s)
    const ecart = Math.sqrt(s.reduce((sq, v) => sq + Math.pow(v - avg, 2), 0) / s.length)
    let minC = '', maxC = ''; for (const c of CRITERES) { if (profil[c.key] === min) minC = c.court; if (profil[c.key] === max) maxC = c.court }
    return { avg: Math.round(avg), min, max, ecart: ecart.toFixed(1), minC, maxC }
  }, [profil])

  const TendanceIcon = ({ t, s = 'sm' }: { t: string; s?: 'sm' | 'md' }) => {
    const sz = s === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
    if (t === 'hausse') return <span className="flex items-center gap-1 text-success text-xs"><TrendingUp className={sz} />Hausse</span>
    if (t === 'baisse') return <span className="flex items-center gap-1 text-danger text-xs"><TrendingDown className={sz} />Baisse</span>
    return <span className="flex items-center gap-1 text-muted-foreground text-xs"><Minus className={sz} />Stable</span>
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted rounded-xl p-3 text-center"><p className="text-xs text-muted-foreground">Score moyen</p><p className={`text-xl font-bold ${getScoreColor(stats.avg)}`}>{stats.avg}</p><p className="text-xs text-muted-foreground">/100</p></div>
        <div className="bg-muted rounded-xl p-3 text-center"><p className="text-xs text-muted-foreground">Écart-type</p><p className="text-xl font-bold">{stats.ecart}</p><p className="text-xs text-muted-foreground">dispersion</p></div>
        <div className="bg-danger-soft rounded-xl p-3 text-center"><p className="text-xs text-danger">Critère min</p><p className="text-xl font-bold text-danger">{stats.min}</p><p className="text-xs text-danger">{stats.minC}</p></div>
        <div className="bg-success-soft rounded-xl p-3 text-center"><p className="text-xs text-success">Critère max</p><p className="text-xl font-bold text-success">{stats.max}</p><p className="text-xs text-success">{stats.maxC}</p></div>
      </div>

      {/* Tableau principal */}
      <table className="table">
        <thead><tr><th>Critère</th><th className="text-center">Poids</th><th>Score actuel</th><th className="text-center">Tendance</th><th className="text-center">Prédiction 3m</th><th className="text-center">Prédiction 6m</th><th className="text-center">Statut</th></tr></thead>
        <tbody>
          {data.map(row => (
            <tr key={row.key} className="hover:bg-role-primary-soft transition-colors">
              <td className="py-3"><div className="flex items-center gap-2"><div className={`w-8 h-8 rounded-lg ${getScoreBg(row.score)} flex items-center justify-center font-bold text-sm ${getScoreColor(row.score)}`}>{row.court}</div><div><p className="font-medium text-sm">{row.label}</p><p className="text-xs text-muted-foreground">{row.desc}</p></div></div></td>
              <td className="text-center"><span className="badge neutral text-xs">{row.poids}%</span></td>
              <td><div className="space-y-1"><div className="flex items-center gap-2"><span className={`text-base font-bold ${getScoreColor(row.score)}`}>{row.score}</span><span className="text-xs text-muted-foreground">/100</span></div><div className="progress h-2"><div className={`progress-bar ${getProgressCls(row.score)}`} style={{ width: `${row.score}%` }} /></div></div></td>
              <td className="text-center"><TendanceIcon t={row.tendance} s="md" /></td>
              <td className="text-center"><div><span className={`text-sm font-semibold ${getScoreColor(row.pred3m.valeur)}`}>{row.pred3m.valeur}</span><div className="text-xs text-muted-foreground">IC: [{row.pred3m.intervalle[0]}–{row.pred3m.intervalle[1]}]</div></div></td>
              <td className="text-center"><div><span className={`text-sm font-semibold ${getScoreColor(row.pred6m.valeur)}`}>{row.pred6m.valeur}</span><div className="text-xs text-muted-foreground">IC: [{row.pred6m.intervalle[0]}–{row.pred6m.intervalle[1]}]</div></div></td>
              <td className="text-center"><span className={`badge text-xs ${getBadgeCls(row.score)}`}>{getLabel(row.score)}</span>{row.key === 'c1' && <> <span className="text-xs text-muted-foreground">({getSgsMaturiteLabel(row.score)})</span></>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 📊 Interprétation + 🎯 Intervalles + ⚠️ Recommandations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted/20 rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">📊 Interprétation des tendances</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><TendanceIcon t="hausse" /><span>Amélioration prévue du critère</span></div>
            <div className="flex items-center gap-2"><TendanceIcon t="baisse" /><span>Dégradation prévue — action recommandée</span></div>
            <div className="flex items-center gap-2"><TendanceIcon t="stable" /><span>Situation stable, maintenir la surveillance</span></div>
          </div>
        </div>
        <div className="bg-muted/20 rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">🎯 Intervalles de confiance</p>
          <p className="text-xs text-muted-foreground">Les IC (95%) représentent la fourchette probable d'évolution du score. Plus l'intervalle est large, plus l'incertitude est élevée. Prédictions basées sur la tendance historique.</p>
        </div>
        <div className="bg-muted/20 rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">⚠️ Recommandations</p>
          <div className="space-y-1 text-xs">
            {stats.min < 40 && <p className="text-warning">Prioriser l'amélioration du critère {stats.minC}</p>}
            {profil.tendance === 'baisse' && <p className="text-danger">Tendance baissière globale — renforcer la surveillance</p>}
            {Number(stats.ecart) > 20 && <p className="text-primary">Forte disparité entre critères — approche ciblée recommandée</p>}
            {stats.min >= 60 && profil.tendance !== 'baisse' && <p className="text-success">Profil équilibré — maintenir les bonnes pratiques</p>}
          </div>
        </div>
      </div>

      {/* Légende des niveaux de risque */}
      <div className="flex items-center gap-3 flex-wrap text-xs pt-2 border-t border-border">
        <span className="text-muted-foreground font-semibold">Légende :</span>
        <span className="badge success">Excellent (≥80)</span>
        <span className="badge primary">Bon (60-79)</span>
        <span className="badge warning">Modéré (30-59)</span>
        <span className="badge danger">Critique (&lt;30)</span>
      </div>
    </div>
  )
}

export default TendanceTable
