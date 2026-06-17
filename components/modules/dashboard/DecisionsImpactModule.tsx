'use client';

import React, { useMemo } from 'react';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Clock,
  FileText,
  Activity,
  AlertCircle,
  PenLine,
  Globe,
  History,
  Eye,
  Shield,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';

export default function DecisionsImpactModule({ user: _user }: { user: any }) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const registreEntries = useAppStore(s => s.registreEntries);
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

      return {
        code: a.code_oaci,
        nom: a.nom,
        scoreInitial: premier?.score_global ?? null,
        scoreActuel: dernier?.score_global ?? profilsRisque?.[a.id]?.score_global ?? null,
        evolution,
        nbSurveillances: scores?.length || 0,
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
  }, [aerodromes, ecarts, surveillances, profilsRisque, registreEntries, certifications, homologations]);

  return (
    <div className="space-y-6 animate-fade-in" data-role="dg_anacim" data-module="dg-decisions-impact">

      <ModuleHeader
        icon={<Target className="h-8 w-8 text-white" />}
        title="Décisions & Impact"
        description="Mesure de l'efficacité des actions — Signatures DG (à venir)"
      />

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
        <div className="kpi-card border-l-4 border-l-warning">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-warning-soft"><PenLine className="w-5 h-5 text-warning" /></div>
            <div className="flex-1">
              <div className="kpi-label">Signatures en attente</div>
              <div className="kpi-value text-warning">{data?.signaturesAttente ?? 0}</div>
              <span className="text-xs text-muted-foreground">Module Signature DG à venir</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Évolution des scores par aérodrome */}
        <Card
          icon={<Activity className="h-5 w-5 text-role-primary" />}
          title="Évolution par aérodrome"
          subtitle="Amélioration vs dégradation du score"
          badge={<span className="badge neutral">{data?.evolutionAerodromes.length ?? 0} aérodromes</span>}
        >
          {data?.evolutionAerodromes && data.evolutionAerodromes.length > 0 ? (
            <div className="space-y-1">
              {data.evolutionAerodromes
                .filter(a => a.scoreInitial !== null || a.scoreActuel !== null)
                .sort((a, b) => (a.evolution ?? 0) - (b.evolution ?? 0))
                .slice(0, 15)
                .map(a => (
                  <div key={a.code} className="flex items-center gap-3 py-1.5 px-2 bg-muted/5 rounded text-sm">
                    <span className="text-xs font-medium w-20 truncate">{a.code}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{a.scoreInitial ?? '—'}</span>
                      <div className="progress flex-1">
                        <div className="progress-bar" style={{ width: `${a.scoreActuel ?? 50}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${(a.scoreActuel ?? 0) >= 80 ? 'text-success' : (a.scoreActuel ?? 0) >= 60 ? 'text-warning' : 'text-danger'}`}>
                        {a.scoreActuel ?? '—'}
                      </span>
                    </div>
                    {a.evolution !== null && (
                      <div className="flex items-center gap-1 w-16 justify-end">
                        {a.evolution > 0 && <TrendingUp className="w-3 h-3 text-success" />}
                        {a.evolution < 0 && <TrendingDown className="w-3 h-3 text-danger" />}
                        {a.evolution === 0 && <Minus className="w-3 h-3 text-muted-foreground" />}
                        <span className={`text-xs font-bold ${a.evolution > 0 ? 'text-success' : a.evolution < 0 ? 'text-danger' : ''}`}>
                          {a.evolution > 0 ? '+' : ''}{a.evolution}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Pas assez de données</p>
            </div>
          )}
        </Card>

        {/* Efficacité par aérodrome */}
        <Card
          icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          title="Efficacité des actions correctives"
          subtitle="Taux de résolution des écarts par aérodrome"
        >
          {data?.ecartsFermesParAero && data.ecartsFermesParAero.length > 0 ? (
            <div className="space-y-1">
              {data.ecartsFermesParAero
                .filter(a => a.totaux > 0)
                .sort((a, b) => b.efficacite - a.efficacite)
                .slice(0, 15)
                .map(a => (
                  <div key={a.code} className="flex items-center gap-3 py-1.5 px-2 bg-muted/5 rounded text-sm">
                    <span className="text-xs font-medium w-20 truncate">{a.code}</span>
                    <div className="progress flex-1">
                      <div className={`progress-bar ${a.efficacite >= 80 ? 'bg-success' : a.efficacite >= 50 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${a.efficacite}%` }} />
                    </div>
                    <span className="text-xs font-bold w-12 text-right">{a.efficacite}%</span>
                    <span className="text-[10px] text-muted-foreground w-16 text-right">{a.fermes}/{a.totaux}</span>
                  </div>
                ))}
            </div>
          ) : (
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
