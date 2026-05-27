// components/modules/profil-risque/RiskGauge.tsx
// Jauge circulaire SVG avec intervalle de confiance
// UTILISE LES CLASSES CSS EXISTANTES :
// - .risk-badge.excellent / .good / .moderate / .critical
// - .badge.warning / .badge.danger / .badge.success
// - .text-role-primary, .bg-role-primary-soft, .border-role-primary
// - .animate-pulse, .animate-float
// 0 style inline, 0 fetch direct

'use client'

import { useMemo } from 'react'

interface RiskGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  confidenceInterval?: { lower: number; upper: number }
  showVelocity?: boolean
  velocity?: number
  niveauVigilance?: 'normal' | 'surveillance' | 'alerte' | 'critique'
  className?: string
}

const SIZE_MAP = {
  sm: { viewBox: 120, radius: 45, strokeWidth: 10, fontSize: 22, labelSize: 10, height: 70 },
  md: { viewBox: 160, radius: 60, strokeWidth: 12, fontSize: 28, labelSize: 11, height: 95 },
  lg: { viewBox: 200, radius: 80, strokeWidth: 14, fontSize: 36, labelSize: 13, height: 120 },
}

function getScoreLevel(score: number): 'faible' | 'moyen' | 'eleve' | 'critique' {
  if (score >= 80) return 'faible'
  if (score >= 60) return 'moyen'
  if (score >= 30) return 'eleve'
  return 'critique'
}

function getBadgeVariant(score: number): string {
  if (score >= 80) return 'badge success'
  if (score >= 60) return 'badge primary'
  if (score >= 30) return 'badge warning'
  return 'badge danger'
}

function getVigilanceBadge(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'badge danger pulse'
    case 'alerte': return 'badge warning'
    case 'surveillance': return 'badge primary'
    default: return 'badge neutral'
  }
}

function getVelocityIcon(vitesse: number): string {
  if (vitesse > 0.5) return '↑↑'
  if (vitesse > 0) return '↑'
  if (vitesse < -0.5) return '↓↓'
  if (vitesse < 0) return '↓'
  return '→'
}

