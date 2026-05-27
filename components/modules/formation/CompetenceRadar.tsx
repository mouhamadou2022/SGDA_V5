// components/modules/formation/CompetenceRadar.tsx
'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

const DOMAINES = ['SGS', 'SLI', 'PHY', 'OPS', 'ANI', 'MET', 'AIS', 'COM']

const COMPETENCES_PAR_INSPECTEUR: Record<string, number[]> = {
  'insp-1': [100, 80, 60, 100, 80, 60, 40, 60],
  'insp-2': [60, 100, 80, 60, 100, 40, 80, 60],
  'insp-3': [80, 60, 100, 80, 60, 100, 60, 80],
  'insp-4': [40, 80, 60, 100, 80, 60, 100, 40],
  'insp-5': [100, 60, 80, 40, 100, 80, 60, 100],
  'insp-6': [60, 40, 100, 80, 40, 100, 80, 60],
  'insp-7': [80, 100, 40, 60, 80, 60, 100, 80],
}

const NIVEAU_REQUIS = 60

function hashCompetences(id: string): number[] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return DOMAINES.map((_, i) => 20 + (Math.abs(h + i * 37) % 81))
}

interface Props {
  inspecteurId: string
  userRole?: string
}

export function CompetenceRadar({ inspecteurId, userRole = 'inspector' }: Props) {
  const niveaux = COMPETENCES_PAR_INSPECTEUR[inspecteurId] ?? hashCompetences(inspecteurId)

  const data = DOMAINES.map((domaine, i) => ({
    domaine,
    Actuelles: niveaux[i],
    Requises: NIVEAU_REQUIS,
  }))

  return (
    <div className="w-full h-80" data-role={userRole}>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="domaine" tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
          <Radar
            name="Compétences actuelles"
            dataKey="Actuelles"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.6}
          />
          <Radar
            name="Niveau requis"
            dataKey="Requises"
            stroke="var(--destructive)"
            fill="var(--destructive)"
            fillOpacity={0.2}
            strokeDasharray="5 5"
          />
          <Legend wrapperStyle={{ color: 'var(--foreground)' }} />
          <Tooltip 
            formatter={(value, name) => [`${value}/100`, name as string]}
            contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default CompetenceRadar