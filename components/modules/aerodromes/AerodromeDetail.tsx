// components/modules/aerodromes/AerodromeDetail.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Plane, MapPin, Ruler, FileText, History, AlertTriangle, CheckCircle, XCircle,
  Download, Eye, Edit3, X, Globe, Phone, Mail, User, Shield, Gauge, TrendingUp, TrendingDown, Minus,
  Sparkles, AlertOctagon, Clock, Target, Zap,
  Radio, Fuel, Weight, Waves, Navigation, CalendarDays, Flame, Building2, Compass, Brain,
} from 'lucide-react';
import type { HelistationData, TypeInstallation, MoyenCom } from '@/lib/types/helistation';
import { TYPE_INSTALLATION_LABELS, MOYEN_COM_LABELS } from '@/lib/types/helistation';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  useAppStore, useProfilRisque, useSurveillancesByAerodrome,
  Aerodrome, Certification, Homologation, ScoreHistoryPoint
} from '@/lib/store';
import { riskAgent } from '@/lib/ia/agents/riskAgent';
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent';

const MiniMap = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] bg-role-primary-soft rounded-xl flex items-center justify-center animate-pulse">
      <MapPin className="h-8 w-8 text-role-primary" />
    </div>
  ),
});

interface AerodromeDetailProps {
  aerodrome: Aerodrome;
  onClose: () => void;
  onEdit: () => void;
  userRole: string;
}

const getStatutBadge = (statut: string) => {
  const variants: Record<string, { class: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
    'actif': { class: 'badge success', icon: CheckCircle, label: 'En service' },
    'brouillon': { class: 'badge neutral', icon: Minus, label: 'Brouillon' },
    'suspendu': { class: 'badge warning', icon: AlertTriangle, label: 'Suspendu' },
    'ferme': { class: 'badge danger', icon: XCircle, label: 'Fermé' },
  };
  const variant = variants[statut] || variants['brouillon'];
  const Icon = variant.icon;
  return <span className={`${variant.class} inline-flex items-center gap-1`}><Icon className="h-3 w-3" />{variant.label}</span>;
};

const getTypeBadge = (type: string) => {
  return type === 'international' ? (
    <span className="badge primary inline-flex items-center gap-1"><Globe className="h-3 w-3" />International</span>
  ) : <span className="badge teal">National</span>;
};

const getTypeEntiteBadge = (typeEntite?: string) => {
  switch (typeEntite) {
    case 'helistation': return <span className="badge warning inline-flex items-center gap-1">🚁 Hélistation</span>;
    case 'mixte':       return <span className="badge purple  inline-flex items-center gap-1">✈🚁 Mixte</span>;
    default:            return <span className="badge neutral inline-flex items-center gap-1">✈ Aérodrome</span>;
  }
};

const getNiveauRisqueBadge = (niveau?: string, score?: number) => {
  if (!niveau || !score) return <span className="badge neutral">N/A</span>;
  const variants: Record<string, { class: string; icon: React.ComponentType<{ className?: string }> }> = {
    faible: { class: 'risk-badge faible', icon: CheckCircle },
    moyen: { class: 'risk-badge moyen', icon: Shield },
    eleve: { class: 'risk-badge eleve', icon: AlertTriangle },
    critique: { class: 'risk-badge critique', icon: AlertTriangle },
  };
  const variant = variants[niveau] || variants['modere'];
  const Icon = variant.icon;
  return <span className={`${variant.class} inline-flex items-center gap-1`}><Icon className="h-3 w-3" />{niveau.charAt(0).toUpperCase() + niveau.slice(1)} ({score}%)</span>;
};

const getRiskProgressClass = (niveau: string) => {
  switch(niveau) {
    case 'faible': return 'progress-faible';
    case 'moyen': return 'progress-moyen';
    case 'eleve': return 'progress-eleve';
    case 'critique': return 'progress-critique';
    default: return '';
  }
};

function toDMS(lat: number, lon: number): string {
  const f = (v: number, isLat: boolean) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (((a - d) * 60 - m) * 60).toFixed(1);
    return `${d}°${m}'${s}"${isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')}`;
  };
  return `${f(lat, true)} ${f(lon, false)}`;
}

