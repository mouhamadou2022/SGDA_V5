// components/modules/profil-risque/SyntheseTab.tsx
// Synthèse visuelle du profil de risque — gauge, radar, tendance, alertes, HMM, survival, infra

'use client'

import { ProfilRisque } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Activity, Shield, Zap, Clock, Brain } from 'lucide-react'
import { TendanceTable } from './TendanceTable'

interface SyntheseTabProps {
  profil: ProfilRisque
  aerodromeName: string
  aerodromeCode: string
  nbEcartsCritiques: number
  userRole: string
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
    default: return <Minus className="w-5 h-5 text-neutral" />
  }
}

function getTendanceLabel(tendance: string): string {
  switch (tendance) {
    case 'hausse': return 'En hausse'
    case 'baisse': return 'En baisse'
    default: return 'Stable'
  }
}

function getTendanceAlertBg(tendance: string) {
  switch (tendance) {
    case 'hausse': return 'success' as const
    case 'baisse': return 'danger' as const
    default: return 'none' as const
  }
}

export function SyntheseTab({
  profil,
  aerodromeName,
  aerodromeCode,
  nbEcartsCritiques,
  userRole,
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

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Synthèse du profil de risque
          </h2>
          <p className="text-sm text-foreground">
            {aerodromeCode}
          </p>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ========== LEFT COLUMN ========== */}
        <div className="space-y-10">
          {/* Risk Gauge */}
          <Card heading="Score de risque global">
            <div className="flex items-center justify-center gap-6">
              {/* Circular gauge */}
              <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
                {/* Background ring */}
                <circle
                  cx={65}
                  cy={65}
                  r={52}
                  fill="none"
                  stroke="var(--color-muted)"
                  strokeWidth={10}
                />
                {/* Score ring */}
                <circle
                  cx={65}
                  cy={65}
                  r={52}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeDasharray={`${score * 3.267} 326.7`}
                  transform="rotate(-90 65 65)"
                  className="transition-all duration-700"
                />
                {/* Score text */}
                <text
                  x={65}
                  y={60}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize="28"
                  fontWeight="bold"
                >
                  {Math.round(score)}
                </text>
                <text
                  x={65}
                  y={80}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize="12"
                >
                  / 100
                </text>
              </svg>

              <div className="flex flex-col gap-3 items-start">
                {/* Niveau badge */}
                <span className={`${getNiveauBgClass(profil.niveau)}`}>
                  {profil.niveau.toUpperCase()}
                </span>

                {/* Prédiction 3m */}
                {profil.prediction_3m !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground">
                    <Activity className="w-3.5 h-3.5" />
                    Prévision 3m: <span className={getScoreTextColor(profil.prediction_3m)}>{Math.round(profil.prediction_3m)}</span>
                  </div>
                )}

                {/* Prédiction 6m */}
                {profil.prediction_6m !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground">
                    <Activity className="w-3.5 h-3.5" />
                    Prévision 6m: <span className={getScoreTextColor(profil.prediction_6m)}>{Math.round(profil.prediction_6m)}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Radar chart */}
          <Card variant="role" heading="Profil par critère">
            <div className="flex justify-center">
              <svg width="220" height="130" viewBox="0 0 110 110">
                {/* Grid rings */}
                {gridRings.map((d, i) => (
                  <polygon
                    key={`ring-${i}`}
                    points={d}
                    fill="none"
                    stroke="var(--color-muted)"
                    strokeWidth={0.5}
                  />
                ))}
                {/* Axis lines */}
                {axisLines.map((d, i) => (
                  <line
                    key={`axis-${i}`}
                    x1={radarCenterX}
                    y1={radarCenterY}
                    x2={radarCenterX + radarRadius * Math.cos(radarAngles[i])}
                    y2={radarCenterY + radarRadius * Math.sin(radarAngles[i])}
                    stroke="var(--color-muted)"
                    strokeWidth={0.5}
                  />
                ))}
                {/* Data polygon */}
                <polygon
                  points={radarPolygon}
                  fill={ringColor}
                  fillOpacity={0.15}
                  stroke={ringColor}
                  strokeWidth={1.5}
                />
                {/* Data points */}
                {radarPoints.map((p, i) => (
                  <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={2.5} fill={ringColor} />
                ))}
                {/* Labels */}
                {RADAR_CRITERES.map((c, i) => (
                  <text
                    key={`label-${i}`}
                    x={radarCenterX + labelRadius * Math.cos(radarAngles[i])}
                    y={radarCenterY + labelRadius * Math.sin(radarAngles[i]) + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9"
                    className="fill-foreground"
                  >
                    {c.label}
                  </text>
                ))}
              </svg>

              {/* Legend */}
              <div className="flex flex-col justify-center gap-1.5 ml-3 text-xs text-foreground">
                {RADAR_CRITERES.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2">
                    <span className="w-8">{c.label}</span>
                    <span className="font-mono font-medium text-foreground">
                      {profil[c.key] ?? '-'}
                    </span>
                    {c.key === 'c1' && <span className="text-xs text-foreground">({getSgsMaturiteLabel(profil.c1 as number)})</span>}
                    <span className="text-foreground">
                      / {c.poids}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Tendance */}
          <Card variant="alert" alertBg={getTendanceAlertBg(profil.tendance)}>
            <div className="flex items-center gap-3">
              {getTendanceIcon(profil.tendance)}
              <div>
                <p className="text-sm font-medium text-foreground">
                  Tendance {getTendanceLabel(profil.tendance).toLowerCase()}
                </p>
                {profil.last_change_point && (
                  <p className="text-xs text-foreground">
                    Dernier changement: {new Date(profil.last_change_point).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="space-y-10">
          {/* Alertes */}
          {showAlertes && (
            <Card
              title="Alertes actives"
              icon={<AlertTriangle className="w-4 h-4" />}
              variant="level"
              levelColor="warning"
            >
              <div className="space-y-2">
                {hasProactiveAlert && profil.proactive_alert && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                    <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Niveau {profil.proactive_alert.niveau_urgence}
                      </p>
                      <p className="text-xs text-foreground">
                        {profil.proactive_alert.message_court}
                      </p>
                    </div>
                  </div>
                )}
                {hasSystemStress && profil.system_stress && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-warning-soft border border-warning/30">
                    <Activity className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Stress système: {Math.round(profil.system_stress.score)} — {profil.system_stress.niveau_stress}
                      </p>
                      <p className="text-xs text-foreground">
                        {profil.system_stress.recommandation}
                      </p>
                    </div>
                  </div>
                )}
                {hasHawkes && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-danger-soft border border-danger/30">
                    <Zap className="w-4 h-4 text-danger shrink-0" />
                    <p className="text-sm font-medium text-foreground">
                      Hawkes intensity: {profil.hawkes_intensity!.toFixed(2)} (élevée)
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* HMM — Hidden Markov Model */}
          {hasHMM && profil.hmm_state && (
            <Card variant="role" title="Modèle HMM" icon={<Brain className="w-4 h-4" />}>
              <div className="flex items-center gap-3">
                <span className="badge primary">{profil.hmm_state.currentStateName}</span>
                {profil.hmm_state.isTransitioning ? (
                  <span className="badge danger pulse flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Transition silencieuse détectée
                  </span>
                ) : (
                  <span className="text-xs text-foreground">
                    Risque transition: {(profil.hmm_state.transitionRisk * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {profil.hmm_state.daysToCritical > 0 && (
                <p className="text-xs text-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Jours avant critique: {profil.hmm_state.daysToCritical}j
                </p>
              )}
            </Card>
          )}

          {/* Survival metrics */}
          {hasSurvival && profil.survival_metrics && (
            <Card title="Analyse de survie" icon={<Clock className="w-4 h-4" />} variant="level" levelColor="primary">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded-lg bg-primary-soft">
                  <p className="text-xs text-foreground">Risque incident 90j</p>
                  <p className="text-lg font-bold text-primary">
                    {(profil.survival_metrics.hazard90d * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-success-soft">
                  <p className="text-xs text-foreground">Médiane survie</p>
                  <p className="text-lg font-bold text-success">
                    {profil.survival_metrics.medianDays}j
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Top écarts critiques */}
          <Card title="Écarts critiques" icon={<AlertTriangle className="w-4 h-4" />} variant="level" levelColor="danger">
            <div className="flex items-center gap-3">
              {nbEcartsCritiques > 0 ? (
                <>
                  <span className="text-3xl font-bold text-danger">
                    {nbEcartsCritiques}
                  </span>
                  <span className="text-sm text-foreground">
                    écart{nbEcartsCritiques > 1 ? 's' : ''} critique{nbEcartsCritiques > 1 ? 's' : ''} en attente
                  </span>
                </>
              ) : (
                <>
                  <span className="badge success">0</span>
                  <span className="text-sm text-foreground">
                    Aucun écart critique
                  </span>
                </>
              )}
            </div>
          </Card>

          {/* Infrastructure snapshot */}
          {hasInfra && profil.infrastructure && (
            <Card variant="role" title="Infrastructure" icon={<Shield className="w-4 h-4" />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-foreground">Type</span>
                  <p className="font-medium text-foreground capitalize">
                    {profil.infrastructure.type_entite.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-foreground">Horaires</span>
                  <p className="font-medium text-foreground">
                    {profil.infrastructure.horaires || 'N/A'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-foreground">Catégorie SSLIA</span>
                  <p className="font-medium text-foreground">
                    {profil.infrastructure.categorie_sslia}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Tableau de synthèse multicritère */}
      <TendanceTable profil={profil} />
    </div>
  )
}
