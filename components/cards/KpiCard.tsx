// components/cards/KpiCard.tsx
'use client'
// ZÉRO @/components/ui/ import

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { type LucideIcon } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  changePercent?: number
  icon: LucideIcon
  colorVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
  description?: string
  onClick?: () => void
}

export function KpiCard({
  label,
  value,
  unit,
  trend,
  changePercent,
  icon: Icon,
  colorVariant = 'primary',
  description,
  onClick
}: KpiCardProps) {

  const trendMap = {
    up: { icon: TrendingUp, cls: 'kpi-trend up' },
    down: { icon: TrendingDown, cls: 'kpi-trend down' },
    stable: { icon: Minus, cls: 'kpi-trend' },
  }

  const trendInfo = trend ? trendMap[trend] : null
  const TrendIcon = trendInfo?.icon

  return (
    <div className="kpi-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <div className="kpi-icon">
        <Icon className="w-5 h-5 text-role-primary" />
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="text-sm font-normal ml-1 text-muted-foreground">{unit}</span>}
      </div>
      {trendInfo && TrendIcon && (
        <div className={trendInfo.cls}>
          <TrendIcon className="w-3 h-3" />
          {changePercent !== undefined && (
            <span>{changePercent > 0 ? '+' : ''}{changePercent}%</span>
          )}
        </div>
      )}
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
  )
}
