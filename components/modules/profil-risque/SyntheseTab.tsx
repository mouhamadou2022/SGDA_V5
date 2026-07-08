// components/modules/profil-risque/SyntheseTab.tsx
// Synthèse visuelle du profil de risque — gauge, radar, tendance, alertes, HMM, survival, infra

'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { ProfilRisque, EvenementSecurite, Ecart, useAppStore } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Activity, Shield, Zap, Clock, Brain, BarChart3, Gauge, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react'
import { synthetiserModeles, DiagnosticUnifie } from '@/lib/risque/modelSynthesis'
import { TendanceTable } from './TendanceTable'
import { linearRegression } from '@/lib/risque/trends'
import { ExplanabilityCard } from './ExplanabilityCard'
import { FeatureDriftCard } from './FeatureDriftCard'
import { ExogenousFactorsCard } from './ExogenousFactorsCard'
import { TriggersSection } from './TriggersSection'
import { ResilienceScoreCard } from './ResilienceScoreCard'
import { computeICaoMatrix, getICaoLabels } from '@/lib/risque'
import { recommendationEngine } from '@/lib/ia/engines/recommendationEngine'
import RecommandationDuJourCard from './RecommandationDuJourCard'

interface SyntheseTabProps {
  profil: ProfilRisque
  aerodromeName: string
  aerodromeCode: string
  nbEcartsCritiques: number
  userRole: string
  evenements?: EvenementSecurite[]
  ecarts?: Ecart[]
}

const RADAR_CRITERES = [
  { key: 'c1' as const, label: 'C1', poids: 20 },
  { key: 'c2' as const, label: 'C2', poids: 25 },
  { key: 'c3' as const, label: 'C3', poids: 20 },
  { key: 'c4' as const, label: 'C4', poids: 20 },
  { key: 'c5' as const, label: 'C5', poids: 15 },
]

function getNiveauColor(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'var(--color-danger)'
    case 'eleve': return 'var(--color-warning)'
    case 'moyen': return 'var(--color-primary)'
    case 'faible': return 'var(--color-success)'
    default: return 'var(--color-neutral)'
  }
}

function getNiveauBgClass(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'risk-badge critique'
    case 'eleve': return 'risk-badge eleve'
    case 'moyen': return 'risk-badge moyen'
    case 'faible': return 'risk-badge faible'
    default: return 'badge neutral'
  }
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-primary'
  if (score >= 30) return 'text-warning'
  return 'text-danger'
}

