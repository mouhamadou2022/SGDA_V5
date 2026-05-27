// components/cards/AlertCard.tsx
'use client'

import {
  AlertTriangle, AlertOctagon, AlertCircle, Info,
  CheckCircle2, Eye, X, Clock, Trash2
} from 'lucide-react'

interface AlertCardProps {
  alerte: {
    id: string
    type: string
    message: string
    severite: 'critique' | 'haute' | 'normale' | 'info'
    date_detection: string
    aerodrome_code?: string
    module_source?: string
    acquittee?: boolean
  }
  onViewDetails?: () => void
  onAcknowledge?: () => void
  onDismiss?: () => void
  onDelete?: () => void
  userRole: string
  compact?: boolean
}

export function AlertCard({
  alerte,
  onViewDetails,
  onAcknowledge,
  onDismiss,
  onDelete,
  userRole,
  compact = false
}: AlertCardProps) {

  const canDelete = ['admin', 'dg_anacim'].includes(userRole)

  const severiteMap = {
    critique: {
      icon: AlertOctagon,
      iconClass: 'text-danger',
      bgClass: 'bg-role-primary-soft',
      borderClass: 'border-l-4 border-l-danger',
      badgeClass: 'badge danger animate-pulse',
      label: 'Critique',
    },
    haute: {
      icon: AlertTriangle,
      iconClass: 'text-warning',
      bgClass: 'bg-role-primary-soft',
      borderClass: 'border-l-4 border-l-warning',
      badgeClass: 'badge warning',
      label: 'Haute',
    },
    normale: {
      icon: AlertCircle,
      iconClass: 'text-role-primary',
      bgClass: 'bg-role-primary-soft',
      borderClass: 'border-l-2 border-l-role-primary',
      badgeClass: 'badge primary',
      label: 'Normale',
    },
    info: {
      icon: Info,
      iconClass: 'text-muted-foreground',
      bgClass: 'bg-role-primary-soft',
      borderClass: '',
      badgeClass: 'badge neutral',
      label: 'Info',
    },
  }

  const config = severiteMap[alerte.severite] || severiteMap.normale
  const Icon = config.icon
  const canAcknowledge = ['admin', 'dg_anacim', 'inspector'].includes(userRole) && !alerte.acquittee

  if (compact) {
    return (
      <div
        className={`card card-compact p-3 ${config.borderClass} ${alerte.acquittee ? 'opacity-60' : ''} hover:shadow-lg transition-all duration-300`}
        data-role={userRole}
      >
        <div className="flex items-start gap-2">
          <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.iconClass}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium line-clamp-2">{alerte.message}</p>
            <div className="flex items-center gap-2 mt-1">
              {alerte.aerodrome_code && (
                <span className="code-oaci-badge text-xs">{alerte.aerodrome_code}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(alerte.date_detection).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {canDelete && onDelete && (
              <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={onDelete}>
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <span className={config.badgeClass}>{config.label}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`card ${config.borderClass} hover:shadow-xl transition-all duration-300 ${alerte.acquittee ? 'opacity-70' : ''}`}
      data-role={userRole}
    >
      <div className="card-content p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg ${config.bgClass} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${config.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className={config.badgeClass}>{config.label}</span>
              {alerte.acquittee && <span className="badge success">Acquittée</span>}
            </div>
            <p className="text-sm font-medium mb-1">{alerte.type}</p>
            <p className="text-xs text-muted-foreground mb-2 line-clamp-3">{alerte.message}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-role-primary" />
                <span>{new Date(alerte.date_detection).toLocaleDateString('fr-FR')}</span>
              </div>
              {alerte.aerodrome_code && (
                <span className="code-oaci-badge">{alerte.aerodrome_code}</span>
              )}
              {alerte.module_source && (
                <span className="badge outline">{alerte.module_source}</span>
              )}
            </div>
          </div>
        </div>

        {!alerte.acquittee && (
          <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border">
            {onViewDetails && (
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onViewDetails} 
                aria-label="Voir détails"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            {canDelete && onDelete && (
              <button
                className="action-button danger hover:bg-danger/10 transition-all duration-200"
                onClick={onDelete}
                aria-label="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {canAcknowledge && onAcknowledge && (
              <button 
                className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" 
                onClick={onAcknowledge} 
                aria-label="Acquitter"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            {onDismiss && (
              <button 
                className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200" 
                onClick={onDismiss} 
                aria-label="Ignorer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}