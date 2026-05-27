// components/modules/profil-risque/PredictionChart.tsx
// Graphique linéaire avec intervalle de confiance, fan chart, et données réelles
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// 0 shadcn/ui — 0 style inline non autorisé — 0 fetch direct

'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts'
import { useAppStore, useHistoricalScores, ScoreHistoryPoint, ProfilRisque } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

interface PredictionChartProps {
  profil: ProfilRisque
  aerodromeNom: string
}

interface DataPoint {
  label: string
  score?: number
  prediction?: number
  confMin?: number
  confMax?: number
  q10?: number
  q25?: number
  q75?: number
  q90?: number
  type: 'historique' | 'actuel' | 'prediction'
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null

  const getValueClass = (value: number) => {
    if (value >= 80) return 'text-green-600 font-bold'
    if (value >= 60) return 'text-blue-600 font-bold'
    if (value >= 30) return 'text-orange-600 font-bold'
    return 'text-red-600 font-bold'
  }

  return (
    <div className="card px-4 py-3 text-sm animate-fade-up">
      <p className="font-semibold text-gray-700 mb-2 border-b border-gray-100 pb-1">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry) => {
          if (entry.dataKey === 'confMin' || entry.dataKey === 'confMax') return null
          const valueClass = getValueClass(entry.value)
          return (
            <p key={entry.name} className="flex items-center justify-between gap-3 text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs font-medium">
                  {entry.name === 'score' ? 'Score réel' :
                   entry.name === 'prediction' ? 'Prédiction' :
                   entry.name === 'q10' ? 'Scénario pessimiste' :
                   entry.name === 'q90' ? 'Scénario optimiste' : entry.name}
                </span>
              </span>
              <span className={`text-sm font-mono ${valueClass}`}>
                {entry.value}/100
              </span>
            </p>
          )
        })}
      </div>
      {payload.some(p => p.dataKey === 'confMin' && p.value) && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
          Intervalle de confiance 95%
        </div>
      )}
    </div>
  )
}

