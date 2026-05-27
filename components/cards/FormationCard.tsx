// components/cards/FormationCard.tsx
'use client'

import { BookOpen, Calendar, Users, Clock, Eye, Download, UserPlus, PenSquare, Trash2 } from 'lucide-react'

interface FormationCardProps {
  formation: {
    id: string
    titre: string
    domaine: string
    date_debut: string
    duree_heures?: number
    statut: string
    participants_count?: number
    capacite_max?: number
    formateur?: string
    certifiant?: boolean
  }
  onViewDetails: () => void
  onEnroll?: () => void
  onExport?: () => void
  onEdit?: () => void
  onDelete?: () => void
  userRole: string
  compact?: boolean
}

export function FormationCard({
  formation,
  onViewDetails,
  onEnroll,
  onExport,
  onEdit,
  onDelete,
  userRole,
  compact = false
}: FormationCardProps) {

  const canManage = ['admin', 'inspector'].includes(userRole)

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'planifie': return { label: 'Planifiée', cls: 'badge primary' }
      case 'en_cours': return { label: 'En cours', cls: 'badge warning' }
      case 'termine': return { label: 'Terminée', cls: 'badge success' }
      case 'annule': return { label: 'Annulée', cls: 'badge danger' }
      default: return { label: statut, cls: 'badge neutral' }
    }
  }

  const statutBadge = getStatutBadge(formation.statut)
  const canEnroll = ['inspector', 'staff_operator', 'focal_operator'].includes(userRole) && formation.statut === 'planifie'
  const isPlein = formation.capacite_max && formation.participants_count && formation.participants_count >= formation.capacite_max

  if (compact) {
    return (
      <div className="card card-compact p-3 hover:shadow-lg transition-all duration-300 border-l-4 border-l-role-primary" data-role={userRole}>
        <div className="flex items-center justify-between mb-1">
          <span className="badge outline">{formation.domaine}</span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-small font-medium line-clamp-1">{formation.titre}</p>
        <p className="text-xs text-muted-foreground mt-1">{new Date(formation.date_debut).toLocaleDateString('fr-FR')}</p>
        <div className="flex items-center justify-end gap-1 mt-1">
          {canManage && onEdit && (
            <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" onClick={onEdit}>
              <PenSquare className="w-3 h-3" />
            </button>
          )}
          {canManage && onDelete && (
            <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card card-accent hover:shadow-xl transition-all duration-300 border-l-4 border-l-role-primary" data-role={userRole}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-role-primary-soft flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-role-primary" />
            </div>
            <span className="badge outline">{formation.domaine}</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={statutBadge.cls}>{statutBadge.label}</span>
            {formation.certifiant && <span className="badge success text-[10px]">Certifiant</span>}
          </div>
        </div>

        <h3 className="text-small font-semibold mb-3 line-clamp-2">{formation.titre}</h3>

        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="w-3 h-3 text-role-primary" />
            <span>{new Date(formation.date_debut).toLocaleDateString('fr-FR')}</span>
          </div>
          {formation.duree_heures && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3 text-role-primary" />
              <span>{formation.duree_heures}h</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="w-3 h-3 text-role-primary" />
            <span>{formation.participants_count || 0}/{formation.capacite_max || '∞'}</span>
            {isPlein && <span className="text-danger font-medium text-[10px]">Complet</span>}
          </div>
          {formation.formateur && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="truncate">{formation.formateur}</span>
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
          {canManage && onEdit && (
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
              onClick={onEdit} 
              aria-label="Modifier"
            >
              <PenSquare className="w-4 h-4" />
            </button>
          )}
          {canManage && onDelete && (
            <button 
              className="action-button danger hover:bg-danger/10 transition-all duration-200" 
              onClick={onDelete} 
              aria-label="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {canEnroll && onEnroll && !isPlein && (
            <button 
              className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" 
              onClick={onEnroll} 
              aria-label="S'inscrire"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          )}
          {onExport && (
            <button 
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
              onClick={onExport} 
              aria-label="Exporter"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}