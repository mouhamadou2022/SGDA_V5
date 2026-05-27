// components/modules/charge-travail/WorkloadGauge.tsx
// ✅ Jauge de charge de travail (demi-cercle SVG)
// ✅ Design system premium - classes harmonisées
// ✅ Couleurs dynamiques selon le niveau de charge
// ✅ Tooltips et animations

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { AlertTriangle, CheckCircle2, TrendingUp, Clock, Calendar, Users } from 'lucide-react';

interface WorkloadGaugeProps {
  inspecteurId: string;
  mois?: string;
}

function getColor(pct: number): string {
  if (pct > 80) return '#ef4444';  // danger
  if (pct > 50) return '#f97316';  // warning
  return '#22c55e';                 // success
}

function getLabel(pct: number): string {
  if (pct > 80) return 'Surcharge';
  if (pct > 50) return 'Charge élevée';
  return 'Charge normale';
}

function getStatusBadge(pct: number): { label: string; variant: string; className: string } {
  if (pct > 80) return { label: 'Critique', variant: 'danger', className: 'badge danger pulse' };
  if (pct > 50) return { label: 'Élevée', variant: 'warning', className: 'badge warning' };
  return { label: 'Normale', variant: 'success', className: 'badge success' };
}

export function WorkloadGauge({ inspecteurId, mois }: WorkloadGaugeProps) {
  const plannings = useAppStore((s) => s.plannings);
  const utilisateurs = useAppStore((s) => s.utilisateurs);
  const aerodromes = useAppStore((s) => s.aerodromes);

  const now = mois ? new Date(mois) : new Date();
  const annee = now.getFullYear();
  const moisNum = now.getMonth();

  const inspecteur = utilisateurs?.find(u => u.id === inspecteurId);
  const inspecteurNom = inspecteur ? `${inspecteur.prenom} ${inspecteur.nom}` : inspecteurId;

  const planningsMois = plannings.filter(p => {
    const debut = new Date(p.date_debut);
    const fin = new Date(p.date_fin);
    const debutMois = new Date(annee, moisNum, 1);
    const finMois = new Date(annee, moisNum + 1, 0);
    const isAssigned = p.equipe_ids?.includes(inspecteurId) || p.chef_id === inspecteurId;
    return isAssigned && debut <= finMois && fin >= debutMois;
  });

  const joursOccupes = planningsMois.reduce((acc, p) => {
    const debut = new Date(p.date_debut);
    const fin = new Date(p.date_fin);
    const diff = Math.ceil((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return acc + diff;
  }, 0);

  const joursOuvrables = 22; // jours ouvrés moyens par mois
  const pct = Math.min(Math.round((joursOccupes / joursOuvrables) * 100), 100);
  const color = getColor(pct);
  const label = getLabel(pct);
  const statusBadge = getStatusBadge(pct);

  // Répartition par type de mission
  const repartitionParType = useMemo(() => {
    const types: Record<string, number> = {};
    planningsMois.forEach(p => {
      types[p.type] = (types[p.type] || 0) + 1;
    });
    return types;
  }, [planningsMois]);

  // Missions par aérodrome
  const missionsParAerodrome = useMemo(() => {
    const aero: Record<string, number> = {};
    planningsMois.forEach(p => {
      const aeroNom = aerodromes?.find(a => a.id === p.aerodrome_id)?.nom || p.aerodrome_id;
      aero[aeroNom] = (aero[aeroNom] || 0) + 1;
    });
    return Object.entries(aero).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [planningsMois, aerodromes]);

  // Rayon = 80, centre = (100, 100)
  const r = 80;
  const cx = 100;
  const cy = 100;
  const startX = cx - r;
  const startY = cy;
  const endX = cx + r;
  const endY = cy;

  const angle = (pct / 100) * Math.PI;
  const arcX = cx + r * Math.cos(Math.PI - angle);
  const arcY = cy - r * Math.sin(angle);

  const bgPath = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;
  const fgPath = pct === 0 ? '' : pct === 100 
    ? `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`
    : `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${arcX} ${arcY}`;

  const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="card animate-fade-in">
      <div className="card-header pb-2">
        <div className="flex items-center justify-between">
          <h3 className="card-title flex items-center gap-2">
            <Users className="h-4 w-4 text-role-primary" />
            Charge de travail
          </h3>
          <span className={statusBadge.className}>
            {statusBadge.label}
          </span>
        </div>
        <p className="text-small text-muted">{inspecteurNom}</p>
      </div>
      <div className="card-content">
        {/* Jauge SVG */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <svg viewBox="0 0 200 110" className="w-full max-w-[200px]">
              {/* Fond gris */}
              <path d={bgPath} fill="none" stroke="var(--border)" strokeWidth="16" strokeLinecap="round" />
              {/* Arc coloré selon le niveau de charge */}
              {pct > 0 && (
                <path 
                  d={fgPath} 
                  fill="none" 
                  stroke={color} 
                  strokeWidth="16" 
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              )}
              {/* Pourcentage central */}
              <text x="100" y="88" textAnchor="middle" fontSize="28" fontWeight="bold" fill={color}>
                {pct}%
              </text>
              <text x="100" y="105" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                {label}
              </text>
            </svg>
            {/* Animation de pulsation pour surcharge */}
            {pct > 80 && (
              <div className="absolute -inset-2 rounded-full bg-danger/20 animate-ping" style={{ animationDuration: '1.5s' }} />
            )}
          </div>

          {/* Statistiques complémentaires */}
          <div className="w-full space-y-3 mt-2">
            <div className="flex items-center justify-between text-small">
              <span className="text-muted">Jours occupés</span>
              <span className="font-semibold text-foreground">{joursOccupes} / {joursOuvrables}</span>
            </div>
            <div className="progress h-1.5">
              <div 
                className={`progress-bar ${pct > 80 ? 'progress-critique' : pct > 50 ? 'progress-eleve' : 'progress-moyen'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Détails supplémentaires */}
        {planningsMois.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border space-y-3">
            {/* Nombre de missions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs text-muted">Missions planifiées</span>
              </div>
              <span className="badge outline">
                {planningsMois.length}
              </span>
            </div>

            {/* Répartition par type */}
            {Object.keys(repartitionParType).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted">Répartition par type</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(repartitionParType).map(([type, count]) => (
                    <span key={type} className="badge neutral text-[10px]" title={`${count} mission(s) de type ${type}`}>
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top aérodromes */}
            {missionsParAerodrome.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted">Aérodromes principaux</p>
                <div className="space-y-1">
                  {missionsParAerodrome.map(([nom, count]) => (
                    <div key={nom} className="flex items-center justify-between">
                      <span className="text-xs text-foreground truncate max-w-[120px]">{nom}</span>
                      <span className="text-xs text-muted">{count} mission(s)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Message d'alerte pour surcharge */}
        {pct > 80 && (
          <div className="mt-4 p-3 rounded-xl bg-danger/10 border border-danger/20 animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" />
              <p className="text-xs text-danger font-medium">Charge excessive</p>
            </div>
            <p className="text-xs text-muted mt-1">
              Cet inspecteur dépasse la charge recommandée. Envisagez une redistribution des tâches.
            </p>
          </div>
        )}

        {/* Message de bonne charge */}
        {pct <= 50 && pct > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-success/10 border border-success/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <p className="text-xs text-success font-medium">Charge équilibrée</p>
            </div>
            <p className="text-xs text-muted mt-1">
              La charge de travail est bien répartie.
            </p>
          </div>
        )}

        {/* Aucune mission */}
        {planningsMois.length === 0 && (
          <div className="mt-4 p-3 rounded-xl bg-muted/20 border border-border text-center">
            <Clock className="w-5 h-5 text-muted mx-auto mb-1" />
            <p className="text-xs text-muted">Aucune mission planifiée pour cette période</p>
          </div>
        )}

        {/* Mois affiché */}
        <p className="text-center text-[10px] text-muted mt-3">
          {moisLabel} — {joursOccupes}j planifiés / {joursOuvrables}j ouvrés
        </p>
      </div>
    </div>
  );
}

export default WorkloadGauge;