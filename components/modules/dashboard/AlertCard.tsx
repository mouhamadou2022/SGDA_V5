// components/modules/dashboard/AlertCard.tsx
// Carte d'alertes temps réel partagée par tous les dashboards
// Agrège les alertes du store et les affiche de manière interactive

'use client'

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { AlertTriangle, Clock, FileText, RefreshCw, Shield, CheckCircle2, TrendingDown } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface AlertItem { id: string; message: string; type: 'danger' | 'warning' | 'info'; icon: React.ElementType; action?: string; actionLabel?: string }

interface Props {
  role: string
  aerodromeId?: string
  onAction?: (action: string) => void
}

export function AlertCard({ role, aerodromeId, onAction }: Props) {
  const surveillances = useAppStore(s => s.surveillances)
  const ecarts = useAppStore(s => s.ecarts)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const recalibrationAlerts = useAppStore(s => s.recalibrationAlerts)
  const plannings = useAppStore(s => s.plannings)
  const user = useAppStore(s => s.user)

  const alerts = useMemo((): AlertItem[] => {
    const items: AlertItem[] = []
    const now = Date.now()
    const userId = user?.id || ''

    // Surveillances à venir (J-7)
    const prochaines7j = surveillances.filter(s => {
      if (aerodromeId && s.aerodrome_id !== aerodromeId) return false
      if (s.statut === 'archivee') return false
      const debut = new Date(s.date_debut).getTime()
      const diff = (debut - now) / 86400000
      return diff > 0 && diff <= 7
    })
    if (prochaines7j.length > 0) {
      items.push({
        id: 'surv-7j', type: 'warning',
        message: `${prochaines7j.length} surveillance(s) prévue(s) dans les 7 jours`,
        icon: Clock, action: 'planning', actionLabel: 'Voir le planning'
      })
    }

    // Écarts sans PAC ou avec délai proche
    const ecartsUrgents = ecarts.filter(e => {
      if (aerodromeId && e.aerodrome_id !== aerodromeId) return false
      if (e.statut === 'cloture') return false
      if (e.statut === 'pac_attendu') {
        const delai = e.delai_pac ? new Date(e.delai_pac).getTime() : 0
        return delai > 0 && (delai - now) / 86400000 <= 7
      }
      return e.statut === 'pac_refuse'
    })
    if (ecartsUrgents.length > 0) {
      items.push({
        id: 'ecarts-pac', type: 'danger',
        message: `${ecartsUrgents.length} écart(s) nécessitent un PAC (délai < 7j)`,
        icon: AlertTriangle, action: 'plans-actions', actionLabel: 'Gérer les écarts'
      })
    }

    // Preuves à soumettre (exploitants) — PAC accepté mais preuves manquantes
    const preuvesAttendues = ecarts.filter(e => {
      if (aerodromeId && e.aerodrome_id !== aerodromeId) return false
      return e.statut === 'pac_accepte' || e.statut === 'preuves_soumises'
    })
    if (preuvesAttendues.length > 0 && ['dg_operator', 'focal_operator', 'staff_operator'].includes(role)) {
      items.push({
        id: 'preuves-attente', type: 'warning',
        message: `${preuvesAttendues.length} écart(s) en attente de preuves`,
        icon: Shield, action: 'operator-ecarts', actionLabel: 'Soumettre les preuves'
      })
    }

    // Aérodromes en score critique
    const critiques = Object.values(profilsRisque).filter(p => {
      if (aerodromeId && p.aerodrome_id !== aerodromeId) return false
      return p.score_global < 30
    })
    if (critiques.length > 0 && ['admin', 'inspector', 'dg_anacim'].includes(role)) {
      items.push({
        id: 'profils-critiques', type: 'danger',
        message: `${critiques.length} aérodrome(s) en score critique`,
        icon: TrendingDown, action: 'risque', actionLabel: 'Voir le profil'
      })
    }

    // Recalibration ML en attente (admin only)
    const pendingAlerts = recalibrationAlerts?.filter(a => !a.traitee) || []
    if (pendingAlerts.length > 0 && role === 'admin') {
      items.push({
        id: 'ml-recal', type: 'warning',
        message: `${pendingAlerts.length} recalibration(s) ML en attente`,
        icon: RefreshCw, action: 'ml-monitoring', actionLabel: 'ML Monitoring'
      })
    }

    // Check-list à signer (délégation inspecteur)
    const aSigner = surveillances.filter(s => {
      if (!s.equipe_ids?.includes(userId)) return false
      return s.statut === 'en_cours'
    })
    if (aSigner.length > 0 && role === 'inspector') {
      items.push({
        id: 'checklist-sign', type: 'warning',
        message: `${aSigner.length} checklist(s) en attente de signature`,
        icon: FileText, action: 'surveillance', actionLabel: 'Ouvrir'
      })
    }

    // Nouveaux écarts (exploitants)
    const nouveauxEcarts = ecarts.filter(e => {
      if (aerodromeId && e.aerodrome_id !== aerodromeId) return false
      return e.statut === 'pac_attendu' && !e.pac
    })
    if (nouveauxEcarts.length > 0 && ['dg_operator', 'focal_operator', 'staff_operator'].includes(role)) {
      items.push({
        id: 'new-ecarts', type: 'danger',
        message: `${nouveauxEcarts.length} nouvel(aux) écart(s) à traiter`,
        icon: AlertTriangle, action: 'operator-ecarts', actionLabel: 'Voir les écarts'
      })
    }

    // PAC en attente de soumission (exploitants)
    const pacEnAttente = ecarts.filter(e => {
      if (aerodromeId && e.aerodrome_id !== aerodromeId) return false
      return e.statut === 'pac_attendu'
    })
    if (pacEnAttente.length > 0 && ['dg_operator', 'focal_operator', 'staff_operator'].includes(role)) {
      items.push({
        id: 'pac-attente', type: 'warning',
        message: `${pacEnAttente.length} PAC à soumettre`,
        icon: Shield, action: 'operator-ecarts', actionLabel: 'Soumettre les PAC'
      })
    }

    return items.slice(0, 6)
  }, [surveillances, ecarts, profilsRisque, recalibrationAlerts, plannings, user, role, aerodromeId])

  if (alerts.length === 0) return (
    <Card variant="level" levelColor="success" title="Alertes en temps réel" icon={<CheckCircle2 className="w-4 h-4 text-success" />} badge={<span className="badge success text-xs">Aucune</span>} headerGradient={false}>
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success-soft">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span className="text-sm">Aucune alerte — tout est à jour</span>
      </div>
    </Card>
  )

  return (
    <Card variant="level" levelColor="danger" title="Alertes en temps réel" icon={<AlertTriangle className="w-4 h-4 text-danger" />} badge={<span className="badge danger text-xs">{alerts.length} active{alerts.length > 1 ? 's' : ''}</span>} headerGradient={false}>
      <div className="space-y-2">
        {alerts.map(alert => (
          <div key={alert.id}
            className={`flex items-center justify-between gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
              alert.type === 'danger' ? 'bg-danger-soft hover:bg-danger-soft/70' :
              alert.type === 'warning' ? 'bg-warning-soft hover:bg-warning-soft/70' :
              'bg-primary-soft hover:bg-primary-soft/70'
            }`}
            onClick={() => alert.action && onAction?.(alert.action)}>
            <div className="flex items-center gap-2.5">
              <alert.icon className={`w-4 h-4 shrink-0 ${alert.type === 'danger' ? 'text-danger' : alert.type === 'warning' ? 'text-warning' : 'text-primary'}`} />
              <span className="text-sm">{alert.message}</span>
            </div>
            {alert.actionLabel && (
              <span className={`text-xs font-medium shrink-0 ${alert.type === 'danger' ? 'text-danger' : alert.type === 'warning' ? 'text-warning' : 'text-primary'}`}>
                {alert.actionLabel} →
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
