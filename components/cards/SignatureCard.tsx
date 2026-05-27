// components/cards/SurveillanceCard.tsx
'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  Edit3,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Calendar,
  Users,
  MapPin,
  PenLine,
  Trash2,
  Target,
  Star,
  PlayCircle,
  AlertTriangle,
  ClipboardList,
  FileSignature,
  ChevronRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  CalendarCheck,
  Mail,
  Archive,
} from 'lucide-react'
import { Surveillance, SurveillanceStatut } from '@/types/surveillance'

interface SurveillanceCardProps {
  surveillance: Surveillance
  aerodrome?: {
    id: string
    code_oaci: string
    nom: string
  }
  onView?: () => void
  onEdit?: () => void
  onContinue?: () => void
  onTransmit?: () => void
  onDelete?: (id: string) => void
  onViewChecklist?: () => void
  onViewRapport?: () => void
  onViewEcarts?: () => void
  onViewLettre?: () => void
  onViewTransmission?: () => void
  userRole?: string
  variant?: 'list' | 'grid'
}

const STATUT_CONFIG: Record<SurveillanceStatut, {
  label: string
  badgeCls: string
  icon: React.ElementType
  description: string
  nextAction?: string
  nextActionIcon?: React.ElementType
  workflowStep: number
}> = {
  planifiee: {
    label: 'Planifiée',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary',
    icon: CalendarCheck,
    description: 'Surveillance planifiée, en attente de démarrage',
    nextAction: 'Démarrer',
    nextActionIcon: PlayCircle,
    workflowStep: 1,
  },
  en_cours: {
    label: 'En cours',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning',
    icon: ClipboardList,
    description: 'Checklist en cours de renseignement',
    nextAction: 'Continuer',
    nextActionIcon: CheckCircle,
    workflowStep: 2,
  },
  checklist_signee: {
    label: 'Checklist signée',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary',
    icon: PenLine,
    description: 'Checklist signée, en attente de rédaction des écarts',
    nextAction: 'Rédiger écarts',
    nextActionIcon: FileSignature,
    workflowStep: 3,
  },
  ecarts_signes: {
    label: 'Écarts signés',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary',
    icon: FileSignature,
    description: 'Écarts rédigés et signés',
    nextAction: 'Rédiger rapport',
    nextActionIcon: FileText,
    workflowStep: 4,
  },
  rapport_signe: {
    label: 'Rapport signé',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success',
    icon: FileText,
    description: 'Rapport signé, en attente de lettre',
    nextAction: 'Rédiger lettre',
    nextActionIcon: PenLine,
    workflowStep: 5,
  },
  lettre_signee: {
    label: 'Lettre signée DG',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success',
    icon: Mail,
    description: 'Lettre signée par le DG, prête à transmettre',
    nextAction: 'Transmettre',
    nextActionIcon: Send,
    workflowStep: 6,
  },
  transmise: {
    label: 'Transmise',
    badgeCls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success',
    icon: Send,
    description: "Transmise à l'exploitant",
    workflowStep: 7,
  },
  archivee: {
    label: 'Archivée',
    badgeCls: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700',
    icon: Archive,
    description: 'Surveillance archivée',
    workflowStep: 7,
  },
}

// Définition des 7 étapes du workflow avec leurs actions
const WORKFLOW_STEPS = [
  { id: 'planifiee', label: 'Planifiée', icon: CalendarCheck, step: 1, action: 'view', modal: null, page: null },
  { id: 'en_cours', label: 'Checklist', icon: ClipboardList, step: 2, action: 'checklist', modal: 'checklist', page: '/checklist' },
  { id: 'checklist_signee', label: 'Checklist\nsignée', icon: PenLine, step: 3, action: 'ecarts', modal: 'ecarts', page: null },
  { id: 'ecarts_signes', label: 'Écarts\nsignés', icon: FileSignature, step: 4, action: 'rapport', modal: null, page: '/rapport' },
  { id: 'rapport_signe', label: 'Rapport\nsigné', icon: FileText, step: 5, action: 'lettre', modal: 'lettre', page: null },
  { id: 'lettre_signee', label: 'Lettre\nDG', icon: Mail, step: 6, action: 'transmission', modal: 'transmission', page: null },
  { id: 'transmise', label: 'Transmise', icon: Send, step: 7, action: 'view', modal: null, page: null },
]

