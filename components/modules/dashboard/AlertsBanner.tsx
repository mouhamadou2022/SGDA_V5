// components/modules/dashboard/AlertsBanner.tsx
'use client'
// ZÉRO @/components/ui/ import

import { useMemo, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, X, XCircle, Bell, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'

type Priorite = 'CRITIQUE' | 'HAUTE' | 'INFO'

interface Alerte {
  id: string
  priorite: Priorite
  titre: string
  message: string
  module: string
  date?: Date
}

interface AlertsBannerProps {
  userRole: string
}

function getAlertConfig(priorite: Priorite) {
  switch (priorite) {
    case 'CRITIQUE':
      return {
        wrapperClass: 'alert alert-error animate-pulse',
        icon: <AlertTriangle className="h-4 w-4" />,
        badgeClass: 'badge danger animate-pulse',
        badgeLabel: 'CRITIQUE',
      }
    case 'HAUTE':
      return {
        wrapperClass: 'alert alert-warning',
        icon: <AlertCircle className="h-4 w-4" />,
        badgeClass: 'badge warning',
        badgeLabel: 'HAUTE',
      }
    case 'INFO':
    default:
      return {
        wrapperClass: 'alert alert-info',
        icon: <Info className="h-4 w-4" />,
        badgeClass: 'badge primary',
        badgeLabel: 'INFO',
      }
  }
}

export function AlertsBanner({ userRole }: AlertsBannerProps) {
  const certifications = useAppStore(s => s.certifications);
  const ecarts = useAppStore(s => s.ecarts);
  const evenements = useAppStore(s => s.evenements);
  const surveillances = useAppStore(s => s.surveillances);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const alertes: Alerte[] = useMemo(() => {
    const now = new Date()
    const result: Alerte[] = []

    certifications?.forEach((cert) => {
      if (!cert.date_expiration) return
      const exp = new Date(cert.date_expiration)
      const jours = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (jours <= 30 && jours >= 0) {
        result.push({
          id: `cert-exp-${cert.id}`, priorite: 'CRITIQUE',
          titre: 'Certification expirante',
          message: `Certification ${cert.reference} expire dans ${jours} jour(s). Action immédiate requise.`,
          module: 'certification', date: now,
        })
      } else if (jours <= 60 && jours > 30) {
        result.push({
          id: `cert-exp-${cert.id}`, priorite: 'HAUTE',
          titre: 'Renouvellement à planifier',
          message: `Certification ${cert.reference} expire dans ${jours} jours. Planifier le renouvellement.`,
          module: 'certification', date: now,
        })
      }
    })

    ecarts?.forEach((ecart) => {
      if (ecart.niveau_risque === 'critique' && ['ouvert', 'pac_attendu'].includes(ecart.statut)) {
        const created = new Date(ecart.created_at)
        const jours = Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        if (jours > 15) {
          result.push({
            id: `ecart-critique-${ecart.id}`, priorite: 'CRITIQUE',
            titre: 'Écart critique sans PAC',
            message: `Écart ${ecart.reference} sans Plan d'Action Correctif depuis ${jours} jours.`,
            module: 'plans-actions', date: created,
          })
        }
      }
    })

    ecarts?.forEach((ecart) => {
      if (ecart.statut === 'en_retard') {
        result.push({
          id: `ecart-retard-${ecart.id}`, priorite: 'HAUTE',
          titre: 'Écart en retard',
          message: `L'écart ${ecart.reference} a dépassé son délai de traitement.`,
          module: 'plans-actions', date: new Date(ecart.updated_at),
        })
      }
    })

    evenements?.forEach((evt) => {
      if (['recu', 'en_cours'].includes(evt.statut)) {
        const date = new Date(evt.date)
        const jours = Math.ceil((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        result.push({
          id: `evt-attente-${evt.id}`,
          priorite: evt.gravite === 'CRITIQUE' ? 'CRITIQUE' : 'HAUTE',
          titre: 'Événement en attente de traitement',
          message: `Événement ${evt.reference} (${evt.type}) en attente de traitement depuis ${jours} jours.`,
          module: 'evenements', date,
        })
      }
    })

    surveillances?.forEach((surv) => {
      const dateFin = new Date(surv.date_fin)
      const jours = Math.ceil((now.getTime() - dateFin.getTime()) / (1000 * 60 * 60 * 24))
      if (jours > 7 && !['transmise', 'archivee'].includes(surv.statut)) {
        result.push({
          id: `surv-retard-${surv.id}`, priorite: 'HAUTE',
          titre: 'Surveillance en retard',
          message: `Surveillance du ${dateFin.toLocaleDateString('fr-FR')} non finalisée depuis ${jours} jours.`,
          module: 'surveillance', date: dateFin,
        })
      }
    })

    const ordre: Record<Priorite, number> = { CRITIQUE: 0, HAUTE: 1, INFO: 2 }
    return result.sort((a, b) => ordre[a.priorite] - ordre[b.priorite])
  }, [certifications, ecarts, evenements, surveillances])

  const alertesVisibles = alertes.filter(a => !dismissed.has(a.id))
  const dismissAll = () => setDismissed(new Set(alertes.map(a => a.id)))
  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))

  if (alertesVisibles.length === 0) {
    return (
      <div className="card border-success/30 bg-success/5 animate-fade-in">
        <div className="card-content p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-small font-medium text-success">Aucune alerte active</p>
              <p className="text-xs text-muted-foreground">Tous les indicateurs sont au vert</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const critiques = alertesVisibles.filter(a => a.priorite === 'CRITIQUE').length

  return (
    <div className="card animate-fade-in">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-role-primary" />
            <h3 className="card-title text-base">Alertes actives</h3>
            <span className="badge outline">{alertesVisibles.length}</span>
            {critiques > 0 && (
              <span className="badge danger animate-pulse">{critiques} critique(s)</span>
            )}
          </div>
          <button onClick={dismissAll} className="action-button text-xs gap-1">
            <XCircle className="h-3 w-3 inline mr-1" />Tout ignorer
          </button>
        </div>
      </div>
      <div className="card-content">
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {alertesVisibles.map((alerte, idx) => {
            const config = getAlertConfig(alerte.priorite)
            return (
              <div
                key={alerte.id}
                className={`${config.wrapperClass} animate-fade-up group`}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="alert-icon">{config.icon}</div>
                <div className="alert-content flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={config.badgeClass}>{config.badgeLabel}</span>
                    <p className="alert-title">{alerte.titre}</p>
                  </div>
                  <p className="alert-description">{alerte.message}</p>
                  {alerte.date && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Bell className="h-2.5 w-2.5" />
                      {alerte.date.toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(alerte.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
                  aria-label="Ignorer cette alerte"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AlertsBanner
