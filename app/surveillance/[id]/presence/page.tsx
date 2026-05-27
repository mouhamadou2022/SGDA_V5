'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { PresenceSheet } from '@/components/modules/surveillance/PresenceSheet';
import {
  ArrowLeft, Users, Calendar, Shield, User,
} from 'lucide-react';

export default function PresencePage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const user = useAppStore(s => s.user);

  // Nécessaire pour les variables CSS --role-gradient, --role-primary, etc.
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);

  const chefNom = surveillance?.chef_id ? (() => {
    const chef = utilisateurs.find(u => u.id === surveillance.chef_id);
    return `${chef?.prenom || ''} ${chef?.nom || ''}`.trim() || surveillance.chef_id;
  })() : 'Non assigné';

  const equipeNoms = (surveillance?.equipe_ids || []).map(id => {
    const u = utilisateurs.find(u => u.id === id);
    return `${u?.prenom || ''} ${u?.nom || ''}`.trim() || id;
  });

  const statutLabels: Record<string, string> = {
    planifiee: 'Planifiée', en_cours: 'En cours', checklist_signee: 'Checklist signée',
    ecarts_signes: 'Écarts signés', rapport_signe: 'Rapport signé',
    lettre_signee: 'Lettre signée', transmise: 'Transmise', archivee: 'Archivée',
  };
  const statutBadges: Record<string, string> = {
    planifiee: 'badge neutral', en_cours: 'badge warning', checklist_signee: 'badge primary',
    ecarts_signes: 'badge primary', rapport_signe: 'badge success',
    lettre_signee: 'badge success', transmise: 'badge success', archivee: 'badge neutral',
  };

  if (!surveillance) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Surveillance non trouvée</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-role={user?.role}>
      {/* Header sticky — toutes les infos surveillance */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-start gap-3">
            <button onClick={() => router.push(`/surveillance/${surveillanceId}`)} className="btn btn-ghost p-2 shrink-0 mt-0.5">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center shadow-sm shrink-0">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-foreground leading-tight">
                  <span className="text-role-primary">{aerodrome?.code_oaci}</span>&nbsp;— {aerodrome?.nom}
                </h1>
                <span className={statutBadges[surveillance.statut] || 'badge neutral'}>
                  {statutLabels[surveillance.statut] || surveillance.statut}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                <span className="capitalize">{surveillance.type.replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}{surveillance.date_fin && ` → ${new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}`}</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3" />{chefNom}</span>
                {(surveillance.portee?.length || 0) > 0 && (
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{surveillance.portee?.join(', ')}</span>
                )}
              </div>
              {equipeNoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {equipeNoms.map((nom, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">{nom}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenu pleine largeur */}
      <div className="w-full px-2 py-4">
        <PresenceSheet surveillanceId={surveillanceId} userRole={user?.role || 'inspector'} />
      </div>
    </div>
  );
}
