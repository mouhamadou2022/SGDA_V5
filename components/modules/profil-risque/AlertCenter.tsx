// components/modules/profil-risque/AlertCenter.tsx
'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  BellRing,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  Eye,
  EyeOff,
  Check,
  Clock,
  Calendar,
  Filter,
  Trash2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  Target,
  ChevronRight,
  X,
} from 'lucide-react'
import { useAppStore, ProactiveAlertRecord } from '@/lib/store'

interface AlertCenterProps {
  aerodromeId?: string
  onAlertClick?: (alert: ProactiveAlertRecord) => void
}

type AlertFilter = 'all' | 'critique' | 'alerte' | 'vigilance' | 'info' | 'resolved'

const FILTER_CONFIG: Record<AlertFilter, { label: string; badgeClass: string; icon: React.ElementType }> = {
  all: { label: 'Toutes', badgeClass: 'badge neutral', icon: Bell },
  critique: { label: 'Critiques', badgeClass: 'badge danger', icon: AlertTriangle },
  alerte: { label: 'Alertes', badgeClass: 'badge warning', icon: Zap },
  vigilance: { label: 'Vigilances', badgeClass: 'badge primary', icon: Eye },
  info: { label: 'Informations', badgeClass: 'badge neutral', icon: Info },
  resolved: { label: 'Résolues', badgeClass: 'badge success', icon: CheckCircle2 },
}

