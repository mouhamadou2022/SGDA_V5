// components/modules/profil-risque/InsightsAeroriskCard.tsx
// Carte « Prédictions AERORISQ » alimentée par getProfilRisqueWithAiInsights.
// Lecture seule : analyse locale du riskAgent (cache 1h), aucune écriture.
// Fallback déterministe si le profil n'est pas encore analysé.

'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { getRiskLevelClass } from '@/lib/risque'
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, Lightbulb } from 'lucide-react'

interface PredictionsShape {
  score3m?: number
  score6m?: number
  score12m?: number
  confidence?: number
  intervals?: {
    score3m?: [number, number]
    score6m?: [number, number]
    score12m?: [number, number]
  }
}

interface Props {
  aerodromeId: string
}

function getScoreTextColor(s: number | undefined) {
  if (s == null) return 'text-muted-foreground'
  if (s >= 80) return 'text-success'
  if (s >= 60) return 'text-primary'
  if (s >= 30) return 'text-warning'
  return 'text-danger'
}

function getTrend(score: number | undefined, cible: number | null | undefined) {
  if (score == null || cible == null) return null
  const diff = Math.round(score - cible)
  if (diff > 3) return { icon: TrendingUp, cls: 'text-success', label: `+${diff} pts` }
  if (diff < -3) return { icon: TrendingDown, cls: 'text-danger', label: `${diff} pts` }
  return { icon: Minus, cls: 'text-muted-foreground', label: 'stable' }
}

export function InsightsAeroriskCard({ aerodromeId }: Props) {
  const getProfilRisqueWithAiInsights = useAppStore(s => s.getProfilRisqueWithAiInsights)
  const [predictions, setPredictions] = useState<PredictionsShape | null>(null)
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [confidence, setConfidence] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setIsLoading(true)
      try {
        const result = await getProfilRisqueWithAiInsights?.(aerodromeId)
        if (!active) return
        const p = result?.predictions as PredictionsShape | null | undefined
        setPredictions(p || null)
        setRecommendations(result?.recommendations || [])
        setConfidence(result?.confidence ?? null)
        setHasData(!!result?.profil)
      } catch {
        if (active) setHasData(false)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aerodromeId])

  if (isLoading) {
    return (
      <Card variant="level" levelColor="primary" heading={<div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-role-primary" />Prédictions AERORISQ</div>}>
        <div className="flex items-center gap-2 text-xs text-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin text-role-primary" />
          Analyse locale en cours (cache 1h)…
        </div>
      </Card>
    )
  }

  const trend3m = getTrend(predictions?.score3m, confidence)
  const aAfficher = !!(predictions && (predictions.score3m != null || predictions.score6m != null || predictions.score12m != null))

  return (
    <Card variant="level" levelColor="primary" heading={<div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-role-primary" />Prédictions AERORISQ</div>}>
      {aAfficher ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '3 mois', val: predictions?.score3m, ic: predictions?.intervals?.score3m },
              { label: '6 mois', val: predictions?.score6m, ic: predictions?.intervals?.score6m },
              { label: '12 mois', val: predictions?.score12m, ic: predictions?.intervals?.score12m },
            ].map((p) => (
              <div key={p.label} className="text-center p-3 bg-role-primary-soft rounded-xl border border-role-primary-light">
                <p className="text-[10px] text-foreground">Dans {p.label}</p>
                <p className={`text-xl font-bold ${getScoreTextColor(p.val)}`}>{p.val != null ? Math.round(p.val) : '—'}%</p>
                {p.ic && p.val != null && (
                  <p className="text-[10px] text-foreground">IC: [{Math.round(p.ic[0])}–{Math.round(p.ic[1])}]</p>
                )}
              </div>
            ))}
          </div>
          {trend3m && (
            <p className="text-xs text-foreground mt-2 flex items-center gap-1.5">
              <trend3m.icon className={`w-3.5 h-3.5 ${trend3m.cls}`} />
              Tendance à 3 mois : <strong className={trend3m.cls}>{trend3m.label}</strong>
              <span className="text-muted-foreground">vs score actuel</span>
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-foreground py-2">
          Profil non analysé — les prédictions seront disponibles après la prochaine mise à jour du profil de risque.
        </p>
      )}

      {confidence != null && (
        <p className="text-xs text-foreground mt-2">Confiance de l&apos;analyse : <strong>{confidence}%</strong></p>
      )}

      {recommendations.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border space-y-1.5">
          <p className="text-[10px] font-semibold text-foreground uppercase flex items-center gap-1.5">
            <Lightbulb className="w-3 h-3 text-warning" /> Recommandations AERORISQ
          </p>
          {recommendations.slice(0, 4).map((r, i) => (
            <p key={i} className="text-[11px] text-foreground flex items-start gap-1.5">
              <span className={`badge ${getRiskLevelClass(i < 2 ? 'critique' : 'moyen')} text-[8px] mt-0.5`}>{i + 1}</span>
              {r}
            </p>
          ))}
        </div>
      )}

      {!hasData && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Données partielles — un profil de risque complet est nécessaire pour une analyse approfondie.
        </p>
      )}
    </Card>
  )
}
