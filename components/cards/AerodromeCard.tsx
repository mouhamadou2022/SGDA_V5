// components/cards/AerodromeCard.tsx
'use client'
// ZÉRO @/components/ui/ import

import {
  Plane, MapPin, Shield, Eye, PenSquare, PlayCircle,
  Clock, AlertTriangle, Trash2
} from 'lucide-react'
import { useState } from 'react'
import ConfirmationSuppressionAvancee from '../modals/ConfirmationSuppressionAvancee'
import { useAppStore } from '../../lib/store'

interface AerodromeCardProps {
  aerodrome: {
    id: string
    code_oaci: string
    nom: string
    type: string
    type_entite?: 'aerodrome' | 'helistation' | 'mixte'
    region: string
    statut_certification?: string
    sslia?: string
    latitude?: number
    longitude?: number
    derniere_surveillance?: string
    score_risque?: number
  }
  onViewDetails: () => void
  onStartSurveillance?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onToggleActif?: () => void
  userRole: string
  compact?: boolean
}

function EntiteIcon({ typeEntite, className = 'w-5 h-5 text-role-primary' }: { typeEntite?: string; className?: string }) {
  if (typeEntite === 'helistation') return <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🚁</span>
  if (typeEntite === 'mixte')       return <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>✈🚁</span>
  return <Plane className={className} />
}

export function AerodromeCard({
  aerodrome,
  onViewDetails,
  onStartSurveillance,
  onEdit,
  onDelete,
  onToggleActif,
  userRole,
  compact = false
}: AerodromeCardProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteAerodrome = useAppStore(s => s.deleteAerodrome)
  const surveillances = useAppStore(s => s.surveillances)
  
  const handleDelete = () => {
    setIsDeleting(true)
    deleteAerodrome(aerodrome.id)
    setShowDeleteModal(false)
    setIsDeleting(false)
    onDelete?.()
  }
  
  const getCascadeItems = () => {
    const relatedSurveillances = surveillances.filter(s => 
      s.aerodrome_id === aerodrome.id && !['archivee', 'terminee'].includes(s.statut)
    )
    const archivedSurveillances = surveillances.filter(s => 
      s.aerodrome_id === aerodrome.id && ['archivee', 'terminee'].includes(s.statut)
    )
    
    return [
      { type: 'Surveillances', count: relatedSurveillances.length, status: 'en_cours/planifiee' },
      { type: 'Surveillances', count: archivedSurveillances.length, status: 'archivée/terminée', kept: true }
    ].filter(item => item.count > 0)
  }

  const getBorderColor = (statut?: string, score?: number) => {
    if (!statut) return 'border-l-neutral'
    if (score !== undefined && score >= 80) return 'border-l-danger animate-pulse'
    if (score !== undefined && score >= 60) return 'border-l-warning'
    return 'border-l-role-primary'
  }

  const getStatutBadge = (statut?: string) => {
    switch (statut) {
      case 'certifie': return { label: 'Certifié', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success' }
      case 'homologue': return { label: 'Homologué', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary' }
      case 'suspendu': return { label: 'Suspendu', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-danger' }
      case 'en_cours': return { label: 'En cours', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning' }
      default: return { label: 'Non certifié', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-slate-400' }
    }
  }

  const canEdit = userRole === 'admin' || userRole === 'dg_anacim'
  const canDelete = userRole === 'admin' || userRole === 'dg_anacim'
  const canSurveiller = userRole === 'inspector' || userRole === 'admin'
  const statutBadge = getStatutBadge(aerodrome.statut_certification)
  const borderColor = getBorderColor(aerodrome.statut_certification, aerodrome.score_risque)

  if (compact) {
    return (
      <div className={`card p-3 hover:shadow-lg transition-shadow border-l-4 ${borderColor}`} data-role={userRole}>
        <div className="flex items-center justify-between mb-1">
          <span className="code-oaci-badge text-xs">{aerodrome.code_oaci}</span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-sm font-medium line-clamp-1">{aerodrome.nom}</p>
        <div className="flex items-center gap-1 text-xs text-muted mt-1">
            <MapPin className="w-3 h-3" />
            <span>{aerodrome.region}</span>
          </div>
      </div>
    )
  }

  return (
    <div className={`card border-l-4 ${borderColor} hover:shadow-xl transition-shadow`} data-role={userRole}>
      <div className="card-content p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center">
              <EntiteIcon typeEntite={aerodrome.type_entite} />
            </div>
            <div>
              <span className="code-oaci-badge text-sm">{aerodrome.code_oaci}</span>
              <p className="text-xs text-muted mt-0.5">{aerodrome.type}</p>
            </div>
          </div>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>

        <h3 className="text-small font-semibold mb-2 line-clamp-1">{aerodrome.nom}</h3>

        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div className="flex items-center gap-1 text-body">
            <MapPin className="w-3 h-3 text-role-primary" />
            <span>{aerodrome.region}</span>
          </div>
          {aerodrome.sslia && (
            <div className="flex items-center gap-1 text-body">
              <Shield className="w-3 h-3 text-role-primary" />
              <span>SSLIA: {aerodrome.sslia}</span>
            </div>
          )}
          {aerodrome.derniere_surveillance && (
            <div className="flex items-center gap-1 text-body">
              <Clock className="w-3 h-3 text-role-primary" />
              <span>{new Date(aerodrome.derniere_surveillance).toLocaleDateString('fr-FR')}</span>
            </div>
          )}

          {/* Modification 1 : Score risque avec risk-badge */}
          {aerodrome.score_risque !== undefined && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span className={`risk-badge ${aerodrome.score_risque >= 80 ? 'critical' : aerodrome.score_risque >= 60 ? 'moderate' : aerodrome.score_risque >= 30 ? 'good' : 'excellent'}`}>
                {aerodrome.score_risque}/100
              </span>
            </div>
          )}
        </div>

        {/* Modification 3 : Bordure avec border-muted */}
        <div className="flex items-center justify-end gap-1 pt-2 border-t border-border">
          <button className="btn btn-ghost hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onViewDetails} aria-label="Voir détails">
            <Eye className="w-4 h-4" />
          </button>
          {canSurveiller && onStartSurveillance && (
            <button className="btn btn-ghost hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onStartSurveillance} aria-label="Démarrer surveillance">
              <PlayCircle className="w-4 h-4" />
            </button>
          )}
          {canEdit && onEdit && (
            <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" onClick={onEdit} aria-label="Modifier">
              <PenSquare className="w-4 h-4" />
            </button>
          )}
          {canDelete && (
            <button 
              className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200" 
              onClick={() => setShowDeleteModal(true)}
              aria-label="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Modale de suppression */}
      <ConfirmationSuppressionAvancee
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        entity="aérodrome"
        entityName={`${aerodrome.nom} (${aerodrome.code_oaci})`}
        cascadeItems={getCascadeItems()}
        isLoading={isDeleting}
      />
    </div>
  )
}

