// components/cards/PlanningCard.tsx
'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  PlayCircle,
  Plane,
  Eye,
  PenSquare,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Users,
  MapPin,
  AlertTriangle,
  Star,
  ClipboardList,
  Shield,
  Scale,
  LayoutGrid,
  Target,
  FileText,
  Send,
  X,
  UserCheck,
  Brain,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Save,
  History as HistoryIcon,
  ChevronRight,
} from 'lucide-react'
import { useAppStore, Planning, Aerodrome, Utilisateur, Surveillance, Ecart } from '@/lib/store'
import { DOMAINES_SURVEILLANCE, getDomaineLabel, expandDomaines } from '@/lib/domaines'

function EntiteIcon({ typeEntite }: { typeEntite?: string }) {
  if (typeEntite === 'helistation') return <span className="flex-shrink-0" style={{ fontSize: '0.95rem', lineHeight: 1 }}>🚁</span>
  if (typeEntite === 'mixte')       return <span className="flex-shrink-0" style={{ fontSize: '0.8rem',  lineHeight: 1 }}>✈🚁</span>
  return <Plane className="h-4 w-4 text-role-primary flex-shrink-0" />
}

interface PlanningCardProps {
  planning: Planning
  aerodrome?: Aerodrome
  onExecute?: (planning: Planning) => void
  onPrepare?: (planning: Planning) => void
  onView?: (planning: Planning) => void
  onEdit?: (planning: Planning) => void
  onDelete?: (planning: Planning) => void
  isLancee?: boolean
  surveillanceId?: string
  userRole?: string
  profilScore?: number
  onSuggestionIA?: (planning: Planning) => void
}

// ─────────────────────────────────────────────────────────────
// MODALE DE PRÉPARATION (COMPLÈTE - SANS MOCK)
// ─────────────────────────────────────────────────────────────

interface PreparationModalProps {
  planning: Planning
  aerodrome?: Aerodrome
  onClose: () => void
  onOpenChecklist: (type: 'standard' | 'suivi' | 'pac' | 'mixte') => void
  onOpenSGS: () => void
}

