// components/modules/homologation/HomologationModule.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Scale,
  ShieldCheck,
  AlertCircle,
  ClipboardList,
  Eye,
  PenSquare,
  Trash2,
  Lock,
  CheckCircle2,
  Clock,
  FileText,
  Calendar,
  Users,
  MapPin,
  Download,
  Upload,
  XCircle,
  Search,
  X,
  User,
  Paperclip,
  AlertTriangle,
  Shield,
  Brain,
  Loader2,
  BarChart3,
  List,
  Archive,
} from 'lucide-react';

import { useAppStore, Homologation, Aerodrome, Planning } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { FormShell } from '@/components/ui/FormShell';
import { certificationAgent, CertificationAnalysisResult } from '@/lib/ia/agents/certificationAgent';
import { getPhaseStats as getHomoPhaseStats } from '@/lib/homologationUtils';
import { CertificationDocumentUpload } from '../certification/CertificationDocumentUpload';
import { SignatureSection } from '../signatures/SignatureSection';
import { LettreTransmissionUpload } from '@/components/ui/LettreTransmissionUpload';
import { HomoDashboard } from './HomoDashboard';
import { ExemptionManager } from '../exemptions/ExemptionManager';
import { ArchiveAccordion } from '../archive/ArchiveAccordion';
import { PhaseDocsModal } from '../certification/PhaseDocsModal';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

interface HomologationModuleProps {
  userRole?: string;
  user?: { role?: string; id?: string; prenom?: string; nom?: string };
}

// Types pour les phases
interface PhaseInfo {
  phase: 1 | 2 | 3;
  title: string;
  icon: React.ElementType;
  description: string;
}

interface PhaseCardProps {
  phase: 1 | 2 | 3;
  title: string;
  icon: React.ElementType;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  data?: Homologation['phases_data']['phase1'];
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onNotify?: () => void;
  onManageExemptions?: () => void;
  lastActivity: string | null;
  daysInactive: number;
}

type HomologationPhaseDataLocal =
  Partial<NonNullable<Homologation['phases_data']['phase1']>> &
  Partial<NonNullable<Homologation['phases_data']['phase2']>> &
  Partial<NonNullable<Homologation['phases_data']['phase3']>> &
  { [key: string]: any };

interface PhaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: number;
  aerodrome: Aerodrome;
  homologation: Homologation | undefined;
  onSave: (phaseData: Partial<HomologationPhaseDataLocal>, advancePhase?: boolean) => void | Promise<void>;
  userRole: string;
}

const PHASES: PhaseInfo[] = [
  { phase: 1, title: "Demande Formelle", icon: ClipboardList, description: "Instruction du dossier d'homologation" },
  { phase: 2, title: "Vérification sur Site", icon: MapPin, description: "Visite de vérification terrain" },
  { phase: 3, title: "Délivrance Décision", icon: Scale, description: "Décision d'homologation" },
];

