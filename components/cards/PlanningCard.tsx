// components/cards/PlanningCard.tsx
'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
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
  AlertTriangle,
  Star,
  ClipboardList,
  Shield,
  Scale,
  LayoutGrid,
  Target,
  FileText,
  Send,
} from 'lucide-react'
import { useAppStore, Planning, Aerodrome } from '@/lib/store'
import { getDomaineLabel, expandDomaines } from '@/lib/domaines'
import { getBadgeClassFromScore, canManageRole } from '@/lib/config'

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
  estRetard?: boolean
  userRole?: string
  profilScore?: number
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
  estRetard = false,
  userRole = 'inspector',
  profilScore,
}: PlanningCardProps) {
  const router = useRouter()
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const currentUser = useAppStore(s => s.user)
  const isManager = canManageRole(userRole)

  // Contrôle d'accès mission : une fois l'équipe désignée, seul le chef
  // d'équipe exécute, le chef + les membres préparent, l'admin passe en
  // lecture seule stricte (il corrige uniquement avant désignation).
  const isChefEquipe = !!currentUser?.id && !!planning.chef_id && planning.chef_id === currentUser.id;
  const isMembreEquipe = !!currentUser?.id && !!planning.chef_id && (planning.equipe_ids || []).includes(currentUser.id);
  const equipeDesignee = !!planning.chef_id && (planning.equipe_ids?.length ?? 0) > 0;
  const canExecute = isChefEquipe;
  const canPrepare = isChefEquipe || isMembreEquipe || (isManager && !equipeDesignee);
  const canManage = isManager;
  
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
      moyenne: { cls: 'badge teal', label: 'Moyenne' },
      haute: { cls: 'badge warning', label: 'Haute' },
      critique: { cls: 'badge danger animate-pulse', label: 'Critique' },
    }
    return variants[priorite] || variants.moyenne
  }
  
  const getBorderColor = () => {
    if (estRetard) return 'border-l-danger'
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
  const sbRaw = statusBadge(planning.statut)
  const sb = estRetard && planning.statut === 'planifiee'
    ? { cls: 'badge danger animate-pulse', icon: AlertTriangle, label: 'Dépassé' }
    : sbRaw
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
  
  const handlePrepareClick = () => {
    onPrepare?.(planning)
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
               {!isProposition && !isLancee && planning.statut === 'planifiee' && (
                 <>
                   {canPrepare && (
                     <button
                       className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                       onClick={handlePrepareClick}
                       title="Préparer la surveillance"
                     >
                       <FileText className="h-4 w-4" />
                     </button>
                   )}
                   {canExecute && (
                     <button
                       className="action-button hover:text-success hover:bg-success/10 transition-all duration-200"
                       onClick={() => onExecute?.(planning)}
                       title="Lancer la surveillance (chef d'équipe)"
                     >
                       <PlayCircle className="h-4 w-4" />
                     </button>
                   )}
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
               {canManage && !isLancee && (
                 <button
                   className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                   onClick={() => onEdit?.(planning)}
                   title="Modifier"
                 >
                   <PenSquare className="h-4 w-4" />
                 </button>
               )}
               {canManage && !isLancee && onDelete && (
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
          
          {/* Alerte planning dépassé */}
          {estRetard && (
            <div className="mb-3 flex items-start gap-2 p-2.5 rounded-lg border border-danger/40 bg-danger-soft/20">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-danger">Planning dépassé — date de fin écoulée</p>
                <p className="text-muted-foreground mt-0.5">
                  Ce planning a dépassé sa date de fin ({endDate}) sans être clôturé. Réajustez les dates ou clôturez-le.
                </p>
              </div>
            </div>
          )}

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
                {profilScore !== undefined && profilScore !== null && (
                  <span className={getBadgeClassFromScore(profilScore)}>{profilScore}/100</span>
                )}
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
                <span className="w-7 h-7 rounded-full bg-role-gradient !text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
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
                    <span className="w-5 h-5 rounded-full bg-role-gradient !text-white text-[10px] flex items-center justify-center font-bold">
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
    </>
  )
}