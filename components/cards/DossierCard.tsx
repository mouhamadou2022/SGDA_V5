// components/cards/DossierCard.tsx
'use client'

import { useState } from 'react'
import {
  FolderOpen, Calendar, User, Clock,
  Eye, Download, CheckCircle2, AlertCircle, AlertTriangle,
  MoreVertical, History, PenSquare, Trash2
} from 'lucide-react'
import { dossierUtils } from '@/lib/dossierUtils'

interface DossierCardProps {
  dossier: any
  aerodrome?: any
  onViewDetails: () => void
  onViewHistory?: () => void
  onMarkComplete?: () => void
  onDownload?: () => void
  onEdit?: () => void
  onDelete?: () => void
  compact?: boolean
  userRole?: string
}

export function DossierCard({
  dossier,
  aerodrome,
  onViewDetails,
  onViewHistory,
  onMarkComplete,
  onDownload,
  onEdit,
  onDelete,
  compact = false,
  userRole = 'inspector'
}: DossierCardProps) {

  const canManage = ['admin', 'chef'].includes(userRole)
  const [showMenu, setShowMenu] = useState(false)

  const getDelaiIndicator = (dateLimite: string) => {
    const { jours } = dossierUtils.getDelaiRestant(dateLimite)

    if (jours <= 0) {
      const overdue = Math.abs(jours)
      return {
        label: overdue > 0 ? `${overdue}j de retard` : 'Échéance aujourd\'hui',
        className: 'badge danger',
        icon: AlertCircle
      }
    }
    if (jours === 1) {
      return { label: 'Demain', className: 'badge danger animate-pulse', icon: AlertTriangle }
    }
    if (jours < 7) {
      return { label: `${jours}j`, className: 'badge warning', icon: Clock }
    }
    return { label: `${jours}j`, className: 'badge success', icon: CheckCircle2 }
  }

  const getStatutBadge = (statut: string): { cls: string; label: string } => {
    const variants: Record<string, { cls: string; label: string }> = {
      'en_cours':  { cls: 'badge primary', label: 'En cours' },
      'en_attente':{ cls: 'badge warning', label: 'En attente' },
      'termine':   { cls: 'badge success', label: 'Terminé' },
      'archive':   { cls: 'badge neutral', label: 'Archivé' },
    }
    return variants[statut] || { cls: 'badge neutral', label: statut }
  }

  const getBorderColor = (statut: string, joursRestants?: number) => {
    if (joursRestants !== undefined && joursRestants < 0) return 'border-l-danger'
    if (statut === 'termine') return 'border-l-success'
    if (statut === 'en_attente') return 'border-l-warning'
    return 'border-l-role-primary'
  }

  const delai = getDelaiIndicator(dossier.date_limite)
  const DelaiIcon = delai.icon
  const statutBadge = getStatutBadge(dossier.statut)
  const borderColor = getBorderColor(dossier.statut, dossierUtils.getDelaiRestant(dossier.date_limite).jours)

  if (compact) {
    return (
      <div className={`card card-compact p-3 hover:shadow-lg transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-role-primary" />
            <span className="code-oaci-badge text-xs">{dossier.reference}</span>
          </div>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-sm font-medium mb-2 line-clamp-2">{dossier.titre}</p>
        {aerodrome && (
          <p className="text-xs text-muted-foreground mb-2">{aerodrome.code_oaci}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className={`${delai.className} flex items-center gap-1 text-[10px]`}>
            <DelaiIcon className="w-3 h-3" />
            {delai.label}
          </span>
          <div className="flex items-center gap-1">
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
            <button 
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
              onClick={onViewDetails}
            >
              <Eye className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card hover:shadow-xl transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
      {/* Header */}
      <div className="card-header pb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-role-primary" />
          <div>
            <p className="code-oaci-badge text-xs">{dossier.reference}</p>
            <p className="text-sm font-medium line-clamp-1">{dossier.titre}</p>
          </div>
        </div>

        {/* Native dropdown */}
        <div className="relative inline-block">
          <button
            className="action-button hover:bg-role-primary/10 transition-all duration-200"
            onClick={() => setShowMenu(v => !v)}
            aria-label="Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <div
              className="dropdown-menu absolute right-0 top-full mt-1 z-50"
              onMouseLeave={() => setShowMenu(false)}
            >
              <button className="dropdown-item w-full text-left" onClick={() => { onViewDetails(); setShowMenu(false) }}>
                <Eye className="w-4 h-4 mr-2" />Voir détails
              </button>
              {onViewHistory && (
                <button className="dropdown-item w-full text-left" onClick={() => { onViewHistory(); setShowMenu(false) }}>
                  <History className="w-4 h-4 mr-2" />Historique
                </button>
              )}
               {canManage && dossier.statut !== 'termine' && onMarkComplete && (
                 <button className="dropdown-item w-full text-left" onClick={() => { onMarkComplete(); setShowMenu(false) }}>
                   <CheckCircle2 className="w-4 h-4 mr-2 text-success" />Marquer terminé
                 </button>
               )}
               {canManage && onEdit && (
                 <button className="dropdown-item w-full text-left" onClick={() => { onEdit(); setShowMenu(false) }}>
                   <PenSquare className="w-4 h-4 mr-2" />Modifier
                 </button>
               )}
               {canManage && onDelete && (
                 <button className="dropdown-item w-full text-left text-danger" onClick={() => { onDelete(); setShowMenu(false) }}>
                   <Trash2 className="w-4 h-4 mr-2" />Supprimer
                 </button>
               )}
               {onDownload && (
                <button className="dropdown-item w-full text-left" onClick={() => { onDownload(); setShowMenu(false) }}>
                  <Download className="w-4 h-4 mr-2" />Télécharger
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="card-content p-3 space-y-3">
        {aerodrome && (
          <span className="badge outline">
            {aerodrome.code_oaci} - {aerodrome.nom}
          </span>
        )}

        {/* Progression avec animation */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-medium">{dossier.progression}%</span>
          </div>
          <div className="progress h-1.5">
            <div className="progress-bar transition-all duration-500" style={{ width: `${dossier.progression}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className={`${delai.className} flex items-center gap-1 text-xs`}>
            <DelaiIcon className="w-3 h-3" />
            {delai.label}
          </span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 text-role-primary" />
            <span>{dossier.assignments?.map((a: any) => a.inspecteur_nom).join(', ') || 'Inspecteur assigné'}</span>
          </div>
          <div className="flex items-center gap-1">
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
            <Calendar className="w-3 h-3 text-role-primary" />
            <span>{new Date(dossier.date_limite).toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}