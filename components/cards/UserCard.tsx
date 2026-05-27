// components/cards/UserCard.tsx
'use client'

import { User, Plane, Eye, PenSquare, Power, Clock, Trash2 } from 'lucide-react'
import { ROLES } from '@/lib/config'

interface UserCardProps {
  utilisateur: {
    id: string
    nom: string
    prenom: string
    role: string
    aerodrome_code?: string
    actif: boolean
    derniere_connexion?: string
    must_change_password?: boolean
  }
  onViewDetails: () => void
  onEdit?: () => void
  onToggleActif?: () => void
  onDelete?: () => void
  userRole: string
  compact?: boolean
}

export function UserCard({
  utilisateur,
  onViewDetails,
  onEdit,
  onToggleActif,
  onDelete,
  userRole,
  compact = false
}: UserCardProps) {

  const getBorderColor = (actif: boolean, mustChangePassword?: boolean) => {
    if (mustChangePassword) return 'border-l-warning'
    return actif ? 'border-l-success' : 'border-l-neutral'
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    inspector: 'Inspecteur',
    dg_anacim: 'DG ANACIM',
    dg_operator: 'DG Exploitant',
    focal_operator: 'Point Focal',
    staff_operator: 'Staff Exploitant',
    guest: 'Invité',
  }

  const getRoleBadge = (role: string): { label: string; cls: string } => {
    const badges: Record<string, { label: string; cls: string }> = {
      admin: { label: 'Administrateur', cls: 'badge primary' },
      inspector: { label: 'Inspecteur', cls: 'badge teal' },
      dg_anacim: { label: 'DG ANACIM', cls: 'badge purple' },
      dg_operator: { label: 'DG Exploitant', cls: 'badge success' },
      focal_operator: { label: 'Point Focal', cls: 'badge primary' },
      staff_operator: { label: 'Staff Exploitant', cls: 'badge neutral' },
      guest: { label: 'Invité', cls: 'badge neutral' },
    }
    return badges[role] || { label: role, cls: 'badge neutral' }
  }

  const initiales = `${utilisateur.prenom?.[0] || ''}${utilisateur.nom?.[0] || ''}`.toUpperCase()
  const roleLabel = roleLabels[utilisateur.role] || utilisateur.role
  const roleBadge = getRoleBadge(utilisateur.role)
  const canManage = userRole === 'admin'
  const borderColor = getBorderColor(utilisateur.actif, utilisateur.must_change_password)
  const statutBadge = utilisateur.actif 
    ? { label: 'Actif', cls: 'badge success' }
    : { label: 'Inactif', cls: 'badge neutral' }
  const derniereConnexionDate = utilisateur.derniere_connexion
    ? new Date(utilisateur.derniere_connexion).toLocaleDateString('fr-FR')
    : 'Jamais'

  if (compact) {
    return (
      <div className={`card p-3 hover:shadow-lg transition-all duration-300 border-l-4 ${borderColor}`} data-role={userRole}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-role-primary-soft flex items-center justify-center text-xs font-bold text-role-primary">
            {initiales}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{utilisateur.prenom} {utilisateur.nom}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <span className={statutBadge.cls}>
            {statutBadge.label}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`card border-l-4 ${borderColor} hover:shadow-xl transition-all duration-300`}
      data-role={userRole}
    >
      <div className="card-content p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-role-primary-soft flex items-center justify-center text-lg font-bold text-role-primary flex-shrink-0">
            {initiales}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{utilisateur.prenom} {utilisateur.nom}</p>
                <span className={roleBadge.cls}>{roleBadge.label}</span>
              </div>
              <span className={statutBadge.cls}>
                {statutBadge.label}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1 mb-3 text-xs">
          {utilisateur.aerodrome_code && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Plane className="w-3 h-3 text-role-primary" />
              <span className="code-oaci-badge">{utilisateur.aerodrome_code}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3 text-role-primary" />
            <span>Connexion: {derniereConnexionDate}</span>
          </div>
          {utilisateur.must_change_password && (
            <div className="badge warning text-[10px] animate-pulse">Doit changer son mot de passe</div>
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
          {canManage && onToggleActif && (
            <button
              className={`action-button ${utilisateur.actif ? 'danger hover:bg-danger/10' : 'success hover:bg-success/10'} transition-all duration-200`}
              onClick={onToggleActif}
              aria-label={utilisateur.actif ? 'Désactiver' : 'Activer'}
            >
              <Power className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}