// components/cards/SurveillanceCard.tsx
'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, Edit3, FileText, CheckCircle, Clock, AlertCircle, Send, Calendar, Users,
  MapPin, Plane, PenLine, Trash2, Target, Star, PlayCircle, AlertTriangle,
  ClipboardList, FileSignature, ChevronRight, CheckCircle2, XCircle, MinusCircle,
  CalendarCheck, Mail, Archive,
} from 'lucide-react'
import { Surveillance, SurveillanceStatut } from '@/types/surveillance'
import { ChargerRedigerRapportModal } from '@/components/modules/surveillance/ChargerRedigerRapportModal'

const TypeEntiteBadge = ({ typeEntite }: { typeEntite?: string }) => {
  switch (typeEntite) {
    case 'helistation': return <span className="badge warning inline-flex items-center gap-1">🚁 Hélistation</span>;
    case 'mixte':       return <span className="badge purple  inline-flex items-center gap-1">✈🚁 Mixte</span>;
    default:            return <span className="badge neutral inline-flex items-center gap-1">✈ Aérodrome</span>;
  }
};

interface SurveillanceCardProps {
  surveillance: Surveillance
  aerodrome?: {
    id: string
    code_oaci: string
    nom: string
    type_entite?: 'aerodrome' | 'helistation' | 'mixte'
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
  borderColor: string
  borderAnimation: string
}> = {
  planifiee: {
    label: 'Planifiée',
    badgeCls: 'badge primary',
    icon: CalendarCheck,
    description: 'Surveillance planifiée, en attente de démarrage',
    nextAction: 'Démarrer',
    nextActionIcon: PlayCircle,
    workflowStep: 1,
    borderColor: 'border-l-role-primary',
    borderAnimation: '',
  },
  en_cours: {
    label: 'En cours',
    badgeCls: 'badge warning',
    icon: ClipboardList,
    description: 'Checklist en cours de renseignement',
    nextAction: 'Continuer',
    nextActionIcon: CheckCircle,
    workflowStep: 2,
    borderColor: 'border-l-warning',
    borderAnimation: '',
  },
  checklist_signee: {
    label: 'Checklist signée',
    badgeCls: 'badge primary',
    icon: PenLine,
    description: 'Checklist signée, en attente de rédaction des écarts',
    nextAction: 'Rédiger écarts',
    nextActionIcon: FileSignature,
    workflowStep: 3,
    borderColor: 'border-l-role-primary',
    borderAnimation: '',
  },
  ecarts_signes: {
    label: 'Écarts signés',
    badgeCls: 'badge primary',
    icon: FileSignature,
    description: 'Écarts rédigés et signés',
    nextAction: 'Rédiger rapport',
    nextActionIcon: FileText,
    workflowStep: 4,
    borderColor: 'border-l-role-primary',
    borderAnimation: '',
  },
  rapport_signe: {
    label: 'Rapport signé',
    badgeCls: 'badge success',
    icon: FileText,
    description: 'Rapport signé, en attente de lettre',
    nextAction: 'Rédiger lettre',
    nextActionIcon: PenLine,
    workflowStep: 5,
    borderColor: 'border-l-success',
    borderAnimation: '',
  },
  lettre_signee: {
    label: 'Lettre signée DG',
    badgeCls: 'badge success',
    icon: Mail,
    description: 'Lettre signée par le DG, prête à transmettre',
    nextAction: 'Transmettre',
    nextActionIcon: Send,
    workflowStep: 6,
    borderColor: 'border-l-success',
    borderAnimation: '',
  },
  transmise: {
    label: 'Transmise',
    badgeCls: 'badge success',
    icon: Send,
    description: "Transmise à l'exploitant",
    workflowStep: 7,
    borderColor: 'border-l-success',
    borderAnimation: '',
  },
  archivee: {
    label: 'Archivée',
    badgeCls: 'badge neutral',
    icon: Archive,
    description: 'Surveillance archivée',
    workflowStep: 7,
    borderColor: 'border-l-neutral',
    borderAnimation: '',
  },
}

const WORKFLOW_STEPS = [
  { id: 'checklist', label: 'Checklist', icon: ClipboardList, step: 1, action: 'checklist' },
  { id: 'ecarts', label: 'Écarts', icon: AlertTriangle, step: 2, action: 'ecarts' },
  { id: 'rapport', label: 'Rapport', icon: FileText, step: 3, action: 'rapport' },
  { id: 'lettre', label: 'Lettre DG', icon: Mail, step: 4, action: 'lettre' },
  { id: 'transmission', label: 'Transmission', icon: Send, step: 5, action: 'transmission' },
]

const STATUT_TO_STEP: Record<string, number> = {
  planifiee: 0,
  en_cours: 1,
  checklist_signee: 2,
  ecarts_signes: 3,
  rapport_signe: 4,
  lettre_signee: 5,
  transmise: 6,  // > 5 → toutes les étapes "completed"
  archivee: 6,
}

const MOCK_INSPECTEURS: Record<string, { nom: string; prenom: string; domaine?: string }> = {
  'insp1': { nom: 'Diop', prenom: 'Mamadou', domaine: 'SGS' },
  'insp2': { nom: 'Fall', prenom: 'Aminata', domaine: 'SLI' },
  'insp3': { nom: 'Sow', prenom: 'Oumar', domaine: 'PHY' },
  'insp4': { nom: 'Ndiaye', prenom: 'Fatou', domaine: 'OPS' },
}

function getProgressColor(progression: number): string {
  if (progression >= 80) return 'progress-faible'
  if (progression >= 60) return 'progress-moyen'
  if (progression >= 30) return 'progress-eleve'
  return 'progress-critique'
}

function EntiteIcon({ typeEntite }: { typeEntite?: string }) {
  if (typeEntite === 'helistation') return <span className="flex-shrink-0" style={{ fontSize: '0.95rem', lineHeight: 1 }}>🚁</span>
  if (typeEntite === 'mixte')       return <span className="flex-shrink-0" style={{ fontSize: '0.8rem',  lineHeight: 1 }}>✈🚁</span>
  return <Plane className="h-4 w-4 text-role-primary flex-shrink-0" />
}

function WorkflowStepButton({
  currentStep,
  step,
  icon: Icon,
  label,
  isCompleted,
  isActive,
  onClick,
}: {
  currentStep: number
  step: number
  icon: React.ElementType
  label: string
  isCompleted: boolean
  isActive: boolean
  onClick: () => void
}) {
  let circleClass = ''
  let textColorClass = 'text-muted-foreground font-normal'

  if (isCompleted) {
    circleClass = 'bg-success text-white border-success shadow-md'
    textColorClass = 'text-success font-medium'
  } else if (isActive) {
    circleClass = 'bg-role-gradient text-white border-role-primary animate-pulse shadow-lg'
    textColorClass = 'text-role-primary font-bold'
  } else {
    circleClass = 'bg-role-primary-soft text-role-primary border-role-primary/30'
    textColorClass = 'text-role-primary font-semibold'
  }

  const labelParts = label.split('\n')

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex flex-col items-center flex-1 min-w-0 transition-all duration-200 group cursor-pointer"
      title={`Accéder à ${labelParts[0]}`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${circleClass} group-hover:scale-110 shadow-sm`}
      >
        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="text-[10px] mt-1.5 text-center leading-tight">
        {labelParts.map((part, idx) => (
          <span key={idx} className={`block transition-all duration-200 ${textColorClass} group-hover:scale-105`}>
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
  const NextActionIcon = statut.nextActionIcon
  const StatutIcon = statut.icon

  // État local du modal — géré dans la carte, pas dans le parent
  const [showRapportModal, setShowRapportModal] = useState(false)

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
  const borderCls = `${STATUT_CONFIG[surveillance.statut]?.borderColor || 'border-l-role-primary'} ${STATUT_CONFIG[surveillance.statut]?.borderAnimation || ''}`
  const progressColor = getProgressColor(surveillance.progression || 0)

  /**
   * Navigation vers le rapport existant (statuts post-signature).
   * Le rapport est déjà produit : on navigue directement sans passer par le modal.
   */
  const naviguerVersRapport = () => {
    if (onViewRapport) {
      onViewRapport()
    } else {
      router.push(`/surveillance/${surveillance.id}/rapport`)
    }
  }

  /**
   * Gestion du clic sur l'étape "Rapport" du workflow.
   * - rapport non encore finalisé → ouvrir le modal de choix (charger ou rédiger)
   * - rapport déjà signé          → naviguer directement vers le rapport
   */
  const STATUTS_RAPPORT_FINALISE = ['rapport_signe', 'lettre_signee', 'transmise', 'archivee'] as const
  const handleRapportClick = () => {
    if ((STATUTS_RAPPORT_FINALISE as readonly string[]).includes(surveillance.statut)) {
      naviguerVersRapport()
    } else {
      setShowRapportModal(true)
    }
  }

  // Navigation checklist avec logique SGS
  const navigateToChecklist = (type: 'standard' | 'sgs') => {
    if (onViewChecklist) {
      onViewChecklist()
    } else {
      router.push(`/surveillance/${surveillance.id}/checklist?type=${type}`)
    }
  }

  const handleChecklistAction = () => {
    const portee = surveillance.portee || []
    const isSgsOnly = portee.length === 1 && portee[0] === 'SGS'

    if (isSgsOnly) {
      navigateToChecklist('sgs')
    } else {
      // SGS + autres domaines ou domaines standards → checklist standard
      navigateToChecklist('standard')
    }
  }

  const handleStepClick = (stepId: string) => {
    if (!surveillance?.id) {
      console.error('[SurveillanceCard] surveillance.id is missing:', surveillance)
      return
    }
    switch (stepId) {
      case 'checklist':
        handleChecklistAction()
        break
      case 'ecarts':
        if (onViewEcarts) {
          onViewEcarts()
        } else {
          const isSGS = (surveillance.portee || []).length === 1 && surveillance.portee?.[0] === 'SGS';
          router.push(isSGS ? `/surveillance/${surveillance.id}/ecarts/sgs` : `/surveillance/${surveillance.id}/ecarts`);
        }
        break
      case 'rapport':
        handleRapportClick()
        break
      case 'lettre':
        if (onViewLettre) {
          onViewLettre()
        } else {
          router.push(`/surveillance/${surveillance.id}/lettre`)
        }
        break
      case 'transmission':
        if (onViewTransmission) {
          onViewTransmission()
        } else if (onTransmit) {
          onTransmit()
        } else {
          router.push(`/surveillance/${surveillance.id}`)
        }
        break
      default:
        if (onView) onView()
    }
  }

  const handleViewChecklistClick = () => {
    handleChecklistAction()
  }

  /**
   * Lien rapide "Voir le rapport" (visible uniquement pour les statuts post-signature).
   * Le rapport est déjà produit : navigation directe, pas de modal.
   */
  const handleViewRapportClick = () => {
    naviguerVersRapport()
  }

  const handleViewEcartsClick = () => {
    if (onViewEcarts) {
      onViewEcarts()
    } else {
      const isSGS = (surveillance.portee || []).length === 1 && surveillance.portee?.[0] === 'SGS';
      router.push(isSGS ? `/surveillance/${surveillance.id}/ecarts/sgs` : `/surveillance/${surveillance.id}/ecarts`);
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
  const currentWorkflowStep = STATUT_TO_STEP[surveillance.statut] || 0

  // Version grille (compacte)
  if (variant === 'grid') {
    return (
      <>
        <div
          className={`card h-full hover:shadow-xl transition-all duration-300 border-l-4 ${borderCls}`}
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
                  <span className={`${statut.badgeCls}${surveillance.statut === 'en_cours' ? ' animate-pulse' : ''}`}>
                    <StatutIcon className="h-2 w-2 mr-0.5 inline" />
                    {statut.label}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                onClick={(e) => { e.stopPropagation(); onView?.(); }}
                title="Voir détails"
              >
                <Eye className="h-3 w-3" />
              </button>
            </div>

            {/* Aérodrome */}
            <div className="flex items-center gap-1 mb-1 text-xs">
              <MapPin className="h-3 w-3 text-role-primary flex-shrink-0" />
              <span className="code-oaci-badge text-[10px]">{aerodrome?.code_oaci}</span>
              <span className="text-muted-foreground text-[10px] truncate">{aerodrome?.nom}</span>
            </div>
            <div className="mb-2">
              <TypeEntiteBadge typeEntite={aerodrome?.type_entite} />
            </div>

            {/* Dates */}
            <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3 text-role-primary" />
              <span>{dateDebutFormatted} → {dateFinFormatted}</span>
              <span className="badge neutral text-[8px]">{dureeJours}j</span>
            </div>

            {/* Progression */}
            <div className="flex items-center gap-2 mb-2">
              <div className="progress h-1 flex-1">
                <div className={`progress-bar transition-all duration-500 ${progressColor}`} style={{ width: `${surveillance.progression || 0}%` }} />
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
                  <span className="badge neutral text-[8px]">+{documentsBadges.length - 2}</span>
                )}
              </div>
            )}

            {/* Workflow steps mini */}
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-border">
              <div className="flex items-center gap-0.5">
                {WORKFLOW_STEPS.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleStepClick(step.id); }}
                    className={`w-2 h-2 rounded-full transition-all duration-200 hover:scale-125 cursor-pointer ${
                      currentWorkflowStep > step.step
                        ? 'bg-success'
                        : currentWorkflowStep === step.step
                        ? 'bg-role-primary animate-pulse'
                        : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    title={step.label}
                  />
                ))}
              </div>
              <span className="text-[8px] text-muted-foreground">étape {currentWorkflowStep}/{WORKFLOW_STEPS.length}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-1 pt-2">
              {peutAfficherChecklist && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleViewChecklistClick(); }}
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                  title="Checklist"
                >
                  <ClipboardList className="h-3 w-3" />
                </button>
              )}
              {surveillance.statut !== 'archivee' && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); router.push(`/surveillance/${surveillance.id}/presence`); }}
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                  title="Feuille de présence"
                >
                  <Users className="h-3 w-3" />
                </button>
              )}
              {/* Rapport : modal si à produire, navigation directe sinon */}
              {(surveillance.statut === 'ecarts_signes' || peutAfficherRapport) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRapportClick(); }}
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                  title="Rapport"
                >
                  <FileText className="h-3 w-3" />
                </button>
              )}
              {peutContinuer && NextActionIcon && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onContinue?.(); }}
                  className="action-button hover:text-success hover:bg-success/10 transition-all duration-200"
                  title={statut.nextAction}
                >
                  <NextActionIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal rapport — monté ici, dans le scope de la carte */}
        {showRapportModal && (
          <ChargerRedigerRapportModal
            surveillanceId={surveillance.id}
            onClose={() => setShowRapportModal(false)}
          />
        )}
      </>
    )
  }

  // Version liste (détaillée)
  return (
    <>
      <div
        className={`card mb-3 hover:shadow-xl transition-all duration-300 border-l-4 ${borderCls}`}
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
                  <span className={`${statut.badgeCls}${surveillance.statut === 'en_cours' ? ' animate-pulse' : ''}`}>
                    <StatutIcon className="h-3 w-3 mr-1 inline" />
                    {statut.label}
                  </span>
                  {surveillance.transmitted_at && (
                    <span className="badge neutral text-[10px]">
                      Transmis le {new Date(surveillance.transmitted_at).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                onClick={(e) => { e.stopPropagation(); onView?.(); }}
                title="Voir détails"
              >
                <Eye className="h-4 w-4" />
              </button>
              {surveillance.statut !== 'archivee' && (
                <button
                  type="button"
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                  onClick={(e) => { e.stopPropagation(); router.push(`/surveillance/${surveillance.id}/presence`); }}
                  title="Feuille de présence"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                className="action-button danger hover:bg-danger/10 transition-all duration-200"
                onClick={(e) => { e.stopPropagation(); onDelete?.(surveillance.id); }}
                title="Supprimer la surveillance"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {peutEditer && (
                <button
                  type="button"
                  className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                  onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                  title="Modifier"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              )}
              {peutContinuer && NextActionIcon && (
                <button
                  type="button"
                  className="action-button hover:text-success hover:bg-success/10 transition-all duration-200"
                  onClick={(e) => { e.stopPropagation(); onContinue?.(); }}
                  title={statut.nextAction}
                >
                  <NextActionIcon className="h-4 w-4" />
                </button>
              )}
              {peutTransmettre && (
                <button
                  type="button"
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                  onClick={(e) => { e.stopPropagation(); onTransmit?.(); }}
                  title="Transmettre à l'exploitant"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Workflow steps */}
          <div className="mb-4 bg-role-primary-soft p-4 rounded-lg">
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
                    onClick={() => handleStepClick(step.id)}
                  />
                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <WorkflowConnector
                      isCompleted={currentWorkflowStep >= step.step}
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
              <EntiteIcon typeEntite={aerodrome?.type_entite} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium truncate">
                  <span className="code-oaci-badge mr-1">{aerodrome?.code_oaci}</span>
                  {aerodrome?.nom}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="h-4 w-4 text-warning flex-shrink-0" />
              <span className="badge outline text-[10px]">{chef ? `${chef.prenom} ${chef.nom}` : 'Non assigné'}</span>
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
                {(surveillance.equipe_ids || []).length} inspecteur(s)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(surveillance.equipe_ids || []).map((id: string) => {
                const insp = MOCK_INSPECTEURS[id]
                if (!insp) return null
                const estChef = id === surveillance.chef_id
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-1 bg-background px-2 py-1 rounded-full border text-xs ${estChef ? 'border-warning bg-warning/5' : 'border-border'}`}
                    title={estChef ? "Chef d'équipe" : `Inspecteur - ${insp.domaine}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-role-gradient text-white text-[9px] flex items-center justify-center font-bold">
                      {getInitiales(id)}
                    </span>
                    <span className="badge outline text-[10px]">
                      {insp.prenom} {insp.nom}
                    </span>
                    {estChef && <Star className="h-3 w-3 text-warning" />}
                    <span className="badge outline text-[8px] py-0 ml-0.5">{insp.domaine}</span>
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

          {/* Progression */}
          <div className="flex items-center gap-2 mb-3">
            <div className="progress h-2 flex-1">
              <div className={`progress-bar transition-all duration-500 ${progressColor}`} style={{ width: `${surveillance.progression || 0}%` }} />
            </div>
            <span className="text-xs font-medium">{surveillance.progression || 0}%</span>
          </div>

          {/* Liens rapides */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
            {peutAfficherChecklist && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleViewChecklistClick(); }}
                className="flex items-center gap-1 text-xs text-primary hover:underline transition-all duration-200"
              >
                <ClipboardList className="w-3 h-3" />
                Voir la checklist
              </button>
            )}
            {peutAfficherEcarts && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleViewEcartsClick(); }}
                className="flex items-center gap-1 text-xs text-warning hover:underline transition-all duration-200"
              >
                <FileSignature className="w-3 h-3" />
                Voir les écarts
              </button>
            )}
            {/* Rapport : visible pour les statuts post-signature uniquement (rapport déjà produit) */}
            {peutAfficherRapport && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleViewRapportClick(); }}
                className="flex items-center gap-1 text-xs text-success hover:underline transition-all duration-200"
              >
                <FileText className="w-3 h-3" />
                Voir le rapport
              </button>
            )}
            {peutAfficherLettre && surveillance.lettre_signee_url && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); window.open(surveillance.lettre_signee_url, '_blank'); }}
                className="flex items-center gap-1 text-xs text-primary hover:underline transition-all duration-200"
              >
                <Mail className="w-3 h-3" />
                Voir la lettre
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal rapport — monté ici, dans le scope de la carte */}
      {showRapportModal && (
        <ChargerRedigerRapportModal
          surveillanceId={surveillance.id}
          onClose={() => setShowRapportModal(false)}
        />
      )}

    </>
  )
}

export default SurveillanceCard
