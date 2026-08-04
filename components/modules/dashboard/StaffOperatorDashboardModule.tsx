// components/modules/dashboard/StaffOperatorDashboardModule.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
import { DataTable, type Column } from '@/components/ui/DataTable';
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

  const surveillancesPlanifiees = useMemo(() => {
    return surveillances.filter(s => s.aerodrome_id === aerodrome.id && s.statut === 'planifiee')
  }, [surveillances, aerodrome])

  const surveillancesTransmises = useMemo(() => {
    return surveillances.filter(s => s.aerodrome_id === aerodrome.id && s.statut === 'transmise')
  }, [surveillances, aerodrome])

  const [currentPage1, setCurrentPage1] = useState(1)
  const [currentPage2, setCurrentPage2] = useState(1)
  const PAGE_SIZE = 20
  const paginatedPlanifiees = useMemo(() => {
    const start = (currentPage1 - 1) * PAGE_SIZE
    return surveillancesPlanifiees.slice(start, start + PAGE_SIZE)
  }, [surveillancesPlanifiees, currentPage1])
  const paginatedTransmises = useMemo(() => {
    const start = (currentPage2 - 1) * PAGE_SIZE
    return surveillancesTransmises.slice(start, start + PAGE_SIZE)
  }, [surveillancesTransmises, currentPage2])
  useEffect(() => setCurrentPage1(1), [surveillancesPlanifiees])
  useEffect(() => setCurrentPage2(1), [surveillancesTransmises])

  const colonnesPlanifiees: Column<any>[] = [
    { key: 'date', header: 'Date', render: (item) => <span>{new Date(item.date_debut).toLocaleDateString('fr-FR')}</span> },
    { key: 'type', header: 'Type', render: (item) => <span>{item.type}</span> },
    { key: 'equipe', header: 'Équipe', render: (item) => <span>{item.equipe_ids.length} inspecteur(s)</span> },
    { key: 'statut', header: 'Statut', render: () => <span className="badge primary">Planifiée</span> },
  ]

  const colonnesRapports: Column<any>[] = [
    { key: 'date', header: 'Date', render: (item) => <span>{new Date(item.date_debut).toLocaleDateString('fr-FR')}</span> },
    { key: 'type', header: 'Type', render: (item) => <span>{item.type}</span> },
    { key: 'score', header: 'Score', render: (item) => (
      <div className="flex items-center gap-2">
        <div className="progress w-16 h-2">
          <div className="progress-bar" style={{ width: `${item.score_global || 0}%` }} />
        </div>
        <span className="text-small">{item.score_global || 0}%</span>
      </div>
    )},
    { key: 'actions', header: '', render: (item) => (
      <button className="action-button" onClick={() => setActiveModule('operator-documentations')}>
        <Eye className="w-4 h-4" />
      </button>
    )},
  ]

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
      <DataTable
        data={paginatedPlanifiees}
        columns={colonnesPlanifiees}
        keyExtractor={(item) => item.id}
        cardProps={{
          icon: <Calendar className="w-4 h-4 text-role-primary" />,
          title: 'Prochaines surveillances',
          className: 'border-l-4 border-l-role-primary',
        }}
        emptyState={{
          icon: Calendar,
          title: 'Aucune surveillance planifiée',
        }}
        pagination={{
          total: surveillancesPlanifiees.length,
          current: currentPage1,
          pageSize: PAGE_SIZE,
          onPageChange: setCurrentPage1,
        }}
        headerClassName="bg-role-primary-soft/40"
      />

      {/* Derniers rapports */}
      <DataTable
        data={paginatedTransmises}
        columns={colonnesRapports}
        keyExtractor={(item) => item.id}
        cardProps={{
          icon: <FileText className="w-4 h-4 text-role-primary" />,
          title: 'Derniers rapports',
          className: 'border-l-4 border-l-role-primary',
        }}
        emptyState={{
          icon: FileText,
          title: 'Aucun rapport disponible',
        }}
        pagination={{
          total: surveillancesTransmises.length,
          current: currentPage2,
          pageSize: PAGE_SIZE,
          onPageChange: setCurrentPage2,
        }}
        headerClassName="bg-role-primary-soft/40"
      />
    </div>
  );
}