const MOCK_INSPECTEURS: Record<string, { nom: string; prenom: string; domaine?: string }> = {
  'insp1': { nom: 'Diop', prenom: 'Mamadou', domaine: 'SGS' },
  'insp2': { nom: 'Fall', prenom: 'Aminata', domaine: 'SLI' },
  'insp3': { nom: 'Sow', prenom: 'Oumar', domaine: 'PHY' },
  'insp4': { nom: 'Ndiaye', prenom: 'Fatou', domaine: 'OPS' },
}

const borderByStatut: Record<string, string> = {
   planifiee: 'border-l-role-primary',

   checklist_signee: 'border-l-role-primary',

   ecarts_signes: 'border-l-role-primary',
  rapport_signe: 'border-l-success',
  lettre_signee: 'border-l-success',
  transmise: 'border-l-success',
  archivee: 'border-l-neutral',
}

function getProgressColor(progression: number): string {
  if (progression >= 80) return 'progress-faible'
  if (progression >= 60) return 'progress-moyen'
  if (progression >= 30) return 'progress-eleve'
  return 'progress-critique'
}

// Bouton d'étape workflow cliquable
function WorkflowStepButton({ 
  currentStep, 
  step, 
  icon: Icon, 
  label, 
  isCompleted, 
  isActive,
  onClick 
}: { 
  currentStep: number
  step: number
  icon: React.ElementType
  label: string
  isCompleted: boolean
  isActive: boolean
  onClick: () => void
}) {
  let statusClass = 'bg-gray-200 text-gray-400 border-gray-300'
  let hoverClass = 'hover:bg-gray-300 hover:scale-105'

  if (isCompleted) {
    statusClass = 'bg-success text-white border-success'
    hoverClass = 'hover:bg-success-dark hover:scale-110'
  } else if (isActive) {
    statusClass = 'bg-role-gradient text-white border-role-primary animate-pulse'
    hoverClass = 'hover:scale-110'
  } else {
    hoverClass = 'hover:bg-gray-300 hover:scale-105'
  }

  const labelParts = label.split('\n')
  const isClickable = step <= currentStep + 1 || isCompleted || isActive

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`flex flex-col items-center flex-1 min-w-0 transition-all duration-200 group ${
        !isClickable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      title={!isClickable ? `Étape non accessible (étape ${step} requise)` : `Accéder à ${labelParts[0]}`}
    >
      <div 
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${statusClass} ${isClickable ? hoverClass : ''} shadow-sm`}
      >
        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="text-[10px] mt-1.5 text-center leading-tight">
        {labelParts.map((part, idx) => (
          <span key={idx} className={`block ${isActive ? 'text-role-primary font-semibold' : isCompleted ? 'text-success' : 'text-muted-foreground'}`}>
            {part}
          </span>
        ))}
      </div>
    </button>
  )
}

function WorkflowConnector({ isCompleted, isActive }: { isCompleted: boolean; isActive: boolean }) {
  let lineClass = 'bg-gray-300'
  if (isCompleted) lineClass = 'bg-success'
  else if (isActive) lineClass = 'bg-role-primary'
  return <div className={`flex-1 h-0.5 ${lineClass} mx-1 transition-all duration-300`} />
}