export function PredictionChart({ profil, aerodromeNom }: PredictionChartProps) {
  const historiqueScores = useHistoricalScores(profil.aerodrome_id)

  const data = useMemo(() => {
    const points: DataPoint[] = []

    // Données historiques réelles (12 derniers points)
    const historiqueReel = historiqueScores.slice(-12)
    historiqueReel.forEach((point) => {
      points.push({
        label: new Date(point.date || '-').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        score: point.score,
        type: 'historique'
      })
    })

    // Point actuel
    points.push({
      label: 'Actuel',
      score: profil.score_global,
      prediction: profil.score_global,
      type: 'actuel',
    })

    // Prédictions avec intervalles de confiance
    const pred3m = profil.prediction_3m ?? profil.score_global
    const pred6m = profil.prediction_6m ?? profil.score_global
    const ic3m = profil.prediction_interval_3m
    const ic6m = profil.prediction_interval_6m

    const predictions = [
      {
        label: 'N+1 (3m)',
        prediction: pred3m,
        confMin: ic3m?.lower ?? Math.max(0, pred3m - 12),
        confMax: ic3m?.upper ?? Math.min(100, pred3m + 12),
        q10: ic3m ? ic3m.lower : Math.max(0, pred3m - 15),
        q25: ic3m ? Math.round((ic3m.lower + pred3m) / 2) : Math.max(0, pred3m - 8),
        q75: ic3m ? Math.round((ic3m.upper + pred3m) / 2) : Math.min(100, pred3m + 8),
        q90: ic3m ? ic3m.upper : Math.min(100, pred3m + 15),
        type: 'prediction' as const
      },
      {
        label: 'N+2 (6m)',
        prediction: pred6m,
        confMin: ic6m?.lower ?? Math.max(0, pred6m - 18),
        confMax: ic6m?.upper ?? Math.min(100, pred6m + 18),
        q10: ic6m ? ic6m.lower : Math.max(0, pred6m - 22),
        q25: ic6m ? Math.round((ic6m.lower + pred6m) / 2) : Math.max(0, pred6m - 12),
        q75: ic6m ? Math.round((ic6m.upper + pred6m) / 2) : Math.min(100, pred6m + 12),
        q90: ic6m ? ic6m.upper : Math.min(100, pred6m + 22),
        type: 'prediction' as const
      }
    ]

    // Ajouter N+3 si disponible
    if (profil.prediction_12m) {
      predictions.push({
        label: 'N+3 (12m)',
        prediction: profil.prediction_12m,
        confMin: Math.max(0, profil.prediction_12m - 25),
        confMax: Math.min(100, profil.prediction_12m + 25),
        q10: Math.max(0, profil.prediction_12m - 18),
        q25: Math.max(0, profil.prediction_12m - 10),
        q75: Math.min(100, profil.prediction_12m + 10),
        q90: Math.min(100, profil.prediction_12m + 18),
        type: 'prediction' as const
      })
    }

    points.push(...predictions)
    return points
  }, [profil, historiqueScores])

  const getTendanceBadge = () => {
    if (profil.tendance === 'hausse') {
      return <span className="badge success gap-1">📈 Tendance haussière</span>
    }
    if (profil.tendance === 'baisse') {
      return <span className="badge danger gap-1 animate-pulse">📉 Tendance baissière</span>
    }
    return <span className="badge neutral gap-1">➡️ Tendance stable</span>
  }

  const getNiveauLabel = (score: number | undefined) => {
    if (score === undefined || Number.isNaN(score)) return { label: 'N/A', cls: 'badge neutral' }
    if (score >= 80) return { label: 'Excellent', cls: 'badge success' }
    if (score >= 60) return { label: 'Bon', cls: 'badge primary' }
    if (score >= 30) return { label: 'Modéré', cls: 'badge warning' }
    return { label: 'Critique', cls: 'badge danger' }
  }

  const currentNiveau = getNiveauLabel(profil.score_global)
  const prediction3mNiveau = getNiveauLabel(profil.prediction_3m)
  const prediction6mNiveau = getNiveauLabel(profil.prediction_6m)
  const pred3mVal = profil.prediction_3m ?? profil.score_global
  const pred6mVal = profil.prediction_6m ?? profil.score_global

  return (
    <div className="card">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="card-title text-base font-semibold">
              Évolution du score de risque
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{aerodromeNom}</p>
          </div>
          <div className="flex items-center gap-2">
            {getTendanceBadge()}
            <span className={currentNiveau.cls}>
              Score actuel: {profil.score_global}/100
            </span>
          </div>
        </div>
      </div>

      <div className="card-content space-y-4">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
            />

            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={35}
              ticks={[0, 20, 40, 60, 80, 100]}
            />

            {/* Zone de confiance (fan chart) */}
            <Area
              dataKey="confMax"
              stroke="transparent"
              fill="#dbeafe"
              fillOpacity={0.3}
              legendType="none"
              name="confMax"
            />
            <Area
              dataKey="confMin"
              stroke="transparent"
              fill="#ffffff"
              fillOpacity={1}
              legendType="none"
              name="confMin"
            />

            {/* Quartiles pour le fan chart */}
            <Area
              dataKey="q90"
              stroke="transparent"
              fill="#93c5fd"
              fillOpacity={0.2}
              legendType="none"
              name="q90"
            />
            <Area
              dataKey="q10"
              stroke="transparent"
              fill="#ffffff"
              fillOpacity={1}
              legendType="none"
              name="q10"
            />
            <Area
              dataKey="q75"
              stroke="transparent"
              fill="#60a5fa"
              fillOpacity={0.25}
              legendType="none"
              name="q75"
            />
            <Area
              dataKey="q25"
              stroke="transparent"
              fill="#ffffff"
              fillOpacity={1}
              legendType="none"
              name="q25"
            />

            {/* Lignes de seuils */}
            <ReferenceLine
              y={80}
              stroke="#16a34a"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'Excellent', position: 'insideRight', fill: '#16a34a', fontSize: 10, fontWeight: 600 }}
            />
            <ReferenceLine
              y={60}
              stroke="#2563eb"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'Bon', position: 'insideRight', fill: '#2563eb', fontSize: 10, fontWeight: 600 }}
            />
            <ReferenceLine
              y={30}
              stroke="#ea580c"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'Modéré', position: 'insideRight', fill: '#ea580c', fontSize: 10, fontWeight: 600 }}
            />
            <ReferenceLine
              y={0}
              stroke="#dc2626"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'Critique', position: 'insideRight', fill: '#dc2626', fontSize: 10, fontWeight: 600 }}
            />

            {/* Ligne historique */}
            <Line
              dataKey="score"
              name="score"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
              connectNulls
              className="transition-all duration-300"
            />

            {/* Ligne prédiction */}
            <Line
              dataKey="prediction"
              name="prediction"
              stroke="#7c3aed"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={{ r: 4, fill: '#7c3aed', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
              connectNulls
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              iconType="circle"
              formatter={(value) => {
                if (value === 'score') return '📊 Score historique'
                if (value === 'prediction') return '🔮 Prédiction'
                return value
              }}
              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Légende des prédictions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-border">
          <div className="bg-primary-soft rounded-lg p-3 border border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary">Prédiction N+1 (3 mois)</span>
              <span className={`${prediction3mNiveau.cls} text-xs`}>
                {prediction3mNiveau.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-primary mt-1">{pred3mVal}/100</p>
            <p className="text-xs text-muted-foreground mt-1">
              IC 95%: [{profil.prediction_interval_3m?.lower ?? pred3mVal - 12} - {profil.prediction_interval_3m?.upper ?? pred3mVal + 12}]
            </p>
          </div>

          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-purple-700">Prédiction N+2 (6 mois)</span>
              <span className={`${prediction6mNiveau.cls} text-xs`}>
                {prediction6mNiveau.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-purple-600 mt-1">{pred6mVal}/100</p>
            <p className="text-xs text-muted-foreground mt-1">
              IC 95%: [{profil.prediction_interval_6m?.lower ?? pred6mVal - 18} - {profil.prediction_interval_6m?.upper ?? pred6mVal + 18}]
            </p>
          </div>

          <div className={`rounded-lg p-3 border ${
            profil.tendance === 'hausse' ? 'bg-success-soft border-success/20' :
            profil.tendance === 'baisse' ? 'bg-danger-soft border-danger/20' :
            'bg-muted border-border'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Tendance actuelle</span>
              <span className={`badge ${
                profil.tendance === 'hausse' ? 'success' :
                profil.tendance === 'baisse' ? 'danger' : 'neutral'
              }`}>
                {profil.tendance === 'hausse' ? '📈 Hausse' : profil.tendance === 'baisse' ? '📉 Baisse' : '➡️ Stable'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {profil.tendance === 'hausse' ? 'Amélioration prévue du profil de risque' :
               profil.tendance === 'baisse' ? 'Dégradation prévue - Surveillance renforcée recommandée' :
               'Profil stable - Maintenir le planning de surveillance'}
            </p>
          </div>
        </div>

        {/* Alertes */}
        {profil.tendance === 'baisse' && pred6mVal < 40 && (
          <div className="alert alert-warning mt-4">
            <span className="alert-icon">⚠️</span>
            <div className="alert-content">
              <p className="alert-title">Alerte dégradation</p>
              <p className="alert-description">
                La tendance baissière et la prédiction à 6 mois ({pred6mVal}/100) suggèrent un risque de passage en zone critique.
                Une surveillance renforcée est recommandée.
              </p>
            </div>
          </div>
        )}

        {profil.tendance === 'hausse' && pred6mVal > 70 && (
          <div className="alert alert-success mt-4">
            <span className="alert-icon">✓</span>
            <div className="alert-content">
              <p className="alert-title">Tendance positive</p>
              <p className="alert-description">
                L'amélioration du profil de risque devrait se poursuivre. Maintenir les bonnes pratiques.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PredictionChart
