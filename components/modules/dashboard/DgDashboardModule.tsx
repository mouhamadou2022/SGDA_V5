'use client';

import React, { useMemo, useEffect, useState } from 'react';
import {
  Gauge,
  Flame,
  Clock,
  AlertCircle,
  CheckCircle2,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Globe,
  Shield,
  AlertTriangle,
  Building2,
  ChevronRight,
  Brain,
  Target,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import type { RiskPrediction } from '@/lib/risque';

interface RegionStat {
  region: string;
  nb: number;
  scoreMoyen: number;
  critiques: number;
  certifies: number;
}

interface ExploitantStat {
  nom: string;
  aerodromes: number;
  scoreMoyen: number;
  critiques: number;
  pacRetard: number;
}

export default function DgDashboardModule({ user: _user }: { user: any }) {
  const user = useAppStore(s => s.user);
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const evenements = useAppStore(s => s.evenements);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  const [prediction, setPrediction] = useState<RiskPrediction | null>(null);

  const stats = useMemo(() => {
    const total = aerodromes?.length || 0;

    const scoreNational = total > 0
      ? Math.round(aerodromes.reduce((acc, a) => acc + (profilsRisque?.[a.id]?.score_global || 0), 0) / total)
      : 0;

    const aerodromesCritiques = aerodromes?.filter(a => profilsRisque?.[a.id]?.niveau === 'critique').length || 0;
    const aerodromesEleves = aerodromes?.filter(a => profilsRisque?.[a.id]?.niveau === 'eleve').length || 0;

    const certifies = certifications?.filter(c => c.statut_global === 'certifie').length || 0;
    const homologues = homologations?.filter(h => h.statut_global === 'homologue').length || 0;
    const certifsExpirantes = certifications?.filter(c => {
      if (!c.date_expiration) return false;
      const jours = (new Date(c.date_expiration).getTime() - Date.now()) / 86400000;
      return jours <= 90 && jours > 0;
    }).length || 0;

    const pacRetard = ecarts?.filter(e => e.statut === 'en_retard').length || 0;
    const ecritsCritiques = ecarts?.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length || 0;

    const signaturesAttente = surveillances?.filter(s =>
      s.statut === 'rapport_signe' || s.statut === 'ecarts_signes'
    ).length || 0;

    const surveillancesAn = surveillances?.filter(s => {
      if (!s.date_debut) return false;
      return (Date.now() - new Date(s.date_debut).getTime()) < 365 * 86400000;
    }).length || 0;

    const evenementsRecents = evenements?.filter(e => {
      if (!e.date) return false;
      return (Date.now() - new Date(e.date).getTime()) < 90 * 86400000;
    }).length || 0;

    const regions: Record<string, RegionStat> = {};
    aerodromes?.forEach(a => {
      const r = a.region || 'Non spécifié';
      if (!regions[r]) regions[r] = { region: r, nb: 0, scoreMoyen: 0, critiques: 0, certifies: 0 };
      regions[r].nb++;
      regions[r].scoreMoyen += profilsRisque?.[a.id]?.score_global || 0;
      if (profilsRisque?.[a.id]?.niveau === 'critique') regions[r].critiques++;
      if (certifications?.find(c => c.aerodrome_id === a.id && c.statut_global === 'certifie')) regions[r].certifies++;
    });
    Object.values(regions).forEach(r => r.scoreMoyen = Math.round(r.scoreMoyen / r.nb));

    const exploitants: Record<string, ExploitantStat> = {};
    aerodromes?.forEach(a => {
      const nom = a.exploitant_nom || 'Non spécifié';
      if (!exploitants[nom]) exploitants[nom] = { nom, aerodromes: 0, scoreMoyen: 0, critiques: 0, pacRetard: 0 };
      exploitants[nom].aerodromes++;
      exploitants[nom].scoreMoyen += profilsRisque?.[a.id]?.score_global || 0;
      if (profilsRisque?.[a.id]?.niveau === 'critique') exploitants[nom].critiques++;
      exploitants[nom].pacRetard += ecarts?.filter(e => e.aerodrome_id === a.id && e.statut === 'en_retard').length || 0;
    });
    Object.values(exploitants).forEach(e => e.scoreMoyen = Math.round(e.scoreMoyen / e.aerodromes));

    const historiqueScores = surveillances
      .filter(s => s.score_global != null)
      .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
      .slice(0, 30)
      .map(s => ({ date: s.date_debut || s.created_at || '', score: s.score_global! }));

    // Scores par mois pour la tendance nationale
    const scoresParMois: Record<string, number[]> = {};
    historiqueScores.forEach(h => {
      if (!h.date) return;
      const mois = new Date(h.date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      if (!scoresParMois[mois]) scoresParMois[mois] = [];
      scoresParMois[mois].push(h.score);
    });
    const tendanceMois = Object.entries(scoresParMois)
      .map(([mois, scores]) => ({ mois, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
      .sort((a, b) => {
        const [mA, yA] = a.mois.split(' ');
        const [mB, yB] = b.mois.split(' ');
        return new Date(`${mA} 20${yA}`).getTime() - new Date(`${mB} 20${yB}`).getTime();
      });

    // Score national moyen par mois (basé sur les profils actuels par aérodrome)
    const scoreNationalParMois = tendanceMois;

    return {
      total, scoreNational, aerodromesCritiques, aerodromesEleves,
      certifies, homologues, certifsExpirantes,
      pacRetard, ecritsCritiques, signaturesAttente, surveillancesAn, evenementsRecents,
      regions: Object.values(regions).sort((a, b) => b.scoreMoyen - a.scoreMoyen),
      exploitants: Object.values(exploitants).sort((a, b) => b.scoreMoyen - a.scoreMoyen),
      scoreNationalParMois,
    };
  }, [aerodromes, profilsRisque, certifications, ecarts, surveillances, evenements]);

  // Charger la prédiction IA
  useEffect(() => {
    if (!stats?.scoreNationalParMois || stats.scoreNationalParMois.length < 3) return;
    const historique = stats.scoreNationalParMois.map(s => ({ date: s.mois, score: s.score }));
    import('@/lib/risque').then(m => {
      const p = m.predictRiskScore(historique);
      setPrediction(p);
    });
  }, [stats?.scoreNationalParMois]);

  return (
    <div className="space-y-6 animate-fade-in" data-role={user?.role || 'dg_anacim'} data-module="dg-dashboard">

      <ModuleHeader
        icon={<Globe className="h-8 w-8 text-white" />}
        title="Vue Nationale"
        description="Cockpit stratégique — Direction Générale ANACIM"
        actions={
          <div className="flex items-center gap-3">
            <span className="badge primary text-xs">DG ANACIM</span>
            <span className="badge neutral bg-white/20 text-white border border-white/30 whitespace-nowrap">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-white/30">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-role-primary to-role-secondary flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {user?.prenom?.[0]}{user?.nom?.[0]}
              </div>
              <span className="text-white text-sm font-medium">{user?.prenom} {user?.nom}</span>
            </div>
          </div>
        }
      />

      {/* KPIs Nationaux */}
      <div className="kpi-grid">
        <div className="kpi-card border-l-4 border-l-role-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-role-primary/10"><Gauge className="w-5 h-5 text-role-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Score national moyen</div>
              <div className="kpi-value">{stats?.scoreNational ?? '—'}%</div>
              <div className="progress h-1.5 mt-1">
                <div className="progress-bar" style={{ width: `${stats?.scoreNational || 0}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><Flame className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">Aérodromes en alerte</div>
              <div className="kpi-value text-danger">{(stats?.aerodromesCritiques ?? 0) + (stats?.aerodromesEleves ?? 0)}</div>
              <span className="text-xs text-muted-foreground">{stats?.aerodromesCritiques} critiques · {stats?.aerodromesEleves} élevés</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-warning">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-warning-soft"><Clock className="w-5 h-5 text-warning" /></div>
            <div className="flex-1">
              <div className="kpi-label">Certifications expirantes (90j)</div>
              <div className="kpi-value text-warning">{stats?.certifsExpirantes ?? 0}</div>
              <span className="text-xs text-muted-foreground">{stats?.certifies ?? 0} certifiés / {stats?.total ?? 0} aérodromes</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><AlertTriangle className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">PAC en retard</div>
              <div className="kpi-value text-danger">{stats?.pacRetard ?? 0}</div>
              <span className="text-xs text-muted-foreground">{stats?.ecritsCritiques} écarts critiques ouverts</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-primary-soft"><Eye className="w-5 h-5 text-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Surveillances (12 mois)</div>
              <div className="kpi-value">{stats?.surveillancesAn ?? 0}</div>
              <span className="text-xs text-muted-foreground">{stats?.signaturesAttente} signatures en attente</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-role-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-role-primary/10"><Activity className="w-5 h-5 text-role-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Taux de conformité</div>
              <div className="kpi-value">
                {stats?.total ? Math.round(((stats.certifies + stats.homologues) / stats.total) * 100) : 0}%
              </div>
              <span className="text-xs text-muted-foreground">{stats?.certifies} certifiés · {stats?.homologues} homologués</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Alertes Nationales */}
      <div className="flex flex-wrap gap-2">
        {(stats?.aerodromesCritiques ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg cursor-pointer text-sm"
            onClick={() => setActiveModule('dg-pilotage-securite')}>
            <Flame className="w-4 h-4 text-danger" />
            <span className="text-danger font-medium">{stats?.aerodromesCritiques} aérodrome(s) critique(s)</span>
          </div>
        )}
        {(stats?.certifsExpirantes ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg cursor-pointer text-sm"
            onClick={() => setActiveModule('dg-conformite-controle')}>
            <Clock className="w-4 h-4 text-warning" />
            <span className="text-warning font-medium">{stats?.certifsExpirantes} certification(s) expirent bientôt</span>
          </div>
        )}
        {(stats?.pacRetard ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg cursor-pointer text-sm"
            onClick={() => setActiveModule('dg-pilotage-securite')}>
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="text-danger font-medium">{stats?.pacRetard} PAC en retard</span>
          </div>
        )}
        {(stats?.signaturesAttente ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg cursor-pointer text-sm"
            onClick={() => setActiveModule('dg-decisions-impact')}>
            <CheckCircle2 className="w-4 h-4 text-warning" />
            <span className="text-warning font-medium">{stats?.signaturesAttente} signature(s) en attente</span>
          </div>
        )}
        {(stats?.evenementsRecents ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg cursor-pointer text-sm"
            onClick={() => setActiveModule('dg-pilotage-securite')}>
            <Activity className="w-4 h-4 text-warning" />
            <span className="text-warning font-medium">{stats?.evenementsRecents} événement(s) récents (90j)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Tendance nationale + Prédiction IA */}
        <Card
          className="col-span-1"
          icon={<TrendingUp className="h-5 w-5 text-role-primary" />}
          title="Tendance sécurité nationale"
          subtitle="Évolution du score moyen + prédiction IA"
        >
          {stats?.scoreNationalParMois && stats.scoreNationalParMois.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/10 rounded-lg">
                <span className="text-sm text-muted-foreground">Score actuel</span>
                <span className="text-lg font-bold text-role-primary">{stats.scoreNational}%</span>
                {prediction && (
                  <>
                    <span className="text-xs text-muted-foreground">→ Prévision 6 mois</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-lg font-bold ${prediction.score6m >= (stats.scoreNational) ? 'text-success' : 'text-danger'}`}>
                        {prediction.score6m}%
                      </span>
                      {prediction.trend === 'hausse' && <TrendingUp className="w-4 h-4 text-success" />}
                      {prediction.trend === 'baisse' && <TrendingDown className="w-4 h-4 text-danger" />}
                      {prediction.trend === 'stable' && <Minus className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </>
                )}
              </div>

              {prediction && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted/10 rounded">
                    <p className="text-[10px] text-muted-foreground">Confiance</p>
                    <p className="text-sm font-bold">{Math.round(prediction.confidence * 100)}%</p>
                  </div>
                  <div className="p-2 bg-muted/10 rounded">
                    <p className="text-[10px] text-muted-foreground">Risque dégradation</p>
                    <p className={`text-sm font-bold ${prediction.probabilityDegradation > 0.5 ? 'text-danger' : 'text-success'}`}>
                      {Math.round(prediction.probabilityDegradation * 100)}%
                    </p>
                  </div>
                  <div className="p-2 bg-muted/10 rounded">
                    <p className="text-[10px] text-muted-foreground">Tendance</p>
                    <p className={`text-sm font-bold capitalize ${
                      prediction.trend === 'hausse' ? 'text-success' :
                      prediction.trend === 'baisse' ? 'text-danger' : ''
                    }`}>{prediction.trend}</p>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {stats.scoreNationalParMois.slice(-12).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-sm">
                    <span className="text-xs text-muted-foreground w-24">{s.mois}</span>
                    <div className="progress flex-1">
                      <div className={`progress-bar ${s.score >= 80 ? 'bg-success' : s.score >= 60 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${s.score}%` }} />
                    </div>
                    <span className="text-xs font-medium w-8 text-right">{s.score}</span>
                  </div>
                ))}
              </div>

              {prediction && (
                <div className="p-2 bg-role-primary/5 border border-role-primary/20 rounded-lg flex items-center gap-2">
                  <Brain className="w-4 h-4 text-role-primary flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <strong>Prédiction IA :</strong> score estimé à <strong>{prediction.score6m}%</strong> dans 6 mois
                    {prediction.trend === 'baisse' && ' — une dégradation est probable, des actions correctives sont recommandées.'}
                    {prediction.trend === 'hausse' && ' — la tendance est positive, maintenez les efforts.'}
                    {prediction.trend === 'stable' && ' — le score devrait rester stable.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Pas assez de données pour la tendance nationale</p>
            </div>
          )}
        </Card>

        {/* Carte de chaleur par région */}
        <Card
          className="col-span-1"
          icon={<Globe className="h-5 w-5 text-role-primary" />}
          title="Situation par région"
          subtitle="Score moyen et aérodromes critiques"
        >
          {stats?.regions && stats.regions.length > 0 ? (
            <div className="space-y-1">
              {stats.regions.map(r => (
                <div key={r.region} className="flex items-center gap-3 py-2 px-3 bg-muted/5 rounded-lg text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.region}</p>
                    <p className="text-xs text-muted-foreground">{r.nb} aérodrome(s)</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="progress w-16">
                      <div className={`progress-bar ${r.scoreMoyen >= 80 ? 'bg-success' : r.scoreMoyen >= 60 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${r.scoreMoyen}%` }} />
                    </div>
                    <span className={`text-xs font-bold w-8 text-right ${
                      r.scoreMoyen >= 80 ? 'text-success' : r.scoreMoyen >= 60 ? 'text-warning' : 'text-danger'
                    }`}>{r.scoreMoyen}</span>
                    {r.critiques > 0 && <span className="badge danger text-[10px]">{r.critiques}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Aucune donnée régionale</p>
            </div>
          )}
        </Card>
      </div>

      {/* Classement exploitants */}
      <Card
        icon={<Building2 className="h-5 w-5 text-role-primary" />}
        title="Classement des exploitants"
        subtitle="Performance comparée par opérateur d'aérodrome"
      >
        {stats?.exploitants && stats.exploitants.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Exploitant</th>
                  <th>Aérodromes</th>
                  <th>Score moyen</th>
                  <th>Alertes</th>
                  <th>PAC retard</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stats.exploitants.map(e => (
                  <tr key={e.nom} className="hover:bg-muted/10">
                    <td className="font-medium">{e.nom}</td>
                    <td>{e.aerodromes}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress w-12">
                          <div className={`progress-bar ${e.scoreMoyen >= 80 ? 'bg-success' : e.scoreMoyen >= 60 ? 'bg-warning' : 'bg-danger'}`}
                            style={{ width: `${e.scoreMoyen}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${e.scoreMoyen >= 80 ? 'text-success' : e.scoreMoyen >= 60 ? 'text-warning' : 'text-danger'}`}>
                          {e.scoreMoyen}
                        </span>
                      </div>
                    </td>
                    <td>{e.critiques > 0 ? <span className="badge danger text-[10px]">{e.critiques}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td>{e.pacRetard > 0 ? <span className="badge warning text-[10px]">{e.pacRetard}</span> : <span className="text-xs text-muted-foreground">0</span>}</td>
                    <td>
                      <button className="btn btn-secondary btn-xs"
                        onClick={() => setActiveModule('dg-pilotage-securite')}>
                        Voir <ChevronRight className="w-3 h-3 inline ml-1" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-muted-foreground text-sm">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Aucun exploitant</p>
          </div>
        )}
      </Card>

    </div>
  );
}
