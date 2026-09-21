// components/modules/aerodromes/AerodromeDetailTabs.tsx
// Panneaux d'onglets extraits de AerodromeDetail (comportement identique).
// Tous prop-driven : la préparation des données (store, memos, IA) reste
// dans AerodromeDetail ; ici uniquement le rendu.

'use client';

import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  MapPin, Ruler, FileText, AlertTriangle,
  Download, Eye, Phone, Mail, User, Shield, Gauge, TrendingDown,
  Sparkles, AlertOctagon, Clock, Zap,
  Radio, Fuel, Navigation, Flame, Brain,
} from 'lucide-react';
import type { HelistationData, TypeInstallation, MoyenCom } from '@/lib/types/helistation';
import { TYPE_INSTALLATION_LABELS, MOYEN_COM_LABELS } from '@/lib/types/helistation';
import type {
  Aerodrome, Utilisateur, CodeAcces, Surveillance, Ecart, ProfilRisque,
} from '@/lib/store';
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import AerorisqAnalyse from '@/components/ia/AerorisqAnalyse';
import AerorisqDashboard from '@/components/ia/AerorisqDashboard';
import {
  AerodromeTypeEntiteBadge,
  SgsMaturiteBadge,
  TendanceIcon,
  getRiskProgressClass,
} from './aerodromeBadges';

const MiniMap = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] bg-role-primary-soft rounded-xl flex items-center justify-center animate-pulse">
      <MapPin className="h-8 w-8 text-role-primary" />
    </div>
  ),
});

function toDMS(lat: number, lon: number): string {
  const f = (v: number, isLat: boolean) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (((a - d) * 60 - m) * 60).toFixed(1);
    return `${d}°${m}'${s}"${isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')}`;
  };
  return `${f(lat, true)} ${f(lon, false)}`;
}

export interface HistoriqueEvent {
  id: string;
  date: string;
  action: string;
  utilisateur: string;
  details: string;
}

export interface DocumentAerodrome {
  id: string;
  titre: string;
  type: string;
  date: string;
  uploader: string;
}

