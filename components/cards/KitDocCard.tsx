// components/cards/KitDocCard.tsx
'use client'

import {
  FileText, Download, Eye, RefreshCw, Calendar,
  BookOpen, Clipboard, FileCheck, Globe, Trash2
} from 'lucide-react'

interface KitDocCardProps {
  document: {
    id: string
    titre: string
    type: 'checklist' | 'guide' | 'reglementation' | 'formulaire' | 'rapport' | 'autre'
    reference?: string
    version?: string
    date_mise_a_jour?: string
    taille_ko?: number
    obligatoire?: boolean
    url?: string
  }
  onViewDetails: () => void
  onDownload?: () => void
  onUpdate?: () => void
  onDelete?: () => void
  userRole: string
  compact?: boolean
}

export function KitDocCard({
  document,
  onViewDetails,
  onDownload,
  onUpdate,
  onDelete,
  userRole,
  compact = false
}: KitDocCardProps) {

  const canDelete = userRole === 'admin' || userRole === 'inspector'
  const canUpdate = userRole === 'admin' || userRole === 'inspector'

  const typeMap: Record<string, { icon: typeof FileText; label: string }> = {
    checklist:      { icon: Clipboard,  label: 'Checklist' },
    guide:          { icon: BookOpen,   label: 'Guide' },
    reglementation: { icon: Globe,      label: 'Réglementation' },
    formulaire:     { icon: FileCheck,  label: 'Formulaire' },
    rapport:        { icon: FileText,   label: 'Rapport' },
    autre:          { icon: FileText,   label: 'Document' },
  }

  const config = typeMap[document.type] || typeMap.autre
  const Icon = config.icon

  if (compact) {
    return (
      <div className="card card-compact p-3 hover:shadow-lg transition-all duration-300 border-l-4 border-l-role-primary" data-role={userRole}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 flex-shrink-0 text-role-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-1">{document.titre}</p>
            {document.reference && <p className="text-xs text-muted-foreground">{document.reference}</p>}
          </div>
          <div className="flex items-center gap-1">
            {canDelete && onDelete && (
              <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={onDelete}>
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            {onDownload && (
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onDownload} 
                aria-label="Télécharger"
              >
                <Download className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card card-accent hover:shadow-xl transition-all duration-300 border-l-4 border-l-role-primary" data-role={userRole}>
      <div className="card-content p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-role-primary-soft flex items-center justify-center">
              <Icon className="w-5 h-5 text-role-primary" />
            </div>
            <span className="badge outline">{config.label}</span>
          </div>
          {document.obligatoire && <span className="badge danger">Obligatoire</span>}
        </div>

        <h3 className="text-sm font-semibold mb-2 line-clamp-2">{document.titre}</h3>

        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {document.reference && (
            <div className="flex items-center gap-1">
              <span className="code-oaci-badge">{document.reference}</span>
            </div>
          )}
          {document.version && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>v{document.version}</span>
            </div>
          )}
          {document.date_mise_a_jour && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-3 h-3 text-role-primary" />
              <span>{new Date(document.date_mise_a_jour).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {document.taille_ko && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>
                {document.taille_ko < 1024
                  ? `${document.taille_ko} Ko`
                  : `${(document.taille_ko / 1024).toFixed(1)} Mo`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button 
            className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
            onClick={onViewDetails} 
            aria-label="Voir"
          >
            <Eye className="w-4 h-4" />
          </button>
          {onDownload && (
            <button 
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
              onClick={onDownload} 
              aria-label="Télécharger"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {canUpdate && onUpdate && (
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
              onClick={onUpdate} 
              aria-label="Mettre à jour"
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
