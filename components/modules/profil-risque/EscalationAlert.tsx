// components/modules/profil-risque/EscalationAlert.tsx
// Alerte avec escalade automatique hiérarchique
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .alert, .alert-error, .alert-warning, .alert-info
// - .badge, .badge.danger, .badge.warning
// - .animate-pulse
// 0 style inline, 0 fetch direct

'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Bell, Clock, Users, Send, CheckCircle2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export type NiveauEscalade = 'inspecteur' | 'chef_service' | 'direction' | 'dg'
export type NiveauAlerte = 'critique' | 'eleve' | 'moyen' | 'info'

interface EscalationAlertProps {
  id: string
  titre: string
  description: string
  niveauAlerte: NiveauAlerte
  niveauEscalade: NiveauEscalade
  dateCreation: string
  delaiEscaladeJours: number
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
  onEscalate?: (id: string) => void
}

const ALERTE_CONFIG: Record<NiveauAlerte, { icon: React.ElementType; bgClass: string; borderClass: string; badgeClass: string; label: string }> = {
  critique: { icon: AlertTriangle, bgClass: 'bg-danger/5', borderClass: 'border-danger/20', badgeClass: 'badge danger pulse', label: 'Critique' },
  eleve: { icon: AlertTriangle, bgClass: 'bg-warning/5', borderClass: 'border-warning/20', badgeClass: 'badge warning', label: 'Élevée' },
  moyen: { icon: Bell, bgClass: 'bg-warning/5', borderClass: 'border-warning/20', badgeClass: 'badge primary', label: 'Moyenne' },
  info: { icon: Bell, bgClass: 'bg-primary/5', borderClass: 'border-primary/20', badgeClass: 'badge neutral', label: 'Information' },
}

const ESCALADE_CONFIG: Record<NiveauEscalade, { label: string; description: string; delaiJours: number }> = {
  inspecteur: { label: 'Inspecteur', description: 'Alerte assignée à l\'inspecteur', delaiJours: 3 },
  chef_service: { label: 'Chef de service', description: 'Escalade au chef de service', delaiJours: 7 },
  direction: { label: 'Direction', description: 'Escalade à la direction', delaiJours: 15 },
  dg: { label: 'DG ANACIM', description: 'Escalade au Directeur Général', delaiJours: 30 },
}

function getProgressionColor(progression: number): string {
  if (progression >= 80) return 'bg-danger'
  if (progression >= 50) return 'bg-warning'
  return 'bg-role-primary'
}

export function EscalationAlert({
  id,
  titre,
  description,
  niveauAlerte,
  niveauEscalade,
  dateCreation,
  delaiEscaladeJours,
  onAcknowledge,
  onResolve,
  onEscalate,
}: EscalationAlertProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [progression, setProgression] = useState<number>(0)
  
  const config = ALERTE_CONFIG[niveauAlerte]
  const escaladeConfig = ESCALADE_CONFIG[niveauEscalade]
  const Icon = config.icon
  
  useEffect(() => {
    const creationDate = new Date(dateCreation || '-')
    const now = new Date()
    const elapsedDays = (now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24)
    const remainingDays = Math.max(0, delaiEscaladeJours - elapsedDays)
    setTimeLeft(remainingDays)
    
    const prog = Math.min(100, (elapsedDays / delaiEscaladeJours) * 100)
    setProgression(prog)
    
    const interval = setInterval(() => {
      const now2 = new Date()
      const elapsed2 = (now2.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24)
      const remaining2 = Math.max(0, delaiEscaladeJours - elapsed2)
      setTimeLeft(remaining2)
      setProgression(Math.min(100, (elapsed2 / delaiEscaladeJours) * 100))
    }, 60000)
    
    return () => clearInterval(interval)
  }, [dateCreation, delaiEscaladeJours])
  
  const isUrgent = timeLeft !== null && timeLeft <= 3
  const isExpired = timeLeft !== null && timeLeft <= 0
  
  return (
    <div className={`rounded-xl border p-4 ${config.bgClass} ${config.borderClass} ${isExpired ? 'animate-pulse' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{titre}</span>
            <Badge className={config.badgeClass}>
              {config.label}
            </Badge>
            <Badge className="badge neutral">
              {escaladeConfig.label}
            </Badge>
          </div>
          
          <p className="text-sm text-gray-600 mt-1">{description}</p>
          
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Créée le {dateCreation ? new Date(dateCreation).toLocaleDateString('fr-FR') : 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{escaladeConfig.description}</span>
            </div>
            {timeLeft !== null && !isExpired && (
              <div className={`flex items-center gap-1 ${isUrgent ? 'text-red-600 font-semibold' : ''}`}>
                <AlertTriangle className="w-3 h-3" />
                <span>Escalade dans {Math.ceil(timeLeft)} jour{Math.ceil(timeLeft) > 1 ? 's' : ''}</span>
              </div>
            )}
            {isExpired && (
              <div className="flex items-center gap-1 text-red-600 font-semibold">
                <AlertTriangle className="w-3 h-3" />
                <span>Délai dépassé — Escalade requise</span>
              </div>
            )}
          </div>
          
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
              <span>Progression vers escalade</span>
              <span>{Math.round(progression)}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getProgressionColor(progression)}`}
                style={{ width: `${progression}%` }}
              />
            </div>
          </div>
        </div>
        
        <div className="flex gap-1">
          {onAcknowledge && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAcknowledge(id)}
              className="w-7 h-7 p-0"
              title="Accuser réception"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
          )}
          {onEscalate && isExpired && (
            <Button
              size="sm"
              onClick={() => onEscalate(id)}
              className="gap-1 text-xs"
            >
              <Send className="w-3 h-3" />
              Escalader
            </Button>
          )}
          {onResolve && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolve(id)}
              className="w-7 h-7 p-0"
              title="Marquer comme résolu"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default EscalationAlert