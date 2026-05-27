// components/modules/planning/PlanningModule.tsx
// VERSION FINALE CORRIGÉE
// ✅ Suppression des fonctions dupliquées getFrequenceSuggerer et getTypeSuggerer
// ✅ Utilisation de computeFinalFrequency et suggestMissionType depuis risque.ts
// ✅ Ajout du feedback utilisateur pour l'apprentissage
// ✅ Correction de handleLancer (position du feedback)
// ✅ Déplacement de enregistrerFeedbackPlanning dans le composant
// ✅ Refonte de PreparationModal avec les classes CSS globales (.tabs, .tab, .tab-content)
// 0 style inline, 0 fetch direct

'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { FormShell } from '@/components/ui/FormShell';
import { useOptimizedStore, useGlobalTransition, useGlobalDebounce } from '@/lib/performance/globalOptimizer';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore, Planning, Aerodrome, ProfilRisque, Competence, Surveillance, Utilisateur, Ecart } from '@/lib/store';
import { getProcessusActifs } from '@/lib/processus';
import {
  CalendarDays,
  List,
  LayoutGrid,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Download,
  Activity,
  Users,
  Briefcase,
  TrendingUp,
  Search,
  Eye,
  PenSquare,
  Trash2,
  AlertTriangle,
  TrendingDown,
  Shield,
  Target,
  Info,
  PlayCircle,
  FileText,
  MapPin,
  Brain,
  Loader2,
  Send,
  Sparkles,
  HistoryIcon,
  ClipboardList,
  Save,
  UserCheck,
  XCircle,
  ChevronRight,
} from 'lucide-react';

import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';

// Store
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { DOMAINES_SURVEILLANCE, getDomaineLabel, expandDomaines, genererSuggestionsMaintien, type SuggestionMaintien } from '@/lib/domaines';

// Composants du module
import { PlanningCalendarView } from './PlanningCalendarView';
import PlanningGanttView from './PlanningGanttView';
import PlanningForm from '@/components/forms/PlanningForm';
import { WorkloadView } from './WorkloadView';
import { SmartAssignment } from './SmartAssignment';
import { PlanningNPlus1 } from './PlanningNPlus1';
import { PlanningCard } from '@/components/cards/PlanningCard';
import { learningEngine } from '@/lib/learningEngine';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { kitDocAgent, toDomaineChecklistArray } from '@/lib/ia/agents/kitDocAgent';

// Import des fonctions risque
import { 
  RISK_LEVELS, 
  getRiskLevel, 
  computeVelocityMetrics, 
  computeProactiveAlert, 
  computeFinalFrequency,
  genererPlanningN1
} from '@/lib/risque';
import { riskEngine, getEcartTriggers, type EcartTrigger } from '@/lib/riskEngine';
import { SuggestionFeedback } from '@/lib/store';
import { suggestionMLAgent, extractFeatures } from '@/lib/ia/agents/suggestionMLAgent';

const getSurveillanceBadge = (statut: string) => {
  const labels: Record<string, string> = {
    'planifiee': 'Planifié',
    'en_cours': 'En cours',
    'checklist_signee': 'Checklist signée',
    'ecarts_signes': 'Écarts signés',
    'rapport_signe': 'Rapport signé',
    'lettre_signee': 'Lettre signée',
    'transmise': 'Exécuté avec succès',
    'archivee': 'Archivée'
  };
  const classes: Record<string, string> = {
    'planifiee': 'outline',
    'en_cours': 'warning',
    'checklist_signee': 'primary',
    'ecarts_signes': 'primary',
    'rapport_signe': 'success',
    'lettre_signee': 'success',
    'transmise': 'success',
    'archivee': 'neutral'
  };
  return { label: labels[statut] || statut, cls: classes[statut] || 'neutral' };
};

interface AerodromeRisque extends Aerodrome {
  niveauAlerte: string | null;
  suggestion: string | null;
  profilScore: number;
  profilTendance: string;
  decisionSurveillance: {
    type: string;
    raison: string;
    priorite: string;
    delaiRecommandation: number;
    domainesCibles: string[];
    typesChecklist: string[];
  };
  frequenceSuggestion: { frequence: number; label: string; justification: string };
  nbEcartsCritiques: number;
  aDesExemptions: boolean;
  aDesMesuresEnRetard: boolean;
  domainesCritiques: { domaine: string; code: string; seuil: number; group: string | null; score: number }[];
  ecartTriggers: EcartTrigger[];
  nbTriggersCritiques: number;
  nbTriggersHautes: number;
  hasPacAccepteEnAttente: boolean;
  suggestionsMaintien: Array<{ domaines: string[]; typesChecklist: string[]; raison: string; source: string; confiance: number }>;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

type ViewMode = 'list' | 'calendar' | 'gantt' | 'workload' | 'assignment' | 'nplus1';

interface PlanningModuleProps {
  userRole: string;
  setActiveModule?: (module: string) => void;
}

function formatNumber(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '0.00';
  return value.toFixed(digits);
}

// ─────────────────────────────────────────────────────────────
// PRÉPARATION MODAL — composant de premier niveau (hors PlanningModule)
// Obligatoire : ses hooks doivent être isolés de ceux du parent.
// ─────────────────────────────────────────────────────────────

interface PreparationModalProps {
  planning: Planning | null;
  open: boolean;
  onClose: () => void;
  userRole: string;
}

function PreparationModal({ planning, open, onClose, userRole }: PreparationModalProps) {
  const router = useRouter();

  // Store — lecture directe, pas via closure parent
  const aerodromes     = useOptimizedStore(s => s.aerodromes);
  const profilsRisque  = useOptimizedStore(s => s.profilsRisque);
  const surveillances  = useOptimizedStore(s => s.surveillances);
  const utilisateurs   = useOptimizedStore(s => s.utilisateurs);
  const ecarts         = useOptimizedStore(s => s.ecarts);
  const user           = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);

  // Hooks d'état — TOUJOURS avant tout return conditionnel
  const [activeTab, setActiveTab] = useState<'profil' | 'historique' | 'checklist' | 'delegation'>('profil');
  const [delegations, setDelegations] = useState<Record<string, string>>({});

  const aerodromesActifs = useMemo(() => aerodromes.filter(a => !a.deleted_at), [aerodromes]);

  const domainesList = useMemo(() => {
    if (!planning) return [];
    if (planning.portee && planning.portee.length > 0) {
      return planning.portee.map(code => ({ code, label: getDomaineLabel(code) }));
    }
    return DOMAINES_SURVEILLANCE.filter(d => d.code !== 'AGA').map(d => ({ code: d.code, label: d.label }));
  }, [planning?.portee]);

  // ── Early return APRÈS tous les hooks ──────────────────────
  if (!open || !planning) return null;

