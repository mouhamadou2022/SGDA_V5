// components/modules/profil-risque/EventTimeline.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Eye,
  FileSearch,
  Clock,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Zap,
} from 'lucide-react'
import { ProfilRisque, Ecart, ChangePointRecord, ProactiveAlertRecord } from '@/lib/store'
import { useAppStore, useHistoricalScores } from '@/lib/store'

interface EventTimelineProps {
  aerodromeId: string
  aerodromeName: string
  profil?: ProfilRisque
}

interface TimelineEvent {
  id: string
  date: string
  type: 'change_point' | 'ecart_critique' | 'alerte_proactive' | 'amelioration' | 'surveillance'
  title: string
  description: string
  impact: number
  niveau: 'critique' | 'eleve' | 'moyen' | 'info'
  icon: React.ElementType
  lien?: string
}

const EVENT_CONFIG: Record<string, {
  badgeClass: string
  dotClass: string
  bgClass: string
  borderClass: string
  label: string
}> = {
  change_point: {
    badgeClass: 'badge warning',
    dotClass: 'bg-warning',
    bgClass: 'bg-warning/5',
    borderClass: 'border-warning/20',
    label: 'Point de rupture'
  },
  ecart_critique: {
    badgeClass: 'badge danger',
    dotClass: 'bg-danger',
    bgClass: 'bg-danger/5',
    borderClass: 'border-danger/20',
    label: 'Écart critique'
  },
  alerte_proactive: {
    badgeClass: 'badge danger pulse',
    dotClass: 'bg-danger animate-pulse',
    bgClass: 'bg-danger/5',
    borderClass: 'border-danger/20',
    label: 'Alerte proactive'
  },
  amelioration: {
    badgeClass: 'badge success',
    dotClass: 'bg-success',
    bgClass: 'bg-success/5',
    borderClass: 'border-success/20',
    label: 'Amélioration'
  },
  surveillance: {
    badgeClass: 'badge primary',
    dotClass: 'bg-primary',
    bgClass: 'bg-primary/5',
    borderClass: 'border-primary/20',
    label: 'Surveillance'
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  const date = new Date(dateStr || '-')
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return "Hier"
  if (diffDays < 7) return `Il y a ${diffDays} jours`
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaine${Math.floor(diffDays / 7) > 1 ? 's' : ''}`

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getImpactLabel(impact: number): string {
  if (impact >= 15) return 'Impact majeur'
  if (impact >= 8) return 'Impact significatif'
  if (impact >= 3) return 'Impact modéré'
  return 'Impact mineur'
}

function getImpactColor(impact: number): string {
  if (impact >= 15) return 'text-red-600'
  if (impact >= 8) return 'text-orange-600'
  if (impact >= 3) return 'text-yellow-600'
  return 'text-blue-600'
}

export function EventTimeline({ aerodromeId, aerodromeName, profil }: EventTimelineProps) {
  const [filter, setFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const eventsPerPage = 5

  const allEcarts = useAppStore((state) => state.ecarts)
  const allChangePoints = useAppStore((state) => state.changePoints)
  const allProactiveAlerts = useAppStore((state) => state.proactiveAlerts)
  const historiqueScores = useHistoricalScores(aerodromeId)

  const ecarts = useMemo(() => allEcarts.filter(e => e.aerodrome_id === aerodromeId), [allEcarts, aerodromeId])
  const changePoints = useMemo(() => allChangePoints.filter(c => c.aerodrome_id === aerodromeId), [allChangePoints, aerodromeId])
  const proactiveAlerts = useMemo(() => allProactiveAlerts.filter(a => a.aerodrome_id === aerodromeId), [allProactiveAlerts, aerodromeId])

  const events = useMemo((): TimelineEvent[] => {
    const result: TimelineEvent[] = []

    changePoints.forEach(cp => {
      result.push({
        id: `cp-${cp.id}`,
        date: cp.detected_at,
        type: 'change_point',
        title: cp.direction === 'degradation' ? 'Dégradation détectée' : 'Amélioration détectée',
        description: `Score ${cp.direction === 'degradation' ? 'passé de' : 'passé de'} ${cp.score_before} à ${cp.score_after} (variation de ${cp.magnitude} points)`,
        impact: cp.magnitude,
        niveau: cp.direction === 'degradation' && cp.magnitude > 10 ? 'critique' : cp.magnitude > 5 ? 'eleve' : 'moyen',
        icon: cp.direction === 'degradation' ? TrendingDown : TrendingUp
      })
    })

    ecarts.filter(e => e.niveau_risque === 'critique' || e.niveau_risque === 'eleve').forEach(ecart => {
      result.push({
        id: `ecart-${ecart.id}`,
        date: ecart.created_at,
        type: 'ecart_critique',
        title: `Écart ${ecart.niveau_risque === 'critique' ? 'critique' : 'de niveau élevé'}`,
        description: `${ecart.reference} - ${ecart.libelle.substring(0, 80)}${ecart.libelle.length > 80 ? '...' : ''}`,
        impact: ecart.niveau_risque === 'critique' ? 20 : 10,
        niveau: ecart.niveau_risque === 'critique' ? 'critique' : 'eleve',
        icon: AlertTriangle,
        lien: `/plans-actions/${ecart.id}`
      })
    })

    proactiveAlerts.forEach(alert => {
      result.push({
        id: `alert-${alert.id}`,
        date: alert.created_at,
        type: 'alerte_proactive',
        title: alert.message_court,
        description: alert.message_long.substring(0, 120),
        impact: alert.niveau_urgence === 'critique' ? 25 : alert.niveau_urgence === 'alerte' ? 15 : 5,
        niveau: alert.niveau_urgence === 'critique' ? 'critique' : alert.niveau_urgence === 'alerte' ? 'eleve' : 'moyen',
        icon: Zap,
        lien: alert.resolved_at ? undefined : `/alertes/${alert.id}`
      })
    })

    if (historiqueScores.length >= 2) {
      for (let i = 1; i < historiqueScores.length; i++) {
        const delta = historiqueScores[i].score - historiqueScores[i-1].score
        if (delta >= 5) {
          result.push({
            id: `improve-${i}`,
            date: historiqueScores[i].date,
            type: 'amelioration',
            title: `Amélioration significative`,
            description: `Le score a augmenté de ${delta} points (${historiqueScores[i-1].score} → ${historiqueScores[i].score})`,
            impact: delta,
            niveau: delta >= 10 ? 'eleve' : 'moyen',
            icon: TrendingUp
          })
        }
      }
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [changePoints, ecarts, proactiveAlerts, historiqueScores])

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events
    return events.filter(e => e.type === filter)
  }, [events, filter])

  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * eventsPerPage
    return filteredEvents.slice(start, start + eventsPerPage)
  }, [filteredEvents, page])

  const totalPages = Math.ceil(filteredEvents.length / eventsPerPage)

  const stats = useMemo(() => {
    return {
      total: events.length,
      critiques: events.filter(e => e.niveau === 'critique').length,
      degradations: events.filter(e => e.type === 'change_point' && e.title.includes('Dégradation')).length,
      ameliorations: events.filter(e => e.type === 'amelioration' || (e.type === 'change_point' && e.title.includes('Amélioration'))).length,
      alertes: events.filter(e => e.type === 'alerte_proactive').length,
      ecartsCritiques: events.filter(e => e.type === 'ecart_critique').length,
    }
  }, [events])

  const filterOptions = [
    { value: 'all', label: 'Tous', count: stats.total, icon: null },
    { value: 'change_point', label: 'Points de rupture', count: events.filter(e => e.type === 'change_point').length, icon: TrendingDown },
    { value: 'ecart_critique', label: 'Écarts critiques', count: stats.ecartsCritiques, icon: AlertTriangle },
    { value: 'alerte_proactive', label: 'Alertes', count: stats.alertes, icon: Zap },
    { value: 'amelioration', label: 'Améliorations', count: stats.ameliorations, icon: TrendingUp },
  ]

  return (
    <div className="card border-l-4 border-l-role-primary">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Timeline des événements
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {aerodromeName} — Historique des événements critiques
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="btn btn-secondary gap-1"
            >
              <Filter className="w-3.5 h-3.5" />
              Filtres
              {filter !== 'all' && (
                <span className="badge primary ml-1 text-[10px]">
                  {filterOptions.find(f => f.value === filter)?.label}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="card-content space-y-4">
        {/* Statistiques rapides */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-2 text-center">
            <p className="text-xs text-red-500">Critiques</p>
            <p className="text-lg font-bold text-red-600">{stats.critiques}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-2 text-center">
            <p className="text-xs text-orange-500">Dégradations</p>
            <p className="text-lg font-bold text-orange-600">{stats.degradations}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-2 text-center">
            <p className="text-xs text-green-500">Améliorations</p>
            <p className="text-lg font-bold text-green-600">{stats.ameliorations}</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-2 text-center">
            <p className="text-xs text-purple-500">Alertes</p>
            <p className="text-lg font-bold text-purple-600">{stats.alertes}</p>
          </div>
        </div>

        {/* Filtres */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl animate-fade-up">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setFilter(opt.value); setPage(1) }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === opt.value ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {opt.icon && <opt.icon className="w-3.5 h-3.5" />}
                {opt.label}
                <span className="badge neutral ml-1 text-[10px]">{opt.count}</span>
              </button>
            ))}
            {filter !== 'all' && (
              <button
                type="button"
                onClick={() => { setFilter('all'); setPage(1) }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* Timeline */}
        {paginatedEvents.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucun événement à afficher</p>
            <p className="text-xs mt-1">Aucun événement ne correspond aux filtres sélectionnés</p>
          </div>
        ) : (
          <div className="timeline">
            {paginatedEvents.map((event, index) => {
              const config = EVENT_CONFIG[event.type]
              const Icon = event.icon
              const impactColor = getImpactColor(event.impact)
              const dateFormatted = formatDate(event.date)

              return (
                <div
                  key={event.id}
                  className="timeline-item animate-fade-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`timeline-dot ${config.dotClass}`} />
                  <div className="timeline-content">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="timeline-date">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {dateFormatted}
                      </span>
                      <span className={`${config.badgeClass} text-[10px]`}>
                        {config.label}
                      </span>
                      {event.impact > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${impactColor}`}
                          title={getImpactLabel(event.impact)}
                        >
                          📊 {event.impact > 0 ? '+' : ''}{event.impact} pts
                        </span>
                      )}
                    </div>
                    <div className="timeline-title flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${
                        event.niveau === 'critique' ? 'text-red-500' :
                        event.niveau === 'eleve' ? 'text-orange-500' :
                        'text-blue-500'
                      }`} />
                      {event.title}
                    </div>
                    <p className="timeline-description">{event.description}</p>
                    {event.lien && (
                      <button
                        type="button"
                        className="mt-2 text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
                        onClick={() => window.location.href = event.lien!}
                      >
                        Voir détails
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`btn btn-secondary gap-1 ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Précédent
            </button>
            <span className="text-xs text-gray-500">
              Page {page} sur {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={`btn btn-secondary gap-1 ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Suivant
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Note de bas */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span>📅 Chronologie des événements importants pour le profil de risque</span>
          <span>{filteredEvents.length} événement{filteredEvents.length > 1 ? 's' : ''} affiché{filteredEvents.length > 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

export default EventTimeline
