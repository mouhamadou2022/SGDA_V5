// components/modules/surveillance/EquipeNoms.tsx
// Affichage partagé de l'équipe d'une surveillance : noms complets (jamais
// des bouts d'UUID), chef en avant, utilisateur qui évalue mis en avant.
// Utilisé par toutes les checklists (standard, SGS, PAC, suivi, maintien).
'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import { getSurveillanceEquipeIds } from '@/lib/surveillanceTeam';

export function EquipeNoms({
  equipeIds,
  chefId,
  surveillanceId,
}: {
  equipeIds?: readonly string[];
  chefId?: string;
  /** Alternative : résout équipe + chef depuis la surveillance (SGS, rapports). */
  surveillanceId?: string;
}) {
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const user = useAppStore(s => s.user);
  const surveillances = useAppStore(s => s.surveillances);
  const plannings = useAppStore(s => s.plannings);
  const surveillance = surveillanceId
    ? surveillances.find(s => s.id === surveillanceId)
    : undefined;
  const ids = equipeIds ?? (surveillance ? getSurveillanceEquipeIds(surveillance, plannings) : []);
  const chef = chefId ?? surveillance?.chef_id;
  const nomDe = (id: string): string => {
    const u = (utilisateurs || []).find(x => x.id === id);
    const nom = `${u?.prenom || ''} ${u?.nom || ''}`.trim();
    return nom || `ID ${id.slice(0, 8)}`;
  };
  const ordonnes = [...new Set(ids || [])].sort((a, b) =>
    (a === chef ? -1 : b === chef ? 1 : 0) ||
    (a === user?.id ? -1 : b === user?.id ? 1 : 0));
  if (ordonnes.length === 0) {
    return <span className="text-[11px] text-muted-foreground">Équipe non désignée</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {ordonnes.map(id => (
        <span key={id} title={nomDe(id)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
            id === user?.id
              ? 'bg-role-primary text-white border-role-primary'
              : 'bg-muted/40 text-foreground border-border'
          }`}>
          {nomDe(id)}
          {id === chef && (
            <span className="text-[9px] font-bold uppercase">Chef</span>
          )}
          {id === user?.id && (
            <span className="text-[9px] font-bold uppercase">Vous</span>
          )}
        </span>
      ))}
    </span>
  );
}
