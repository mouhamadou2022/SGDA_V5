'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Target, TrendingUp, TrendingDown, Minus, CheckCircle2, Activity, PenLine, History } from 'lucide-react'
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import {
  fallbackDecisions,
  expliquerDecisions,
  resumeEvolution,
  resumeEfficacite,
  explicationTrajectoire,
  ecartTypeScores,
  calculerFourchette,
  type ContexteDecisions,
} from '@/lib/ia/synthesesDgIA';
import { getSgsMaturiteLabel } from '@/lib/utils';

/** Courbe de trajectoire : historique (trait plein) + projections 3m/6m (pointillés) + fourchette optimiste/pessimiste (zone). */
function CourbeTrajectoire({ serie, f3, f6 }: {
  serie: number[]
  f3: { centrale: number | null; optimiste: number | null; pessimiste: number | null }
  f6: { centrale: number | null; optimiste: number | null; pessimiste: number | null }
}) {
  const W = 340, H = 140, L = 26, R = 8, T = 8, B = 18
  const pts: (number | null)[] = [...serie, f3.centrale, f6.centrale]
  const n = pts.length
  const x = (i: number) => (n < 2 ? W / 2 : L + (i * (W - L - R)) / (n - 1))
  const y = (v: number) => T + (1 - v / 100) * (H - T - B)
  const k = serie.length - 1
  const ligne = (indices: number[], v: (i: number) => number | null) =>
    indices.filter(i => v(i) != null).map(i => `${x(i).toFixed(1)},${y(v(i)!).toFixed(1)}`).join(' ')
  const histIdx = serie.map((_, i) => i)
  const prevIdx = [k, k + 1, k + 2].filter(i => i < n)
  const bande = f3.optimiste != null && f3.pessimiste != null && f6.optimiste != null && f6.pessimiste != null
    ? `${x(k).toFixed(1)},${y(serie[k]).toFixed(1)} ` +
      `${x(k + 1).toFixed(1)},${y(f3.optimiste).toFixed(1)} ${x(k + 2).toFixed(1)},${y(f6.optimiste).toFixed(1)} ` +
      `${x(k + 2).toFixed(1)},${y(f6.pessimiste).toFixed(1)} ${x(k + 1).toFixed(1)},${y(f3.pessimiste).toFixed(1)}`
    : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="Courbe de trajectoire du score">
      {[0, 50, 100].map(g => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
          <text x={2} y={y(g) + 3} fontSize="8" fill="currentColor" opacity="0.5">{g}</text>
        </g>
      ))}
      {bande && <polygon points={bande} fill="var(--color-warning)" opacity="0.18" />}
      {serie.length > 1 && (
        <polyline points={ligne(histIdx, i => serie[i])} fill="none" stroke="var(--role-primary)" strokeWidth="2" />
      )}
      {serie.length === 1 && <circle cx={x(0)} cy={y(serie[0])} r="3" fill="var(--role-primary)" />}
      <polyline
        points={ligne(prevIdx, i => (i === k ? serie[k] : i === k + 1 ? f3.centrale : f6.centrale))}
        fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeDasharray="5 3"
      />
      {histIdx.map(i => (
        <circle key={`h${i}`} cx={x(i)} cy={y(serie[i])} r="2.5" fill="var(--role-primary)">
          <title>{`Relevé : ${serie[i]}/100`}</title>
        </circle>
      ))}
      {[k + 1, k + 2].map(i =>
        i < n && pts[i] != null ? (
          <circle key={`p${i}`} cx={x(i)} cy={y(pts[i]!)} r="2.5" fill="var(--color-warning)">
            <title>{`Projection ${i === k + 1 ? '3 mois' : '6 mois'} : ${pts[i]}/100`}</title>
          </circle>
        ) : null,
      )}
      <text x={x(k + 1)} y={H - 5} fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.6">3m</text>
      <text x={x(k + 2)} y={H - 5} fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.6">6m</text>
    </svg>
  )
}

