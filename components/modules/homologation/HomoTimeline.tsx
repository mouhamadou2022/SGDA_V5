// components/modules/homologation/HomoTimeline.tsx
'use client'

import {
  ClipboardList,
  MapPin,
  Scale,
  CheckCircle2,
  Circle,
  AlertCircle,
  Lock,
} from 'lucide-react'
import type { Homologation } from '@/lib/store'

interface HomoTimelineProps {
  homologation: Homologation
  userRole?: string
}

const PHASES = [
  { num: 1 as const, label: 'Instruction Dossier', icon: ClipboardList },
  { num: 2 as const, label: 'Vérification Terrain', icon: MapPin },
  { num: 3 as const, label: "Décision d'Homologation", icon: Scale },
]

type PhaseStatut = 'complete' | 'actif' | 'futur'

function getStatut(phaseNum: number, homologation: Homologation): PhaseStatut {
  const active = homologation.phase_active
  if (phaseNum < active) return 'complete'
  if (phaseNum === active) {
    if (homologation.statut_global === 'homologue' && phaseNum === 3) return 'complete'
    return 'actif'
  }
  return 'futur'
}

function getDatePhase(phaseNum: number, homologation: Homologation): string | null {
  const key = `phase${phaseNum}` as keyof typeof homologation.phases_data
  const data = homologation.phases_data[key]
  if (!data) return null
  if ('cloture_le' in data && data.cloture_le) return data.cloture_le as string
  if ('date_reception' in data && data.date_reception) return data.date_reception
  return null
}

export function HomoTimeline({ homologation, userRole = 'inspector' }: HomoTimelineProps) {
  return (
    <div className="relative pl-6 animate-fade-in" data-role={userRole}>
      {/* Ligne verticale */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-6">
        {PHASES.map((phase, idx) => {
          const statut = getStatut(phase.num, homologation)
          const date = getDatePhase(phase.num, homologation)
          const Icon = phase.icon

          const dotClass = {
            complete: 'bg-success border-success',
            actif: 'bg-role-primary border-role-primary animate-pulse',
            futur: 'bg-background border-border',
          }[statut]

          const labelClass = {
            complete: 'text-success',
            actif: 'text-role-primary font-bold',
            futur: 'text-muted-foreground',
          }[statut]

          const StatusIcon = {
            complete: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
            actif: <Circle className="h-3.5 w-3.5 text-role-primary" />,
            futur: <Lock className="h-3.5 w-3.5 text-muted-foreground" />,
          }[statut]

          return (
            <div key={phase.num} className="relative flex items-start gap-4">
              {/* Dot */}
              <div
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${dotClass}`}
              >
                <Icon className={`h-3.5 w-3.5 ${statut === 'futur' ? 'text-muted-foreground' : 'text-white'}`} />
              </div>

              {/* Contenu */}
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-small ${labelClass}`}>
                    Phase {phase.num} — {phase.label}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    {StatusIcon}
                    <span>
                      {statut === 'complete' && 'Complété'}
                      {statut === 'actif' && 'En cours'}
                      {statut === 'futur' && 'À venir'}
                    </span>
                  </span>
                </div>
                {date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(date).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HomoTimeline