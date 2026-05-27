// components/ui/charts/LineChart.tsx
// ✅ Design system harmonisé - utilise les couleurs du rôle
'use client'

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAppStore } from '@/lib/store'

interface LineConfig {
  key: string
  color?: string
  name: string
}

interface LineChartProps {
  data: Record<string, string | number>[]
  xKey: string
  lines: LineConfig[]
  height?: number
}

// Tooltip personnalisé
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  
  return (
    <div className="bg-popover backdrop-blur-sm rounded-lg border border-border shadow-lg p-3">
      <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function LineChart({ data, xKey, lines, height = 300 }: LineChartProps) {
  const user = useAppStore(s => s.user)
  
  // Utiliser la couleur du rôle comme couleur par défaut
  const getRoleColor = () => {
    const roleColors: Record<string, string> = {
      admin: '#1a237e',
      inspector: '#b45309',
      dg_anacim: '#1b4332',
      dg_operator: '#065f46',
      focal_operator: '#0f766e',
      staff_operator: '#0d9488',
      guest: '#475569',
    }
    return roleColors[user?.role || 'guest'] || '#3b82f6'
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis 
          dataKey={xKey} 
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} 
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={{ stroke: 'var(--border)' }}
        />
        <YAxis 
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} 
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={{ stroke: 'var(--border)' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }}
          iconType="circle"
        />
        {lines.map(l => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            stroke={l.color || getRoleColor()}
            name={l.name}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: 'var(--background)' }}
            activeDot={{ r: 6 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}