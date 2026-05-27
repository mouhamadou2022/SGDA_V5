// components/modules/dashboard/ActivityFeed.tsx
'use client'
// ZÉRO @/components/ui/ import

import { useMemo, useState } from 'react'
import {
  Eye, AlertTriangle, FileText, PenLine, CheckCircle2,
  Clock, Send, Archive, Activity,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'

type Filtre = '1j' | '7j' | '30j'

interface Activite {
  id: string
  type: string
  description: string
  date: Date
  module: string
  icone: React.ReactNode
  severity: 'info' | 'success' | 'warning' | 'danger'
}

function dateRelative(date: Date): string {
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'Hier'
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} jours`
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const severityClasses = {
  info:    { dot: 'bg-primary',  badge: 'badge primary',       iconBg: 'bg-primary/10',  iconColor: 'text-primary'  },
  success: { dot: 'bg-success',  badge: 'badge success',       iconBg: 'bg-success/10',  iconColor: 'text-success'  },
  warning: { dot: 'bg-warning',  badge: 'badge warning',       iconBg: 'bg-warning/10',  iconColor: 'text-warning'  },
  danger:  { dot: 'bg-danger',   badge: 'badge danger animate-pulse', iconBg: 'bg-danger/10', iconColor: 'text-danger' },
}

interface ActivityFeedProps {
  userRole: string
}

export function ActivityFeed({ userRole }: ActivityFeedProps) {
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  const [filtre, setFiltre] = useState<Filtre>('7j')

  const activites: Activite[] = useMemo(() => {
    const liste: Activite[] = []
    const now = new Date()
    const limiteMs = { '1j': 86400 * 1000, '7j': 7 * 86400 * 1000, '30j': 30 * 86400 * 1000 }[filtre]

    surveillances?.forEach((s) => {
      const date = new Date(s.updated_at)
      if (now.getTime() - date.getTime() > limiteMs) return
      let description = ''
      let icone: React.ReactNode = <Eye className="h-3.5 w-3.5" />
      let severity: Activite['severity'] = 'info'
      if (s.statut === 'planifiee')      { description = 'Surveillance planifiée'; icone = <Clock className="h-3.5 w-3.5" /> }
      else if (s.statut === 'en_cours')  { description = 'Surveillance démarrée'; icone = <Eye className="h-3.5 w-3.5" /> }
      else if (s.statut === 'rapport_signe') { description = 'Rapport de surveillance signé'; icone = <PenLine className="h-3.5 w-3.5" />; severity = 'success' }
      else if (s.statut === 'transmise') { description = 'Surveillance transmise'; icone = <Send className="h-3.5 w-3.5" />; severity = 'success' }
      else if (s.statut === 'archivee')  { description = 'Surveillance archivée'; icone = <Archive className="h-3.5 w-3.5" /> }
      else description = 'Surveillance mise à jour'
      liste.push({ id: `surv-${s.id}`, type: 'Surveillance', description, date, module: 'surveillance', icone, severity })
    })

    ecarts?.forEach((e) => {
      const date = new Date(e.updated_at)
      if (now.getTime() - date.getTime() > limiteMs) return
      let description = ''
      let icone: React.ReactNode = <AlertTriangle className="h-3.5 w-3.5" />
      let severity: Activite['severity'] = 'danger'
      if (e.statut === 'pac_soumis')      { description = `PAC soumis pour ${e.reference}`; icone = <FileText className="h-3.5 w-3.5" />; severity = 'warning' }
      else if (e.statut === 'pac_accepte') { description = `PAC accepté — ${e.reference}`; icone = <CheckCircle2 className="h-3.5 w-3.5" />; severity = 'success' }
      else if (e.statut === 'cloture')     { description = `Écart clôturé — ${e.reference}`; icone = <CheckCircle2 className="h-3.5 w-3.5" />; severity = 'success' }
      else if (e.statut === 'ouvert')      { description = `Nouvel écart créé — ${e.reference} (${e.niveau_risque})`; severity = e.niveau_risque === 'critique' ? 'danger' : 'warning' }
      else if (e.statut === 'en_retard')   { description = `Écart en retard — ${e.reference}` }
      else description = `Écart ${e.reference} — ${e.statut}`
      liste.push({ id: `ecart-${e.id}`, type: 'Écart', description, date, module: 'plans-actions', icone, severity })
    })

    certifications?.forEach((c) => {
      const date = new Date(c.updated_at)
      if (now.getTime() - date.getTime() > limiteMs) return
      liste.push({
        id: `cert-${c.id}`, type: 'Certification',
        description: `Certification ${c.reference} — Phase ${c.phase_active} (${c.statut_global})`,
        date, module: 'certification', icone: <PenLine className="h-3.5 w-3.5" />,
        severity: c.statut_global === 'certifie' ? 'success' : 'info',
      })
    })

    homologations?.forEach((h) => {
      const date = new Date(h.updated_at)
      if (now.getTime() - date.getTime() > limiteMs) return
      liste.push({
        id: `homo-${h.id}`, type: 'Homologation',
        description: `Homologation ${h.reference} — Phase ${h.phase_active} (${h.statut_global})`,
        date, module: 'homologation', icone: <FileText className="h-3.5 w-3.5" />,
        severity: h.statut_global === 'homologue' ? 'success' : 'info',
      })
    })

    return liste.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10)
  }, [surveillances, ecarts, certifications, homologations, filtre])

  const filtres: { label: string; value: Filtre }[] = [
    { label: "Aujourd'hui", value: '1j' },
    { label: '7 jours', value: '7j' },
    { label: '30 jours', value: '30j' },
  ]

  return (
    <div className="card animate-fade-in">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <h3 className="card-title flex items-center gap-2">
            <Activity className="h-4 w-4 text-role-primary" />
            Activité récente
            <span className="badge outline ml-2">{activites.length}</span>
          </h3>
          <div className="flex gap-1">
            {filtres.map(f => (
              <button
                key={f.value}
                onClick={() => setFiltre(f.value)}
                className={`text-xs px-2 py-1 rounded-md transition-all ${filtre === f.value ? 'btn-primary' : 'btn-secondary'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card-content">
        {activites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-small">Aucune activité sur cette période</p>
          </div>
        ) : (
          <div className="timeline">
            {activites.map((activite, index) => {
              const s = severityClasses[activite.severity]
              return (
                <div key={activite.id} className="timeline-item group animate-fade-up" style={{ animationDelay: `${index * 0.03}s` }}>
                  <div className={`timeline-dot ${s.dot}`}>
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="timeline-content">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${s.iconBg}`}>
                          <span className={s.iconColor}>{activite.icone}</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${s.iconColor}`}>
                            {activite.type}
                          </span>
                        </div>
                        <p className="text-sm text-foreground truncate max-w-md">{activite.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{dateRelative(activite.date)}</span>
                        <button
                          className="action-button h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setActiveModule(activite.module)}
                        >
                          Voir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivityFeed
