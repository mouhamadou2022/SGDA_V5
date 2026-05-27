// components/cards/CompetenceCard.tsx
'use client'

import { Award, Calendar, User, Eye, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react'

interface CompetenceCardProps {
  competence: {
    id: string
    inspecteur_nom: string
    domaine: string
    sous_domaine?: string
    niveau: 1 | 2 | 3 | 4 | 5
    date_obtention?: string
    date_expiration?: string
    statut: 'valide' | 'expire' | 'bientot_expire'
    habilitation_ref?: string
  }
  onViewDetails: () => void
  onRenew?: () => void
  onDelete?: () => void
  userRole: string
  compact?: boolean
}

export function CompetenceCard({
  competence,
  onViewDetails,
  onRenew,
  onDelete,
  userRole,
  compact = false
}: CompetenceCardProps) {

  const canDelete = userRole === 'admin' || userRole === 'dg_anacim'

  const niveauLabels = ['', 'Débutant', 'Junior', 'Confirmé', 'Senior', 'Expert']
  const niveauProgress = competence.niveau * 20

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'valide': return { label: 'Valide', cls: 'badge success' }
      case 'expire': return { label: 'Expiré', cls: 'badge danger animate-pulse' }
      case 'bientot_expire': return { label: 'Bientôt exp.', cls: 'badge warning' }
      default: return { label: statut, cls: 'badge neutral' }
    }
  }

  const getBorderColor = (statut: string) => {
    switch (statut) {
      case 'valide': return 'border-l-success'
      case 'expire': return 'border-l-danger'
      case 'bientot_expire': return 'border-l-warning'
      default: return 'border-l-role-primary'
    }
  }

  const statutBadge = getStatutBadge(competence.statut)
  const borderColor = getBorderColor(competence.statut)
  const joursRestants = competence.date_expiration
    ? Math.floor((new Date(competence.date_expiration).getTime() - Date.now()) / 86400000)
    : null
  const canRenew = userRole === 'admin' || userRole === 'dg_anacim'

  if (compact) {
    return (
      <div className={`card card-compact p-3 hover:shadow-lg transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate">{competence.inspecteur_nom}</span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-xs text-muted-foreground">{competence.domaine}</p>
        <div className="progress mt-2" style={{height:'4px'}}>
          <div className="progress-bar" style={{width:`${niveauProgress}%`}} />
        </div>
        <div className="flex items-center justify-end gap-1 mt-1">
          <button
            className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
            onClick={onViewDetails}
            aria-label="Voir détails"
          >
            <Eye className="w-3 h-3" />
          </button>
          {canDelete && onDelete && (
            <button
              className="action-button danger hover:bg-danger/10 transition-all duration-200"
              onClick={onDelete}
              aria-label="Supprimer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`card hover:shadow-xl transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-role-primary-soft flex items-center justify-center">
              <Award className="w-5 h-5 text-role-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{competence.sous_domaine || 'Compétence'}</p>
              <span className="badge outline text-xs">{competence.domaine}</span>
            </div>
          </div>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>

        <div className="flex items-center gap-1 mb-3">
          <User className="w-3 h-3 text-role-primary" />
          <p className="text-sm font-semibold">{competence.inspecteur_nom}</p>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Niveau: {niveauLabels[competence.niveau]}</span>
            <span className="font-medium">{competence.niveau}/5</span>
          </div>
          <div className="progress" style={{height:'8px'}}>
            <div className="progress-bar" style={{width:`${niveauProgress}%`}} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {competence.date_obtention && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-3 h-3 text-role-primary" />
              <span>Obtenu: {new Date(competence.date_obtention).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {competence.date_expiration && (
            <div className={`flex items-center gap-1 ${joursRestants !== null && joursRestants < 30 ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
              {joursRestants !== null && joursRestants < 30 && <AlertTriangle className="w-3 h-3" />}
              <Calendar className="w-3 h-3 text-role-primary" />
              <span>Exp: {new Date(competence.date_expiration).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button 
            className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
            onClick={onViewDetails} 
            aria-label="Voir détails"
          >
            <Eye className="w-4 h-4" />
          </button>
          {canRenew && onRenew && competence.statut !== 'valide' && (
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
              onClick={onRenew} 
              aria-label="Renouveler"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              className="action-button danger hover:bg-danger/10 transition-all duration-200"
              onClick={onDelete}
              aria-label="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
