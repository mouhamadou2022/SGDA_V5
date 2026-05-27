// components/modules/profil-risque/ComparativeAnalysis.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Medal,
  Crown,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Filter,
  Download,
  Eye,
  MapPin,
  Plane,
  Target,
  Shield,
} from 'lucide-react'
import { useAppStore, ProfilRisque, Aerodrome } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }

interface ComparativeAnalysisProps {
  selectedAerodromeId?: string
  onSelectAerodrome?: (aerodromeId: string) => void
}

interface AerodromeWithProfil {
  aerodrome: Aerodrome
  profil: ProfilRisque | null
  rank: number
  scoreDifference: number
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-blue-600'
  if (score >= 30) return 'text-orange-600'
  return 'text-red-600'
}

function getRankMedal(rank: number): { icon: React.ElementType; color: string; label: string } {
  if (rank === 1) return { icon: Crown, color: 'text-yellow-500', label: '1er' }
  if (rank === 2) return { icon: Medal, color: 'text-gray-400', label: '2e' }
  if (rank === 3) return { icon: Medal, color: 'text-amber-600', label: '3e' }
  return { icon: Target, color: 'text-gray-400', label: `${rank}e` }
}

function getTrendIcon(tendance: string) {
  if (tendance === 'hausse') return <TrendingUp className="w-3.5 h-3.5 text-green-500" />
  if (tendance === 'baisse') return <TrendingDown className="w-3.5 h-3.5 text-red-500 animate-pulse" />
  return <Minus className="w-3.5 h-3.5 text-gray-400" />
}

export function ComparativeAnalysis({ selectedAerodromeId, onSelectAerodrome }: ComparativeAnalysisProps) {
  const [sortBy, setSortBy] = useState<'score' | 'tendance' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5'>('score')
  const [filterRegion, setFilterRegion] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const aerodromes = useAppStore((state) => state.aerodromes)
  const profilsRisque = useAppStore((state) => state.profilsRisque)

  const aerodromesWithProfil = useMemo((): AerodromeWithProfil[] => {
    const withProfil = aerodromes
      .map(aero => ({
        aerodrome: aero,
        profil: profilsRisque[aero.id] || null,
        rank: 0,
        scoreDifference: 0,
      }))
      .filter(item => item.profil !== null) as AerodromeWithProfil[]

    const sorted = [...withProfil].sort((a, b) => (b.profil?.score_global || 0) - (a.profil?.score_global || 0))

    sorted.forEach((item, index) => {
      item.rank = index + 1
    })

    let filtered = sorted
    if (filterRegion !== 'all') {
      filtered = filtered.filter(item => item.aerodrome.region === filterRegion)
    }

    filtered.sort((a, b) => {
      const aScore = a.profil?.score_global || 0
      const bScore = b.profil?.score_global || 0

      switch (sortBy) {
        case 'score':
          return bScore - aScore
        case 'tendance':
          const order = { hausse: 1, stable: 0, baisse: -1 }
          return (order[b.profil?.tendance as keyof typeof order] || 0) - (order[a.profil?.tendance as keyof typeof order] || 0)
        case 'c1': return (b.profil?.c1 || 0) - (a.profil?.c1 || 0)
        case 'c2': return (b.profil?.c2 || 0) - (a.profil?.c2 || 0)
        case 'c3': return (b.profil?.c3 || 0) - (a.profil?.c3 || 0)
        case 'c4': return (b.profil?.c4 || 0) - (a.profil?.c4 || 0)
        case 'c5': return (b.profil?.c5 || 0) - (a.profil?.c5 || 0)
        default: return bScore - aScore
      }
    })

    return filtered
  }, [aerodromes, profilsRisque, sortBy, filterRegion])

  const stats = useMemo(() => {
    const scores = aerodromesWithProfil.map(item => item.profil?.score_global || 0)
    if (scores.length === 0) return null

    const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const ecartType = Math.sqrt(scores.reduce((sq, v) => sq + Math.pow(v - moyenne, 2), 0) / scores.length)

    const excellent = scores.filter(s => s >= 80).length
    const bon = scores.filter(s => s >= 60 && s < 80).length
    const modere = scores.filter(s => s >= 30 && s < 60).length
    const critique = scores.filter(s => s < 30).length

    return { moyenne: Math.round(moyenne), min, max, ecartType: ecartType.toFixed(1), excellent, bon, modere, critique, total: scores.length }
  }, [aerodromesWithProfil])

  const regions = useMemo(() => {
    const unique = new Set(aerodromes.map(a => a.region))
    return Array.from(unique).filter(Boolean)
  }, [aerodromes])

  const selectedData = selectedAerodromeId
    ? aerodromesWithProfil.find(item => item.aerodrome.id === selectedAerodromeId)
    : null

  const selectedRank = selectedData?.rank || 0
  const percentile = stats?.total ? Math.round(((stats.total - selectedRank) / stats.total) * 100) : 0

  return (
    <div className="card border-l-4 border-l-role-primary">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Analyse comparative
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Benchmarking entre aérodromes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className={`form-select w-36 text-xs ${focusClass}`}
              style={selectStyle}
            >
              <option value="all">🌍 Toutes régions</option>
              {regions.map(region => (
                <option key={region} value={region}>📍 {region}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={`form-select w-32 text-xs ${focusClass}`}
              style={selectStyle}
            >
              <option value="score">🏆 Score global</option>
              <option value="tendance">📈 Tendance</option>
              <option value="c1">📊 C1</option>
              <option value="c2">📊 C2</option>
              <option value="c3">📊 C3</option>
              <option value="c4">📊 C4</option>
              <option value="c5">📊 C5</option>
            </select>
            <button
              type="button"
              className="action-button w-8 h-8 p-0"
              title={viewMode === 'list' ? 'Passer en vue grille' : 'Passer en vue liste'}
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            >
              {viewMode === 'list' ? <Eye className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="card-content space-y-5">
        {/* KPIs globaux */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-gray-500">Moyenne</p>
              <p className={`text-lg font-bold ${getScoreColor(stats.moyenne)}`}>{stats.moyenne}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-gray-500">Min/Max</p>
              <p className="text-sm font-bold">{stats.min}/{stats.max}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-gray-500">Écart-type</p>
              <p className="text-sm font-bold">{stats.ecartType}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-green-600">Excellent</p>
              <p className="text-lg font-bold text-green-600">{stats.excellent}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-blue-600">Bon</p>
              <p className="text-lg font-bold text-blue-600">{stats.bon}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-orange-600">Modéré</p>
              <p className="text-lg font-bold text-orange-600">{stats.modere}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-2 text-center">
              <p className="text-[10px] text-red-600">Critique</p>
              <p className="text-lg font-bold text-red-600">{stats.critique}</p>
            </div>
          </div>
        )}

        {/* Classement - vue liste */}
        {viewMode === 'list' ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Aérodrome</th>
                  <th className="w-20 text-center">Score</th>
                  <th className="w-24 text-center">Tendance</th>
                  <th className="text-center">C1</th>
                  <th className="text-center">C2</th>
                  <th className="text-center">C3</th>
                  <th className="text-center">C4</th>
                  <th className="text-center">C5</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {aerodromesWithProfil.map((item) => {
                  const profil = item.profil!
                  const RankIcon = getRankMedal(item.rank).icon
                  const rankColor = getRankMedal(item.rank).color
                  const isSelected = selectedAerodromeId === item.aerodrome.id

                  return (
                    <tr
                      key={item.aerodrome.id}
                      className={`cursor-pointer transition-all ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => onSelectAerodrome && onSelectAerodrome(item.aerodrome.id)}
                    >
                      <td className="font-mono">
                        <div className="flex items-center gap-1">
                          <RankIcon className={`w-4 h-4 ${rankColor}`} />
                          <span className="text-sm font-medium">{item.rank}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Plane className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium text-sm">{item.aerodrome.code_oaci}</span>
                          <span className="text-xs text-gray-400">{item.aerodrome.nom}</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`text-sm font-bold ${getScoreColor(profil.score_global)}`}>
                          {profil.score_global}
                        </span>
                      </td>
                      <td className="text-center">
                        {getTrendIcon(profil.tendance)}
                      </td>
                      <td className="text-center">
                        <span className={`text-xs font-medium ${getScoreColor(profil.c1)}`}>{profil.c1}</span>
                      </td>
                      <td className="text-center">
                        <span className={`text-xs font-medium ${getScoreColor(profil.c2)}`}>{profil.c2}</span>
                      </td>
                      <td className="text-center">
                        <span className={`text-xs font-medium ${getScoreColor(profil.c3)}`}>{profil.c3}</span>
                      </td>
                      <td className="text-center">
                        <span className={`text-xs font-medium ${getScoreColor(profil.c4)}`}>{profil.c4}</span>
                      </td>
                      <td className="text-center">
                        <span className={`text-xs font-medium ${getScoreColor(profil.c5)}`}>{profil.c5}</span>
                      </td>
                      <td>
                        <button type="button" className="action-button w-7 h-7 p-0">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Vue grille */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aerodromesWithProfil.map((item) => {
              const profil = item.profil!
              const RankIcon = getRankMedal(item.rank).icon
              const rankColor = getRankMedal(item.rank).color
              const isSelected = selectedAerodromeId === item.aerodrome.id

              return (
                <div
                  key={item.aerodrome.id}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                  }`}
                  onClick={() => onSelectAerodrome && onSelectAerodrome(item.aerodrome.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RankIcon className={`w-5 h-5 ${rankColor}`} />
                      <span className="text-sm font-bold">{item.rank}</span>
                    </div>
                    <span className="badge outline text-[10px]">{item.aerodrome.region}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Plane className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold text-gray-800">{item.aerodrome.code_oaci}</span>
                    <span className="text-xs text-gray-400">{item.aerodrome.nom}</span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-bold">{profil.score_global}</span>
                      <span className="text-xs text-gray-400">/100</span>
                    </div>
                    {getTrendIcon(profil.tendance)}
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                    <div>
                      <span className="text-gray-400">C1</span>
                      <span className={`ml-1 font-medium ${getScoreColor(profil.c1)}`}>{profil.c1}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">C2</span>
                      <span className={`ml-1 font-medium ${getScoreColor(profil.c2)}`}>{profil.c2}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">C3</span>
                      <span className={`ml-1 font-medium ${getScoreColor(profil.c3)}`}>{profil.c3}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">C4</span>
                      <span className={`ml-1 font-medium ${getScoreColor(profil.c4)}`}>{profil.c4}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">C5</span>
                      <span className={`ml-1 font-medium ${getScoreColor(profil.c5)}`}>{profil.c5}</span>
                    </div>
                  </div>
                  <div className="progress h-1 mt-2">
                    <div className="progress-bar" style={{ width: `${profil.score_global}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Analyse de l'aérodrome sélectionné */}
        {selectedData && selectedRank && stats && (
          <div className="mt-4 pt-4 border-t border-gray-200 animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-gray-700">
                Analyse comparative — {selectedData.aerodrome.code_oaci}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Classement</span>
                  <span className="text-sm font-bold">{selectedRank}/{stats.total}</span>
                </div>
                <div className="progress h-1.5">
                  <div className="progress-bar" style={{ width: `${(selectedRank / stats.total) * 100}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {percentile > 80 ? 'Top 20% des aérodromes' :
                   percentile > 60 ? 'Au-dessus de la moyenne' :
                   percentile > 40 ? 'Dans la moyenne' :
                   'En dessous de la moyenne'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Écart avec moyenne</span>
                  <span className={`text-sm font-bold ${selectedData.profil!.score_global - stats.moyenne >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedData.profil!.score_global - stats.moyenne >= 0 ? '+' : ''}{selectedData.profil!.score_global - stats.moyenne}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${selectedData.profil!.score_global - stats.moyenne >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.abs((selectedData.profil!.score_global - stats.moyenne) / stats.moyenne) * 100}%`, marginLeft: selectedData.profil!.score_global - stats.moyenne >= 0 ? '50%' : `calc(50% - ${Math.abs((selectedData.profil!.score_global - stats.moyenne) / stats.moyenne) * 100}%)` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  vs moyenne {stats.moyenne}/100
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Note */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span>📊 Benchmarking basé sur {stats?.total || 0} aérodromes</span>
          <span>{aerodromesWithProfil.length} aérodromes analysés</span>
        </div>
      </div>
    </div>
  )
}

export default ComparativeAnalysis
