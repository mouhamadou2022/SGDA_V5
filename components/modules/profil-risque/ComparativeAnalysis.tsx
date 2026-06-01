// components/modules/profil-risque/ComparativeAnalysis.tsx
// Analyse comparative — benchmarking entre aérodromes
// Classes CSS existantes uniquement

'use client'

import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Minus, Medal, Crown, Eye, Plane, Target } from 'lucide-react'
import { useAppStore, ProfilRisque, Aerodrome } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }

interface Props { onSelectAerodrome?: (id: string) => void }

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-success'; if (score >= 60) return 'text-primary'
  if (score >= 30) return 'text-warning'; return 'text-danger'
}

function getRankMedal(rank: number): { icon: React.ElementType; color: string } {
  if (rank === 1) return { icon: Crown, color: 'text-yellow-500' }
  if (rank === 2) return { icon: Medal, color: 'text-gray-400' }
  if (rank === 3) return { icon: Medal, color: 'text-amber-600' }
  return { icon: Target, color: 'text-muted-foreground' }
}

export function ComparativeAnalysis({ onSelectAerodrome }: Props) {
  const [sortBy, setSortBy] = useState<'score' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'>('score')
  const [filterRegion, setFilterRegion] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const aerodromes = useAppStore(s => s.aerodromes)
  const profilsRisque = useAppStore(s => s.profilsRisque)

  const aerodromesWithProfil = useMemo(() => {
    const list = aerodromes
      .filter(a => !a.deleted_at)
      .map(a => ({ aerodrome: a, profil: profilsRisque[a.id] || null }))
      .filter(e => e.profil) as { aerodrome: Aerodrome; profil: ProfilRisque }[]

    let filtered = filterRegion === 'all' ? list : list.filter(e => e.aerodrome.region === filterRegion)

    const sortFn: Record<string, (a: any, b: any) => number> = {
      score: (a, b) => b.profil.score_global - a.profil.score_global,
      c1: (a, b) => b.profil.c1 - a.profil.c1, c2: (a, b) => b.profil.c2 - a.profil.c2,
      c3: (a, b) => b.profil.c3 - a.profil.c3, c4: (a, b) => b.profil.c4 - a.profil.c4,
      c5: (a, b) => b.profil.c5 - a.profil.c5,
    }
    return filtered.sort(sortFn[sortBy] || sortFn.score)
  }, [aerodromes, profilsRisque, sortBy, filterRegion])

  const stats = useMemo(() => {
    const scores = aerodromesWithProfil.map(e => e.profil.score_global)
    if (!scores.length) return null
    const moy = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    return {
      moyenne: moy, min: Math.min(...scores), max: Math.max(...scores),
      ecartType: Math.sqrt(scores.reduce((s, v) => s + Math.pow(v - moy, 2), 0) / scores.length).toFixed(1),
      excellent: scores.filter(s => s >= 80).length, bon: scores.filter(s => s >= 60 && s < 80).length,
      modere: scores.filter(s => s >= 30 && s < 60).length, critique: scores.filter(s => s < 30).length,
      total: scores.length,
    }
  }, [aerodromesWithProfil])

  const regions = useMemo(() => [...new Set(aerodromes.map(a => a.region).filter(Boolean))], [aerodromes])

  return (
    <div className="card border-l-4 border-l-role-primary">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="card-title flex items-center gap-2"><BarChart3 className="w-5 h-5 text-role-primary" />Analyse comparative</div>
            <p className="text-xs text-muted-foreground mt-0.5">Benchmarking entre aérodromes</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className={`form-select w-36 text-xs ${focusClass}`} style={selectStyle}>
              <option value="all">Toutes régions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className={`form-select w-32 text-xs ${focusClass}`} style={selectStyle}>
              <option value="score">Score global</option>
              <option value="c1">C1</option><option value="c2">C2</option><option value="c3">C3</option>
              <option value="c4">C4</option><option value="c5">C5</option>
            </select>
            <button type="button" className="action-button w-8 h-8 p-0" onClick={() => setViewMode(m => m === 'list' ? 'grid' : 'list')}>
              {viewMode === 'list' ? <Eye className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="card-content space-y-5">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            <div className="bg-muted/20 rounded-xl p-2 text-center"><p className="text-xs text-muted-foreground">Moyenne</p><p className={`text-lg font-bold ${getScoreColor(stats.moyenne)}`}>{stats.moyenne}</p></div>
            <div className="bg-muted/20 rounded-xl p-2 text-center"><p className="text-xs text-muted-foreground">Min/Max</p><p className="text-sm font-bold">{stats.min}/{stats.max}</p></div>
            <div className="bg-muted/20 rounded-xl p-2 text-center"><p className="text-xs text-muted-foreground">Écart-type</p><p className="text-sm font-bold">{stats.ecartType}</p></div>
            <div className="bg-success-soft rounded-xl p-2 text-center"><p className="text-xs text-success">Excellent</p><p className="text-lg font-bold text-success">{stats.excellent}</p></div>
            <div className="bg-primary-soft rounded-xl p-2 text-center"><p className="text-xs text-primary">Bon</p><p className="text-lg font-bold text-primary">{stats.bon}</p></div>
            <div className="bg-warning-soft rounded-xl p-2 text-center"><p className="text-xs text-warning">Modéré</p><p className="text-lg font-bold text-warning">{stats.modere}</p></div>
            <div className="bg-danger-soft rounded-xl p-2 text-center"><p className="text-xs text-danger">Critique</p><p className="text-lg font-bold text-danger">{stats.critique}</p></div>
          </div>
        )}

        {viewMode === 'list' ? (
          <table className="table">
            <thead><tr><th>#</th><th>Aérodrome</th><th>Score</th><th>Tendance</th><th>C1</th><th>C2</th><th>C3</th><th>C4</th><th>C5</th><th></th></tr></thead>
            <tbody>
              {aerodromesWithProfil.map(({ aerodrome, profil }, idx) => {
                const rank = idx + 1
                const RankIcon = getRankMedal(rank).icon
                return (
                  <tr key={aerodrome.id} className="cursor-pointer hover:bg-role-primary-soft/20 transition-colors" onClick={() => onSelectAerodrome?.(aerodrome.id)}>
                    <td className="font-mono"><div className="flex items-center gap-1"><RankIcon className={`w-4 h-4 ${getRankMedal(rank).color}`} /><span className="text-sm">{rank}</span></div></td>
                    <td><div className="flex items-center gap-2"><Plane className="w-3.5 h-3.5 text-muted-foreground" /><span className="font-medium text-sm">{aerodrome.code_oaci}</span><span className="text-xs text-muted-foreground truncate max-w-[120px]">{aerodrome.nom}</span></div></td>
                    <td><span className={`text-sm font-bold ${getScoreColor(profil.score_global)}`}>{profil.score_global}</span></td>
                    <td>{profil.tendance === 'hausse' ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : profil.tendance === 'baisse' ? <TrendingDown className="w-3.5 h-3.5 text-danger animate-pulse" /> : <Minus className="w-3.5 h-3.5 text-muted-foreground" />}</td>
                    <td><span className={`text-xs font-medium ${getScoreColor(profil.c1)}`}>{profil.c1}</span></td>
                    <td><span className={`text-xs font-medium ${getScoreColor(profil.c2)}`}>{profil.c2}</span></td>
                    <td><span className={`text-xs font-medium ${getScoreColor(profil.c3)}`}>{profil.c3}</span></td>
                    <td><span className={`text-xs font-medium ${getScoreColor(profil.c4)}`}>{profil.c4}</span></td>
                    <td><span className={`text-xs font-medium ${getScoreColor(profil.c5)}`}>{profil.c5}</span></td>
                    <td><Eye className="w-3.5 h-3.5 text-muted-foreground" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aerodromesWithProfil.map(({ aerodrome, profil }, idx) => {
              const rank = idx + 1
              const RankIcon = getRankMedal(rank).icon
              return (
                <div key={aerodrome.id} className="p-3 rounded-xl border-2 border-border cursor-pointer hover:border-role-primary/30 hover:bg-role-primary-soft/20 transition-all" onClick={() => onSelectAerodrome?.(aerodrome.id)}>
                  <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><RankIcon className={`w-5 h-5 ${getRankMedal(rank).color}`} /><span className="text-sm font-bold">{rank}</span></div><span className="badge outline text-xs">{aerodrome.region}</span></div>
                  <div className="flex items-center gap-2 mb-2"><Plane className="w-4 h-4 text-muted-foreground" /><span className="font-semibold">{aerodrome.code_oaci}</span><span className="text-xs text-muted-foreground truncate">{aerodrome.nom}</span></div>
                  <div className="flex items-center justify-between mb-3"><span className="text-2xl font-bold">{profil.score_global}</span><span className="text-xs text-muted-foreground">/100</span>{profil.tendance === 'hausse' ? <TrendingUp className="w-4 h-4 text-success" /> : profil.tendance === 'baisse' ? <TrendingDown className="w-4 h-4 text-danger animate-pulse" /> : <Minus className="w-4 h-4 text-muted-foreground" />}</div>
                  <div className="grid grid-cols-5 gap-1 text-center text-xs"><div><span className="text-muted-foreground">C1</span><span className={`ml-1 font-medium ${getScoreColor(profil.c1)}`}>{profil.c1}</span></div><div><span className="text-muted-foreground">C2</span><span className={`ml-1 font-medium ${getScoreColor(profil.c2)}`}>{profil.c2}</span></div><div><span className="text-muted-foreground">C3</span><span className={`ml-1 font-medium ${getScoreColor(profil.c3)}`}>{profil.c3}</span></div><div><span className="text-muted-foreground">C4</span><span className={`ml-1 font-medium ${getScoreColor(profil.c4)}`}>{profil.c4}</span></div><div><span className="text-muted-foreground">C5</span><span className={`ml-1 font-medium ${getScoreColor(profil.c5)}`}>{profil.c5}</span></div></div>
                  <div className="progress h-1 mt-2"><div className="progress-bar" style={{ width: `${profil.score_global}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t border-border flex items-center justify-between">
          <span>Benchmarking basé sur {stats?.total || 0} aérodromes</span>
          <span>{aerodromesWithProfil.length} analysés</span>
        </div>
      </div>
    </div>
  )
}

export default ComparativeAnalysis