function PreparationModal({ planning, aerodrome, onClose, onOpenChecklist, onOpenSGS }: PreparationModalProps) {
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  
  const getSurveillanceBadge = (statut: string) => {
    const labels: Record<string, string> = {
      'planifiee': 'Planifié',
      'en_cours': 'En cours',
      'checklist_signee': 'Checklist signée',
      'ecarts_signes': 'Écarts signés',
      'rapport_signe': 'Rapport signé',
      'lettre_signee': 'Lettre signée',
      'transmise': 'Exécuté avec succès',
      'archivee': 'Archivée'
    };
    const classes: Record<string, string> = {
      'planifiee': 'outline',
      'en_cours': 'warning',
      'checklist_signee': 'primary',
      'ecarts_signes': 'primary',
      'rapport_signe': 'success',
      'lettre_signee': 'success',
      'transmise': 'success',
      'archivee': 'neutral'
    };
    return { label: labels[statut] || statut, cls: classes[statut] || 'neutral' };
  };

  // Délégations — via le store (réactif)
  const getDelegationsBySurveillance = useAppStore(s => s.getDelegationsBySurveillance)
  const addDelegation               = useAppStore(s => s.addDelegation)
  const updateDelegation            = useAppStore(s => s.updateDelegation)
  const deleteDelegation            = useAppStore(s => s.deleteDelegation)
  
  const profil = profilsRisque[planning.aerodrome_id]
  const [isLoading, setIsLoading] = useState(false)
  const [delegations, setDelegations] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'profil' | 'historique' | 'checklist' | 'delegation'>('profil')
  const [delegationsSaved, setDelegationsSaved] = useState(false)
  const [showTypeChoice, setShowTypeChoice] = useState(false)
  
  // Récupérer les inspecteurs disponibles depuis le store
  const inspecteursDisponibles = useMemo(() => {
    return utilisateurs.filter((u: Utilisateur) => u.role === 'inspector' && u.statut !== 'inactif')
  }, [utilisateurs])
  
  // Récupérer les domaines depuis DOMAINES_SURVEILLANCE
  const domainesList = useMemo(() => {
    if (planning.portee && planning.portee.length > 0) {
      // Si des domaines sont spécifiés dans le planning, les utiliser
      return planning.portee.map(code => ({
        code,
        label: getDomaineLabel(code),
      }))
    }
    // Sinon, utiliser tous les domaines sauf AGA
    return DOMAINES_SURVEILLANCE
      .filter(d => d.code !== 'AGA')
      .map(d => ({ code: d.code, label: d.label }))
  }, [planning.portee])
  
  // Récupérer les surveillances précédentes
  const surveillancesPrecedentes = useMemo(() => {
    return surveillances
      .filter((s: Surveillance) => s.aerodrome_id === planning.aerodrome_id)
      .sort((a: Surveillance, b: Surveillance) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
      .slice(0, 3)
  }, [surveillances, planning.aerodrome_id])
  
  // Détection du type de checklist
  const detectChecklistType = (): 'standard' | 'suivi' | 'pac' | 'mixte' => {
    const ecartsActifs = ecarts.filter((e: Ecart) => 
      e.aerodrome_id === planning.aerodrome_id && 
      e.statut !== 'cloture'
    )
    const aDesEcarts = ecartsActifs.length > 0
    const aDesPac = ecartsActifs.some((e: Ecart) => e.pac)
    
    if (aDesEcarts && aDesPac) return 'mixte'
    if (aDesPac) return 'pac'
    if (aDesEcarts) return 'suivi'
    return 'standard'
  }
  
  const checklistType = detectChecklistType()
  
  const getTypeLabel = () => {
    switch (checklistType) {
      case 'mixte': return 'Checklist MIXTE (Standard + Écarts + PAC)'
      case 'suivi': return 'Checklist SUIVI DES ÉCARTS'
      case 'pac': return 'Checklist MISE EN ŒUVRE PAC'
      default: return 'Checklist STANDARD'
    }
  }
  
  const getTypeIcon = () => {
    switch (checklistType) {
      case 'mixte': return <LayoutGrid className="w-5 h-5" />
      case 'suivi': return <AlertTriangle className="w-5 h-5" />
      case 'pac': return <CheckCircle2 className="w-5 h-5" />
      default: return <ClipboardList className="w-5 h-5" />
    }
  }
  
  const getTendanceIcon = () => {
    if (!profil) return <Minus className="w-4 h-4 text-gray-400" />
    if (profil.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />
    if (profil.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger animate-pulse" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }
  
  const getProfilColor = () => {
    if (!profil) return 'text-gray-500'
    if (profil.score_global < 30) return 'text-danger'
    if (profil.score_global < 60) return 'text-warning'
    return 'text-success'
  }
  
  const handleSaveDelegations = async () => {
    const nbDelegations = Object.keys(delegations).filter(d => delegations[d]).length
    
    // Pour chaque délégation, sauvegarder dans le store
    for (const [domaineCode, inspecteurId] of Object.entries(delegations)) {
      if (inspecteurId) {
        // Vérifier si une délégation existe déjà
        const existingDelegation = getDelegationsBySurveillance?.(planning.id)?.find(
          (d: any) => d.domaine === domaineCode
        )
        
        if (existingDelegation) {
          updateDelegation?.(existingDelegation.id, { assigne_a: inspecteurId })
        } else {
          addDelegation?.({
            surveillance_id: planning.id,
            aerodrome_id: planning.aerodrome_id,
            chef_id: planning.chef_id,
            domaine: domaineCode,
            assigne_a: inspecteurId,
            assigne_par: user?.id || '',
            items_ids: [],
            progression: 0,
            statut: 'en_cours',
            assigne_le: new Date().toISOString(),
            derniere_activite: new Date().toISOString(),
            derniere_sync: new Date().toISOString(),
          })
        }
      }
    }
    
    setDelegationsSaved(true)
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Délégations enregistrées',
      message: `${nbDelegations} domaine(s) assigné(s) - La checklist s'ouvrira avec cette répartition`,
      canal: 'in_app',
    })
    setTimeout(() => setDelegationsSaved(false), 2000)
  }
  
  const handlePrefillChecklist = () => {
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Pré-remplissage',
      message: 'La checklist sera pré-remplie avec les données historiques à l\'ouverture',
      canal: 'in_app',
    })
  }

  const handleNotifyOperator = () => {
    const operateurs = utilisateurs.filter((u: Utilisateur) =>
      u.aerodrome_id === planning.aerodrome_id &&
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
    )
    const domainesLabels = (planning.portee || []).map(getDomaineLabel).join(', ')
    const checklistUrl = `${window.location.origin}/preparation-checklist/${planning.id}`

    operateurs.forEach((op: Utilisateur) => {
      addNotification({
        user_id: op.id,
        type: 'info',
        title: `Checklist à préparer — ${aerodrome?.code_oaci || ''}`,
        message: `La checklist de surveillance (${domainesLabels}) est disponible. Ouvrez-la ici : ${checklistUrl}`,
        canal: 'in_app',
      })
      addNotification({
        user_id: op.id,
        type: 'info',
        title: `Checklist à préparer — ${aerodrome?.code_oaci || ''}`,
        message: `La checklist de surveillance (${domainesLabels}) est disponible. Ouvrez-la ici : ${checklistUrl}`,
        canal: 'email',
      })
    })

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Checklist envoyée',
      message: `Checklist envoyée à ${operateurs.length} exploitant(s) (in-app + email)`,
      canal: 'in_app',
    })
  }

  const handleOpenChecklist = () => {
    setIsLoading(true)
    const portee = planning.portee || []
    const isSgsOnly = portee.length === 1 && portee[0] === 'SGS'
    const hasSGS = portee.includes('SGS')
    const ecartsActifs = (ecarts || []).filter((e: Ecart) => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture')
    const hasSuivi = ecartsActifs.length > 0
    const hasPAC = ecartsActifs.some((e: Ecart) => e.pac)

    const possibleTypes: { type: string; label: string; icon: string }[] = []
    if (isSgsOnly) {
      possibleTypes.push({ type: 'sgs', label: 'Évaluation SGS (PAOE)', icon: 'Shield' })
    } else {
      possibleTypes.push({ type: 'standard', label: 'Checklist Standard', icon: 'ClipboardList' })
      if (hasSGS) possibleTypes.push({ type: 'sgs', label: 'Évaluation SGS (PAOE)', icon: 'Shield' })
    }
    if (hasSuivi) possibleTypes.push({ type: 'suivi', label: 'Suivi des écarts', icon: 'AlertTriangle' })
    if (hasPAC) possibleTypes.push({ type: 'pac', label: 'Mise en œuvre PAC', icon: 'CheckCircle2' })
    if (possibleTypes.length > 1 && !isSgsOnly) {
      setIsLoading(false)
      setShowTypeChoice(true)
      return
    }
    const chosenType = possibleTypes[0]?.type || 'standard'

    setTimeout(() => {
      if (chosenType === 'sgs') {
        onOpenSGS()
      } else {
        onOpenChecklist(chosenType as 'standard' | 'suivi' | 'pac' | 'mixte')
      }
      setIsLoading(false)
      onClose()
    }, 300)
  }
  
  return createPortal(
    <>
      <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          
          {/* Header */}
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2">
              <FileText className="w-5 h-5 text-role-primary" />
              Préparation de la surveillance - {aerodrome?.code_oaci} {aerodrome?.nom}
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Body */}
          <div className="modal-body p-5 space-y-5">
            
            {/* Informations générales */}
            <div className="card border-border">
              <div className="card-content p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Aérodrome</p>
                      <p className="font-medium text-sm">{aerodrome?.code_oaci} - {aerodrome?.nom}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Période</p>
                      <p className="font-medium text-sm">
                        {new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Équipe</p>
                      <p className="font-medium text-sm">{planning.equipe_ids?.length || 0} inspecteur(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium text-sm capitalize">{planning.type?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Onglets */}
            <div className="border-b border-border">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab('profil')}
                  className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg ${
                    activeTab === 'profil' 
                      ? 'bg-role-primary text-white shadow-md' 
                      : 'text-muted-foreground hover:text-role-primary hover:bg-role-primary-soft'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 inline mr-2" />
                  Profil de risque
                </button>
                <button
                  onClick={() => setActiveTab('historique')}
                  className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg ${
                    activeTab === 'historique' 
                      ? 'bg-role-primary text-white shadow-md' 
                      : 'text-muted-foreground hover:text-role-primary hover:bg-role-primary-soft'
                  }`}
                >
                  <HistoryIcon className="w-4 h-4 inline mr-2" />
                  Historique
                </button>
                <button
                  onClick={() => setActiveTab('checklist')}
                  className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg ${
                    activeTab === 'checklist' 
                      ? 'bg-role-primary text-white shadow-md' 
                      : 'text-muted-foreground hover:text-role-primary hover:bg-role-primary-soft'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 inline mr-2" />
                  Checklist
                </button>
                <button
                  onClick={() => setActiveTab('delegation')}
                  className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg ${
                    activeTab === 'delegation' 
                      ? 'bg-role-primary text-white shadow-md' 
                      : 'text-muted-foreground hover:text-role-primary hover:bg-role-primary-soft'
                  }`}
                >
                  <UserCheck className="w-4 h-4 inline mr-2" />
                  Délégation
                </button>
              </div>
            </div>
            
            {/* Contenu onglet PROFIL DE RISQUE */}
            {activeTab === 'profil' && profil && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="card border-border">
                    <div className="card-content p-3 text-center">
                      <p className="text-xs text-muted-foreground">Score global</p>
                      <p className={`text-3xl font-bold ${getProfilColor()}`}>{profil.score_global}/100</p>
                      {profil.niveau && (
                        <span className="badge mt-1">Niveau: {profil.niveau}</span>
                      )}
                    </div>
                  </div>
                  <div className="card border-border">
                    <div className="card-content p-3 text-center">
                      <p className="text-xs text-muted-foreground">Tendance</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {getTendanceIcon()}
                        <span className="text-lg font-medium capitalize">{profil.tendance || 'stable'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="card border-border">
                    <div className="card-content p-3 text-center">
                      <p className="text-xs text-muted-foreground">Prédiction N+1</p>
                      <p className="text-lg font-medium">{profil.prediction_3m || profil.score_global}/100</p>
                    </div>
                  </div>
                </div>
                
                <div className="card border-border">
                  <div className="card-header">
                    <div className="card-title text-sm">Détail des critères</div>
                  </div>
                  <div className="card-content space-y-3">
                    {[
                      { label: 'C1 - Maturité SGS', value: profil.c1, color: 'bg-primary' },
                      { label: 'C2 - Efficacité PAC', value: profil.c2, color: 'bg-primary' },
                      { label: 'C3 - Conformité', value: profil.c3, color: 'bg-primary' },
                      { label: 'C4 - Charge critique', value: profil.c4, color: 'bg-primary' },
                      { label: 'C5 - Résilience', value: profil.c5, color: 'bg-primary' },
                    ].map(crit => (
                      <div key={crit.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span>{crit.label}</span>
                          <span className="font-medium">{crit.value}/100</span>
                        </div>
                        <div className="progress h-1.5">
                          <div className={`progress-bar ${crit.value < 40 ? 'bg-danger' : crit.value < 60 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${crit.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {profil.velocity_metrics && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="card border-border">
                      <div className="card-content p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Vitesse</p>
                        <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-danger' : 'text-success'}`}>
                          {profil.velocity_metrics.vitesse > 0 ? '+' : ''}{profil.velocity_metrics.vitesse.toFixed(1)} pts/mois
                        </p>
                      </div>
                    </div>
                    <div className="card border-border">
                      <div className="card-content p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Accélération</p>
                        <p className="text-sm font-semibold">{profil.velocity_metrics.acceleration.toFixed(1)}</p>
                      </div>
                    </div>
                    <div className="card border-border">
                      <div className="card-content p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Volatilité</p>
                        <p className="text-sm font-semibold">{profil.velocity_metrics.volatilite.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Contenu onglet HISTORIQUE */}
            {activeTab === 'historique' && (
              <div className="space-y-3 animate-fade-in">
                {surveillancesPrecedentes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucune surveillance antérieure</p>
                  </div>
                ) : (
                  surveillancesPrecedentes.map((s: Surveillance) => (
                    <div key={s.id} className="card border-border">
                      <div className="card-content p-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-sm font-medium capitalize">{s.type?.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(s.date_debut).toLocaleDateString('fr-FR')} → {new Date(s.date_fin).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <span className={`badge ${getSurveillanceBadge(s.statut).cls}`}>
                            {getSurveillanceBadge(s.statut).label}
                          </span>
                        </div>
                        {s.progression !== undefined && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span>Progression</span>
                              <span>{s.progression}%</span>
                            </div>
                            <div className="progress h-1">
                              <div className="progress-bar" style={{ width: `${s.progression}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )))}
                </div>
              )}

              {/* Contenu onglet DÉLÉGATION */}
              {activeTab === 'delegation' && (
                <div className="space-y-3 animate-fade-in">
                  {DOMAINES_SURVEILLANCE.filter(d => planning.portee?.includes(d.code)).map(d => (
                    <div key={d.code} className="flex items-center justify-between gap-4 p-3 rounded-xl border border-border hover:bg-role-primary-soft/10 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4 text-role-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{getDomaineLabel(d.code)}</p>
                          <p className="text-xs text-muted-foreground">{d.code}</p>
                        </div>
                      </div>
                      <select value={delegations[d.code] || ''} onChange={e => setDelegations(prev => ({ ...prev, [d.code]: e.target.value }))} className="input max-w-[200px] text-sm">
                        <option value="">Non assigné</option>
                        {inspecteursDisponibles.map((insp: Utilisateur) => (
                          <option key={insp.id} value={insp.id}>
                            {insp.prenom} {insp.nom} ({insp.service || 'Inspecteur'})
                          </option>
                        ))}
                      </select>
                      {delegations[d.code] && (
                        <button onClick={() => { setDelegations(prev => ({ ...prev, [d.code]: '' })); addNotification({ user_id: user?.id || '', type: 'info', title: 'Délégation annulée', message: `${d.code} n'est plus assigné`, canal: 'in_app' }); }} className="btn btn-sm px-3 py-1 btn-danger" title="Désassigner">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                  💡 La délégation est optionnelle. Si vous ne déléguez pas, tous les inspecteurs pourront voir l'ensemble des domaines.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button className={`btn btn-sm gap-1 ${delegationsSaved ? 'btn-success' : 'btn-primary'}`} onClick={handleSaveDelegations} disabled={delegationsSaved}>
                    {delegationsSaved ? (
                      <><CheckCircle2 className="w-3 h-3" /> Enregistré !</>
                    ) : (
                      <><Save className="w-3 h-3" /> Enregistrer les délégations</>
                    )}
                  </button>
                </div>
              </div>
              )}

            </div>
          </div>
        </div>

        {/* Footer — sticky, directement dans modal-content (hors border-t-4) */}
        <div className="modal-footer flex justify-end gap-3 sticky bottom-0 bg-card border-t border-border px-5 py-3">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-outline gap-2" onClick={handleNotifyOperator} title="Envoyer la checklist aux exploitants"><Send className="w-4 h-4" /> Envoyer la checklist</button>
          <button className="btn btn-primary gap-2" onClick={handleOpenChecklist} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Ouvrir la checklist pré-remplie
          </button>
        </div>
      </div>
      {/* Modale choix type checklist — rendu en dehors du modal-overlay */}
      {showTypeChoice && (
          <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-up space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <ClipboardList className="w-6 h-6 text-role-primary" />
                <h3 className="text-lg font-semibold text-foreground">Choisir le type de checklist</h3>
              </div>
              <p className="text-sm text-muted-foreground">Plusieurs types de checklist sont disponibles pour cette surveillance.</p>
              <div className="space-y-2">
                {(function buildOptions() {
                  const portee = planning.portee || [];
                  const isSgsOnly = portee.length === 1 && portee[0] === 'SGS';
                  const hasSGS = portee.includes('SGS');
                  const ecartsActifs = (ecarts || []).filter((e: Ecart) => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture');
                  const hasPAC = ecartsActifs.some((e: Ecart) => e.pac);
                  const opts: { type: string; label: string; desc: string; icon: React.ElementType }[] = [];
                  if (!isSgsOnly) opts.push({ type: 'standard', label: 'Checklist Standard', desc: 'Items standards RAS-14', icon: ClipboardList });
                  if (hasSGS) opts.push({ type: 'sgs', label: 'Évaluation SGS', desc: 'Maturité PAOE (Annexe 19 OACI)', icon: Shield });
                  if (ecartsActifs.length > 0) opts.push({ type: 'suivi', label: 'Suivi des écarts', desc: `${ecartsActifs.length} écart(s) actif(s)`, icon: AlertTriangle });
                  if (hasPAC) opts.push({ type: 'pac', label: 'Mise en œuvre PAC', desc: 'Plans d\'action corrective', icon: CheckCircle2 });
                  return opts;
                })().map((opt) => (
                  <button key={opt.type} type="button" className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left" onClick={() => {
                    setShowTypeChoice(false);
                    if (opt.type === 'sgs') { onOpenSGS(); onClose(); }
                    else { onOpenChecklist(opt.type as 'standard' | 'suivi' | 'pac' | 'mixte'); onClose(); }
                  }}>
                    <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0">
                      <opt.icon className="w-5 h-5 text-role-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTypeChoice(false)}>
                  <X className="w-4 h-4" />Annuler
                </button>
              </div>
            </div>
          </div>
        )}
    </>,
    document.body
    )
  }

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL PlanningCard

// ─────────────────────────────────────────────────────────────

const DECLENCHEUR_LABELS: Record<string, string> = {
  automatique: 'Automatique',
  manuel: 'Manuel',
  renouvellement: 'Renouvellement certification',
  evenement: 'Suite événement',
  demande_dg: 'Demande DG',
}


export function PlanningCard({
  planning,
  aerodrome,
  onExecute,
  onPrepare,
  onView,
  onEdit,
  onDelete,
  isLancee = false,
  surveillanceId,
  userRole = 'inspector',
  profilScore,
  onSuggestionIA,
}: PlanningCardProps) {
  const router = useRouter()
  const [showPreparationModal, setShowPreparationModal] = useState(false)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  
  // Récupérer les vrais inspecteurs depuis le store
  const getChefEquipe = () => {
    if (!planning.chef_id) return null
    return utilisateurs.find(u => u.id === planning.chef_id)
  }
  
  const getInitiales = (prenom: string, nom: string) =>
    `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase()
  
  const chef = getChefEquipe()
  const TypeIcon = ({ type }: { type: string }) => {
    const icons: Record<string, React.ElementType> = {
      programmee: Calendar,
      inopinee: AlertCircle,
      speciale: Star,
      suivi_ecarts: ClipboardList,
      mise_oeuvre_pac: CheckCircle2,
      certification: Shield,
      homologation: Scale,
      audit_complet: LayoutGrid,
      urgence: AlertTriangle,
    }
    const Icon = icons[type] || Calendar
    return <Icon className="h-4 w-4 text-role-primary" />
  }
  
  const statusBadge = (statut: string): { cls: string; icon: React.ElementType; label: string } => {
    const variants: Record<string, { cls: string; icon: React.ElementType; label: string }> = {
      planifiee: { cls: 'badge primary', icon: Clock, label: 'Planifiée' },
      en_cours: { cls: 'badge warning', icon: AlertCircle, label: 'En cours' },
      realisee: { cls: 'badge success', icon: CheckCircle2, label: 'Réalisée' },
      annulee: { cls: 'badge neutral', icon: XCircle, label: 'Annulée' },
      en_retard: { cls: 'badge danger animate-pulse', icon: AlertTriangle, label: 'En retard' },
    }
    return variants[statut] || variants.planifiee
  }
  
  const prioriteBadge = (priorite: string): { cls: string; label: string } => {
    const variants: Record<string, { cls: string; label: string }> = {
      basse: { cls: 'badge neutral', label: 'Basse' },
      moyenne: { cls: 'badge primary', label: 'Moyenne' },
      haute: { cls: 'badge warning', label: 'Haute' },
      critique: { cls: 'badge danger animate-pulse', label: 'Critique' },
    }
    return variants[priorite] || variants.moyenne
  }
  
  const getBorderColor = () => {
    if (planning.est_proposition) return 'border-l-warning'
    if (planning.priorite === 'critique') return 'border-l-danger'
    if (planning.priorite === 'haute') return 'border-l-warning'
    if (planning.statut === 'realisee') return 'border-l-success'
    if (planning.statut === 'en_retard') return 'border-l-danger'
    return 'border-l-role-primary'
  }
  
  const startDate = new Date(planning.date_debut).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const endDate = new Date(planning.date_fin).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const startTime = new Date(planning.date_debut).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const endTime = new Date(planning.date_fin).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  
  const isProposition = planning.est_proposition
  const sb = statusBadge(planning.statut)
  const StatutIcon = sb.icon
  const pb = prioriteBadge(planning.priorite)
  const borderColor = getBorderColor()
  
  const joursRestants = (() => {
    const today = new Date()
    const debut = new Date(planning.date_debut)
    const diffTime = debut.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  })()
  
  const getJoursRestantsClass = () => {
    if (joursRestants < 0) return 'text-danger'
    if (joursRestants <= 7) return 'text-warning'
    return 'text-muted-foreground'
  }
  
  const getJoursRestantsLabel = () => {
    if (joursRestants < 0) return 'Dépassé'
    if (joursRestants === 0) return 'Aujourd\'hui'
    return `J-${joursRestants}`
  }
  
  const handleVoirSurveillance = () => {
    if (surveillanceId) {
      router.push(`/surveillance/${surveillanceId}`)
    }
  }
  
  const handleOpenChecklist = (type: 'standard' | 'suivi' | 'pac' | 'mixte') => {
    if (surveillanceId) {
      router.push(`/surveillance/${surveillanceId}/checklist?type=${type}`)
    } else {
      router.push(`/preparation-checklist/${planning.id}?type=${type}`)
    }
  }

  const handleOpenSGS = () => {
    if (surveillanceId) {
      router.push(`/surveillance/${surveillanceId}/checklist?type=sgs`)
    } else {
      router.push(`/preparation-checklist/${planning.id}?type=sgs`)
    }
  }
  
  const handlePrepareClick = () => {
    if (onPrepare) {
      onPrepare(planning)
    } else {
      setShowPreparationModal(true)
    }
  }
  
  return (
    <>
      <div
        className={`card card-accent mb-3 border-l-4 ${borderColor} hover:shadow-xl transition-all duration-300`}
        data-role={userRole}
      >
        <div className="card-content p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  isProposition ? 'bg-warning/10' : 'bg-role-primary-soft'
                }`}
              >
                <TypeIcon type={planning.type} />
              </div>
              <div>
                <h4 className="font-medium text-sm flex items-center gap-2">
                  {planning.type
                    .split('_')
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
                  {isProposition && (
                    <span className="badge warning animate-pulse text-[10px]">
                      Proposition N+1
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={sb.cls}>
                    <StatutIcon className="h-3 w-3 mr-1 inline" />
                    {sb.label}
                  </span>
                  <span className={pb.cls}>{pb.label}</span>
                </div>
              </div>
            </div>
            
            {/* Action buttons */}
             <div className="flex items-center gap-2">
               {/* Bouton Suggestion IA & Profil - Dynamique selon le profil */}
               {onSuggestionIA && (
                 <button
                   className={`action-button transition-all duration-300 ${
                     profilScore === undefined || profilScore === null ? 'text-primary hover:bg-primary/10 hover:scale-110' :
                     profilScore < 30 ? 'text-danger hover:bg-danger/10 hover:scale-110' :
                     profilScore < 60 ? 'text-warning hover:bg-warning/10 hover:scale-110' :
                     'text-primary hover:bg-primary/10 hover:scale-110'
                   }`}
                   onClick={() => onSuggestionIA(planning)}
                   title={profilScore !== undefined && profilScore !== null ? `Suggestion IA & Profil (Score: ${profilScore}/100)` : "Suggestion IA & Profil"}
                 >
                   <Brain className="h-4 w-4" />
                 </button>
               )}
               
               {!isProposition && !isLancee && planning.statut === 'planifiee' && (
                 <>
                   <button
                     className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                     onClick={handlePrepareClick}
                     title="Préparer la surveillance"
                   >
                     <FileText className="h-4 w-4" />
                   </button>
                   <button
                     className="action-button hover:text-success hover:bg-success/10 transition-all duration-200"
                     onClick={() => onExecute?.(planning)}
                     title="Lancer la surveillance"
                   >
                     <PlayCircle className="h-4 w-4" />
                   </button>
                 </>
               )}
               {isLancee && surveillanceId && (
                 <button
                   className="action-button hover:text-success hover:bg-success/10 transition-all duration-200"
                   onClick={handleVoirSurveillance}
                   title="Voir la surveillance"
                 >
                   <Send className="h-4 w-4" />
                 </button>
               )}
               <button
                 className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                 onClick={() => onView?.(planning)}
                 title="Voir détails"
               >
                 <Eye className="h-4 w-4" />
               </button>
               {!isLancee && (
                 <button
                   className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                   onClick={() => onEdit?.(planning)}
                   title="Modifier"
                 >
                   <PenSquare className="h-4 w-4" />
                 </button>
               )}
               {!isLancee && onDelete && (
                 <button
                   className="action-button danger hover:bg-danger/10 transition-all duration-200"
                   onClick={() => onDelete(planning)}
                   title="Supprimer"
                 >
                   <Trash2 className="h-4 w-4" />
                 </button>
               )}
             </div>
          </div>
          
          {/* Objectifs */}
          {planning.objectifs && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2 bg-role-primary-soft p-2 rounded">
              {planning.objectifs}
            </p>
          )}
          
          {/* Dates & Aérodrome */}
          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <EntiteIcon typeEntite={aerodrome?.type_entite} />
              <div className="truncate">
                <span className="code-oaci-badge">{aerodrome?.code_oaci}</span>
                <span className="text-muted-foreground ml-1">- {aerodrome?.nom}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 text-role-primary flex-shrink-0" />
              <div className="text-xs">
                <span className="font-medium">{startDate}</span>
                <span className="text-muted-foreground ml-1">{startTime}</span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="font-medium">{endDate}</span>
                <span className="text-muted-foreground ml-1">{endTime}</span>
              </div>
            </div>
          </div>
          
          {/* Jours restants */}
          {!isLancee && planning.statut === 'planifiee' && (
            <div className="mb-3 flex items-center justify-end">
              <div className={`flex items-center gap-1 text-xs ${getJoursRestantsClass()}`}>
                <Clock className="h-3 w-3" />
                <span className="font-medium">{getJoursRestantsLabel()}</span>
              </div>
            </div>
          )}
          
          {/* Équipe */}
          <div className="mb-3 p-3 bg-role-primary-soft rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-role-primary" />
              <span className="text-sm font-medium">Équipe de surveillance</span>
              <span className="badge outline ml-auto text-xs">
                {(planning.equipe_ids ?? []).length} inspecteur(s)
              </span>
            </div>
            {chef && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                <span className="w-7 h-7 rounded-full bg-role-gradient text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                  {getInitiales(chef.prenom, chef.nom)}
                </span>
                <div>
                  <span className="text-sm font-medium">
                    {chef.prenom} {chef.nom}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">Chef d'équipe</span>
                </div>
                <Star className="h-3 w-3 text-warning ml-auto" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(planning.equipe_ids ?? []).map((id: string) => {
                const insp = utilisateurs.find(u => u.id === id)
                if (!insp || id === planning.chef_id) return null
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1 bg-background px-2 py-1 rounded-full border border-border text-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-role-primary-soft !text-white text-[10px] flex items-center justify-center font-bold">
                      {getInitiales(insp.prenom, insp.nom)}
                    </span>
                    <span>
                      {insp.prenom} {insp.nom}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* Domaines surveillés */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-role-primary" />
              <span className="text-sm font-medium">Domaines surveillés</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {planning.portee && planning.portee.length > 0 ? (
                planning.portee.map(code => {
                  const expandedCodes = expandDomaines([code])
                  if (expandedCodes.length > 1) {
                    return expandedCodes.map(c => (
                      <span key={c} className="badge outline" title={getDomaineLabel(c)}>
                        {c}
                      </span>
                    ))
                  }
                  return (
                    <span key={code} className="badge outline" title={getDomaineLabel(code)}>
                      {code}
                    </span>
                  )
                })
              ) : (
                <span className="text-xs text-muted-foreground">
                  Aucun domaine spécifié
                </span>
              )}
            </div>
          </div>
          
          {/* Déclencheur */}
          {planning.declencheur && (
            <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
              <span className="font-medium">Déclencheur:</span>{' '}
              {DECLENCHEUR_LABELS[planning.declencheur] || planning.declencheur}
            </div>
          )}
          
          {/* Badge surveillance lancée */}
          {isLancee && (
            <div className="mt-3 pt-2 border-t border-border flex items-center justify-end">
              <span className="badge success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Surveillance lancée
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Modale de préparation */}
      {showPreparationModal && (
        <PreparationModal
          planning={planning}
          aerodrome={aerodrome}
          onClose={() => setShowPreparationModal(false)}
          onOpenChecklist={handleOpenChecklist}
          onOpenSGS={handleOpenSGS}
        />
      )}
    </>
  )
}