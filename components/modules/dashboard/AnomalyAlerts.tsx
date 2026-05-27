// components/modules/dashboard/AnomalyAlerts.tsx
'use client'
// ZÉRO @/components/ui/ import

import { useMemo } from 'react'
import { AlertTriangle, AlertCircle, Clock, Eye, CheckCircle2, ShieldAlert, Flame } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface Anomalie {
  id: string
  type: 'cert_expire_rouge' | 'cert_expire_orange' | 'ecart_critique_sans_pac' | 'sans_surveillance' | 'risque_sans_planning'
  description: string
  aerodrome: string
  aerodromeId: string
  gravite: 'rouge' | 'orange'
  module: string
  valeur?: number
}

interface AnomalyAlertsProps {
  userRole: string
}

const getGraviteStyles = (gravite: 'rouge' | 'orange') => {
  if (gravite === 'rouge') return {
    bgClass: 'bg-danger/10', borderClass: 'border-danger/30',
    hoverBgClass: 'hover:bg-danger/20', textClass: 'text-danger',
    badgeClass: 'badge danger animate-pulse', badgeLabel: 'CRITIQUE',
    icon: <AlertTriangle className="h-4 w-4" />,
  }
  return {
    bgClass: 'bg-warning/10', borderClass: 'border-warning/30',
    hoverBgClass: 'hover:bg-warning/20', textClass: 'text-warning',
    badgeClass: 'badge warning', badgeLabel: 'ATTENTION',
    icon: <AlertCircle className="h-4 w-4" />,
  }
}

const getTypeIcon = (type: Anomalie['type']) => {
  switch (type) {
    case 'cert_expire_rouge': case 'cert_expire_orange': return <ShieldAlert className="h-4 w-4" />
    case 'ecart_critique_sans_pac': return <Flame className="h-4 w-4" />
    case 'sans_surveillance': return <Clock className="h-4 w-4" />
    default: return <AlertCircle className="h-4 w-4" />
  }
}

const getProgressValue = (type: Anomalie['type'], valeur?: number) => {
  if (type === 'cert_expire_rouge' || type === 'cert_expire_orange') return Math.min(100, ((valeur || 0) / 60) * 100)
  if (type === 'ecart_critique_sans_pac') return Math.min(100, ((valeur || 0) / 30) * 100)
  return 0
}