export function OngletInfo({ aerodrome, personnelAerodrome, codesActifsAerodrome, ecartsCount, nbSurveillances }: {
  aerodrome: Aerodrome;
  personnelAerodrome: Utilisateur[];
  codesActifsAerodrome: CodeAcces[];
  ecartsCount: number;
  nbSurveillances: number;
}) {
  return (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-3 gap-4">
              <Card variant="role" title="Informations générales" className="col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Code OACI</label>
                      <p className="code-oaci-badge inline-block">{aerodrome.code_oaci}</p>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Type</label>
                      <p className="text-foreground">{aerodrome.type === 'international' ? 'International' : 'National'}</p>
                    </div>
                    {/* Nature de l'infrastructure */}
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Nature</label>
                      <div className="mt-0.5"><AerodromeTypeEntiteBadge typeEntite={aerodrome.type_entite} /></div>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Région</label>
                      <p className="text-foreground">{aerodrome.region}</p>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Catégorie SSLIA</label>
                      <p className="text-foreground">{aerodrome.categorie_sslia || '-'}</p>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Altitude</label>
                      <p className="text-foreground">{aerodrome.altitude || '-'} m</p>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Coordonnées</label>
                      <p className="text-small text-foreground font-mono">{aerodrome.lat && aerodrome.lon ? toDMS(aerodrome.lat, aerodrome.lon) : '-'}</p>
                      <p className="text-[10px] text-muted-foreground">{aerodrome.lat?.toFixed(4) || '-'}°, {aerodrome.lon?.toFixed(4) || '-'}°</p>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Maturité SGS</label>
                      <SgsMaturiteBadge score={aerodrome.maturite_sgs} />
                      {aerodrome.statut_sgs === 'non_applicable' && (
                        <span className="badge neutral text-[10px] ml-2">SGS non applicable</span>
                      )}
                      {aerodrome.statut_sgs === 'simplifie' && (
                        <span className="badge warning text-[10px] ml-2">SGS simplifié</span>
                      )}
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Horaires</label>
                      <p className="text-foreground">{aerodrome.horaires === 'h24' ? 'H24' : aerodrome.horaires === 'jour' ? 'Jour uniquement' : '-'}</p>
                    </div>
                    {aerodrome.aides_visuelles && aerodrome.aides_visuelles.length > 0 && (
                      <div className="col-span-2">
                        <label className="text-role-primary text-xs uppercase font-semibold">Aides visuelles</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {aerodrome.aides_visuelles.map((aide: string, i: number) => (
                            <span key={i} className="badge neutral">{aide}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Écarts actifs</label>
                      <span className="badge danger">{ecartsCount}</span>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Surveillances</label>
                      <span className="badge primary">{nbSurveillances}</span>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Dernière mise à jour</label>
                      <p className="text-small text-foreground">
                        {aerodrome.updated_at ? format(new Date(aerodrome.updated_at), 'dd MMM yyyy', { locale: fr }) : '-'}
                      </p>
                    </div>
                  </div>
              </Card>

              <Card variant="role" title="Localisation" contentClassName="p-0">
                  <div className="h-[200px] rounded-b-xl overflow-hidden">
                    <MiniMap
                      latitude={aerodrome.lat || 14.7167}
                      longitude={aerodrome.lon || -17.4677}
                      onPositionChange={() => {}}
                    />
                  </div>
              </Card>
            </div>

            {(aerodrome.exploitant_nom || aerodrome.exploitant_adresse || aerodrome.exploitant_telephone) && (
              <Card variant="role" title="Exploitant">
                  <div className="grid grid-cols-3 gap-4">
                    {aerodrome.exploitant_nom && (
                      <div>
                        <label className="text-role-primary text-xs uppercase font-semibold">Nom</label>
                        <p className="text-foreground">{aerodrome.exploitant_nom}</p>
                      </div>
                    )}
                    {aerodrome.exploitant_adresse && (
                      <div>
                        <label className="text-role-primary text-xs uppercase font-semibold">Adresse</label>
                        <p className="text-foreground">{aerodrome.exploitant_adresse}</p>
                      </div>
                    )}
                    {aerodrome.exploitant_telephone && (
                      <div>
                        <label className="text-role-primary text-xs uppercase font-semibold">Téléphone</label>
                        <p className="text-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {aerodrome.exploitant_telephone}
                        </p>
                      </div>
                    )}
                  </div>
              </Card>
            )}

            {personnelAerodrome.length > 0 && (
              <Card variant="level" levelColor="warning" title="Personnel Exploitant" badge={<span className="badge warning">{personnelAerodrome.length}</span>}>
                  <div className="grid grid-cols-3 gap-4">
                    {personnelAerodrome.map(u => {
                      const roleLabel = u.role === 'dg_operator' ? 'DG Exploitant' : u.role === 'focal_operator' ? 'Point Focal' : 'Personnel'
                      const roleColor = u.role === 'dg_operator' ? 'badge danger' : u.role === 'focal_operator' ? 'badge primary' : 'badge neutral'
                      return (
                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-role-primary-soft">
                          <div className="w-10 h-10 rounded-full bg-role-primary flex items-center justify-center text-white text-sm font-bold">
                            {u.prenom?.[0]}{u.nom?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{u.prenom} {u.nom}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                            <span className={`badge ${roleColor} text-[10px] mt-1`}>{roleLabel}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              </Card>
            )}

            {codesActifsAerodrome.length > 0 && (codesActifsAerodrome.some(c => c.dg_prenom || c.dg_nom || c.focal_prenom || c.focal_nom)) && (
              <Card variant="level" levelColor="success" title="Responsables avec accès" badge={<span className="badge success">Codes actifs</span>}>
                  <div className="grid grid-cols-2 gap-4">
                    {codesActifsAerodrome.map(code => {
                      const items: { label: string; prenom?: string; nom?: string; badge: string }[] = []
                      if (code.dg_prenom || code.dg_nom) items.push({ label: 'DG Exploitant', prenom: code.dg_prenom, nom: code.dg_nom, badge: 'badge danger' })
                      if (code.focal_prenom || code.focal_nom) items.push({ label: 'Point Focal', prenom: code.focal_prenom, nom: code.focal_nom, badge: 'badge primary' })
                      if (code.staff_prenom || code.staff_nom) items.push({ label: 'Personnel', prenom: code.staff_prenom, nom: code.staff_nom, badge: 'badge neutral' })
                      return items.map((item, idx) => (
                        <div key={`${code.id}-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-success-soft">
                          <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center text-white text-sm font-bold">
                            {item.prenom?.[0]}{item.nom?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{item.prenom} {item.nom}</p>
                            <span className={`badge ${item.badge} text-[10px] mt-1`}>{item.label}</span>
                          </div>
                        </div>
                      ))
                    })}
                  </div>
              </Card>
            )}

            {aerodrome.contacts && aerodrome.contacts.length > 0 && (
              <Card variant="role" title="Contacts">
                  <div className="grid grid-cols-2 gap-4">
                    {aerodrome.contacts.map((contact: { nom: string; poste: string; email: string; telephone: string }, index: number) => (
                      <div key={index} className="p-3 bg-role-primary-soft rounded-xl border border-role-primary-light">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-role-primary" />
                          <span className="font-medium text-foreground">{contact.nom}</span>
                        </div>
                        <p className="text-small text-muted-foreground ml-6">{contact.poste}</p>
                        <div className="flex items-center gap-2 mt-2 text-small ml-6">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <a href={`mailto:${contact.email}`} className="text-role-primary hover:underline">{contact.email}</a>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-small ml-6">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-foreground">{contact.telephone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
              </Card>
            )}
          </div>
  );
}

export function OngletRisque({ aerodrome, profilRisque, iaAnalysis, isLoadingIA }: {
  aerodrome: Aerodrome;
  profilRisque?: ProfilRisque | null;
  iaAnalysis: RiskAnalysisResult | null;
  isLoadingIA: boolean;
}) {
  const predictions = iaAnalysis?.predictions;
  const suggestions = iaAnalysis?.suggestions || [];
  const proactiveAlert = iaAnalysis?.proactiveAlert;
  const velocityMetrics = iaAnalysis?.velocityMetrics;
  const blackSwans = iaAnalysis?.blackSwans || [];
  const survival = iaAnalysis?.survival;
  const extremeValue = iaAnalysis?.extremeValue;
  const hiddenMarkov = iaAnalysis?.hiddenMarkov;
  return (
          <div className="space-y-4 animate-fade-in">
            {isLoadingIA && (
              <div className="text-center py-8">
                <div className="spinner mx-auto mb-4" />
                <p className="text-muted-foreground">Analyse AERORISQ en cours...</p>
              </div>
            )}

            {!isLoadingIA && profilRisque ? (
              <>
                {/* Alerte proactive IA */}
                {proactiveAlert && proactiveAlert.niveauUrgence !== 'info' && (
                  <div className={`alert alert-${proactiveAlert.niveauUrgence === 'critique' ? 'error' : proactiveAlert.niveauUrgence === 'alerte' ? 'warning' : 'info'} animate-pulse`}>
                    <AlertOctagon className="alert-icon" />
                    <div className="alert-content">
                      <div className="alert-title">{proactiveAlert.messageCourt}</div>
                      <div className="alert-description">{proactiveAlert.messageLong}</div>
                      <p className="text-xs mt-1">Action suggérée: {proactiveAlert.actionSuggerer}</p>
                      {proactiveAlert.delaiEstimeJours && (
                        <p className="text-xs mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />Délai estimé: {proactiveAlert.delaiEstimeJours} jours</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Score global et tendance */}
                <div className="grid grid-cols-4 gap-4">
                  <Card variant="role" className="col-span-1" contentClassName="p-4 text-center">
                      <p className="text-small text-muted-foreground">Score global</p>
                      {aerodrome.statut_sgs === 'non_applicable' && (
                        <p className="badge neutral text-[10px] mt-1">SGS non applicable — C1 exclu</p>
                      )}
                      <div className={`risk-badge ${profilRisque.niveau} text-lg px-3 py-1 inline-block mt-1`}>
                        {profilRisque.score_global}%
                      </div>
                      <div className={`progress h-2 mt-3 ${getRiskProgressClass(profilRisque.niveau)}`}>
                        <div className="progress-bar" style={{ width: `${profilRisque.score_global}%` }} />
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-2">
                        <TendanceIcon tendance={profilRisque.tendance} />
                        <span className="text-small capitalize text-foreground">{profilRisque.tendance || 'stable'}</span>
                      </div>
                      {velocityMetrics && (
                        <div className="mt-3 pt-2 border-t border-border text-xs">
                          <p className="text-muted-foreground">Vitesse: <span className={velocityMetrics.vitesse < 0 ? 'text-danger' : 'text-success'}>{velocityMetrics.vitesse > 0 ? '+' : ''}{velocityMetrics.vitesse} pts/mois</span></p>
                          <p className="text-muted-foreground">Accélération: {velocityMetrics.acceleration}</p>
                          <p className="text-muted-foreground">Volatilité: {velocityMetrics.volatilite}</p>
                          <p className="text-muted-foreground">Vigilance: <span className="capitalize">{velocityMetrics.niveauVigilance}</span></p>
                        </div>
                      )}
                  </Card>

                  <Card variant="role" className="col-span-3" icon={<Sparkles className="h-4 w-4 text-role-primary" />} title="Prédictions AERORISQ">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-role-primary-soft rounded-xl border border-role-primary-light">
                          <p className="text-small text-muted-foreground">Dans 3 mois</p>
                          <p className="text-2xl font-bold text-role-primary">{predictions?.score3m || profilRisque.prediction_3m || 0}%</p>
                          {predictions?.intervals?.score3m && (
                            <p className="text-xs text-muted-foreground">IC95%: [{predictions.intervals.score3m[0]}-{predictions.intervals.score3m[1]}]</p>
                          )}
                        </div>
                        <div className="text-center p-3 bg-role-primary-soft rounded-xl border border-role-primary-light">
                          <p className="text-small text-muted-foreground">Dans 6 mois</p>
                          <p className="text-2xl font-bold text-role-primary">{predictions?.score6m || profilRisque.prediction_6m || 0}%</p>
                          {predictions?.intervals?.score6m && (
                            <p className="text-xs text-muted-foreground">IC95%: [{predictions.intervals.score6m[0]}-{predictions.intervals.score6m[1]}]</p>
                          )}
                        </div>
                        <div className="text-center p-3 bg-role-primary-soft rounded-xl border border-role-primary-light">
                          <p className="text-small text-muted-foreground">Dans 12 mois</p>
                          <p className="text-2xl font-bold text-role-primary">{predictions?.score12m || 0}%</p>
                          {predictions?.intervals?.score12m && (
                            <p className="text-xs text-muted-foreground">IC95%: [{predictions.intervals.score12m[0]}-{predictions.intervals.score12m[1]}]</p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-center mt-2 text-muted-foreground">
                        Confiance: {predictions?.confidence || 50}% • Confiance globale analyse: {iaAnalysis?.confidence || 50}%
                      </p>
                  </Card>
                </div>

                {/* Modèles avancés (survival, HMM, EVT) */}
                {(survival || hiddenMarkov || extremeValue) && (
                  <Card variant="role" headerGradient icon={<Brain className="w-4 h-4 text-role-primary" />} title="Modèles avancés" contentClassName="p-3 space-y-2">
                      {hiddenMarkov && (
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${hiddenMarkov.currentState === 'critical' ? 'bg-danger animate-pulse' : hiddenMarkov.currentState === 'degrading' ? 'bg-warning' : 'bg-success'}`} />
                          <span className="text-xs text-foreground font-medium capitalize">{hiddenMarkov.currentState}</span>
                          {hiddenMarkov.isTransitioning && <span className="badge warning text-[9px] animate-pulse">Transition</span>}
                          {hiddenMarkov.daysToCritical < 999 && (
                            <span className="text-[10px] text-muted-foreground">~{hiddenMarkov.daysToCritical}j avant critique</span>
                          )}
                        </div>
                      )}
                      {survival && (
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>Hazard 90j: <strong className="text-danger">{survival.hazard90d}%</strong></span>
                          <span>Hazard 180j: <strong className="text-warning">{survival.hazard180d}%</strong></span>
                          <span>Médiane survie: <strong>{survival.medianDays}j</strong></span>
                        </div>
                      )}
                      {extremeValue && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Retour 1 an: <strong>{extremeValue.returnLevel1y}</strong></span>
                          {extremeValue.isHeavyTailed && <span className="badge danger text-[9px]">Queue lourde</span>}
                          <span>Risque extrême: <strong className="text-danger">{extremeValue.tailRisk}%</strong></span>
                        </div>
                      )}
                  </Card>
                )}

                {/* Métriques Hawkes (contagion) */}
                {iaAnalysis?.hawkesRisk && (
                  <Card variant="role" icon={<Zap className="h-4 w-4 text-warning" />} title="Risque de contagion (Hawkes)">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Risque à 30j</p>
                          <p className="text-xl font-bold text-warning">{iaAnalysis.hawkesRisk.riskNext30Days}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Nouveaux écarts attendus</p>
                          <p className="text-xl font-bold">{iaAnalysis.hawkesRisk.expectedNewEcarts}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Intensité actuelle</p>
                          <p className="text-xl font-bold">{iaAnalysis.hawkesRisk.currentIntensity}</p>
                        </div>
                      </div>
                  </Card>
                )}

                {/* Détail des critères C1-C5 */}
                <Card variant="role" title="Détail des critères">
                    <div className="space-y-3">
                      {[
                        { key: 'c1', label: 'C1 - Maturité & Culture SGS', value: profilRisque.c1 },
                        { key: 'c2', label: 'C2 - Efficacité & Réactivité', value: profilRisque.c2 },
                        { key: 'c3', label: 'C3 - Conformité Technique', value: profilRisque.c3 },
                        { key: 'c4', label: 'C4 - Charge Critique Non Résolue', value: profilRisque.c4 },
                        { key: 'c5', label: 'C5 - Résilience & Historique Sécurité', value: profilRisque.c5 },
                      ].map((critere) => {
                        const exempt = critere.key === 'c1' && aerodrome.statut_sgs === 'non_applicable'
                        return (
                        <div key={critere.key}>
                          <div className="flex items-center justify-between text-small mb-1">
                            <span className="text-foreground">{critere.label}</span>
                            <span className="font-medium text-foreground">{exempt ? 'Non applicable' : `${critere.value || 0}/100`}</span>
                          </div>
                          {!exempt && (
                            <div className="progress h-2">
                              <div className="progress-bar" style={{ width: `${critere.value || 0}%` }} />
                            </div>
                          )}
                          {exempt && <p className="text-[10px] text-foreground mt-0.5">SGS non applicable — C1 exclu du score global (calcul sur C2-C5)</p>}
                        </div>
                        )
                      })}
                    </div>
                  </Card>

                {/* Prédictions d'incidents */}
                {(profilRisque.incident_prediction_3m !== undefined || profilRisque.incident_prediction_6m !== undefined || profilRisque.incident_prediction_12m !== undefined) && (
                  <Card variant="role" icon={<AlertTriangle className="h-4 w-4 text-danger" />} title="Prédiction d'incidents">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-role-primary-soft rounded-xl">
                          <p className="text-xs text-muted-foreground">3 mois</p>
                          <p className="text-xl font-bold text-role-primary">{profilRisque.incident_prediction_3m!}%</p>
                        </div>
                        <div className="p-3 bg-role-primary-soft rounded-xl">
                          <p className="text-xs text-muted-foreground">6 mois</p>
                          <p className="text-xl font-bold text-role-primary">{profilRisque.incident_prediction_6m!}%</p>
                        </div>
                        <div className="p-3 bg-role-primary-soft rounded-xl">
                          <p className="text-xs text-muted-foreground">12 mois</p>
                          <p className="text-xl font-bold text-role-primary">{profilRisque.incident_prediction_12m!}%</p>
                        </div>
                      </div>
                      {profilRisque.ensemble_confidence !== undefined && (
                        <p className="text-xs text-center mt-2 text-muted-foreground">Confiance du modèle: {profilRisque.ensemble_confidence}%</p>
                      )}
                  </Card>
                )}

                {/* AERORISQ */}
                <AerorisqAnalyse aerodromeId={aerodrome.id} />

                {/* Bayésien et black swan */}
                {(profilRisque.bayesian_posterior !== undefined || profilRisque.bayesian_black_swan !== undefined) && (
                  <Card variant="role" icon={<Zap className="h-4 w-4 text-role-primary" />} title="Analyse bayésienne">
                      <div className="grid grid-cols-2 gap-4">
                        {profilRisque.bayesian_posterior !== undefined && (
                          <div className="p-3 bg-role-primary-soft rounded-xl text-center">
                            <p className="text-xs text-muted-foreground">Posterior bayésienne</p>
                            <p className="text-lg font-bold">{profilRisque.bayesian_posterior.toFixed(1)}%</p>
                          </div>
                        )}
                        {profilRisque.bayesian_black_swan !== undefined && (
                          <div className={`p-3 rounded-xl text-center ${profilRisque.bayesian_black_swan ? 'bg-danger-soft animate-pulse' : 'bg-role-primary-soft'}`}>
                            <p className="text-xs text-muted-foreground">Black Swan</p>
                            <p className={`text-lg font-bold ${profilRisque.bayesian_black_swan ? 'text-danger' : ''}`}>
                              {profilRisque.bayesian_black_swan ? '⚠️ Détecté' : 'Aucun'}
                            </p>
                          </div>
                        )}
                      </div>
                  </Card>
                )}

                {/* Scénarios */}
                {profilRisque.scenarios && profilRisque.scenarios.length > 0 && (
                  <Card variant="role" icon={<Sparkles className="h-4 w-4 text-role-primary" />} title="Scénarios">
                      <div className="space-y-2">
                        {profilRisque.scenarios.map((s, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-role-primary-soft">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{s.nom}</p>
                              <p className="text-xs text-muted-foreground">{s.description}</p>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <p className="text-sm font-bold text-role-primary">{s.probabilite.toFixed(0)}%</p>
                              <p className="text-xs text-muted-foreground">{s.scoreProjecte}/100</p>
                            </div>
                          </div>
                        ))}
                      </div>
                  </Card>
                )}

                {/* Stress système */}
                {iaAnalysis?.systemStress && (
                  <Card variant="role" icon={<AlertTriangle className="h-4 w-4 text-warning" />} title={`Stress système: ${iaAnalysis.systemStress.score}%`}>
                      <p className="text-sm text-muted-foreground">{iaAnalysis.systemStress.recommandationAction}</p>
                      {iaAnalysis.systemStress.facteursContributeurs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {iaAnalysis.systemStress.facteursContributeurs.map((f: string, i: number) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">{f}</span>
                          ))}
                        </div>
                      )}
                  </Card>
                )}

                {/* Suggestions IA */}
                {suggestions.length > 0 && (
                  <Card variant="role" icon={<Sparkles className="h-4 w-4 text-role-primary" />} title={`Suggestions IA (${suggestions.length})`}>
                      <div className="space-y-2">
                        {suggestions.map((s: { titre: string; description: string; priorite: string; domaines?: string[]; confiance: number }, idx: number) => (
                          <div key={idx} className={`p-3 rounded-lg border-l-4 ${
                            s.priorite === 'critique' ? 'border-danger bg-danger/5' : 
                            s.priorite === 'haute' ? 'border-warning bg-warning/5' : 
                            'border-role-primary bg-role-primary-soft'
                          }`}>
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-foreground">{s.titre}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                s.priorite === 'critique' ? 'bg-danger text-white' : 
                                s.priorite === 'haute' ? 'bg-warning text-white' : 
                                'bg-role-primary text-white'
                              }`}>{s.priorite}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                            {s.domaines && s.domaines.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {s.domaines.map((d: string) => (
                                  <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-background border border-border">{d}</span>
                                ))}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">Confiance: {s.confiance}%</p>
                          </div>
                        ))}
                      </div>
                  </Card>
                )}

                {/* Black Swans / Signaux faibles */}
                {blackSwans.length > 0 && (
                  <Card variant="role" icon={<AlertOctagon className="h-4 w-4 text-warning" />} title={`Signaux faibles détectés (${blackSwans.length})`}>
                      <div className="space-y-2">
                        {blackSwans.map((bs: { domaine: string; priorProbability: number; posteriorProbability: number; message: string }, idx: number) => (
                          <div key={idx} className="p-2 bg-warning/10 rounded-lg">
                            <p className="text-sm text-warning">{bs.message}</p>
                          </div>
                        ))}
                      </div>
                  </Card>
                )}

                {/* Points de changement détectés */}
                {iaAnalysis?.changePoints && iaAnalysis.changePoints.length > 0 && (
                  <Card variant="role" icon={<TrendingDown className="h-4 w-4 text-warning" />} title="Points de rupture détectés">
                      <div className="space-y-2">
                        {iaAnalysis.changePoints.slice(0, 3).map((cp: { date: string; scoreBefore: number; scoreAfter: number; magnitude: number; direction: string; probableCause: string | null }, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">{new Date(cp.date).toLocaleDateString('fr-FR')}</span>
                            <span className={cp.direction === 'degradation' ? 'text-danger' : 'text-success'}>
                              {cp.direction === 'degradation' ? '▼' : '▲'} {cp.magnitude} pts
                            </span>
                            <span className="text-xs">{cp.scoreBefore} → {cp.scoreAfter}</span>
                          </div>
                        ))}
                      </div>
                  </Card>
                )}
              </>
            ) : !isLoadingIA && (
              <Card variant="role" contentClassName="py-12 text-center">
                  <Gauge className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Aucun profil de risque calculé pour cet aérodrome</p>
                  <button className="btn btn-primary mt-4">Calculer le profil de risque</button>
              </Card>
            )}
          </div>
  );
}

export function OngletTechnique({ aerodrome }: {
  aerodrome: Aerodrome;
}) {
  return (
          <div className="space-y-4 animate-fade-in">

            {/* ── Piste principale (aérodrome & mixte uniquement) ── */}
            {(aerodrome.type_entite === 'aerodrome' || aerodrome.type_entite === 'mixte' || !aerodrome.type_entite) && (
              <div className="grid grid-cols-2 gap-4">
                <Card variant="role" icon={<Ruler className="h-5 w-5 text-role-primary" />} title="Piste principale">
                    {aerodrome.piste_principale && aerodrome.piste_principale.longueur > 0 ? (
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Longueur:</span>
                          <span className="font-medium text-foreground">{aerodrome.piste_principale.longueur} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Largeur:</span>
                          <span className="font-medium text-foreground">{aerodrome.piste_principale.largeur} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Orientation:</span>
                          <span className="font-medium text-foreground">{aerodrome.piste_principale.orientation}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Revêtement:</span>
                          <span className="font-medium text-foreground">{aerodrome.piste_principale.revetement}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">PCR:</span>
                          <span className="font-medium text-foreground">{aerodrome.piste_principale.pcr}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Code référence:</span>
                          <span className="badge neutral">{aerodrome.piste_principale.code_reference}</span>
                        </div>
                        {aerodrome.piste_principale.avion_reference && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avion de référence:</span>
                            <span className="font-medium text-foreground">{aerodrome.piste_principale.avion_reference}</span>
                          </div>
                        )}
                        {aerodrome.piste_principale.type_approche && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type d'approche:</span>
                            <span className="badge neutral capitalize">{aerodrome.piste_principale.type_approche.replace('_', ' ')}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-4">Aucune donnée de piste disponible</p>
                    )}
                </Card>
              </div>
            )}
            {/* ── Séparateur Mixte ── */}
            {aerodrome.type_entite === 'mixte' && (
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 flex items-center gap-1.5">
                  <Navigation className="w-3 h-3" />FATO & TLOF
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* ── Section Hélistation (helistation & mixte) ── */}
            {(aerodrome.type_entite === 'helistation' || aerodrome.type_entite === 'mixte') && (() => {
              const h = (aerodrome as any).helistation as HelistationData | undefined;
              return (
                <div className="space-y-4">
                  {/* Identification */}
                  <Card variant="role" icon={<Navigation className="h-5 w-5 text-role-primary" />} title="Identification FATO / TLOF">
                      <div className="grid grid-cols-2 gap-4">
                        {h?.indicatif_rt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Indicatif R/T:</span>
                            <span className="font-medium text-foreground font-mono">{h.indicatif_rt}</span>
                          </div>
                        )}
                        {h?.identification && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Identification:</span>
                            <span className="font-medium text-foreground">{h.identification}</span>
                          </div>
                        )}
                        {h?.marque_distinctive && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Marque distinctive:</span>
                            <span className="font-medium text-foreground">{h.marque_distinctive}</span>
                          </div>
                        )}
                        {h?.type_installation && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type d'installation:</span>
                            <span className="font-medium text-foreground">
                              {TYPE_INSTALLATION_LABELS[h.type_installation as TypeInstallation] || h.type_installation}
                            </span>
                          </div>
                        )}
                        {h?.date_revision && (
                          <div className="flex justify-between col-span-2">
                            <span className="text-muted-foreground">Date de révision:</span>
                            <span className="font-medium text-foreground">
                              {new Date(h.date_revision).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        )}
                        {!h?.indicatif_rt && !h?.identification && !h?.type_installation && (
                          <p className="text-muted-foreground text-sm col-span-2">Aucune donnée d'identification renseignée</p>
                        )}
                      </div>
                  </Card>

                  {/* Caractéristiques physiques */}
                  <div className="grid grid-cols-2 gap-4">
                  <Card variant="role" icon={<Ruler className="h-5 w-5 text-role-primary" />} title="Caractéristiques physiques" contentClassName="space-y-3">
                        {h?.valeur_d !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Valeur D (FATO):</span>
                            <span className="font-medium text-foreground">{h.valeur_d} m</span>
                          </div>
                        )}
                        {h?.cap !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cap:</span>
                            <span className="font-medium text-foreground">{h.cap}°</span>
                          </div>
                        )}
                        {h?.altitude_ft !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Altitude:</span>
                            <span className="font-medium text-foreground">{h.altitude_ft} ft</span>
                          </div>
                        )}
                        {h?.hauteur_maximale_ft !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Hauteur maximale:</span>
                            <span className="font-medium text-foreground">{h.hauteur_maximale_ft} ft</span>
                          </div>
                        )}
                        {h?.hauteur_obstacle_ft !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Obstacle le plus élevé:</span>
                            <span className="font-medium text-foreground">{h.hauteur_obstacle_ft} ft</span>
                          </div>
                        )}
                        {h?.mtom !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">MTOM:</span>
                            <span className="font-medium text-foreground">{h.mtom} t</span>
                          </div>
                        )}
                        {h?.valeur_d === undefined && h?.cap === undefined && (
                          <p className="text-muted-foreground text-sm">Aucune caractéristique physique renseignée</p>
                        )}
                    </Card>

                    {/* Communications & Équipements */}
                    <Card variant="role" icon={<Radio className="h-5 w-5 text-role-primary" />} title="Communications & Équipements" contentClassName="space-y-3">
                        {h?.moyen_com && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Moyen COM:</span>
                            <span className="font-medium text-foreground">
                              {MOYEN_COM_LABELS[h.moyen_com as MoyenCom] || h.moyen_com}
                            </span>
                          </div>
                        )}
                        {h?.frequence_com && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Fréquence:</span>
                            <span className="font-medium text-foreground font-mono">{h.frequence_com} MHz</span>
                          </div>
                        )}
                        <div className="border-t border-border pt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <Fuel className="h-3.5 w-3.5" />Avitaillement:
                            </span>
                            <span className={`badge ${h?.avitaillement ? 'success' : 'neutral'}`}>
                              {h?.avitaillement ? 'Disponible' : 'Non disponible'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <Zap className="h-3.5 w-3.5" />GPU:
                            </span>
                            <span className={`badge ${h?.gpu ? 'success' : 'neutral'}`}>
                              {h?.gpu ? 'Disponible' : 'Non disponible'}
                            </span>
                          </div>
                        </div>
                        {h?.equipement_incendie && (
                          <div className="border-t border-border pt-3">
                            <p className="text-muted-foreground text-xs uppercase font-semibold flex items-center gap-1.5 mb-1">
                              <Flame className="h-3.5 w-3.5 text-danger" />Équipement incendie
                            </p>
                            <p className="text-sm text-foreground">{h.equipement_incendie}</p>
                          </div>
                        )}
                        {!h?.moyen_com && !h?.frequence_com && h?.avitaillement === undefined && (
                          <p className="text-muted-foreground text-sm">Aucune donnée COM renseignée</p>
                        )}
                    </Card>
                  </div>
                </div>
              );
            })()}

            {/* SSLIA — commun à tous types */}
            <Card variant="role" icon={<Shield className="h-5 w-5 text-role-primary" />} title="SSLIA">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Catégorie:</span>
                    <span className="badge primary">Catégorie {aerodrome.categorie_sslia || 'N/A'}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-small text-muted-foreground">Véhicules et agents à renseigner</p>
                  </div>
                </div>
              </Card>

          </div>
  );
}

export function OngletCertification({ aerodrome }: {
  aerodrome: Aerodrome;
}) {
  return (
          <div className="animate-fade-in">
            <Card variant="role" title={aerodrome.type === 'international' ? 'Certification' : 'Homologation'}>
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Aucun processus en cours</p>
                  <button className="btn btn-link text-role-primary mt-2">
                    {aerodrome.type === 'international' ? 'Lancer la certification' : "Lancer l'homologation"}
                  </button>
                </div>
            </Card>
          </div>
  );
}

export function OngletSurveillances({ data, total, page, onPageChange, pageSize, ecarts }: {
  data: Surveillance[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  ecarts: Ecart[];
}) {
  return (
          <div className="animate-fade-in">
            <DataTable
              data={data}
              columns={[
                { key: 'date', header: 'Date', render: (s: any) => <span>{format(new Date(s.date_debut), 'dd/MM/yyyy')}</span> },
                { key: 'type', header: 'Type', render: (s: any) => <span>{s.type}</span> },
                { key: 'score', header: 'Score', render: (s: any) => s.score_global ? (
                  <div className="flex items-center gap-2">
                    <div className="progress w-16 h-2"><div className="progress-bar" style={{ width: `${s.score_global}%` }} /></div>
                    <span>{s.score_global}%</span>
                  </div>
                ) : <span>N/A</span> },
                { key: 'statut', header: 'Statut', render: (s: any) => (
                  <span className={`badge ${s.statut === 'transmise' ? 'success' : s.statut === 'en_cours' ? 'warning' : 'neutral'}`}>{s.statut}</span>
                ) },
                { key: 'ecarts', header: 'Écarts', render: (s: any) => (
                  <span className="badge danger">{ecarts.filter((e: any) => e.surveillance_id === s.id && e.statut !== 'cloture').length}</span>
                ) },
              ]}
              keyExtractor={(s: any) => s.id}
              emptyState={{ icon: Eye, title: 'Aucune surveillance enregistrée' }}
              pagination={{ total: total, current: page, pageSize: pageSize, onPageChange: onPageChange }}
              cardProps={{ title: 'Historique des surveillances' }}
              headerClassName="bg-role-primary-soft/40"
            />
          </div>
  );
}

export function OngletDocuments({ data, total, page, onPageChange, pageSize }: {
  data: DocumentAerodrome[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
}) {
  return (
          <div className="animate-fade-in">
            <DataTable
              data={data}
              columns={[
                { key: 'titre', header: 'Titre', render: (d: any) => <span className="font-medium">{d.titre}</span> },
                { key: 'type', header: 'Type', render: (d: any) => <span className="badge neutral">{d.type}</span> },
                { key: 'date', header: 'Date', render: (d: any) => <span>{format(new Date(d.date), 'dd/MM/yyyy')}</span> },
                { key: 'uploader', header: 'Uploadé par', render: (d: any) => <span>{d.uploader}</span> },
                { key: 'actions', header: '', render: () => (
                  <button className="action-button"><Download className="h-4 w-4" /></button>
                ) },
              ]}
              keyExtractor={(d: any) => d.id}
              emptyState={{ icon: FileText, title: 'Aucun document disponible' }}
              pagination={{ total: total, current: page, pageSize: pageSize, onPageChange: onPageChange }}
              cardProps={{ title: 'Documents' }}
              headerClassName="bg-role-primary-soft/40"
            />
          </div>
  );
}

export function OngletHistorique({ historique }: {
  historique: HistoriqueEvent[];
}) {
  return (
          <div className="animate-fade-in">
            <Card variant="role" title="Timeline des actions">
                <div className="timeline">
                  {historique.map((event) => (
                    <div key={event.id} className="timeline-item">
                      <div className={`timeline-dot ${event.action.includes('critique') || event.action.includes('Écart') ? 'timeline-dot-danger' : 'timeline-dot-success'}`} />
                      <div className="timeline-content">
                        <div className="timeline-date text-muted-foreground">
                          {format(new Date(event.date), 'dd MMM yyyy HH:mm', { locale: fr })}
                        </div>
                        <div className="timeline-title text-foreground">{event.action}</div>
                        <div className="timeline-description text-muted-foreground">{event.details}</div>
                        <p className="text-xs text-muted-foreground mt-1">Par: {event.utilisateur}</p>
                      </div>
                    </div>
                  ))}
                </div>
            </Card>
          </div>
  );
}

export function OngletAerorisq({ aerodromeId }: {
  aerodromeId: string;
}) {
  return (
          <div className="animate-fade-in space-y-4">
            <AerorisqAnalyse aerodromeId={aerodromeId} />
            <AerorisqDashboard aerodromeId={aerodromeId} />
          </div>
  );
}
