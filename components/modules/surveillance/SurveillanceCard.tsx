'use client';

import React from 'react';
import { Eye, PenSquare, Trash2 } from 'lucide-react';

interface SurveillanceCardProps {
  surveillance: {
    id: string;
    statut: string;
    type: string;
    date_debut: string;
    date_fin: string;
    portee: string[];
    equipe_ids: string[];
    chef_id: string;
    progression?: number;
  };
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  userRole?: string;
}

export default function SurveillanceCard({ surveillance, onView, onEdit, onDelete, userRole = 'inspector' }: SurveillanceCardProps) {
  const statutLabels: Record<string, string> = {
    planifiee: 'Planifiée',
    en_cours: 'Programmée',
    checklist_signee: 'Checklist signée',
    ecarts_signes: 'Écarts signés',
    rapport_signe: 'Rapport signé',
  };

  const canManage = userRole === 'admin' || userRole === 'dg_anacim';

  return (
    <div className={`surveillance-card border-l-${surveillance.statut === 'en_cours' ? 'warning' : 'primary'}`}>
      <span>{statutLabels[surveillance.statut] || surveillance.statut}</span>
      <span>{surveillance.progression}%</span>
      {surveillance.portee?.map((p: string) => <span key={p}>{p}</span>)}
      <div className="flex gap-2 mt-2">
        <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onView} title="Voir" aria-label="Voir">
          <Eye className="w-4 h-4" />
        </button>
        {canManage && onEdit && (
          <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" onClick={onEdit} title="Modifier" aria-label="Modifier">
            <PenSquare className="w-4 h-4" />
          </button>
        )}
        {canManage && onDelete && (
          <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={onDelete} title="Supprimer" aria-label="Supprimer">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
