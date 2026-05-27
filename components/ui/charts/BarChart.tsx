// components/ui/charts/BarChart.tsx
// ✅ Design system harmonisé - utilise les couleurs du rôle
// ✅ R1: no inline styles - using recharts props only
'use client'

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAppStore } from '@/lib/store'

interface BarConfig {
  key: string
  color?: string
  name: string
}

interface BarChartProps {
  data: Record<string, string | number>[]
  xKey: string
  bars: BarConfig[]
  height?: number
}

// Tooltip personnalisé avec les couleurs du thème
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

export function BarChart({ data, xKey, bars, height = 300 }: BarChartProps) {
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
      <RechartsBarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
        {bars.map(b => (
          <Bar 
            key={b.key} 
            dataKey={b.key} 
            fill={b.color || getRoleColor()} 
            name={b.name} 
            radius={[4, 4, 0, 0]} 
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}