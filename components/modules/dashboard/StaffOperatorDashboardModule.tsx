// components/modules/dashboard/StaffOperatorDashboardModule.tsx
'use client';

import React, { useMemo } from 'react';
import {
  LayoutDashboard,
  AlertCircle,
  Eye,
  Shield,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';

interface StaffOperatorDashboardModuleProps {
  user?: { role?: string; aerodrome_id?: string };
  userRole?: string;
}

export default function StaffOperatorDashboardModule({ user: userProp, userRole: userRoleProp }: StaffOperatorDashboardModuleProps) {
  const user = useAppStore(s => s.user);
  const userRole = userRoleProp ?? userProp?.role ?? user?.role ?? ''
  const aerodromes = useAppStore(s => s.aerodromes);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  // Récupérer l'aérodrome associé à l'utilisateur
  const aerodrome = useMemo(() => {
    if (!user?.aerodrome_id) return null;
    return aerodromes.find(a => a.id === user.aerodrome_id);
  }, [user, aerodromes]);

  const profil = useMemo(() => {
    if (!aerodrome) return null;
    return profilsRisque[aerodrome.id];
  }, [aerodrome, profilsRisque]);

  if (!aerodrome) {
    return (
      <div className="card">
        <div className="card-content py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted mx-auto mb-4" />
          <p className="text-body text-muted-foreground">Aucun aérodrome associé à votre compte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-role={userRole} data-module="staff-operator-dashboard">

      {/* En-tête */}
      <ModuleHeader
        icon={<LayoutDashboard className="h-8 w-8 text-white" />}
        title={`Bienvenue, ${user?.prenom || 'Staff'}`}
        description={`Portail Exploitant — ${aerodrome.nom} (${aerodrome.code_oaci})`}
        actions={<span className="badge warning">STAFF</span>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-success/20">
            <Shield className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Score risque</div>
          <div className="kpi-value">{profil?.score_global || 0}%</div>
          <div className="flex items-center gap-1 mt-2">
            {profil?.tendance === 'hausse' && <TrendingUp className="h-3 w-3 text-success" />}
            {profil?.tendance === 'baisse' && <TrendingDown className="h-3 w-3 text-danger" />}
            <span className="text-xs text-muted-foreground capitalize">{profil?.tendance || 'stable'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-primary/20">
            <Eye className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Surveillances</div>
          <div className="kpi-value">
            {surveillances.filter(s => s.aerodrome_id === aerodrome.id).length}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-warning/20">
            <AlertCircle className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">Écarts ouverts</div>
          <div className="kpi-value">
            {ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut !== 'cloture').length}
          </div>
        </div>
      </div>

      {/* Prochaines surveillances */}
      <div className="card border-l-4 border-l-role-primary">
        <div className="card-header">
          <h3 className="card-title text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-role-primary" />
            Prochaines surveillances
          </h3>
        </div>
        <div className="card-content">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Équipe</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {surveillances
                  .filter(s => s.aerodrome_id === aerodrome.id && s.statut === 'planifiee')
                  .slice(0, 5)
                  .map(s => (
                    <tr key={s.id}>
                      <td>{new Date(s.date_debut).toLocaleDateString('fr-FR')}</td>
                      <td>{s.type}</td>
                      <td>{s.equipe_ids.length} inspecteur(s)</td>
                      <td>
                        <span className="badge primary">Planifiée</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Derniers rapports */}
      <div className="card border-l-4 border-l-role-primary">
        <div className="card-header">
          <h3 className="card-title text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-role-primary" />
            Derniers rapports
          </h3>
        </div>
        <div className="card-content">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {surveillances
                  .filter(s => s.aerodrome_id === aerodrome.id && s.statut === 'transmise')
                  .slice(0, 5)
                  .map(s => (
                    <tr key={s.id}>
                      <td>{new Date(s.date_debut).toLocaleDateString('fr-FR')}</td>
                      <td>{s.type}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="progress w-16 h-2">
                            <div className="progress-bar" style={{ width: `${s.score_global || 0}%` }} />
                          </div>
                          <span className="text-small">{s.score_global || 0}%</span>
                        </div>
                      </td>
                      <td>
                        <button className="action-button" onClick={() => setActiveModule('operator-documentations')}>
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