export function RiskGauge({ 
  score, 
  size = 'md', 
  confidenceInterval, 
  showVelocity = false, 
  velocity = 0,
  niveauVigilance = 'normal',
  className = ''
}: RiskGaugeProps) {
  const cfg = SIZE_MAP[size]
  const { viewBox, radius, strokeWidth, fontSize, labelSize, height } = cfg
  const cx = viewBox / 2
  const cy = viewBox / 2

  const startAngle = Math.PI
  const endAngle = 0
  const totalAngle = Math.PI

  const clampedScore = Math.min(100, Math.max(0, score))
  const angle = startAngle - (clampedScore / 100) * totalAngle

  const x0 = cx + radius * Math.cos(startAngle)
  const y0 = cy + radius * Math.sin(startAngle)
  const x1 = cx + radius * Math.cos(angle)
  const y1 = cy + radius * Math.sin(angle)

  const largeArcFlag = clampedScore > 50 ? 1 : 0
  const trackX1 = cx + radius * Math.cos(endAngle)
  const trackY1 = cy + radius * Math.sin(endAngle)

  const trackD = `M ${x0} ${y0} A ${radius} ${radius} 0 1 1 ${trackX1} ${trackY1}`
  const fillD = clampedScore === 0 ? '' : `M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x1} ${y1}`

  // Utilisation des couleurs définies dans les variables CSS
  const getStrokeColor = () => {
    if (clampedScore >= 80) return 'var(--color-success, #16a34a)'
    if (clampedScore >= 60) return 'var(--color-primary, #2563eb)'
    if (clampedScore >= 30) return 'var(--color-warning, #ea580c)'
    return 'var(--color-danger, #dc2626)'
  }
  
  const strokeColor = getStrokeColor()
  const scoreLevel = getScoreLevel(clampedScore)
  const badgeVariant = getBadgeVariant(clampedScore)
  const vigilanceBadge = getVigilanceBadge(niveauVigilance)
  const velocityIcon = getVelocityIcon(velocity)

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${viewBox} ${height}`}
          width={viewBox}
          height={height}
          aria-label={`Score de risque : ${clampedScore}/100`}
          role="img"
          className="drop-shadow-md"
        >
          {/* Zone d'incertitude (intervalle de confiance) */}
          {confidenceInterval && (
            <path
              d={`M ${x0} ${y0} A ${radius - strokeWidth} ${radius - strokeWidth} 0 ${largeArcFlag} 1 ${x1} ${y1}`}
              fill="none"
              stroke={`${strokeColor}30`}
              strokeWidth={strokeWidth + 4}
              strokeLinecap="round"
              className="animate-pulse"
            />
          )}

          {/* Piste de fond - utilise la classe CSS bg-muted via stroke */}
          <path
            d={trackD}
            fill="none"
            className="stroke-muted-foreground/20"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Arc coloré (score) - style via attribut stroke pour la couleur dynamique */}
          {fillD && (
            <path
              d={fillD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          )}

          {/* Score au centre - utilise les classes text-role-* */}
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight="700"
            className={`fill-current ${
              clampedScore >= 80 ? 'text-green-600' :
              clampedScore >= 60 ? 'text-blue-600' :
              clampedScore >= 30 ? 'text-orange-600' :
              'text-red-600'
            }`}
            fontFamily="inherit"
          >
            {clampedScore}
          </text>

          {/* Label /100 */}
          <text
            x={cx}
            y={cy + fontSize / 2 + 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={labelSize - 1}
            className="fill-muted-foreground"
            fontFamily="inherit"
          >
            /100
          </text>

          {/* Niveau */}
          <text
            x={cx}
            y={cy + fontSize / 2 + 6 + labelSize + 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={labelSize}
            fontWeight="600"
            className={`fill-current ${
              clampedScore >= 80 ? 'text-green-600' :
              clampedScore >= 60 ? 'text-blue-600' :
              clampedScore >= 30 ? 'text-orange-600' :
              'text-red-600'
            }`}
            fontFamily="inherit"
          >
            {scoreLevel === 'faible' ? 'Faible' :
             scoreLevel === 'moyen' ? 'Moyen' :
             scoreLevel === 'eleve' ? 'Élevé' : 'Critique'}
          </text>
        </svg>

        {/* Badge intervalle de confiance - classe .badge.outline */}
        {confidenceInterval && (
          <div className="badge outline absolute -top-2 -right-2 text-[10px]">
            ±{Math.round((confidenceInterval.upper - confidenceInterval.lower) / 2)}
          </div>
        )}
      </div>

      {/* Indicateurs supplémentaires avec classes CSS existantes */}
      {showVelocity && (
        <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
          {/* Badge de vélocité - utilise .badge avec variante dynamique */}
          <div className={`badge ${getVigilanceBadge(niveauVigilance)} flex items-center gap-1`}>
            <span className="text-sm">{velocityIcon}</span>
            <span>{Math.abs(velocity).toFixed(1)} pts/mois</span>
          </div>
          
          {/* Alerte de vigilance - utilise .alert avec variante */}
          {niveauVigilance !== 'normal' && (
            <div className={`alert ${
              niveauVigilance === 'critique' ? 'alert-error' :
              niveauVigilance === 'alerte' ? 'alert-warning' :
              'alert-info'
            } !p-1 !m-0 text-xs`}>
              <span className="alert-icon text-xs">
                {niveauVigilance === 'critique' ? '⚠️' : 
                 niveauVigilance === 'alerte' ? '⚡' :
                 '👁️'}
              </span>
              <span className="alert-content text-xs">
                {niveauVigilance === 'critique' ? 'Action immédiate' : 
                 niveauVigilance === 'alerte' ? 'Surveillance renforcée' :
                 'Suivi rapproché'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Badge de niveau de risque - utilise .risk-badge existant */}
        {!showVelocity && (
        <div className={`risk-badge ${scoreLevel} mt-3`}>
          {scoreLevel === 'faible' ? '✓ Faible' :
           scoreLevel === 'moyen' ? '● Moyen' :
           scoreLevel === 'eleve' ? '⚠ Élevé' : '🔴 Critique'}
        </div>
      )}
    </div>
  )
}

export default RiskGauge