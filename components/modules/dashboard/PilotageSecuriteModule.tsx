'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
  Brain,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import DecisionTab from '@/components/modules/profil-risque/DecisionTab';
import {
  fallbackPilotage,
  expliquerPilotage,
  detailsPilotage,
  type ContextePilotage,
} from '@/lib/ia/synthesesDgIA';

export default function PilotageSecuriteModule({ user: _user }: { user: any }) {
  const user = useAppStore(s => s.user);
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const evenements = useAppStore(s => s.evenements);
  const recalculerProfilRisque = useAppStore(s => s.recalculerProfilRisque);
  const [selectedAerodromeId, setSelectedAerodromeId] = useState<string | null>(null);
  const [syntheseIA, setSyntheseIA] = useState<{ texte: string; fallbackIA: boolean } | null>(null);

  const data = useMemo(() => {
    // Aérodromes en alerte : profil critique/élevé OU écarts critiques
    // ouverts (même sans profil critique). Libellé clair du motif.
    const enAlerte = aerodromes?.filter(a => {
      const p = profilsRisque?.[a.id];
      const critiquesOuverts = ecarts?.filter(e => e.aerodrome_id === a.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length || 0;
      return p?.niveau === 'critique' || p?.niveau === 'eleve' || critiquesOuverts > 0;
    }).map(a => {
      const p = profilsRisque?.[a.id];
      const ecritsCritiques = ecarts?.filter(e => e.aerodrome_id === a.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length || 0;
      const pacRetard = ecarts?.filter(e => e.aerodrome_id === a.id && e.statut === 'en_retard').length || 0;
      const motifs: string[] = [];
      if (p?.niveau === 'critique') motifs.push('profil critique');
      else if (p?.niveau === 'eleve') motifs.push('vigilance élevée');
      if (ecritsCritiques > 0) motifs.push(`${ecritsCritiques} écart(s) critique(s) ouvert(s)`);
      return {
        id: a.id,
        nom: a.nom,
        code: a.code_oaci,
        region: a.region,
        exploitant: a.exploitant_nom,
        niveau: p?.niveau || 'sous surveillance',
        score: p?.score_global || 0,
        tendance: p?.tendance || 'stable',
        ecritsCritiques,
        pacRetard,
        motif: motifs.join(' · ') || 'à suivre',
      };
    }).sort((a, b) => a.score - b.score) || [];

    // Écarts critiques ouverts, par aérodrome, en langage clair.
    const ecartsCritiquesDetail = (ecarts || [])
      .filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture')
      .map(e => {
        const aero = aerodromes?.find(a => a.id === e.aerodrome_id);
        const jours = e.delai_pac ? Math.ceil((new Date(e.delai_pac).getTime() - Date.now()) / 86400000) : null;
        return {
          id: e.id,
          code: aero?.code_oaci || e.aerodrome_id,
          nom: aero?.nom || '',
          reference: e.reference,
          libelle: e.libelle,
          domaine: e.domaine,
          jours,
          delaiTexte: jours === null ? 'délai non fixé' : jours < 0 ? `dépassé de ${-jours} jour(s)` : `reste ${jours} jour(s)`,
          enRetard: jours !== null && jours < 0,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    // Échéance critique la plus proche (délais PAC des écarts critiques).
    const echeancePlusProche = ecartsCritiquesDetail
      .filter(e => e.jours !== null)
      .sort((a, b) => (a.jours as number) - (b.jours as number))[0] || null;

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
      evenementsRecents, derniersScores, ecartsCritiquesDetail, echeancePlusProche,
    };
  }, [aerodromes, profilsRisque, ecarts, surveillances, evenements]);

  // Synthèse DG : fallback immédiat, réécriture IA en arrière-plan.
  const contextePilotage: ContextePilotage = {
    sitesAlerte: (data?.enAlerte || []).map(a => a.code),
    nbEcartsCritiques: data?.totalCritiques ?? 0,
    topDomaine: data?.parDomaine?.[0]?.[0] ?? null,
    topDomaineTotal: data?.parDomaine?.[0]?.[1]?.total ?? 0,
    topDomaineCritiques: data?.parDomaine?.[0]?.[1]?.critiques ?? 0,
    nbEvenements90j: data?.evenementsRecents.length ?? 0,
    nbPacRetard: data?.totalPacRetard ?? 0,
  };
  const synthese = syntheseIA ?? { texte: fallbackPilotage(contextePilotage), fallbackIA: true };
  const details = detailsPilotage(
    data?.parDomaine?.[0]?.[0] ?? null,
    data?.parDomaine?.[0]?.[1]?.total ?? 0,
    data?.parDomaine?.[0]?.[1]?.critiques ?? 0,
    data?.evenementsRecents.length ?? 0,
    (data?.derniersScores || []).map(s => ({ score: s.score ?? null })),
    data?.totalCritiques ?? 0,
  );
  useEffect(() => {
    let actif = true;
    expliquerPilotage(contextePilotage).then(s => {
      if (actif && !s.fallbackIA) setSyntheseIA(s);
    }).catch(() => {});
    return () => { actif = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.enAlerte.length, data?.totalCritiques, data?.totalPacRetard]);

  return (
    <div className="space-y-6 animate-fade-in" data-role="dg_anacim" data-module="dg-pilotage-securite">

      <ModuleHeader
        icon={<Activity className="h-8 w-8 text-white" />}
        title="Pilotage Sécurité"
        description="Où intervenir — vue macro pour décision"
      />

      {/* Synthèse DG en langage clair (IA si disponible, fallback sinon) */}
      <div className="p-4 rounded-xl border border-role-primary/20 bg-role-primary-soft/40 flex items-start gap-3">
        <Shield className="w-5 h-5 text-role-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-foreground">{synthese.texte}</p>
          {!synthese.fallbackIA && (
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <Brain className="w-3 h-3" /> Synthèse rédigée par l'IA
            </p>
          )}
        </div>
      </div>

      {/* Fiche site (drill-down depuis les alertes) */}
      {selectedAerodromeId && (() => {
        const aero = (aerodromes || []).find(a => a.id === selectedAerodromeId);
        const profil = aero ? profilsRisque?.[aero.id] : null;
        if (!aero || !profil) return null;
        return (
          <div className="space-y-4">
            <button onClick={() => setSelectedAerodromeId(null)} className="btn btn-sm btn-secondary gap-1.5">
              ← Retour au pilotage
            </button>
            <DecisionTab
              profil={profil}
              aerodromeCode={aero.code_oaci}
              aerodromeName={aero.nom}
              nbEcartsCritiques={(ecarts || []).filter(e => e.aerodrome_id === aero.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length}
              userRole={user?.role || 'dg_anacim'}
              onRecalculate={() => recalculerProfilRisque(aero.id)}
              prochainesSurveillances={(surveillances || []).filter(s => s.aerodrome_id === aero.id)}
              ecartsActifs={(ecarts || []).filter(e => e.aerodrome_id === aero.id)}
              evenements={(evenements || []).filter(e => e.aerodrome_id === aero.id)}
              sgsNonApplicable={aero.statut_sgs === 'non_applicable'}
            />
          </div>
        );
      })()}

      <div className="kpi-grid">
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><Flame className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">Sites sous alerte</div>
              <div className="kpi-value text-danger">{data?.enAlerte.length || 0}</div>
              <span className="text-xs text-muted-foreground">
                {(data?.enAlerte.length ?? 0) > 0
                  ? `À traiter en priorité : ${(data?.enAlerte || []).slice(0, 3).map(a => a.code).join(', ')}`
                  : 'Réseau nominal — aucune intervention requise'}
              </span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><AlertCircle className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">Écarts critiques ouverts</div>
              <div className="kpi-value text-danger">{data?.totalCritiques ?? 0}</div>
              <span className="text-xs text-muted-foreground">
                {(data?.totalCritiques ?? 0) > 0
                  ? 'Détail par site dans la carte ci-dessous'
                  : 'Aucun écart critique en cours'}
              </span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-warning">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-warning-soft"><Clock className="w-5 h-5 text-warning" /></div>
            <div className="flex-1">
              <div className="kpi-label">PAC en retard</div>
              <div className="kpi-value text-warning">{data?.totalPacRetard ?? 0}</div>
              <span className="text-xs text-muted-foreground">
                {(data?.totalPacRetard ?? 0) > 0
                  ? 'Plans à relancer auprès des exploitants'
                  : 'Tous les plans sont à jour'}
              </span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-role-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-role-primary/10"><Eye className="w-5 h-5 text-role-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Échéance critique la plus proche</div>
              <div className="kpi-value">{data?.echeancePlusProche ? data.echeancePlusProche.code : '—'}</div>
              <span className="text-xs text-muted-foreground">
                {data?.echeancePlusProche
                  ? `${data.echeancePlusProche.reference} — ${data.echeancePlusProche.delaiTexte}`
                  : 'Aucune échéance critique suivie'}
              </span>
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
                <div key={a.id} onClick={() => setSelectedAerodromeId(a.id)} className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${a.niveau === 'critique' ? 'bg-danger/5 border-danger/20' : 'bg-warning/5 border-warning/20'}`} title="Voir la fiche détaillée">
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
                  <p className="mt-1 text-xs text-foreground">Pourquoi ce site : {a.motif}.</p>
                  <div className="mt-1 flex gap-2">
                    {a.ecritsCritiques > 0 && <span className="badge danger text-[10px]">{a.ecritsCritiques} critique(s)</span>}
                    {a.pacRetard > 0 && <span className="badge warning text-[10px]">{a.pacRetard} PAC en retard (info)</span>}
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

        {/* Écarts critiques par aérodrome — le DG lit chaque écart critique */}
        <Card
          icon={<AlertTriangle className="h-5 w-5 text-danger" />}
          title="Écarts critiques par aérodrome"
          subtitle="Lecture site par site — seuls les critiques"
          badge={<span className="badge danger">{data?.totalCritiques ?? 0} critique(s)</span>}
        >
          <p className="text-xs text-foreground mb-2">{details.domaines}</p>
          {data?.ecartsCritiquesDetail && data.ecartsCritiquesDetail.length > 0 ? (
            <div className="space-y-2">
              {data.ecartsCritiquesDetail.map(e => (
                <div key={e.id} className={`p-3 rounded-lg border ${e.enRetard ? 'bg-danger/5 border-danger/20' : 'bg-muted/5 border-border'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="code-oaci-badge">{e.code}</span>
                    <span className="text-xs font-medium">{e.reference}</span>
                    <span className="badge outline text-[10px]">{e.domaine}</span>
                    <span className={`text-[10px] font-medium ${e.enRetard ? 'text-danger' : 'text-muted-foreground'}`}>{e.delaiTexte}</span>
                  </div>
                  <p className="text-xs text-foreground mt-1">{e.libelle}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <p>Aucun écart critique ouvert</p>
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
          <p className="text-xs text-foreground mb-2">{details.evenements}</p>
          {data?.evenementsRecents && data.evenementsRecents.length > 0 ? (
            <div className="space-y-1">
              {data.evenementsRecents.map(e => {
                const aero = aerodromes?.find(a => a.id === e.aerodrome_id);
                return (
                  <div key={e.id} className="flex items-start gap-2 py-2 px-3 bg-muted/5 rounded-lg text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${e.gravite === 'critique' ? 'bg-danger' : e.gravite === 'eleve' ? 'bg-warning' : 'bg-primary'}`} />
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
          <p className="text-xs text-foreground mb-2">{details.scores}</p>
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
