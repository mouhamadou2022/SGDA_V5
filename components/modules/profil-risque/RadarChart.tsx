'use client'

// components/modules/profil-risque/RadarChart.tsx
// Graphique radar (spider) Recharts avec les 5 critères C1-C5
// ✅ R1 : 0 style inline — uniquement Tailwind + attributs SVG natifs Recharts

import {
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { ProfilRisque } from '@/lib/store'

interface RadarChartProps {
  profil: ProfilRisque
  comparaison?: ProfilRisque
}

const CRITERES_RADAR = [
  { key: 'c1', label: 'C1 Maturité SGS', poids: 20 },
  { key: 'c2', label: 'C2 Efficacité PAC', poids: 25 },
  { key: 'c3', label: 'C3 Conformité', poids: 20 },
  { key: 'c4', label: 'C4 Charge Critique', poids: 20 },
  { key: 'c5', label: 'C5 Résilience', poids: 15 },
]

function getRadarColor(score: number): string {
  if (score >= 80) return '#16a34a'
  if (score >= 60) return '#2563eb'
  if (score >= 30) return '#ea580c'
  return '#dc2626'
}

function buildRadarData(profil: ProfilRisque, comparaison?: ProfilRisque) {
  return CRITERES_RADAR.map((c) => {
    const row: Record<string, string | number> = {
      critere: c.label,
      principal: profil[c.key as keyof ProfilRisque] as number,
    }
    if (comparaison) {
      row.comparaison = comparaison[c.key as keyof ProfilRisque] as number
    }
    return row
  })
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-gray-600">
          <span className="font-medium" style={{ color: entry.color }}>
            {entry.name === 'principal' ? 'Principal' : 'Comparaison'}
          </span>
          : {entry.value}/100
        </p>
      ))}
    </div>
  )
}

export function RadarChart({ profil, comparaison }: RadarChartProps) {
  const data = buildRadarData(profil, comparaison)
  const mainColor = getRadarColor(profil.score_global)
  const compColor = '#7c3aed'

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsRadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="critere"
          tick={{ fontSize: 11, fill: '#6b7280' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickCount={5}
        />
        <Radar
          name="principal"
          dataKey="principal"
          stroke={mainColor}
          fill={mainColor}
          fillOpacity={0.25}
          strokeWidth={2}
        />
        {comparaison && (
          <Radar
            name="comparaison"
            dataKey="comparaison"
            stroke={compColor}
            fill={compColor}
            fillOpacity={0.15}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        {comparaison && (
          <Legend
            formatter={(value) => (value === 'principal' ? 'Sélectionné' : 'Comparaison')}
            iconType="line"
          />
        )}
      </RechartsRadarChart>
    </ResponsiveContainer>
  )
}

export default RadarChart
