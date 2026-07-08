// components/modules/dashboard/DashboardModule.tsx
'use client';

import React, { useMemo } from 'react';
import {
  BarChart3,
  AlertTriangle,
  Clock,
  Eye,
  GraduationCap,
  Plane,
  Shield,
  AlertCircle,
  Flame,
  Gauge,
  Calendar,
  Plus,
} from 'lucide-react';

import { useAppStore } from '@/lib/store';
import { getNiveauFromScore, getLabelFromScore, getBadgeClassFromScore } from '@/lib/config';
import { AlertCard } from './AlertCard';
import { BarChart } from '@/components/ui/charts/BarChart';

interface DashboardModuleProps {
  user?: { role?: string };
}

export default function DashboardModule({ user: userProp }: DashboardModuleProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const certifications = useAppStore(s => s.certifications);
  const formations = useAppStore(s => s.formations);
  const storeUser = useAppStore(s => s.user);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  const userRole = userProp?.role ?? storeUser?.role ?? '';
  const userId = storeUser?.id || '';

  // Statistiques KPIs
  const stats = useMemo(() => {
    const aerodromesActifs = aerodromes.filter(a => !a.deleted_at);
    const totalAerodromes = aerodromesActifs.length;
    const certifies = (certifications || []).filter(c => c.statut_global === 'certifie').length;

    const now = new Date();
    const surveillancesCeMois = surveillances.filter(s => {
      const date = new Date(s.date_debut);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    const realiseesCeMois = surveillances.filter(s => {
      const date = new Date(s.date_fin);
      return (s.statut === 'transmise' || s.statut === 'archivee') &&
             date.getMonth() === now.getMonth() &&
             date.getFullYear() === now.getFullYear();
    }).length;

    const ecartsOuverts = ecarts.filter(e =>
      ['ouvert', 'pac_attendu', 'pac_soumis', 'en_retard'].includes(e.statut)
    ).length;

    const ecartsCritiques = ecarts.filter(e =>
      e.niveau_risque === 'critique' &&
      ['ouvert', 'pac_attendu', 'en_retard'].includes(e.statut)
    ).length;

    const certificationsExpirantes = (certifications || []).filter(c => {
      if (!c.date_expiration) return false;
      const days = (new Date(c.date_expiration).getTime() - Date.now()) / (1000 * 3600 * 24);
      return days <= 60 && days > 0;
    }).length;

    const aerodromesCritiques = aerodromes.filter(a => {
      const profil = profilsRisque[a.id];
      return profil?.niveau === 'critique';
    }).length;

    const formationsPlanifiees = (formations || []).filter(f =>
      f.statut === 'planifiee' || f.statut === 'en_cours'
    ).length;

    return {
      totalAerodromes, certifies, certificationsExpirantes,
      surveillancesCeMois, realiseesCeMois,
      tauxRealisation: surveillancesCeMois > 0
        ? Math.round((realiseesCeMois / surveillancesCeMois) * 100) : 0,
      ecartsOuverts, ecartsCritiques, aerodromesCritiques, formationsPlanifiees,
    };
  }, [aerodromes, surveillances, ecarts, profilsRisque, certifications, formations]);

  // Graphique surveillance — 6 derniers mois
  const chartData = useMemo(() => {
    const moisLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const planifiees = surveillances.filter(s => {
        const sd = new Date(s.date_debut);
        return sd.getMonth() === m && sd.getFullYear() === y;
      }).length;
      const realisees = surveillances.filter(s => {
        const sd = new Date(s.date_debut);
        return sd.getMonth() === m && sd.getFullYear() === y && s.statut === 'transmise';
      }).length;
      return { mois: moisLabels[m], planifiées: planifiees, réalisées: realisees };
    });
  }, [surveillances]);

  // Aérodromes en alerte avec vrai profil risque
  const aerodromesEnAlerte = useMemo(() => {
    return aerodromes
      .map(a => ({ ...a, profil: profilsRisque[a.id] }))
      .filter(a => a.profil && (a.profil.niveau === 'critique' || a.profil.niveau === 'moyen'))
      .sort((a, b) => (a.profil?.score_global || 0) - (b.profil?.score_global || 0))
      .slice(0, 5);
  }, [aerodromes, profilsRisque]);

  // Ma charge de travail
  const todayStr = new Date().toISOString().split('T')[0];

  const mySurveillancesToday = useMemo(() => {
    if (!userId) return [];
    return surveillances.filter(s =>
      (s.chef_id === userId || s.equipe_ids?.includes(userId)) &&
      s.date_debut?.startsWith(todayStr) &&
      s.statut !== 'archivee'
    );
  }, [surveillances, userId, todayStr]);

  const pacAValider = useMemo(() => {
    if (!userId) return [];
    return ecarts.filter(e =>
      e.inspecteur_ref_id === userId &&
      e.statut === 'pac_soumis'
    );
  }, [ecarts, userId]);

  const prochainesSurveillances = useMemo(() => {
    if (!userId) return [];
    const now = new Date();
    return surveillances
      .filter(s =>
        (s.chef_id === userId || s.equipe_ids?.includes(userId)) &&
        s.statut === 'planifiee' &&
        new Date(s.date_debut) > now
      )
      .sort((a, b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime())
      .slice(0, 3);
  }, [surveillances, userId]);

  return (
    <div className="space-y-6 animate-fade-in" data-role={userRole} data-module="dashboard">

      <AlertCard role={userRole} />

      {/* KPIs Grid */}
      <div className="kpi-grid">
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="kpi-icon"><Plane className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Aérodromes</div>
            <div className="kpi-value">{stats.totalAerodromes}</div>
            <div className="kpi-trend up">+{stats.certifies} certifiés</div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-icon"><Shield className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Certifications</div>
            <div className="kpi-value">{stats.certifies}</div>
            {stats.certificationsExpirantes > 0 ? (
              <div className="kpi-trend down">{stats.certificationsExpirantes} expirant dans 60j</div>
            ) : (
              <div className="kpi-trend up">À jour</div>
            )}
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="kpi-icon"><Eye className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Surveillances ce mois</div>
            <div className="kpi-value">{stats.realiseesCeMois}/{stats.surveillancesCeMois}</div>
            <div className="progress"><div className="progress-bar" style={{ width: `${stats.tauxRealisation}%` }} /></div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-icon"><AlertCircle className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Écarts ouverts</div>
            <div className="kpi-value">{stats.ecartsOuverts}</div>
            <div className="flex items-center gap-1 mt-1">
              <Flame className="w-3 h-3 text-danger" />
              <span className="text-xs text-danger">{stats.ecartsCritiques} critiques</span>
            </div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <div className="kpi-icon"><Gauge className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Aérodromes critiques</div>
            <div className="kpi-value">{stats.aerodromesCritiques}</div>
            <div className="kpi-trend down">Niveau de risque élevé</div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="kpi-icon"><GraduationCap className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Formations planifiées</div>
            <div className="kpi-value">{stats.formationsPlanifiees}</div>
            <div className="kpi-trend up">Ce trimestre</div>
          </div>
        </div>
      </div>

      {/* Ma charge de travail */}
      {userId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card animate-fade-up" style={{ animationDelay: '0.12s' }}>
            <div className="card-header">
              <div className="card-title flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-role-primary" />
                Aujourd'hui
              </div>
            </div>
            <div className="card-content">
              <div className="text-2xl font-bold text-role-primary">{mySurveillancesToday.length}</div>
              <div className="text-xs text-muted-foreground mt-1">surveillance(s) programmée(s)</div>
              {mySurveillancesToday.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {mySurveillancesToday.slice(0, 3).map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <Eye className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span>{aerodromes.find(a => a.id === s.aerodrome_id)?.code_oaci || 'N/A'}</span>
                      <span className="ml-auto text-muted-foreground capitalize">{s.type.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card animate-fade-up" style={{ animationDelay: '0.17s' }}>
            <div className="card-header">
              <div className="card-title flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-role-primary" />
                PAC à valider
              </div>
            </div>
            <div className="card-content">
              <div className="text-2xl font-bold text-role-primary">{pacAValider.length}</div>
              <div className="text-xs text-muted-foreground mt-1">PAC soumis en attente de validation</div>
              {pacAValider.length > 0 && (
                <button
                  className="btn btn-ghost text-xs mt-3 w-full"
                  onClick={() => setActiveModule('plans-actions')}
                >
                  Voir les PAC →
                </button>
              )}
            </div>
          </div>

          <div className="card animate-fade-up" style={{ animationDelay: '0.22s' }}>
            <div className="card-header">
              <div className="card-title flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-role-primary" />
                Prochainement
              </div>
            </div>
            <div className="card-content">
              {prochainesSurveillances.length > 0 ? (
                <div className="space-y-2">
                  {prochainesSurveillances.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{new Date(s.date_debut).toLocaleDateString('fr-FR')}</span>
                      <span className="text-muted-foreground">{aerodromes.find(a => a.id === s.aerodrome_id)?.code_oaci || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Aucune surveillance planifiée</div>
              )}
              <button
                className="btn btn-ghost text-xs mt-3 w-full"
                onClick={() => setActiveModule('planning')}
              >
                Voir le planning →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-up" style={{ animationDelay: '0.27s' }}>
        <button
          onClick={() => setActiveModule('surveillance')}
          className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-role-primary-soft transition-colors text-left"
        >
          <div className="p-2 rounded-lg bg-role-primary-soft"><Plus className="h-5 w-5 text-role-primary" /></div>
          <div><div className="text-sm font-medium">Nouvelle surveillance</div><div className="text-xs text-muted-foreground">Planifier une mission</div></div>
        </button>
        <button
          onClick={() => setActiveModule('plans-actions')}
          className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-role-primary-soft transition-colors text-left"
        >
          <div className="p-2 rounded-lg bg-role-primary-soft"><Shield className="h-5 w-5 text-role-primary" /></div>
          <div><div className="text-sm font-medium">Valider des PAC</div><div className="text-xs text-muted-foreground">Écarts & actions correctives</div></div>
        </button>
        <button
          onClick={() => setActiveModule('evenements')}
          className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-role-primary-soft transition-colors text-left"
        >
          <div className="p-2 rounded-lg bg-role-primary-soft"><AlertTriangle className="h-5 w-5 text-role-primary" /></div>
          <div><div className="text-sm font-medium">Signaler un événement</div><div className="text-xs text-muted-foreground">Événement de sécurité</div></div>
        </button>
        <button
          onClick={() => setActiveModule('planning')}
          className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-role-primary-soft transition-colors text-left"
        >
          <div className="p-2 rounded-lg bg-role-primary-soft"><Calendar className="h-5 w-5 text-role-primary" /></div>
          <div><div className="text-sm font-medium">Mon planning</div><div className="text-xs text-muted-foreground">Voir les missions</div></div>
        </button>
      </div>

      {/* Performance — BarChart */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.32s' }}>
        <div className="card-header pb-2">
          <div className="card-title text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-role-primary" />
            Surveillances {new Date().getFullYear()}
          </div>
        </div>
        <div className="card-content">
          <BarChart
            data={chartData}
            xKey="mois"
            bars={[
              { key: 'planifiées', name: 'Planifiées' },
              { key: 'réalisées', name: 'Réalisées' },
            ]}
            height={250}
          />
        </div>
      </div>

      {/* Aérodromes en alerte */}
      {aerodromesEnAlerte.length > 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '0.37s' }}>
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger animate-pulse" />
              Aérodromes en alerte
            </div>
          </div>
          <div className="card-content">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Aérodrome</th>
                    <th>Score risque</th>
                    <th>Niveau</th>
                    <th>État</th>
                    <th>Écarts critiques</th>
                    <th>Dernière surveillance</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {aerodromesEnAlerte.map(aero => {
                    const profil = aero.profil;
                    const ecartsCritiquesAero = ecarts.filter(e =>
                      e.aerodrome_id === aero.id &&
                      e.niveau_risque === 'critique' &&
                      e.statut !== 'cloture'
                    ).length;
                    const derniereSurv = surveillances
                      .filter(s => s.aerodrome_id === aero.id && s.statut === 'transmise')
                      .sort((a, b) => new Date(b.date_fin).getTime() - new Date(a.date_fin).getTime())[0];

                    return (
                      <tr key={aero.id} className="cursor-pointer hover:bg-role-primary-soft group">
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="code-oaci-badge">{aero.code_oaci}</span>
                            <span className="text-small font-medium text-foreground">{aero.nom}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="progress w-20"><div className="progress-bar" style={{ width: `${profil?.score_global || 0}%` }} /></div>
                            <span className="text-small font-mono">{profil?.score_global || 0}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={getBadgeClassFromScore(profil?.score_global || 0)}>
                            {getLabelFromScore(profil?.score_global || 0)}
                          </span>
                        </td>
                        <td>
                          {(() => {
                            const v = aero.profil;
                            const vx = v?.velocity_metrics?.vitesse ?? 0;
                            const tend = v?.tendance;
                            if (tend === 'baisse' && vx < -1.5) return <span className="badge danger text-[10px]">Critique</span>;
                            if (tend === 'baisse') return <span className="badge warning text-[10px]">Dégradé</span>;
                            if (tend === 'hausse') return <span className="badge success text-[10px]">Stable</span>;
                            return <span className="badge primary text-[10px]">Stable</span>;
                          })()}
                        </td>
                        <td>
                          {ecartsCritiquesAero > 0 ? (
                            <span className="badge danger pulse">
                              {ecartsCritiquesAero} critique(s)
                            </span>
                          ) : (
                            <span className="text-muted text-small">0</span>
                          )}
                        </td>
                        <td>
                          {derniereSurv ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-muted" />
                              <span className="text-small text-muted">
                                {new Date(derniereSurv.date_fin).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted text-small">-</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="action-buttons">
                            <button className="action-button group-hover:scale-110 transition-transform">
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Activité récente */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.42s' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Clock className="h-5 w-5 text-role-primary" />
            Activité récente
          </div>
        </div>
        <div className="card-content">
          <div className="timeline">
            {surveillances
              .slice()
              .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
              .slice(0, 5).map((surv, idx) => (
              <div key={surv.id} className="timeline-item animate-fade-up" style={{ animationDelay: `${0.45 + idx * 0.05}s` }}>
                <div className="timeline-dot">
                  <Eye className="h-3 w-3 text-white" />
                </div>
                <div className="timeline-content">
                  <div className="timeline-date">
                    {new Date(surv.date_debut).toLocaleDateString('fr-FR')}
                  </div>
                  <div className="timeline-title">{surv.type}</div>
                  <div className="timeline-description">
                    Surveillance {surv.statut === 'transmise' ? 'terminée' : 'en cours'} pour {aerodromes.find(a => a.id === surv.aerodrome_id)?.code_oaci}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
