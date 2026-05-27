// components/cards/EvenementCard.tsx
'use client'

import {
  AlertTriangle, AlertOctagon, AlertCircle, Flame, Info,
  Calendar, MapPin, Clock, Eye, Users, Plane, FileText,
  PenSquare, Trash2
} from 'lucide-react'

interface EvenementCardProps {
  evenement: any
  aerodrome?: any
  onViewDetails: () => void
  onViewRapport?: () => void
  onEdit?: () => void
  onDelete?: () => void
  compact?: boolean
  userRole?: string
}

export function EvenementCard({
  evenement,
  aerodrome,
  onViewDetails,
  onViewRapport,
  onEdit,
  onDelete,
  compact = false,
  userRole = 'inspector'
}: EvenementCardProps) {

  const canManage = ['admin', 'inspector'].includes(userRole)

  const getIconeGravite = (gravite: string) => {
    switch(gravite) {
      case 'CRITIQUE': return <Flame className="w-5 h-5 text-danger" />
      case 'ORANGE': return <AlertOctagon className="w-5 h-5 text-warning" />
      case 'JAUNE': return <AlertCircle className="w-5 h-5 text-role-primary" />
      case 'GRIS': return <Info className="w-5 h-5 text-muted-foreground" />
      default: return <Info className="w-5 h-5 text-role-primary" />
    }
  }

  const getBadgeGravite = (gravite: string): { label: string; cls: string } => {
    const variants: Record<string, { label: string; cls: string }> = {
      'CRITIQUE': { label: 'Critique', cls: 'badge danger animate-pulse' },
      'ORANGE': { label: 'Orange', cls: 'badge warning' },
      'JAUNE': { label: 'Jaune', cls: 'badge primary' },
      'GRIS': { label: 'Gris', cls: 'badge neutral' },
      'BLEU': { label: 'Bleu', cls: 'badge teal' },
    }
    return variants[gravite] || { label: gravite, cls: 'badge neutral' }
  }

  const getBadgeStatut = (statut: string): { label: string; cls: string } => {
    const statuts: Record<string, { label: string; cls: string }> = {
      'recu': { label: 'Reçu', cls: 'badge primary' },
      'en_cours': { label: 'En cours', cls: 'badge warning' },
      'analyse': { label: 'Analyse', cls: 'badge primary' },
      'ecart_cree': { label: 'Écart créé', cls: 'badge warning' },
      'rapport_redige': { label: 'Rapport', cls: 'badge success' },
      'cloture': { label: 'Clôturé', cls: 'badge neutral' }
    }
    return statuts[statut] || { label: statut, cls: 'badge neutral' }
  }

  const getBorderColor = (gravite: string): string => {
    const colors: Record<string, string> = {
      'CRITIQUE': 'border-l-danger',
      'ORANGE': 'border-l-warning',
      'JAUNE': 'border-l-role-primary',
      'GRIS': 'border-l-neutral',
      'BLEU': 'border-l-success',
    }
    return colors[gravite] || 'border-l-role-primary'
  }

  const badgeGravite = getBadgeGravite(evenement.gravite)
  const badgeStatut = getBadgeStatut(evenement.statut)
  const borderColor = getBorderColor(evenement.gravite)

  if (compact) {
    return (
      <div className={`card card-compact p-3 border-l-4 ${borderColor} hover:shadow-lg transition-all duration-300`} data-role={userRole}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 flex-1">
            {getIconeGravite(evenement.gravite)}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="code-oaci-badge text-xs">{evenement.reference}</span>
                <span className={badgeStatut.cls}>
                  {badgeStatut.label}
                </span>
              </div>
              <p className="text-xs mt-1 line-clamp-2 text-foreground">{evenement.description}</p>
            </div>
          </div>
          <button 
            className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
            onClick={onViewDetails}
          >
            <Eye className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3 text-role-primary" />
          {new Date(evenement.date).toLocaleDateString('fr-FR')} {evenement.heure}
          {aerodrome && (
            <>
              <span>•</span>
              <span className="font-medium">{aerodrome.code_oaci}</span>
            </>
          )}
        </div>
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
    <div className={`card border-l-4 ${borderColor} hover:shadow-xl transition-all duration-300`} data-role={userRole}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-1">
              {getIconeGravite(evenement.gravite)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="code-oaci-badge text-xs font-semibold">{evenement.reference}</span>
                <span className={badgeStatut.cls}>
                  {badgeStatut.label}
                </span>
                <span className={badgeGravite.cls}>
                  {evenement.type}
                </span>
              </div>

              <p className="text-small text-foreground mb-3">{evenement.description}</p>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-role-primary" />
                  {new Date(evenement.date).toLocaleDateString('fr-FR')} {evenement.heure}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-role-primary" />
                  {evenement.localisation}
                </div>
                {evenement.blesses && (evenement.blesses.mortels > 0 || evenement.blesses.graves > 0) && (
                  <div className="flex items-center gap-1 text-danger col-span-2">
                    <Users className="w-3 h-3" />
                    {evenement.blesses.mortels > 0 && `${evenement.blesses.mortels} mortel(s)`}
                    {evenement.blesses.graves > 0 && ` ${evenement.blesses.graves} blessé(s) grave(s)`}
                  </div>
                )}
                {evenement.aeronef && (
                  <div className="flex items-center gap-1 col-span-2">
                    <Plane className="w-3 h-3 text-role-primary" />
                    {evenement.aeronef.immatriculation} - {evenement.aeronef.type}
                  </div>
                )}
              </div>

              {evenement.ecart_ids && evenement.ecart_ids.length > 0 && (
                <div className="mt-2 flex items-center gap-1">
                  <span className="badge outline text-[10px]">
                    {evenement.ecart_ids.length} écart(s) lié(s)
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <button 
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
              onClick={onViewDetails}
            >
              <Eye className="w-4 h-4" />
            </button>
            {canManage && onEdit && (
              <button 
                className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
                onClick={onEdit}
              >
                <PenSquare className="w-4 h-4" />
              </button>
            )}
            {canManage && onDelete && (
              <button 
                className="action-button danger hover:bg-danger/10 transition-all duration-200" 
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {onViewRapport && evenement.rapport_final_url && (
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onViewRapport}
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}