// Composant PhaseCard
function PhaseCard({
  phase,
  title,
  icon: Icon,
  description,
  isActive,
  isCompleted,
  isLocked,
  data,
  onView,
  onEdit,
  onDelete,
  onNotify,
  onManageExemptions,
  lastActivity,
  daysInactive
}: PhaseCardProps) {
  const getProgressValue = () => {
    if (isCompleted) return 100;
    if (isActive) {
      if (data?.completude) return data.completude;
      return 50;
    }
    return 0;
  };

  const getStatusBadge = () => {
    if (isCompleted) return <span className="badge success">Complété</span>;
    if (isActive) return <span className="badge primary pulse">En cours</span>;
    if (isLocked) return <span className="badge neutral">Verrouillé</span>;
    if (daysInactive > 60) return <span className="badge danger pulse">Bloqué</span>;
    if (daysInactive > 30) return <span className="badge warning">Inactif</span>;
    return <span className="badge neutral">À venir</span>;
  };

  const getBlockedAlert = () => {
    if (isActive && daysInactive > 60) {
      return (
        <div className="flex items-center gap-1 text-xs text-danger mt-2">
          <AlertCircle className="h-3 w-3" />
          <span>+{daysInactive} jours sans activité</span>
        </div>
      );
    }
    if (isActive && daysInactive > 30) {
      return (
        <div className="flex items-center gap-1 text-xs text-warning mt-2">
          <Clock className="h-3 w-3" />
          <span>{daysInactive} jours sans mise à jour</span>
        </div>
      );
    }
    return null;
  };

  const getDocumentsCount = () => {
    if (!data?.documents) return { total: 0, uploaded: 0 };
    const total = Object.keys(data.documents).length;
    const uploaded = Object.values(data.documents).filter(Boolean).length;
    return { total, uploaded };
  };

  const docs = getDocumentsCount();
  const progress = getProgressValue();

  return (
    <Card variant={isActive ? "role" : "default"} size="sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className={`kpi-icon !w-10 !h-10 ${isActive ? 'bg-role-primary-soft' : isCompleted ? 'bg-success/10' : 'bg-muted/30'}`}>
            <Icon className={`h-5 w-5 ${isActive ? 'text-role-primary' : isCompleted ? 'text-success' : 'text-muted'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-foreground">
                Phase {phase} : {title}
              </h4>
              {isLocked && <Lock className="h-3 w-3 text-muted" />}
            </div>
            <p className="text-small text-muted">{description}</p>

            <div className="flex flex-wrap gap-4 mt-2 text-xs">
              {data?.date_reception && (
                <div className="flex items-center gap-1 text-muted">
                  <Calendar className="h-3 w-3" />
                  <span>Début: {new Date(data.date_reception).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              {data?.cloture_le && (
                <div className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Clôturé: {new Date(data.cloture_le).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              {!!(data as Record<string, unknown>)?.responsable_nom && (
                <div className="flex items-center gap-1 text-muted">
                  <User className="h-3 w-3" />
                  <span>{String((data as Record<string, unknown>).responsable_nom ?? '')}</span>
                </div>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted">Progression</span>
                <span className="text-foreground">{progress}%</span>
              </div>
              <div className="progress h-1.5">
                <div
                  className={`progress-bar ${progress === 100 ? 'progress-faible' : progress >= 70 ? 'progress-moyen' : progress >= 40 ? 'progress-eleve' : 'progress-critique'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {docs.total > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <Paperclip className="h-3 w-3 text-muted" />
                <span className="text-xs text-muted">
                  {docs.uploaded}/{docs.total} documents
                </span>
                {docs.uploaded < docs.total && (
                  <span className="text-xs text-warning ml-1">({docs.total - docs.uploaded} manquant(s))</span>
                )}
              </div>
            )}

            {getBlockedAlert()}

            {lastActivity && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted">
                <Clock className="h-3 w-3" />
                <span>Dernière activité: {lastActivity}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          {getStatusBadge()}

          <div className="flex items-center gap-1.5">
            {!isLocked && !isCompleted && (
              <>
                <button className="action-button" onClick={onView} title="Voir les détails">
                  <Eye className="h-4 w-4" />
                </button>
                {(phase !== 1) && (
                  <button className="action-button" onClick={onEdit} title="Modifier">
                    <PenSquare className="h-4 w-4" />
                  </button>
                )}
                {(phase === 3) && onManageExemptions && (
                  <button className="action-button text-role-primary" onClick={onManageExemptions} title="Gérer les exemptions">
                    <Shield className="h-4 w-4" />
                  </button>
                )}
                {(phase !== 1) && onDelete && (
                  <button className="action-button hover:text-danger" onClick={onDelete} title="Réinitialiser la phase">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {onNotify && daysInactive > 30 && (
                  <button className="action-button hover:text-warning" onClick={onNotify} title="Signaler un blocage">
                    <AlertCircle className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
            {isCompleted && (
              <button className="action-button" onClick={onView} title="Voir les détails">
                <Eye className="h-4 w-4" />
              </button>
            )}
            {isLocked && !isCompleted && (
              <div className="text-xs text-muted italic">Phase verrouillée</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Modal de phase
function PhaseModal({
  open,
  onOpenChange,
  phase,
  aerodrome,
  homologation,
  onSave,
  userRole
}: PhaseModalProps) {
  const [phaseData, setPhaseData] = useState<HomologationPhaseDataLocal>(
    homologation?.phases_data?.[`phase${phase}` as keyof Homologation['phases_data']] || {}
  );
  const [activeTab, setActiveTab] = useState('informations');
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspecteurFichiers, setInspecteurFichiers] = useState<{ nom: string; url: string }[]>(
    phaseData.inspecteur_fichiers || []
  );
  const [isDeciding, setIsDeciding] = useState(false);
  const addPlanning = useAppStore(s => s.addPlanning);
  const addSurveillance = useAppStore(s => s.addSurveillance);
  const addNotification = useAppStore(s => s.addNotification);
  const utilisateurs = useAppStore(s => s.utilisateurs);

  useEffect(() => setMounted(true), []);

  const isLocked = homologation?.statut_global === 'archive' || false;
  const isCompleted = phase < (homologation?.phase_active ?? 1);

  const handleAccuseReception = async () => {
    const now = new Date().toISOString();
    setPhaseData({ ...phaseData, statut: 'accuse', date_accuse_reception: now });
    await handleSave(false);
  };

  const handleDecision = async (decision: 'favorable' | 'a_reviser' | 'defavorable') => {
    setIsDeciding(true);
    try {
      const now = new Date().toISOString();
      setPhaseData(prev => ({
        ...prev,
        statut: decision,
        inspecteur_fichiers: inspecteurFichiers,
        date_decision: now,
      }));
      await onSave({
        ...phaseData,
        statut: decision,
        inspecteur_fichiers: inspecteurFichiers,
        date_decision: now,
      }, false);
      onOpenChange(false);
    } finally {
      setIsDeciding(false);
    }
  };

  const handleInspectorFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setInspecteurFichiers(prev => [...prev, { nom: file.name, url }]);
    };
    input.click();
  };

  const removeInspectorFile = (index: number) => {
    setInspecteurFichiers(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'en_attente': return 'warning';
      case 'accuse': return 'primary';
      case 'en_cours': return 'primary';
      case 'favorable': return 'success';
      case 'a_reviser': return 'warning';
      case 'defavorable': return 'danger';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'en_attente': return 'En attente';
      case 'accuse': return 'Accusé réception';
      case 'en_cours': return 'En cours';
      case 'favorable': return 'Favorable';
      case 'a_reviser': return 'À réviser';
      case 'defavorable': return 'Défavorable';
      default: return s;
    }
  };

  const handleCreateSurveillance = async () => {
    if (!aerodrome) return;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const planningId = crypto.randomUUID();
    const planning: Planning = {
      id: planningId,
      aerodrome_id: aerodrome.id,
      type: 'homologation',
      date_debut: today,
      date_fin: '',
      portee: [],
      equipe_ids: [],
      chef_id: '',
      statut: 'planifiee',
      priorite: 'haute',
      declencheur: 'automatique',
      objectifs: `Surveillance homologation — ${aerodrome.nom} (${aerodrome.code_oaci})`,
      est_proposition: false,
      annee_cible: new Date().getFullYear(),
      created_at: now,
      updated_at: now,
    };
    await addPlanning(planning);

    const surveillance = await addSurveillance({
      aerodrome_id: aerodrome.id,
      planning_id: planningId,
      type: 'homologation',
      portee: [],
      equipe_ids: [],
      chef_id: '',
      date_debut: today,
      date_fin: '',
      statut: 'planifiee',
    });

    setPhaseData(prev => ({
      ...prev,
      surveillance_id: surveillance.id,
      date_verification: today,
    }));

    const operators = utilisateurs.filter(u =>
      u.aerodrome_id === aerodrome.id &&
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
    );
    operators.forEach(u => {
      addNotification({
        user_id: u.id,
        type: 'warning',
        title: 'Surveillance planifiée',
        message: `Une surveillance d'homologation est planifiée sur ${aerodrome.nom} (${aerodrome.code_oaci}). Préparez-vous via le portail exploitant.`,
        canal: 'in_app',
      });
    });
  };

  const isPhase1Workflow = phase === 1 && !!phaseData.statut;

  const canAdvance = useMemo(() => {
    if (phase === 2) return phaseData.conclusion === 'favorable' || phaseData.conclusion === 'favorable_conditions';
    if (phase === 3) return false;
    return true;
  }, [phase, phaseData]);

  const handleSave = async (advance?: boolean | React.MouseEvent) => {
    setIsSubmitting(true);
    try {
      const shouldAdvance = typeof advance === 'boolean' ? advance : false;
      await onSave(phaseData, shouldAdvance);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPhaseTitle = () => {
    const p = PHASES.find(p => p.phase === phase);
    return p ? p.title : '';
  };

  const renderPhaseContent = () => {
    switch (phase) {
      case 1: {
        const phase1Status = phaseData.statut;

        if (!phase1Status) {
          return (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucune demande exploitant reçue pour cet aérodrome.</p>
              <p className="text-xs mt-1">Les demandes sont soumises depuis le portail exploitant.</p>
            </div>
          );
        }

        return (
          <div className="space-y-5">
            <div className={`p-4 rounded-xl border ${
              phase1Status === 'favorable' ? 'border-success/40 bg-success/5' :
              phase1Status === 'defavorable' ? 'border-danger/40 bg-danger/5' :
              phase1Status === 'a_reviser' ? 'border-warning/40 bg-warning/5' :
              'border-border bg-card'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Demandeur</p>
                  <p className="font-semibold text-foreground">{phaseData.coordonnees?.nom || '-'}</p>
                </div>
                <span className={`badge ${getStatusBadge(phase1Status)}`}>{getStatusLabel(phase1Status)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><span className="text-muted">Email:</span> {phaseData.coordonnees?.email || '-'}</p>
                <p><span className="text-muted">Téléphone:</span> {phaseData.coordonnees?.telephone || '-'}</p>
                <p><span className="text-muted">Date demande:</span> {phaseData.date_reception || '-'}</p>
                <p><span className="text-muted">Poste:</span> {phaseData.coordonnees?.poste || '-'}</p>
              </div>
              {phaseData.description && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{phaseData.description}</p>
                </div>
              )}
              {phaseData.lettre_intent_url && (
                <button type="button" className="btn btn-secondary gap-2 text-sm mt-3" onClick={() => window.open(phaseData.lettre_intent_url, '_blank')}>
                  <FileText className="w-4 h-4" />Voir le dossier
                </button>
              )}
              {phaseData.date_accuse_reception && (
                <p className="text-xs text-muted mt-2">Accusé réception: {new Date(phaseData.date_accuse_reception).toLocaleDateString('fr-FR')}</p>
              )}
            </div>

            {phase1Status === 'en_attente' && !isLocked && !isCompleted && (
              <div className="text-center py-4">
                <button type="button" onClick={handleAccuseReception} className="btn btn-primary gap-2">
                  <CheckCircle2 className="w-4 h-4" />Accuser réception
                </button>
              </div>
            )}

            {(phase1Status === 'accuse' || phase1Status === 'en_cours') && !isLocked && !isCompleted && (
              <div className="space-y-4 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground">Instruction de la demande</h4>

                <div className="form-field">
                  <label className="filter-label"><Upload className="h-3.5 w-3.5 mr-1 inline" />Fichiers d'évaluation</label>
                  <div className="space-y-2">
                    {inspecteurFichiers.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-success/5 border border-success/30 rounded-xl">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-success shrink-0" />
                          <span className="text-sm text-foreground truncate">{f.nom}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" className="action-button" onClick={() => window.open(f.url, '_blank')}><Eye className="w-4 h-4" /></button>
                          <button type="button" className="action-button hover:text-danger" onClick={() => removeInspectorFile(i)}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={handleInspectorFileUpload} className="btn btn-secondary w-full gap-2 py-6 border-dashed">
                      <Upload className="w-5 h-5" />
                      <span>Ajouter un fichier</span>
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label className="filter-label"><AlertCircle className="h-3.5 w-3.5 mr-1 inline" />Commentaires</label>
                  <textarea
                    className={`form-textarea ${focusClass}`}
                    value={phaseData.inspecteur_commentaires || ''}
                    onChange={(e) => setPhaseData({ ...phaseData, inspecteur_commentaires: e.target.value })}
                    rows={4}
                    placeholder="Avis, observations, demandes de compléments..."
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button type="button" onClick={() => handleDecision('favorable')} disabled={isDeciding} className="btn btn-success gap-2">
                    {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Favorable
                  </button>
                  <button type="button" onClick={() => handleDecision('a_reviser')} disabled={isDeciding} className="btn btn-warning gap-2">
                    {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}À réviser
                  </button>
                  <button type="button" onClick={() => handleDecision('defavorable')} disabled={isDeciding} className="btn btn-danger gap-2">
                    {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}Défavorable
                  </button>
                </div>
              </div>
            )}

            {phase1Status === 'favorable' && (
              <div className="alert alert-success">
                <CheckCircle2 className="alert-icon" />
                <div className="alert-content">Avis favorable — L'exploitant peut passer à la phase 2.</div>
              </div>
            )}
            {phase1Status === 'a_reviser' && (
              <div className="alert alert-warning">
                <AlertCircle className="alert-icon" />
                <div className="alert-content">Demande à réviser — L'exploitant doit reprendre sa demande selon les commentaires.</div>
              </div>
            )}
            {phase1Status === 'defavorable' && (
              <div className="alert alert-danger">
                <XCircle className="alert-icon" />
                <div className="alert-content">Demande rejetée.</div>
              </div>
            )}

            {phaseData.inspecteur_commentaires && (
              <div className="p-3 bg-muted/20 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Commentaires de l'inspection</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{phaseData.inspecteur_commentaires}</p>
              </div>
            )}
          </div>
        );
      }

      case 2:
        return (
          <div className="space-y-5 animate-fade-up">
            <div className="p-5 bg-gradient-to-br from-role-primary-soft/10 to-transparent border border-role-primary/20 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="kpi-icon !w-10 !h-10 bg-role-primary-soft">
                  <MapPin className="h-5 w-5 text-role-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Vérification sur Site</h4>
                  <p className="text-xs text-muted-foreground">Phase 2 — Visite de vérification terrain</p>
                </div>
              </div>
              {!phaseData.surveillance_id && (
                <div className="alert alert-info">
                  <AlertCircle className="alert-icon" />
                  <div className="alert-content">
                    <div className="alert-title">Surveillance requise</div>
                    <div className="alert-description mb-3">
                      Cette phase nécessite une surveillance sur site. Créez-la pour commencer.
                    </div>
                    <button type="button" onClick={handleCreateSurveillance} className="btn btn-primary gap-2 shadow-role-glow">
                      <Calendar className="h-4 w-4" />Créer la surveillance associée
                    </button>
                  </div>
                </div>
              )}
              {phaseData.surveillance_id && (
                <div className="alert alert-success">
                  <CheckCircle2 className="alert-icon" />
                  <div className="alert-content">
                    <div className="alert-title">Surveillance créée</div>
                    <span className="text-sm">Utilisez le module Planning pour la préparer et la lancer.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date vérification</label>
                <input type="date" className={`form-input ${focusClass}`} value={phaseData.date_verification || ''} onChange={(e) => setPhaseData({ ...phaseData, date_verification: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
              <div className="form-field">
                <label className="filter-label"><BarChart3 className="h-3.5 w-3.5 mr-1 inline" />Score conformité</label>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Score</span>
                    <span className={`font-semibold ${(phaseData.score_conformite || 0) >= 80 ? 'text-success' : (phaseData.score_conformite || 0) >= 60 ? 'text-warning' : 'text-danger'}`}>
                      {phaseData.score_conformite || 0}%
                    </span>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={phaseData.score_conformite || 0} onChange={(e) => setPhaseData({ ...phaseData, score_conformite: parseInt(e.target.value) })} disabled={isLocked || isCompleted} className="w-full accent-role-primary" />
                  <div className="progress h-1.5">
                    <div className={`progress-bar ${(phaseData.score_conformite || 0) >= 80 ? 'progress-moyen' : (phaseData.score_conformite || 0) >= 60 ? 'progress-eleve' : 'progress-critique'}`} style={{ width: `${phaseData.score_conformite || 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-card border border-border rounded-xl">
              <label className="filter-label"><User className="h-3.5 w-3.5 mr-1 inline" />Chef d'équipe</label>
              <select className={`form-select w-full mt-1 ${focusClass}`} style={selectStyle} value={phaseData.chef_id || ''} onChange={(e) => { const chefId = e.target.value; const chefNom = e.target.options[e.target.selectedIndex]?.text; setPhaseData({ ...phaseData, chef_id: chefId, chef_nom: chefNom }); }} disabled={isLocked || isCompleted}>
                <option value="">Sélectionner le chef d'équipe</option>
                {utilisateurs.filter(u => u.role === 'inspector' || u.role === 'superviseur').map(u => (
                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                ))}
              </select>
            </div>

            <div className="p-4 bg-card border border-border rounded-xl">
              <label className="filter-label"><Users className="h-3.5 w-3.5 mr-1 inline" />Membres de l'équipe</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {utilisateurs.filter(u => u.role === 'inspector' || u.role === 'superviseur').map(u => (
                  <button key={u.id} type="button" onClick={() => { const current = phaseData.equipe_ids || []; const newEquipe = current.includes(u.id) ? current.filter((i: string) => i !== u.id) : [...current, u.id]; setPhaseData({ ...phaseData, equipe_ids: newEquipe }); }} disabled={isLocked || isCompleted}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${phaseData.equipe_ids?.includes(u.id) ? 'bg-role-gradient text-white shadow-role-glow' : 'btn btn-secondary'}`}>
                    {u.prenom} {u.nom}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label className="filter-label"><FileText className="h-3.5 w-3.5 mr-1 inline" />Conditions imposées</label>
              <textarea className={`form-textarea ${focusClass}`} value={phaseData.conditions || ''} onChange={(e) => setPhaseData({ ...phaseData, conditions: e.target.value })} disabled={isLocked || isCompleted} rows={3} placeholder="Conditions particulières à respecter..." />
            </div>

            <div className={`p-5 rounded-2xl border-2 transition-all duration-300 ${
              phaseData.conclusion === 'favorable' ? 'border-success/40 bg-gradient-to-br from-success/5 to-transparent' :
              phaseData.conclusion === 'favorable_conditions' ? 'border-warning/40 bg-gradient-to-br from-warning/5 to-transparent' :
              phaseData.conclusion === 'defavorable' ? 'border-danger/40 bg-gradient-to-br from-danger/5 to-transparent' :
              'border-border bg-card'
            }`}>
              <label className="filter-label mb-3">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 inline" />
                Conclusion *
                {phaseData.conclusion && (
                  <span className={`ml-2 badge ${
                    phaseData.conclusion === 'favorable' ? 'success' :
                    phaseData.conclusion === 'favorable_conditions' ? 'warning' : 'danger'
                  }`}>
                    {phaseData.conclusion === 'favorable' ? 'Favorable' :
                     phaseData.conclusion === 'favorable_conditions' ? 'Sous conditions' : 'Défavorable'}
                  </span>
                )}
              </label>
              <div className="flex gap-4 flex-wrap">
                {[
                  { value: 'favorable', label: 'Favorable', icon: CheckCircle2, variant: 'success' },
                  { value: 'favorable_conditions', label: 'Favorable sous conditions', icon: AlertCircle, variant: 'warning' },
                  { value: 'defavorable', label: 'Défavorable', icon: XCircle, variant: 'danger' },
                ].map((option) => (
                  <button key={option.value} type="button"
                    onClick={() => setPhaseData({ ...phaseData, conclusion: option.value as "favorable" | "favorable_conditions" | "defavorable" })}
                    disabled={isLocked || isCompleted}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all duration-200 ${
                      phaseData.conclusion === option.value
                        ? `border-${option.variant}/50 bg-${option.variant}/10 text-${option.variant} shadow-${option.variant}-glow`
                        : 'border-border bg-card text-muted-foreground hover:border-foreground/20'
                    }`}
                  >
                    <option.icon className="w-4 h-4" />
                    {option.label}
                  </button>
                ))}
              </div>
              {!canAdvance && phaseData.conclusion === 'defavorable' && (
                <div className="mt-3 alert alert-danger">
                  <AlertCircle className="alert-icon" />
                  <div className="alert-content">Conclusion défavorable — la phase ne peut pas être clôturée.</div>
                </div>
              )}
              {!canAdvance && !phaseData.conclusion && (
                <div className="mt-3 flex items-center gap-2 text-xs text-warning">
                  <Clock className="w-3 h-3 animate-pulse" />
                  <span>Sélectionnez une conclusion pour pouvoir valider et clôturer la phase</span>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-5 animate-fade-up">
            <div className="p-5 bg-gradient-to-br from-success/5 to-transparent border border-success/20 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="kpi-icon !w-10 !h-10 bg-success/20">
                  <Scale className="h-5 w-5 text-success" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Délivrance Décision</h4>
                  <p className="text-xs text-muted-foreground">Phase 3 — Décision d'homologation</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="filter-label"><FileText className="h-3.5 w-3.5 mr-1 inline" />N° décision *</label>
                <input className={`form-input ${focusClass}`} value={phaseData.numero_decision || ''} onChange={(e) => setPhaseData({ ...phaseData, numero_decision: e.target.value })} disabled={isLocked || isCompleted} placeholder="ANACIM/HOMO/AAAA/NNN" />
              </div>
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date délivrance *</label>
                <input type="date" className={`form-input ${focusClass}`} value={phaseData.date_delivrance || ''} onChange={(e) => setPhaseData({ ...phaseData, date_delivrance: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
            </div>

            <div className="p-4 bg-card border border-border rounded-xl">
              <label className="filter-label"><Scale className="h-3.5 w-3.5 mr-1 inline" />Nature décision</label>
              <select className={`form-select w-full mt-1 ${focusClass}`} style={selectStyle} value={phaseData.nature_decision || ''} onChange={(e) => setPhaseData({ ...phaseData, nature_decision: e.target.value as "accordee" | "conditions" | "refusee" })} disabled={isLocked || isCompleted}>
                <option value="">Sélectionner</option>
                <option value="accordee">Accordée</option>
                <option value="conditions">Avec conditions</option>
                <option value="refusee">Refusée</option>
              </select>
            </div>

            <div className="form-field">
              <label className="filter-label"><FileText className="h-3.5 w-3.5 mr-1 inline" />Conditions exploitation</label>
              <textarea className={`form-textarea ${focusClass}`} value={phaseData.conditions_exploitation || ''} onChange={(e) => setPhaseData({ ...phaseData, conditions_exploitation: e.target.value })} disabled={isLocked || isCompleted} rows={3} placeholder="Conditions d'exploitation le cas échéant..." />
            </div>

            <div className="p-4 bg-card border border-border rounded-xl">
              <SignatureSection
                documentType="decision"
                documentId={homologation?.id || 'new'}
                signataireNom="DG ANACIM"
                dateSignature={phaseData.date_signature}
                onSigned={(url) => setPhaseData({ ...phaseData, decision_url: url, date_signature: new Date().toISOString() })}
                disabled={isLocked || isCompleted}
              />
            </div>

            <label className="form-checkbox cursor-pointer p-3 bg-muted/30 rounded-xl flex items-center gap-2 transition-all hover:bg-muted/50">
              <input type="checkbox" checked={phaseData.notification_envoyee || false} onChange={(e) => setPhaseData({ ...phaseData, notification_envoyee: e.target.checked })} disabled={isLocked || isCompleted} />
              <span className="text-small text-foreground">Notification envoyée à l'exploitant</span>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  const phaseInfo = PHASES.find(p => p.phase === phase);
  const PhaseIcon = (phaseInfo?.icon || ClipboardList) as React.ComponentType<{ className?: string }>;

  return (
    <FormShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Phase ${phase} — ${getPhaseTitle()}${isLocked ? ' (Verrouillée)' : isCompleted ? ' (Complétée)' : ''}`}
      icon={PhaseIcon}
      size="3xl"
      dataRole={userRole}
      tabs={isPhase1Workflow ? [
        { id: 'informations', label: 'Informations' },
      ] : [
        { id: 'informations', label: 'Informations' },
        { id: 'documents', label: 'Documents & Signature' },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      footer={isPhase1Workflow ? undefined : (
        <div className="flex items-center gap-2 w-full justify-between">
          <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
            <XCircle className="w-4 h-4" />
            Annuler
          </button>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary gap-2"
              onClick={() => handleSave()}
              disabled={isLocked || isCompleted || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            {phase < 3 && canAdvance && (
              <button
                className="btn btn-primary gap-2 shadow-role-glow"
                onClick={() => handleSave(true)}
                disabled={isLocked || isCompleted || isSubmitting}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isSubmitting ? 'Validation...' : 'Valider et clôturer'}
              </button>
            )}
          </div>
        </div>
      )}
    >
      <p className="text-muted text-sm mb-4">
        Aérodrome: {aerodrome?.nom} ({aerodrome?.code_oaci})
      </p>

      {activeTab === 'informations' && (
        <div className="space-y-4">
          {renderPhaseContent()}
        </div>
      )}

      {!isPhase1Workflow && activeTab === 'documents' && (
        <div className="space-y-4">
          <CertificationDocumentUpload
            documents={phaseData.documents || {}}
            onDocumentChange={(key, uploaded) => {
              const newDocs = { ...phaseData.documents, [key]: uploaded };
              const total = Object.keys(newDocs).length;
              const uploadedCount = Object.values(newDocs).filter(Boolean).length;
              const newCompletude = total > 0 ? Math.round((uploadedCount / total) * 100) : 0;
              setPhaseData({
                ...phaseData,
                documents: newDocs,
                completude: newCompletude
              });
            }}
            disabled={isLocked || isCompleted}
            type="homologation"
            userRole={userRole}
          />

          {phase === 1 && (
            <div className="mt-4 p-4 border border-border rounded-xl">
              <label className="filter-label mb-2 block">Lettre de transmission DG</label>
              <LettreTransmissionUpload
                currentUrl={phaseData.lettre_transmission_url}
                currentDate={phaseData.lettre_transmission_date}
                onUpload={(url, _fileName, date) => setPhaseData({
                  ...phaseData,
                  lettre_transmission_url: url,
                  lettre_transmission_date: date,
                })}
                onRemove={() => setPhaseData({
                  ...phaseData,
                  lettre_transmission_url: '',
                  lettre_transmission_date: undefined,
                })}
                disabled={isLocked || isCompleted}
              />
            </div>
          )}

          {phase === 3 && (
            <div className="mt-4 p-4 border border-border rounded-xl">
              <label className="filter-label mb-2 block">Décision d'homologation signée</label>
              <SignatureSection
                documentType="decision"
                documentId={homologation?.id || 'new'}
                signataireNom="DG ANACIM"
                dateSignature={phaseData.date_signature}
                onSigned={(url) => setPhaseData({
                  ...phaseData,
                  decision_url: url,
                  date_signature: new Date().toISOString()
                })}
                disabled={isLocked || isCompleted}
              />
            </div>
          )}
        </div>
      )}
    </FormShell>
  );
}

// Composant principal
export default function HomologationModule({ userRole: userRoleProp, user: userProp }: HomologationModuleProps) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const homologations = useAppStore(s => s.homologations)
  const updateHomologation = useAppStore(s => s.updateHomologation)
  const addHomologation = useAppStore(s => s.addHomologation)
  const addNotification = useAppStore(s => s.addNotification)
  const setActiveModule = useAppStore(s => s.setActiveModule)
  const storeUser = useAppStore(s => s.user);
  const user = storeUser ?? userProp;
  const userRole = userRoleProp ?? userProp?.role ?? storeUser?.role ?? 'inspector';

  const [selectedPhase, setSelectedPhase] = useState<{ aerodrome: Aerodrome; phase: number } | null>(null);
  const [phaseModalOpen, setPhaseModalOpen] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');
  const [exemptionManagerOpen, setExemptionManagerOpen] = useState(false);
  const [currentHomologationForExemption, setCurrentHomologationForExemption] = useState<Homologation | null>(null);
  const [phaseDocsAerodrome, setPhaseDocsAerodrome] = useState<Aerodrome | null>(null);
  const [phaseDocsModalOpen, setPhaseDocsModalOpen] = useState(false);

  // IA states
  const [isIaAnalyzing, setIsIaAnalyzing] = useState(false);
  const [iaAnalysis, setIaAnalysis] = useState<CertificationAnalysisResult | null>(null);
  const [showIaAnalysis, setShowIaAnalysis] = useState(false);

  const allHomologations = homologations || [];
  const nationalAerodromes = useMemo(() => {
    return aerodromes.filter(a => a.type === 'national');
  }, [aerodromes]);

  // Défini avant filteredAerodromes pour éviter la TDZ (const n'est pas hoistée)
  const getHomologation = (aerodromeId: string) => {
    return allHomologations.find(h => h.aerodrome_id === aerodromeId);
  };

  const filteredAerodromes = useMemo(() => {
    let result = nationalAerodromes;

    if (filterStatut !== 'all') {
      result = result.filter(a => {
        const homo = getHomologation(a.id);
        return homo?.statut_global === filterStatut;
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.code_oaci.toLowerCase().includes(term) ||
        a.nom.toLowerCase().includes(term)
      );
    }

    return result;
  }, [nationalAerodromes, filterStatut, searchTerm]);

  // Homologations archivées (terminées)
  const archivedHomologations = useMemo(() => {
    return allHomologations.filter(h => h.statut_global === 'homologue' || h.statut_global === 'archive');
  }, [allHomologations]);

  const stats = useMemo(() => {
    const total = nationalAerodromes.length;
    const enCours = allHomologations.filter(h => h.statut_global === 'en_cours').length;
    const homologues = allHomologations.filter(h => h.statut_global === 'homologue').length;
    const suspendus = allHomologations.filter(h => h.statut_global === 'suspendu').length;

    const blockedPhases = allHomologations.reduce((acc, homo) => {
      const phaseStats = getHomoPhaseStats(homo);
      return acc + phaseStats.blocked;
    }, 0);

    const inactivePhases = allHomologations.reduce((acc, homo) => {
      const phaseStats = getHomoPhaseStats(homo);
      return acc + phaseStats.inactive;
    }, 0);

    return {
      total,
      enCours,
      homologues,
      suspendus,
      blockedPhases,
      inactivePhases
    };
  }, [nationalAerodromes, allHomologations]);

  const isPhaseAccessible = (homologation: any, phase: number) => {
    if (!homologation) return phase === 1;
    const currentPhase = homologation.phase_active;
    return phase <= currentPhase;
  };

  const isPhaseCompleted = (homologation: any, phase: number) => {
    if (!homologation) return false;
    return phase < homologation.phase_active;
  };

  const handlePhaseClick = (aerodrome: any, phase: number, action: 'view' | 'edit' | 'notify' | 'delete' | 'exemptions') => {
    // Aérodrome déjà homologué mais sans dossier → ouvrir PhaseDocsModal
    if (aerodrome.statut_certification === 'homologue' && !getHomologation(aerodrome.id)) {
      setPhaseDocsAerodrome(aerodrome);
      setPhaseDocsModalOpen(true);
      return;
    }

    if (action === 'notify') {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: `Phase ${phase} bloquée`,
        message: `La phase ${phase} du dossier ${aerodrome.code_oaci} est sans activité depuis plus de 30 jours.`,
        canal: 'in_app',
      });
      return;
    }

    if (action === 'delete') {
      const homologation = getHomologation(aerodrome.id);
      if (homologation && window.confirm(`Êtes-vous sûr de vouloir réinitialiser la phase ${phase} ?`)) {
        const updatedPhasesData = {
          ...homologation.phases_data,
          [`phase${phase}`]: {}
        };

        updateHomologation(homologation.id, {
          phases_data: updatedPhasesData,
          updated_at: new Date().toISOString()
        });

        addNotification({
          user_id: user?.id || '',
          type: 'warning',
          title: 'Phase réinitialisée',
          message: `Phase ${phase} du dossier ${homologation.reference} a été réinitialisée.`,
          canal: 'in_app',
        });
      }
      return;
    }

    if (action === 'exemptions') {
      setCurrentHomologationForExemption(getHomologation(aerodrome.id) ?? null);
      setExemptionManagerOpen(true);
      return;
    }

    setSelectedPhase({ aerodrome, phase });
    setPhaseModalOpen(true);
  };

  const handleSavePhase = (phaseData: Partial<HomologationPhaseDataLocal>, advancePhase?: boolean) => {
    if (!selectedPhase) return;
    const homologation = getHomologation(selectedPhase.aerodrome.id);
    const now = new Date().toISOString();

    const updatedPhasesData = {
      ...(homologation?.phases_data || {}),
      [`phase${selectedPhase.phase}`]: {
        ...phaseData,
        last_activity: now,
        ...(advancePhase !== false && !phaseData.statut ? { cloture_le: now } : {}),
      }
    };

    const shouldAdvance = advancePhase ?? true;
    const newPhaseActive = shouldAdvance
      ? (selectedPhase.phase >= 3 ? 3 : selectedPhase.phase + 1) as 1 | 2 | 3
      : selectedPhase.phase as 1 | 2 | 3;

    if (homologation) {
      updateHomologation(homologation.id, {
        phases_data: updatedPhasesData,
        phase_active: newPhaseActive,
        updated_at: now,
      });
    } else if (shouldAdvance) {
      // Première phase pour un nouvel aérodrome — créer l'homologation
      const year = new Date().getFullYear();
      addHomologation({
        id: crypto.randomUUID(),
        aerodrome_id: selectedPhase.aerodrome.id,
        reference: `HOMO-${selectedPhase.aerodrome.code_oaci}-${year}`,
        phase_active: newPhaseActive,
        phases_data: updatedPhasesData,
        statut_global: 'en_cours',
        created_at: now,
        updated_at: now,
      });
    }

    const msg = shouldAdvance
      ? `Phase ${selectedPhase.phase} du dossier ${selectedPhase.aerodrome.code_oaci} enregistrée. Phase ${newPhaseActive} débloquée.`
      : `Mise à jour effectuée sur la phase ${selectedPhase.phase} du dossier ${selectedPhase.aerodrome.code_oaci}.`;

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Phase mise à jour',
      message: msg,
      canal: 'in_app',
    });
  };

  const handleRestoreFromArchive = (item: any) => {
    updateHomologation(item.id, { statut_global: 'en_cours', archived_at: null });
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Dossier restauré',
      message: `Le dossier ${item.reference} a été restauré depuis les archives.`,
      canal: 'in_app',
    });
  };

  const handleIaAnalyze = async (homologation: any) => {
    setIsIaAnalyzing(true);
    try {
      const result = await certificationAgent.analyzeProcess({
        processId: homologation.id,
        type: 'homologation',
        options: {
          includePredictions: true,
          includeBlockageDetection: true,
          includeInspectorSuggestions: true,
        },
      });
      setIaAnalysis(result);
      setShowIaAnalysis(true);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Analyse IA terminée',
        message: `${result.suggestions.actionsPrioritaires.length} action(s) prioritaire(s) identifiée(s)`,
        canal: 'in_app',
      });
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur IA',
        message: error instanceof Error ? error.message : 'Analyse impossible',
        canal: 'in_app',
      });
    } finally {
      setIsIaAnalyzing(false);
    }
  };

  const getPhaseLastActivity = (homologation: any, phase: number): string | null => {
    const phaseData = homologation?.phases_data?.[`phase${phase}`];
    if (!phaseData) return null;

    const dates = [
      phaseData.last_activity,
      phaseData.date_reception,
      phaseData.date_verification,
      phaseData.date_delivrance,
      phaseData.cloture_le
    ].filter((d: unknown): d is string => Boolean(d));

    if (dates.length === 0) return null;

    const timestamps = dates.map(d => {
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    }).filter(t => t > 0);

    if (timestamps.length === 0) return null;

    const latest = new Date(Math.max(...timestamps));
    const daysDiff = Math.floor((new Date().getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) return "Aujourd'hui";
    if (daysDiff === 1) return "Hier";
    return `Il y a ${daysDiff} jours`;
  };

  const getDaysInactive = (homologation: any, phase: number): number => {
    const phaseData = homologation?.phases_data?.[`phase${phase}`];
    if (!phaseData) return 0;

    const dates = [
      phaseData.last_activity,
      phaseData.date_reception,
      phaseData.date_verification,
      phaseData.date_delivrance
    ].filter((d: unknown): d is string => Boolean(d));

    if (dates.length === 0) return 0;

    const timestamps = dates.map(d => {
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    }).filter(t => t > 0);

    if (timestamps.length === 0) return 0;

    const latest = new Date(Math.max(...timestamps));
    return Math.floor((new Date().getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="homologation">

      {/* En-tête */}
      <ModuleHeader
        icon={<Scale />}
        title="Homologation"
        description="Gestion des homologations des aérodromes nationaux (validité illimitée)"
        actions={<div className="flex items-center gap-2">
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border appearance-none ${focusClass}`}
            style={selectStyle}
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="en_cours">En cours</option>
            <option value="homologue">Homologué</option>
          </select>
          <button className="btn btn-secondary gap-2 flex items-center">
            <Download className="h-4 w-4" />
            Exporter
          </button>
        </div>}
      />

      {/* Onglets */}
      <div className="tabs-container border-b border-border">
        <div className="tabs flex gap-1">
          <button
            className={`tab px-4 py-2 font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 className="w-4 h-4 inline mr-1.5" /> Tableau de bord
          </button>
          <button
            className={`tab px-4 py-2 font-medium transition-all ${
              activeTab === 'list'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('list')}
          >
            <List className="w-4 h-4 inline mr-1.5" /> Liste des homologations
          </button>
          <button
            className="tab px-4 py-2 font-medium text-muted-foreground hover:text-role-primary transition-colors"
            onClick={() => setActiveModule('registres')}
            title="Les archives sont consultables dans le module Registres"
          >
            <Archive className="w-4 h-4 inline mr-1.5" /> Archives → Registres
          </button>
        </div>
      </div>

      {/* Dashboard */}
      {activeTab === 'dashboard' && <HomoDashboard userRole={userRole} />}

      {/* Liste des homologations */}
      {activeTab === 'list' && (
        <>
          <Card className="border-primary/20 bg-primary-soft/30" icon={<Search className="w-4 h-4 text-role-primary" />} title="Recherche">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher un aérodrome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
                />
              </div>
            </div>
          </Card>

          {/* Liste des aérodromes en accordéon */}
          <AccordionGroup spacing="sm">
            {filteredAerodromes.map((aerodrome) => {
              const homologation = getHomologation(aerodrome.id);
              const phaseActive = homologation?.phase_active || 1;

              const getStatutClass = () => {
                if (aerodrome.statut_certification === 'homologue' || homologation?.statut_global === 'homologue') return 'badge success';
                if (!homologation) return 'badge neutral';
                return 'badge primary';
              };
              const getStatutLabel = () => {
                if (aerodrome.statut_certification === 'homologue' || homologation?.statut_global === 'homologue') return 'Homologué';
                if (!homologation) return 'Non homologué';
                return 'En cours';
              };

              return (
                <AccordionSection
                  key={aerodrome.id}
                  icon={homologation?.statut_global === 'homologue' ? <ShieldCheck className="w-4 h-4 text-white" /> : <Scale className="w-4 h-4 text-white" />}
                  title={<><span className="code-oaci-badge mr-2">{aerodrome.code_oaci}</span>{aerodrome.nom}</>}
                  badges={
                    <>
                      <span className={getStatutClass()}>{getStatutLabel()}</span>
                      {homologation && <span className="badge outline">Phase {phaseActive}/3</span>}
                      {!homologation && aerodrome.statut_certification === 'homologue' && (
                        <span className="badge outline">Préexistante</span>
                      )}
                    </>
                  }
                  actions={
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIaAnalyze(homologation);
                      }}
                      disabled={isIaAnalyzing}
                      className="action-button text-role-primary"
                      title="Analyser avec IA"
                    >
                      {isIaAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                    </button>
                  }
                >
                  {!homologation && aerodrome.statut_certification === 'homologue' ? (
                    <div className="p-4 bg-gradient-to-r from-role-primary-soft/10 to-transparent border border-role-primary/20 rounded-xl flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="kpi-icon !w-10 !h-10 bg-role-primary-soft">
                          <FileText className="h-5 w-5 text-role-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Homologation préexistante</h4>
                          <p className="text-xs text-muted-foreground">Ajoutez les preuves par phase et finalisez dans le registre</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePhaseClick(aerodrome, 1, 'view')}
                        className="btn btn-primary gap-2"
                      >
                        <Upload className="w-4 h-4" /> Ajouter les preuves par phase
                      </button>
                    </div>
                  ) : (
                    PHASES.map(({ phase, title, icon, description }) => (
                      <PhaseCard
                        key={phase}
                        phase={phase}
                        title={title}
                        icon={icon}
                        description={description}
                        isActive={phaseActive === phase}
                        isCompleted={isPhaseCompleted(homologation, phase)}
                        isLocked={!isPhaseAccessible(homologation, phase)}
                        data={homologation?.phases_data?.[`phase${phase}` as keyof typeof homologation.phases_data] as Homologation['phases_data']['phase1']}
                        lastActivity={getPhaseLastActivity(homologation, phase)}
                        daysInactive={getDaysInactive(homologation, phase)}
                        onView={() => handlePhaseClick(aerodrome, phase, 'view')}
                        onEdit={() => handlePhaseClick(aerodrome, phase, 'edit')}
                        onNotify={() => handlePhaseClick(aerodrome, phase, 'notify')}
                        onDelete={() => handlePhaseClick(aerodrome, phase, 'delete')}
                        onManageExemptions={() => handlePhaseClick(aerodrome, phase, 'exemptions')}
                      />
                    ))
                  )}
                </AccordionSection>
              );
            })}

            {filteredAerodromes.length === 0 && (
              <Card className="[&>div:last-child]:!py-12 [&>div:last-child]:!text-center">
                <Scale className="h-12 w-12 text-muted mx-auto mb-4" />
                <p className="text-muted">Aucun aérodrome national trouvé</p>
              </Card>
            )}
          </AccordionGroup>
        </>
      )}


      {/* Modal de phase */}
      {selectedPhase && (
        <PhaseModal
          open={phaseModalOpen}
          onOpenChange={setPhaseModalOpen}
          phase={selectedPhase.phase}
          aerodrome={selectedPhase.aerodrome}
          homologation={getHomologation(selectedPhase.aerodrome.id)}
          onSave={handleSavePhase}
          userRole={userRole}
        />
      )}

      {/* Modal de gestion des exemptions */}
      {exemptionManagerOpen && currentHomologationForExemption && (
        <ExemptionManager
          open={exemptionManagerOpen}
          onOpenChange={setExemptionManagerOpen}
          parentId={currentHomologationForExemption.id}
          parentType="homologation"
          parentReference={currentHomologationForExemption.reference}
          aerodromeId={currentHomologationForExemption.aerodrome_id}
          userRole={userRole}
        />
      )}

      {phaseDocsModalOpen && phaseDocsAerodrome && (
        <PhaseDocsModal
          open={phaseDocsModalOpen}
          onOpenChange={setPhaseDocsModalOpen}
          aerodrome={phaseDocsAerodrome}
          type="homologation"
        />
      )}
    </div>
  );
}