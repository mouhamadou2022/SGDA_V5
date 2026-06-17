'use client';

import React, { useMemo } from 'react';
import {
  Shield,
  Scale,
  Calendar,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  ChevronRight,
  FileText,
  BarChart3,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';

export default function ConformiteControleModule({ user: _user }: { user: any }) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const surveillances = useAppStore(s => s.surveillances);
  const plannings = useAppStore(s => s.plannings);
  const setActiveModule = useAppStore(s => s.setActiveModule);

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

    // Planification des surveillances
    const planifiees = surveillances?.filter(s => s.statut === 'planifiee')
      .map(s => {
        const a = aerodromes?.find(a => a.id === s.aerodrome_id);
        return { aerodrome: a?.code_oaci || s.aerodrome_id, type: s.type, date: s.date_debut, id: s.id };
      }).sort((a, b) => new Date(a.date || '-').getTime() - new Date(b.date || '-').getTime()) || [];

    const planningEnPrep = plannings?.filter(p => p.statut === 'planifiee' && !p.est_proposition)
      .map(p => {
        const a = aerodromes?.find(a => a.id === p.aerodrome_id);
        return { aerodrome: a?.code_oaci || p.aerodrome_id, type: p.type, date: p.date_debut };
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) || [];

    // Dernière surveillance par aérodrome
    const derniereSurvParAero = aerodromes?.map(a => {
      const s = surveillances?.filter(sv => sv.aerodrome_id === a.id && sv.statut === 'transmise')
        .sort((x, y) => new Date(y.date_debut || '-').getTime() - new Date(x.date_debut || '-').getTime())[0];
      return {
        code: a.code_oaci,
        nom: a.nom,
        derniereSurv: s?.date_debut || null,
        score: s?.score_global || null,
        joursDepuis: s?.date_debut ? Math.floor((Date.now() - new Date(s.date_debut).getTime()) / 86400000) : null,
      };
    }).sort((a, b) => (a.joursDepuis ?? 9999) - (b.joursDepuis ?? 9999)) || [];

    const sansSurveillanceAn = derniereSurvParAero.filter(a => a.joursDepuis === null || a.joursDepuis > 365);

    return {
      total, certifies, enCoursCert, homologues, enCoursHomo, aucunStatut,
      tauxConformite: total ? Math.round(((certifies + homologues) / total) * 100) : 0,
      expiresBientot, planifiees, planningEnPrep, derniereSurvParAero, sansSurveillanceAn,
    };
  }, [aerodromes, certifications, homologations, surveillances, plannings]);

  return (
    <div className="space-y-6 animate-fade-in" data-role="dg_anacim" data-module="dg-conformite-controle">

      <ModuleHeader
        icon={<Shield className="h-8 w-8 text-white" />}
        title="Conformité & Contrôle"
        description="Statut réglementaire national et planification"
      />

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Expirations imminentes */}
        <Card
          icon={<Clock className="h-5 w-5 text-warning" />}
          title="Expirations imminentes (90 jours)"
          subtitle="Certifications et homologations à renouveler"
          badge={data?.expiresBientot.length ? <span className="badge warning">{data.expiresBientot.length}</span> : undefined}
        >
          {data?.expiresBientot && data.expiresBientot.length > 0 ? (
            <div className="space-y-2">
              {data.expiresBientot.map((e, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-warning/5 border border-warning/20 rounded-lg">
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
          {data?.sansSurveillanceAn && data.sansSurveillanceAn.length > 0 ? (
            <div className="space-y-1">
              {data.sansSurveillanceAn.slice(0, 10).map(a => (
                <div key={a.code} className="flex items-center justify-between py-2 px-3 bg-muted/5 rounded-lg text-sm">
                  <div>
                    <span className="text-xs font-medium">{a.code}</span>
                    <span className="text-xs text-muted-foreground ml-2">{a.nom}</span>
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

      {/* Prochaines surveillances planifiées */}
      <Card
        icon={<Calendar className="h-5 w-5 text-role-primary" />}
        title="Prochaines surveillances"
        subtitle="Échéances à venir"
      >
        {data && (data.planifiees.length > 0 || data.planningEnPrep.length > 0) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.planifiees.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Surveillances programmées</p>
                <div className="space-y-1">
                  {data.planifiees.slice(0, 8).map(s => {
                    const j = Math.floor((new Date(s.date || '-').getTime() - Date.now()) / 86400000);
                    return (
                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-muted/5 rounded text-sm">
                        <span className="text-xs">{s.aerodrome}</span>
                        <span className="text-xs capitalize">{s.type?.replace(/_/g, ' ')}</span>
                        <span className={`text-xs font-bold ${j <= 7 ? 'text-danger' : j <= 14 ? 'text-warning' : ''}`}>J-{j}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {data.planningEnPrep.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Au planning</p>
                <div className="space-y-1">
                  {data.planningEnPrep.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 bg-muted/5 rounded text-sm">
                      <span className="text-xs">{p.aerodrome}</span>
                      <span className="text-xs capitalize">{p.type?.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              </div>
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
