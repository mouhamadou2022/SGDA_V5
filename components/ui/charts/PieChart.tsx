// components/ui/charts/PieChart.tsx
// ✅ Design system harmonisé - couleurs adaptées au thème
'use client'

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAppStore } from '@/lib/store'

// Palette de couleurs premium harmonisée avec le design system
const PREMIUM_COLORS = {
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  success: '#10b981',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  indigo: '#6366f1',
  emerald: '#059669',
  amber: '#d97706',
}

const DEFAULT_COLORS = [
  PREMIUM_COLORS.danger,
  PREMIUM_COLORS.warning,
  PREMIUM_COLORS.info,
  PREMIUM_COLORS.success,
  PREMIUM_COLORS.purple,
  PREMIUM_COLORS.cyan,
  PREMIUM_COLORS.pink,
  PREMIUM_COLORS.indigo,
  PREMIUM_COLORS.emerald,
  PREMIUM_COLORS.amber,
]

interface PieChartProps {
  data: Record<string, string | number>[]
  nameKey: string
  valueKey: string
  height?: number
  colors?: string[]
}

// Tooltip personnalisé pour PieChart
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  
  return (
    <div className="bg-popover backdrop-blur-sm rounded-lg border border-border shadow-lg p-3">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: payload[0]?.payload.fill || '#3b82f6' }} />
        <span className="text-sm font-semibold text-foreground">{payload[0]?.name}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Valeur: <span className="font-semibold text-foreground">{payload[0]?.value}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Pourcentage: <span className="font-semibold text-foreground">
          {((payload[0]?.percent ?? 0) * 100).toFixed(1)}%
        </span>
      </p>
    </div>
  )
}

export function PieChart({ 
  data, 
  nameKey, 
  valueKey, 
  height = 300,
  colors = DEFAULT_COLORS 
}: PieChartProps) {
  const user = useAppStore(s => s.user)
  
  // Ajouter la couleur à chaque donnée pour le tooltip
  const enrichedData = data.map((item, index) => ({
    ...item,
    fill: colors[index % colors.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={enrichedData}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={{ stroke: 'var(--border)' }}
          stroke="var(--background)"
          strokeWidth={2}
        >
          {enrichedData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={colors[index % colors.length]}
              className="transition-opacity hover:opacity-80 cursor-pointer"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }}
          iconType="circle"
          formatter={(value) => <span className="text-muted-foreground">{value}</span>}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}