const getTendanceIcon = (tendance?: string) => {
  switch (tendance) {
    case 'hausse': return <TrendingUp className="h-4 w-4 text-success" />;
    case 'baisse': return <TrendingDown className="h-4 w-4 text-danger" />;
    default: return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
};

const SGS_LABELS: Record<number, string> = { 1: 'Absent', 2: 'Présent', 3: 'Approprié', 4: 'Opérationnel', 5: 'Efficace' };
const SGS_CLASSES: Record<number, string> = { 1: 'badge danger', 2: 'badge warning', 3: 'badge primary', 4: 'badge success', 5: 'badge success' };
const getSgsNiveau = (score: number): number => {
  if (!score) return 1;
  if (score <= 20) return 1;
  if (score <= 40) return 2;
  if (score <= 60) return 3;
  if (score <= 80) return 4;
  return 5;
};

export default function AerodromeDetail({ aerodrome, onClose, onEdit, userRole }: AerodromeDetailProps) {
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const historiqueScores = useAppStore(s => s.historiqueScores)
  const getProfilRisque = useAppStore(s => s.getProfilRisque)
  const setProfilRisque = useAppStore(s => s.setProfilRisque)
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome);
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const codesAcces = useAppStore(s => s.codesAcces)
  
  const profilRisque = getProfilRisque(aerodrome.id);
  const surveillancesAerodrome = surveillances.filter(s => s.aerodrome_id === aerodrome.id);
  const ecartsCount = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut !== 'cloture').length;
  const historiqueScoresAerodrome = getHistoricalScoresForAerodrome?.(aerodrome.id) || [];
  
  const personnelAerodrome = useMemo(() => {
    return utilisateurs.filter(u => u.aerodrome_id === aerodrome.id && ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role))
  }, [utilisateurs, aerodrome.id])

  const codesActifsAerodrome = useMemo(() => {
    return codesAcces.filter(c => c.aerodrome_id === aerodrome.id && c.statut === 'actif')
  }, [codesAcces, aerodrome.id])
  
  const [activeTab, setActiveTab] = useState('info');
  const [iaAnalysis, setIaAnalysis] = useState<RiskAnalysisResult | null>(null);
  const [isLoadingIA, setIsLoadingIA] = useState(false);

  // Charger l'analyse IA
  useEffect(() => {
    let cancelled = false
    const loadIAnalysis = async () => {
      setIsLoadingIA(true);
      try {
        const analysis = await riskAgent.analyzeRisk({
          aerodromeId: aerodrome.id,
          includePredictions: true,
          includeBlackSwan: true,
          includeSuggestions: true
        }, {});
        if (!cancelled) setIaAnalysis(analysis);
      } catch (error) {
        if (!cancelled) console.error('[AerodromeDetail] Erreur chargement IA:', error);
      } finally {
        if (!cancelled) setIsLoadingIA(false);
      }
    };
    loadIAnalysis();
    return () => { cancelled = true; };
  }, [aerodrome.id]);

  // Auto-initialisation du profil risque si absent (création hors formulaire ou erreur)
  useEffect(() => {
    if (profilRisque) return;
    (async () => {
      try {
        const { calculerProfilInitial } = await import('@/lib/risque/initialProfile');
        const profil = calculerProfilInitial(aerodrome);
        await setProfilRisque(aerodrome.id, profil.profil);
      } catch (err) {
        console.error('[AerodromeDetail] Échec init profil risque:', err);
      }
    })();
  }, [aerodrome.id, profilRisque, setProfilRisque, aerodrome]);

  // Données réelles depuis le store
  const realDocuments = useMemo(() => {
    const docs: Array<{ id: string; titre: string; type: string; date: string; uploader: string }> = [];
    certifications?.forEach((c: Certification) => {
      if (c.aerodrome_id === aerodrome.id) {
        docs.push({ id: c.id, titre: `Certificat Aérodrome ${c.reference}`, type: 'PDF', date: c.created_at, uploader: 'ANACIM' });
      }
    });
    homologations?.forEach((h: Homologation) => {
      if (h.aerodrome_id === aerodrome.id) {
        docs.push({ id: h.id, titre: `Décision Homologation ${h.reference}`, type: 'PDF', date: h.created_at, uploader: 'ANACIM' });
      }
    });
    surveillancesAerodrome.forEach(s => {
      docs.push({ id: s.id, titre: `Rapport Surveillance ${s.type}`, type: 'PDF', date: s.created_at, uploader: s.created_by || 'ANACIM' });
    });
    return docs;
  }, [aerodrome.id, certifications, homologations, surveillancesAerodrome]);

  const realHistorique = useMemo(() => {
    const events: Array<{ id: string; date: string; action: string; utilisateur: string; details: string }> = [];
    surveillancesAerodrome.forEach(s => {
      events.push({ id: s.id, date: s.created_at, action: 'Surveillance', utilisateur: s.created_by || 'Système', details: `${s.type} - ${(s as { objectifs?: string }).objectifs?.substring(0, 50) || ''}...` });
    });
    ecarts.filter(e => e.aerodrome_id === aerodrome.id).forEach(e => {
      events.push({ id: e.id, date: e.created_at, action: `Écart ${e.niveau_risque}`, utilisateur: 'Système', details: e.libelle?.substring(0, 50) || '' });
    });
    historiqueScoresAerodrome.forEach((h: ScoreHistoryPoint, idx: number) => {
      events.push({ id: `hist-${idx}`, date: h.date, action: 'Mise à jour score', utilisateur: 'Système', details: `Score: ${h.score}/100` });
    });
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [aerodrome.id, surveillancesAerodrome, ecarts, historiqueScoresAerodrome]);

  const predictions = iaAnalysis?.predictions;
  const suggestions = iaAnalysis?.suggestions || [];
  const proactiveAlert = iaAnalysis?.proactiveAlert;
  const velocityMetrics = iaAnalysis?.velocityMetrics;
  const blackSwans = iaAnalysis?.blackSwans || [];
  const survival = iaAnalysis?.survival;
  const extremeValue = iaAnalysis?.extremeValue;
  const hiddenMarkov = iaAnalysis?.hiddenMarkov;

  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary" data-role={userRole}>
      {/* En-tête */}
      <div className="modal-header border-b border-border bg-role-primary-soft">
        <div className="flex items-center gap-4 flex-1">
          <div className="detail-header-icon">
            {/* Icône dynamique selon la nature de l'infrastructure */}
            {aerodrome.type_entite === 'helistation'
              ? <span style={{ fontSize: '2rem', lineHeight: 1 }}>🚁</span>
              : aerodrome.type_entite === 'mixte'
                ? <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>✈🚁</span>
                : <Plane className="h-8 w-8 text-role-primary" />
            }
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="heading-2 text-foreground">{aerodrome.nom}</h2>
              <span className="code-oaci-badge">{aerodrome.code_oaci}</span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {getTypeBadge(aerodrome.type)}
              {getTypeEntiteBadge(aerodrome.type_entite)}
              {getStatutBadge(aerodrome.statut)}
              {profilRisque && getNiveauRisqueBadge(profilRisque.niveau, profilRisque.score_global)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="btn btn-secondary gap-2">
            <X className="h-4 w-4" />Fermer
          </button>
          <button onClick={onEdit} className="btn btn-primary gap-2">
            <Edit3 className="h-4 w-4" />Modifier
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs border-b border-border px-6 pt-4 bg-background">
        {[
          { id: 'info', label: 'Infos', icon: Plane },
          { id: 'risque', label: 'Profil Risque', icon: Gauge },
          { id: 'technique', label: 'Technique', icon: Ruler },
          { id: 'certification', label: 'Cert/Homo', icon: Shield },
          { id: 'surveillances', label: 'Surveillances', icon: Eye },
          { id: 'documents', label: 'Documents', icon: FileText },
          { id: 'historique', label: 'Historique', icon: History }
        ].map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab py-2 px-4 ${activeTab === tab.id ? 'border-b-2 border-role-primary text-role-primary font-semibold' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon className="h-4 w-4 inline mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="modal-body bg-background">
        {/* ==================== ONGLET INFOS ==================== */}
        {activeTab === 'info' && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-3 gap-4">
              <div className="card col-span-2 bg-background border-border border-l-4 border-l-role-primary">
                <div className="card-header border-b border-border">
                  <div className="card-title text-foreground">Informations générales</div>
                </div>
                <div className="card-content">
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
                      <div className="mt-0.5">{getTypeEntiteBadge(aerodrome.type_entite)}</div>
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
                      <span className={`${SGS_CLASSES[getSgsNiveau(aerodrome.maturite_sgs)]}`}>
                        N{getSgsNiveau(aerodrome.maturite_sgs)} — {SGS_LABELS[getSgsNiveau(aerodrome.maturite_sgs)]}
                      </span>
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
                      <span className="badge primary">{surveillancesAerodrome.length}</span>
                    </div>
                    <div>
                      <label className="text-role-primary text-xs uppercase font-semibold">Dernière mise à jour</label>
                      <p className="text-small text-foreground">
                        {aerodrome.updated_at ? format(new Date(aerodrome.updated_at), 'dd MMM yyyy', { locale: fr }) : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card bg-background border-border border-l-4 border-l-role-primary">
                <div className="card-header border-b border-border">
                  <div className="card-title text-foreground">Localisation</div>
                </div>
                <div className="card-content p-0">
                  <div className="h-[200px] rounded-b-xl overflow-hidden">
                    <MiniMap
                      latitude={aerodrome.lat || 14.7167}
                      longitude={aerodrome.lon || -17.4677}
                      onPositionChange={() => {}}
                    />
                  </div>
                </div>
              </div>
            </div>

            {(aerodrome.exploitant_nom || aerodrome.exploitant_adresse || aerodrome.exploitant_telephone) && (
              <div className="card bg-background border-border border-l-4 border-l-role-primary">
                <div className="card-header border-b border-border">
                  <div className="card-title text-foreground">Exploitant</div>
                </div>
                <div className="card-content">
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
                </div>
              </div>
            )}

            {personnelAerodrome.length > 0 && (
              <div className="card bg-background border-border border-l-4 border-l-warning">
                <div className="card-header border-b border-border">
                  <div className="card-title text-foreground">Personnel Exploitant</div>
                  <span className="badge warning">{personnelAerodrome.length}</span>
                </div>
                <div className="card-content">
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
                </div>
              </div>
            )}

            {codesActifsAerodrome.length > 0 && (codesActifsAerodrome.some(c => c.dg_prenom || c.dg_nom || c.focal_prenom || c.focal_nom)) && (
              <div className="card bg-background border-border border-l-4 border-l-success">
                <div className="card-header border-b border-border">
                  <div className="card-title text-foreground">Responsables avec accès</div>
                  <span className="badge success">Codes actifs</span>
                </div>
                <div className="card-content">
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
                </div>
              </div>
            )}

            {aerodrome.contacts && aerodrome.contacts.length > 0 && (
              <div className="card bg-background border-border border-l-4 border-l-role-primary">
                <div className="card-header border-b border-border">
                  <div className="card-title text-foreground">Contacts</div>
                </div>
                <div className="card-content">
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
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== ONGLET RISQUE AVEC IA ==================== */}
        {activeTab === 'risque' && (
          <div className="space-y-4 animate-fade-in">
            {isLoadingIA && (
              <div className="text-center py-8">
                <div className="spinner mx-auto mb-4" />
                <p className="text-muted-foreground">Analyse IA en cours...</p>
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
                  <div className="card col-span-1 bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-content p-4 text-center">
                      <p className="text-small text-muted-foreground">Score global</p>
                      <div className={`risk-badge ${profilRisque.niveau} text-lg px-3 py-1 inline-block mt-1`}>
                        {profilRisque.score_global}%
                      </div>
                      <div className={`progress h-2 mt-3 ${getRiskProgressClass(profilRisque.niveau)}`}>
                        <div className="progress-bar" style={{ width: `${profilRisque.score_global}%` }} />
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-2">
                        {getTendanceIcon(profilRisque.tendance)}
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
                    </div>
                  </div>

                  <div className="card col-span-3 bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header pb-2 border-b border-border">
                      <div className="card-title text-base text-foreground flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-role-primary" />
                        Prédictions IA
                      </div>
                    </div>
                    <div className="card-content">
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
                    </div>
                  </div>
                </div>

                {/* Modèles avancés (survival, HMM, EVT) */}
                {(survival || hiddenMarkov || extremeValue) && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border bg-role-primary-soft">
                      <div className="card-title text-sm flex items-center gap-2">
                        <Brain className="w-4 h-4 text-role-primary" />
                        Modèles avancés
                      </div>
                    </div>
                    <div className="card-content p-3 space-y-2">
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
                    </div>
                  </div>
                )}

                {/* Métriques Hawkes (contagion) */}
                {iaAnalysis?.hawkesRisk && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-base text-foreground flex items-center gap-2">
                        <Zap className="h-4 w-4 text-warning" />
                        Risque de contagion (Hawkes)
                      </div>
                    </div>
                    <div className="card-content">
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
                    </div>
                  </div>
                )}

                {/* Détail des critères C1-C5 */}
                <div className="card bg-background border-border border-l-4 border-l-role-primary">
                  <div className="card-header border-b border-border">
                    <div className="card-title text-foreground">Détail des critères</div>
                  </div>
                  <div className="card-content">
                    <div className="space-y-3">
                      {[
                        { key: 'c1', label: 'C1 - Maturité & Culture SGS', value: profilRisque.c1 },
                        { key: 'c2', label: 'C2 - Efficacité & Réactivité', value: profilRisque.c2 },
                        { key: 'c3', label: 'C3 - Conformité Technique', value: profilRisque.c3 },
                        { key: 'c4', label: 'C4 - Charge Critique Non Résolue', value: profilRisque.c4 },
                        { key: 'c5', label: 'C5 - Résilience & Historique Sécurité', value: profilRisque.c5 },
                      ].map((critere) => (
                        <div key={critere.key}>
                          <div className="flex items-center justify-between text-small mb-1">
                            <span className="text-foreground">{critere.label}</span>
                            <span className="font-medium text-foreground">{critere.value || 0}/100</span>
                          </div>
                          <div className="progress h-2">
                            <div className="progress-bar" style={{ width: `${critere.value || 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Prédictions d'incidents */}
                {(profilRisque.incident_prediction_3m !== undefined || profilRisque.incident_prediction_6m !== undefined || profilRisque.incident_prediction_12m !== undefined) && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-danger" />
                        Prédiction d'incidents
                      </div>
                    </div>
                    <div className="card-content">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-role-primary-soft rounded-xl">
                          <p className="text-xs text-muted-foreground">3 mois</p>
                          <p className="text-xl font-bold text-role-primary">{(profilRisque.incident_prediction_3m! * 100).toFixed(0)}%</p>
                        </div>
                        <div className="p-3 bg-role-primary-soft rounded-xl">
                          <p className="text-xs text-muted-foreground">6 mois</p>
                          <p className="text-xl font-bold text-role-primary">{(profilRisque.incident_prediction_6m! * 100).toFixed(0)}%</p>
                        </div>
                        <div className="p-3 bg-role-primary-soft rounded-xl">
                          <p className="text-xs text-muted-foreground">12 mois</p>
                          <p className="text-xl font-bold text-role-primary">{(profilRisque.incident_prediction_12m! * 100).toFixed(0)}%</p>
                        </div>
                      </div>
                      {profilRisque.ensemble_confidence !== undefined && (
                        <p className="text-xs text-center mt-2 text-muted-foreground">Confiance du modèle: {(profilRisque.ensemble_confidence * 100).toFixed(0)}%</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Bayésien et black swan */}
                {(profilRisque.bayesian_posterior !== undefined || profilRisque.bayesian_black_swan !== undefined) && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-base flex items-center gap-2">
                        <Zap className="h-4 w-4 text-role-primary" />
                        Analyse bayésienne
                      </div>
                    </div>
                    <div className="card-content">
                      <div className="grid grid-cols-2 gap-4">
                        {profilRisque.bayesian_posterior !== undefined && (
                          <div className="p-3 bg-role-primary-soft rounded-xl text-center">
                            <p className="text-xs text-muted-foreground">Posterior bayésienne</p>
                            <p className="text-lg font-bold">{(profilRisque.bayesian_posterior * 100).toFixed(1)}%</p>
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
                    </div>
                  </div>
                )}

                {/* Scénarios */}
                {profilRisque.scenarios && profilRisque.scenarios.length > 0 && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-role-primary" />
                        Scénarios
                      </div>
                    </div>
                    <div className="card-content">
                      <div className="space-y-2">
                        {profilRisque.scenarios.map((s, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-role-primary-soft">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{s.nom}</p>
                              <p className="text-xs text-muted-foreground">{s.description}</p>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <p className="text-sm font-bold text-role-primary">{(s.probabilite * 100).toFixed(0)}%</p>
                              <p className="text-xs text-muted-foreground">{s.scoreProjecte}/100</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stress système */}
                {iaAnalysis?.systemStress && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-base text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        Stress système: {iaAnalysis.systemStress.score}%
                      </div>
                    </div>
                    <div className="card-content">
                      <p className="text-sm text-muted-foreground">{iaAnalysis.systemStress.recommandationAction}</p>
                      {iaAnalysis.systemStress.facteursContributeurs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {iaAnalysis.systemStress.facteursContributeurs.map((f: string, i: number) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">{f}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Suggestions IA */}
                {suggestions.length > 0 && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-foreground flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-role-primary" />
                        Suggestions IA ({suggestions.length})
                      </div>
                    </div>
                    <div className="card-content">
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
                    </div>
                  </div>
                )}

                {/* Black Swans / Signaux faibles */}
                {blackSwans.length > 0 && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-foreground flex items-center gap-2">
                        <AlertOctagon className="h-4 w-4 text-warning" />
                        Signaux faibles détectés ({blackSwans.length})
                      </div>
                    </div>
                    <div className="card-content">
                      <div className="space-y-2">
                        {blackSwans.map((bs: { domaine: string; priorProbability: number; posteriorProbability: number; message: string }, idx: number) => (
                          <div key={idx} className="p-2 bg-warning/10 rounded-lg">
                            <p className="text-sm text-warning">{bs.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Points de changement détectés */}
                {iaAnalysis?.changePoints && iaAnalysis.changePoints.length > 0 && (
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title text-base text-foreground flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-warning" />
                        Points de rupture détectés
                      </div>
                    </div>
                    <div className="card-content">
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
                    </div>
                  </div>
                )}
              </>
            ) : !isLoadingIA && (
              <div className="card bg-background border-border border-l-4 border-l-role-primary">
                <div className="card-content py-12 text-center">
                  <Gauge className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Aucun profil de risque calculé pour cet aérodrome</p>
                  <button className="btn btn-primary mt-4">Calculer le profil de risque</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== ONGLET TECHNIQUE ==================== */}
        {activeTab === 'technique' && (
          <div className="space-y-4 animate-fade-in">

            {/* ── Piste principale (aérodrome & mixte uniquement) ── */}
            {(aerodrome.type_entite === 'aerodrome' || aerodrome.type_entite === 'mixte' || !aerodrome.type_entite) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="card bg-background border-border border-l-4 border-l-role-primary">
                  <div className="card-header border-b border-border">
                    <div className="card-title flex items-center gap-2 text-foreground">
                      <Ruler className="h-5 w-5 text-role-primary" />
                      Piste principale
                    </div>
                  </div>
                  <div className="card-content">
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
                  </div>
                </div>

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
                  <div className="card bg-background border-border border-l-4 border-l-role-primary">
                    <div className="card-header border-b border-border">
                      <div className="card-title flex items-center gap-2 text-foreground">
                        <Navigation className="h-5 w-5 text-role-primary" />
                        Identification FATO / TLOF
                      </div>
                    </div>
                    <div className="card-content">
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
                    </div>
                  </div>

                  {/* Caractéristiques physiques */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="card bg-background border-border border-l-4 border-l-role-primary">
                      <div className="card-header border-b border-border">
                        <div className="card-title flex items-center gap-2 text-foreground">
                          <Ruler className="h-5 w-5 text-role-primary" />
                          Caractéristiques physiques
                        </div>
                      </div>
                      <div className="card-content space-y-3">
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
                      </div>
                    </div>

                    {/* Communications & Équipements */}
                    <div className="card bg-background border-border border-l-4 border-l-role-primary">
                      <div className="card-header border-b border-border">
                        <div className="card-title flex items-center gap-2 text-foreground">
                          <Radio className="h-5 w-5 text-role-primary" />
                          Communications & Équipements
                        </div>
                      </div>
                      <div className="card-content space-y-3">
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
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* SSLIA — commun à tous types */}
            <div className="card bg-background border-border border-l-4 border-l-role-primary">
              <div className="card-header border-b border-border">
                <div className="card-title flex items-center gap-2 text-foreground">
                  <Shield className="h-5 w-5 text-role-primary" />
                  SSLIA
                </div>
              </div>
              <div className="card-content">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Catégorie:</span>
                    <span className="badge primary">Catégorie {aerodrome.categorie_sslia || 'N/A'}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-small text-muted-foreground">Véhicules et agents à renseigner</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ==================== ONGLET CERTIFICATION/HOMOLOGATION ==================== */}
        {activeTab === 'certification' && (
          <div className="animate-fade-in">
            <div className="card bg-background border-border border-l-4 border-l-role-primary">
              <div className="card-header border-b border-border">
                <div className="card-title text-foreground">
                  {aerodrome.type === 'international' ? 'Certification' : 'Homologation'}
                </div>
              </div>
              <div className="card-content">
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Aucun processus en cours</p>
                  <button className="btn btn-link text-role-primary mt-2">
                    {aerodrome.type === 'international' ? 'Lancer la certification' : "Lancer l'homologation"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ONGLET SURVEILLANCES ==================== */}
        {activeTab === 'surveillances' && (
          <div className="animate-fade-in">
            <div className="card bg-background border-border border-l-4 border-l-role-primary">
              <div className="card-header border-b border-border">
                <div className="card-title text-foreground">Historique des surveillances</div>
              </div>
              <div className="card-content">
                {surveillancesAerodrome.length > 0 ? (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-muted-foreground">Date</th>
                          <th className="text-muted-foreground">Type</th>
                          <th className="text-muted-foreground">Score</th>
                          <th className="text-muted-foreground">Statut</th>
                          <th className="text-muted-foreground">Écarts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {surveillancesAerodrome.map((surv) => (
                          <tr key={surv.id} className="border-b border-border">
                            <td className="text-foreground">{format(new Date(surv.date_debut), 'dd/MM/yyyy')}</td>
                            <td className="text-foreground">{surv.type}</td>
                            <td>
                              {surv.score_global ? (
                                <div className="flex items-center gap-2">
                                  <div className="progress w-16 h-2">
                                    <div className="progress-bar" style={{ width: `${surv.score_global}%` }} />
                                  </div>
                                  <span>{surv.score_global}%</span>
                                </div>
                              ) : 'N/A'}
                            </td>
                            <td>
                              <span className={`badge ${
                                surv.statut === 'transmise' ? 'success' :
                                surv.statut === 'en_cours' ? 'warning' : 'neutral'
                              }`}>{surv.statut}</span>
                            </td>
                            <td>
                              <span className="badge danger">
                                {ecarts.filter(e => e.surveillance_id === surv.id && e.statut !== 'cloture').length}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Aucune surveillance enregistrée</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== ONGLET DOCUMENTS ==================== */}
        {activeTab === 'documents' && (
          <div className="animate-fade-in">
            <div className="card bg-background border-border border-l-4 border-l-role-primary">
              <div className="card-header flex flex-row items-center justify-between border-b border-border">
                <div className="card-title text-foreground">Documents</div>
              </div>
              <div className="card-content">
                {realDocuments.length > 0 ? (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-muted-foreground">Titre</th>
                          <th className="text-muted-foreground">Type</th>
                          <th className="text-muted-foreground">Date</th>
                          <th className="text-muted-foreground">Uploadé par</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {realDocuments.map((doc) => (
                          <tr key={doc.id} className="border-b border-border">
                            <td className="font-medium text-foreground">{doc.titre}</td>
                            <td><span className="badge neutral">{doc.type}</span></td>
                            <td className="text-foreground">{format(new Date(doc.date), 'dd/MM/yyyy')}</td>
                            <td className="text-foreground">{doc.uploader}</td>
                            <td>
                              <button className="action-button">
                                <Download className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Aucun document disponible</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== ONGLET HISTORIQUE ==================== */}
        {activeTab === 'historique' && (
          <div className="animate-fade-in">
            <div className="card bg-background border-border border-l-4 border-l-role-primary">
              <div className="card-header border-b border-border">
                <div className="card-title text-foreground">Timeline des actions</div>
              </div>
              <div className="card-content">
                <div className="timeline">
                  {realHistorique.map((event) => (
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}