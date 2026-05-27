'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAppStore } from '@/lib/store';
import { Printer, Download, TrendingUp, TrendingDown, Calendar, Users, CheckCircle2, AlertCircle } from 'lucide-react';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

interface RapportMensuelProps {
  userRole: string;
}

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ANNEES = [2023, 2024, 2025, 2026];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover backdrop-blur-sm rounded-lg border border-border shadow-lg p-3">
      <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export function RapportMensuel({ userRole }: RapportMensuelProps) {
  const now = new Date();
  const [mois, setMois] = useState(String(now.getMonth() + 1));
  const [annee, setAnnee] = useState(String(now.getFullYear()));
  const plannings = useAppStore(s => s.plannings);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const aerodromes = useAppStore(s => s.aerodromes);
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);

  const moisNum = parseInt(mois) - 1;
  const anneeNum = parseInt(annee);

  const { donnees, semaines, stats } = useMemo(() => {
    const debutMois = new Date(anneeNum, moisNum, 1);
    const finMois = new Date(anneeNum, moisNum + 1, 0);

    const inspecteurs = utilisateurs?.filter(u => u.role === 'inspector' && u.statut !== 'inactif') || [];

    const joursParSemaine = [0, 0, 0, 0, 0];
    const planifiesParSemaine = [0, 0, 0, 0, 0];

    const donneesCalc = inspecteurs.map(ins => {
      const planningsInsp = plannings.filter(p => {
        const d = new Date(p.date_debut);
        return d >= debutMois && d <= finMois && (p.chef_id === ins.id || (p.equipe_ids ?? []).includes(ins.id));
      });

      const surveillancesInsp = surveillances.filter(s => {
        const d = new Date(s.date_debut);
        return d >= debutMois && d <= finMois && (s.chef_id === ins.id || (s.equipe_ids ?? []).includes(ins.id));
      });

      const ecartsInsp = ecarts.filter(e =>
        e.inspecteur_ref_id === ins.id && new Date(e.created_at) >= debutMois && new Date(e.created_at) <= finMois
      );

      const joursPlanifies = planningsInsp.reduce((acc, p) => {
        const d = new Date(p.date_debut);
        const f = new Date(p.date_fin);
        return acc + Math.max(1, Math.ceil((f.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
      }, 0);

      const joursRealises = surveillancesInsp.filter(s => s.statut === 'transmise' || s.statut === 'archivee')
        .reduce((acc, s) => {
          const d = new Date(s.date_debut);
          const f = new Date(s.date_fin);
          return acc + Math.max(1, Math.ceil((f.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
        }, 0);

      const taux = joursPlanifies > 0 ? Math.round((joursRealises / joursPlanifies) * 100) : 0;

      planningsInsp.forEach(p => {
        const d = new Date(p.date_debut);
        const semaineIdx = Math.min(4, Math.floor((d.getDate() - 1) / 7));
        planifiesParSemaine[semaineIdx]++;
        const s = surveillances.find(sv => sv.planning_id === p.id && (sv.statut === 'transmise' || sv.statut === 'archivee'));
        if (s) joursParSemaine[semaineIdx]++;
      });

      return {
        inspecteur: `${ins.prenom} ${ins.nom}`,
        planifies: joursPlanifies,
        realises: joursRealises,
        taux,
        missions: planningsInsp.length,
        ecarts: ecartsInsp.length,
      };
    });

    const semainesCalc = [1, 2, 3, 4].map(s => ({
      semaine: `S${s}`,
      planifiees: planifiesParSemaine[s - 1],
      realisees: joursParSemaine[s - 1],
    }));

    const totalPlanifiees = donneesCalc.reduce((a, d) => a + d.planifies, 0);
    const totalRealisees = donneesCalc.reduce((a, d) => a + d.realises, 0);

    const statsCalc = {
      totalPlanifiees,
      totalRealisees,
      tauxGlobal: totalPlanifiees > 0 ? Math.round((totalRealisees / totalPlanifiees) * 100) : 0,
      totalMissions: donneesCalc.reduce((a, d) => a + d.missions, 0),
      totalEcarts: donneesCalc.reduce((a, d) => a + d.ecarts, 0),
      meilleurTaux: Math.max(...donneesCalc.map(d => d.taux), 0),
      moinsBonTaux: Math.min(...donneesCalc.map(d => d.taux > 0 ? d.taux : Infinity), 100),
    };

    return { donnees: donneesCalc, semaines: semainesCalc, stats: statsCalc };
  }, [plannings, utilisateurs, aerodromes, surveillances, ecarts, anneeNum, moisNum]);

  const handlePrint = () => window.print();
  const handleExportCSV = () => {
    const headers = ['Inspecteur', 'Planifiés (j)', 'Réalisés (j)', 'Taux', 'Missions', 'Écarts traités'];
    const rows = donnees.map(d => [d.inspecteur, d.planifies, d.realises, `${d.taux}%`, d.missions, d.ecarts]);
    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_mensuel_${MOIS[moisNum]}_${anneeNum}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-role={userRole} data-module="rapport-mensuel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="heading-3 text-role-primary">Rapport mensuel</h3>
          <p className="text-small text-muted">Analyse de la charge de travail par inspecteur</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="action-button gap-2"><Printer className="w-4 h-4" />Imprimer</button>
          <button onClick={handleExportCSV} className="action-button gap-2"><Download className="w-4 h-4" />Exporter CSV</button>
        </div>
      </div>

      <div className="filters-panel">
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="form-field">
              <label className="filter-label">Mois</label>
              <select className={`form-select ${focusClass} w-36`} style={selectStyle} value={mois} onChange={e => setMois(e.target.value)}>
                {MOIS.map((m, i) => (<option key={i + 1} value={String(i + 1)}>{m}</option>))}
              </select>
            </div>
            <div className="form-field">
              <label className="filter-label">Année</label>
              <select className={`form-select ${focusClass} w-28`} style={selectStyle} value={annee} onChange={e => setAnnee(e.target.value)}>
                {ANNEES.map(a => (<option key={a} value={String(a)}>{a}</option>))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="kpi-icon"><Calendar className="h-5 w-5" /></div>
          <div className="kpi-label">Jours planifiés</div>
          <div className="kpi-value">{stats.totalPlanifiees}</div>
        </div>
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-icon"><CheckCircle2 className="h-5 w-5" /></div>
          <div className="kpi-label">Jours réalisés</div>
          <div className="kpi-value">{stats.totalRealisees}</div>
        </div>
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="kpi-icon"><TrendingUp className="h-5 w-5" /></div>
          <div className="kpi-label">Taux réalisation</div>
          <div className={`kpi-value ${stats.tauxGlobal >= 80 ? 'text-success' : stats.tauxGlobal >= 60 ? 'text-warning' : 'text-danger'}`}>{stats.tauxGlobal}%</div>
          <div className="progress h-1.5 mt-2">
            <div className={`progress-bar ${stats.tauxGlobal >= 80 ? 'progress-moyen' : stats.tauxGlobal >= 60 ? 'progress-eleve' : 'progress-critique'}`} style={{ width: `${stats.tauxGlobal}%` }} />
          </div>
        </div>
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-icon"><Users className="h-5 w-5" /></div>
          <div className="kpi-label">Missions</div>
          <div className="kpi-value">{stats.totalMissions}</div>
        </div>
      </div>

      <hr className="border-border" />

      <div className="table-container animate-fade-up" style={{ animationDelay: '0.25s' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Inspecteur</th>
              <th className="text-center">Planifiés (j)</th>
              <th className="text-center">Réalisés (j)</th>
              <th className="text-center">Taux</th>
              <th className="text-center">Missions</th>
              <th className="text-center">Écarts traités</th>
            </tr>
          </thead>
          <tbody>
            {donnees.map((row, i) => (
              <tr key={i} className="hover:bg-role-primary-soft transition-colors">
                <td className="font-medium text-foreground">{row.inspecteur}</td>
                <td className="text-center text-foreground">{row.planifies}</td>
                <td className="text-center text-foreground">{row.realises}</td>
                <td className="text-center">
                  <span className={`badge ${row.taux >= 80 ? 'success' : row.taux >= 60 ? 'warning' : 'danger'}`}>{row.taux}%</span>
                </td>
                <td className="text-center text-foreground">{row.missions}</td>
                <td className="text-center text-foreground">{row.ecarts}</td>
              </tr>
            ))}
            {donnees.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Aucune donnée pour cette période</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="card animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="card-header">
            <h3 className="card-title flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-role-primary" />
              Missions par semaine — {MOIS[moisNum]} {anneeNum}
            </h3>
          </div>
          <div className="card-content">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={semaines} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="semaine" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }} formatter={(value) => <span className="text-muted-foreground">{value}</span>} />
                <Bar dataKey="planifiees" name="Planifiées" fill="var(--role-primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="realisees" name="Réalisées" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-role-primary" />
            Synthèse des performances
          </h3>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-success/5 border border-success/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <span className="text-small font-semibold text-success">Meilleur taux</span>
              </div>
              <p className="text-2xl font-bold text-success">{stats.meilleurTaux}%</p>
              <p className="text-xs text-muted">Taux de réalisation maximum</p>
            </div>
            <div className="p-3 rounded-xl bg-danger/5 border border-danger/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-danger" />
                <span className="text-small font-semibold text-danger">Point d'attention</span>
              </div>
              <p className="text-2xl font-bold text-danger">{stats.moinsBonTaux === Infinity ? 0 : stats.moinsBonTaux}%</p>
              <p className="text-xs text-muted">Taux de réalisation minimum (à surveiller)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RapportMensuel;