export function SurveillanceCard({
  surveillance,
  aerodrome,
  onView,
  onEdit,
  onContinue,
  onTransmit,
  onDelete,
  onViewChecklist,
  onViewRapport,
  onViewEcarts,
  onViewLettre,
  onViewTransmission,
  userRole = 'inspector',
  variant = 'list',
}: SurveillanceCardProps) {
  const router = useRouter()
  const statut = STATUT_CONFIG[surveillance.statut]
  const StatutIcon = statut.icon
  const NextActionIcon = statut.nextActionIcon

  const getInitiales = (id: string) => {
    const insp = MOCK_INSPECTEURS[id]
    return insp ? `${insp.prenom.charAt(0)}${insp.nom.charAt(0)}`.toUpperCase() : '??'
  }

  const peutEditer = ['planifiee', 'en_cours'].includes(surveillance.statut)
  const peutContinuer = surveillance.statut === 'en_cours'
  const peutAfficherChecklist = ['en_cours', 'checklist_signee', 'ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(surveillance.statut)
  const peutAfficherRapport = ['rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(surveillance.statut)
  const peutAfficherEcarts = ['ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(surveillance.statut)
  const peutAfficherLettre = ['lettre_signee', 'transmise', 'archivee'].includes(surveillance.statut)
  const peutTransmettre = surveillance.statut === 'lettre_signee'
  const peutSupprimer = ['planifiee', 'archivee'].includes(surveillance.statut)

  const dateDebut = new Date(surveillance.date_debut)
  const dateFin = new Date(surveillance.date_fin)
  const dureeJours = Math.ceil((dateFin.getTime() - dateDebut.getTime()) / (1000 * 60 * 60 * 24))

  const dateDebutFormatted = dateDebut.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const dateFinFormatted = dateFin.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const chef = surveillance.chef_id ? MOCK_INSPECTEURS[surveillance.chef_id] : null
  const borderCls = borderByStatut[surveillance.statut] || 'border-l-role-primary'
  const progressColor = getProgressColor(surveillance.progression || 0)

  // Navigation checklist avec logique SGS
  const navigateToChecklist = (type: 'standard' | 'sgs') => {
    router.push(`/surveillance/${surveillance.id}/checklist?type=${type}`);
  };

  const handleChecklistAction = () => {
    const portee = surveillance.portee || [];
    const isSgsOnly = portee.length === 1 && portee[0] === 'SGS';

    if (isSgsOnly) {
      navigateToChecklist('sgs');
    } else {
      // SGS + autres domaines ou domaines standards → checklist standard
      navigateToChecklist('standard');
    }
  };

  // Handlers pour chaque étape du workflow
  const handleStepClick = (stepId: string, stepNumber: number) => {
    const currentStep = statut.workflowStep

    // Vérifier si l'étape est accessible (pas plus de 1 étape en avance)
    if (stepNumber > currentStep + 1) {
      return
    }

    switch (stepId) {
      case 'planifiee':
        onView?.()
        break
      case 'en_cours':
        handleChecklistAction()
        break
      case 'checklist_signee':
        if (onViewEcarts) {
          onViewEcarts()
        } else {
          // Ouvrir modal rédaction écarts
          console.log('Ouvrir modal rédaction écarts')
        }
        break
      case 'ecarts_signes':
        if (onViewRapport) {
          onViewRapport()
        } else {
          router.push(`/surveillance/${surveillance.id}/rapport`)
        }
        break
      case 'rapport_signe':
        if (onViewLettre) {
          onViewLettre()
        } else {
          // Ouvrir modal lettre
          console.log('Ouvrir modal lettre')
        }
        break
      case 'lettre_signee':
        if (onViewTransmission) {
          onViewTransmission()
        } else if (onTransmit) {
          onTransmit()
        }
        break
      case 'transmise':
        onView?.()
        break
      default:
        onView?.()
    }
  }

  const handleViewChecklistClick = () => {
    handleChecklistAction()
  }

  const handleViewRapportClick = () => {
    if (onViewRapport) {
      onViewRapport()
    } else {
      router.push(`/surveillance/${surveillance.id}/rapport`)
    }
  }

  const handleViewEcartsClick = () => {
    if (onViewEcarts) {
      onViewEcarts()
    } else {
      onView?.()
    }
  }

  const getDocumentsBadges = () => {
    const badges = []
    if (surveillance.signatures_checklist && surveillance.signatures_checklist.length > 0) {
      badges.push({ label: 'Checklist', icon: ClipboardList, color: 'success' })
    }
    if (surveillance.signatures_ecarts && surveillance.signatures_ecarts.length > 0) {
      badges.push({ label: 'Écarts', icon: FileSignature, color: 'warning' })
    }
    if (surveillance.signatures_rapport && surveillance.signatures_rapport.length > 0) {
      badges.push({ label: 'Rapport', icon: FileText, color: 'primary' })
    }
    if (surveillance.lettre_signee_url) {
      badges.push({ label: 'Lettre DG', icon: Send, color: 'success' })
    }
    return badges
  }

  const documentsBadges = getDocumentsBadges()
  const currentWorkflowStep = statut.workflowStep

  // Version grille (compacte)
  if (variant === 'grid') {
    return (
      <div
        className={`card h-full hover:shadow-lg transition-all duration-200 border-l-4 ${borderCls}`}
        data-role={userRole}
      >
        <div className="card-content p-3">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-role-primary-soft rounded-lg">
                <StatutIcon className="h-4 w-4 text-role-primary" />
              </div>
              <div>
                <h4 className="font-medium text-xs line-clamp-1">
                  {surveillance.type.split('_').map((mot: string) =>
                    mot.charAt(0).toUpperCase() + mot.slice(1)
                  ).join(' ')}
                </h4>
                <span className={statut.badgeCls}>
                  <StatutIcon className="h-2 w-2 mr-0.5 inline" />
                  {statut.label}
                </span>
              </div>
            </div>
            <div className="btn btn-ghost">
              <button className="btn btn-ghost" onClick={onView} title="Voir détails">
                <Eye className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Aérodrome */}
          <div className="flex items-center gap-1 mb-2 text-xs">
            <MapPin className="h-3 w-3 text-role-primary flex-shrink-0" />
            <span className="code-oaci-badge text-[10px]">{aerodrome?.code_oaci}</span>
            <span className="text-muted-foreground text-[10px] truncate">{aerodrome?.nom}</span>
          </div>

          {/* Dates */}
          <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{dateDebutFormatted} → {dateFinFormatted}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 text-[8px]">{dureeJours}j</span>
          </div>

          {/* Progression */}
          <div className="flex items-center gap-2 mb-2">
            <div className="progress h-1 flex-1">
              <div className={`progress-bar ${progressColor}`} style={{ width: `${surveillance.progression || 0}%` }} />
            </div>
            <span className="text-[10px] font-medium">{surveillance.progression || 0}%</span>
          </div>

          {/* Badges documents */}
          {documentsBadges.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {documentsBadges.slice(0, 2).map((doc, idx) => (
                <span key={idx} className={`badge ${doc.color} text-[8px] flex items-center gap-0.5`}>
                  <doc.icon className="w-2 h-2" />
                  {doc.label}
                </span>
              ))}
              {documentsBadges.length > 2 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 text-[8px]">+{documentsBadges.length - 2}</span>
              )}
            </div>
          )}

          {/* Workflow steps mini - indicateurs cliquables */}
          <div className="flex items-center justify-between mt-2 pt-1 border-t border-border">
            <div className="flex items-center gap-0.5">
              {WORKFLOW_STEPS.slice(0, 4).map((step, idx) => (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => handleStepClick(step.id, step.step)}
                    className={`w-2 h-2 rounded-full transition-all duration-200 hover:scale-125 ${
                      currentWorkflowStep >= step.step
                        ? 'bg-success'
                        : currentWorkflowStep === step.step - 1
                        ? 'bg-role-primary'
                        : 'bg-gray-300'
                    } ${step.step <= currentWorkflowStep + 1 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                    title={step.label}
                  />
                  {idx < 3 && <div className="w-2 h-px bg-gray-300" />}
                </React.Fragment>
              ))}
            </div>
            <span className="text-[8px] text-muted-foreground">étape {currentWorkflowStep}/7</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-1 pt-2">
            {peutAfficherChecklist && (
              <button onClick={handleViewChecklistClick} className="btn btn-ghost" title="Checklist">
                <ClipboardList className="h-3 w-3" />
              </button>
            )}
            {peutAfficherRapport && (
              <button onClick={handleViewRapportClick} className="btn btn-ghost" title="Rapport">
                <FileText className="h-3 w-3" />
              </button>
            )}
            {peutContinuer && NextActionIcon && (
              <button onClick={onContinue} className="btn btn-ghost text-success" title={statut.nextAction}>
                <NextActionIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Version liste (détaillée)
  return (
    <div
      className={`card mb-3 hover:shadow-lg transition-all duration-200 border-l-4 ${borderCls}`}
      data-role={userRole}
    >
      <div className="card-content p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-role-primary-soft rounded-lg">
              <StatutIcon className="h-5 w-5 text-role-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-sm">
                  {surveillance.type.split('_').map((mot: string) =>
                    mot.charAt(0).toUpperCase() + mot.slice(1)
                  ).join(' ')}
                </h4>
                <span className={statut.badgeCls}>
                  <StatutIcon className="h-3 w-3 mr-1 inline" />
                  {statut.label}
                </span>
                {surveillance.transmitted_at && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 text-[10px]">
                    Transmis le {new Date(surveillance.transmitted_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
                {dureeJours > 0 && (
                  <span className="badge outline text-[10px]">
                    {dureeJours} jour(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1" title={statut.description}>
                {statut.description}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="btn btn-ghost">
            <button className="btn btn-ghost" onClick={onView} title="Voir détails">
              <Eye className="h-4 w-4" />
            </button>
            {peutSupprimer && (
              <button
                className="btn btn-ghost text-danger"
                onClick={() => onDelete?.(surveillance.id)}
                title="Supprimer la surveillance"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {peutEditer && (
              <button className="btn btn-ghost" onClick={onEdit} title="Modifier">
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            {peutContinuer && NextActionIcon && (
              <button
                className="btn btn-ghost text-success"
                onClick={onContinue}
                title={statut.nextAction}
              >
                <NextActionIcon className="h-4 w-4" />
              </button>
            )}
            {peutTransmettre && (
              <button
                className="btn btn-ghost text-role-primary"
                onClick={onTransmit}
                title="Transmettre à l'exploitant"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Workflow steps - 7 étapes complètes avec boutons cliquables */}
        <div className="mb-4 bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            {WORKFLOW_STEPS.map((step, idx) => (
              <React.Fragment key={step.id}>
                <WorkflowStepButton
                  currentStep={currentWorkflowStep}
                  step={step.step}
                  icon={step.icon}
                  label={step.label}
                  isCompleted={currentWorkflowStep > step.step}
                  isActive={currentWorkflowStep === step.step}
                  onClick={() => handleStepClick(step.id, step.step)}
                />
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <WorkflowConnector
                    isCompleted={currentWorkflowStep > step.step}
                    isActive={currentWorkflowStep === step.step}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="text-center mt-3">
            <span className="text-xs text-muted-foreground">
              Étape {currentWorkflowStep} sur {WORKFLOW_STEPS.length}
            </span>
          </div>
        </div>

        {/* Documents signés badges */}
        {documentsBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {documentsBadges.map((doc, idx) => (
              <span key={idx} className={`badge ${doc.color} text-[10px] flex items-center gap-1`}>
                <doc.icon className="w-3 h-3" />
                {doc.label}
              </span>
            ))}
          </div>
        )}

        {/* Infos grid */}
        <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 text-role-primary flex-shrink-0" />
            <span className="font-medium truncate">
              <span className="code-oaci-badge mr-1">{aerodrome?.code_oaci}</span>
              {aerodrome?.nom}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Star className="h-4 w-4 text-warning flex-shrink-0" />
            <span className="font-medium">{chef ? `${chef.prenom} ${chef.nom}` : 'Non assigné'}</span>
            {chef && <span className="badge outline text-[10px]">Chef</span>}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 text-role-primary flex-shrink-0" />
            <span>Début: {dateDebutFormatted}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 text-role-primary flex-shrink-0" />
            <span>Fin: {dateFinFormatted}</span>
          </div>
        </div>

        {/* Équipe */}
        <div className="mb-3 p-3 bg-role-primary-soft rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-role-primary" />
            <span className="text-sm font-medium">Équipe de surveillance</span>
            <span className="badge outline ml-auto text-xs">
              {surveillance.equipe_ids.length} inspecteur(s)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {surveillance.equipe_ids.map((id: string) => {
              const insp = MOCK_INSPECTEURS[id]
              if (!insp) return null
              const estChef = id === surveillance.chef_id
              return (
                <div
                  key={id}
                  className={`flex items-center gap-1 bg-background px-2 py-1 rounded-full border text-xs ${estChef ? 'border-warning bg-role-primary-soft' : 'border-border'}`}
                  title={estChef ? "Chef d'équipe" : `Inspecteur - ${insp.domaine}`}
                >
                  <span className="w-5 h-5 rounded-full bg-role-gradient text-white text-[9px] flex items-center justify-center font-bold">
                    {getInitiales(id)}
                  </span>
                  <span className="text-xs">{insp.prenom} {insp.nom}</span>
                  {estChef && <Star className="h-3 w-3 text-warning" />}
                  <span className="badge outline text-[8px] py-0 ml-0.5">{insp.domaine}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Domaines */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-role-primary" />
            <span className="text-sm font-medium">Domaines surveillés</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {surveillance.portee && surveillance.portee.length > 0 ? (
              surveillance.portee.map((domaine: string) => (
                <span key={domaine} className="badge outline" title={`Domaine ${domaine}`}>
                  {domaine}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Aucun domaine spécifié</span>
            )}
          </div>
        </div>

        {/* Progression avec couleur dynamique */}
        <div className="flex items-center gap-2 mb-3">
          <div className="progress h-2 flex-1">
            <div className={`progress-bar ${progressColor}`} style={{ width: `${surveillance.progression || 0}%` }} />
          </div>
          <span className="text-xs font-medium">{surveillance.progression || 0}%</span>
        </div>

        {/* Liens rapides vers documents */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
          {peutAfficherChecklist && (
            <button
              onClick={handleViewChecklistClick}
              className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
            >
              <ClipboardList className="w-3 h-3" />
              Voir la checklist
            </button>
          )}
          {peutAfficherEcarts && (
            <button
              onClick={handleViewEcartsClick}
              className="flex items-center gap-1 text-xs text-warning hover:underline transition-colors"
            >
              <FileSignature className="w-3 h-3" />
              Voir les écarts
            </button>
          )}
          {peutAfficherRapport && (
            <button
              onClick={handleViewRapportClick}
              className="flex items-center gap-1 text-xs text-success hover:underline transition-colors"
            >
              <FileText className="w-3 h-3" />
              Voir le rapport
            </button>
          )}
          {peutAfficherLettre && surveillance.lettre_signee_url && (
            <button
              onClick={() => window.open(surveillance.lettre_signee_url, '_blank')}
              className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
            >
              <Mail className="w-3 h-3" />
              Voir la lettre
            </button>
          )}
        </div>
      </div>

    </div>
  )
}