// components/modules/certification/CertExpiryAlert.tsx
'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Clock, RefreshCw, Calendar, Bell, X, CheckCircle2 } from 'lucide-react'
import type { Certification } from '@/lib/store'

interface CertExpiryAlertProps {
  certification: Certification
  onRenouvellement: () => void
  onDismiss?: () => void
}

export function CertExpiryAlert({ certification, onRenouvellement, onDismiss }: CertExpiryAlertProps) {
  const [dismissed, setDismissed] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!certification.date_expiration) {
      setDaysRemaining(null)
      return
    }
    const now = new Date()
    const exp = new Date(certification.date_expiration)
    const diffJ = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    setDaysRemaining(diffJ)
  }, [certification.date_expiration])

  if (!certification.date_expiration || daysRemaining === null || daysRemaining > 180 || dismissed) return null

  let variant: 'critical' | 'warning' | 'info' = 'info'
  let message: string
  let icon: React.ReactNode

  if (daysRemaining < 0) {
    return null // Expiré, géré ailleurs
  } else if (daysRemaining < 30) {
    variant = 'critical'
    message = `Expiration critique dans ${daysRemaining} jour${daysRemaining !== 1 ? 's' : ''}`
    icon = <AlertTriangle className="h-5 w-5" />
  } else if (daysRemaining < 90) {
    variant = 'warning'
    message = `Renouvellement recommandé dans ${daysRemaining} jours`
    icon = <Clock className="h-5 w-5" />
  } else {
    variant = 'info'
    message = `Surveiller l'expiration dans ${daysRemaining} jours`
    icon = <Calendar className="h-5 w-5" />
  }

  const getAlertClass = () => {
    switch (variant) {
      case 'critical':
        return 'alert alert-error animate-pulse'
      case 'warning':
        return 'alert alert-warning'
      default:
        return 'alert alert-info'
    }
  }

  const getBadgeClass = () => {
    switch (variant) {
      case 'critical':
        return 'badge danger pulse'
      case 'warning':
        return 'badge warning'
      default:
        return 'badge primary'
    }
  }

  const getButtonClass = () => {
    switch (variant) {
      case 'critical':
        return 'btn-danger'
      case 'warning':
        return 'btn-warning'
      default:
        return 'btn-primary'
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    if (onDismiss) onDismiss()
  }

  const progressPercent = daysRemaining > 0 ? (daysRemaining / 180) * 100 : 0

  return (
    <div className={`${getAlertClass()} rounded-xl shadow-sm animate-fade-up`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="alert-icon">
            {icon}
          </div>
          <div className="alert-content flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <p className={`alert-title ${variant === 'critical' ? 'text-danger' : variant === 'warning' ? 'text-warning' : 'text-primary'}`}>
                {message}
              </p>
              <span className={getBadgeClass()}>
                <Bell className="h-3 w-3 mr-1" />
                J-{daysRemaining}
              </span>
            </div>
            <p className="alert-description">
              Date d'expiration :{' '}
              <span className="font-semibold">
                {new Date(certification.date_expiration).toLocaleDateString('fr-FR', { 
                  day: '2-digit', 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </span>
            </p>
            <p className="text-xs text-muted mt-1">
              Certificat n° {certification.numero_cert || certification.reference}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`${getButtonClass()} gap-1.5 shrink-0`}
            onClick={onRenouvellement}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Lancer le renouvellement
          </button>
          <button
            className="action-button !p-1.5"
            onClick={handleDismiss}
            title="Ignorer cette alerte"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      
      {/* Barre de progression du délai */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>Délai restant</span>
          <span>{daysRemaining} / 180 jours</span>
        </div>
        <div className="progress h-1.5">
          <div 
            className={`progress-bar ${variant === 'critical' ? 'progress-critique' : variant === 'warning' ? 'progress-eleve' : 'progress-moyen'}`}
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default CertExpiryAlert