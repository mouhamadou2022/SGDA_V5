'use client';

import React, { useMemo } from 'react';
import {
  Flame,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Shield,
  Building2,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';

export default function PilotageSecuriteModule({ user: _user }: { user: any }) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const evenements = useAppStore(s => s.evenements);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  const data = useMemo(() => {
    // Aérodromes en alerte (critique + élevé)
    const enAlerte = aerodromes?.filter(a => {
      const p = profilsRisque?.[a.id];
      return p?.niveau === 'critique' || p?.niveau === 'eleve';
    }).map(a => ({
      id: a.id,
      nom: a.nom,
      code: a.code_oaci,
      region: a.region,
      exploitant: a.exploitant_nom,
      niveau: profilsRisque?.[a.id]?.niveau || 'inconnu',
      score: profilsRisque?.[a.id]?.score_global || 0,
      tendance: profilsRisque?.[a.id]?.tendance || 'stable',
      ecritsCritiques: ecarts?.filter(e => e.aerodrome_id === a.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length || 0,
      pacRetard: ecarts?.filter(e => e.aerodrome_id === a.id && e.statut === 'en_retard').length || 0,
    })).sort((a, b) => a.score - b.score) || [];

    // Statistiques nationales des écarts
    const totalCritiques = ecarts?.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length || 0;
    const totalEleves = ecarts?.filter(e => e.niveau_risque === 'eleve' && e.statut !== 'cloture').length || 0;
    const totalMoyens = ecarts?.filter(e => e.niveau_risque === 'moyen' && e.statut !== 'cloture').length || 0;
    const totalFaibles = ecarts?.filter(e => e.niveau_risque === 'faible' && e.statut !== 'cloture').length || 0;
    const totalPacRetard = ecarts?.filter(e => e.statut === 'en_retard').length || 0;
    const totalFermes = ecarts?.filter(e => e.statut === 'cloture').length || 0;

    // Répartition par domaine
    const parDomaine: Record<string, { total: number; critiques: number; }> = {};
    ecarts?.filter(e => e.statut !== 'cloture').forEach(e => {
      const d = e.domaine || 'Autre';
      if (!parDomaine[d]) parDomaine[d] = { total: 0, critiques: 0 };
      parDomaine[d].total++;
      if (e.niveau_risque === 'critique') parDomaine[d].critiques++;
    });

    // Événements récents (90j)
    const evenementsRecents = evenements?.filter(e => {
      if (!e.date) return false;
      return (Date.now() - new Date(e.date).getTime()) < 90 * 86400000;
    })?.sort((a, b) => new Date(b.date || '-').getTime() - new Date(a.date || '-').getTime())?.slice(0, 10) || [];

    // Derniers scores de surveillance
    const derniersScores = surveillances
      ?.filter(s => s.score_global != null)
      ?.sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
      ?.slice(0, 5)
      ?.map(s => {
        const aero = aerodromes?.find(a => a.id === s.aerodrome_id);
        return { aerodrome: aero?.code_oaci || s.aerodrome_id, score: s.score_global!, date: s.date_debut };
      }) || [];

    return {
      enAlerte, totalCritiques, totalEleves, totalMoyens, totalFaibles,
      totalPacRetard, totalFermes, parDomaine: Object.entries(parDomaine).sort((a, b) => b[1].total - a[1].total),
      evenementsRecents, derniersScores,
    };
  }, [aerodromes, profilsRisque, ecarts, surveillances, evenements]);

  return (
    <div className="space-y-6 animate-fade-in" data-role="dg_anacim" data-module="dg-pilotage-securite">

      <ModuleHeader
        icon={<Activity className="h-8 w-8 text-white" />}
        title="Pilotage Sécurité"
        description="Situation sécuritaire nationale — vue macro"
      />

      <div className="kpi-grid">
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><Flame className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">Aérodromes en alerte</div>
              <div className="kpi-value text-danger">{data?.enAlerte.length || 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><AlertCircle className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">Écarts critiques ouverts</div>
              <div className="kpi-value text-danger">{data?.totalCritiques ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-warning">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-warning-soft"><Clock className="w-5 h-5 text-warning" /></div>
            <div className="flex-1">
              <div className="kpi-label">PAC en retard</div>
              <div className="kpi-value text-warning">{data?.totalPacRetard ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-role-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-role-primary/10"><CheckCircle2 className="w-5 h-5 text-role-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Écarts fermés</div>
              <div className="kpi-value">{data?.totalFermes ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Aérodromes en alerte */}
        <Card
          icon={<Flame className="h-5 w-5 text-danger" />}
          title="Aérodromes en alerte"
          subtitle="Situations critiques nécessitant une décision"
          badge={data?.enAlerte.length ? <span className="badge danger">{data.enAlerte.length}</span> : undefined}
        >
          {data?.enAlerte && data.enAlerte.length > 0 ? (
            <div className="space-y-2">
              {data.enAlerte.map(a => (
                <div key={a.id} className={`p-3 rounded-lg border ${a.niveau === 'critique' ? 'bg-danger/5 border-danger/20' : 'bg-warning/5 border-warning/20'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-sm font-medium">{a.nom}</span>
                      <span className="text-xs text-muted-foreground ml-2">{a.code}</span>
                      <span className={`badge text-[10px] ml-2 ${a.niveau === 'critique' ? 'danger' : 'warning'}`}>{a.niveau}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {a.tendance === 'hausse' && <TrendingUp className="w-3 h-3 text-success" />}
                      {a.tendance === 'baisse' && <TrendingDown className="w-3 h-3 text-danger" />}
                      <span className={`text-xs font-bold ${a.score >= 60 ? 'text-success' : 'text-danger'}`}>{a.score}</span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="w-3 h-3" /> {a.region}
                    <Building2 className="w-3 h-3 ml-2" /> {a.exploitant || '—'}
                  </div>
                  <div className="mt-1 flex gap-2">
                    {a.ecritsCritiques > 0 && <span className="badge danger text-[10px]">{a.ecritsCritiques} critique(s)</span>}
                    {a.pacRetard > 0 && <span className="badge warning text-[10px]">{a.pacRetard} PAC retard</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <p>Aucun aérodrome en alerte</p>
            </div>
          )}
        </Card>

        {/* Répartition par domaine */}
        <Card
          icon={<AlertTriangle className="h-5 w-5 text-warning" />}
          title="Écarts par domaine"
          subtitle="Domaines les plus impactés"
          badge={<span className="badge neutral">{(data?.totalCritiques ?? 0) + (data?.totalEleves ?? 0) + (data?.totalMoyens ?? 0) + (data?.totalFaibles ?? 0)} total</span>}
        >
          {data?.parDomaine && data.parDomaine.length > 0 ? (
            <div className="space-y-1">
              {data.parDomaine.map(([domaine, stats]) => (
                <div key={domaine} className="flex items-center gap-3 py-1.5 px-2 bg-muted/5 rounded text-sm">
                  <span className="text-xs font-medium w-24 truncate">{domaine}</span>
                  <div className="progress flex-1">
                    <div className="progress-bar" style={{ width: `${Math.min(100, stats.total * 8)}%` }} />
                  </div>
                  <span className="text-xs font-medium w-6 text-right">{stats.total}</span>
                  {stats.critiques > 0 && <span className="badge danger text-[10px] w-12 text-center">{stats.critiques} crit.</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Aucun écart ouvert</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Événements récents */}
        <Card
          icon={<Activity className="h-5 w-5 text-warning" />}
          title="Événements récents (90 jours)"
          subtitle="Incidents de sécurité déclarés"
          badge={data?.evenementsRecents.length ? <span className="badge warning">{data.evenementsRecents.length}</span> : undefined}
        >
          {data?.evenementsRecents && data.evenementsRecents.length > 0 ? (
            <div className="space-y-1">
              {data.evenementsRecents.map(e => {
                const aero = aerodromes?.find(a => a.id === e.aerodrome_id);
                return (
                  <div key={e.id} className="flex items-start gap-2 py-2 px-3 bg-muted/5 rounded-lg text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${e.gravite === 'CRITIQUE' ? 'bg-danger' : e.gravite === 'ORANGE' ? 'bg-warning' : 'bg-primary'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{e.type} — {aero?.code_oaci || e.aerodrome_id}</p>
                      <p className="text-xs text-muted-foreground truncate">{e.description || '—'}</p>
                      <p className="text-[10px] text-muted-foreground/70">{e.date ? new Date(e.date).toLocaleDateString('fr-FR') : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Aucun événement récent</p>
            </div>
          )}
        </Card>

        {/* Derniers scores surveillance */}
        <Card
          icon={<Eye className="h-5 w-5 text-primary" />}
          title="Derniers scores de surveillance"
          subtitle="5 dernières surveillances transmises"
        >
          {data?.derniersScores && data.derniersScores.length > 0 ? (
            <div className="space-y-1">
              {data.derniersScores.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 bg-muted/5 rounded-lg text-sm">
                  <span className="text-xs font-medium">{s.aerodrome}</span>
                  <div className="flex items-center gap-2">
                    <div className="progress w-16">
                      <div className={`progress-bar ${s.score >= 80 ? 'bg-success' : s.score >= 60 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${s.score}%` }} />
                    </div>
                    <span className={`text-xs font-bold ${s.score >= 80 ? 'text-success' : s.score >= 60 ? 'text-warning' : 'text-danger'}`}>
                      {s.score}%
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {s.date ? new Date(s.date).toLocaleDateString('fr-FR') : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Aucune surveillance transmise</p>
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
