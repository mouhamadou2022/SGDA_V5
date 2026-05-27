// components/cards/RegistreCard.tsx
'use client'

import {
  BookOpen, Calendar, User, Eye, Download,
  FileText, AlertTriangle, AlertCircle, CheckCircle2,
  GraduationCap, Shield, Scale, Plane, PenSquare, Trash2
} from 'lucide-react'

interface RegistreCardProps {
  entry: any
  aerodrome?: any
  onViewDetails: () => void
  onDownload?: () => void
  onEdit?: () => void
  onDelete?: () => void
  compact?: boolean
  userRole?: string
}

export function RegistreCard({
  entry,
  aerodrome,
  onViewDetails,
  onDownload,
  onEdit,
  onDelete,
  compact = false,
  userRole = 'inspector'
}: RegistreCardProps) {

  const canManage = ['admin', 'inspector'].includes(userRole)

  const getTypeIcon = (type: string) => {
    const icons: Record<string, any> = {
      'formations': GraduationCap,
      'evenements': AlertTriangle,
      'surveillances': Eye,
      'certifications': Shield,
      'homologations': Scale,
      'ecarts': AlertCircle,
      'exploitation': Plane
    }
    const Icon = icons[type] || BookOpen
    return <Icon className="w-4 h-4 text-role-primary" />
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'formations': return { label: 'Formations', cls: 'badge primary' }
      case 'evenements': return { label: 'Événements', cls: 'badge warning' }
      case 'surveillances': return { label: 'Surveillances', cls: 'badge primary' }
      case 'certifications': return { label: 'Certifications', cls: 'badge success' }
      case 'homologations': return { label: 'Homologations', cls: 'badge teal' }
      case 'ecarts': return { label: 'Écarts', cls: 'badge danger' }
      default: return { label: type, cls: 'badge neutral' }
    }
  }

  const getStatutBadge = (statut: string, type?: string, niveau?: string) => {
    if (niveau === 'critique') {
      return { label: 'CRITIQUE', cls: 'badge danger animate-pulse' }
    }
    if (type === 'ecarts') {
      const variants: Record<string, { label: string; cls: string }> = {
        'cloture': { label: 'Clôturé', cls: 'badge success' },
        'en_retard': { label: 'En retard', cls: 'badge danger animate-pulse' },
        'ouvert': { label: 'Ouvert', cls: 'badge warning' },
        'pac_accepte': { label: 'PAC accepté', cls: 'badge primary' },
      }
      return variants[statut] || { label: statut, cls: 'badge neutral' }
    }
    if (statut === 'certifie' || statut === 'homologue' || statut === 'termine' || statut === 'cloture') {
      return { label: 'Validé', cls: 'badge success' }
    }
    if (statut === 'en_cours' || statut === 'planifiee') {
      return { label: 'En cours', cls: 'badge primary' }
    }
    return { label: statut, cls: 'badge outline' }
  }

  const typeBadge = getTypeBadge(entry.type)
  const statutBadge = getStatutBadge(entry.statut, entry.type, entry.niveau)

  if (compact) {
    return (
      <div className="card card-compact p-2 hover:shadow-lg transition-all duration-300 border-l-4 border-l-role-primary" data-role={userRole}>
        <div className="flex items-center justify-between mb-1">
          <span className={`${typeBadge.cls} flex items-center gap-1 text-[10px]`}>
            {getTypeIcon(entry.type)}
            {entry.type_label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(entry.date).toLocaleDateString('fr-FR')}
          </span>
        </div>
        <p className="text-xs font-medium line-clamp-2 mb-1">{entry.titre}</p>
        <div className="flex items-center justify-between">
          {aerodrome && (
            <span className="code-oaci-badge text-[10px]">{aerodrome.code_oaci}</span>
          )}
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
    <div className="card hover:shadow-xl transition-all duration-300 border-l-4 border-l-role-primary" data-role={userRole}>
      <div className="card-header pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getTypeIcon(entry.type)}
            <span className="card-title text-sm font-medium">{entry.type_label}</span>
          </div>
          <span className="code-oaci-badge text-[10px]">
            {entry.reference || '-'}
          </span>
        </div>
      </div>
      <div className="card-content p-3 space-y-2">
        <p className="text-small font-medium line-clamp-2">{entry.titre}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">{entry.description}</p>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="w-3 h-3 text-role-primary" />
            {new Date(entry.date).toLocaleDateString('fr-FR')}
          </div>
          {aerodrome && (
            <span className="code-oaci-badge">
              {aerodrome.code_oaci}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="w-3 h-3 text-role-primary" />
            {entry.signataire_nom || 'N/A'}
          </div>
          <div className="flex gap-1">
            <span className={statutBadge.cls}>
              {statutBadge.label}
            </span>
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
            {onDownload && (
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onDownload}
              >
                <Download className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}