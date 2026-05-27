// components/modules/certification/CertTimeline.tsx
'use client'

import {
  FileText,
  ClipboardList,
  MapPin,
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  AlertCircle,
  Lock,
  Clock,
} from 'lucide-react'
import type { Certification } from '@/lib/store'

interface CertTimelineProps {
  certification: Certification
}

const PHASES = [
  { num: 1 as const, label: "Expression d'Intérêt", icon: FileText, description: "Dépôt de la demande initiale" },
  { num: 2 as const, label: 'Instruction', icon: ClipboardList, description: "Analyse du dossier technique" },
  { num: 3 as const, label: 'Vérification Terrain', icon: MapPin, description: "Visite de vérification sur site" },
  { num: 4 as const, label: 'Délivrance', icon: Award, description: "Émission du certificat" },
  { num: 5 as const, label: 'Publication AIP', icon: BookOpen, description: "Publication officielle" },
]

type PhaseStatut = 'complete' | 'actif' | 'bloque' | 'futur'

function getStatut(phaseNum: number, certification: Certification): PhaseStatut {
  const active = certification.phase_active
  const data = certification.phases_data[`phase${phaseNum}` as keyof typeof certification.phases_data]

  const isBlocked = data && !data.cloture_le && phaseNum === active &&
    (!(data as any).date_reception && !(data as any).documents?.completude)

  if (phaseNum < active) return 'complete'
  if (phaseNum === active) {
    if (certification.statut_global === 'certifie' && phaseNum === 5) return 'complete'
    if (isBlocked) return 'bloque'
    return 'actif'
  }
  return 'futur'
}

function getDatePhase(phaseNum: number, certification: Certification): string | null {
  const key = `phase${phaseNum}` as keyof typeof certification.phases_data
  const data = certification.phases_data[key]
  if (!data) return null
  if ('cloture_le' in data && data.cloture_le) return data.cloture_le as string
  if ('date_reception' in data && (data as any).date_reception) return (data as any).date_reception as string
  if ('date_verification' in data && (data as any).date_verification) return (data as any).date_verification as string
  if ('date_delivrance' in data && (data as any).date_delivrance) return (data as any).date_delivrance as string
  return null
}

function getPhaseDuration(phaseNum: number, certification: Certification): number | null {
  const key = `phase${phaseNum}` as keyof typeof certification.phases_data
  const data = certification.phases_data[key]
  if (!data) return null
  if ('cloture_le' in data && data.cloture_le && (data as any).date_reception) {
    const start = new Date((data as any).date_reception as string)
    const end = new Date(data.cloture_le as string)
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }
  return null
}

export function CertTimeline({ certification }: CertTimelineProps) {
  return (
    <div className="timeline animate-fade-in">
      {PHASES.map((phase, idx) => {
        const statut = getStatut(phase.num, certification)
        const date = getDatePhase(phase.num, certification)
        const duration = getPhaseDuration(phase.num, certification)
        const Icon = phase.icon

        const getDotClass = () => {
          switch (statut) {
            case 'complete': return 'timeline-dot-success'
            case 'actif': return 'timeline-dot'
            case 'bloque': return 'timeline-dot-danger'
            default: return 'timeline-dot opacity-50'
          }
        }

        const getStatusIcon = () => {
          switch (statut) {
            case 'complete': return <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            case 'actif': return <Circle className="h-3.5 w-3.5 text-white animate-pulse" />
            case 'bloque': return <AlertCircle className="h-3.5 w-3.5 text-white" />
            default: return <Lock className="h-3.5 w-3.5 text-white/50" />
          }
        }

        const getStatusBadge = () => {
          switch (statut) {
            case 'complete': return <span className="badge success">Complété</span>
            case 'actif': return <span className="badge primary animate-pulse">En cours</span>
            case 'bloque': return <span className="badge danger pulse">Bloqué</span>
            default: return <span className="badge neutral">À venir</span>
          }
        }

        const getTitleClass = () => {
          switch (statut) {
            case 'complete': return 'text-success'
            case 'actif': return 'text-role-primary font-semibold'
            case 'bloque': return 'text-danger'
            default: return 'text-muted'
          }
        }

        return (
          <div
            key={phase.num}
            className="timeline-item animate-fade-up group"
            style={{ animationDelay: `${idx * 0.08}s` }}
          >
            <div className={`timeline-dot ${getDotClass()}`}>
              {getStatusIcon()}
            </div>
            <div className="timeline-content">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${statut === 'futur' ? 'text-muted' : 'text-role-primary'}`} />
                  <div className={`timeline-title ${getTitleClass()}`}>
                    Phase {phase.num} — {phase.label}
                  </div>
                </div>
                {getStatusBadge()}
              </div>

              <p className="text-xs text-muted mt-0.5">{phase.description}</p>

              {date && (
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <div className="flex items-center gap-1 text-muted">
                    <Clock className="h-3 w-3" />
                    <span>
                      {new Date(date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  {duration !== null && statut === 'complete' && (
                    <div className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Durée: {duration} jour{duration > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              )}

              {statut === 'actif' && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Progression</span>
                    <span>50%</span>
                  </div>
                  <div className="progress h-1.5">
                    <div className="progress-bar" style={{ width: '50%' }} />
                  </div>
                </div>
              )}

              {statut === 'bloque' && (
                <div className="mt-2 text-xs text-danger flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Documents manquants - Action requise</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default CertTimeline
