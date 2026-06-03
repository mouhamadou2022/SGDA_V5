// components/modules/dashboard/DgDashboardModule.tsx
// Tableau de bord Direction — vue stratégique nationale
// Design system premium - classes harmonisées

'use client';

import { useMemo } from 'react';
import { AlertCard } from './AlertCard';
import {
  Gauge,
  Flame,
  Clock,
  AlertCircle,
  PenLine,
  CheckCircle2,
  Eye,
  Presentation,
  BarChart3,
  Shield,
  FileSearch,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function DgDashboardModule({ user: _user }: { user: any }) {
  const user = useAppStore(s => s.user);
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const certifications = useAppStore(s => s.certifications);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  const stats = useMemo(() => {
    const totalAerodromes = aerodromes?.length || 0;

    const scoreNational = totalAerodromes > 0
      ? Math.round(aerodromes.reduce((acc, a) => acc + (profilsRisque?.[a.id]?.score_global || 0), 0) / totalAerodromes)
      : 0;

    const aerodromesCritiques = aerodromes?.filter(a => {
      const profil = profilsRisque?.[a.id];
      return profil?.niveau === 'critique';
    }).length || 0;

    const certificationsExpirantes = certifications?.filter(c => {
      if (!c.date_expiration) return false;
      const days = (new Date(c.date_expiration).getTime() - Date.now()) / (1000 * 3600 * 24);
      return days <= 60 && days > 0;
    }).length || 0;

    const pacEnRetard = ecarts?.filter(e => e.statut === 'en_retard').length || 0;

    const signaturesEnAttente = surveillances?.filter(s =>
      s.statut === 'rapport_signe' || s.statut === 'ecarts_signes'
    ).length || 0;

    const surveillancesExecutees = surveillances?.filter(s =>
      s.statut === 'transmise' || s.statut === 'archivee'
    ).length || 0;

    return { scoreNational, aerodromesCritiques, certificationsExpirantes, pacEnRetard, signaturesEnAttente, surveillancesExecutees };
  }, [aerodromes, profilsRisque, certifications, ecarts, surveillances]);

  return (
    <div className="space-y-6 animate-fade-in" data-role={user?.role || 'dg_anacim'} data-module="dg-dashboard">

      {/* ==================== ALERTES ==================== */}
      <AlertCard
        role={user?.role || 'dg_anacim'}
        onAction={(action) => setActiveModule?.(action)}
      />

      {/* ==================== KPIs STRATÉGIQUES ==================== */}
      <div className="kpi-grid">
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="kpi-icon"><Gauge className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Score moyen national</div>
            <div className="kpi-value">{stats.scoreNational}%</div>
            <div className="progress h-1.5 mt-2">
              <div className="progress-bar" style={{ width: `${stats.scoreNational}%` }} />
            </div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-icon"><Flame className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label text-danger">Aérodromes critiques</div>
            <div className="kpi-value text-danger">{stats.aerodromesCritiques}</div>
            {stats.aerodromesCritiques > 0 && (
              <div className="badge danger pulse mt-2 inline-flex">Action requise</div>
            )}
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="kpi-icon"><Clock className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Certifications expirantes</div>
            <div className="kpi-value text-warning">{stats.certificationsExpirantes}</div>
            <div className="text-xs text-warning mt-1">dans 60 jours</div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-icon"><AlertCircle className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">PAC en retard</div>
            <div className="kpi-value text-danger">{stats.pacEnRetard}</div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <div className="kpi-icon"><PenLine className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Signatures en attente</div>
            <div className="kpi-value text-warning">{stats.signaturesEnAttente}</div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="kpi-icon"><CheckCircle2 className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Surv. exécutées</div>
            <div className="kpi-value text-success">{stats.surveillancesExecutees}</div>
          </div>
        </div>
      </div>

      {/* ==================== ACCÈS RAPIDES ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Presentation className="h-5 w-5 text-role-primary" />
            Accès rapides — Direction
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              { id: 'surveillance', label: 'Surveillance', icon: Eye },
              { id: 'plans-actions', label: 'Écarts & PAC', icon: AlertCircle },
              { id: 'certification', label: 'Certifications', icon: Shield },
              { id: 'signatures', label: 'Signatures', icon: PenLine },
              { id: 'risque', label: 'Profils de risque', icon: Gauge },
              { id: 'planning', label: 'Planning', icon: BarChart3 },
              { id: 'audit', label: "Journal d'audit", icon: FileSearch },
            ] as const).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-role-primary-soft hover:bg-role-primary/10 transition-colors border border-transparent hover:border-role-primary/20 text-center group"
                  onClick={() => setActiveModule(item.id)}
                >
                  <div className="w-10 h-10 bg-role-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="h-5 w-5 text-role-primary" />
                  </div>
                  <span className="text-xs font-medium text-role-primary leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
