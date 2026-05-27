// components/cards/EnqueteCard.tsx
'use client'

import { 
  ClipboardList, Calendar, Eye, MessageSquare, Download, 
  Send, Edit3, Trash2, Pause, Play, Shield, AlertTriangle,
  TrendingUp, Target, Star
} from 'lucide-react'

interface EnqueteCardProps {
  enquete: {
    id: string
    titre: string
    type: string
    statut: 'brouillon' | 'active' | 'fermee' | 'archivee'
    date_debut?: string
    date_fin?: string
    date_creation: string
    date_cloture?: string
    nb_repondants?: number
    nb_cibles?: number
    taux_completion?: number
    createur_nom?: string
    criticite?: 'basse' | 'moyenne' | 'haute' | 'critique'
    impact_securite?: string
    contexte_securite?: string
  }
  onViewDetails: () => void
  onRespond?: () => void
  onExport?: () => void
  onPrepare?: () => void
  onTransmit?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onSuspend?: () => void
  onRelance?: () => void
  userRole: string
  compact?: boolean
}

export function EnqueteCard({
  enquete,
  onViewDetails,
  onRespond,
  onExport,
  onPrepare,
  onTransmit,
  onEdit,
  onDelete,
  onSuspend,
  onRelance,
  userRole,
  compact = false
}: EnqueteCardProps) {

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'brouillon': return { label: 'Brouillon', cls: 'badge neutral' }
      case 'active':    return { label: 'Active',    cls: 'badge success animate-pulse' }
      case 'fermee':    return { label: 'Fermée',    cls: 'badge warning' }
      case 'archivee':  return { label: 'Archivée',  cls: 'badge neutral' }
      default: return { label: statut, cls: 'badge neutral' }
    }
  }

  const getCriticiteBadge = (criticite: string) => {
    switch (criticite) {
      case 'basse':    return { label: 'Basse',    cls: 'badge success' }
      case 'moyenne':  return { label: 'Moyenne',  cls: 'badge primary' }
      case 'haute':    return { label: 'Haute',    cls: 'badge warning' }
      case 'critique': return { label: 'Critique', cls: 'badge danger animate-pulse' }
      default: return { label: criticite, cls: 'badge neutral' }
    }
  }

  const getBorderColor = (statut: string, criticite?: string) => {
    if (criticite === 'critique') return 'border-l-danger'
    if (criticite === 'haute') return 'border-l-warning'
    switch (statut) {
      case 'brouillon': return 'border-l-neutral'
      case 'active':    return 'border-l-success'
      case 'fermee':    return 'border-l-warning'
      case 'archivee':  return 'border-l-neutral'
      default: return 'border-l-role-primary'
    }
  }

  const statutBadge = getStatutBadge(enquete.statut)
  const criticiteBadge = getCriticiteBadge(enquete.criticite || 'moyenne')
  const borderColor = getBorderColor(enquete.statut, enquete.criticite)
  const tauxCompletion = enquete.taux_completion ?? (
    enquete.nb_repondants && enquete.nb_cibles
      ? Math.round((enquete.nb_repondants / enquete.nb_cibles) * 100)
      : 0
  )
  
  const canEdit = ['admin', 'inspector'].includes(userRole) && enquete.statut === 'brouillon'
  const canPrepare = ['admin', 'inspector'].includes(userRole) && enquete.statut === 'brouillon'
  const canTransmit = ['admin', 'inspector'].includes(userRole) && enquete.statut === 'brouillon'
  const canRespond = enquete.statut === 'active' && ['inspector', 'focal_operator', 'staff_operator'].includes(userRole)
  const canExport = ['admin', 'dg_anacim', 'inspector'].includes(userRole) && enquete.statut !== 'brouillon'
  const canSuspend = ['admin', 'inspector'].includes(userRole) && enquete.statut === 'active'
  const canRelance = ['admin', 'inspector'].includes(userRole) && enquete.statut === 'active'
  const canDelete = ['admin'].includes(userRole) && enquete.statut === 'brouillon'

  if (compact) {
    return (
      <div className={`card card-compact p-3 hover:shadow-lg transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
        <div className="flex items-center justify-between mb-1">
          <span className="badge outline text-xs">{enquete.type}</span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-sm font-medium line-clamp-1">{enquete.titre}</p>
        <div className="progress h-1 mt-2">
          <div className="progress-bar" style={{ width: `${tauxCompletion}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className={`card card-accent hover:shadow-xl transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
      <div className="card-content p-4">
        
        {/* En-tête */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-role-primary-soft flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-role-primary" />
            </div>
            <span className="badge outline">{enquete.type}</span>
            <span className={criticiteBadge.cls}>{criticiteBadge.label}</span>
          </div>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>

        {/* Titre */}
        <h3 className="text-sm font-semibold mb-2 line-clamp-2">{enquete.titre}</h3>
        
        {/* Description courte */}
        {enquete.impact_securite && (
          <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
            <Shield className="w-3 h-3 text-role-primary" />
            <span className="truncate">{enquete.impact_securite?.substring(0, 60)}...</span>
          </div>
        )}

        {/* Progression */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Complétion</span>
            <span className="font-medium">{tauxCompletion}%</span>
          </div>
          <div className="progress h-2">
            <div className="progress-bar" style={{ width: `${tauxCompletion}%` }} />
          </div>
          {enquete.nb_repondants !== undefined && enquete.nb_cibles && (
            <p className="text-xs text-muted-foreground mt-1">
              {enquete.nb_repondants} / {enquete.nb_cibles} répondants
            </p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {enquete.date_debut && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-3 h-3 text-role-primary" />
              <span>Du {new Date(enquete.date_debut).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {enquete.date_fin && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-3 h-3 text-role-primary" />
              <span>Au {new Date(enquete.date_fin).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {enquete.createur_nom && (
            <div className="flex items-center gap-1 text-muted-foreground col-span-2">
              <span>Par: {enquete.createur_nom}</span>
            </div>
          )}
        </div>

        {/* Boutons d'action selon statut */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border flex-wrap">
          
          {/* Boutons pour BROUILLON */}
          {enquete.statut === 'brouillon' && (
            <>
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onViewDetails} 
                title="Voir détails"
              >
                <Eye className="w-4 h-4" />
              </button>
              {canPrepare && onPrepare && (
                <button 
                  className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
                  onClick={onPrepare} 
                  title="Préparer le questionnaire"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              {canEdit && onEdit && (
                <button 
                  className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
                  onClick={onEdit} 
                  title="Modifier"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              {canTransmit && onTransmit && (
                <button 
                  className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" 
                  onClick={onTransmit} 
                  title="Transmettre"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
              {canDelete && onDelete && (
                <button 
                  className="action-button danger hover:bg-danger/10 transition-all duration-200" 
                  onClick={onDelete} 
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* Boutons pour ACTIVE */}
          {enquete.statut === 'active' && (
            <>
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onViewDetails} 
                title="Voir détails"
              >
                <Eye className="w-4 h-4" />
              </button>
              {canRespond && onRespond && (
                <button 
                  className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
                  onClick={onRespond} 
                  title="Répondre"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}
              {canSuspend && onSuspend && (
                <button 
                  className="action-button hover:text-warning hover:bg-warning/10 transition-all duration-200" 
                  onClick={onSuspend} 
                  title="Suspendre"
                >
                  <Pause className="w-4 h-4" />
                </button>
              )}
              {canRelance && onRelance && (
                <button 
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                  onClick={onRelance} 
                  title="Relancer"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              {canExport && onExport && (
                <button 
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                  onClick={onExport} 
                  title="Exporter"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {/* Boutons pour FERMEE / ARCHIVEE */}
          {(enquete.statut === 'fermee' || enquete.statut === 'archivee') && (
            <>
              <button 
                className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                onClick={onViewDetails} 
                title="Voir résultats"
              >
                <Eye className="w-4 h-4" />
              </button>
              {canExport && onExport && (
                <button 
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
                  onClick={onExport} 
                  title="Exporter"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}