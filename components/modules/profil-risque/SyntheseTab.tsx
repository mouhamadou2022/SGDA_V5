// components/modules/profil-risque/SyntheseTab.tsx
// Synthèse visuelle du profil de risque — gauge, radar, tendance, alertes, HMM, survival, infra

'use client'

import { ProfilRisque } from '@/lib/store'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Activity, Shield, Zap, Clock, Brain } from 'lucide-react'

interface SyntheseTabProps {
  profil: ProfilRisque
  aerodromeName: string
  aerodromeCode: string
  nbEcartsCritiques: number
  userRole: string
}

const RADAR_CRITERES = [
  { key: 'c1' as const, label: 'C1', poids: 20 },
  { key: 'c2' as const, label: 'C2', poids: 20 },
  { key: 'c3' as const, label: 'C3', poids: 20 },
  { key: 'c4' as const, label: 'C4', poids: 15 },
  { key: 'c5' as const, label: 'C5', poids: 25 },
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

function getTendanceBgClass(tendance: string): string {
  switch (tendance) {
    case 'hausse': return 'bg-success-soft border-success/30'
    case 'baisse': return 'bg-danger-soft border-danger/30'
    default: return 'bg-muted/20 border-muted/30'
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Synthèse du profil de risque
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {aerodromeCode}
          </p>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ========== LEFT COLUMN ========== */}
        <div className="space-y-4">
          {/* Risk Gauge */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Score de risque global</h3>
            </div>
            <div className="card-content">
            <div className="flex items-center justify-center gap-6">
              {/* Circular gauge */}
              <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
                {/* Background ring */}
                <circle
                  cx={65}
                  cy={65}
                  r={52}
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth={10}
                  className="dark:stroke-gray-700"
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
                  className="fill-gray-900 dark:fill-white text-2xl font-bold"
                  fontSize="28"
                  fontWeight="bold"
                >
                  {Math.round(score)}
                </text>
                <text
                  x={65}
                  y={80}
                  textAnchor="middle"
                  className="fill-gray-400"
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
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Activity className="w-3.5 h-3.5" />
                    Prévision 3m: <span className={getScoreTextColor(profil.prediction_3m)}>{Math.round(profil.prediction_3m)}</span>
                  </div>
                )}

                {/* Prédiction 6m */}
                {profil.prediction_6m !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Activity className="w-3.5 h-3.5" />
                    Prévision 6m: <span className={getScoreTextColor(profil.prediction_6m)}>{Math.round(profil.prediction_6m)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>

          {/* Radar chart */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Profil par critère</h3>
            </div>
            <div className="card-content">
            <div className="flex justify-center">
              <svg width="220" height="130" viewBox="0 0 110 110">
                {/* Grid rings */}
                {gridRings.map((d, i) => (
                  <polygon
                    key={`ring-${i}`}
                    points={d}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth={0.5}
                    className="dark:stroke-gray-600"
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
                    stroke="#e5e7eb"
                    strokeWidth={0.5}
                    className="dark:stroke-gray-600"
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
                    className="fill-gray-500 dark:fill-gray-400"
                  >
                    {c.label}
                  </text>
                ))}
              </svg>

              {/* Legend */}
              <div className="flex flex-col justify-center gap-1.5 ml-3 text-xs text-gray-500 dark:text-gray-400">
                {RADAR_CRITERES.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2">
                    <span className="w-8">{c.label}</span>
                    <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                      {profil[c.key] ?? '-'}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      / {c.poids}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>

          {/* Tendance */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${getTendanceBgClass(profil.tendance)}`}>
            {getTendanceIcon(profil.tendance)}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tendance {getTendanceLabel(profil.tendance).toLowerCase()}
              </p>
              {profil.last_change_point && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dernier changement: {new Date(profil.last_change_point).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="space-y-4">
          {/* Alertes */}
          {showAlertes && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Alertes actives
                </h3>
              </div>
              <div className="card-content">
              <div className="space-y-2">
                {hasProactiveAlert && profil.proactive_alert && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                    <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Niveau {profil.proactive_alert.niveau_urgence}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {profil.proactive_alert.message_court}
                      </p>
                    </div>
                  </div>
                )}
                {hasSystemStress && profil.system_stress && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-warning-soft border border-warning/30">
                    <Activity className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-warning">
                        Stress système: {Math.round(profil.system_stress.score)} — {profil.system_stress.niveau_stress}
                      </p>
                      <p className="text-xs text-warning">
                        {profil.system_stress.recommandation}
                      </p>
                    </div>
                  </div>
                )}
                {hasHawkes && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-danger-soft border border-danger/30">
                    <Zap className="w-4 h-4 text-danger shrink-0" />
                    <p className="text-sm font-medium text-danger">
                      Hawkes intensity: {profil.hawkes_intensity!.toFixed(2)} (élevée)
                    </p>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {/* HMM — Hidden Markov Model */}
          {hasHMM && profil.hmm_state && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  Modèle HMM
                </h3>
              </div>
              <div className="card-content">
              <div className="flex items-center gap-3">
                <span className="badge primary">{profil.hmm_state.currentStateName}</span>
                {profil.hmm_state.isTransitioning ? (
                  <span className="badge danger pulse flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Transition silencieuse détectée
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Risque transition: {(profil.hmm_state.transitionRisk * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {profil.hmm_state.daysToCritical > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Jours avant critique: {profil.hmm_state.daysToCritical}j
                </p>
              )}
            </div>
            </div>
          )}

          {/* Survival metrics */}
          {hasSurvival && profil.survival_metrics && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  Analyse de survie
                </h3>
              </div>
              <div className="card-content">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded-lg bg-primary-soft">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Risque incident 90j</p>
                  <p className="text-lg font-bold text-primary">
                    {(profil.survival_metrics.hazard90d * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-success-soft">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Médiane survie</p>
                  <p className="text-lg font-bold text-success">
                    {profil.survival_metrics.medianDays}j
                  </p>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Top écarts critiques */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Écarts critiques
              </h3>
            </div>
            <div className="card-content">
            <div className="flex items-center gap-3">
              {nbEcartsCritiques > 0 ? (
                <>
                  <span className="text-3xl font-bold text-danger">
                    {nbEcartsCritiques}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    écart{nbEcartsCritiques > 1 ? 's' : ''} critique{nbEcartsCritiques > 1 ? 's' : ''} en attente
                  </span>
                </>
              ) : (
                <>
                  <span className="badge success">0</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Aucun écart critique
                  </span>
                </>
              )}
            </div>
          </div>
          </div>

          {/* Infrastructure snapshot */}
          {hasInfra && profil.infrastructure && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  Infrastructure
                </h3>
              </div>
              <div className="card-content">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Type</span>
                  <p className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                    {profil.infrastructure.type_entite.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Horaires</span>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {profil.infrastructure.horaires || 'N/A'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400 dark:text-gray-500">Catégorie SSLIA</span>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {profil.infrastructure.categorie_sslia}
                  </p>
                </div>
              </div>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Tableau de synthèse C1-C5 */}
      <div className="card border-border">
        <div className="card-header border-b border-border"><div className="card-title text-sm font-semibold">Synthèse multicritère</div></div>
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>Critère</th>
                <th>Poids</th>
                <th>Score actuel</th>
                <th>Tendance</th>
                <th>Prédiction 3m</th>
                <th>Prédiction 6m</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {[
                { k: 'c1' as const, label: 'C1 — Maturité SGS', poids: 20 },
                { k: 'c2' as const, label: 'C2 — Efficacité PAC', poids: 20 },
                { k: 'c3' as const, label: 'C3 — Conformité technique', poids: 20 },
                { k: 'c4' as const, label: 'C4 — Charge critique', poids: 15 },
                { k: 'c5' as const, label: 'C5 — Résilience', poids: 25 },
              ].map(({ k, label, poids }) => {
                const v = profil[k]
                const pred3 = profil.prediction_3m
                const pred6 = profil.prediction_6m
                const statut = v >= 80 ? '🟢 Excellent' : v >= 60 ? '🔵 Bon' : v >= 30 ? '🟠 Modéré' : '🔴 Critique'
                return (
                  <tr key={k}>
                    <td className="font-medium">{label}</td>
                    <td className="text-muted-foreground">{poids}%</td>
                    <td className={`font-bold ${v >= 80 ? 'text-success' : v >= 60 ? 'text-primary' : v >= 30 ? 'text-warning' : 'text-danger'}`}>{v}/100</td>
                    <td>{profil.tendance === 'hausse' ? '📈 Hausse' : profil.tendance === 'baisse' ? '📉 Baisse' : '➡️ Stable'}</td>
                    <td className={`font-semibold ${pred3 >= 80 ? 'text-success' : pred3 >= 60 ? 'text-primary' : pred3 >= 30 ? 'text-warning' : 'text-danger'}`}>{pred3}/100</td>
                    <td className={`font-semibold ${pred6 >= 80 ? 'text-success' : pred6 >= 60 ? 'text-primary' : pred6 >= 30 ? 'text-warning' : 'text-danger'}`}>{pred6}/100</td>
                    <td className="text-xs">{statut}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