function getScoreRingColor(score: number): string {
  if (score >= 80) return 'var(--color-success)'
  if (score >= 60) return 'var(--color-primary)'
  if (score >= 30) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

function getTendanceIcon(tendance: string) {
  switch (tendance) {
    case 'hausse': return <TrendingUp className="w-5 h-5 text-success" />
    case 'baisse': return <TrendingDown className="w-5 h-5 text-danger" />
    default: return <Minus className="w-5 h-5 text-foreground" />
  }
}

function getTendanceLabel(tendance: string): string {
  switch (tendance) {
    case 'hausse': return 'En hausse'
    case 'baisse': return 'En baisse'
    default: return 'Stable'
  }
}

export function SyntheseTab({
  profil,
  aerodromeName,
  aerodromeCode,
  nbEcartsCritiques,
  userRole,
  evenements,
  ecarts = [],
}: SyntheseTabProps) {
  const score = Math.min(100, Math.max(0, profil.score_global))
  const ringColor = getScoreRingColor(score)
  const scoreColor = getScoreTextColor(score)

  // --- Radar polygon for small inline chart ---
  const radarCenterX = 55
  const radarCenterY = 55
  const radarRadius = 38
  const radarAngles = RADAR_CRITERES.map((_, i) => {
    const stepAngle = (2 * Math.PI) / RADAR_CRITERES.length
    return -Math.PI / 2 + i * stepAngle
  })

  const radarPoints = RADAR_CRITERES.map((c, i) => {
    const value = (profil[c.key] as number) || 0
    const ratio = Math.min(100, Math.max(0, value)) / 100
    const r = radarRadius * ratio
    return {
      x: radarCenterX + r * Math.cos(radarAngles[i]),
      y: radarCenterY + r * Math.sin(radarAngles[i]),
    }
  })

  const radarPolygon = radarPoints.map((p) => `${p.x},${p.y}`).join(' ')

  // Radar grid rings
  const gridRings = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const pts = radarAngles.map((a) => {
      const r = radarRadius * ratio
      return `${radarCenterX + r * Math.cos(a)},${radarCenterY + r * Math.sin(a)}`
    })
    return pts.join(' ')
  })

  // Radar axis lines
  const axisLines = radarAngles.map((a) => {
    return `M${radarCenterX},${radarCenterY} L${radarCenterX + radarRadius * Math.cos(a)},${radarCenterY + radarRadius * Math.sin(a)}`
  })

  // Radar labels
  const labelRadius = radarRadius + 12

  // --- Alert conditions ---
  const hasHMM = !!profil.hmm_state
  const hasSurvival = !!profil.survival_metrics
  const hasProactiveAlert = !!profil.proactive_alert
  const hasSystemStress = profil.system_stress && profil.system_stress.score !== undefined
  const hasHawkes = (profil.hawkes_intensity ?? 0) > 0.5
  const hasInfra = !!profil.infrastructure
  const showAlertes = hasProactiveAlert || hasSystemStress || hasHawkes

  // --- Synthèse IA (tous modèles) — calcul des metriques ---
  const diagnostic: DiagnosticUnifie = useMemo(() => synthetiserModeles(profil), [profil])

  const recommandationDuJour = useMemo(() => {
    try {
      return recommendationEngine.genererRecommandationDuJour(profil, ecarts, evenements ?? [], aerodromeCode, aerodromeName)
    } catch {
      return null
    }
  }, [profil, ecarts, evenements, aerodromeCode, aerodromeName])

  // --- Synthèse IA (texte) — généré par LLM ---
  const [synthIA, setSynthIA] = useState<{ interpretation: string; recommandation: string; elementsClefs: string[] } | null>(null)
  const [synthLoading, setSynthLoading] = useState(true)
  const [synthError, setSynthError] = useState(false)

  const fetchSynthesis = useCallback(async () => {
    setSynthLoading(true)
    setSynthError(false)
    try {
      const res = await fetch('/api/ai/synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profil }),
      })
      const data = await res.json()
      if (data.interpretation) {
        setSynthIA({ interpretation: data.interpretation, recommandation: data.recommandation, elementsClefs: data.elementsClefs })
      } else {
        setSynthError(true)
      }
    } catch {
      setSynthError(true)
    } finally {
      setSynthLoading(false)
    }
  }, [profil])

  useEffect(() => { fetchSynthesis() }, [fetchSynthesis])

  // --- Fiabilité des modèles ---
  const scores = (profil.historical_scores || []).map(h => h.score)
  const regResult = scores.length >= 2 ? linearRegression(scores) : null
  const r2 = regResult?.r2 ?? 0
  const rfAccuracy = useAppStore(s => s.modelMetrics?.random_forest?.accuracy) ?? 0
  const ensembleConfidence = profil.ensemble_confidence ?? 0
  const ic95width = (profil.prediction_interval_3m?.upper ?? 0) - (profil.prediction_interval_3m?.lower ?? 0)
  const calibrationError = ic95width > 0 ? Math.min(20, Math.round(ic95width / 2)) : 10
  const hasIC95 = !!profil.prediction_interval_3m || !!profil.prediction_interval_6m

  // --- Statistiques des critères C1-C5 ---
  const critereValues = RADAR_CRITERES.map(c => (profil[c.key] as number) || 0)
  const critereCount = critereValues.length
  const critereSum = critereValues.reduce((a, b) => a + b, 0)
  const critereMean = critereSum / critereCount
  const critereVariance = critereValues.reduce((s, v) => s + (v - critereMean) ** 2, 0) / critereCount
  const critereStdDev = Math.sqrt(critereVariance)
  const critereMin = Math.min(...critereValues)
  const critereMax = Math.max(...critereValues)
  const critereDispersion = critereMean > 0 ? critereStdDev / critereMean : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Synthèse du profil de risque
          </h2>
          <p className="text-sm text-foreground">
            {aerodromeCode} · {profil.last_change_point && `Dernier changement: ${new Date(profil.last_change_point).toLocaleDateString()}`}
          </p>
        </div>
      </div>

      {/* ═══ ROW 1 — Vue d'ensemble : Gauge + Stats critères + Synthèse IA (2x largeur) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* --- Gauge --- */}
        <Card heading="Score global">
          <div className="flex items-center justify-center gap-4">
            <svg width="110" height="110" viewBox="0 0 130 130" className="shrink-0">
              <circle cx={65} cy={65} r={52} fill="none" stroke="var(--color-muted)" strokeWidth={10} />
              <circle
                cx={65} cy={65} r={52} fill="none" stroke={ringColor} strokeWidth={10}
                strokeLinecap="round" strokeDasharray={`${score * 3.267} 326.7`}
                transform="rotate(-90 65 65)" className="transition-all duration-700"
              />
              <text x={65} y={60} textAnchor="middle" className="fill-foreground" fontSize="28" fontWeight="bold">
                {Math.round(score)}
              </text>
              <text x={65} y={80} textAnchor="middle" className="fill-foreground" fontSize="12">/ 100</text>
            </svg>
            <div className="flex flex-col gap-2 items-start">
              <span className={getNiveauBgClass(profil.niveau)}>{profil.niveau.toUpperCase()}</span>
              {profil.prediction_3m !== undefined && (
                <div className="flex items-center gap-1.5 text-xs text-foreground">
                  <Activity className="w-3 h-3" />
                  P3m: <span className={getScoreTextColor(profil.prediction_3m)}>{Math.round(profil.prediction_3m)}</span>
                </div>
              )}
              {profil.prediction_6m !== undefined && (
                <div className="flex items-center gap-1.5 text-xs text-foreground">
                  <Activity className="w-3 h-3" />
                  P6m: <span className={getScoreTextColor(profil.prediction_6m)}>{Math.round(profil.prediction_6m)}</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* --- Statistiques C1-C5 --- */}
        <Card variant="role" title="Stats critères" icon={<BarChart3 className="w-4 h-4" />} size="sm">
          <div className="space-y-2.5 text-xs text-foreground">
            <div className="flex items-center justify-between">
              <span>Score moyen</span>
              <span className="font-mono font-bold">{critereMean.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Écart-type</span>
              <span className="font-mono font-medium">±{critereStdDev.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Dispersion</span>
              <span className="font-mono font-medium">{(critereDispersion * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span>Critère min</span>
              <span className="font-mono font-bold text-danger">{critereMin.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Critère max</span>
              <span className="font-mono font-bold text-success">{critereMax.toFixed(1)}</span>
            </div>
            <div className="border-t border-border pt-2 mt-2" />
            <p className="text-[11px] font-semibold text-muted-foreground">Régression linéaire</p>
            {regResult ? (
              <>
                <div className="flex items-center justify-between">
                  <span>R² (détermination)</span>
                  <span className="font-mono font-bold" style={{ color: r2 >= 0.7 ? 'var(--color-success)' : r2 >= 0.4 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                    {r2.toFixed(3)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pente</span>
                  <span className={`font-mono font-medium ${regResult.slope > 0.1 ? 'text-success' : regResult.slope < -0.1 ? 'text-danger' : 'text-foreground'}`}>
                    {regResult.slope > 0 ? '+' : ''}{regResult.slope.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Erreur standard</span>
                  <span className="font-mono font-medium">±{regResult.stdError.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">2 données min. requises (actuel: {scores.length})</p>
            )}
          </div>
        </Card>

        {/* --- Synthèse IA (2x largeur) --- */}
        <div className="lg:col-span-2">
        <Card
          title="Synthèse IA"
          subtitle={synthLoading ? 'Génération IA en cours...' : undefined}
          icon={synthLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : diagnostic.indiceGlobal >= 55 ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          variant="level"
          levelColor={diagnostic.indiceGlobal >= 75 ? 'danger' : diagnostic.indiceGlobal >= 55 ? 'warning' : 'primary'}
          size="sm"
        >
          {synthLoading ? (
            <div className="flex items-center gap-3 py-2">
              <div className="w-5 h-5 rounded-full border-2 border-role-primary border-t-transparent animate-spin" />
              <p className="text-sm text-foreground">Analyse des modeles par IA...</p>
            </div>
          ) : (
            <>
              <p className={`text-sm font-medium ${diagnostic.indiceGlobal >= 75 ? 'text-danger' : diagnostic.indiceGlobal >= 55 ? 'text-warning' : 'text-foreground'}`}>
                {synthIA?.interpretation || diagnostic.interpretation}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-foreground w-16">Confiance</span>
                <div className="progress flex-1 h-1.5">
                  <div className="progress-bar" style={{
                    width: `${diagnostic.confianceGlobale}%`,
                    background: `var(--color-${diagnostic.confianceGlobale >= 70 ? 'success' : diagnostic.confianceGlobale >= 50 ? 'warning' : 'danger'})`,
                  }} />
                </div>
                <span className={`text-xs font-mono font-bold ${diagnostic.confianceGlobale >= 70 ? 'text-success' : diagnostic.confianceGlobale >= 50 ? 'text-warning' : 'text-danger'}`}>
                  {diagnostic.confianceGlobale}%
                </span>
              </div>
              {diagnostic.signauxContradictoires.length > 0 && (
                <details className="text-xs text-warning mt-2">
                  <summary className="cursor-pointer font-medium">⚠ {diagnostic.signauxContradictoires.length} signalement(s) contradictoire(s)</summary>
                  <ul className="mt-1 space-y-1 list-disc list-inside">
                    {diagnostic.signauxContradictoires.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </details>
              )}
              <p className="text-xs text-foreground mt-2">{synthIA?.recommandation || diagnostic.recommandation}</p>
              {synthIA?.elementsClefs && synthIA.elementsClefs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-medium text-foreground mb-1">Éléments clefs :</p>
                  <ul className="space-y-1">
                    {synthIA.elementsClefs.map((e, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <span className="text-role-primary mt-0.5">•</span>
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
        </div>
      </div>

      {/* ═══ ROW 2 — Alertes & Actions ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Alertes actives (conditionnel) --- */}
        {showAlertes && (
          <Card title="Alertes actives" icon={<AlertTriangle className="w-4 h-4" />} variant="level" levelColor="warning">
            <div className="space-y-2">
              {hasProactiveAlert && profil.proactive_alert && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                  <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Niveau {profil.proactive_alert.niveau_urgence}</p>
                    <p className="text-xs text-foreground">{profil.proactive_alert.message_court}</p>
                  </div>
                </div>
              )}
              {hasSystemStress && profil.system_stress && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-warning-soft border border-warning/30">
                  <Activity className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Stress: {Math.round(profil.system_stress.score)} — {profil.system_stress.niveau_stress}</p>
                    <p className="text-xs text-foreground">{profil.system_stress.recommandation}</p>
                  </div>
                </div>
              )}
              {hasHawkes && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-danger-soft border border-danger/30">
                  <Zap className="w-4 h-4 text-danger shrink-0" />
                  <p className="text-sm font-medium text-foreground">Hawkes: {profil.hawkes_intensity!.toFixed(2)} (élevée)</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* --- Écarts critiques + Résilience + Tendance --- */}
        <div className={`space-y-4 ${!showAlertes ? 'lg:col-span-2' : ''}`}>
          {/* Écarts critiques */}
          <Card title="Écarts critiques" icon={<AlertTriangle className="w-4 h-4" />} variant="level" levelColor="danger" size="sm">
            <div className="flex items-center gap-3">
              {nbEcartsCritiques > 0 ? (
                <><span className="text-3xl font-bold text-danger">{nbEcartsCritiques}</span>
                  <span className="text-sm text-foreground">écart{nbEcartsCritiques > 1 ? 's' : ''} critique{nbEcartsCritiques > 1 ? 's' : ''} en attente</span></>
              ) : (
                <><span className="badge success">0</span><span className="text-sm text-foreground">Aucun écart critique</span></>
              )}
            </div>
          </Card>

          {/* Résilience + Tendance compact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ResilienceScoreCard profil={profil} />
            <Card variant="role" title="Tendance" icon={getTendanceIcon(profil.tendance)} size="sm">
              <p className="text-sm font-medium text-foreground capitalize">
                {getTendanceLabel(profil.tendance).toLowerCase()}
                {profil.tendance === 'hausse' && <span className="text-success ml-1">— Amélioration</span>}
                {profil.tendance === 'baisse' && <span className="text-danger ml-1">— Dégradation</span>}
              </p>
              {synthIA?.interpretation && !synthLoading && (
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  {synthIA.interpretation}
                </p>
              )}
              {synthLoading && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Sparkles className="w-3 h-3 text-muted-foreground animate-pulse" />
                  <span className="text-[11px] text-muted-foreground">Analyse IA en cours...</span>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Recommandation du jour */}
      {recommandationDuJour && (
        <RecommandationDuJourCard recommandation={recommandationDuJour} />
      )}

      {/* ═══ ROW 3 — Statut des modèles ═══ */}
      <Card variant="role" title="Statut des modèles" icon={<BarChart3 className="w-4 h-4" />}>
        <div className="space-y-3">
          {/* Résumé */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">
              <span className="font-bold">{diagnostic.votes.length}</span> modèle{diagnostic.votes.length > 1 ? 's' : ''} actif{diagnostic.votes.length > 1 ? 's' : ''} / 10
            </span>
            <span className={`text-xs font-medium ${diagnostic.confianceGlobale >= 70 ? 'text-success' : diagnostic.confianceGlobale >= 40 ? 'text-warning' : 'text-danger'}`}>
              Confiance ensemble: {diagnostic.confianceGlobale}%
            </span>
          </div>
          <div className="progress h-1.5">
            <div className="progress-bar" style={{ width: `${diagnostic.confianceGlobale}%`, background: `var(--color-${diagnostic.confianceGlobale >= 70 ? 'success' : diagnostic.confianceGlobale >= 40 ? 'warning' : 'danger'})` }} />
          </div>

          {/* Grille des modèles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {diagnostic.votes.map(v => {
              const degColor = v.indiceDegradation >= 70 ? 'text-danger' : v.indiceDegradation >= 40 ? 'text-warning' : v.indiceDegradation >= 20 ? 'text-primary' : 'text-success'
              const confColor = v.confiance >= 70 ? 'text-success' : v.confiance >= 40 ? 'text-warning' : 'text-danger'
              return (
                <div key={v.nom} className="rounded-lg border border-border p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{v.nom}</span>
                    <span className={`text-[10px] font-mono font-bold ${degColor}`}>{v.indiceDegradation}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{v.interpretation}</p>
                  <div className="flex items-center gap-2">
                    <div className="progress flex-1 h-1">
                      <div className="progress-bar" style={{ width: `${v.confiance}%`, background: `var(--color-${v.confiance >= 70 ? 'success' : v.confiance >= 40 ? 'warning' : 'danger'})` }} />
                    </div>
                    <span className={`text-[10px] font-mono ${confColor}`}>{v.confiance}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Détails avancés en accordéon */}
          {(hasHMM || hasSurvival || hasInfra) && (
            <details className="text-sm pt-2 border-t border-border">
              <summary className="cursor-pointer font-medium text-foreground text-xs flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-role-primary" />
                Détails avancés des modèles
              </summary>
              <div className="mt-3 space-y-3">
                {hasHMM && profil.hmm_state && (
                  <div className="text-xs text-foreground space-y-1 p-2.5 rounded-lg bg-muted/30">
                    <p className="font-medium">HMM — Markov {profil.hmm_state.isTransitioning && <span className="badge danger pulse text-[10px] ml-1">Transition</span>}</p>
                    <p>État: {profil.hmm_state.currentStateName}</p>
                    <p>Risque transition: {(profil.hmm_state.transitionRisk * 100).toFixed(0)}%</p>
                    {profil.hmm_state.daysToCritical > 0 && <p>Jours avant critique: {profil.hmm_state.daysToCritical}j</p>}
                  </div>
                )}
                {hasSurvival && profil.survival_metrics && (
                  <div className="text-xs grid grid-cols-2 gap-2">
                    <div className="text-center p-2 rounded-lg bg-primary-soft">
                      <p className="text-foreground">Risque incident 90j</p>
                      <p className="text-lg font-bold text-primary">{(profil.survival_metrics.hazard90d * 100).toFixed(1)}%</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-success-soft">
                      <p className="text-foreground">Médiane survie</p>
                      <p className="text-lg font-bold text-success">{profil.survival_metrics.medianDays}j</p>
                    </div>
                  </div>
                )}
                {hasInfra && profil.infrastructure && (
                  <div className="text-xs text-foreground space-y-1 p-2.5 rounded-lg bg-muted/30">
                    <p className="font-medium">Infrastructure</p>
                    <p>Type: {profil.infrastructure.type_entite.replace('_', ' ')}</p>
                    <p>SSLIA: {profil.infrastructure.categorie_sslia}</p>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </Card>

      {/* Matrice risque ICAO dynamique */}
      {(() => {
        if (!evenements || evenements.length === 0) return null
        const icaoMat = computeICaoMatrix(evenements)
        if (icaoMat.size === 0) return null
        const icaoLabels = getICaoLabels()
        return (
          <Card variant="role" title="Matrice risque ICAO dynamique" icon={<Sparkles className="w-4 h-4" />}>
            <p className="text-xs text-foreground mb-3">Fréquence × sévérité des événements de sécurité — calcul dynamique (Doc 9859).</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center text-xs">
                <thead>
                  <tr>
                    <th className="p-2 text-foreground font-medium text-left">Type</th>
                    <th className="p-2 text-foreground font-medium">Fréq./an</th>
                    <th className="p-2 text-foreground font-medium">Probabilité</th>
                    <th className="p-2 text-foreground font-medium">Grav. moy.</th>
                    <th className="p-2 text-foreground font-medium">Sévérité</th>
                    <th className="p-2 text-foreground font-medium">Risque</th>
                    <th className="p-2 text-foreground font-medium">Nb</th>
                  </tr>
                </thead>
                <tbody>
                  {[...icaoMat.entries()].map(([type, cell]: [string, any]) => {
                    const niveauMap: Record<string, { bg: string }> = { critique: { bg: 'bg-danger' }, eleve: { bg: 'bg-warning' }, moyen: { bg: 'bg-primary' }, faible: { bg: 'bg-success' } }
                    const nivCfg = niveauMap[cell.niveau] || { bg: 'bg-muted' }
                    const probaMap: Record<string, string> = { frequente: 'Fréquente', probable: 'Probable', occasionnelle: 'Occasionnelle', improbable: 'Improbable', tres_improbable: 'Très improbable' }
                    const sevMap: Record<string, string> = { catastrophique: 'Catastrophique', critique: 'Critique', majeur: 'Majeur', mineur: 'Mineur', negligeable: 'Négligeable' }
                    return (
                      <tr key={type} className="border-b border-border/50">
                        <td className="p-2 text-left text-foreground font-medium">{type.replace(/_/g, ' ')}</td>
                        <td className="p-2 text-foreground">{cell.freqObservee}</td>
                        <td className="p-2 text-foreground">{probaMap[cell.probabilite] || cell.probabilite}</td>
                        <td className="p-2 text-foreground">{cell.graviteMoyenne}</td>
                        <td className="p-2 text-foreground">{sevMap[cell.severite] || cell.severite}</td>
                        <td className="p-2"><span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white ${nivCfg.bg}`}>{cell.niveau}</span></td>
                        <td className="p-2 text-foreground">{cell.nbEvenements}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-border">
              {icaoLabels.niveaux.map((n: { value: string; label: string; color: string }) => (
                <div key={n.value} className="flex items-center gap-1.5 text-xs text-foreground">
                  <div className={`w-3 h-3 rounded ${n.color === 'danger' ? 'bg-danger' : n.color === 'warning' ? 'bg-warning' : n.color === 'primary' ? 'bg-primary' : 'bg-success'}`} />
                  {n.label}
                </div>
              ))}
            </div>
          </Card>
        )
      })()}

      {/* Tableau de synthèse multicritère */}
      <TendanceTable profil={profil} />
    </div>
  )
}
