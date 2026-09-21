// components/modules/planning/PlanningTableColumns.tsx
// Colonnes DataTable de la vue Tableau, extraites de PlanningModule
// (comportement identique). Fonction pure : les permissions par ligne sont
// recalculées depuis `user`/`isManager` comme avant, les callbacks viennent
// du parent.

import { PlayCircle, CheckCircle2, Info, Edit2, Trash2 } from 'lucide-react';
import type { Planning } from '@/lib/store';
import type { Column } from '@/components/ui/DataTable';

export interface TablePlanning extends Planning {
  aerodromeCode: string
  aerodromeNom: string
  profilScore?: number
  risqueNiveau?: string | null
  isLancee?: boolean
  surveillanceId?: string
  nomsEquipe: string[]
}

export interface PlanningTableDeps {
  /** Seul `user.id` est lu (permissions par ligne) — AuthUser ou Utilisateur. */
  user: { id?: string } | null
  isManager: boolean
  onPrepare: (item: TablePlanning) => void
  onExecute: (item: TablePlanning) => void
  onViewDetails: (item: TablePlanning) => void
  onEdit: (item: TablePlanning) => void
  onDelete: (item: TablePlanning) => void
}

/* ───────── Colonnes DataTable pour la vue Tableau ───────── */

export function buildPlanningTableColumns({
  user, isManager, onPrepare, onExecute, onViewDetails, onEdit, onDelete,
}: PlanningTableDeps): Column<TablePlanning>[] {
  return [
    {
      key: 'aerodrome',
      header: 'Aérodrome',
      render: (item) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="code-oaci-badge">{item.aerodromeCode}</span>
            <span className="font-semibold text-sm text-foreground">{item.aerodromeNom}</span>
            {item.profilScore !== undefined && (
              <span className={`badge text-xs ${item.profilScore < 30 ? 'danger' : item.profilScore < 60 ? 'warning' : 'success'}`}>
                Score {item.profilScore}/100
              </span>
            )}
          </div>
          {item.nomsEquipe.length > 0 && (
            <span className="text-xs text-muted-foreground">{item.nomsEquipe.join(', ')}</span>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item) => <span className="capitalize text-sm">{item.type?.replace(/_/g, ' ') || '—'}</span>,
    },
    {
      key: 'periode',
      header: 'Période',
      render: (item) => (
        <span className="text-xs text-muted-foreground">
          {item.date_debut ? new Date(item.date_debut).toLocaleDateString('fr-FR') : '?'} → {item.date_fin ? new Date(item.date_fin).toLocaleDateString('fr-FR') : '?'}
        </span>
      ),
    },
    {
      key: 'domaines',
      header: 'Domaines',
      render: (item) => <span className="text-xs">{item.portee?.length ? item.portee.slice(0, 4).join(', ') : '—'}</span>,
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (item) => {
        const statutMap: Record<string, { cls: string; label: string }> = {
          planifiee: { cls: 'badge primary', label: 'Planifiée' },
          en_cours: { cls: 'badge warning', label: 'En cours' },
          realisee: { cls: 'badge success', label: 'Réalisée' },
          annulee: { cls: 'badge neutral', label: 'Annulée' },
          en_retard: { cls: 'badge danger', label: 'En retard' },
        }
        const s = statutMap[item.statut] || { cls: 'badge outline', label: item.statut }
        return <span className={`badge text-xs ${s.cls}`}>{s.label}</span>
      },
    },
    {
      key: 'priorite',
      header: 'Priorité',
      render: (item) => {
        const pBadge: Record<string, string> = { critique: 'badge danger', haute: 'badge warning', moyenne: 'badge teal', basse: 'badge success' }
        const pLabel: Record<string, string> = { critique: 'Critique', haute: 'Élevée', moyenne: 'Moyen', basse: 'Faible' }
        return item.priorite ? <span className={`badge text-xs ${pBadge[item.priorite] || 'badge neutral'}`}>{pLabel[item.priorite] || item.priorite}</span> : null
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (item) => {
        const isChefEquipe = !!user?.id && !!item.chef_id && item.chef_id === user.id;
        const isMembreEquipe = !!user?.id && !!item.chef_id && (item.equipe_ids || []).includes(user.id);
        const equipeDesignee = !!item.chef_id && (item.equipe_ids?.length ?? 0) > 0;
        const canExecute = isChefEquipe;
        const canPrepare = isChefEquipe || isMembreEquipe || (isManager && !equipeDesignee);
        const canManageTable = isManager && !equipeDesignee;
        return (
          <div className="flex justify-end gap-2">
            {canPrepare && !item.est_proposition && (
              <button className="action-button" onClick={(e) => { e.stopPropagation(); onPrepare(item); }} title="Préparer">
                <PlayCircle className="w-4 h-4" />
              </button>
            )}
            {canExecute && !item.est_proposition && (
              <button className="action-button" onClick={(e) => { e.stopPropagation(); onExecute(item); }} title="Exécuter">
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            <button className="action-button" onClick={(e) => { e.stopPropagation(); onViewDetails(item); }} title="Voir détails">
              <Info className="w-4 h-4" />
            </button>
            {canManageTable && (
            <button className="action-button" onClick={(e) => { e.stopPropagation(); onEdit(item); }} title="Modifier">
              <Edit2 className="w-4 h-4" />
            </button>
            )}
            {canManageTable && (
            <button className="action-button danger" onClick={(e) => { e.stopPropagation(); onDelete(item); }} title="Supprimer">
              <Trash2 className="w-4 h-4" />
            </button>
            )}
          </div>
        )
      },
    },
  ]
}