  const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id)
                 ?? aerodromes.find(a => a.id === planning.aerodrome_id);
  const profil = profilsRisque[planning.aerodrome_id];

  const nbEcartsCritiques = ecarts.filter(
    e => e.aerodrome_id === planning.aerodrome_id
      && e.niveau_risque === 'critique'
      && e.statut !== 'cloture'
  ).length;

  const surveillancesPrecedentes = surveillances
    .filter(s => s.aerodrome_id === planning.aerodrome_id)
    .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
    .slice(0, 3);

  const inspecteursDisponibles = utilisateurs.filter(u => u.role === 'inspector' && u.statut !== 'inactif');

  const detectChecklistType = (): 'standard' | 'suivi' | 'pac' | 'mixte' => {
    const ecartsActifs = ecarts.filter(e => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture');
    const aDesEcarts = ecartsActifs.length > 0;
    const aDesPac = ecartsActifs.some(e => e.pac);
    if (aDesEcarts && aDesPac) return 'mixte';
    if (aDesPac) return 'pac';
    if (aDesEcarts) return 'suivi';
    return 'standard';
  };

  const checklistType = detectChecklistType();

  const getTypeLabel = () => {
    switch (checklistType) {
      case 'mixte': return 'Checklist MIXTE (Standard + Écarts + PAC)';
      case 'suivi': return 'Checklist SUIVI DES ÉCARTS';
      case 'pac':   return 'Checklist MISE EN ŒUVRE PAC';
      default:      return 'Checklist STANDARD';
    }
  };

  const getProfilColor = () => {
    if (!profil) return 'text-gray-500';
    if (profil.score_global < 30) return 'text-danger';
    if (profil.score_global < 60) return 'text-warning';
    return 'text-success';
  };

  const getTendanceIcon = () => {
    if (!profil) return null;
    if (profil.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />;
    if (profil.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger" />;
    return null;
  };

  const getTypeIcon = () => {
    switch (checklistType) {
      case 'mixte': return <LayoutGrid className="w-5 h-5" />;
      case 'suivi': return <AlertTriangle className="w-5 h-5" />;
      case 'pac':   return <CheckCircle2 className="w-5 h-5" />;
      default:      return <ClipboardList className="w-5 h-5" />;
    }
  };

  const handleSaveDelegations = () => {
    const nbDelegations = Object.keys(delegations).filter(d => delegations[d]).length;
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Délégations enregistrées',
      message: `${nbDelegations} domaine(s) assigné(s) - La checklist s'ouvrira avec cette répartition`,
      canal: 'in_app',
    });
  };

  const handlePrefillChecklist = () => {
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Pré-remplissage',
      message: "La checklist sera pré-remplie avec les données historiques à l'ouverture",
      canal: 'in_app',
    });
  };

  const handleOpenChecklist = () => {
    onClose();
    const portee = planning.portee || [];
    const isSgsOnly = portee.length === 1 && portee[0] === 'SGS';

    if (isSgsOnly) {
      router.push(`/preparation-checklist/${planning.id}?type=sgs`);
    } else {
      // SGS + autres domaines ou domaines standards → checklist standard
      router.push(`/preparation-checklist/${planning.id}?type=${checklistType}`);
    }
  };

  return createPortal(
    <div className="modal-overlay" data-role={userRole} onClick={onClose}>
      <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">

          {/* Header */}
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2">
              <FileText className="w-5 h-5 text-role-primary" />
              Préparation de la surveillance - {aerodrome?.code_oaci} {aerodrome?.nom}
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="modal-body p-5 space-y-5">

            {/* Informations générales */}
            <div className="card border-border">
              <div className="card-content p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Aérodrome</p>
                      <p className="font-medium text-sm">{aerodrome?.code_oaci} - {aerodrome?.nom}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Période</p>
                      <p className="font-medium text-sm">
                        {new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Équipe</p>
                      <p className="font-medium text-sm">{planning.equipe_ids?.length || 0} inspecteur(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium text-sm capitalize">{planning.type?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Onglets */}
            <div className="tabs">
              {(['profil', 'historique', 'checklist', 'delegation'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                >
                  {tab === 'profil'     && <><TrendingUp className="w-4 h-4 inline mr-2" />Profil de risque</>}
                  {tab === 'historique' && <><HistoryIcon className="w-4 h-4 inline mr-2" />Historique</>}
                  {tab === 'checklist'  && <><ClipboardList className="w-4 h-4 inline mr-2" />Checklist</>}
                  {tab === 'delegation' && <><UserCheck className="w-4 h-4 inline mr-2" />Délégation</>}
                </button>
              ))}
            </div>

            {/* ── PROFIL DE RISQUE ── */}
            {activeTab === 'profil' && profil && (
              <div className="tab-content space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="card border-border">
                    <div className="card-content p-3 text-center">
                      <p className="text-xs text-muted-foreground">Score global</p>
                      <p className={`text-3xl font-bold ${getProfilColor()}`}>{profil.score_global}/100</p>
                      {profil.niveau && <span className="badge mt-1">Niveau: {profil.niveau}</span>}
                    </div>
                  </div>
                  <div className="card border-border">
                    <div className="card-content p-3 text-center">
                      <p className="text-xs text-muted-foreground">Tendance</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {getTendanceIcon()}
                        <span className="text-lg font-medium capitalize">{profil.tendance || 'stable'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card border-border">
                  <div className="card-header">
                    <div className="card-title text-sm">Détail des critères</div>
                  </div>
                  <div className="card-content space-y-3">
                    {[
                      { label: 'C1 - Maturité SGS',   value: profil.c1 },
                      { label: 'C2 - Efficacité PAC',  value: profil.c2 },
                      { label: 'C3 - Conformité',      value: profil.c3 },
                      { label: 'C4 - Charge critique', value: profil.c4 },
                      { label: 'C5 - Résilience',      value: profil.c5 },
                    ].map(crit => (
                      <div key={crit.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span>{crit.label}</span>
                          <span className="font-medium">{crit.value}/100</span>
                        </div>
                        <div className="progress h-1.5">
                          <div
                            className={`progress-bar ${crit.value < 40 ? 'bg-danger' : crit.value < 60 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${crit.value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {profil.velocity_metrics && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="card border-border">
                      <div className="card-content p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Vitesse</p>
                        <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-danger' : 'text-success'}`}>
                          {profil.velocity_metrics.vitesse > 0 ? '+' : ''}{formatNumber(profil.velocity_metrics.vitesse, 1)} pts/mois
                        </p>
                      </div>
                    </div>
                    <div className="card border-border">
                      <div className="card-content p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Accélération</p>
                        <p className="text-sm font-semibold">{formatNumber(profil.velocity_metrics.acceleration, 1)}</p>
                      </div>
                    </div>
                    <div className="card border-border">
                      <div className="card-content p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Volatilité</p>
                        <p className="text-sm font-semibold">{formatNumber(profil.velocity_metrics.volatilite, 1)}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORIQUE ── */}
            {activeTab === 'historique' && (
              <div className="tab-content space-y-3">
                {surveillancesPrecedentes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucune surveillance antérieure</p>
                  </div>
                ) : (
                  surveillancesPrecedentes.map(s => (
                    <div key={s.id} className="card border-border">
                      <div className="card-content p-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-sm font-medium capitalize">{s.type?.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(s.date_debut).toLocaleDateString('fr-FR')} → {new Date(s.date_fin).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <span className={`badge ${getSurveillanceBadge(s.statut).cls}`}>{getSurveillanceBadge(s.statut).label}</span>
                        </div>
                        {s.progression !== undefined && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span>Progression</span>
                              <span>{s.progression}%</span>
                            </div>
                            <div className="progress h-1">
                              <div className="progress-bar" style={{ width: `${s.progression}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {nbEcartsCritiques > 0 && (
                  <div className="alert alert-warning">
                    <AlertTriangle className="alert-icon" />
                    <div className="alert-content">
                      <div className="alert-title">Écarts non résolus</div>
                      <div className="alert-description">{nbEcartsCritiques} écart(s) critique(s) actif(s) - suivi prioritaire requis</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CHECKLIST ── */}
            {activeTab === 'checklist' && (
              <div className="tab-content space-y-3">
                <div className={`alert ${checklistType === 'mixte' ? 'alert-warning' : 'alert-info'}`}>
                  <div className="flex items-start gap-3">
                    {getTypeIcon()}
                    <div className="flex-1">
                      <div className="alert-title">Type recommandé</div>
                      <div className="alert-description">{getTypeLabel()}</div>
                      {checklistType === 'mixte' && (
                        <div className="text-xs mt-2">
                          • Items de suivi des écarts<br />
                          • Items de mise en œuvre PAC
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="card border-border">
                  <div className="card-header">
                    <div className="card-title text-sm">Aperçu des items à vérifier</div>
                  </div>
                  <div className="card-content">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Items standards (checklist RAS-14)</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-2"><span className="badge success text-[10px]">SA</span><span>Items satisfaisants (prédiction)</span></div>
                          <div className="flex items-center gap-2"><span className="badge danger text-[10px]">NS</span><span>Non-conformités identifiées</span></div>
                          <div className="flex items-center gap-2"><span className="badge warning text-[10px]">NV</span><span>Points à vérifier sur site</span></div>
                        </div>
                      </div>
                      {(checklistType === 'suivi' || checklistType === 'mixte') && (
                        <div className="border-t border-border pt-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Items de suivi des écarts</p>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm"><span>• Vérification état d'avancement des écarts</span><span className="badge warning">3 items</span></div>
                            <div className="flex items-center justify-between text-sm"><span>• Validation des actions correctives</span><span className="badge warning">2 items</span></div>
                          </div>
                        </div>
                      )}
                      {(checklistType === 'pac' || checklistType === 'mixte') && (
                        <div className="border-t border-border pt-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Items de mise en œuvre PAC</p>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm"><span>• Vérification des actions PAC</span><span className="badge warning">4 items</span></div>
                            <div className="flex items-center justify-between text-sm"><span>• Évaluation efficacité des mesures</span><span className="badge warning">2 items</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="btn btn-secondary btn-sm gap-1" onClick={handlePrefillChecklist}>
                    <Brain className="w-3 h-3" />
                    Pré-remplir avec l'historique
                  </button>
                </div>
              </div>
            )}

            {/* ── DÉLÉGATION ── */}
            {activeTab === 'delegation' && (
              <div className="tab-content space-y-3">
                <p className="text-sm text-muted-foreground">
                  Attribuez chaque domaine à un inspecteur pour une répartition claire des tâches.
                </p>
                {domainesList.map(({ code, label }) => (
                  <div key={code} className="card border-border">
                    <div className="card-content p-3">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                          <span className="badge primary">{code}</span>
                          <span className="text-xs text-muted-foreground">{label}</span>
                          {delegations[code] && (
                            <span className="badge success text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-2 h-2" />
                              Assigné
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            className="form-select text-sm py-1 h-8"
                            value={delegations[code] || ''}
                            onChange={e => setDelegations(prev => ({ ...prev, [code]: e.target.value }))}
                          >
                            <option value="">Non assigné</option>
                            {inspecteursDisponibles.map(insp => (
                              <option key={insp.id} value={insp.id}>
                                {insp.prenom} {insp.nom} ({insp.service || 'Inspecteur'})
                              </option>
                            ))}
                          </select>
                          {delegations[code] && (
                            <button
                              onClick={() => setDelegations(prev => ({ ...prev, [code]: '' }))}
                              className="btn btn-sm px-3 py-1 btn-danger"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  💡 La délégation est optionnelle. Si vous ne déléguez pas, tous les inspecteurs pourront voir l'ensemble des domaines.
                </p>
                {Object.keys(delegations).filter(d => delegations[d]).length > 0 && (
                  <div className="card border-success bg-success/5">
                    <div className="card-content p-3">
                      <p className="text-xs font-semibold text-success mb-2">Résumé des délégations</p>
                      <div className="space-y-1">
                        {Object.entries(delegations).filter(([, id]) => id).map(([code, id]) => {
                          const inspecteur = inspecteursDisponibles.find(i => i.id === id);
                          return (
                            <div key={code} className="flex items-center justify-between text-xs">
                              <span className="font-medium">{code} - {getDomaineLabel(code)}</span>
                              <span className="text-gray-600">→ {inspecteur?.prenom} {inspecteur?.nom}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <button className="btn btn-primary btn-sm gap-1" onClick={handleSaveDelegations}>
                    <Save className="w-3 h-3" />
                    Enregistrer les délégations
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Footer — un seul CTA ; pour mixte, handleOpenChecklist → ?type=mixte */}
          <div className="modal-footer border-t border-border flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary gap-2" onClick={handleOpenChecklist}>
              <PlayCircle className="w-4 h-4" />
              {planning.checklist_hierarchy?.length
                ? 'Modifier la checklist'
                : checklistType === 'mixte'
                ? 'Ouvrir en mode mixte'
                : 'Ouvrir la checklist pré-remplie'}
            </button>
          </div>

        </div>
      </div>

      </div>,
      document.body
    );
  };

export default function PlanningModule({ userRole, setActiveModule }: PlanningModuleProps) {
  const router = useRouter();

  // Store
  const aerodromes         = useOptimizedStore(s => s.aerodromes);
  const profilsRisque      = useOptimizedStore(s => s.profilsRisque);
  const surveillances      = useOptimizedStore(s => s.surveillances);
  const utilisateurs       = useOptimizedStore(s => s.utilisateurs);
  const ecarts             = useOptimizedStore(s => s.ecarts);
  const user               = useOptimizedStore(s => s.user);
  const addNotification    = useAppStore(s => s.addNotification);

  const aerodromesActifs = useMemo(() => aerodromes.filter(a => !a.deleted_at), [aerodromes]);

  const ecartsCritiquesParAerodrome = useMemo(() => {
    const map = new Map<string, number>();
    ecarts.forEach((e: any) => {
      if (e.niveau_risque === 'critique' && e.statut !== 'cloture') {
        map.set(e.aerodrome_id, (map.get(e.aerodrome_id) || 0) + 1);
      }
    });
    return map;
  }, [ecarts]);

  const exemptionsActivesParAerodrome = useMemo(() => {
    const map = new Map<string, any[]>();
    try {
      const store = useAppStore.getState();
      aerodromesActifs.forEach(aero => {
        const actives = store.getExemptionsActives?.(aero.id);
        if (actives && actives.length > 0) {
          map.set(aero.id, actives);
        }
      });
    } catch (_) {}
    return map;
  }, [aerodromesActifs]);

  const suggestionFeedbacks = useOptimizedStore(s => s.suggestionFeedbacks || []);
  const planningsStore = useAppStore(s => s.plannings || []);
  const deletePlanning = useAppStore(s => s.deletePlanning);
  const updatePlanning = useAppStore(s => s.updatePlanning);
  const submitSuggestionFeedbackStore = useAppStore(s => s.submitSuggestionFeedback);

  // State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedAerodrome, setSelectedAerodrome] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatut, setSelectedStatut] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [preparationPlanning, setPreparationPlanning] = useState<Planning | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlanning, setEditingPlanning] = useState<Planning | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planningToDelete, setPlanningToDelete] = useState<Planning | null>(null);
  const [executeTarget, setExecuteTarget] = useState<Planning | null>(null);
  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<{ aerodromeId: string; suggestionType: string; missionType: string; ecartIds?: string[] } | null>(null);
  const [feedbackValue, setFeedbackValue] = useState(true);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [isAskingIa, setIsAskingIa] = useState(false);
  const [iaQuestion, setIaQuestion] = useState('');
  const [iaAnswer, setIaAnswer] = useState('');
  const [showPropositions, setShowPropositions] = useState(false);
  const [showProactiveSuggestions, setShowProactiveSuggestions] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<'active' | 'all' | 'retards'>('active');
  const [showProcessus, setShowProcessus] = useState(false);
  const certifications = useAppStore(s => s.certifications || []);
  const homologations = useAppStore(s => s.homologations || []);
  const processusActifs = useMemo(() => getProcessusActifs(certifications, homologations, surveillances, ecarts, aerodromes), [certifications, homologations, surveillances, ecarts, aerodromes]);
  const [mounted, setMounted] = useState(false);
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true);
    return () => {
      if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
    }
  }, []);

  const filteredPlannings = useMemo(() => {
    let list = planningsStore;
    if (selectedYear) {
      list = list.filter(p => new Date(p.date_debut).getFullYear() === selectedYear);
    }
    if (selectedAerodrome !== 'all') {
      list = list.filter(p => p.aerodrome_id === selectedAerodrome);
    }
    if (selectedType !== 'all') {
      list = list.filter(p => p.type === selectedType);
    }
    if (selectedStatut !== 'all') {
      list = list.filter(p => p.statut === selectedStatut);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const aero = aerodromesActifs.find(a =>
        a.code_oaci.toLowerCase().includes(term) || a.nom.toLowerCase().includes(term)
      );
      if (aero) {
        list = list.filter(p => p.aerodrome_id === aero.id);
      }
    }
    return list;
  }, [planningsStore, selectedYear, selectedAerodrome, selectedType, selectedStatut, searchTerm, aerodromesActifs]);

  const aerodromesRisque = useMemo(() => {
    return aerodromesActifs.map(aero => {
      const profil = profilsRisque[aero.id];
      if (!profil) return null;
      const ecartsAerodrome = ecarts.filter(
        (e: any) => e.aerodrome_id === aero.id && e.statut !== 'cloture'
      );
      const nbEcartsCritiques = ecartsAerodrome.filter(
        (e: any) => e.niveau_risque === 'critique'
      ).length;
      const exemptions = exemptionsActivesParAerodrome.get(aero.id) || [];
      const aDesMesuresEnRetard = exemptions.some((e: any) =>
        e.mesures_atténuation?.some((m: any) => m.statut === 'en_retard')
      );
      const niveauAlerte = ({
        CRITIQUE: 'critique', ELEVE: 'haute', MOYEN: 'moyen', FAIBLE: null
      } as Record<string, string | null>)[getRiskLevel(profil.score_global)] || null;

      // ── Utilise le moteur complet de surveillance continue ──
      const urgents = riskEngine.detectUrgentEcards(ecartsAerodrome, profil);
      const degradations = riskEngine.detectDomainDegradations(profil);
      const decision = riskEngine.determineTypeSurveillanceContinue(
        profil, urgents, degradations,
        ecartsAerodrome, undefined, undefined, undefined, aero.statut_sgs as 'complet' | 'simplifie' | 'non_applicable' | undefined,
      );

      const decisionSurveillance = {
        type: decision.type,
        raison: decision.raison,
        priorite: decision.priorite,
        delaiRecommandation: decision.delaiRecommandation,
        domainesCibles: decision.domainesCibles,
        typesChecklist: decision.typesChecklist,
      };

      const freqSuggestion = {
        frequence: computeFinalFrequency(profil.score_global, [profil.score_global < 50 ? 0.8 : 1]),
        label: decision.priorite === 'critique' ? 'Immédiate' : decision.priorite === 'haute' ? 'Renforcée' : profil.score_global >= 70 ? 'Réduite' : 'Normale',
        justification: decision.raison,
      };

      // Domaines critiques (score < seuil) avec structure AGA
      const domainesCritiques = [
        { domaine: 'SGS', code: 'c1', seuil: 60, group: 'AGA/EXPLOITATION' },
        { domaine: 'COP', code: 'c3', seuil: 60, group: 'AGA/EXPLOITATION' },
        { domaine: 'OPS', code: 'c3', seuil: 60, group: 'AGA/EXPLOITATION' },
        { domaine: 'PHY', code: 'c3', seuil: 60, group: 'AGA/GENIE_CIVIL' },
        { domaine: 'OLS', code: 'c3', seuil: 60, group: 'AGA/GENIE_CIVIL' },
        { domaine: 'ELEC', code: 'c3', seuil: 60, group: 'AGA/GENIE_ELEC' },
        { domaine: 'MFP', code: 'c3', seuil: 60, group: 'AGA/GENIE_ELEC' },
        { domaine: 'SLI', code: 'c5', seuil: 60, group: 'AGA/SLI_RA' },
        { domaine: 'RA', code: 'c5', seuil: 60, group: 'AGA/SLI_RA' },
        { domaine: 'Écarts', code: 'c4', seuil: 60, group: null },
      ].filter(d => (profil as unknown as Record<string, number>)[d.code] < d.seuil)
        .sort((a, b) => (profil as unknown as Record<string, number>)[a.code] - (profil as unknown as Record<string, number>)[b.code])
        .map(d => ({ ...d, score: (profil as unknown as Record<string, number>)[d.code] }));

      const ecartTriggers = getEcartTriggers(
        ecartsAerodrome,
        profil,
        suggestionFeedbacks,
      );
      const nbTriggersCritiques = ecartTriggers.filter(t => t.urgence === 'critique').length;
      const nbTriggersHautes = ecartTriggers.filter(t => t.urgence === 'haute').length;
      const hasPacAccepteEnAttente = ecartTriggers.some(
        t => t.ecart.statut === 'pac_accepte' && t.typeSurveillanceSuggere === 'mise_oeuvre_pac'
      );

      // Suggestions de maintien
      const suggestionsMaintien = genererSuggestionsMaintien({
        ecartsActifs: ecartsAerodrome,
        profilRisque: profil,
      });

      return {
        ...aero,
        niveauAlerte,
        suggestion: decision.type,
        profilScore: profil.score_global,
        profilTendance: profil.tendance,
        decisionSurveillance,
        frequenceSuggestion: freqSuggestion,
        nbEcartsCritiques: nbEcartsCritiques || 0,
        aDesExemptions: exemptions.length > 0,
        aDesMesuresEnRetard: !!aDesMesuresEnRetard,
        domainesCritiques,
        ecartTriggers,
        nbTriggersCritiques,
        nbTriggersHautes,
        hasPacAccepteEnAttente,
        suggestionsMaintien,
      };
    }).filter(a => a !== null && (a.niveauAlerte !== null || (a as any).ecartTriggers?.length > 0)) as AerodromeRisque[];
  }, [aerodromesActifs, profilsRisque, ecartsCritiquesParAerodrome, exemptionsActivesParAerodrome, ecarts]);

  // Plannings avec enrichissement risque et lien vers surveillance
  const planningsEnrichis = useMemo(() => {
    return filteredPlannings.map(planning => {
      const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
      const profil = profilsRisque[planning.aerodrome_id];
      const risqueData = aerodromesRisque.find(a => a.id === planning.aerodrome_id);
      const exemptions = exemptionsActivesParAerodrome.get(planning.aerodrome_id) || [];
      
      const surveillanceLiee = surveillances.find(s => s.planning_id === planning.id);
      const isLancee = !!surveillanceLiee;
      const surveillanceId = surveillanceLiee?.id;
      
      return {
        ...planning,
        aerodromeNom: aerodrome?.nom,
        aeroCode: aerodrome?.code_oaci,
        risqueNiveau: risqueData?.niveauAlerte,
        risqueSuggestion: risqueData?.suggestion,
        profilScore: profil?.score_global,
        profilTendance: profil?.tendance,
        nbEcartsCritiques: risqueData?.nbEcartsCritiques || 0,
        aDesExemptions: risqueData?.aDesExemptions || false,
        aDesMesuresEnRetard: risqueData?.aDesMesuresEnRetard || false,
        isLancee,
        surveillanceId,
      };
    });
  }, [filteredPlannings, aerodromes, aerodromesActifs, profilsRisque, aerodromesRisque, surveillances, exemptionsActivesParAerodrome]);

  // Grouper par aérodrome pour la vue liste
  const planningsByAerodrome = useMemo(() => {
    const grouped = new Map();
    
    planningsEnrichis.forEach(planning => {
      const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
      if (!aerodrome) return;

      if (!grouped.has(planning.aerodrome_id)) {
        grouped.set(planning.aerodrome_id, {
          aerodrome,
          plannings: [],
          stats: { total: 0, realisees: 0, enRetard: 0, planifiees: 0 },
          aDesExemptions: planning.aDesExemptions,
          aDesMesuresEnRetard: planning.aDesMesuresEnRetard,
        });
      }
      
      const group = grouped.get(planning.aerodrome_id);
      group.plannings.push(planning);
      group.stats.total++;
      
      if (planning.statut === 'realisee') group.stats.realisees++;
      if (planning.statut === 'en_retard') group.stats.enRetard++;
      if (planning.statut === 'planifiee') group.stats.planifiees++;
      
      if (planning.aDesExemptions) group.aDesExemptions = true;
      if (planning.aDesMesuresEnRetard) group.aDesMesuresEnRetard = true;
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.aerodrome.code_oaci.localeCompare(b.aerodrome.code_oaci));
  }, [planningsEnrichis, aerodromes, aerodromesActifs]);

  // Statistiques globales
  const stats = useMemo(() => {
    const total = filteredPlannings.length;
    const planifiees = filteredPlannings.filter(p => p.statut === 'planifiee').length;
    const enCours = filteredPlannings.filter(p => p.statut === 'en_cours').length;
    const realisees = filteredPlannings.filter(p => p.statut === 'realisee').length;
    const enRetard = filteredPlannings.filter(p => p.statut === 'en_retard').length;
    const executionRate = total > 0 ? Math.round((realisees / total) * 100) : 0;
    return { total, planifiees, enCours, realisees, enRetard, executionRate };
  }, [filteredPlannings]);

  // Fonction de feedback
  const enregistrerFeedbackPlanning = useCallback((
    planning: Planning,
    suggestionAcceptee: boolean,
    raison?: string
  ) => {
    const profil = profilsRisque[planning.aerodrome_id];
    if (!profil) return;
    
    learningEngine.recordLearningFeedback(
      planning.aerodrome_id,
      'planning',
      planning.type,
      planning.id,
      'SA',
      70,
      'SA',
      raison || (suggestionAcceptee ? 'Planning validé' : 'Planning rejeté')
    );
    
    addNotification({
      user_id: user?.id || '',
      type: suggestionAcceptee ? 'success' : 'info',
      title: suggestionAcceptee ? 'Planning validé' : 'Planning ignoré',
      message: `Votre ${suggestionAcceptee ? 'validation' : 'rejet'} a été enregistré pour l'apprentissage du modèle.`,
      canal: 'in_app'
    });
  }, [profilsRisque, addNotification, user]);

  // Handlers
  const handleNewPlanning = () => {
    setEditingPlanning(null);
    startTransition(() => setFormOpen(true));
  };

  const handlePrepare = (planning: Planning) => {
    setPreparationPlanning(planning);
    startTransition(() => setPreparationOpen(true));
  };

  const handleRefuser = (planning: Planning) => {
    enregistrerFeedbackPlanning(planning, false, 'Planning rejeté par l\'utilisateur');
    deletePlanning(planning.id);
  };

  const handleRequestExecute = (planning: Planning) => {
    setExecuteTarget(planning);
    setExecuteConfirmOpen(true);
  };

  const handleConfirmExecute = async () => {
    if (!executeTarget) return;
    setExecuteConfirmOpen(false);
    await handleLancer(executeTarget);
  };

  const handleLancer = async (planning: Planning) => {
    if ((planning as Planning & { isLancee?: boolean }).isLancee) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Déjà lancée',
        message: 'Cette surveillance a déjà été lancée',
        canal: 'in_app',
      });
      return;
    }

    enregistrerFeedbackPlanning(planning, true, 'Planning validé et lancé');

    const nouvelleSurveillance: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'> = {
      aerodrome_id: planning.aerodrome_id,
      planning_id: planning.id,
      type: planning.type,
      portee: planning.portee || [],
      equipe_ids: planning.equipe_ids || [],
      chef_id: planning.chef_id || '',
      date_debut: planning.date_debut,
      date_fin: planning.date_fin,
      statut: 'en_cours',
    };

    const { addSurveillance, setChecklistHierarchy, updateSurveillance } = useAppStore.getState();
    const surveillance = await addSurveillance(nouvelleSurveillance);

    if (surveillance && surveillance.id) {
      updatePlanning(planning.id, {
        surveillance_id: surveillance.id,
        updated_at: new Date().toISOString(),
      });

      // Transférer la checklist préparée depuis le planning vers la surveillance
      if (planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0) {
        setChecklistHierarchy(surveillance.id, planning.checklist_hierarchy);
        updateSurveillance(surveillance.id, { checklist_hierarchy: planning.checklist_hierarchy });
        console.debug('[Planning] Checklist préparée transférée depuis le planning:', planning.id);
      }
      // Transférer l'évaluation SGS PAOE préparée si présente
      if (planning.sgs_evaluation_prepa) {
        updateSurveillance(surveillance.id, { sgs_evaluation_prepa: planning.sgs_evaluation_prepa });
        console.debug('[Planning] Évaluation SGS préparée transférée:', planning.id);
      }
      if (!(planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0)) {
        // Fallback : générer la checklist si aucune n'a été préparée
        const profil = profilsRisque?.[planning.aerodrome_id] || undefined;
        const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
        const typeSurv: 'periodique' | 'inopine' | 'maintien' =
          (planning.type === 'inopinee' || planning.type === 'inopine') ? 'inopine' :
          planning.type === 'maintien' ? 'maintien' : 'periodique';

        const store = useAppStore.getState();
        const master = store.findMasterChecklistForPortee(planning.portee || []);
        if (master) {
          const snapshot = JSON.parse(JSON.stringify(master.checklist));
          const filtered = aerodrome ? kitDocAgent.filterChecklistByAerodrome(snapshot, aerodrome) : snapshot;
          const enriched = kitDocAgent.applyRiskProfileToChecklist(filtered, {
            entite_id: planning.aerodrome_id,
            type_entite: aerodrome?.type_entite ?? 'aerodrome',
            type_surveillance: typeSurv,
            portee: planning.portee || [],
            profil_risque: profil,
          });
          setChecklistHierarchy(surveillance.id, enriched);
          updateSurveillance(surveillance.id, { checklist_hierarchy: enriched });
        } else {
          const analysesDocs = kitDocAgent.getAnalysesForPortee(planning.portee || []);
          const analyses = analysesDocs.length > 0 ? analysesDocs : undefined;
          try {
            const result = kitDocAgent.generateChecklist({
              surveillance_id: surveillance.id,
              entite_id: planning.aerodrome_id,
              type_entite: aerodrome?.type_entite ?? 'aerodrome',
              type_surveillance: typeSurv,
              portee: planning.portee || [],
              profil_risque: profil,
              analyses_docs: analyses,
            });
            const resultFiltered = aerodrome ? { ...result, domaines: kitDocAgent.filterChecklistByAerodrome(result.domaines as any[], aerodrome) } : result;
            kitDocAgent.injectIntoStore(surveillance.id, resultFiltered);
            updateSurveillance(surveillance.id, { checklist_hierarchy: toDomaineChecklistArray(resultFiltered) });
          } catch { /* génération silencieuse */ }
        }
      }
    }

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Surveillance lancée',
      message: `La surveillance pour ${(planning as Planning & { aeroCode?: string }).aeroCode} a été créée`,
      canal: 'in_app',
    });

    // ── Notifier les exploitants de l'aérodrome ──────────────────
    {
      const typeLabel = (planning.type as string)?.replace(/_/g, ' ') ?? 'surveillance';
      const domainesLabels = (planning.portee || []).map(getDomaineLabel).join(', ');
      const dateDebut = new Date(planning.date_debut).toLocaleDateString('fr-FR');
      const dateFin = new Date(planning.date_fin).toLocaleDateString('fr-FR');
      const equipeNoms = (planning.equipe_ids || []).map((id: string) => {
        const u = utilisateurs.find((x: any) => x.id === id);
        return u ? `${u.prenom} ${u.nom}` : id;
      }).join(', ');
      const aeroCode = (planning as any).aeroCode || '';
      const message = `Une surveillance ${typeLabel} est programmée du ${dateDebut} au ${dateFin} sur ${aeroCode}.\nDomaines: ${domainesLabels}\nÉquipe: ${equipeNoms}\nPréparez vos documents et registres pour l'équipe ANACIM.`;
      utilisateurs
        .filter(u =>
          u.aerodrome_id === planning.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        .forEach(u =>
          addNotification({
            user_id: u.id,
            type: 'warning',
            title: `Surveillance programmée — ${aeroCode}`,
            message,
            canal: 'email',
            link: `/surveillance/${surveillance.id}`,
          })
        );
    }
    // ─────────────────────────────────────────────────────────────

    // Naviguer vers la page de la surveillance (pas directement la checklist)
    router.push(`/surveillance/${surveillance.id}`);
  };

  const handleEdit = (planning: Planning) => {
    setEditingPlanning(planning);
    startTransition(() => setFormOpen(true));
  };

  // Appliquer les suggestions IA & Profil pour un planning donné
  const handleAppliquerSuggestionsGlobal = (planning: { aerodrome_id: string; id?: string }) => {
    if (!planning?.aerodrome_id) return;
    
    const profil = profilsRisque[planning.aerodrome_id];
    if (!profil) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Profil indisponible',
        message: 'Aucun profil de risque trouvé pour cet aérodrome',
        canal: 'in_app',
      });
      return;
    }

    // Suggérer les domaines prioritaires selon le profil
    const domaines: string[] = [];
    ['c1', 'c2', 'c3', 'c4', 'c5'].forEach(key => {
      const score = (profil as unknown as Record<string, number>)[key];
      if (score < 60) {
        const mapping: Record<string, string> = {
          'c1': 'SGS', 'c2': 'PAC', 'c3': 'PHY', 'c4': 'Ecarts', 'c5': 'SLI'
        };
        domaines.push(mapping[key] || key);
      }
    });
    domaines.sort((a, b) => (profil as unknown as Record<string, number>)['c' + (a === 'SGS' ? '1' : a === 'PAC' ? '2' : a === 'PHY' ? '3' : a === 'Ecarts' ? '4' : '5')] - 
                              (profil as unknown as Record<string, number>)['c' + (b === 'SGS' ? '1' : b === 'PAC' ? '2' : b === 'PHY' ? '3' : b === 'Ecarts' ? '4' : '5')]);
    if (domaines.length > 3) domaines.length = 3;

    // Suggérer la priorité
    const priorite = profil.score_global < 30 ? 'critique' :
                   profil.score_global < 50 ? 'haute' :
                   profil.score_global < 70 ? 'moyenne' : 'basse';

    // Suggérer le type
    const type = profil.score_global < 30 ? 'audit_complet' :
                 profil.c4 < 40 ? 'suivi_ecarts' :
                 profil.c2 < 50 ? 'mise_oeuvre_pac' : 'programmee';

    // Suggérer l'équipe selon spécialité AGA et disponibilité
    const equipeSuggeree = utilisateurs
      .filter(u => u.role === 'inspector' && u.statut !== 'inactif' && u.statut !== 'suspendu')
      .filter(u => {
        if (!u.competences || u.competences.length === 0) return false;
        
        // Vérifier si l'inspecteur a une spécialité AGA qui couvre les domaines prioritaires
        return u.competences.some((c: { domaine: string; niveau: string } | string) => {
          const domaineInsp = typeof c === 'string' ? c : c.domaine;
          
          // Si AGA/XXX, vérifier si ça couvre les domaines critiques
          if (domaineInsp.startsWith('AGA/')) {
            const mapping: Record<string, string[]> = {
              'AGA/EXPLOITATION': ['SGS', 'COP', 'OPS'],
              'AGA/GENIE_CIVIL': ['PHY', 'OLS'],
              'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
              'AGA/SLI_RA': ['SLI', 'RA'],
            };
            const domainesInsp = mapping[domaineInsp] || [];
            return domaines.some((d: string) => domainesInsp.includes(d));
          }
          
          // Si domaine direct, vérifier s'il est dans la liste
          return domaines.includes(domaineInsp);
        });
      })
      .map(u => ({
        id: u.id,
        nom: u.nom,
        prenom: u.prenom,
        competences: u.competences,
        // Privilégier ceux qui ont le plus de domaines correspondants
        scoreMatch: (u.competences || []).filter((c: { domaine: string; niveau: string } | string) => {
          const d = typeof c === 'string' ? c : c.domaine;
          if (d.startsWith('AGA/')) {
            const mapping: Record<string, string[]> = {
              'AGA/EXPLOITATION': ['SGS', 'COP', 'OPS'],
              'AGA/GENIE_CIVIL': ['PHY', 'OLS'],
              'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
              'AGA/SLI_RA': ['SLI', 'RA'],
            };
            const domainesInsp = mapping[d] || [];
            return domaines.some((dom: string) => domainesInsp.includes(dom));
          }
          return domaines.includes(d);
        }).length
      }))
      .sort((a, b) => b.scoreMatch - a.scoreMatch)
      .slice(0, 3)
      .map(u => u.id);

    // Enregistrer le feedback pour apprentissage
    learningEngine.recordLearningFeedback(
      planning.aerodrome_id,
      domaines[0] || 'SGS',
      '',
      `global-suggestion-${planning.id || Date.now()}`,
      'SA' as const,
      90,
      'SA' as const,
      `Suggestion IA appliquée: ${type}, ${priorite}, domaines: ${domaines.join(', ')}`
    );

    // Submit SuggestionFeedback pour alimenter le ML Agent
    const suggestionTypeMap: Record<string, 'surveillance_pac' | 'surveillance_ecarts' | 'audit_complet' | 'surveillance_mixte'> = {
      'audit_complet': 'audit_complet',
      'suivi_ecarts': 'surveillance_ecarts',
      'mise_oeuvre_pac': 'surveillance_pac',
      'programmee': 'surveillance_mixte',
    };
    const feedbackType = suggestionTypeMap[type] || 'surveillance_mixte';
    try {
      submitSuggestionFeedbackStore({
        aerodrome_id: planning.aerodrome_id,
        suggestion_type: feedbackType,
        mission_type_suggeree: type,
        etait_pertinent: true,
        date_suggestion: new Date().toISOString(),
      });
    } catch (_) {}

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestion IA & Profil appliquée',
      message: `Domaines: ${domaines.join(', ')} | Type: ${type} | Priorité: ${priorite} | Équipe: ${equipeSuggeree.length} inspecteur(s) suggérés selon leur spécialité AGA`,
      canal: 'in_app',
    });
  };

  const submitSuggestionFeedback = (aerodromeId: string, suggestionType: string, missionType: string, etaitPertinent: boolean, raison?: string, ecartIds?: string[]) => {
    const feedback: Omit<SuggestionFeedback, 'id'> = {
      aerodrome_id: aerodromeId,
      suggestion_type: suggestionType as SuggestionFeedback['suggestion_type'],
      mission_type_suggeree: missionType,
      etait_pertinent: etaitPertinent,
      raison_inexactitude: raison,
      ecart_ids: ecartIds,
      date_suggestion: new Date().toISOString(),
    };
    submitSuggestionFeedbackStore(feedback);

    const ecart = ecartIds?.[0] ? ecarts.find(e => e.id === ecartIds[0]) : null;
    if (ecart) {
      const profil = profilsRisque[aerodromeId];
      const features = extractFeatures(ecart, profil, ecarts, suggestionFeedbacks);
      const model = suggestionMLAgent.loadModelWeights();
      suggestionMLAgent.updateModelWithFeedback(
        { id: crypto.randomUUID(), ...feedback, date_feedback: new Date().toISOString() },
        features,
        model,
      );
    }

    addNotification({
      user_id: user?.id || '',
      type: etaitPertinent ? 'success' : 'info',
      title: etaitPertinent ? 'Feedback enregistré ✓' : 'Feedback enregistré',
      message: etaitPertinent
        ? 'La suggestion était pertinente — le modèle ML renforce ce pattern.'
        : 'Le modèle ML sera ajusté pour cet aérodrome.',
      canal: 'in_app',
    });
  };

  const openFeedbackModal = (aerodromeId: string, suggestionType: string, missionType: string, ecartIds?: string[]) => {
    setFeedbackTarget({ aerodromeId, suggestionType, missionType, ecartIds });
    setFeedbackValue(true);
    setFeedbackReason('');
    setFeedbackModalOpen(true);
  };

  const confirmFeedback = () => {
    if (!feedbackTarget) return;
    submitSuggestionFeedback(
      feedbackTarget.aerodromeId,
      feedbackTarget.suggestionType,
      feedbackTarget.missionType,
      feedbackValue,
      feedbackValue ? undefined : feedbackReason || undefined,
      feedbackTarget.ecartIds,
    );
    setFeedbackModalOpen(false);
    setFeedbackTarget(null);
  };

  const handleView = (planning: Planning & { surveillanceId?: string }) => {
    if (planning.surveillanceId) {
      router.push(`/surveillance/${planning.surveillanceId}`);
    }
  };

  const handleDelete = (planning: Planning & { isLancee?: boolean }) => {
    if (planning.isLancee) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Suppression impossible',
        message: 'Ce planning a déjà une surveillance lancée',
        canal: 'in_app',
      });
      return;
    }
    setPlanningToDelete(planning);
    startTransition(() => setDeleteDialogOpen(true));
  };

  const confirmDelete = useCallback(() => {
    if (planningToDelete) {
      deletePlanning(planningToDelete.id);
      setDeleteDialogOpen(false);
      setPlanningToDelete(null);
    }
  }, [planningToDelete, deletePlanning]);

  const handleExportCSV = () => {
    const headers = ['Aérodrome', 'Type', 'Début', 'Fin', 'Statut', 'Priorité', 'Score risque', 'Tendance', 'Écarts critiques', 'Exemptions'];
    const rows = planningsEnrichis.map(p => {
      return [
        p.aeroCode,
        p.type,
        new Date(p.date_debut).toLocaleDateString('fr-FR'),
        new Date(p.date_fin).toLocaleDateString('fr-FR'),
        p.statut,
        p.priorite,
        p.profilScore || '-',
        p.profilTendance || '-',
        p.nbEcartsCritiques || '0',
        p.aDesExemptions ? 'Oui' : 'Não',
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plannings_${selectedYear}.csv`;
    a.click();
  };

  const resetFilters = () => {
    setSelectedAerodrome('all');
    setSelectedType('all');
    setSelectedStatut('all');
    setSearchTerm('');
  };

  const handleAskAssistant = async () => {
    if (!iaQuestion.trim()) return;
    setIsAskingIa(true);
    try {
      const result = await assistantAgent.chat({
        message: iaQuestion,
        contexte: {
          module: 'planning',
          aerodromeId: selectedAerodrome !== 'all' ? selectedAerodrome : undefined,
        },
        userRole: userRole,
      });
      setIaAnswer(result.message);
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: "Impossible de contacter l'assistant",
        canal: 'in_app',
      });
    } finally {
      setIsAskingIa(false);
    }
  };

  const typeOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'programmee', label: 'Programmée' },
    { value: 'inopinee', label: 'Inopinée' },
    { value: 'speciale', label: 'Spéciale' },
    { value: 'suivi_ecarts', label: 'Suivi écarts' },
    { value: 'mise_oeuvre_pac', label: 'Mise œuvre PAC' },
    { value: 'certification', label: 'Certification' },
    { value: 'homologation', label: 'Homologation' },
    { value: 'audit_complet', label: 'Audit complet' },
    { value: 'urgence', label: 'Urgence' },
  ];

  const statutOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'planifiee', label: 'Planifiée' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'realisee', label: 'Réalisée' },
    { value: 'annulee', label: 'Annulée' },
    { value: 'en_retard', label: 'En retard' },
  ];

  const viewButtons = [
    { id: 'list', label: 'Liste', icon: List },
    { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
    { id: 'gantt', label: 'Gantt', icon: LayoutGrid },
    { id: 'workload', label: 'Charge', icon: Users },
    { id: 'assignment', label: 'Assignation', icon: Briefcase },
    { id: 'nplus1', label: 'N+1', icon: TrendingUp },
  ];

  const hasExemptionsAnywhere = Array.from(exemptionsActivesParAerodrome.values()).some(arr => arr.length > 0);
  const hasMesuresEnRetard = aerodromesRisque.some(a => a.aDesMesuresEnRetard);

  // ============================================================
  // MODALE DE PRÉPARATION (CORRIGÉE AVEC LES CLASSES GLOBALES)
  // ============================================================

  const PreparationModal = () => {
    const [activeTab, setActiveTab] = useState<'profil' | 'historique' | 'checklist' | 'delegation'>('profil');
    const [delegations, setDelegations] = useState<Record<string, string>>({});
    const [showTypeChoice, setShowTypeChoice] = useState(false);

    // ⚠ useMemo DOIT être avant tout return conditionnel (Rules of Hooks)
    // Le guard null interne gère le cas où preparationPlanning est null
    const domainesList = useMemo(() => {
      if (!preparationPlanning) return [];
      if (preparationPlanning.portee && preparationPlanning.portee.length > 0) {
        return preparationPlanning.portee.map(code => ({
          code,
          label: getDomaineLabel(code),
        }));
      }
      return DOMAINES_SURVEILLANCE
        .filter(d => d.code !== 'AGA')
        .map(d => ({ code: d.code, label: d.label }));
    }, [preparationPlanning?.portee]);

    // Early return après tous les hooks
    if (!preparationOpen || !preparationPlanning) return null;

    const aerodrome = aerodromesActifs.find(a => a.id === preparationPlanning.aerodrome_id) || aerodromes.find(a => a.id === preparationPlanning.aerodrome_id);
    const profil = profilsRisque[preparationPlanning.aerodrome_id];
    const nbEcartsCritiques = ecartsCritiquesParAerodrome.get(preparationPlanning.aerodrome_id) || 0;
    const exemptions = exemptionsActivesParAerodrome.get(preparationPlanning.aerodrome_id) || [];
    const risqueData = aerodromesRisque.find(a => a.id === preparationPlanning.aerodrome_id);

    // Récupérer les surveillances précédentes
    const surveillancesPrecedentes = surveillances
      .filter(s => s.aerodrome_id === preparationPlanning.aerodrome_id)
      .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
      .slice(0, 3);

    // Récupérer les inspecteurs disponibles
    const inspecteursDisponibles = utilisateurs.filter(u => u.role === 'inspector' && u.statut !== 'inactif');
    
    // Détection du type de checklist
    const detectChecklistType = (): 'standard' | 'suivi' | 'pac' | 'mixte' => {
      const ecartsActifs = ecarts.filter(e =>
        e.aerodrome_id === preparationPlanning.aerodrome_id &&
        e.statut !== 'cloture'
      );
      const aDesEcarts = ecartsActifs.length > 0;
      const aDesPac = ecartsActifs.some(e => e.pac);
      if (aDesEcarts && aDesPac) return 'mixte';
      if (aDesPac) return 'pac';
      if (aDesEcarts) return 'suivi';
      return 'standard';
    };

    // Portée SGS-only → évaluation PAOE (Annexe 19)
    const isSgsPortee = (preparationPlanning.portee || []).length === 1 && preparationPlanning.portee?.[0] === 'SGS';

    const checklistType = detectChecklistType();

    const getTypeLabel = () => {
      if (isSgsPortee) return 'Évaluation SGS — Maturité PAOE (Annexe 19 OACI)';
      switch (checklistType) {
        case 'mixte': return 'Checklist MIXTE (Standard + Écarts + PAC)';
        case 'suivi': return 'Checklist SUIVI DES ÉCARTS';
        case 'pac': return 'Checklist MISE EN ŒUVRE PAC';
        default: return 'Checklist STANDARD';
      }
    };
    
    const getProfilColor = () => {
      if (!profil) return 'text-gray-500';
      if (profil.score_global < 30) return 'text-danger';
      if (profil.score_global < 60) return 'text-warning';
      return 'text-success';
    };
    
    const getTendanceIcon = () => {
      if (!profil) return null;
      if (profil.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />;
      if (profil.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger" />;
      return null;
    };
    
    const getTypeIcon = () => {
      if (isSgsPortee) return <Shield className="w-5 h-5" />;
      switch (checklistType) {
        case 'mixte': return <LayoutGrid className="w-5 h-5" />;
        case 'suivi': return <AlertTriangle className="w-5 h-5" />;
        case 'pac': return <CheckCircle2 className="w-5 h-5" />;
        default: return <ClipboardList className="w-5 h-5" />;
      }
    };

    const handleSaveDelegations = () => {
      const nbDelegations = Object.keys(delegations).filter(d => delegations[d]).length;
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Délégations enregistrées',
        message: `${nbDelegations} domaine(s) assigné(s) - La checklist s'ouvrira avec cette répartition`,
        canal: 'in_app',
      });
    };
    
    const handlePrefillChecklist = () => {
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Pré-remplissage',
        message: 'La checklist sera pré-remplie avec les données historiques à l\'ouverture',
        canal: 'in_app',
      });
    };
    
    const handleNotifyOperator = () => {
      const operateurs = utilisateurs.filter((u: Utilisateur) =>
        u.aerodrome_id === preparationPlanning.aerodrome_id &&
        ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
      )
      const checklistUrl = `${window.location.origin}/preparation-checklist/${preparationPlanning.id}`
      operateurs.forEach((op: Utilisateur) => {
        addNotification({
          user_id: op.id,
          type: 'info',
          title: `Checklist à préparer — ${aerodrome?.code_oaci || ''}`,
          message: `La checklist de surveillance est disponible. Ouvrez-la ici : ${checklistUrl}`,
          canal: 'in_app',
        })
        addNotification({
          user_id: op.id,
          type: 'info',
          title: `Checklist à préparer — ${aerodrome?.code_oaci || ''}`,
          message: `La checklist de surveillance est disponible. Ouvrez-la ici : ${checklistUrl}`,
          canal: 'email',
        })
      })
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Checklist envoyée',
        message: `Checklist envoyée à ${operateurs.length} exploitant(s) (in-app + email)`,
        canal: 'in_app',
      })
    }

    const handleOpenChecklist = () => {
      const portee = preparationPlanning.portee || [];
      const ecartsActifs = (ecarts || []).filter((e: Ecart) => e.aerodrome_id === preparationPlanning.aerodrome_id && e.statut !== 'cloture')
      const isSgsOnly = portee.length === 1 && portee[0] === 'SGS';
      const hasSGS = portee.includes('SGS');
      const hasSuivi = ecartsActifs.length > 0;
      const hasPAC = ecartsActifs.some((e: Ecart) => e.pac);

      const possibleTypes: { type: string; label: string }[] = []
      if (isSgsOnly) {
        possibleTypes.push({ type: 'sgs', label: 'Évaluation SGS (PAOE)' })
      } else {
        possibleTypes.push({ type: 'standard', label: 'Checklist Standard' })
        if (hasSGS) possibleTypes.push({ type: 'sgs', label: 'Évaluation SGS (PAOE)' })
      }
      if (hasSuivi) possibleTypes.push({ type: 'suivi', label: 'Suivi des écarts' })
      if (hasPAC) possibleTypes.push({ type: 'pac', label: 'Mise en œuvre PAC' })

      if (possibleTypes.length > 1 && !isSgsOnly) {
        setShowTypeChoice(true)
        return
      }

      setPreparationOpen(false)
      const chosenType = possibleTypes[0]?.type || 'standard'
      if (chosenType === 'sgs') {
        router.push(`/preparation-checklist/${preparationPlanning.id}?type=sgs`)
      } else {
        router.push(`/preparation-checklist/${preparationPlanning.id}?type=${chosenType}`)
      }
    };

    return createPortal(
      <>
      <div className="modal-overlay" data-role={userRole} onClick={() => setPreparationOpen(false)}>
        <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            
            {/* Header */}
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2">
                <FileText className="w-5 h-5 text-role-primary" />
                Préparation de la surveillance - {aerodrome?.code_oaci} {aerodrome?.nom}
              </div>
              <button className="modal-close" onClick={() => setPreparationOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Body */}
            <div className="modal-body p-5 space-y-5">
              
              {/* Informations générales */}
              <div className="card border-border">
                <div className="card-content p-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-role-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Aérodrome</p>
                        <p className="font-medium text-sm">{aerodrome?.code_oaci} - {aerodrome?.nom}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-role-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Période</p>
                        <p className="font-medium text-sm">
                          {new Date(preparationPlanning.date_debut).toLocaleDateString('fr-FR')} → {new Date(preparationPlanning.date_fin).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-role-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Équipe</p>
                        <p className="font-medium text-sm">{preparationPlanning.equipe_ids?.length || 0} inspecteur(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-role-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium text-sm capitalize">{preparationPlanning.type?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Onglets avec les classes globales .tabs et .tab */}
              <div className="tabs">
                <button
                  onClick={() => setActiveTab('profil')}
                  className={`tab ${activeTab === 'profil' ? 'active' : ''}`}
                >
                  <TrendingUp className="w-4 h-4 inline mr-2" />
                  Profil de risque
                </button>
                <button
                  onClick={() => setActiveTab('historique')}
                  className={`tab ${activeTab === 'historique' ? 'active' : ''}`}
                >
                  <HistoryIcon className="w-4 h-4 inline mr-2" />
                  Historique
                </button>
                <button
                  onClick={() => setActiveTab('checklist')}
                  className={`tab ${activeTab === 'checklist' ? 'active' : ''}`}
                >
                  <ClipboardList className="w-4 h-4 inline mr-2" />
                  Checklist
                </button>
                <button
                  onClick={() => setActiveTab('delegation')}
                  className={`tab ${activeTab === 'delegation' ? 'active' : ''}`}
                >
                  <UserCheck className="w-4 h-4 inline mr-2" />
                  Délégation
                </button>
              </div>
              
              {/* ========== ONGLET PROFIL DE RISQUE ========== */}
              {activeTab === 'profil' && profil && (
                <div className="tab-content space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="card border-border">
                      <div className="card-content p-3 text-center">
                        <p className="text-xs text-muted-foreground">Score global</p>
                        <p className={`text-3xl font-bold ${getProfilColor()}`}>{profil.score_global}/100</p>
                        {profil.niveau && <span className="badge mt-1">Niveau: {profil.niveau}</span>}
                      </div>
                    </div>
                    <div className="card border-border">
                      <div className="card-content p-3 text-center">
                        <p className="text-xs text-muted-foreground">Tendance</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          {getTendanceIcon()}
                          <span className="text-lg font-medium capitalize">{profil.tendance || 'stable'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="card border-border">
                    <div className="card-header">
                      <div className="card-title text-sm">Détail des critères</div>
                    </div>
                    <div className="card-content space-y-3">
                      {[
                        { label: 'C1 - Maturité SGS', value: profil.c1 },
                        { label: 'C2 - Efficacité PAC', value: profil.c2 },
                        { label: 'C3 - Conformité', value: profil.c3 },
                        { label: 'C4 - Charge critique', value: profil.c4 },
                        { label: 'C5 - Résilience', value: profil.c5 },
                      ].map(crit => (
                        <div key={crit.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span>{crit.label}</span>
                            <span className="font-medium">{crit.value}/100</span>
                          </div>
                          <div className="progress h-1.5">
                            <div className={`progress-bar ${crit.value < 40 ? 'bg-danger' : crit.value < 60 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${crit.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {profil.velocity_metrics && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="card border-border">
                        <div className="card-content p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Vitesse</p>
                          <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-danger' : 'text-success'}`}>
                            {profil.velocity_metrics.vitesse > 0 ? '+' : ''}{formatNumber(profil.velocity_metrics.vitesse, 1)} pts/mois
                          </p>
                        </div>
                      </div>
                      <div className="card border-border">
                        <div className="card-content p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Accélération</p>
                          <p className="text-sm font-semibold">{formatNumber(profil.velocity_metrics.acceleration, 1)}</p>
                        </div>
                      </div>
                      <div className="card border-border">
                        <div className="card-content p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">Volatilité</p>
                          <p className="text-sm font-semibold">{formatNumber(profil.velocity_metrics.volatilite, 1)}%</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* ========== ONGLET HISTORIQUE ========== */}
              {activeTab === 'historique' && (
                <div className="tab-content space-y-3">
                  {surveillancesPrecedentes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucune surveillance antérieure</p>
                    </div>
                  ) : (
                    surveillancesPrecedentes.map(s => (
                      <div key={s.id} className="card border-border">
                        <div className="card-content p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="text-sm font-medium capitalize">{s.type?.replace(/_/g, ' ')}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(s.date_debut).toLocaleDateString('fr-FR')} → {new Date(s.date_fin).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                            <span className={`badge ${s.statut === 'rapport_signe' ? 'success' : 'warning'}`}>{s.statut}</span>
                          </div>
                          {s.progression !== undefined && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span>Progression</span>
                                <span>{s.progression}%</span>
                              </div>
                              <div className="progress h-1">
                                <div className="progress-bar" style={{ width: `${s.progression}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  
                  {nbEcartsCritiques > 0 && (
                    <div className="alert alert-warning">
                      <AlertTriangle className="alert-icon" />
                      <div className="alert-content">
                        <div className="alert-title">Écarts non résolus</div>
                        <div className="alert-description">{nbEcartsCritiques} écart(s) critique(s) actif(s) - suivi prioritaire requis</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* ========== ONGLET CHECKLIST ========== */}
              {activeTab === 'checklist' && (
                <div className="tab-content space-y-3">
                  <div className={`alert ${checklistType === 'mixte' ? 'alert-warning' : isSgsPortee ? 'alert-info border-purple-300 bg-purple-50' : 'alert-info'}`}>
                    <div className="flex items-start gap-3">
                      {getTypeIcon()}
                      <div className="flex-1">
                        <div className="alert-title">Type recommandé</div>
                        <div className="alert-description">{getTypeLabel()}</div>
                        {isSgsPortee && (
                          <div className="text-xs mt-2 space-y-0.5">
                            <p>• 4 Piliers PAOE : Politique, Assurance, Opérations, Expertise</p>
                            <p>• 5 niveaux de maturité (OACI Annexe 19 / Doc 9859)</p>
                            <p>• Génération automatique du score de maturité SGS</p>
                          </div>
                        )}
                        {checklistType === 'mixte' && !isSgsPortee && (
                          <div className="text-xs mt-2">
                            • Items de suivi des écarts<br />
                            • Items de mise en œuvre PAC
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isSgsPortee && (
                    <div className="card border-border">
                      <div className="card-header">
                        <div className="card-title text-sm">Aperçu des items à vérifier</div>
                      </div>
                      <div className="card-content">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Items standards (checklist RAS-14)</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2"><span className="badge success text-[10px]">SA</span><span>Items satisfaisants (prédiction)</span></div>
                              <div className="flex items-center gap-2"><span className="badge danger text-[10px]">NS</span><span>Non-conformités identifiées</span></div>
                              <div className="flex items-center gap-2"><span className="badge warning text-[10px]">NV</span><span>Points à vérifier sur site</span></div>
                            </div>
                          </div>
                          {(checklistType === 'suivi' || checklistType === 'mixte') && (
                            <div className="border-t border-border pt-2">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">Items de suivi des écarts</p>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-sm"><span>• Vérification état d'avancement des écarts</span><span className="badge warning">3 items</span></div>
                                <div className="flex items-center justify-between text-sm"><span>• Validation des actions correctives</span><span className="badge warning">2 items</span></div>
                              </div>
                            </div>
                          )}
                          {(checklistType === 'pac' || checklistType === 'mixte') && (
                            <div className="border-t border-border pt-2">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">Items de mise en œuvre PAC</p>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-sm"><span>• Vérification des actions PAC</span><span className="badge warning">4 items</span></div>
                                <div className="flex items-center justify-between text-sm"><span>• Évaluation efficacité des mesures</span><span className="badge warning">2 items</span></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    {!isSgsPortee && (
                      <button className="btn btn-secondary btn-sm gap-1" onClick={handlePrefillChecklist}>
                        <Brain className="w-3 h-3" />
                        Pré-remplir avec l'historique
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {/* ========== ONGLET DÉLÉGATION ========== */}
              {activeTab === 'delegation' && (
                <div className="tab-content space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Attribuez chaque domaine à un inspecteur pour une répartition claire des tâches.
                  </p>
                  
                  {domainesList.map(({ code, label }) => (
                    <div key={code} className="card border-border">
                      <div className="card-content p-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-2">
                            <span className="badge primary">{code}</span>
                            <span className="text-xs text-muted-foreground">{label}</span>
                            {delegations[code] && (
                              <span className="badge success text-[10px] flex items-center gap-1">
                                <CheckCircle2 className="w-2 h-2" />
                                Assigné
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              className="form-select text-sm py-1 h-8"
                              value={delegations[code] || ''}
                              onChange={(e) => setDelegations(prev => ({ ...prev, [code]: e.target.value }))}
                            >
                              <option value="">Non assigné</option>
                              {inspecteursDisponibles.map(insp => (
                                <option key={insp.id} value={insp.id}>
                                  {insp.prenom} {insp.nom} ({insp.service || 'Inspecteur'})
                                </option>
                              ))}
                            </select>
                            {delegations[code] && (
                              <button
                                onClick={() => setDelegations(prev => ({ ...prev, [code]: '' }))}
                                className="btn btn-sm px-3 py-1 btn-danger"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    💡 La délégation est optionnelle. Si vous ne déléguez pas, tous les inspecteurs pourront voir l'ensemble des domaines.
                  </p>
                  
                  {Object.keys(delegations).filter(d => delegations[d]).length > 0 && (
                    <div className="card border-success bg-success/5">
                      <div className="card-content p-3">
                        <p className="text-xs font-semibold text-success mb-2">Résumé des délégations</p>
                        <div className="space-y-1">
                          {Object.entries(delegations).filter(([_, id]) => id).map(([code, id]) => {
                            const inspecteur = inspecteursDisponibles.find(i => i.id === id);
                            return (
                              <div key={code} className="flex items-center justify-between text-xs">
                                <span className="font-medium">{code} - {getDomaineLabel(code)}</span>
                                <span className="text-gray-600">→ {inspecteur?.prenom} {inspecteur?.nom}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end">
                    <button className="btn btn-primary btn-sm gap-1" onClick={handleSaveDelegations}>
                      <Save className="w-3 h-3" />
                      Enregistrer les délégations
                    </button>
                  </div>
                </div>
              )}
              
            </div>
            
            {/* Footer */}
            <div className="modal-footer border-t border-border flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={() => setPreparationOpen(false)}>
                Annuler
              </button>
              <button className="btn btn-secondary gap-2" onClick={handleNotifyOperator} title="Envoyer la checklist aux exploitants">
                <Send className="w-4 h-4" /> Envoyer la checklist
              </button>
              <button className="btn btn-primary gap-2" onClick={handleOpenChecklist}>
                <PlayCircle className="w-4 h-4" />
                {isSgsPortee
                  ? 'Ouvrir l\'évaluation SGS (PAOE)'
                  : preparationPlanning.checklist_hierarchy && preparationPlanning.checklist_hierarchy.length > 0
                    ? 'Modifier la checklist'
                    : 'Ouvrir la checklist pré-remplie'}
              </button>
            </div>
            
          </div>
        </div>

      </div>
        {/* Type choice modal */}
        {showTypeChoice && (
          <div className="modal-overlay" data-role={userRole} onClick={() => setShowTypeChoice(false)}>
            <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
                <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
                  <div className="modal-title flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-role-primary" />
                    Choisir le type de checklist
                  </div>
                  <button className="modal-close" onClick={() => setShowTypeChoice(false)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="modal-body py-5 px-5 space-y-4">
                  <p className="text-sm text-muted-foreground">Plusieurs types de checklist sont disponibles pour cette surveillance. Sélectionnez celui à ouvrir :</p>
                  {(function () {
                    const p = preparationPlanning?.portee || [];
                    const isSgsOnly = p.length === 1 && p[0] === 'SGS';
                    const hasSGS = p.includes('SGS');
                    const ecartsA = (ecarts || []).filter((e: Ecart) => e.aerodrome_id === preparationPlanning?.aerodrome_id && e.statut !== 'cloture');
                    const opts: { type: string; label: string; desc: string; icon: React.ElementType }[] = [];
                    if (!isSgsOnly) opts.push({ type: 'standard', label: 'Checklist Standard', desc: 'Items standards RAS-14', icon: ClipboardList });
                    if (hasSGS) opts.push({ type: 'sgs', label: 'Évaluation SGS', desc: 'Maturité PAOE (Annexe 19 OACI)', icon: Shield });
                    if (ecartsA.length > 0) opts.push({ type: 'suivi', label: 'Suivi des écarts', desc: `${ecartsA.length} écart(s) actif(s)`, icon: AlertTriangle });
                    if (ecartsA.some((e: Ecart) => e.pac)) opts.push({ type: 'pac', label: 'Mise en œuvre PAC', desc: 'Plans d\'action corrective', icon: CheckCircle2 });
                    return opts;
                  })().map(opt => (
                    <button key={opt.type} type="button" className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left" onClick={() => {
                      setShowTypeChoice(false);
                      setPreparationOpen(false);
                      if (opt.type === 'sgs') {
                        router.push(`/preparation-checklist/${preparationPlanning?.id}?type=sgs`);
                      } else {
                        router.push(`/preparation-checklist/${preparationPlanning?.id}?type=${opt.type}`);
                      }
                    }}>
                      <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0">
                        <opt.icon className="w-5 h-5 text-role-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </>,
      document.body
    );
  };

  const DeleteConfirmModal = () => {
    if (!deleteDialogOpen) return null;
    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => setDeleteDialogOpen(false)}>
        <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
              <div className="modal-title flex items-center gap-2 text-danger">
                <AlertCircle className="w-5 h-5" />
                Confirmer la suppression
              </div>
              <button className="modal-close" onClick={() => setDeleteDialogOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body py-6 px-5">
              <p className="text-foreground">Êtes-vous sûr de vouloir supprimer ce planning ?</p>
              <p className="text-small text-muted-foreground mt-2">Cette action est irréversible.</p>
            </div>
            <div className="modal-footer border-t border-border p-5 flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={() => setDeleteDialogOpen(false)}>Annuler</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const ExecuteConfirmModal = () => {
    if (!executeConfirmOpen || !executeTarget) return null;
    const aerodrome = aerodromesActifs.find(a => a.id === executeTarget.aerodrome_id) || aerodromes.find(a => a.id === executeTarget.aerodrome_id);
    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>
        <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
              <div className="modal-title flex items-center gap-2 text-role-primary">
                <PlayCircle className="w-5 h-5" />
                Lancer la surveillance
              </div>
              <button className="modal-close" onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body py-6 px-5 space-y-4">
              <div className="p-3 bg-role-primary-soft rounded-lg">
                <p className="text-sm font-medium">Aérodrome: <span className="text-foreground">{aerodrome?.code_oaci} — {aerodrome?.nom}</span></p>
                <p className="text-sm font-medium mt-1">Type: <span className="text-foreground">{executeTarget.type.replace('_', ' ')}</span></p>
                <p className="text-sm font-medium mt-1">Période: <span className="text-foreground">{new Date(executeTarget.date_debut).toLocaleDateString('fr-FR')} → {new Date(executeTarget.date_fin).toLocaleDateString('fr-FR')}</span></p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Vous allez être redirigé vers le module Surveillance</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      La surveillance sera créée automatiquement. Vous pourrez ensuite rédiger la checklist, identifier les écarts et produire le rapport.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer border-t border-border p-5 flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>Annuler</button>
              <button className="btn btn-primary" onClick={handleConfirmExecute}>
                <PlayCircle className="w-4 h-4 mr-1" />
                Continuer vers Surveillance
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const FormModal = () => (
    <FormShell
      open={!!formOpen}
      onClose={() => setFormOpen(false)}
      title={editingPlanning ? 'Modifier le planning' : 'Nouveau planning'}
      icon={CalendarDays}
      size="3xl"
      dataRole={userRole}
    >
      <PlanningForm
        planning={editingPlanning}
        onClose={() => setFormOpen(false)}
        onSuccess={() => { setFormOpen(false); setEditingPlanning(null); }}
      />
    </FormShell>
  );

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="planning">
      
      {/* Bandeau d'alerte sur les mesures d'atténuation en retard */}
      {hasMesuresEnRetard && (
        <div className="alert alert-danger">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">⚠️ Mesures d'atténuation en retard</div>
            <div className="alert-description">
              Des mesures d'atténuation liées à des exemptions sont en retard. 
              Une inspection de type "Mise en œuvre PAC" est recommandée.
            </div>
          </div>
        </div>
      )}

      {/* Bandeau d'information sur les exemptions */}
      {hasExemptionsAnywhere && !hasMesuresEnRetard && (
        <div className="alert alert-info">
          <Shield className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">Exemptions actives détectées</div>
            <div className="alert-description">
              Certains aérodromes bénéficient d'exemptions. Les mesures d'atténuation seront automatiquement ajoutées aux checklists.
            </div>
          </div>
        </div>
      )}

      {/* En-tête */}
      <ModuleHeader
        icon={<CalendarDays />}
        title="Planning des Surveillances"
        description="Gestion et planification des surveillances"
        actions={<div className="flex items-center gap-3">
          <button onClick={handleNewPlanning} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Nouveau planning
          </button>
        </div>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <CalendarDays className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Planifiées</div>
          <div className="kpi-value">{stats.planifiees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <Activity className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">En cours</div>
          <div className="kpi-value">{stats.enCours}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Réalisées</div>
          <div className="kpi-value">{stats.realisees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <AlertCircle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">En retard</div>
          <div className="kpi-value text-danger">{stats.enRetard}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-info-soft">
            <TrendingUp className="w-5 h-5 text-info" />
          </div>
          <div className="kpi-label">Taux exec.</div>
          <div className="kpi-value">{stats.executionRate}%</div>
          <div className="progress h-1 mt-1">
            <div className="progress-bar" style={{ width: `${stats.executionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md space-y-3">
        <div className="flex flex-wrap items-center gap-2">
           <div className="view-toggle">
             {viewButtons.map((view) => {
               const Icon = view.icon;
               return (
                 <button
                   key={view.id}
                   onClick={() => setViewMode(view.id as ViewMode)}
                   className={viewMode === view.id ? 'active' : ''}
                 >
                   <Icon className="w-4 h-4" />
                   <span>{view.label}</span>
                 </button>
               );
             })}
           </div>
           
            {/* Bouton Suggestions IA — animé selon la sévérité des déclencheurs */}
            {(() => {
              const totalCritiques    = aerodromesRisque.reduce((sum, a) => sum + (a.nbTriggersCritiques || 0), 0);
              const totalHautes       = aerodromesRisque.reduce((sum, a) => sum + (a.nbTriggersHautes    || 0), 0);
              const totalPacEnAttente = aerodromesRisque.filter(a => a.hasPacAccepteEnAttente).length;
              const badgeCount        = totalCritiques + totalHautes + totalPacEnAttente;

              // ── états ────────────────────────────────────────────────────────
              // ouvert   : panneau IA déjà visible      → bleu stable, pas de pulse
              // critique : triggers critiques ou PAC    → rouge, double ring-ping + pulse
              // eleve    : triggers hauts seulement     → orange, ring-ping + pulse
              // calme    : aucun déclencheur urgent     → secondaire, pas d'animation
              const urgent  = !showProactiveSuggestions && (totalCritiques > 0 || totalPacEnAttente > 0);
              const warning = !showProactiveSuggestions && !urgent && totalHautes > 0;
              const ouvert  = showProactiveSuggestions;

              const badge = badgeCount > 0 && (
                <span className={`badge text-[10px] ${urgent ? 'danger' : 'warning'}`}>
                  {badgeCount}
                </span>
              );

              const titleText = urgent
                ? `${totalCritiques} urgence(s) critique(s) · ${totalPacEnAttente} PAC en attente — cliquer pour traiter`
                : warning
                ? `${totalHautes} alerte(s) haute(s) — cliquer pour voir les suggestions`
                : ouvert
                ? 'Fermer le panneau de suggestions'
                : 'Suggestions IA & Profil';

              /* ── État CRITIQUE : ring-ping rouge + pulse bouton ── */
              if (urgent) return (
                <div className="relative inline-flex shrink-0">
                  <span className="absolute inset-0 rounded-md animate-ping bg-danger/35 pointer-events-none" />
                  <button
                    onClick={() => setShowProactiveSuggestions(!showProactiveSuggestions)}
                    className="btn btn-danger gap-2 animate-pulse relative"
                    title={titleText}
                  >
                    <Brain className="w-4 h-4" />
                    <span>Suggestions IA</span>
                    {badge}
                  </button>
                </div>
              );

              /* ── État ÉLEVÉ : ring-ping orange + pulse bouton ── */
              if (warning) return (
                <div className="relative inline-flex shrink-0">
                  <span className="absolute inset-0 rounded-md animate-ping bg-warning/30 pointer-events-none" />
                  <button
                    onClick={() => setShowProactiveSuggestions(!showProactiveSuggestions)}
                    className="btn btn-warning gap-2 animate-pulse relative"
                    title={titleText}
                  >
                    <Brain className="w-4 h-4" />
                    <span>Suggestions IA</span>
                    {badge}
                  </button>
                </div>
              );

              /* ── État OUVERT : bleu stable ── */
              if (ouvert) return (
                <button
                  onClick={() => setShowProactiveSuggestions(false)}
                  className="btn btn-primary gap-2"
                  title={titleText}
                >
                  <Brain className="w-4 h-4" />
                  <span>Suggestions IA</span>
                </button>
              );

              /* ── État CALME : secondaire, pas d'animation ── */
              return (
                <button
                  onClick={() => setShowProactiveSuggestions(true)}
                  className="btn btn-secondary gap-2"
                  title={titleText}
                >
                  <Brain className="w-4 h-4" />
                  <span>Suggestions IA</span>
                </button>
              );
            })()}
         </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Nom, code OACI ou type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
            <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
          </select>

          <select
            value={selectedAerodrome}
            onChange={(e) => setSelectedAerodrome(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">Tous les aérodromes</option>
            {aerodromesActifs.map(a => {
              const hasExemptions = exemptionsActivesParAerodrome.has(a.id);
              return (
                <option key={a.id} value={a.id}>
                  {a.code_oaci} - {a.nom}{hasExemptions ? ' ⚠️' : ''}
                </option>
              );
            })}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            {typeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={selectedStatut}
            onChange={(e) => setSelectedStatut(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            {statutOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* ── Filtre de visibilité style view-toggle ──*/}
          <div className="view-toggle">
            <button
              onClick={() => setVisibilityFilter('active')}
              className={visibilityFilter === 'active' ? 'active' : ''}
            >
              <PlayCircle className="w-4 h-4" />
              <span>Actives</span>
            </button>
            <button
              onClick={() => setVisibilityFilter('all')}
              className={visibilityFilter === 'all' ? 'active' : ''}
            >
              <List className="w-4 h-4" />
              <span>Tout</span>
            </button>
            <button
              onClick={() => setVisibilityFilter('retards')}
              className={visibilityFilter === 'retards' ? 'active' : ''}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Retards</span>
            </button>
          </div>

          <div className="view-toggle">
            <button
              onClick={() => setShowPropositions(false)}
              className={!showPropositions ? 'active' : ''}
            >
              N
            </button>
            <button
              onClick={() => setShowPropositions(true)}
              className={showPropositions ? 'active' : ''}
            >
              N+1
            </button>
          </div>

          <button onClick={resetFilters} className="action-button" title="Réinitialiser les filtres">
            <X className="w-4 h-4" />
          </button>

          {processusActifs.length > 0 && (
            <button
              onClick={() => setShowProcessus(!showProcessus)}
              className={`filter-chip ${showProcessus ? 'active' : ''}`}
            >
              <Shield className="w-3 h-3 mr-1" />
              Certification / Homologation
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-primary text-white">{processusActifs.length}</span>
            </button>
          )}

          <button onClick={handleExportCSV} className="action-button" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Assistant IA */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={iaQuestion}
              onChange={(e) => setIaQuestion(e.target.value)}
              placeholder="Demandez conseil à l'IA pour la planification..."
              className={`flex-1 form-input text-sm ${focusClass}`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAskAssistant(); }}
            />
            <button
              onClick={handleAskAssistant}
              disabled={isAskingIa || !iaQuestion.trim()}
              className="btn btn-primary gap-2"
            >
              {isAskingIa
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Demander
            </button>
          </div>
          {iaAnswer && (
            <div className="mt-2 p-2 bg-primary-soft/50 rounded-lg text-sm">
              <Brain className="w-3 h-3 inline mr-1 text-role-primary" />
              {iaAnswer}
            </div>
          )}
        </div>
      </div>

      {/* Indicateur N/N+1 */}
      {showPropositions && (
        <div className="alert alert-warning">
          <AlertCircle className="alert-icon" />
          <div className="alert-content">
            <div className="alert-description">
              Mode proposition N+1 - Les plannings proposés sont en attente de validation
            </div>
          </div>
          <span className="badge warning animate-pulse">{selectedYear + 1}</span>
        </div>
      )}

      {/* Vue Liste */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {planningsByAerodrome.map(({ aerodrome, plannings: aeroPlannings, stats: aeroStats, aDesExemptions, aDesMesuresEnRetard }) => {
            const risqueData = aerodromesRisque.find(a => a.id === aerodrome.id);
            const hasRisque = risqueData?.niveauAlerte === 'critique' || risqueData?.niveauAlerte === 'haute';
            
            return (
              <AccordionSection
                key={aerodrome.id}
                icon={<MapPin className="w-4 h-4 text-white" />}
                title={
                  <span>
                    <span className="code-oaci-badge">{aerodrome.code_oaci}</span>
                    <span className="ml-2 text-foreground font-medium">{aerodrome.nom}</span>
                  </span>
                }
                badges={
                  <>
                    {risqueData?.niveauAlerte === 'critique' && (
                      <span className="badge danger animate-pulse">Critique</span>
                    )}
                    {risqueData?.niveauAlerte === 'haute' && (
                      <span className="badge warning">Haute priorité</span>
                    )}
                    {aDesExemptions && !hasRisque && (
                      <span className="badge warning flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Exemption(s)
                      </span>
                    )}
                    <span className="badge outline">{aeroPlannings.length} planning(s)</span>
                  </>
                }
                actions={
                  <div className="flex items-center gap-3 text-small text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" />{aeroStats.realisees}</span>
                    <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-danger" />{aeroStats.enRetard}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-primary" />{aeroStats.planifiees}</span>
                    <div className="progress w-24 h-1.5">
                      <div className="progress-bar" style={{ width: `${aeroStats.total > 0 ? (aeroStats.realisees / aeroStats.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                }
                className={hasRisque ? 'border-l-4 border-l-danger' : aDesExemptions ? 'border-l-4 border-l-warning' : ''}
              >
                {/* Alerte si mesures en retard */}
                {aDesMesuresEnRetard && (
                  <div className="alert alert-danger mb-2 p-2 text-sm">
                    <AlertTriangle className="alert-icon" />
                    <div className="alert-content">
                      <p className="text-small font-medium">Mesures d'atténuation en retard</p>
                      <p className="text-xs">Une inspection de type "Mise en oeuvre PAC" est recommandée.</p>
                    </div>
                  </div>
                )}

                {/* Alerte si exemptions actives */}
                {aDesExemptions && !aDesMesuresEnRetard && (
                  <div className="alert alert-info mb-2 p-2 text-sm">
                    <Shield className="alert-icon" />
                    <div className="alert-content">
                      <p className="text-small">Exemptions actives - Les mesures d'atténuation seront ajoutées aux checklists</p>
                    </div>
                  </div>
                )}

                {risqueData && risqueData.frequenceSuggestion && (
                  <div className="card bg-primary/5 border border-primary/20">
                    <p className="text-xs font-semibold text-primary flex items-center gap-2">
                      <Target className="w-3.5 h-3.5" />
                      Analyse prédictive - Recommandations
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2 text-sm">
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Fréquence</span>
                        <p className="font-bold text-primary">{risqueData.frequenceSuggestion.label}</p>
                        <p className="text-[10px] text-muted-foreground">{risqueData.frequenceSuggestion.justification}</p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Type suggéré</span>
                        <p className="font-bold text-primary capitalize">
                          {risqueData.decisionSurveillance.type === 'maintien' ? 'Maintien' :
                           risqueData.decisionSurveillance.type === 'inopine' ? 'Inopinée' :
                           risqueData.decisionSurveillance.type === 'periodique' ? 'Périodique' : risqueData.decisionSurveillance.type}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{risqueData.decisionSurveillance.raison}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Délai: {risqueData.decisionSurveillance.delaiRecommandation}j · {risqueData.decisionSurveillance.domainesCibles.length} domaine(s)
                        </p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Écarts critiques</span>
                        <p className={`font-bold ${risqueData.nbEcartsCritiques > 0 ? 'text-danger' : 'text-success'}`}>
                          {risqueData.nbEcartsCritiques} actif(s)
                        </p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Exemptions</span>
                        <p className={`font-bold ${risqueData.aDesExemptions ? 'text-warning' : 'text-success'}`}>
                          {risqueData.aDesExemptions ? 'Oui' : 'Non'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {aeroPlannings.map((planning: any) => (
                  <div key={planning.id} className="space-y-1">
                    {showProcessus && (() => {
                      const pr = processusActifs.find(p => p.aerodrome_id === planning.aerodrome_id && p.processus_type === planning.type);
                      return pr ? (
                        <div className="flex items-center gap-2 px-1">
                          <span className={`badge ${pr.processus_type === 'certification' ? 'primary' : 'info'} text-[10px]`}>
                            {pr.phase_label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(pr.progression)}%
                          </span>
                          <div className="progress w-16 h-1.5 ml-1">
                            <div className="progress-bar" style={{ width: `${pr.progression}%` }} />
                          </div>
                          <button className="action-button text-[10px] text-role-primary hover:underline" onClick={() => setActiveModule?.(pr.processus_type)}>
                            Voir le processus →
                          </button>
                        </div>
                      ) : null
                    })()}
                   <PlanningCard
                     key={planning.id}
                     planning={planning}
                     aerodrome={aerodrome}
                     onPrepare={() => handlePrepare(planning)}
                     onExecute={() => handleRequestExecute(planning)}
                     onView={() => handleView(planning)}
                     onEdit={() => handleEdit(planning)}
                     onDelete={() => handleDelete(planning)}
                     isLancee={planning.isLancee}
                     surveillanceId={planning.surveillanceId}
                     userRole={userRole}
                     profilScore={planning.profilScore}
                     onSuggestionIA={(p) => {
                       // Ouvrir le formulaire avec suggestions IA
                       setEditingPlanning(p);
                       setFormOpen(true);
                        // Déclencher la suggestion après ouverture
                        if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                        suggestionsTimerRef.current = setTimeout(() => {
                          handleAppliquerSuggestionsGlobal(p);
                        }, 500);
                     }}
                    />
                  </div>
                ))}
              </AccordionSection>
            );
          })}

          {planningsByAerodrome.length === 0 && (
            <div className="card">
              <div className="card-content py-12 text-center text-muted-foreground">
                <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Aucun planning trouvé pour les filtres sélectionnés</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggestions IA & Profil - Panneau de déclenchement */}
      {showProactiveSuggestions && (
        <div className="card border-primary mb-6 animate-fade-up">
          <div className="card-header bg-gradient-to-r from-primary/10 to-transparent">
            <div className="card-title flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Suggestions IA — Déclencheurs PAC & Écarts
            </div>
            <button 
              onClick={() => setShowProactiveSuggestions(false)}
              className="modal-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {aerodromesRisque
                .filter(a => (a.ecartTriggers && a.ecartTriggers.length > 0) || a.niveauAlerte === 'critique' || a.niveauAlerte === 'haute')
                .sort((a, b) => {
                  const order: Record<string, number> = { 'critique': 0, 'haute': 1, 'moyenne': 2 };
                  return (a.nbTriggersCritiques || 0) - (b.nbTriggersCritiques || 0) || (order[a.niveauAlerte as string] ?? 3) - (order[b.niveauAlerte as string] ?? 3);
                })
                .map((aero: AerodromeRisque) => (
                  <AccordionSection
                    key={aero.id}
                    icon={<Brain className="w-4 h-4 text-white" />}
                    title={
                      <span>
                        <span className="code-oaci-badge">{aero.code_oaci}</span>
                        <span className="ml-2 font-medium">{aero.nom}</span>
                      </span>
                    }
                    badges={
                      <>
                        {aero.nbTriggersCritiques > 0 && (
                          <span className="badge danger animate-pulse text-[10px]">{aero.nbTriggersCritiques} urgence(s)</span>
                        )}
                        {aero.nbTriggersHautes > 0 && (
                          <span className="badge warning text-[10px]">{aero.nbTriggersHautes} alerte(s)</span>
                        )}
                        {aero.hasPacAccepteEnAttente && (
                          <span className="badge primary text-[10px]">PAC à vérifier</span>
                        )}
                      </>
                    }
                    className={
                      aero.nbTriggersCritiques > 0 ? 'border-l-4 border-l-danger' :
                      aero.nbTriggersHautes > 0 ? 'border-l-4 border-l-warning' :
                      'border-l-4 border-l-role-primary'
                    }
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Profil de risque</p>
                        <p className={`text-2xl font-bold ${aero.profilScore < 30 ? 'text-danger' : aero.profilScore < 60 ? 'text-warning' : 'text-success'}`}>
                          {aero.profilScore || 'N/A'}/100
                        </p>
                        {aero.profilTendance && (
                          <p className="text-xs text-muted-foreground">Tendance: {aero.profilTendance}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type suggéré</p>
                        <p className="font-medium capitalize">
                          {aero.decisionSurveillance?.type === 'maintien' ? 'Maintien' :
                           aero.decisionSurveillance?.type === 'inopine' ? 'Inopinée' :
                           aero.decisionSurveillance?.type === 'periodique' ? 'Périodique' : aero.decisionSurveillance?.type || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{aero.decisionSurveillance?.raison}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Délai: {aero.decisionSurveillance?.delaiRecommandation || '-'}j</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fréquence</p>
                        <p className="font-medium">{aero.frequenceSuggestion?.label || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Création rapide pour cas critique */}
                    {aero.decisionSurveillance?.priorite === 'critique' && (
                      <div className="flex items-center gap-3 mb-4 p-2 bg-danger/5 border border-danger/20 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                        <span className="text-xs text-danger font-medium flex-1">
                          Action immédiate requise — créer une surveillance d'urgence maintenant
                        </span>
                        <button
                          onClick={() => {
                            setEditingPlanning({
                              id: '', aerodrome_id: aero.id,
                              type: 'audit_complet',
                              date_debut: '', date_fin: '',
                              portee: aero.decisionSurveillance.domainesCibles,
                              equipe_ids: [], chef_id: '',
                              statut: 'planifiee',
                              priorite: 'critique',
                              objectifs: aero.decisionSurveillance.raison,
                              est_proposition: true,
                              annee_cible: selectedYear,
                              created_at: new Date().toISOString(),
                              updated_at: new Date().toISOString(),
                            });
                            setFormOpen(true);
                            if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                            suggestionsTimerRef.current = setTimeout(() => handleAppliquerSuggestionsGlobal({ aerodrome_id: aero.id }), 500);
                          }}
                          className="btn btn-sm btn-danger gap-1 shrink-0"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          Créer maintenant
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      {aero.ecartTriggers?.slice(0, 10).map((trigger) => {
                        const typeLabel = trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'Vérification PAC' : trigger.typeSurveillanceSuggere === 'suivi_ecarts' ? 'Suivi écarts' : 'Audit complet';
                        const urgenceColor = trigger.urgence === 'critique' ? 'border-l-danger bg-danger/5' : trigger.urgence === 'haute' ? 'border-l-warning bg-warning/5' : 'border-l-role-primary bg-muted/30';
                        const statutBadge = trigger.ecart.statut === 'pac_attendu' ? 'badge warning' : trigger.ecart.statut === 'pac_accepte' ? 'badge primary' : trigger.ecart.statut === 'preuves_soumises' ? 'badge success' : 'badge outline';

                        return (
                          <div key={trigger.ecart.id} className={`card border-l-4 ${urgenceColor}`}>
                            <div className="card-content p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-semibold">{trigger.ecart.reference}</span>
                                  <span className={`badge text-[10px] ${statutBadge}`}>{trigger.ecart.statut.replace(/_/g, ' ')}</span>
                                  <span className="badge outline text-[10px]">OACI {trigger.celluleOACI}</span>
                                  {trigger.badgeLabel && (
                                    <span className={`text-[10px] font-medium ${trigger.urgence === 'critique' ? 'text-danger' : trigger.urgence === 'haute' ? 'text-warning' : 'text-muted-foreground'}`}>
                                      {trigger.badgeLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${trigger.predictionResultat === 'SA' ? 'bg-success/20 text-success' : trigger.predictionResultat === 'NS' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'}`}>
                                    {trigger.predictionResultat} ({trigger.predictionConfiance}%)
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{trigger.justification}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">→</span>
                                <span className="text-xs font-medium">{typeLabel}</span>
                                <button
                                  onClick={() => {
                                    setEditingPlanning({
                                      id: '', aerodrome_id: aero.id,
                                      type: trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'mise_oeuvre_pac' : trigger.typeSurveillanceSuggere === 'suivi_ecarts' ? 'suivi_ecarts' : 'audit_complet',
                                      date_debut: '', date_fin: '', portee: [], equipe_ids: [], chef_id: '',
                                      statut: 'planifiee', priorite: trigger.urgence === 'critique' ? 'critique' : trigger.urgence === 'haute' ? 'haute' : 'moyenne',
                                      objectifs: `Surveillance déclenchée: ${trigger.justification}`,
                                      est_proposition: true, annee_cible: selectedYear,
                                      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                                    });
                                    setFormOpen(true);
                                    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                                    suggestionsTimerRef.current = setTimeout(() => handleAppliquerSuggestionsGlobal({ aerodrome_id: aero.id }), 500);
                                    submitSuggestionFeedback(aero.id, trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'surveillance_pac' : 'surveillance_ecarts', trigger.typeSurveillanceSuggere, true, undefined, [trigger.ecart.id]);
                                  }}
                                  className="btn btn-sm btn-primary gap-1"
                                >
                                  <PlayCircle className="w-3 h-3" />
                                  Planifier
                                </button>
                                <button
                                  onClick={() => openFeedbackModal(aero.id, trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'surveillance_pac' : 'surveillance_ecarts', trigger.typeSurveillanceSuggere, [trigger.ecart.id])}
                                  className="btn btn-sm btn-outline gap-1"
                                >
                                  <X className="w-3 h-3" />
                                  Ignorer
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Suggestions de maintien */}
                    {aero.suggestionsMaintien && aero.suggestionsMaintien.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-role-primary" />
                          Suggestions de maintien ({aero.suggestionsMaintien.length})
                        </p>
                        <div className="space-y-2">
                          {aero.suggestionsMaintien.map((s, idx) => (
                            <div key={idx} className="card border-l-4 border-l-primary bg-primary/5">
                              <div className="card-content p-3">
                                <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                  <span className="text-xs font-medium">{s.raison}</span>
                                  <span className="badge outline text-[10px]">{s.confiance}%</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {s.domaines.map((d: string) => (
                                    <span key={d} className="code-oaci-badge text-[10px]">{d}</span>
                                  ))}
                                  {s.typesChecklist.map((t: string) => (
                                    <span key={t} className="badge neutral text-[10px]">{t.replace(/_/g, ' ')}</span>
                                  ))}
                                </div>
                                <span className="text-[10px] text-muted-foreground mt-1 block">
                                  Source: {s.source === 'ecart_actif' ? 'Écart actif' : s.source === 'evenement_securite' ? 'Événement sécurité' : s.source === 'conformite_baisse' ? 'Conformité' : s.source === 'domaine_critique' ? 'Domaine critique' : s.source === 'historique' ? 'Historique' : s.source === 'lanceur_alerte' ? 'Lanceur alerte' : s.source}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Domaines critiques */}
                    {aero.domainesCritiques && aero.domainesCritiques.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">Domaines à surveiller</p>
                        <div className="space-y-2">
                          {aero.domainesCritiques.map((d, idx) => (
                            <div key={idx} className="card border-l-4 border-l-primary bg-primary/5">
                              <div className="card-content p-3">
                                <div className="flex items-center justify-between">
                                  <span className={`badge text-[10px] ${d.score < 30 ? 'danger' : d.score < 60 ? 'warning' : 'primary'}`}>
                                    {d.domaine} (Score: {d.score})
                                  </span>
                                  <span className="text-xs text-muted-foreground">Seuil: {d.seuil}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {aero.nbEcartsCritiques > 0 && (
                        <span className="badge danger text-[10px]">{aero.nbEcartsCritiques} écart(s) critique(s)</span>
                      )}
                      {aero.aDesExemptions && (
                        <span className="badge warning text-[10px]">Exemptions actives</span>
                      )}
                      {aero.aDesMesuresEnRetard && (
                        <span className="badge danger text-[10px] animate-pulse">Mesures en retard</span>
                      )}
                    </div>
                  </AccordionSection>
                ))}

              {aerodromesRisque.filter(a => (a.ecartTriggers && a.ecartTriggers.length > 0) || a.niveauAlerte === 'critique' || a.niveauAlerte === 'haute').length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun déclencheur actif — toutes les surveillances sont sous contrôle.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Feedback Suggestion IA */}
      {feedbackModalOpen && createPortal(
        <div className="modal-backdrop" onClick={() => setFeedbackModalOpen(false)}>
          <div className="modal-content max-w-md rounded-2xl overflow-hidden border-t-4 border-t-role-primary" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2">
                <Brain className="w-5 h-5 text-role-primary" />
                Feedback sur la suggestion
              </div>
              <button onClick={() => setFeedbackModalOpen(false)} className="modal-close"><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Cette suggestion était-elle pertinente ?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setFeedbackValue(true); setFeedbackReason(''); }}
                  className={`flex-1 py-3 rounded-lg border-2 text-center font-medium transition-all ${feedbackValue ? 'border-success bg-success/10 text-success' : 'border-border hover:bg-muted'}`}
                >
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                  Oui, pertinent
                </button>
                <button
                  onClick={() => { setFeedbackValue(false); }}
                  className={`flex-1 py-3 rounded-lg border-2 text-center font-medium transition-all ${!feedbackValue ? 'border-danger bg-danger/10 text-danger' : 'border-border hover:bg-muted'}`}
                >
                  <XCircle className="w-5 h-5 mx-auto mb-1" />
                  Non, pas pertinent
                </button>
              </div>
              {!feedbackValue && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Pourquoi ?</label>
                  <select
                    value={feedbackReason}
                    onChange={(e) => setFeedbackReason(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
                  >
                    <option value="">Sélectionnez une raison</option>
                    <option value="Type incorrect">Type de surveillance incorrect</option>
                    <option value="Pas le bon moment">Pas le bon moment</option>
                    <option value="Déjà planifié">Déjà planifié ailleurs</option>
                    <option value="Priorité trop basse">Priorité trop basse</option>
                    <option value="Autre">Autre raison</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setFeedbackModalOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={confirmFeedback}>Envoyer</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Vues modales */}
      {viewMode === 'calendar' && (
        <PlanningCalendarView
          plannings={filteredPlannings}
          aerodromes={aerodromes}
          onSelectEvent={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {viewMode === 'gantt' && (
        <PlanningGanttView
          plannings={filteredPlannings}
          aerodromes={aerodromes}
          selectedYear={selectedYear}
          userRole={userRole}
        />
      )}

      {viewMode === 'workload' && <WorkloadView userRole={userRole} />}
      {viewMode === 'assignment' && <SmartAssignment userRole={userRole} />}
      {viewMode === 'nplus1' && <PlanningNPlus1 onClose={() => setViewMode('list')} userRole={userRole} />}

      {/* Modales */}
      <FormModal />
      <DeleteConfirmModal />
      <ExecuteConfirmModal />
      <PreparationModal />
    </div>
  );
}
