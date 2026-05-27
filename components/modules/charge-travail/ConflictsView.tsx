// components/modules/charge-travail/ConflictsView.tsx
// ✅ Gestion des conflits de planning (chevauchements)
// ✅ Design system premium - classes harmonisées
// ✅ Animations et badges par niveau de priorité

'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/lib/store';
import {
  AlertTriangle, Calendar, User, Clock, CheckCircle2, ArrowRight, Users, AlertCircle, X,
} from 'lucide-react';

interface Conflit {
  id: string;
  inspecteur: string;
  chef_id: string;
  missionA: { id: string; aerodrome: string; debut: string; fin: string };
  missionB: { id: string; aerodrome: string; debut: string; fin: string };
}

interface ConflictsViewProps {
  userRole: string;
}

function chevauche(d1: string, f1: string, d2: string, f2: string): boolean {
  return new Date(d1) <= new Date(f2) && new Date(d2) <= new Date(f1);
}

export function ConflictsView({ userRole }: ConflictsViewProps) {
  const plannings = useAppStore(s => s.plannings);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const aerodromes = useAppStore(s => s.aerodromes);
  const updatePlanning = useAppStore(s => s.updatePlanning);
  const addNotification = useAppStore(s => s.addNotification);

  // Détection des conflits initiaux
  const conflitsInitiaux = (() => {
    const parChef: Record<string, typeof plannings> = {};
    plannings.forEach(p => {
      if (!parChef[p.chef_id]) parChef[p.chef_id] = [];
      parChef[p.chef_id].push(p);
    });

    const result: Conflit[] = [];
    let idx = 0;

    Object.entries(parChef).forEach(([chef_id, missions]) => {
      const user = utilisateurs?.find(u => u.id === chef_id);
      const nom = user ? `${user.prenom} ${user.nom}` : chef_id;

      for (let i = 0; i < missions.length; i++) {
        for (let j = i + 1; j < missions.length; j++) {
          const a = missions[i];
          const b = missions[j];
          if (chevauche(a.date_debut, a.date_fin, b.date_debut, b.date_fin)) {
            const aeroA = aerodromes?.find(x => x.id === a.aerodrome_id)?.nom ?? a.aerodrome_id;
            const aeroB = aerodromes?.find(x => x.id === b.aerodrome_id)?.nom ?? b.aerodrome_id;
            result.push({
              id: `${a.id}-${b.id}-${idx++}`,
              inspecteur: nom,
              chef_id,
              missionA: { id: a.id, aerodrome: aeroA, debut: a.date_debut, fin: a.date_fin },
              missionB: { id: b.id, aerodrome: aeroB, debut: b.date_debut, fin: b.date_fin },
            });
          }
        }
      }
    });
    return result;
  })();

  const [conflits, setConflits] = useState<Conflit[]>(conflitsInitiaux);
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [option, setOption] = useState<'reaffecter' | 'decaler'>('reaffecter');
  const [resolvedConflitId, setResolvedConflitId] = useState<string | null>(null);

  const ignorer = (id: string) => setConflits(prev => prev.filter(c => c.id !== id));

  const confirmerResolution = () => {
    if (resolutionId) {
      const conflit = conflits.find(c => c.id === resolutionId);
      if (conflit) {
        if (option === 'reaffecter') {
          updatePlanning(conflit.missionB.id, {
            equipe_ids: (plannings.find(p => p.id === conflit.missionB.id)?.equipe_ids || []).filter(id => id !== conflit.chef_id),
          });
        } else {
          const planning = plannings.find(p => p.id === conflit.missionB.id);
          if (planning) {
            const debut = new Date(planning.date_debut);
            const fin = new Date(planning.date_fin);
            debut.setDate(debut.getDate() + 7);
            fin.setDate(fin.getDate() + 7);
            updatePlanning(conflit.missionB.id, {
              date_debut: debut.toISOString(),
              date_fin: fin.toISOString(),
            });
          }
        }
        addNotification({
          user_id: '', type: 'success', title: 'Conflit résolu',
          message: `Conflit résolu pour ${conflit.inspecteur} entre ${conflit.missionA.aerodrome} et ${conflit.missionB.aerodrome}. ${option === 'reaffecter' ? 'Inspecteur réaffecté.' : 'Mission décalée de 7 jours.'}`,
          canal: 'in_app',
        });
      }
      setConflits(prev => prev.filter(c => c.id !== resolutionId));
      setResolvedConflitId(resolutionId);
      setTimeout(() => setResolvedConflitId(null), 3000);
      setResolutionId(null);
      setOption('reaffecter');
    }
  };

  const conflit = conflits.find(c => c.id === resolutionId);

  const getChevauchementJours = (debut1: string, fin1: string, debut2: string, fin2: string): number => {
    const debut = new Date(Math.max(new Date(debut1).getTime(), new Date(debut2).getTime()));
    const fin = new Date(Math.min(new Date(fin1).getTime(), new Date(fin2).getTime()));
    const diff = Math.ceil((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  };

  if (conflits.length === 0) {
    return (
      <div className="card border-success/30 bg-success/5 animate-fade-in">
        <div className="card-content p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-success text-lg">Aucun conflit détecté</h3>
              <p className="text-small text-muted">Tous les plannings sont cohérents.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-role={userRole} data-module="conflicts-view">
      {/* Bandeau d'alerte global */}
      <div className="alert alert-danger animate-fade-up">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-semibold">{conflits.length} conflit(s) de planning détecté(s)</p>
          <p className="text-sm">
            Des inspecteurs sont assignés à plusieurs missions simultanément. Veuillez résoudre ces conflits.
          </p>
        </div>
      </div>

      {/* Résolution récente */}
      {resolvedConflitId && (
        <div className="alert alert-info animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">Conflit résolu</p>
            <p className="text-sm">La solution a été appliquée avec succès.</p>
          </div>
        </div>
      )}

      {/* Liste des conflits */}
      <div className="space-y-3">
        {conflits.map((conflit, idx) => {
          const joursChevauchement = getChevauchementJours(
            conflit.missionA.debut, conflit.missionA.fin,
            conflit.missionB.debut, conflit.missionB.fin
          );

          return (
            <div key={conflit.id} className="card border-l-4 border-l-danger hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="card-content p-4">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  {/* Informations du conflit */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge danger pulse flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Chevauchement
                      </span>
                      <span className="badge outline flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {conflit.inspecteur}
                      </span>
                      <span className="badge outline flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {joursChevauchement} jour(s) en conflit
                      </span>
                    </div>

                    {/* Missions en conflit */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Mission A */}
                      <div className="p-3 rounded-xl bg-muted/20 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">A</span>
                          </div>
                          <span className="font-medium text-foreground text-sm">{conflit.missionA.aerodrome}</span>
                        </div>
                        <div className="space-y-1 text-xs text-muted">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>Du {new Date(conflit.missionA.debut).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>Au {new Date(conflit.missionA.fin).toLocaleDateString('fr-FR')}</span>
                          </div>
                        </div>
                      </div>

                      {/* Flèche */}
                      <div className="hidden md:flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-muted" />
                      </div>

                      {/* Mission B */}
                      <div className="p-3 rounded-xl bg-muted/20 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">B</span>
                          </div>
                          <span className="font-medium text-foreground text-sm">{conflit.missionB.aerodrome}</span>
                        </div>
                        <div className="space-y-1 text-xs text-muted">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>Du {new Date(conflit.missionB.debut).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>Au {new Date(conflit.missionB.fin).toLocaleDateString('fr-FR')}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Barre de visualisation du chevauchement */}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted mb-1">
                        <span>Période de chevauchement</span>
                        <span className="text-danger">{joursChevauchement} jours</span>
                      </div>
                      <div className="progress h-1.5">
                        <div className="progress-bar progress-critique" style={{ width: `${Math.min(100, (joursChevauchement / 30) * 100)}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <button className="btn btn-primary" onClick={() => setResolutionId(conflit.id)}>
                      Résoudre
                    </button>
                    <button className="btn btn-secondary" onClick={() => ignorer(conflit.id)}>
                      Ignorer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de résolution */}
      {resolutionId && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setResolutionId(null)}>
          <div className="modal-content max-w-md" data-role={userRole} onClick={e => e.stopPropagation()}>
            <div className="modal-header border-t-4 border-t-role-primary">
              <h2 className="modal-title flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger" />
                Résoudre le conflit
              </h2>
              <button className="action-button" onClick={() => setResolutionId(null)}><X className="w-4 h-4" /></button>
            </div>

            {conflit && (
              <div className="modal-body space-y-5 py-2">
                <p className="text-muted text-sm">Choisissez une solution pour ce conflit de planning</p>

                {/* Récapitulatif */}
                <div className="p-3 rounded-xl bg-muted/20 border border-border">
                  <p className="text-small font-medium text-foreground mb-2">Conflit concernant</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-role-primary" />
                    <span className="font-semibold text-foreground">{conflit.inspecteur}</span>
                  </div>
                </div>

                {/* Options de résolution */}
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/10 transition-colors">
                    <input
                      type="radio"
                      name="resolution"
                      value="reaffecter"
                      checked={option === 'reaffecter'}
                      onChange={() => setOption('reaffecter')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-foreground text-sm">Réaffecter un autre inspecteur</p>
                      <p className="text-xs text-muted">Remplacer cet inspecteur sur l'une des missions</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/10 transition-colors">
                    <input
                      type="radio"
                      name="resolution"
                      value="decaler"
                      checked={option === 'decaler'}
                      onChange={() => setOption('decaler')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-foreground text-sm">Décaler la date</p>
                      <p className="text-xs text-muted">Reporter l'une des missions à une date ultérieure</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="modal-footer gap-2">
              <button className="btn btn-secondary" onClick={() => setResolutionId(null)}>
                Annuler
              </button>
              <button className="btn btn-primary gap-2" onClick={confirmerResolution}>
                <CheckCircle2 className="w-4 h-4" />
                Confirmer la résolution
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ConflictsView;
