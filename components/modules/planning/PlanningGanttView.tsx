// components/modules/planning/PlanningGanttView.tsx
'use client';

import React from 'react';
import { Planning, Aerodrome } from '@/lib/store';
import { Users, AlertCircle, Clock } from 'lucide-react';

interface GanttViewProps {
  plannings: Planning[];
  aerodromes: Aerodrome[];
  selectedYear: number;
  userRole?: string;
}

interface InspecteurCharge {
  id: string;
  nom: string;
  prenom?: string;
  plannings: Planning[];
  charge: number;
  chargeMax: number;
  priorites: {
    basse: number;
    moyenne: number;
    haute: number;
    critique: number;
  };
  alerteCharge?: boolean;
}

export default function PlanningGanttView({ plannings, aerodromes, selectedYear, userRole = 'inspector' }: GanttViewProps) {
  // Calculer les mois de l'année
  const months = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(selectedYear, i, 1);
      return {
        index: i,
        name: date.toLocaleDateString('fr-FR', { month: 'short' }),
        days: new Date(selectedYear, i + 1, 0).getDate(),
      };
    });
  }, [selectedYear]);

  // Grouper par inspecteur
  const planningsByInspector = React.useMemo(() => {
    const inspectorMap = new Map<string, InspecteurCharge>();
    
    const joursOuvresParMois = 22;
    const chargeMaxAnnuelle = joursOuvresParMois * 12;

    plannings.forEach(planning => {
      if (planning.est_proposition) return;
      
      planning.equipe_ids.forEach((inspId: string) => {
        if (!inspectorMap.has(inspId)) {
          inspectorMap.set(inspId, {
            id: inspId,
            nom: `Inspecteur ${inspId.slice(-4)}`,
            plannings: [],
            charge: 0,
            chargeMax: chargeMaxAnnuelle,
            priorites: { basse: 0, moyenne: 0, haute: 0, critique: 0 },
          });
        }
        
        const insp = inspectorMap.get(inspId)!;
        insp.plannings.push(planning);
        
        const start = new Date(planning.date_debut);
        const end = new Date(planning.date_fin);
        const duree = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
        
        insp.charge += duree;
        insp.priorites[planning.priorite as keyof typeof insp.priorites]++;
      });
    });

    inspectorMap.forEach((insp) => {
      const tauxCharge = (insp.charge / insp.chargeMax) * 100;
      insp.alerteCharge = tauxCharge > 80;
    });

    return Array.from(inspectorMap.values())
      .sort((a, b) => b.charge - a.charge);
  }, [plannings]);

  // Calculer la position d'un planning dans la timeline
  const getPlanningPosition = (planning: Planning) => {
    const start = new Date(planning.date_debut);
    const end = new Date(planning.date_fin);
    
    const startOfYear = new Date(selectedYear, 0, 1);
    const endOfYear = new Date(selectedYear, 11, 31);
    
    const effectiveStart = start < startOfYear ? startOfYear : start;
    const effectiveEnd = end > endOfYear ? endOfYear : end;
    
    const startOffset = Math.max(0, Math.floor((effectiveStart.getTime() - startOfYear.getTime()) / (1000 * 3600 * 24)));
    const duration = Math.min(365, Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 3600 * 24)) + 1);

    const totalDays = 365;
    
    return {
      left: `${(startOffset / totalDays) * 100}%`,
      width: `${(duration / totalDays) * 100}%`,
    };
  };

  // Classe CSS selon priorité
  const getPriorityClass = (priorite: string) => {
    const classes: Record<string, string> = {
      basse: 'bg-gray-200 border-gray-300 hover:bg-gray-300',
      moyenne: 'bg-role-primary-soft border-role-primary-light hover:bg-role-primary-soft',
      haute: 'bg-amber-200 border-amber-300 hover:bg-amber-300',
      critique: 'bg-gradient-to-r from-danger to-danger/70 border-danger animate-pulse hover:opacity-90',
    };
    return classes[priorite] || 'bg-gray-200';
  };

  // Icône selon statut
  const getStatusIcon = (statut: string) => {
    switch (statut) {
      case 'en_retard':
        return <AlertCircle className="h-3 w-3 text-danger flex-shrink-0" />;
      case 'en_cours':
        return <Clock className="h-3 w-3 text-warning flex-shrink-0" />;
      default:
        return null;
    }
  };

  const getBadgeClass = (priorite: string) => {
    switch (priorite) {
      case 'critique': return 'badge danger';
      case 'haute': return 'badge warning';
      case 'moyenne': return 'badge primary';
      default: return 'badge neutral';
    }
  };

  return (
    <div className="card border-border shadow-md" data-role={userRole}>
      <div className="card-content p-6">
        {/* En-tête avec mois */}
        <div className="flex border-b border-border pb-2 mb-4 sticky top-0 bg-background z-10">
          <div className="w-56 flex-shrink-0 font-medium text-small text-foreground">Inspecteur</div>
          <div className="flex-1 grid grid-cols-12 gap-0">
            {months.map((month) => (
              <div key={month.index} className="text-center text-xs font-medium text-muted-foreground">
                {month.name}
              </div>
            ))}
          </div>
          <div className="w-24 flex-shrink-0 text-right text-xs font-medium text-foreground">Charge</div>
        </div>

        {/* Lignes par inspecteur */}
        <div className="space-y-6">
          {planningsByInspector.map((inspector) => (
            <div key={inspector.id} className="relative group">
              <div className="flex items-start">
                {/* Colonne inspecteur */}
                <div className="w-56 flex-shrink-0 pr-3">
                  <div className="flex items-center gap-2">
                    <Users className={`h-4 w-4 ${inspector.alerteCharge ? 'text-danger' : 'text-role-primary'}`} />
                    <span className="font-medium text-small text-foreground">{inspector.nom}</span>
                    {inspector.alerteCharge && (
                      <span className="badge danger text-[8px] h-4 px-1 animate-pulse">Surcharge</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {inspector.priorites.critique > 0 && (
                      <span className="badge danger text-[10px] h-4">{inspector.priorites.critique} critique</span>
                    )}
                    {inspector.priorites.haute > 0 && (
                      <span className="badge warning text-[10px] h-4">{inspector.priorites.haute} haute</span>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex-1 relative h-20">
                  {/* Grille des mois */}
                  <div className="absolute inset-0">
                    {months.map((month, i) => (
                      <div
                        key={month.index}
                        className="absolute top-0 bottom-0 border-l border-border"
                        style={{ left: `${(i * 100) / 12}%`, width: '1px' }}
                      />
                    ))}
                  </div>

                  {/* Plannings */}
                  {inspector.plannings.map((planning) => {
                    const position = getPlanningPosition(planning);
                    const aerodrome = aerodromes.find(a => a.id === planning.aerodrome_id);
                    
                    return (
                      <div
                        key={planning.id}
                        className={`absolute h-10 rounded-md border ${getPriorityClass(planning.priorite)} hover:shadow-role-glow transition-all duration-200 cursor-pointer group/planning`}
                        style={{ left: position.left, width: position.width, top: '5px' }}
                      >
                        <div className="p-1 text-xs truncate flex items-center gap-1 h-full">
                          {getStatusIcon(planning.statut)}
                          <span className="font-mono font-bold text-role-primary">{aerodrome?.code_oaci}</span>
                          <span className="truncate hidden group-hover/planning:inline text-foreground">
                            {planning.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                        </div>
                        
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-0 mb-1 hidden group-hover/planning:block z-20">
                          <div className="bg-gray-900 text-white text-xs rounded-lg p-2 whitespace-nowrap shadow-lg">
                            <div className="font-bold">{aerodrome?.nom} ({aerodrome?.code_oaci})</div>
                            <div>{planning.type} - Priorité {planning.priorite}</div>
                            <div className="text-gray-300">
                              {new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}
                            </div>
                            <div className="text-gray-300">Équipe: {planning.equipe_ids.length} inspecteur(s)</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Colonne charge */}
                <div className="w-24 flex-shrink-0 pl-3">
                  <div className="flex items-center gap-1">
                    <div className={`progress h-2 flex-1 ${inspector.alerteCharge ? 'progress-critique' : ''}`}>
                      <div className="progress-bar" style={{ width: `${(inspector.charge / inspector.chargeMax) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium w-8">{Math.round(inspector.charge)}j</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 text-right">
                    {inspector.plannings.length} mission(s)
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Message si aucun inspecteur */}
          {planningsByInspector.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-body">Aucun planning pour l'année {selectedYear}</p>
            </div>
          )}
        </div>

        {/* Légende */}
        <div className="mt-8 pt-4 border-t border-border flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-200 rounded border border-gray-300" />
            <span className="text-small">Priorité basse</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-role-primary-soft rounded border border-role-primary-light" />
            <span className="text-small">Priorité moyenne</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-200 rounded border border-amber-300" />
            <span className="text-small">Priorité haute</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gradient-to-r from-danger to-danger/70 rounded border-danger animate-pulse" />
            <span className="text-small">Priorité critique</span>
          </div>
          <div className="flex items-center gap-1 ml-4">
            <AlertCircle className="h-3 w-3 text-danger" />
            <span className="text-small">En retard</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-warning" />
            <span className="text-small">En cours</span>
          </div>
        </div>
      </div>
    </div>
  );
}