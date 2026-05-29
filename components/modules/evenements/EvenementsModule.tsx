// components/modules/evenements/EvenementsModule.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import EvenementAnalytics from './EvenementAnalytics'
import { createPortal } from 'react-dom'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection'
import { FormShell } from '@/components/ui/FormShell'
import { Role, GRAVITE_EVENEMENT, TYPES_EVENEMENT } from '@/lib/config'
import { evenementUtils } from '@/lib/evenementUtils'
import {
  AlertTriangle, AlertOctagon, AlertCircle, Info,
  Calendar, MapPin, Plane, Users, FileText,
  Clock, User, CheckCircle2, XCircle, Send,
  Eye, PenSquare, Trash2, Download, Plus,
  Search, Filter, List, BarChart,
  Phone, Mail, MessageSquare, Flame, Activity, X
} from 'lucide-react'
import EvenementWorkflow from './EvenementWorkflow'
import EvenementRapport from './EvenementRapport'
import { EvenementForm } from '@/components/forms/EvenementForm'

interface EvenementsModuleProps {
  user?: { role?: string; aerodrome_id?: string; id?: string; prenom?: string; nom?: string }
  userRole?: Role
  aerodromeId?: string
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

export function EvenementsModule({ user: userProp, userRole: userRoleProp, aerodromeId: aerodromeIdProp }: EvenementsModuleProps) {
  const user = useAppStore((s) => s.user);
  const userRole = (userRoleProp ?? userProp?.role ?? user?.role ?? 'inspector') as Role
  const aerodromeId = aerodromeIdProp ?? userProp?.aerodrome_id ?? user?.aerodrome_id
  const evenements = useAppStore((s) => s.evenements);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const addEvenement = useAppStore((s) => s.addEvenement);
  const updateEvenement = useAppStore((s) => s.updateEvenement);
  const addNotification = useAppStore((s) => s.addNotification);

  // États
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    aerodrome: 'tous',
    gravite: 'tous',
    statut: 'tous',
    periode: 'tous'
  })
  const [showForm, setShowForm] = useState(false)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [showRapport, setShowRapport] = useState(false)
  const [selectedEvenement, setSelectedEvenement] = useState<EvenementSecurite | null>(null)
  const [mounted, setMounted] = useState(false)
  const [viewMode, setViewMode] = useState<'liste' | 'analytics'>('liste')


  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Formulaire nouvel événement
  const [formData, setFormData] = useState({
    aerodrome_id: aerodromeId || '',
    type: TYPES_EVENEMENT[0] as string,
    date: new Date().toISOString().split('T')[0],
    heure: new Date().toTimeString().slice(0, 5),
    localisation: '',
    description: '',
    actions_immediates: '',
    services_alertes: [] as string[],
    aeronef_immatriculation: '',
    aeronef_type: '',
    aeronef_exploitant: '',
    blesses_mortels: 0,
    blesses_graves: 0,
    blesses_legers: 0,
    blesses_indemnes: 0,
    dommages_desc: ''
  })

  // Filtrer les événements
  const filteredEvenements = evenements.filter(evt => {
    if (aerodromeId && evt.aerodrome_id !== aerodromeId) return false
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matches = 
        evt.reference?.toLowerCase().includes(term) ||
        evt.description?.toLowerCase().includes(term) ||
        evt.type?.toLowerCase().includes(term)
      if (!matches) return false
    }

    if (filters.aerodrome !== 'tous' && evt.aerodrome_id !== filters.aerodrome) return false
    if (filters.gravite !== 'tous' && evt.gravite !== filters.gravite) return false
    if (filters.statut !== 'tous' && evt.statut !== filters.statut) return false

    if (filters.periode !== 'tous') {
      const dateEvt = evt.date ? new Date(evt.date) : new Date()
      const now = new Date()
      const diffJours = Math.ceil((now.getTime() - dateEvt.getTime()) / (1000 * 60 * 60 * 24))
      
      if (filters.periode === '7j' && diffJours > 7) return false
      if (filters.periode === '30j' && diffJours > 30) return false
      if (filters.periode === '90j' && diffJours > 90) return false
    }

    return true
  })

  // Grouper par aérodrome
  const evenementsParAerodrome = filteredEvenements.reduce((acc, evt) => {
    const aerodrome = aerodromes.find(a => a.id === evt.aerodrome_id)
    const key = evt.aerodrome_id
    if (!acc[key]) {
      acc[key] = {
        aerodrome,
        evenements: []
      }
    }
    acc[key].evenements.push(evt)
    return acc
  }, {} as Record<string, { aerodrome: any; evenements: any[] }>)

  // Statistiques
  const stats = {
    total: evenements.length,
    critiques: evenements.filter(e => e.gravite === 'CRITIQUE' && e.statut !== 'cloture').length,
    enCours: evenements.filter(e => e.statut === 'en_cours' || e.statut === 'analyse').length,
    ceMois: evenements.filter(e => {
      const date = new Date(e.date)
      const now = new Date()
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }).length
  }

  const getIconeGravite = (gravite: string) => {
    switch(gravite) {
      case 'CRITIQUE': return <Flame className="w-5 h-5 text-danger" />
      case 'ORANGE': return <AlertOctagon className="w-5 h-5 text-warning" />
      case 'JAUNE': return <AlertCircle className="w-5 h-5 text-warning" />
      case 'GRIS': return <Info className="w-5 h-5 text-muted" />
      default: return <Info className="w-5 h-5 text-primary" />
    }
  }

  const getBadgeGravite = (gravite: string) => {
    const styles: Record<string, string> = {
      CRITIQUE: 'badge danger',
      ORANGE: 'badge warning',
      JAUNE: 'badge warning',
      GRIS: 'badge neutral',
      BLEU: 'badge primary'
    }
    return styles[gravite] || 'badge neutral'
  }

  const getBadgeStatut = (statut: string) => {
    const statuts: Record<string, { label: string; className: string }> = {
      'recu': { label: 'Reçu', className: 'badge neutral' },
      'en_cours': { label: 'En cours', className: 'badge primary' },
      'analyse': { label: 'Analyse', className: 'badge warning' },
      'ecart_cree': { label: 'Écart créé', className: 'badge warning' },
      'rapport_redige': { label: 'Rapport', className: 'badge success' },
      'cloture': { label: 'Clôturé', className: 'badge neutral' }
    }
    return statuts[statut] || { label: statut, className: 'badge neutral' }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const gravite: EvenementSecurite['gravite'] = evenementUtils.determinerGravite(formData.type)

    const newEvenement: Omit<EvenementSecurite, 'id' | 'created_at' | 'updated_at'> = {
      aerodrome_id: formData.aerodrome_id,
      reference: `EVT-${new Date().getFullYear()}-${String(evenements.length + 1).padStart(3, '0')}`,
      type: formData.type,
      gravite,
      date: formData.date,
      heure: formData.heure,
      localisation: formData.localisation,
      description: formData.description,
      actions_immediates: formData.actions_immediates,
      services_alertes: formData.services_alertes,
      aeronef: formData.aeronef_immatriculation ? {
        immatriculation: formData.aeronef_immatriculation,
        type: formData.aeronef_type,
        exploitant: formData.aeronef_exploitant
      } : undefined,
      blesses: {
        mortels: formData.blesses_mortels,
        graves: formData.blesses_graves,
        legers: formData.blesses_legers,
        indemnes: formData.blesses_indemnes
      },
      dommages_desc: formData.dommages_desc,
      statut: 'recu' as const,
      created_by: user?.id || '',
    }

    try {
      await addEvenement(newEvenement)
    } catch (error) {
      console.error('Erreur création événement:', error)
      return
    }

    // Notifications selon gravité
    const configGravite = Object.values(GRAVITE_EVENEMENT).find(g => g.niveau === gravite)
    if (configGravite?.sms) {
      addNotification({
        user_id: 'admin',
        type: 'danger',
        title: 'Événement critique',
        message: `Nouvel événement ${formData.type} à ${aerodromes.find(a => a.id === formData.aerodrome_id)?.code_oaci}`,
        canal: 'email_sms'
      })
    }

    setShowForm(false)
    resetForm()
  }

  const resetForm = () => {
    setFormData({
      aerodrome_id: aerodromeId || '',
      type: TYPES_EVENEMENT[0],
      date: new Date().toISOString().split('T')[0],
      heure: new Date().toTimeString().slice(0, 5),
      localisation: '',
      description: '',
      actions_immediates: '',
      services_alertes: [],
      aeronef_immatriculation: '',
      aeronef_type: '',
      aeronef_exploitant: '',
      blesses_mortels: 0,
      blesses_graves: 0,
      blesses_legers: 0,
      blesses_indemnes: 0,
      dommages_desc: ''
    })
  }

  const handleViewWorkflow = (evenement: any) => {
    setSelectedEvenement(evenement)
    setShowWorkflow(true)
  }

  const handleViewRapport = (evenement: any) => {
    setSelectedEvenement(evenement)
    setShowRapport(true)
  }

  // Modale de workflow
  const WorkflowModal = () => {
    if (!showWorkflow || !selectedEvenement) return null

    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => setShowWorkflow(false)}>
        <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border-t-4 border-t-role-primary" onClick={(e) => e.stopPropagation()}>
          <EvenementWorkflow
            evenementId={selectedEvenement.id}
            userRole={userRole}
            onClose={() => setShowWorkflow(false)}
          />
        </div>
      </div>,
      document.body
    )
  }

  // Modale de rapport
  const RapportModal = () => {
    if (!showRapport || !selectedEvenement) return null

    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => setShowRapport(false)}>
        <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border-t-4 border-t-role-primary" onClick={(e) => e.stopPropagation()}>
          <EvenementRapport evenementId={selectedEvenement.id} onClose={() => setShowRapport(false)} />
        </div>
      </div>,
      document.body
    )
  }

  // Modale de création
  const FormModal = () => (
    <FormShell
      open={showForm}
      onClose={() => setShowForm(false)}
      title="Déclarer un événement de sécurité"
      icon={AlertTriangle}
      size="3xl"
      dataRole={userRole}
    >
      <EvenementForm
        mode="declaration"
        aerodromeId={aerodromeId || ''}
        userRole={userRole}
        userId={user?.id || ''}
        onSuccess={() => setShowForm(false)}
        onCancel={() => setShowForm(false)}
      />
    </FormShell>
  )

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="evenements">
      
      {/* En-tête */}
      <ModuleHeader
        icon={<AlertTriangle />}
        title="Événements de sécurité"
        description="Gestion des incidents et alertes"
        actions={<button onClick={() => setShowForm(true)} className="btn btn-primary gap-2">
          <Plus className="w-4 h-4" />
          Nouvel événement
        </button>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <AlertTriangle className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total événements</div>
          <div className="kpi-value">{stats.total}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <Flame className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">Critiques</div>
          <div className="kpi-value text-danger">{stats.critiques}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <Activity className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">En cours</div>
          <div className="kpi-value">{stats.enCours}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <Calendar className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Ce mois</div>
          <div className="kpi-value">{stats.ceMois}</div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="view-toggle">
        <button onClick={() => setViewMode('liste')} className={viewMode === 'liste' ? 'active' : ''}>
          <List className="w-4 h-4" /> Liste
        </button>
        <button onClick={() => setViewMode('analytics')} className={viewMode === 'analytics' ? 'active' : ''}>
          <BarChart className="w-4 h-4" /> Analyse
        </button>
      </div>

      {viewMode === 'liste' && (
        <>

      {/* Barre d'outils - Une seule ligne */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher événement..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          <select 
            value={filters.aerodrome} 
            onChange={(e) => setFilters({...filters, aerodrome: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous aérodromes</option>
            {aerodromes.map(a => (
              <option key={a.id} value={a.id}>{a.code_oaci}</option>
            ))}
          </select>

          <select 
            value={filters.gravite} 
            onChange={(e) => setFilters({...filters, gravite: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Toutes gravités</option>
            <option value="CRITIQUE">Critique</option>
            <option value="ORANGE">Orange</option>
            <option value="JAUNE">Jaune</option>
          </select>

          <select 
            value={filters.statut} 
            onChange={(e) => setFilters({...filters, statut: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous statuts</option>
            <option value="recu">Reçu</option>
            <option value="en_cours">En cours</option>
            <option value="cloture">Clôturé</option>
          </select>
        </div>
      </div>

      {/* Liste des événements par aérodrome */}
      <AccordionGroup spacing="sm">
        {Object.entries(evenementsParAerodrome).map(([aerodromeId, { aerodrome, evenements: evts }]) => {
          return (
            <AccordionSection
              key={aerodromeId}
              icon={<Plane className="w-4 h-4 text-white" />}
              title={<><span className="code-oaci-badge mr-2">{aerodrome?.code_oaci}</span>{aerodrome?.nom}</>}
              badges={
                <>
                  <span className="badge outline">{evts.length} événement{evts.length > 1 ? 's' : ''}</span>
                  {evts.filter(e => e.gravite === 'CRITIQUE').length > 0 && (
                    <span className="badge danger">{evts.filter(e => e.gravite === 'CRITIQUE').length} critique</span>
                  )}
                </>
              }
            >
              {evts.map(evt => {
                const badgeStatut = getBadgeStatut(evt.statut)
                return (
                  <div key={evt.id} className="card overflow-hidden border border-border/60 hover:border-role-primary/30 transition-colors border-l-4 border-l-role-primary">
                    <div className="card-content p-4">
                      <div className="flex items-start justify-between flex-wrap gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          {getIconeGravite(evt.gravite)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="code-oaci-badge text-sm">{evt.reference}</span>
                              <span className={badgeStatut.className}>{badgeStatut.label}</span>
                              <span className="badge outline">{evt.type}</span>
                            </div>
                            <p className="text-small text-muted-foreground mt-1">{evt.description}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {evt.date ? new Date(evt.date).toLocaleDateString('fr-FR') : 'N/A'}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {evt.localisation}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {evt.declarant_nom}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="action-button" onClick={() => handleViewRapport(evt)} title="Voir le rapport">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="action-button" onClick={() => handleViewWorkflow(evt)} title="Workflow">
                            <Activity className="w-4 h-4" />
                          </button>
                          {evt.statut !== 'cloture' && (
                            <button className="action-button" title="Modifier">
                              <PenSquare className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </AccordionSection>
          )
        })}
        {Object.keys(evenementsParAerodrome).length === 0 && (
          <div className="card p-8 text-center text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>Aucun événement trouvé</p>
          </div>
        )}
      </AccordionGroup>

        </>
      )}

      {viewMode === 'analytics' && (
        <EvenementAnalytics aerodromeId={aerodromeId} userRole={userRole} />
      )}

      {/* Modales */}
      {showForm && FormModal()}
      {showWorkflow && WorkflowModal()}
      {showRapport && RapportModal()}
    </div>
  )
}