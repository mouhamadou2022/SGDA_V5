// components/modules/profil-risque/CorrelationHeatmap.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  X,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
} from 'lucide-react'
import { ProfilRisque } from '@/lib/store'
import { computeCorrelationMatrix, DEFAULT_CORRELATION_MATRIX, CorrelationMatrix } from '@/lib/risque'

interface CorrelationHeatmapProps {
  profilsHistorique?: ProfilRisque[]
  currentProfil?: ProfilRisque
  aerodromeName?: string
}

interface CritereInfo {
  key: string
  label: string
  color: string
  bgColor: string
}

const CRITERES_LIST: CritereInfo[] = [
  { key: 'C1', label: 'Maturité SGS', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  { key: 'C2', label: 'Efficacité PAC', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { key: 'C3', label: 'Conformité', color: 'text-success', bgColor: 'bg-green-100' },
  { key: 'C4', label: 'Charge Critique', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  { key: 'C5', label: 'Résilience', color: 'text-danger', bgColor: 'bg-red-100' },
]

function getCorrelationColor(correlation: number): {
  bg: string
  text: string
  intensity: number
  label: string
} {
  const absCorr = Math.abs(correlation)
  const isPositive = correlation > 0

  if (absCorr >= 0.7) {
    return {
      bg: isPositive ? 'bg-green-700' : 'bg-red-700',
      text: 'text-white',
      intensity: 4,
      label: isPositive ? 'Très forte corrélation positive' : 'Très forte corrélation négative'
    }
  }
  if (absCorr >= 0.5) {
    return {
      bg: isPositive ? 'bg-green-600' : 'bg-red-600',
      text: 'text-white',
      intensity: 3,
      label: isPositive ? 'Forte corrélation positive' : 'Forte corrélation négative'
    }
  }
  if (absCorr >= 0.3) {
    return {
      bg: isPositive ? 'bg-green-500' : 'bg-red-500',
      text: 'text-white',
      intensity: 2,
      label: isPositive ? 'Corrélation positive modérée' : 'Corrélation négative modérée'
    }
  }
  if (absCorr >= 0.1) {
    return {
      bg: isPositive ? 'bg-green-400' : 'bg-red-400',
      text: 'text-white',
      intensity: 1,
      label: isPositive ? 'Faible corrélation positive' : 'Faible corrélation négative'
    }
  }
  return {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-500 dark:text-gray-400',
    intensity: 0,
    label: 'Pas de corrélation'
  }
}

function formatCorrelation(value: number): string {
  if (value === 0) return '0.00'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function getInterpretation(correlations: CorrelationMatrix): {
  plusFort: { pair: string; value: number; sens: string }
  plusFaible: { pair: string; value: number; sens: string }
  recommandation: string
} {
  const entries = Object.entries(correlations).map(([key, value]) => {
    const [a, b] = key.split('_')
    return { pair: `${a.toUpperCase()}-${b.toUpperCase()}`, value: value as number }
  })

  const sorted = entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const plusFort = sorted[0]
  const plusFaible = sorted[sorted.length - 1]

  let recommandation = ''
  if (Math.abs(plusFort.value) > 0.7) {
    recommandation = `Les critères ${plusFort.pair} sont très liés. Une action sur l'un impactera fortement l'autre.`
  } else if (Math.abs(plusFort.value) > 0.5) {
    recommandation = `Les critères ${plusFort.pair} ont une relation significative. Prioriser des actions couplées.`
  } else {
    recommandation = `Les critères sont relativement indépendants. Une approche ciblée par critère est adaptée.`
  }

  return {
    plusFort: { pair: plusFort.pair, value: plusFort.value, sens: plusFort.value > 0 ? 'positive' : 'négative' },
    plusFaible: { pair: plusFaible.pair, value: plusFaible.value, sens: plusFaible.value > 0 ? 'positive' : 'négative' },
    recommandation
  }
}

export function CorrelationHeatmap({ profilsHistorique, currentProfil, aerodromeName }: CorrelationHeatmapProps) {
  const [zoom, setZoom] = useState(1)
  const [showValues, setShowValues] = useState(true)

  const correlations = useMemo(() => {
    if (profilsHistorique && profilsHistorique.length >= 5) {
      return computeCorrelationMatrix(profilsHistorique)
    }
    return DEFAULT_CORRELATION_MATRIX
  }, [profilsHistorique])

  const interpretation = useMemo(() => getInterpretation(correlations), [correlations])

  const matrix = [
    { row: 'C1', col: 'C2', value: correlations.c1_c2 },
    { row: 'C1', col: 'C3', value: correlations.c1_c3 },
    { row: 'C1', col: 'C4', value: correlations.c1_c4 },
    { row: 'C1', col: 'C5', value: correlations.c1_c5 },
    { row: 'C2', col: 'C3', value: correlations.c2_c3 },
    { row: 'C2', col: 'C4', value: correlations.c2_c4 },
    { row: 'C2', col: 'C5', value: correlations.c2_c5 },
    { row: 'C3', col: 'C4', value: correlations.c3_c4 },
    { row: 'C3', col: 'C5', value: correlations.c3_c5 },
    { row: 'C4', col: 'C5', value: correlations.c4_c5 },
  ]

  const stats = useMemo(() => {
    const values = matrix.map(m => m.value)
    const positives = values.filter(v => v > 0.1).length
    const negatives = values.filter(v => v < -0.1).length
    const fortes = values.filter(v => Math.abs(v) > 0.5).length
    const tresForte = values.filter(v => Math.abs(v) > 0.7).length
    const moyenne = values.reduce((a, b) => a + b, 0) / values.length

    return { positives, negatives, fortes, tresForte, moyenne: moyenne.toFixed(2) }
  }, [matrix])

  return (
    <div className="card border-l-4 border-l-role-primary">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <span className="text-lg">📊</span>
              Matrice des corrélations
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {aerodromeName || 'Analyse des interdépendances entre critères'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 rounded-full bg-green-600" />
              <span className="text-muted-foreground">Positif</span>
              <span className="w-3 h-3 rounded-full bg-red-600 ml-2" />
              <span className="text-muted-foreground">Négatif</span>
            </div>
            <button
              type="button"
              className="action-button w-7 h-7 p-0"
              title="Afficher/masquer les valeurs"
              onClick={() => setShowValues(!showValues)}
            >
              {showValues ? <span className="text-xs font-mono">123</span> : <span className="text-xs">⬚</span>}
            </button>
            {profilsHistorique && profilsHistorique.length < 5 && (
              <span className="badge warning text-[10px] gap-1 flex items-center">
                <Info className="w-3 h-3" />
                Données limitées ({profilsHistorique.length}/5)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card-content">
        {/* Légende des intensités */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Corrélation:</span>
            <div className="flex items-center gap-1 rounded-lg overflow-hidden border border-border">
              <span className="w-5 h-5 bg-green-700" />
              <span className="w-5 h-5 bg-green-600" />
              <span className="w-5 h-5 bg-green-500" />
              <span className="w-5 h-5 bg-green-400" />
              <span className="w-8 h-5 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400 font-bold border-x border-border">0</span>
              <span className="w-5 h-5 bg-red-400" />
              <span className="w-5 h-5 bg-red-500" />
              <span className="w-5 h-5 bg-red-600" />
              <span className="w-5 h-5 bg-red-700" />
            </div>
            <span className="text-muted-foreground text-[10px]">-1 ← 0 → +1</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge primary text-[10px]">
              🔗 {stats.fortes} corrélation{stats.fortes > 1 ? 's' : ''} forte{stats.fortes > 1 ? 's' : ''}
            </span>
            {stats.tresForte > 0 && (
              <span className="badge danger text-[10px]">
                ⚡ {stats.tresForte} très forte{stats.tresForte > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Heatmap avec zoom */}
        <div className="overflow-x-auto" style={{ zoom: zoom }}>
          <div className="min-w-[400px]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 w-20"></th>
                  {CRITERES_LIST.map((c) => (
                    <th key={c.key} className="p-2 text-center">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${c.bgColor} ${c.color} font-bold`}>
                        {c.key}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CRITERES_LIST.map((row, i) => (
                  <tr key={row.key}>
                    <td className="p-2">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full ${row.bgColor} ${row.color} font-bold mx-auto`}>
                        {row.key}
                      </div>
                    </td>
                    {CRITERES_LIST.map((col, j) => {
                      if (i === j) {
                        return (
                          <td key={col.key} className="p-2 text-center">
                            <div className="w-12 h-12 mx-auto rounded-lg bg-role-primary flex items-center justify-center">
                              <span className="text-xs font-bold" style={{ color: 'white' }}>1.00</span>
                            </div>
                          </td>
                        )
                      }
                      const corr = matrix.find(m =>
                        (m.row === row.key && m.col === col.key) ||
                        (m.row === col.key && m.col === row.key)
                      )
                      const value = corr?.value || 0
                      const colorConfig = getCorrelationColor(value)

                      return (
                        <td key={col.key} className="p-2 text-center">
                          <div
                            className={`w-12 h-12 mx-auto rounded-lg ${colorConfig.bg} flex items-center justify-center cursor-help transition-transform hover:scale-105`}
                            title={`${row.key} ↔ ${col.key}: ${formatCorrelation(value)} — ${colorConfig.label}`}
                          >
                            {showValues ? (
                              <span className="text-xs font-mono font-bold" style={{ color: 'white' }}>
                                {formatCorrelation(value)}
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: 'white' }}>
                                {colorConfig.intensity === 4 ? '▓▓▓' :
                                 colorConfig.intensity === 3 ? '▓▓▒' :
                                 colorConfig.intensity === 2 ? '▓▒░' :
                                 colorConfig.intensity === 1 ? '▒░░' : '· · ·'}
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contrôles de zoom */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            type="button"
            className={`action-button w-7 h-7 p-0 ${zoom <= 0.5 ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={`action-button w-7 h-7 p-0 ${zoom >= 1.5 ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
            disabled={zoom >= 1.5}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Interprétation et statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-border">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" />
              Analyse des corrélations
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Corrélation moyenne</span>
                <span className={`font-semibold ${parseFloat(stats.moyenne) > 0 ? 'text-success' : parseFloat(stats.moyenne) < 0 ? 'text-danger' : 'text-foreground'}`}>
                  {stats.moyenne}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Corrélations positives</span>
                <span className="font-semibold text-success">{stats.positives}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Corrélations négatives</span>
                <span className="font-semibold text-danger">{stats.negatives}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
              <Info className="w-3.5 h-3.5" />
              Interprétation
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <span className="badge primary shrink-0">💡</span>
                <span className="text-foreground">{interpretation.recommandation}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className={`badge ${interpretation.plusFort.value > 0 ? 'success' : 'danger'} shrink-0`}>
                  {interpretation.plusFort.value > 0 ? '📈' : '📉'}
                </span>
                <span className="text-foreground">
                  Corrélation la plus {interpretation.plusFort.sens}: <strong>{interpretation.plusFort.pair}</strong> ({formatCorrelation(interpretation.plusFort.value)})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Détail par paire - TOUT EN BLANC */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <span>🔍</span>
            Détail des corrélations
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {matrix.map((item) => {
              const colorConfig = getCorrelationColor(item.value)
              return (
                <div
                  key={`${item.row}-${item.col}`}
                  className={`flex items-center justify-center p-2 rounded-lg ${colorConfig.bg} text-xs`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="font-medium" style={{ color: 'white' }}>{item.row}↔{item.col}</span>
                    <span className="font-mono font-bold" style={{ color: 'white' }}>
                      {formatCorrelation(item.value)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Note méthodologique */}
        <div className="mt-4 pt-3 text-[10px] text-muted-foreground border-t border-border flex items-center justify-between">
          <span>Méthode: Corrélation de Pearson | Données: {profilsHistorique?.length || 0} profils analysés</span>
          {profilsHistorique && profilsHistorique.length < 5 && (
            <span className="badge warning text-[9px]">
              ⚠️ Plus de données amélioreront la précision
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default CorrelationHeatmap