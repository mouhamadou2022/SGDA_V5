// components/modules/formation/CompetenceRadar.tsx
'use client'

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from 'recharts'

interface Props { inspecteurId: string; userRole?: string }

export function CompetenceRadar({ inspecteurId, userRole = 'inspector' }: Props) {
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const inspecteur = inspecteurs.find(i => i.id === inspecteurId)

  const data = useMemo(() => {
    if (!inspecteur) return []
    const competences = inspecteur.competences || []
    const domaines = [...new Set(competences.map(c => c.domaine))]
    return domaines.map(d => {
      const c = competences.find(x => x.domaine === d)
      const niveau = c ? (typeof c.niveau === 'number' ? c.niveau : parseInt(c.niveau as any) || 1) : 1
      return { domaine: d, actuel: niveau * 20, requis: 60 }
    })
  }, [inspecteur])

  if (!inspecteur || data.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Aucune compétence pour cet inspecteur</div>
  }

  return (
    <div className="space-y-4 animate-fade-up" data-role={userRole}>
      <div className="p-3 bg-role-primary-soft rounded-xl">
        <p className="text-sm font-medium">{inspecteur.prenom} {inspecteur.nom}</p>
        <p className="text-xs text-muted-foreground">{inspecteur.service} — {inspecteur.type}</p>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="domaine" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Radar name="Actuel" dataKey="actuel" stroke="var(--role-primary)" fill="var(--role-primary)" fillOpacity={0.3} />
          <Radar name="Requis" dataKey="requis" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeDasharray="4 4" />
          <Tooltip />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default CompetenceRadar