function getNiveauUrgenceConfig(urgence: string): { badgeClass: string; icon: React.ElementType; bgClass: string; borderClass: string } {
  switch (urgence) {
    case 'critique':
      return { badgeClass: 'badge danger pulse', icon: AlertTriangle, bgClass: 'bg-danger/5', borderClass: 'border-danger/20' }
    case 'alerte':
      return { badgeClass: 'badge warning', icon: Zap, bgClass: 'bg-warning/5', borderClass: 'border-warning/20' }
    case 'vigilance':
      return { badgeClass: 'badge primary', icon: Eye, bgClass: 'bg-primary/5', borderClass: 'border-primary/20' }
    default:
      return { badgeClass: 'badge neutral', icon: Info, bgClass: 'bg-muted/30', borderClass: 'border-border' }
  }
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "À l'instant"
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours} h`
  if (diffDays === 1) return "Hier"
  if (diffDays < 7) return `Il y a ${diffDays} jours`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function AlertCenter({ aerodromeId, onAlertClick }: AlertCenterProps) {
  const [filter, setFilter] = useState<AlertFilter>('all')
  const [selectedAlert, setSelectedAlert] = useState<ProactiveAlertRecord | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null)

  const proactiveAlerts = useAppStore((state) => state.proactiveAlerts)
  const acknowledgeAlert = useAppStore((state) => state.acknowledgeAlert)
  const resolveAlert = useAppStore((state) => state.resolveAlert)
  const user = useAppStore((state) => state.user)

  const filteredAlerts = useMemo(() => {
    let alerts = aerodromeId
      ? proactiveAlerts.filter(a => a.aerodrome_id === aerodromeId)
      : proactiveAlerts

    if (filter === 'resolved') {
      alerts = alerts.filter(a => a.resolved_at !== null)
    } else if (filter !== 'all') {
      alerts = alerts.filter(a => a.niveau_urgence === filter && a.resolved_at === null)
    } else {
      alerts = alerts.filter(a => a.resolved_at === null)
    }

    return alerts.sort((a, b) => new Date(b.created_at || '-').getTime() - new Date(a.created_at || '-').getTime())
  }, [proactiveAlerts, aerodromeId, filter])

  const stats = useMemo(() => {
    const unresolved = proactiveAlerts.filter(a => !a.resolved_at)
    const critiques = unresolved.filter(a => a.niveau_urgence === 'critique').length
    const alertes = unresolved.filter(a => a.niveau_urgence === 'alerte').length
    const vigilances = unresolved.filter(a => a.niveau_urgence === 'vigilance').length
    const resolved = proactiveAlerts.filter(a => a.resolved_at !== null).length

    return { unresolved: unresolved.length, critiques, alertes, vigilances, resolved }
  }, [proactiveAlerts])

  const handleAcknowledge = async (alertId: string) => {
    setAcknowledgingId(alertId)
    acknowledgeAlert(alertId, user?.id || '')
    setTimeout(() => setAcknowledgingId(null), 500)
  }

  const handleResolve = async (alertId: string) => {
    resolveAlert(alertId)
    setShowDialog(false)
    setSelectedAlert(null)
  }

  const handleAlertClick = (alert: ProactiveAlertRecord) => {
    setSelectedAlert(alert)
    setShowDialog(true)
    if (onAlertClick) onAlertClick(alert)
  }

  return (
    <>
      <div className="card border-l-4 border-l-role-primary">
        <div className="card-header pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="card-title flex items-center gap-2">
                <BellRing className="w-5 h-5 text-blue-600" />
                Centre d'alertes
                {stats.unresolved > 0 && (
                  <span className="badge danger pulse ml-2">
                    {stats.unresolved} non résolue{stats.unresolved > 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Alertes proactives générées par les modèles prédictifs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary gap-1"
                title="Mettre à jour les alertes"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rafraîchir
              </button>
            </div>
          </div>
        </div>

        <div className="card-content space-y-4">
          {/* Statistiques des alertes */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500">Non résolues</p>
              <p className={`text-lg font-bold ${stats.unresolved > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.unresolved}
              </p>
            </div>
            <div className="bg-red-50 rounded-xl p-2 text-center">
              <p className="text-xs text-red-500">Critiques</p>
              <p className="text-lg font-bold text-red-600">{stats.critiques}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-2 text-center">
              <p className="text-xs text-orange-500">Alertes</p>
              <p className="text-lg font-bold text-orange-600">{stats.alertes}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2 text-center">
              <p className="text-xs text-blue-500">Vigilances</p>
              <p className="text-lg font-bold text-blue-600">{stats.vigilances}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-2 text-center">
              <p className="text-xs text-green-500">Résolues</p>
              <p className="text-lg font-bold text-green-600">{stats.resolved}</p>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(FILTER_CONFIG).map(([key, config]) => {
              const Icon = config.icon
              const isActive = filter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key as AlertFilter)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </button>
              )
            })}
          </div>

          {/* Liste des alertes */}
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucune alerte à afficher</p>
              <p className="text-xs mt-1">
                {filter === 'all' ? 'Toutes les alertes ont été traitées' : 'Aucune alerte ne correspond aux filtres'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredAlerts.map((alert, index) => {
                const config = getNiveauUrgenceConfig(alert.niveau_urgence)
                const Icon = config.icon
                const isAcknowledged = alert.acknowledged_at !== null
                const dateFormatted = formatRelativeDate(alert.created_at)

                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-xl border ${config.borderClass} ${config.bgClass} hover:shadow-md transition-all cursor-pointer animate-fade-up group`}
                    style={{ animationDelay: `${index * 0.03}s` }}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">
                            {alert.message_court}
                          </span>
                          <span className={config.badgeClass}>
                            {alert.niveau_urgence === 'critique' ? 'Critique' :
                             alert.niveau_urgence === 'alerte' ? 'Alerte' :
                             alert.niveau_urgence === 'vigilance' ? 'Vigilance' : 'Info'}
                          </span>
                          {isAcknowledged && (
                            <span className="badge success text-[10px]">
                              ✓ Accusé
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {alert.message_long}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {dateFormatted}
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Prob. dégradation: {alert.probabilite_degradation_3m}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isAcknowledged && (
                          <button
                            type="button"
                            className="action-button w-8 h-8 p-0"
                            title="Accuser réception"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAcknowledge(alert.id)
                            }}
                            disabled={acknowledgingId === alert.id}
                          >
                            {acknowledgingId === alert.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-button w-8 h-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAlertClick(alert)
                          }}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {!isAcknowledged && (
                      <div className="mt-2 pt-2 border-t border-dashed border-border">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                            <div className="w-1/2 h-full bg-role-primary rounded-full animate-pulse" />
                          </div>
                          <span className="text-[9px] text-gray-400">En attente d'accusé</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Note */}
          <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
            <span>🚨 Les alertes critiques nécessitent une action immédiate</span>
            <span>{filteredAlerts.length} alerte{filteredAlerts.length > 1 ? 's' : ''} affichée{filteredAlerts.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Modal de détail d'alerte */}
      {showDialog && selectedAlert && typeof window !== 'undefined' && createPortal(
        (() => {
          const conf = getNiveauUrgenceConfig(selectedAlert.niveau_urgence)
          const AlertIcon = conf.icon
          return (
            <div className="modal-overlay" onClick={() => setShowDialog(false)}>
              <div
                className="modal-content max-w-lg border-t-4 border-t-role-primary"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2 className="modal-title flex items-center gap-2">
                    <AlertIcon className="w-5 h-5" />
                    Détail de l'alerte
                  </h2>
                  <button type="button" className="action-button" onClick={() => setShowDialog(false)}>
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="modal-body space-y-4 py-3">
                  <div className={`rounded-xl p-4 ${conf.bgClass}`}>
                    <h3 className="font-semibold text-gray-800">{selectedAlert.message_court}</h3>
                    <p className="text-sm text-gray-600 mt-2">{selectedAlert.message_long}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">Niveau d'urgence</p>
                      <span className={`${conf.badgeClass} mt-1 inline-flex`}>
                        {selectedAlert.niveau_urgence === 'critique' ? 'Critique' :
                         selectedAlert.niveau_urgence === 'alerte' ? 'Alerte' :
                         selectedAlert.niveau_urgence === 'vigilance' ? 'Vigilance' : 'Info'}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">Probabilité de dégradation</p>
                      <p className="text-lg font-bold text-orange-600">{selectedAlert.probabilite_degradation_3m}%</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">Risque seuil 30 (3m)</p>
                      <p className="text-lg font-bold text-red-600">{selectedAlert.probabilite_seuil30_3m}%</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">Date de création</p>
                      <p className="text-sm font-medium">{new Date(selectedAlert.created_at).toLocaleString('fr-FR')}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Action suggérée</p>
                    <p className="text-sm text-blue-700">{selectedAlert.action_suggerer}</p>
                  </div>

                  {selectedAlert.acknowledged_at && (
                    <div className="bg-green-50 rounded-xl p-3">
                      <p className="text-xs text-green-700">✓ Accusé le {new Date(selectedAlert.acknowledged_at).toLocaleString('fr-FR')}</p>
                    </div>
                  )}

                  {selectedAlert.resolved_at && (
                    <div className="bg-green-50 rounded-xl p-3">
                      <p className="text-xs text-green-700">✓ Résolu le {new Date(selectedAlert.resolved_at).toLocaleString('fr-FR')}</p>
                    </div>
                  )}
                </div>

                <div className="modal-footer gap-2">
                  {!selectedAlert.acknowledged_at && (
                    <button
                      type="button"
                      className="btn btn-secondary gap-2"
                      onClick={() => {
                        handleAcknowledge(selectedAlert.id)
                        setShowDialog(false)
                      }}
                    >
                      <Eye className="w-4 h-4" />
                      Accuser réception
                    </button>
                  )}
                  {!selectedAlert.resolved_at && (
                    <button
                      type="button"
                      className="btn btn-primary gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => handleResolve(selectedAlert.id)}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Marquer comme résolu
                    </button>
                  )}
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => setShowDialog(false)}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}
    </>
  )
}

export default AlertCenter
