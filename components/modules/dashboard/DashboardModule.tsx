// components/modules/dashboard/DashboardModule.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  GraduationCap,
  Plane,
  Shield,
  AlertCircle,
  Flame,
  Gauge,
  Calendar,
  Timer,
  Grid3x3,
  TrendingUp,
  Zap,
} from 'lucide-react';

// Store
import { useAppStore } from '@/lib/store';

// Graphiques
import { BarChart } from '@/components/ui/charts/BarChart';
import { PieChart as PieChartComponent } from '@/components/ui/charts/PieChart';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface DashboardModuleProps {
  user?: { role?: string };
}

export default function DashboardModule({ user: userProp }: DashboardModuleProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const notifications = useAppStore(s => s.notifications);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const evenements = useAppStore(s => s.evenements);
  const certifications = useAppStore(s => s.certifications);
  const formations = useAppStore(s => s.formations);
  const inspecteurs = useAppStore(s => s.inspecteurs);
  const plannings = useAppStore(s => s.plannings);
  const storeUser = useAppStore(s => s.user);
  const userRole = userProp?.role ?? storeUser?.role ?? '';
  const [filterAlerte, setFilterAlerte] = useState<string>('all');

  // Statistiques pour les KPIs
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

    const evenementsActifs = (evenements || []).filter(e =>
      e.statut !== 'cloture'
    ).length;

    const formationsPlanifiees = (formations || []).filter(f =>
      f.statut === 'planifiee' || f.statut === 'en_cours'
    ).length;

    return {
      totalAerodromes,
      certifies,
      certificationsExpirantes,
      surveillancesCeMois,
      realiseesCeMois,
      tauxRealisation: surveillancesCeMois > 0
        ? Math.round((realiseesCeMois / surveillancesCeMois) * 100)
        : 0,
      ecartsOuverts,
      ecartsCritiques,
      aerodromesCritiques,
      evenementsActifs,
      formationsPlanifiees,
    };
  }, [aerodromes, surveillances, ecarts, profilsRisque, evenements, certifications, formations]);

  // KPI enrichi : délai moyen planification → surveillance (en jours)
  const delaiMoyenPlanification = useMemo(() => {
    const paires = plannings
      .filter(p => p.statut === 'realisee')
      .map(p => {
        const surv = surveillances.find(s => s.planning_id === p.id && s.statut === 'transmise')
        if (!surv) return null
        const ecart = new Date(surv.date_debut).getTime() - new Date(p.date_debut).getTime()
        return ecart / (1000 * 3600 * 24)
      })
      .filter((d): d is number => d !== null && d >= 0)
    if (paires.length === 0) return 0
    return Math.round(paires.reduce((a, b) => a + b, 0) / paires.length)
  }, [plannings, surveillances])

  // KPI enrichi : taux de couverture par domaine
  const DOMAINES_SURVEILLANCE = ['SLI', 'Exploitation', 'Génie civil', 'Génie électrique', 'Environnement', 'Sûreté']
  const couvertureDomaines = useMemo(() => {
    const recentSurvs = surveillances.filter(s => {
      const d = new Date(s.date_debut)
      const sixMoisAgo = new Date()
      sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 6)
      return d >= sixMoisAgo && !s.deleted_at
    })
    const domainesCouverts = new Set<string>()
    recentSurvs.forEach(s => (s.portee || []).forEach(p => {
      DOMAINES_SURVEILLANCE.forEach(d => {
        if (p.toLowerCase().includes(d.toLowerCase().replace(/[éèê]/g, 'e'))) domainesCouverts.add(d)
      })
    }))
    return DOMAINES_SURVEILLANCE.map(d => ({
      domaine: d,
      couvert: domainesCouverts.has(d),
      count: recentSurvs.filter(s => (s.portee || []).some(p => p.toLowerCase().includes(d.toLowerCase().replace(/[éèê]/g, 'e')))).length
    }))
  }, [surveillances])

  // Heatmap compétences manquantes
  const heatmapCompetences = useMemo(() => {
    const actifs = inspecteurs.filter(i => !i.deleted_at && i.statut !== 'absent')
    return actifs.map(ins => {
      const comps = DOMAINES_SURVEILLANCE.map(d => {
        const c = ins.competences?.find(cp => cp.domaine === d)
        return { domaine: d, niveau: c?.niveau ?? 0, source: c?.source }
      })
      const manquantes = comps.filter(c => c.niveau < 3).map(c => c.domaine)
      return {
        inspecteur: `${ins.prenom} ${ins.nom}`,
        competences: comps,
        manquantes,
        score: Math.round(comps.reduce((s, c) => s + c.niveau, 0) / comps.length * 20) // 0-100
      }
    }).sort((a, b) => a.score - b.score) // Plus faibles en premier
  }, [inspecteurs])

  // Données graphique couverture
  const pieCouvertureData = useMemo(() => {
    const couvertes = couvertureDomaines.filter(d => d.couvert).length
    return [
      { label: 'Couverts', valeur: couvertes },
      { label: 'Non couverts', valeur: DOMAINES_SURVEILLANCE.length - couvertes },
    ]
  }, [couvertureDomaines])

  // Données graphique surveillance — 6 derniers mois
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

  // Données graphique écarts par niveau
  const pieData = useMemo(() => {
    const ouverts = ecarts.filter(e => e.statut !== 'cloture');
    return [
      { niveau: 'Critique', valeur: ouverts.filter(e => e.niveau_risque === 'critique').length },
      { niveau: 'Élevé', valeur: ouverts.filter(e => e.niveau_risque === 'eleve').length },
      { niveau: 'Moyen', valeur: ouverts.filter(e => e.niveau_risque === 'moyen').length },
      { niveau: 'Faible', valeur: ouverts.filter(e => e.niveau_risque === 'faible').length },
    ];
  }, [ecarts]);

  // Alertes avec priorité
  const alertes = useMemo(() => {
    return notifications
      .filter(n => !n.read_at)
      .map(n => {
        let priorite = 'basse';
        if (n.type === 'danger' || n.message.includes('critique')) priorite = 'haute';
        else if (n.type === 'warning') priorite = 'moyenne';

        return {
          id: n.id,
          type: n.type,
          message: n.message,
          aerodrome: String(n.data?.aerodrome ?? 'GOBD'),
          module: n.type,
          priorite,
          date: new Date(n.sent_at),
        };
      });
  }, [notifications]);

  const filteredAlertes = useMemo(() => {
    if (filterAlerte === 'all') return alertes;
    return alertes.filter(a => a.priorite === filterAlerte);
  }, [alertes, filterAlerte]);

  const getPrioriteBadgeClass = (priorite: string) => {
    switch(priorite) {
      case 'haute': return 'badge danger pulse';
      case 'moyenne': return 'badge warning';
      default: return 'badge primary';
    }
  };

  // Aérodromes en alerte avec vrai profil risque
  const aerodromesEnAlerte = useMemo(() => {
    return aerodromes
      .map(a => ({
        ...a,
        profil: profilsRisque[a.id],
      }))
      .filter(a => a.profil && (a.profil.niveau === 'critique' || a.profil.niveau === 'moyen'))
      .sort((a, b) => (a.profil?.score_global || 0) - (b.profil?.score_global || 0))
      .slice(0, 5);
  }, [aerodromes, profilsRisque]);

  const getRiskBadgeClass = (niveau: string) => {
    switch(niveau) {
      case 'faible': return 'risk-badge faible';
      case 'moyen': return 'risk-badge moyen';
      case 'eleve': return 'risk-badge eleve';
      case 'critique': return 'risk-badge critique';
      default: return 'badge neutral';
    }
  };

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { niveau: 'faible', label: 'Faible' };
    if (score >= 60) return { niveau: 'moyen', label: 'Moyen' };
    if (score >= 30) return { niveau: 'eleve', label: 'Élevé' };
    return { niveau: 'critique', label: 'Critique' };
  };

  return (
    <div className="space-y-6 animate-fade-in" data-role={userRole} data-module="dashboard">

      {/* Bandeau alertes premium */}
      <div className="card card-accent">
        <div className="card-content p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <AlertTriangle className="h-5 w-5 text-role-primary" />
                  {alertes.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger animate-pulse" />
                  )}
                </div>
                <span className="font-medium text-small text-foreground">
                  {alertes.length} alerte(s) non lue(s)
                </span>
              </div>
              <div className="filter-chips">
                {['all', 'haute', 'moyenne', 'basse'].map((f) => (
                  <button
                    key={f}
                    className={`filter-chip ${filterAlerte === f ? 'active' : ''}`}
                    onClick={() => setFilterAlerte(f)}
                  >
                    {f === 'all' ? 'Toutes' :
                     f === 'haute' ? 'Hautes' :
                     f === 'moyenne' ? 'Moyennes' : 'Basses'}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Tout marquer lu
            </button>
          </div>

          {/* Liste des alertes animée */}
          <div className="mt-4 space-y-2">
            {filteredAlertes.map((alerte, idx) => (
              <div
                key={alerte.id}
                className="flex items-center justify-between p-3 bg-role-primary-soft rounded-xl hover:bg-role-primary-soft/80 transition-all cursor-pointer group animate-fade-up"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={getPrioriteBadgeClass(alerte.priorite)}>
                    {alerte.priorite}
                  </span>
                  <span className="text-small text-foreground">{alerte.message}</span>
                  <span className="code-oaci-badge text-xs">{alerte.aerodrome}</span>
                  <span className="badge outline text-xs">{alerte.module}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    il y a {Math.floor((Date.now() - alerte.date.getTime()) / 3600000)}h
                  </span>
                  <button className="action-button">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {filteredAlertes.length === 0 && (
              <div className="text-center py-6 text-muted animate-fade-up">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-small">Aucune alerte non lue</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs Grid - 6 cartes premium */}
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

      {/* KPIs enrichis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="kpi-icon"><Timer className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Délai moyen planification</div>
            <div className="kpi-value">{delaiMoyenPlanification}j</div>
            <div className={`kpi-trend ${delaiMoyenPlanification <= 7 ? 'up' : 'down'}`}>
              {delaiMoyenPlanification <= 7 ? 'Objectif ≤ 7j' : `${delaiMoyenPlanification - 7}j de retard`}
            </div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-icon"><Grid3x3 className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Couverture domaines</div>
            <div className="kpi-value">{couvertureDomaines.filter(d => d.couvert).length}/{DOMAINES_SURVEILLANCE.length}</div>
            <div className="progress mt-1"><div className="progress-bar" style={{ width: `${Math.round(couvertureDomaines.filter(d => d.couvert).length / DOMAINES_SURVEILLANCE.length * 100)}%` }} /></div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="kpi-icon"><Zap className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Inspecteurs avec lacunes</div>
            <div className="kpi-value">{heatmapCompetences.filter(h => h.manquantes.length > 0).length}/{inspecteurs.filter(i => !i.deleted_at).length}</div>
            <div className="kpi-trend down">{'Compétences < 3'}</div>
          </div>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
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

        <div className="card animate-fade-up" style={{ animationDelay: '0.4s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-role-primary" />
              Écarts par niveau
            </div>
          </div>
          <div className="card-content">
            <PieChartComponent
              data={pieData}
              nameKey="niveau"
              valueKey="valeur"
              height={250}
            />
          </div>
        </div>
      </div>

      {/* Activité récente avec timeline premium */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.45s' }}>
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
              <div key={surv.id} className="timeline-item animate-fade-up" style={{ animationDelay: `${0.5 + idx * 0.05}s` }}>
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

      {/* Section Aérodromes en alerte */}
      {(userRole === 'admin' || userRole === 'inspector' || userRole === 'dg_anacim') && aerodromesEnAlerte.length > 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '0.5s' }}>
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
                    const riskLevel = getRiskLevel(profil?.score_global || 0);
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
                          <span className={getRiskBadgeClass(riskLevel.niveau)}>
                            {riskLevel.label}
                          </span>
                        </td>
                        <td>
                          {(() => {
                            const v = aero.profil
                            const vx = v?.velocity_metrics?.vitesse ?? 0
                            const tend = v?.tendance
                            if (tend === 'baisse' && vx < -1.5) return <span className="badge danger text-[10px]">Critique</span>
                            if (tend === 'baisse') return <span className="badge warning text-[10px]">Dégradé</span>
                            if (tend === 'hausse') return <span className="badge success text-[10px]">Stable</span>
                            return <span className="badge primary text-[10px]">Stable</span>
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

      {/* Couverture par domaine */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.55s' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Grid3x3 className="h-5 w-5 text-role-primary" />
            Couverture par domaine (6 derniers mois)
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {couvertureDomaines.map(d => (
              <div key={d.domaine} className={`p-3 rounded-xl text-center border ${d.couvert ? 'bg-success/10 border-success/30' : 'bg-muted/20 border-muted'}`}>
                <div className={`text-lg font-bold ${d.couvert ? 'text-success' : 'text-muted'}`}>
                  {d.count}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{d.domaine}</div>
                <div className={`badge mt-2 ${d.couvert ? 'badge-success' : 'badge-outline'}`}>
                  {d.couvert ? 'Couvert' : 'Non couvert'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap compétences manquantes */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.6s' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-role-primary" />
            Heatmap compétences
          </div>
        </div>
        <div className="card-content overflow-x-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th className="min-w-[140px]">Inspecteur</th>
                {DOMAINES_SURVEILLANCE.map(d => (
                  <th key={d} className="text-center px-2">{d.substring(0, 10)}</th>
                ))}
                <th className="text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {heatmapCompetences.slice(0, 8).map(h => (
                <tr key={h.inspecteur}>
                  <td className="font-medium text-foreground whitespace-nowrap">{h.inspecteur}</td>
                  {h.competences.map(c => (
                    <td key={c.domaine} className="text-center px-1">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold ${
                        c.niveau >= 4 ? 'bg-success/20 text-success' :
                        c.niveau >= 3 ? 'bg-warning/20 text-warning' :
                        c.niveau >= 1 ? 'bg-danger/10 text-danger' :
                        'bg-muted/10 text-muted'
                      }`}>
                        {c.niveau || '-'}
                      </span>
                    </td>
                  ))}
                  <td className="text-center">
                    <div className="progress w-12 mx-auto"><div className={`progress-bar ${h.score >= 60 ? '' : h.score >= 30 ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${h.score}%` }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {heatmapCompetences.length === 0 && (
            <p className="text-center text-muted py-4 text-sm">Aucun inspecteur trouvé</p>
          )}
        </div>
      </div>
    </div>
  );
}
