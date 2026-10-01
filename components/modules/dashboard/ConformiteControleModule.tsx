'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Shield, Scale, Calendar, Eye, AlertTriangle, CheckCircle2, Clock, BarChart3, FileText } from 'lucide-react'
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import DecisionTab from '@/components/modules/profil-risque/DecisionTab';
import {
  fallbackConformite,
  expliquerConformite,
  resumeExpirations,
  resumeSansSurveillance,
  resumeProcessus,
  etatProcessus,
  type ContexteConformite,
} from '@/lib/ia/synthesesDgIA';
import { DOMAINES_SURVEILLANCE } from '@/lib/domaines';
import { getPlanningTypeLabel } from '@/lib/planning';

export default function ConformiteControleModule({ user: _user }: { user: any }) {
  const user = useAppStore(s => s.user);
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const ecarts = useAppStore(s => s.ecarts);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const surveillances = useAppStore(s => s.surveillances);
  const plannings = useAppStore(s => s.plannings);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  const recalculerProfilRisque = useAppStore(s => s.recalculerProfilRisque);
  const [selectedAerodromeId, setSelectedAerodromeId] = useState<string | null>(null);
  const [syntheseIA, setSyntheseIA] = useState<{ texte: string; fallbackIA: boolean } | null>(null);

  const data = useMemo(() => {
    const total = aerodromes?.length || 0;
    const certifies = certifications?.filter(c => c.statut_global === 'certifie').length || 0;
    const enCoursCert = certifications?.filter(c => c.statut_global === 'en_cours').length || 0;
    const homologues = homologations?.filter(h => h.statut_global === 'homologue').length || 0;
    const enCoursHomo = homologations?.filter(h => h.statut_global === 'en_cours').length || 0;
    const aucunStatut = total - certifies - homologues;

    const expiresBientot = [
      ...certifications?.filter(c => {
        if (!c.date_expiration) return false;
        const j = (new Date(c.date_expiration).getTime() - Date.now()) / 86400000;
        return j <= 90 && j > 0;
      }).map(c => {
        const a = aerodromes?.find(a => a.id === c.aerodrome_id);
        return { type: 'Certification' as const, aerodrome: a?.code_oaci || c.aerodrome_id, date: c.date_expiration!, jours: Math.floor((new Date(c.date_expiration!).getTime() - Date.now()) / 86400000) };
      }) || [],
      ...homologations?.filter(h => {
        if (!h.date_expiration) return false;
        const j = (new Date(h.date_expiration).getTime() - Date.now()) / 86400000;
        return j <= 90 && j > 0;
      }).map(h => {
        const a = aerodromes?.find(a => a.id === h.aerodrome_id);
        return { type: 'Homologation' as const, aerodrome: a?.code_oaci || h.aerodrome_id, date: h.date_expiration!, jours: Math.floor((new Date(h.date_expiration!).getTime() - Date.now()) / 86400000) };
      }) || [],
    ].sort((a, b) => a.jours - b.jours);

    // Planification des surveillances — enrichie : pourquoi, domaines, chef, J-x.
    const labelDomaine = (code: string) =>
      DOMAINES_SURVEILLANCE.find(d => d.code === code)?.label || code;
    const nomInspecteur = (id?: string) => {
      if (!id) return null;
      const u = utilisateurs?.find(x => x.id === id);
      return u ? `${u.prenom || ''} ${u.nom || ''}`.trim() || null : null;
    };
    const motifPour = (o: {
      aerodromeId: string; justification?: string; type?: string; declencheur?: string;
    }): string => {
      if (o.justification?.trim()) return o.justification.trim();
      const enRetard = sansSurveillanceAnCache.find(a => a.id === o.aerodromeId);
      if (enRetard) {
        return enRetard.joursDepuis === null
          ? 'Rattrapage : site jamais surveillé.'
          : `Rattrapage : sans surveillance depuis ${Math.floor(enRetard.joursDepuis / 30)} mois.`;
      }
      const expire = expiresBientotCache.find(e => e.aerodromeId === o.aerodromeId);
      if (expire) return `Renouvellement avant expiration (${expire.type} : J-${expire.jours}).`;
      if (o.type === 'certification') return 'Surveillance de certification.';
      if (o.type === 'homologation') return 'Surveillance d\u2019homologation.';
      if (o.type === 'inopine' || o.type === 'inopinee') return 'Contrôle inopiné.';
      if (o.type === 'suivi_ecarts') return 'Suivi des écarts relevés précédemment.';
      if (o.type === 'mise_oeuvre_pac') return 'Vérification de la mise en œuvre du plan d\u2019actions correctives.';
      if (o.declencheur === 'evenement') return 'Suite à un événement de sécurité.';
      if (o.declencheur === 'demande_dg') return 'À la demande de la Direction Générale.';
      if (o.declencheur === 'renouvellement') return 'Renouvellement programmé.';
      return 'Surveillance périodique du cycle de contrôle.';
    };
    // Caches calculés avant (mêmes règles que les listes affichées).
    const sansSurveillanceAnCache = (aerodromes || []).map(a => {
      const s = surveillances?.filter(sv => sv.aerodrome_id === a.id && sv.statut === 'transmise')
        .sort((x, y) => new Date(y.date_debut || '-').getTime() - new Date(x.date_debut || '-').getTime())[0];
      return {
        id: a.id,
        joursDepuis: s?.date_debut ? Math.floor((Date.now() - new Date(s.date_debut).getTime()) / 86400000) : null,
      };
    }).filter(a => a.joursDepuis === null || a.joursDepuis > 365);
    const expiresBientotCache = [
      ...(certifications || []).filter(c => {
        if (!c.date_expiration) return false;
        const j = (new Date(c.date_expiration).getTime() - Date.now()) / 86400000;
        return j <= 90 && j > 0;
      }).map(c => ({
        aerodromeId: c.aerodrome_id, type: 'Certification',
        jours: Math.floor((new Date(c.date_expiration!).getTime() - Date.now()) / 86400000),
      })),
      ...(homologations || []).filter(h => {
        if (!h.date_expiration) return false;
        const j = (new Date(h.date_expiration).getTime() - Date.now()) / 86400000;
        return j <= 90 && j > 0;
      }).map(h => ({
        aerodromeId: h.aerodrome_id, type: 'Homologation',
        jours: Math.floor((new Date(h.date_expiration!).getTime() - Date.now()) / 86400000),
      })),
    ];

    const planifiees = surveillances?.filter(s => s.statut === 'planifiee')
      .map(s => {
        const a = aerodromes?.find(x => x.id === s.aerodrome_id);
        const jours = Math.floor((new Date(s.date_debut || '-').getTime() - Date.now()) / 86400000);
        const portee = Array.isArray(s.portee) && s.portee.length > 0 ? s.portee : ['AGA'];
        return {
          id: s.id,
          origine: 'Surveillance programmée',
          aerodrome: a?.code_oaci || s.aerodrome_id,
          nom: a?.nom || '',
          type: getPlanningTypeLabel(s.type),
          date: s.date_debut, jours,
          motif: motifPour({ aerodromeId: s.aerodrome_id, justification: s.justification_declenchement, type: s.type }),
          domaines: portee.map(labelDomaine),
          chef: nomInspecteur(s.chef_id),
          equipe: (s.equipe_ids || []).length,
        };
      }).sort((a, b) => new Date(a.date || '-').getTime() - new Date(b.date || '-').getTime()) || [];

    const planningEnPrep = plannings?.filter(p => p.statut === 'planifiee' && !p.est_proposition)
      .map(p => {
        const a = aerodromes?.find(x => x.id === p.aerodrome_id);
        const jours = Math.floor((new Date(p.date_debut).getTime() - Date.now()) / 86400000);
        const portee = Array.isArray(p.portee) && p.portee.length > 0 ? p.portee : ['AGA'];
        return {
          id: p.id,
          origine: 'Au planning',
          aerodrome: a?.code_oaci || p.aerodrome_id,
          nom: a?.nom || '',
          type: getPlanningTypeLabel(p.type),
          date: p.date_debut, jours,
          motif: motifPour({ aerodromeId: p.aerodrome_id, justification: p.objectifs, declencheur: p.declencheur, type: p.type }),
          domaines: portee.map(labelDomaine),
          chef: nomInspecteur(p.chef_id),
          equipe: (p.equipe_ids || []).length,
        };
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) || [];

    // Timeline unique à venir (programmées + planning), triée par date.
    const prochaines = [...planifiees, ...planningEnPrep]
      .sort((a, b) => new Date(a.date || '-').getTime() - new Date(b.date || '-').getTime());

    // Dernière surveillance par aérodrome — une surveillance ACCOMPLIE = transmise
    // ou archivée (même règle que planningsSlice : l'archive suit la transmission).
    // Se limiter à 'transmise' faisait faussement remonter les sites archivés.
    const derniereSurvParAero = aerodromes?.map(a => {
      const s = surveillances?.filter(sv => sv.aerodrome_id === a.id && ['transmise', 'archivee'].includes(sv.statut))
        .sort((x, y) => new Date(y.date_debut || '-').getTime() - new Date(x.date_debut || '-').getTime())[0];
      return {
        code: a.code_oaci,
        nom: a.nom,
        derniereSurv: s?.date_debut || null,
        score: s?.score_global ?? null,
        statutDerniere: s?.statut ?? null,
        joursDepuis: s?.date_debut ? Math.floor((Date.now() - new Date(s.date_debut).getTime()) / 86400000) : null,
      };
    }).sort((a, b) => (a.joursDepuis ?? 9999) - (b.joursDepuis ?? 9999)) || [];

    // Couverture : une échéance à venir (programmée ou au planning) couvre déjà le site.
    const couvertureParCode = new Map<string, number>();
    for (const p of [...planifiees, ...planningEnPrep]) {
      const j = Math.floor((new Date(p.date || '-').getTime() - Date.now()) / 86400000);
      const prev = couvertureParCode.get(p.aerodrome);
      if (prev === undefined || j < prev) couvertureParCode.set(p.aerodrome, j);
    }

    const sansSurveillanceAn = derniereSurvParAero
      .filter(a => a.joursDepuis === null || a.joursDepuis > 365)
      .map(a => ({ ...a, couvert: couvertureParCode.get(a.code) ?? null }));

    // Processus en cours (certification 5 phases, homologation 3 phases) :
    // ce qui se passe + blocages, sans détail du dossier.
    const processusEnCours = [
      ...(certifications || []).filter(c => c.statut_global === 'en_cours').map(c => {
        const a = aerodromes?.find(x => x.id === c.aerodrome_id);
        const etat = etatProcessus((c.phases_data || {}) as Record<string, { statut?: string; date_reception?: string; conclusion?: string } | undefined>, c.phase_active || 1);
        return {
          id: c.id, type: 'Certification' as const, totalPhases: 5,
          aerodrome: a?.code_oaci || c.aerodrome_id, nom: a?.nom || '',
          ...etat,
        };
      }),
      ...(homologations || []).filter(h => h.statut_global === 'en_cours').map(h => {
        const a = aerodromes?.find(x => x.id === h.aerodrome_id);
        const etat = etatProcessus((h.phases_data || {}) as Record<string, { statut?: string; date_reception?: string; conclusion?: string } | undefined>, h.phase_active || 1);
        return {
          id: h.id, type: 'Homologation' as const, totalPhases: 3,
          aerodrome: a?.code_oaci || h.aerodrome_id, nom: a?.nom || '',
          ...etat,
        };
      }),
    ].sort((a, b) =>
      (a.statut === 'bloque' ? 0 : a.statut === 'attente' ? 1 : 2) -
      (b.statut === 'bloque' ? 0 : b.statut === 'attente' ? 1 : 2));

    return {
      total, certifies, enCoursCert, homologues, enCoursHomo, aucunStatut,
      tauxConformite: total ? Math.round(((certifies + homologues) / total) * 100) : 0,
      expiresBientot, planifiees, planningEnPrep, prochaines, derniereSurvParAero, sansSurveillanceAn,
      processusEnCours,
      nbBloques: processusEnCours.filter(p => p.statut === 'bloque').length,
    };
  }, [aerodromes, certifications, homologations, surveillances, plannings, utilisateurs]);

  // Synthèse DG : fallback immédiat, réécriture IA en arrière-plan.
  const contexteConformite: ContexteConformite = {
    taux: data?.tauxConformite ?? 0,
    certifies: data?.certifies ?? 0,
    homologues: data?.homologues ?? 0,
    total: data?.total ?? 0,
    expirations: (data?.expiresBientot || []).map(e => ({
      aerodrome: e.aerodrome, type: e.type, jours: e.jours,
    })),
    sansSurveillance: (data?.sansSurveillanceAn || []).map(a => a.code),
    planifiees: (data?.planifiees.length ?? 0) + (data?.planningEnPrep.length ?? 0),
  };
  const synthese = syntheseIA ?? { texte: fallbackConformite(contexteConformite), fallbackIA: true };
  useEffect(() => {
    let actif = true;
    expliquerConformite(contexteConformite).then(s => {
      if (actif && !s.fallbackIA) setSyntheseIA(s);
    }).catch(() => {});
    return () => { actif = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.tauxConformite, data?.total]);

  return (
    <div className="space-y-6 animate-fade-in" data-role="dg_anacim" data-module="dg-conformite-controle">

      <ModuleHeader
        icon={<Shield className="h-8 w-8 text-white" />}
        title="Conformité & Contrôle"
        description="Qui est en règle, quoi renouveler, quoi planifier"
      />

      {/* Synthèse DG en langage clair (IA si disponible, fallback sinon) */}
      <div className="p-4 rounded-xl border border-role-primary/20 bg-role-primary-soft/40 flex items-start gap-3">
        <Shield className="w-5 h-5 text-role-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-foreground">{synthese.texte}</p>
          {!synthese.fallbackIA && (
            <p className="text-[11px] text-muted-foreground mt-1">Synthèse rédigée par l'IA</p>
          )}
        </div>
      </div>

      {/* Fiche site (drill-down depuis les listes) */}
      {selectedAerodromeId && (() => {
        const aero = (aerodromes || []).find(a => a.id === selectedAerodromeId);
        const profil = aero ? profilsRisque?.[aero.id] : null;
        if (!aero || !profil) return null;
        return (
          <div className="space-y-4">
            <button onClick={() => setSelectedAerodromeId(null)} className="btn btn-sm btn-secondary gap-1.5">
              ← Retour à la conformité
            </button>
            {/* Carte d'identité du site — essentiel du formulaire aérodrome */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold">{aero.code_oaci}</span>
                <span className="text-sm text-muted-foreground">{aero.nom}</span>
                <span className="badge neutral text-[10px]">{aero.type === 'international' ? 'International' : 'National'}</span>
                <span className="badge neutral text-[10px]">{aero.region}</span>
                <span className={`badge text-[10px] ${aero.statut === 'actif' ? 'success' : 'warning'}`}>{aero.statut}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Niveau SLI</p>
                  <p className="font-semibold">{aero.categorie_sslia || '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Piste</p>
                  <p className="font-semibold">
                    {aero.piste_principale
                      ? `${aero.piste_principale.longueur} × ${aero.piste_principale.largeur} m · ${aero.piste_principale.orientation || ''} · ${aero.piste_principale.revetement || ''}`.trim()
                      : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Approche</p>
                  <p className="font-semibold">
                    {aero.piste_principale?.type_approche
                      ? { a_vue: 'À vue', classique: 'Classique', cat1: 'CAT I', cat2: 'CAT II' }[aero.piste_principale.type_approche]
                      : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Avion de référence</p>
                  <p className="font-semibold">{aero.piste_principale?.avion_reference || '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Horaires</p>
                  <p className="font-semibold">{aero.horaires === 'h24' ? 'H24' : aero.horaires === 'jour' ? 'Jour' : '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Exploitant</p>
                  <p className="font-semibold truncate" title={aero.exploitant_nom}>{aero.exploitant_nom || '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Certificat</p>
                  <p className="font-semibold">{aero.numero_certificat || aero.numero_homologation || '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase">Altitude</p>
                  <p className="font-semibold">{aero.altitude != null ? `${aero.altitude} m` : '—'}</p>
                </div>
              </div>
            </div>
            <DecisionTab
              profil={profil}
              aerodromeCode={aero.code_oaci}
              aerodromeName={aero.nom}
              nbEcartsCritiques={(ecarts || []).filter(e => e.aerodrome_id === aero.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length}
              userRole={user?.role || 'dg_anacim'}
              onRecalculate={() => recalculerProfilRisque(aero.id)}
              prochainesSurveillances={(surveillances || []).filter(s => s.aerodrome_id === aero.id)}
              ecartsActifs={(ecarts || []).filter(e => e.aerodrome_id === aero.id)}
              evenements={[]}
              sgsNonApplicable={aero.statut_sgs === 'non_applicable'}
            />
          </div>
        );
      })()}

      <div className="kpi-grid">
        <div className="kpi-card border-l-4 border-l-role-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-role-primary/10"><BarChart3 className="w-5 h-5 text-role-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Taux de conformité</div>
              <div className="kpi-value">{data?.tauxConformite ?? 0}%</div>
              <span className="text-xs text-muted-foreground">{data?.certifies ?? 0} certifiés · {data?.homologues ?? 0} homologués</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-warning">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-warning-soft"><Clock className="w-5 h-5 text-warning" /></div>
            <div className="flex-1">
              <div className="kpi-label">Expirations imminentes</div>
              <div className="kpi-value text-warning">{data?.expiresBientot.length || 0}</div>
              <span className="text-xs text-muted-foreground">dans 90 jours</span>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-primary-soft"><Eye className="w-5 h-5 text-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Surveillances planifiées</div>
              <div className="kpi-value">{data?.planifiees.length ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-danger">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-danger-soft"><AlertTriangle className="w-5 h-5 text-danger" /></div>
            <div className="flex-1">
              <div className="kpi-label">Sans surveillance (1 an+)</div>
              <div className="kpi-value text-danger">{data?.sansSurveillanceAn.length || 0}</div>
            </div>
          </div>
        </div>
        <div className="kpi-card border-l-4 border-l-primary">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-primary-soft"><FileText className="w-5 h-5 text-primary" /></div>
            <div className="flex-1">
              <div className="kpi-label">Processus en cours</div>
              <div className="kpi-value">{data?.processusEnCours.length || 0}</div>
              <span className="text-xs text-muted-foreground">
                {(data?.nbBloques ?? 0) > 0
                  ? <span className="text-danger font-medium">dont {data?.nbBloques} bloqué(s)</span>
                  : 'aucun blocage'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Expirations imminentes */}
        <Card
          icon={<Clock className="h-5 w-5 text-warning" />}
          title="Expirations imminentes (90 jours)"
          subtitle="Certifications et homologations à renouveler"
          badge={data?.expiresBientot.length ? <span className="badge warning">{data.expiresBientot.length}</span> : undefined}
        >
          <p className="text-xs text-foreground mb-2">{resumeExpirations(data?.expiresBientot || [])}</p>
          {data?.expiresBientot && data.expiresBientot.length > 0 ? (
            <div className="space-y-2">
              {data.expiresBientot.map((e, i) => (
                <div key={i} onClick={() => {
                  const aero = (aerodromes || []).find(a => a.code_oaci === e.aerodrome);
                  if (aero) setSelectedAerodromeId(aero.id);
                }} title="Voir la fiche détaillée" className="flex items-center justify-between p-3 bg-warning/5 border border-warning/20 rounded-lg cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2">
                    {e.type === 'Certification' ? <Shield className="w-4 h-4 text-success" /> : <Scale className="w-4 h-4 text-primary" />}
                    <div>
                      <p className="text-sm font-medium">{e.aerodrome}</p>
                      <p className="text-xs text-muted-foreground">{e.type}</p>
                    </div>
                  </div>
                  <span className={`badge text-xs ${e.jours <= 30 ? 'danger' : 'warning'}`}>J-{e.jours}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <p>Aucune expiration imminente</p>
            </div>
          )}
        </Card>

        {/* Aérodromes sans surveillance récente */}
        <Card
          icon={<Eye className="h-5 w-5 text-danger" />}
          title="Aérodromes sans surveillance (1 an+)"
          subtitle="Nécessitent une planification"
          badge={data?.sansSurveillanceAn.length ? <span className="badge danger">{data.sansSurveillanceAn.length}</span> : undefined}
        >
          <p className="text-xs text-foreground mb-2">{resumeSansSurveillance(data?.sansSurveillanceAn || [])}</p>
          {data?.sansSurveillanceAn && data.sansSurveillanceAn.length > 0 ? (
            <div className="space-y-1">
              {data.sansSurveillanceAn.slice(0, 10).map(a => (
                <div key={a.code} onClick={() => {
                  const aero = (aerodromes || []).find(x => x.code_oaci === a.code);
                  if (aero) setSelectedAerodromeId(aero.id);
                }} title="Voir la fiche détaillée" className="flex items-center justify-between py-2 px-3 bg-muted/5 rounded-lg text-sm cursor-pointer hover:shadow-md transition-shadow">
                  <div>
                    <span className="text-xs font-medium">{a.code}</span>
                    <span className="text-xs text-muted-foreground ml-2">{a.nom}</span>
                    {a.couvert != null && (
                      <span className="badge neutral text-[10px] ml-2">
                        déjà planifiée {a.couvert < 0 ? `(en retard de ${-a.couvert} j)` : a.couvert === 0 ? "(aujourd'hui)" : `(J-${a.couvert})`}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-danger font-bold">
                    {a.joursDepuis !== null ? `${Math.floor(a.joursDepuis / 30)} mois` : 'Jamais'}
                  </span>
                </div>
              ))}
              {data.sansSurveillanceAn.length > 10 && (
                <p className="text-xs text-center text-muted-foreground mt-2">
                  +{data.sansSurveillanceAn.length - 10} autres
                </p>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <p>Tous les aérodromes ont été surveillés récemment</p>
            </div>
          )}
        </Card>
      </div>

      {/* Processus en cours — suivi temps réel, blocages d'abord */}
      <Card
        icon={<FileText className="h-5 w-5 text-primary" />}
        title="Processus en cours"
        subtitle="Certifications et homologations — ce qui se passe, où ça bloque"
        badge={data?.processusEnCours.length ? (
          <span className={`badge ${(data?.nbBloques ?? 0) > 0 ? 'danger' : 'neutral'}`}>
            {data.processusEnCours.length}{data.nbBloques > 0 ? ` · ${data.nbBloques} bloqué(s)` : ''}
          </span>
        ) : undefined}
      >
        <p className="text-xs text-foreground mb-2">{resumeProcessus(data?.processusEnCours || [])}</p>
        {data && data.processusEnCours.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.processusEnCours.map(p => (
              <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                p.statut === 'bloque' ? 'border-danger/30 bg-danger/5'
                : p.statut === 'attente' ? 'border-warning/30 bg-warning/5'
                : 'border-border bg-card'
              }`}>
                {p.type === 'Certification'
                  ? <Shield className={`w-5 h-5 flex-shrink-0 ${p.statut === 'bloque' ? 'text-danger' : 'text-success'}`} />
                  : <Scale className={`w-5 h-5 flex-shrink-0 ${p.statut === 'bloque' ? 'text-danger' : 'text-primary'}`} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{p.aerodrome}</span>
                    <span className="badge neutral text-[10px]">{p.type}</span>
                    <span className={`badge text-[10px] font-bold ${p.statut === 'bloque' ? 'danger' : p.statut === 'attente' ? 'warning' : 'success'}`}>
                      {p.statut === 'bloque' ? 'Bloqué — arbitrage requis' : p.statut === 'attente' ? 'En attente prolongée' : 'En cours'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Phase {p.phase}/{p.totalPhases}
                    {p.depuis ? ` · depuis le ${new Date(p.depuis).toLocaleDateString('fr-FR')}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-muted-foreground text-sm">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
            <p>Aucun processus en cours</p>
          </div>
        )}
      </Card>

      {/* Prochaines surveillances planifiées — timeline détaillée */}
      <Card
        icon={<Calendar className="h-5 w-5 text-role-primary" />}
        title="Prochaines surveillances"
        subtitle="Pourquoi, quels domaines, quand — par ordre d'échéance"
        badge={data?.prochaines.length ? <span className="badge neutral">{data.prochaines.length}</span> : undefined}
      >
        {data && data.prochaines.length > 0 ? (
          <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
            {data.prochaines.slice(0, 10).map(s => {
              const urgent = s.jours <= 7;
              const proche = s.jours > 7 && s.jours <= 30;
              const dateFmt = s.date
                ? new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'Date à fixer';
              return (
                <div key={`${s.origine}-${s.id}`} className="relative">
                  <span className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-card ${urgent ? 'bg-danger' : proche ? 'bg-warning' : 'bg-success'}`} />
                  <div className="rounded-xl border border-border bg-card p-3 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{s.aerodrome}</span>
                        {s.nom && <span className="text-xs text-muted-foreground">{s.nom}</span>}
                        <span className="badge neutral text-[10px]">{s.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {dateFmt}
                        </span>
                        <span className={`badge text-[11px] font-bold ${urgent ? 'danger' : proche ? 'warning' : 'neutral'}`}>
                          {s.jours < 0 ? `En retard de ${-s.jours} j` : s.jours === 0 ? "Aujourd'hui" : `J-${s.jours}`}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-foreground">
                      <span className="font-medium">Pourquoi : </span>{s.motif}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">Domaines :</span>
                      {s.domaines.map(d => (
                        <span key={d} className="badge neutral text-[10px]">{d}</span>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {s.origine}{s.chef ? ` · Chef d'équipe : ${s.chef}` : ''}{s.equipe > 0 ? ` · Équipe : ${s.equipe} inspecteur(s)` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
            {data.prochaines.length > 10 && (
              <p className="text-xs text-center text-muted-foreground">+{data.prochaines.length - 10} autres échéances</p>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-muted-foreground text-sm">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Aucune surveillance planifiée</p>
          </div>
        )}
      </Card>

    </div>
  );
}