export function AnomalyAlerts({ userRole }: AnomalyAlertsProps) {
  const certifications = useAppStore(s => s.certifications);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const plannings = useAppStore(s => s.plannings);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  const anomalies = useMemo<Anomalie[]>(() => {
    const now = new Date()
    const result: Anomalie[] = []

    certifications?.forEach(cert => {
      if (!cert.date_expiration) return
      const exp = new Date(cert.date_expiration)
      const diffJ = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      const aero = aerodromes?.find(a => a.id === cert.aerodrome_id)
      if (!aero) return
      if (diffJ <= 30 && diffJ >= 0) {
        result.push({ id: `cert-rouge-${cert.id}`, type: 'cert_expire_rouge', description: `Certification expire dans ${diffJ} jour${diffJ !== 1 ? 's' : ''}`, aerodrome: aero.nom, aerodromeId: aero.id, gravite: 'rouge', module: 'certification', valeur: diffJ })
      } else if (diffJ <= 90 && diffJ > 30) {
        result.push({ id: `cert-orange-${cert.id}`, type: 'cert_expire_orange', description: `Certification expire dans ${diffJ} jours`, aerodrome: aero.nom, aerodromeId: aero.id, gravite: 'orange', module: 'certification', valeur: diffJ })
      }
    })

    ecarts?.forEach(e => {
      if (e.niveau_risque !== 'critique') return
      if (['pac_soumis', 'pac_accepte', 'preuves_soumises', 'preuves_evaluees', 'cloture'].includes(e.statut)) return
      const created = new Date(e.created_at)
      const diffJ = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
      if (diffJ > 15) {
        const aero = aerodromes?.find(a => a.id === e.aerodrome_id)
        if (!aero) return
        result.push({ id: `ecart-critique-${e.id}`, type: 'ecart_critique_sans_pac', description: `Écart critique sans PAC depuis ${diffJ} jours`, aerodrome: aero.nom, aerodromeId: aero.id, gravite: 'rouge', module: 'plans-actions', valeur: diffJ })
      }
    })

    const sixMoisAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000)
    aerodromes?.forEach(aero => {
      const survs = surveillances?.filter(s => s.aerodrome_id === aero.id) || []
      if (survs.length === 0) {
        result.push({ id: `sans-surv-${aero.id}`, type: 'sans_surveillance', description: 'Aucune surveillance enregistrée', aerodrome: aero.nom, aerodromeId: aero.id, gravite: 'orange', module: 'surveillance' })
        return
      }
      const derniere = survs.reduce((latest, s) => new Date(s.date_fin) > new Date(latest.date_fin) ? s : latest)
      if (new Date(derniere.date_fin) < sixMoisAgo) {
        const diffMois = Math.floor((now.getTime() - new Date(derniere.date_fin).getTime()) / (1000 * 60 * 60 * 24 * 30))
        result.push({ id: `sans-surv-recent-${aero.id}`, type: 'sans_surveillance', description: `Aucune surveillance depuis ${diffMois} mois`, aerodrome: aero.nom, aerodromeId: aero.id, gravite: 'orange', module: 'surveillance', valeur: diffMois })
      }
    })

    const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    Object.entries(profilsRisque || {}).forEach(([aeroId, profil]) => {
      if ((profil?.score_global || 0) >= 30) return
      const aPlanif = plannings?.some(p => {
        if (p.aerodrome_id !== aeroId || p.statut === 'annulee') return false
        const debut = new Date(p.date_debut)
        return debut >= now && debut <= finMois
      })
      if (!aPlanif) {
        const aero = aerodromes?.find(a => a.id === aeroId)
        if (!aero) return
        result.push({ id: `risque-sans-plan-${aeroId}`, type: 'risque_sans_planning', description: `Score risque critique (${profil?.score_global}/100) — aucune surveillance planifiée ce mois`, aerodrome: aero.nom, aerodromeId: aeroId, gravite: 'rouge', module: 'planning', valeur: profil?.score_global })
      }
    })

    return result
  }, [certifications, ecarts, surveillances, aerodromes, profilsRisque, plannings])

  const countRouge = anomalies.filter(a => a.gravite === 'rouge').length
  const countTotal = anomalies.length

  if (countTotal === 0) {
    return (
      <div className="card border-success/30 bg-success/5 animate-fade-in">
        <div className="card-content p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-small font-medium text-success">Aucune anomalie détectée</p>
              <p className="text-xs text-muted-foreground">Tous les systèmes sont opérationnels</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card animate-fade-in">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h3 className="card-title text-base">Anomalies détectées</h3>
            <span className="badge outline">{countTotal}</span>
            {countRouge > 0 && <span className="badge danger animate-pulse">{countRouge} critique(s)</span>}
          </div>
          <button className="action-button text-xs gap-1" onClick={() => setActiveModule('audit')}>
            <Eye className="h-3 w-3 inline mr-1" />Voir détails
          </button>
        </div>
      </div>
      <div className="card-content">
        <div className="space-y-2">
          {anomalies.map((anomalie, idx) => {
            const styles = getGraviteStyles(anomalie.gravite)
            const progressValue = getProgressValue(anomalie.type, anomalie.valeur)
            return (
              <div
                key={anomalie.id}
                className={`p-3 rounded-xl border ${styles.bgClass} ${styles.borderClass} ${styles.hoverBgClass} transition-all group animate-fade-up`}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-0.5 shrink-0 ${styles.textClass}`}>{getTypeIcon(anomalie.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="code-oaci-badge text-xs">{anomalie.aerodrome}</span>
                        <span className={styles.badgeClass}>{styles.badgeLabel}</span>
                      </div>
                      <p className="text-sm text-foreground mt-1">{anomalie.description}</p>
                      {progressValue > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Niveau de criticité</span>
                            <span className={styles.textClass}>{Math.round(progressValue)}%</span>
                          </div>
                          <div className="progress h-1.5">
                            <div
                              className="progress-bar"
                              style={{
                                width: `${progressValue}%`,
                                backgroundColor: anomalie.gravite === 'rouge' ? 'var(--color-danger)' : 'var(--color-warning)'
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className={`action-button shrink-0 ${styles.textClass}`}
                    onClick={() => setActiveModule(anomalie.module)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1 inline" />Résoudre
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AnomalyAlerts
