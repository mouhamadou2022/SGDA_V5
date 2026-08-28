// components/modules/profil-risque/ComparativeAnalysis.tsx
// Analyse comparative — benchmarking entre aérodromes
// Classes CSS existantes uniquement

'use client'

import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Minus, Medal, Crown, Eye, Plane, Target } from 'lucide-react'
import { useAppStore, ProfilRisque, Aerodrome } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/DataTable'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }

interface Props { onSelectAerodrome?: (id: string) => void }

type ComparatifItem = { aerodrome: Aerodrome; profil: ProfilRisque }

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-success'; if (score >= 60) return 'text-primary'
  if (score >= 30) return 'text-warning'; return 'text-danger'
}

function getRankMedal(rank: number): { icon: React.ElementType; color: string } {
  if (rank === 1) return { icon: Crown, color: 'text-yellow-500' }
  if (rank === 2) return { icon: Medal, color: 'text-muted-foreground' }
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
      .filter(e => e.profil) as ComparatifItem[]

    const filtered = filterRegion === 'all' ? list : list.filter(e => e.aerodrome.region === filterRegion)

    const sortFn: Record<string, (a: ComparatifItem, b: ComparatifItem) => number> = {
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
    <Card variant="role" heading={<div className="flex items-center justify-between flex-wrap gap-3 w-full"><div><div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-role-primary" />Analyse comparative</div><p className="text-xs text-foreground mt-0.5">Benchmarking entre aérodromes</p></div><div className="flex items-center gap-2"><select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className={`form-select w-36 text-xs ${focusClass}`} style={selectStyle}><option value="all">Toutes régions</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}</select><select value={sortBy} onChange={e => setSortBy(e.target.value as ('score' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'))} className={`form-select w-32 text-xs ${focusClass}`} style={selectStyle}><option value="score">Score global</option><option value="c1">C1</option><option value="c2">C2</option><option value="c3">C3</option><option value="c4">C4</option><option value="c5">C5</option></select><button type="button" className="action-button w-8 h-8 p-0" onClick={() => setViewMode(m => m === 'list' ? 'grid' : 'list')}>{viewMode === 'list' ? <Eye className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}</button></div></div>}>
      <div className="space-y-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <div className="bg-muted/20 rounded-xl p-2 text-center"><p className="text-xs text-foreground">Moyenne</p><p className={`text-lg font-bold ${getScoreColor(stats.moyenne)}`}>{stats.moyenne}</p></div>
            <div className="bg-muted/20 rounded-xl p-2 text-center"><p className="text-xs text-foreground">Min/Max</p><p className="text-sm font-bold text-foreground">{stats.min}/{stats.max}</p></div>
            <div className="bg-muted/20 rounded-xl p-2 text-center"><p className="text-xs text-foreground">Écart-type</p><p className="text-sm font-bold text-foreground">{stats.ecartType}</p></div>
            <div className="bg-success-soft rounded-xl p-2 text-center"><p className="text-xs text-success">Excellent</p><p className="text-lg font-bold text-success">{stats.excellent}</p></div>
            <div className="bg-primary-soft rounded-xl p-2 text-center"><p className="text-xs text-primary">Bon</p><p className="text-lg font-bold text-primary">{stats.bon}</p></div>
            <div className="bg-warning-soft rounded-xl p-2 text-center"><p className="text-xs text-warning">Modéré</p><p className="text-lg font-bold text-warning">{stats.modere}</p></div>
            <div className="bg-danger-soft rounded-xl p-2 text-center"><p className="text-xs text-danger">Critique</p><p className="text-lg font-bold text-danger">{stats.critique}</p></div>
          </div>
        )}

        {viewMode === 'list' ? (
          <DataTable
            data={aerodromesWithProfil}
            columns={[
              {
                key: 'rank',
                header: '#',
                render: (item) => {
                  const rank = aerodromesWithProfil.indexOf(item) + 1
                  const RankIcon = getRankMedal(rank).icon
                  return (
                    <div className="flex items-center gap-1">
                      <RankIcon className={`w-4 h-4 ${getRankMedal(rank).color}`} />
                      <span className="text-sm text-foreground">{rank}</span>
                    </div>
                  )
                },
              },
              {
                key: 'aerodrome',
                header: 'Aérodrome',
                render: (item) => (
                  <div className="flex items-center gap-2">
                    <Plane className="w-3.5 h-3.5 text-foreground" />
                    <span className="font-medium text-sm text-foreground">{item.aerodrome.code_oaci}</span>
                    <span className="text-xs text-foreground truncate max-w-[120px]">{item.aerodrome.nom}</span>
                  </div>
                ),
              },
              {
                key: 'score',
                header: 'Score',
                render: (item) => (
                  <span className={`text-sm font-bold ${getScoreColor(item.profil.score_global)}`}>{item.profil.score_global}</span>
                ),
              },
              {
                key: 'tendance',
                header: 'Tendance',
                render: (item) => item.profil.tendance === 'hausse' ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : item.profil.tendance === 'baisse' ? <TrendingDown className="w-3.5 h-3.5 text-danger animate-pulse" /> : <Minus className="w-3.5 h-3.5 text-foreground" />,
              },
              {
                key: 'c1',
                header: 'C1',
                render: (item) => (
                  <><span className={`text-xs font-medium ${getScoreColor(item.profil.c1)}`}>{item.profil.c1}</span> <span className="text-xs text-foreground">({getSgsMaturiteLabel(item.profil.c1)})</span></>
                ),
              },
              {
                key: 'c2',
                header: 'C2',
                render: (item) => <span className={`text-xs font-medium ${getScoreColor(item.profil.c2)}`}>{item.profil.c2}</span>,
              },
              {
                key: 'c3',
                header: 'C3',
                render: (item) => <span className={`text-xs font-medium ${getScoreColor(item.profil.c3)}`}>{item.profil.c3}</span>,
              },
              {
                key: 'c4',
                header: 'C4',
                render: (item) => <span className={`text-xs font-medium ${getScoreColor(item.profil.c4)}`}>{item.profil.c4}</span>,
              },
              {
                key: 'c5',
                header: 'C5',
                render: (item) => <span className={`text-xs font-medium ${getScoreColor(item.profil.c5)}`}>{item.profil.c5}</span>,
              },
              {
                key: 'actions',
                header: '',
                render: () => <Eye className="w-3.5 h-3.5 text-foreground" />,
              },
            ]}
            keyExtractor={(item) => item.aerodrome.id}
            onRowClick={(item) => onSelectAerodrome?.(item.aerodrome.id)}
            emptyState={{ icon: Plane, title: 'Aucun résultat' }}
            headerClassName="bg-role-primary-soft/40"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aerodromesWithProfil.map(({ aerodrome, profil }, idx) => {
              const rank = idx + 1
              const RankIcon = getRankMedal(rank).icon
              return (
                <div key={aerodrome.id} className="p-3 rounded-xl border-2 border-border cursor-pointer hover:border-role-primary/30 hover:bg-role-primary-soft/20 transition-all" onClick={() => onSelectAerodrome?.(aerodrome.id)}>
                  <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><RankIcon className={`w-5 h-5 ${getRankMedal(rank).color}`} /><span className="text-sm font-bold text-foreground">{rank}</span></div><span className="badge outline text-xs">{aerodrome.region}</span></div>
                  <div className="flex items-center gap-2 mb-2"><Plane className="w-4 h-4 text-foreground" /><span className="font-semibold text-foreground">{aerodrome.code_oaci}</span><span className="text-xs text-foreground truncate">{aerodrome.nom}</span></div>
                  <div className="flex items-center justify-between mb-3"><span className="text-2xl font-bold text-foreground">{profil.score_global}</span><span className="text-xs text-foreground">/100</span>{profil.tendance === 'hausse' ? <TrendingUp className="w-4 h-4 text-success" /> : profil.tendance === 'baisse' ? <TrendingDown className="w-4 h-4 text-danger animate-pulse" /> : <Minus className="w-4 h-4 text-foreground" />}</div>
                  <div className="grid grid-cols-5 gap-1 text-center text-xs"><div><span className="text-foreground">C1</span><span className={`ml-1 font-medium ${getScoreColor(profil.c1)}`}>{getSgsMaturiteLabel(profil.c1)}</span></div><div><span className="text-foreground">C2</span><span className={`ml-1 font-medium ${getScoreColor(profil.c2)}`}>{profil.c2}</span></div><div><span className="text-foreground">C3</span><span className={`ml-1 font-medium ${getScoreColor(profil.c3)}`}>{profil.c3}</span></div><div><span className="text-foreground">C4</span><span className={`ml-1 font-medium ${getScoreColor(profil.c4)}`}>{profil.c4}</span></div><div><span className="text-foreground">C5</span><span className={`ml-1 font-medium ${getScoreColor(profil.c5)}`}>{profil.c5}</span></div></div>
                  <div className="progress h-1 mt-2"><div className="progress-bar" style={{ width: `${profil.score_global}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}

        <div className="text-xs text-foreground pt-2 border-t border-border flex items-center justify-between">
          <span>Benchmarking basé sur {stats?.total || 0} aérodromes</span>
          <span>{aerodromesWithProfil.length} analysés</span>
        </div>
      </div>
    </Card>
  )
}

export default ComparativeAnalysis
