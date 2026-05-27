// components/modules/planning/WorkloadView.tsx
// VERSION CORRIGÉE AVEC DONNÉES RÉELLES ET IA
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Users, Calendar, BarChart3, ChevronDown, ChevronRight, X, Brain, Loader2, Sparkles } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAppStore } from '@/lib/store';

interface WorkloadViewProps {
  userRole: string;
}

interface LigneCharge {
  inspecteurId: string;
  nom: string;
  prenom: string;
  missions: number;
  joursTerrain: number;
  tauxOccupation: number;
  enAlerte: boolean;
  competences: string[];
}

const MOIS_OPTIONS = [
  { value: '2025-11', label: 'Novembre 2025' },
  { value: '2025-12', label: 'Décembre 2025' },
  { value: '2026-01', label: 'Janvier 2026' },
  { value: '2026-02', label: 'Février 2026' },
  { value: '2026-03', label: 'Mars 2026' },
  { value: '2026-04', label: 'Avril 2026' },
];

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

export function WorkloadView({ userRole }: WorkloadViewProps) {
  const plannings = useAppStore(s => s.plannings);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const user = useAppStore(s => s.user);

  const moisCourant = new Date().toISOString().slice(0, 7);
  const [moisSelectionne, setMoisSelectionne] = useState(moisCourant);
  const [aerodromeFiltre, setAerodromeFiltre] = useState('Tous');

  // Récupérer les vrais inspecteurs depuis le store
  const inspecteursReels = useMemo(() => {
    return utilisateurs.filter(u => u.role === 'inspector' && u.statut !== 'inactif');
  }, [utilisateurs]);

  // Récupérer les plannings du mois sélectionné
  const planningsFiltres = useMemo(() => {
    return plannings.filter((p) => {
      const dansLeMois = p.date_debut.startsWith(moisSelectionne);
      const dansAerodrome =
        aerodromeFiltre === 'Tous'
          ? true
          : aerodromes.find((a) => a.id === p.aerodrome_id)?.code_oaci === aerodromeFiltre;
      return dansLeMois && dansAerodrome;
    });
  }, [plannings, moisSelectionne, aerodromeFiltre, aerodromes]);

  // Calculer la charge de travail réelle
  const lignesCharge = useMemo<LigneCharge[]>(() => {
    if (inspecteursReels.length === 0) return [];

    return inspecteursReels.map((insp) => {
      const missionsInsp = planningsFiltres.filter(
        (p) => p.chef_id === insp.id || (p.equipe_ids ?? []).includes(insp.id)
      );

      let totalJours = 0;
      missionsInsp.forEach(p => {
        const debut = new Date(p.date_debut);
        const fin = new Date(p.date_fin);
        const jours = Math.ceil((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24));
        totalJours += Math.max(1, jours);
      });

      const missions = missionsInsp.length;
      const joursTerrain = totalJours;
      const joursOuverts = 22;
      const tauxOccupation = joursOuverts > 0 ? Math.min(100, Math.round((joursTerrain / joursOuverts) * 100)) : 0;
      const enAlerte = joursTerrain > 20;

      const competences = insp.competences?.map((c: any) => c.domaine) || [];

      return {
        inspecteurId: insp.id,
        nom: insp.nom,
        prenom: insp.prenom,
        missions,
        joursTerrain,
        tauxOccupation,
        enAlerte,
        competences,
      };
    });
  }, [inspecteursReels, planningsFiltres]);

  const inspecteursSurcharges = lignesCharge.filter((l) => l.enAlerte);
  const inspecteursDisponibles = lignesCharge.filter((l) => !l.enAlerte && l.tauxOccupation < 50);

  const dataChart = lignesCharge.map((l) => ({
    nom: l.prenom?.substring(0, 1) + '. ' + l.nom,
    missions: l.missions,
    jours: l.joursTerrain,
    alerte: l.enAlerte,
  }));

  const getStatusBadge = (enAlerte: boolean, tauxOccupation: number) => {
    if (enAlerte) return <span className="badge danger text-xs animate-pulse">Surcharge</span>;
    if (tauxOccupation >= 70) return <span className="badge warning text-xs">Chargé</span>;
    if (tauxOccupation >= 40) return <span className="badge primary text-xs">Modéré</span>;
    return <span className="badge success text-xs">Disponible</span>;
  };

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-role-primary" />
          <h2 className="heading-4 text-role-primary">Charge de travail des inspecteurs</h2>
          <span className="badge neutral">{moisSelectionne}</span>
        </div>

        <div className="flex gap-3">
          <select
            value={moisSelectionne}
            onChange={(e) => setMoisSelectionne(e.target.value)}
            className={`form-select w-44 h-9 text-sm ${focusClass}`}
            style={selectStyle}
          >
            {MOIS_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
            <option value={moisCourant}>Mois courant</option>
          </select>

          <select
            value={aerodromeFiltre}
            onChange={(e) => setAerodromeFiltre(e.target.value)}
            className={`form-select w-36 h-9 text-sm ${focusClass}`}
            style={selectStyle}
          >
            <option value="Tous">Tous les aérodromes</option>
            {aerodromes.map((a) => (
              <option key={a.id} value={a.code_oaci}>{a.code_oaci}</option>
            ))}
          </select>
        </div>
      </div>

      {inspecteursSurcharges.length > 0 && (
        <div className="alert alert-error">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">⚠️ {inspecteursSurcharges.length} inspecteur(s) en surcharge</div>
            <div className="alert-description">
              {inspecteursSurcharges.map((i) => `${i.prenom} ${i.nom}`).join(', ')}. 
              Plus de 20 jours terrain planifiés ce mois. Envisagez de redistribuer les missions.
            </div>
          </div>
        </div>
      )}

      {inspecteursDisponibles.length > 0 && !inspecteursSurcharges.length && (
        <div className="alert alert-success">
          <Users className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">✅ {inspecteursDisponibles.length} inspecteur(s) disponible(s)</div>
            <div className="alert-description">
              {inspecteursDisponibles.slice(0, 3).map((i) => `${i.prenom} ${i.nom}`).join(', ')}
              {inspecteursDisponibles.length > 3 && ` et ${inspecteursDisponibles.length - 3} autre(s)`} ont une charge légère.
            </div>
          </div>
        </div>
      )}

      <div className="card border-border">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-title text-small font-medium">Missions planifiées par inspecteur</div>
        </div>
        <div className="card-content">
          {lignesCharge.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun inspecteur trouvé</p>
              <p className="text-xs">Vérifiez que des inspecteurs sont configurés dans l'application</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, lignesCharge.length * 35)}>
              <BarChart layout="vertical" data={dataChart} margin={{ top: 4, right: 20, left: 80, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nom" tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  formatter={(value, name) => name === 'missions' ? [`${value} missions`, 'Missions'] : [`${value} jours`, 'Jours terrain']}
                  contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
                <Bar dataKey="missions" radius={[0, 4, 4, 0]}>
                  {dataChart.map((entry, index) => (
                    <Cell key={index} fill={entry.alerte ? '#ef4444' : 'var(--role-primary)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card border-border">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-title text-small font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-role-primary" />
            Détail par inspecteur ({lignesCharge.length})
          </div>
        </div>
        <div className="card-content p-0">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="border-b border-border">
                  <th>Inspecteur</th>
                  <th>Compétences</th>
                  <th className="text-right">Missions</th>
                  <th className="text-right">Jours terrain</th>
                  <th className="text-right">Taux occupation</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {lignesCharge.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucune donnée de charge disponible
                    </td>
                  </tr>
                ) : (
                  lignesCharge.map((ligne) => (
                    <tr key={ligne.inspecteurId} className="border-b border-border hover:bg-role-primary-soft">
                      <td className="font-medium text-foreground">
                        {ligne.prenom} {ligne.nom}
                      </td>
                      <td className="text-muted-foreground text-xs">
                        <div className="flex flex-wrap gap-1">
                          {ligne.competences.slice(0, 2).map((c, i) => (
                            <span key={i} className="badge outline text-[9px]">{c}</span>
                          ))}
                          {ligne.competences.length > 2 && (
                            <span className="text-[9px] text-muted-foreground">+{ligne.competences.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right text-foreground">{ligne.missions}</td>
                      <td className="text-right text-foreground">{ligne.joursTerrain} j</td>
                      <td className="text-right text-foreground">{ligne.tauxOccupation}%</td>
                      <td>{getStatusBadge(ligne.enAlerte, ligne.tauxOccupation)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Surcharge (&gt;20 jours)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <span>Chargé (70-100%)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Modéré (40-70%)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Disponible (&lt;40%)</span>
        </div>
      </div>
    </div>
  );
}

export default WorkloadView;
