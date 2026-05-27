// components/cards/TacheCard.tsx
'use client'

import { CheckSquare, Clock, User, Flag, Eye, CheckCircle2, RefreshCcw, Trash2 } from 'lucide-react'

interface TacheCardProps {
  tache: {
    id: string
    titre: string
    description?: string
    assignee_nom?: string
    deadline?: string
    priorite: 'haute' | 'normale' | 'basse'
    statut: 'a_faire' | 'en_cours' | 'termine' | 'bloque'
    module_origine?: string
  }
  onViewDetails: () => void
  onMarkDone?: () => void
  onReassign?: () => void
  onDelete?: () => void
  userRole: string
  compact?: boolean
}

export function TacheCard({
  tache,
  onViewDetails,
  onMarkDone,
  onReassign,
  onDelete,
  userRole,
  compact = false
}: TacheCardProps) {

  const canDelete = userRole === 'admin' || userRole === 'inspector'

  const getPrioriteBadge = (priorite: string) => {
    switch (priorite) {
      case 'haute': return { label: 'Haute', cls: 'badge danger' }
      case 'normale': return { label: 'Normale', cls: 'badge primary' }
      case 'basse': return { label: 'Basse', cls: 'badge neutral' }
      default: return { label: priorite, cls: 'badge neutral' }
    }
  }

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'a_faire': return { label: 'À faire', cls: 'badge neutral' }
      case 'en_cours': return { label: 'En cours', cls: 'badge warning' }
      case 'termine': return { label: 'Terminé', cls: 'badge success' }
      case 'bloque': return { label: 'Bloqué', cls: 'badge danger' }
      default: return { label: statut, cls: 'badge neutral' }
    }
  }

  const prioriteBadge = getPrioriteBadge(tache.priorite)
  const statutBadge = getStatutBadge(tache.statut)
  const isOverdue = tache.deadline && new Date(tache.deadline) < new Date() && tache.statut !== 'termine'
  const canComplete = tache.statut !== 'termine' && (userRole === 'admin' || userRole === 'inspector')

  if (compact) {
    return (
      <div className={`card card-compact p-3 hover:shadow-lg transition-all duration-300 ${isOverdue ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-role-primary'}`} data-role={userRole}>
        <div className="flex items-center justify-between mb-1">
          <span className={prioriteBadge.cls}>{prioriteBadge.label}</span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-small font-medium line-clamp-1">{tache.titre}</p>
        {tache.deadline && (
          <p className={`text-xs mt-1 ${isOverdue ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
            {new Date(tache.deadline).toLocaleDateString('fr-FR')}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 mt-1">
          {canDelete && onDelete && (
            <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`card hover:shadow-xl transition-all duration-300 ${isOverdue ? 'border-l-4 border-l-danger' : 'card-accent border-l-4 border-l-role-primary'}`} data-role={userRole}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tache.statut === 'termine' ? 'bg-success/10' : 'bg-role-primary-soft'}`}>
              <CheckSquare className={`w-4 h-4 ${tache.statut === 'termine' ? 'text-success' : 'text-role-primary'}`} />
            </div>
          </div>
          <div className="flex gap-2">
            <span className={prioriteBadge.cls}>{prioriteBadge.label}</span>
            <span className={statutBadge.cls}>{statutBadge.label}</span>
          </div>
        </div>

        <h3 className="text-small font-semibold mb-2 line-clamp-2">{tache.titre}</h3>
        {tache.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{tache.description}</p>}

        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {tache.assignee_nom && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <User className="w-3 h-3 text-role-primary" />
              <span className="truncate">{tache.assignee_nom}</span>
            </div>
          )}
          {tache.deadline && (
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-danger font-semibold' : 'text-muted-foreground'}`}>
              <Clock className="w-3 h-3 text-role-primary" />
              <span>{new Date(tache.deadline).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {tache.module_origine && (
            <div className="flex items-center gap-1 text-muted-foreground col-span-2">
              <Flag className="w-3 h-3 text-role-primary" />
              <span>{tache.module_origine}</span>
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
          {canDelete && onDelete && (
            <button
              className="action-button danger hover:bg-danger/10 transition-all duration-200"
              onClick={onDelete}
              aria-label="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {canComplete && onMarkDone && (
            <button 
              className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" 
              onClick={onMarkDone} 
              aria-label="Marquer terminé"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          {onReassign && userRole === 'admin' && (
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
              onClick={onReassign} 
              aria-label="Réassigner"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}