export default function DecisionsImpactModule({ user: _user }: { user: any }) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const registreEntries = useAppStore(s => s.registreEntries);
  const historiqueScores = useAppStore(s => s.historiqueScores);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  const data = useMemo(() => {
    // Évolution nationale des scores par aérodrome
    const evolutionAerodromes = aerodromes?.map(a => {
      const scores = surveillances
        ?.filter(s => s.aerodrome_id === a.id && s.score_global != null)
        ?.sort((x, y) => new Date(y.date_debut || '-').getTime() - new Date(x.date_debut || '-').getTime());

      const premier = scores?.[scores.length - 1];
      const dernier = scores?.[0];
      const evolution = premier && dernier ? dernier.score_global! - premier.score_global! : null;

      const profil = profilsRisque?.[a.id];
      const hist = [...(historiqueScores?.[a.id] || [])]
        .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
      const c1Initial = hist.length > 0 ? hist[0].c1 ?? null : null;
      const sgsNA = a.statut_sgs === 'non_applicable';
      const scoreActuel = dernier?.score_global ?? profil?.score_global ?? null;
      // Série pour la courbe : historique (5 derniers) + point actuel.
      const serie = [...hist.slice(-5).map(h => Math.round(h.score))];
      if (scoreActuel != null && serie[serie.length - 1] !== Math.round(scoreActuel)) {
        serie.push(Math.round(scoreActuel));
      }
      const sigma = ecartTypeScores(serie);
      return {
        code: a.code_oaci,
        nom: a.nom,
        scoreInitial: premier?.score_global ?? null,
        scoreActuel,
        evolution,
        nbSurveillances: scores?.length || 0,
        maturite: sgsNA ? 'SGS non applicable' : (profil?.c1 != null ? getSgsMaturiteLabel(profil.c1) : null),
        maturiteInitiale: sgsNA || c1Initial == null ? null : getSgsMaturiteLabel(c1Initial),
        pred3m: profil?.prediction_3m ?? null,
        pred6m: profil?.prediction_6m ?? null,
        serie,
        fourchette3m: calculerFourchette(profil?.prediction_3m ?? null, sigma),
        fourchette6m: calculerFourchette(profil?.prediction_6m ?? null, sigma),
      };
    }) || [];

    const ameliorations = evolutionAerodromes.filter(a => a.evolution !== null && a.evolution > 0).length;
    const degradations = evolutionAerodromes.filter(a => a.evolution !== null && a.evolution < 0).length;
    const stables = evolutionAerodromes.filter(a => a.evolution === null || a.evolution === 0).length;

    // Écarts fermés par aérodrome (impact des actions correctives)
    const ecartsFermesParAero = aerodromes?.map(a => {
      const fermes = ecarts?.filter(e => e.aerodrome_id === a.id && e.statut === 'cloture').length || 0;
      const totaux = ecarts?.filter(e => e.aerodrome_id === a.id).length || 0;
      const profil = profilsRisque?.[a.id];
      return {
        code: a.code_oaci,
        nom: a.nom,
        fermes,
        totaux,
        efficacite: totaux > 0 ? Math.round((fermes / totaux) * 100) : 0,
        scoreActuel: profil?.score_global ?? null,
        scoreInitial: profil?.score_global ?? null,
      };
    }) || [];

    const totalFermesNational = ecartsFermesParAero.reduce((acc, a) => acc + a.fermes, 0);
    const totalEcartsNational = ecartsFermesParAero.reduce((acc, a) => acc + a.totaux, 0);

    // Activité registre récente
    const activiteRecente = registreEntries
      ?.filter(e => e.aerodrome_id && aerodromes?.some(a => a.id === e.aerodrome_id))
      ?.sort((a, b) => new Date(b.created_at || '-').getTime() - new Date(a.created_at || '-').getTime())
      ?.slice(0, 8) || [];

    // Signatures en attente (placeholder pour plus tard)
    const signaturesAttente = surveillances?.filter(s =>
      s.statut === 'rapport_signe' || s.statut === 'ecarts_signes'
    ).length || 0;

    return {
      evolutionAerodromes, ameliorations, degradations, stables,
      ecartsFermesParAero, totalFermesNational, totalEcartsNational,
      activiteRecente, signaturesAttente,
    };
  }, [aerodromes, ecarts, surveillances, profilsRisque, registreEntries, certifications, homologations, historiqueScores]);

  // Synthèse DG : fallback immédiat, réécriture IA en arrière-plan.
  const topAmelioration = [...(data?.evolutionAerodromes || [])]
    .filter(a => (a.evolution ?? 0) > 0)
    .sort((a, b) => (b.evolution ?? 0) - (a.evolution ?? 0))[0];
  const topDegradation = [...(data?.evolutionAerodromes || [])]
    .filter(a => (a.evolution ?? 0) < 0)
    .sort((a, b) => (a.evolution ?? 0) - (b.evolution ?? 0))[0];
  const contexteDecisions: ContexteDecisions = {
    efficacite: data && data.totalEcartsNational > 0
      ? Math.round((data.totalFermesNational / data.totalEcartsNational) * 100) : 0,
    fermes: data?.totalFermesNational ?? 0,
    totaux: data?.totalEcartsNational ?? 0,
    ameliorations: data?.ameliorations ?? 0,
    degradations: data?.degradations ?? 0,
    signaturesAttente: data?.signaturesAttente ?? 0,
    topAmelioration: topAmelioration?.code ?? null,
    topDegradation: topDegradation?.code ?? null,
  };
  const [syntheseIA, setSyntheseIA] = useState<{ texte: string; fallbackIA: boolean } | null>(null);
  const synthese = syntheseIA ?? { texte: fallbackDecisions(contexteDecisions), fallbackIA: true };
  useEffect(() => {
    let actif = true;
    expliquerDecisions(contexteDecisions).then(s => {
      if (actif && !s.fallbackIA) setSyntheseIA(s);
    }).catch(() => {});
    return () => { actif = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.totalFermesNational, data?.totalEcartsNational, data?.signaturesAttente]);

  return (
    <div className="space-y-6 animate-fade-in" data-role="dg_anacim" data-module="dg-decisions-impact">

      <ModuleHeader
        icon={<Target className="h-8 w-8 text-white" />}
        title="Décisions & Impact"
        description="Nos actions marchent-elles — que décider"
      />

      {/* Synthèse DG en langage clair (IA si disponible, fallback sinon) */}
      <div className="p-4 rounded-xl border border-role-primary/20 bg-role-primary-soft/40 flex items-start gap-3">
        <Target className="w-5 h-5 text-role-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-foreground">{synthese.texte}</p>
          {!synthese.fallbackIA && (
            <p className="text-[11px] text-muted-foreground mt-1">Synthèse rédigée par l'IA</p>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card border-l-4 border-l-role-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-role-primary/10"><Target className="w-5 h-5 text-role-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Écarts fermés (national)</div>
              <div className="kpi-value">{data?.totalFermesNational ?? 0}</div>
              <span className="text-xs text-muted-foreground">sur {data?.totalEcartsNational ?? 0} totaux</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-success">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-success-soft"><TrendingUp className="w-5 h-5 text-success" /></div>
            <div className="flex-1">
              <div className="kpi-label">Aérodromes en amélioration</div>
              <div className="kpi-value text-success">{data?.ameliorations ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><TrendingDown className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">En dégradation</div>
              <div className="kpi-value text-danger">{data?.degradations ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-warning cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setActiveModule('signatures')} title="Ouvrir les signatures">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-warning-soft"><PenLine className="w-5 h-5 text-warning" /></div>
            <div className="flex-1">
              <div className="kpi-label">Signatures en attente</div>
              <div className="kpi-value text-warning">{data?.signaturesAttente ?? 0}</div>
              <span className="text-xs text-muted-foreground">
                {(data?.signaturesAttente ?? 0) > 0
                  ? 'Dossiers à signer — cliquez pour ouvrir'
                  : 'Aucun dossier en attente'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">

        {/* Évolution des scores par aérodrome — pleine largeur, courbes + prévisions */}
        <Card
          icon={<Activity className="h-5 w-5 text-role-primary" />}
          title="Évolution par aérodrome"
          subtitle="Trajectoire du score, maturité SGS et projections à 3 et 6 mois"
          badge={<span className="badge neutral">{data?.evolutionAerodromes.length ?? 0} aérodromes</span>}
        >
          <p className="text-xs text-foreground mb-2">{resumeEvolution(
            data?.ameliorations ?? 0,
            data?.degradations ?? 0,
            topAmelioration?.code ?? null,
            topDegradation?.code ?? null,
          )}</p>
          <p className="text-[11px] text-muted-foreground mb-3 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-role-primary" /> Relevés passés</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-warning" /> Projection centrale</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-warning/25 border border-warning/40" /> Fourchette optimiste / pessimiste (± volatilité passée)</span>
          </p>
          {data?.evolutionAerodromes && data.evolutionAerodromes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.evolutionAerodromes
                .filter(a => a.scoreInitial !== null || a.scoreActuel !== null)
                .sort((a, b) => Math.abs(b.evolution ?? 0) - Math.abs(a.evolution ?? 0))
                .slice(0, 8)
                .map(a => {
                  const delta = a.evolution ?? 0;
                  const classeTexte = delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground';
                  return (
                    <div key={a.code} className={`rounded-xl border p-3 ${delta < 0 ? 'border-danger/25 bg-danger/5' : delta > 0 ? 'border-success/25 bg-success/5' : 'border-border bg-card'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold">{a.code}</span>
                          <span className="text-xs text-muted-foreground ml-2">{a.nom}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">SGS : {a.maturite ?? 'non évaluée'}</span>
                        </div>
                        <span className={`badge text-[11px] font-bold ${delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral'}`}>
                          {delta > 0 ? '+' : ''}{a.evolution ?? '—'}
                        </span>
                      </div>
                      <CourbeTrajectoire serie={a.serie} f3={a.fourchette3m} f6={a.fourchette6m} />
                      <p className="mt-1 text-xs text-foreground flex items-start gap-1">
                        {delta > 0
                          ? <TrendingUp className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                          : delta < 0
                            ? <TrendingDown className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
                            : <Minus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                        <span className={classeTexte}>{explicationTrajectoire(a)}</span>
                      </p>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Pas assez de données</p>
            </div>
          )}
        </Card>

        {/* Efficacité des actions correctives — pleine largeur, l'essentiel pour décider */}
        <Card
          icon={<CheckCircle2 className="w-5 h-5 text-success" />}
          title="Efficacité des actions correctives"
          subtitle="Où les actions portent leurs fruits, où les redresser"
        >
          <p className="text-xs text-foreground mb-2">{resumeEfficacite(
            data && data.totalEcartsNational > 0 ? Math.round((data.totalFermesNational / data.totalEcartsNational) * 100) : 0,
            data?.totalFermesNational ?? 0,
            data?.totalEcartsNational ?? 0,
          )}</p>
          {data?.ecartsFermesParAero && data.ecartsFermesParAero.some(a => a.totaux > 0) ? (() => {
            const avecEcarts = (data?.ecartsFermesParAero || []).filter(a => a.totaux > 0);
            const critiques = avecEcarts.filter(a => a.efficacite < 50).sort((a, b) => a.efficacite - b.efficacite);
            const exemplaires = avecEcarts.filter(a => a.efficacite >= 80).sort((a, b) => b.efficacite - a.efficacite).slice(0, 3);
            const nbBons = avecEcarts.filter(a => a.efficacite >= 80).length;
            const nbMoyens = avecEcarts.filter(a => a.efficacite >= 50 && a.efficacite < 80).length;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="badge success">{nbBons} site(s) efficace(s) ≥ 80 %</span>
                  <span className="badge warning">{nbMoyens} à surveiller (50-79 %)</span>
                  <span className="badge danger">{critiques.length} à redresser (&lt; 50 %)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-danger/25 bg-danger/5 p-3">
                    <p className="text-xs font-semibold text-danger mb-2">
                      À redresser en priorité{critiques.length > 0 ? ` — ${critiques.length} site(s), ${critiques.reduce((s, a) => s + (a.totaux - a.fermes), 0)} écarts encore ouverts` : ''}
                    </p>
                    {critiques.length > 0 ? (
                      <div className="space-y-1.5">
                        {critiques.slice(0, 6).map(a => (
                          <div key={a.code} className="flex items-center gap-2 text-sm">
                            <span className="text-xs font-medium w-16 truncate">{a.code}</span>
                            <div className="progress flex-1">
                              <div className="progress-bar bg-danger" style={{ width: `${a.efficacite}%` }} />
                            </div>
                            <span className="text-xs font-bold w-10 text-right text-danger">{a.efficacite}%</span>
                            <span className="text-[10px] text-muted-foreground w-20 text-right">{a.totaux - a.fermes} ouvert(s)</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aucun site sous le seuil critique — les plans d’actions sont suivis partout.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-success/25 bg-success/5 p-3">
                    <p className="text-xs font-semibold text-success mb-2">Sites exemplaires — à valoriser</p>
                    {exemplaires.length > 0 ? (
                      <div className="space-y-1.5">
                        {exemplaires.map(a => (
                          <div key={a.code} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                            <span className="text-xs font-medium w-16 truncate">{a.code}</span>
                            <span className="text-[11px] text-muted-foreground flex-1">{a.fermes}/{a.totaux} écarts soldés</span>
                            <span className="text-xs font-bold text-success">{a.efficacite}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aucun site au-dessus de 80 % pour le moment.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Aucun écart enregistré</p>
            </div>
          )}
        </Card>
      </div>

      {/* Activité récente (Registre) */}
      <Card
        icon={<History className="h-5 w-5 text-role-primary" />}
        title="Activité récente"
        subtitle="Dernières entrées dans le registre national"
      >
        {data?.activiteRecente && data.activiteRecente.length > 0 ? (
          <div className="space-y-1">
            {data.activiteRecente.map(e => {
              const aero = aerodromes?.find(a => a.id === e.aerodrome_id);
              return (
                <div key={e.id} className="flex items-start gap-2 py-2 px-3 bg-muted/5 rounded-lg text-sm">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                    e.type === 'surveillance' ? 'bg-primary' :
                    e.type === 'certification' ? 'bg-success' :
                    e.type === 'homologation' ? 'bg-info' :
                    e.type === 'ecart' ? 'bg-danger' : 'bg-muted-foreground'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{aero?.code_oaci || e.aerodrome_id} — <span className="capitalize">{e.type}</span></p>
                    <p className="text-xs text-muted-foreground truncate">{e.description || e.titre || '—'}</p>
                    <p className="text-[10px] text-muted-foreground/70">{e.created_at ? new Date(e.created_at).toLocaleDateString('fr-FR') : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-muted-foreground text-sm">
            <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Aucune activité récente</p>
          </div>
        )}
      </Card>

    </div>
  );
}
