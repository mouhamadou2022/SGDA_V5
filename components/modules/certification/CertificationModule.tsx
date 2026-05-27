// components/modules/certification/CertificationModule.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { FormShell } from '@/components/ui/FormShell';
import {
  Shield,
  ShieldCheck,
  ClipboardList,
  Eye,
  PenSquare,
  Trash2,
  Lock,
  FileText,
  Calendar,
  Globe,
  Download,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Paperclip,
  Brain,
  Loader2,
  BarChart3,
  List,
  Archive,
  Upload,
} from 'lucide-react';

import { useOptimizedStore, useGlobalTransition } from '@/lib/performance/globalOptimizer';
import { useAppStore, Aerodrome, Certification, CertificationPhaseData, Planning } from '@/lib/store';
import type { CertificationAnalysisResult } from '@/lib/ia/agents/certificationAgent';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { certificationAgent } from '@/lib/ia/agents/certificationAgent';
import { checkExpiringCertifications, getPhaseStats } from '@/lib/certificationUtils';
import { CertificationDocumentUpload } from './CertificationDocumentUpload';
import { SignatureSection } from '../signatures/SignatureSection';
import { LettreTransmissionUpload } from '@/components/ui/LettreTransmissionUpload';
import { CertDashboard } from './CertDashboard';
import { CertExpiryAlert } from './CertExpiryAlert';
import { ExemptionManager } from '../exemptions/ExemptionManager';
import { PhaseDocsModal } from './PhaseDocsModal';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

interface CertificationModuleProps {
  userRole?: string;
  user?: { role?: string; id?: string; prenom?: string; nom?: string };
}

// Types pour les phases
interface PhaseInfo {
  phase: 1 | 2 | 3 | 4 | 5;
  title: string;
  icon: React.ElementType;
  description: string;
}

const PHASES: PhaseInfo[] = [
  { phase: 1, title: "Expression d'Intérêt", icon: FileText, description: "Dépôt de la demande initiale" },
  { phase: 2, title: "Demande Formelle", icon: ClipboardList, description: "Analyse du dossier technique" },
  { phase: 3, title: "Vérification sur Site", icon: Eye, description: "Visite de vérification sur site" },
  { phase: 4, title: "Délivrance du Certificat", icon: Shield, description: "Émission du certificat" },
  { phase: 5, title: "Publication Statut", icon: Globe, description: "Publication officielle" },
];

// Composant PhaseCard
interface PhaseCardProps {
  phase: number;
  title: string;
  icon: React.ElementType;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  data?: CertificationPhaseData & { responsable_nom?: string };
  onView: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onNotify?: () => void;
  onManageExemptions?: () => void;
  lastActivity: string | null;
  daysInactive: number;
}

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
    <div className={`card ${isActive ? 'card-accent' : ''}`}>
      <div className="card-content p-4">
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
                {data?.responsable_nom && (
                  <div className="flex items-center gap-1 text-muted">
                    <User className="h-3 w-3" />
                    <span>{data.responsable_nom}</span>
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
                  {(phase === 4 || phase === 3) && onManageExemptions && (
                    <button className="action-button text-role-primary" onClick={onManageExemptions} title="Gérer les exemptions">
                      <Shield className="h-4 w-4" />
                    </button>
                  )}
                  {!(phase === 1 || phase === 2) && (
                    <button className="action-button" onClick={onEdit} title="Modifier">
                      <PenSquare className="h-4 w-4" />
                    </button>
                  )}
                  {!(phase === 1 || phase === 2) && onDelete && (
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
      </div>
    </div>
  );
}

// Modal de phase
interface PhaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: number;
  aerodrome: Aerodrome;
  certification?: Certification;
  onSave: (phaseData: CertificationPhaseData, advancePhase?: boolean) => void;
  userRole: string;
}

function PhaseModal({
  open,
  onOpenChange,
  phase,
  aerodrome,
  certification,
  onSave,
  userRole
}: PhaseModalProps) {
  const addPlanning = useAppStore(s => s.addPlanning);
  const addSurveillance = useAppStore(s => s.addSurveillance);
  const addNotification = useAppStore(s => s.addNotification);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const [phaseData, setPhaseData] = useState<CertificationPhaseData>(
    (certification?.phases_data as Record<string, CertificationPhaseData | undefined>)?.[`phase${phase}`] || {}
  );
  const [activeTab, setActiveTab] = useState('informations');
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspecteurFichiers, setInspecteurFichiers] = useState<{ nom: string; url: string }[]>(
    phaseData.inspecteur_fichiers || []
  );
  const [isDeciding, setIsDeciding] = useState(false);

  useEffect(() => setMounted(true), []);

  const isLocked = phase > (certification?.phase_active || 1);
  const isCompleted = phase < (certification?.phase_active || 1);

  const canAdvance = useMemo(() => {
    if (phase === 1) return !!phaseData.date_reception && !!phaseData.coordonnees?.nom && !!phaseData.coordonnees?.email
    if (phase === 2) return !!phaseData.date_reception && !!phaseData.numero_dossier && !!phaseData.responsable_id
    if (phase === 3) return !!phaseData.date_verification && !!phaseData.chef_id && (phaseData.conclusion === 'favorable' || phaseData.conclusion === 'favorable_conditions')
    if (phase === 4) return !!phaseData.numero_certificat && !!phaseData.date_delivrance && !!phaseData.date_expiration && new Date(phaseData.date_expiration) > new Date(phaseData.date_delivrance)
    if (phase === 5) return false
    return false
  }, [phase, phaseData]);

  const handleSave = async (advancePhase?: boolean | React.MouseEvent) => {
    setIsSubmitting(true);
    try {
      const shouldAdvance = typeof advancePhase === 'boolean' ? advancePhase : false;
      await onSave(phaseData, shouldAdvance);
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur sauvegarde phase certification:', error)
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccuseReception = async () => {
    const now = new Date().toISOString();
    setPhaseData({ ...phaseData, statut: 'accuse', date_accuse_reception: now });
    await handleSave(false);
  };

  const handleDecision = async (decision: 'favorable' | 'a_reviser' | 'defavorable') => {
    setIsDeciding(true);
    try {
      const now = new Date().toISOString();
      const updatedData = {
        ...phaseData,
        statut: decision,
        inspecteur_fichiers: inspecteurFichiers,
        date_decision: now,
      };
      setPhaseData(updatedData);
      const shouldAdvance = phase === 2 && decision === 'favorable';
      await onSave(updatedData, shouldAdvance);
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur décision phase certification:', error)
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
      type: 'certification',
      date_debut: today,
      date_fin: '',
      portee: [],
      equipe_ids: [],
      chef_id: '',
      statut: 'planifiee',
      priorite: 'haute',
      declencheur: 'automatique',
      objectifs: `Surveillance certification — ${aerodrome.nom} (${aerodrome.code_oaci})`,
      est_proposition: false,
      annee_cible: new Date().getFullYear(),
      created_at: now,
      updated_at: now,
    };
    await addPlanning(planning);

    const surveillance = await addSurveillance({
      aerodrome_id: aerodrome.id,
      planning_id: planningId,
      type: 'certification',
      portee: [],
      equipe_ids: [],
      chef_id: '',
      date_debut: today,
      date_fin: '',
      statut: 'planifiee',
    });

    const updatedPhaseData = {
      ...phaseData,
      surveillance_id: surveillance.id,
      date_verification: today,
    };
    setPhaseData(updatedPhaseData);

    const operators = utilisateurs.filter(u =>
      u.aerodrome_id === aerodrome.id &&
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
    );
    operators.forEach(u => {
      addNotification({
        user_id: u.id,
        type: 'warning',
        title: 'Surveillance planifiée',
        message: `Une surveillance de certification est planifiée sur ${aerodrome.nom} (${aerodrome.code_oaci}). Préparez-vous via le portail exploitant.`,
        canal: 'in_app',
      });
    });
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
                <div className="alert-content">Avis favorable — L'exploitant peut soumettre sa demande formelle (Phase 2).</div>
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
              <div className="p-4 bg-card border border-border rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Commentaires de l'inspecteur</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{phaseData.inspecteur_commentaires}</p>
              </div>
            )}
          </div>
        );
      }

      case 2: {
        const phase2Status = phaseData.statut;

        if (!phase2Status) {
          return (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucune demande formelle reçue pour cet aérodrome.</p>
              <p className="text-xs mt-1">Les demandes sont soumises depuis le portail exploitant après avis favorable Phase 1.</p>
            </div>
          );
        }

        // Demande exploitant — workflow
        return (
          <div className="space-y-5">
            <div className={`p-4 rounded-xl border ${
              phase2Status === 'favorable' ? 'border-success/40 bg-success/5' :
              phase2Status === 'defavorable' ? 'border-danger/40 bg-danger/5' :
              phase2Status === 'a_reviser' ? 'border-warning/40 bg-warning/5' :
              'border-border bg-card'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Demandeur</p>
                  <p className="font-semibold text-foreground">{phaseData.coordonnees?.nom || certification?.phases_data?.phase1?.coordonnees?.nom || '-'}</p>
                </div>
                <span className={`badge ${getStatusBadge(phase2Status)}`}>{getStatusLabel(phase2Status)}</span>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted">Date soumission:</span> {phaseData.date_reception || '-'}</p>
                {phaseData.completude !== undefined && (
                  <p><span className="text-muted">Complétude:</span> {Math.round(phaseData.completude)}%</p>
                )}
              </div>
              {phaseData.date_accuse_reception && (
                <p className="text-xs text-muted mt-2">Accusé réception: {new Date(phaseData.date_accuse_reception).toLocaleDateString('fr-FR')}</p>
              )}
            </div>

            {/* Documents checklist (read-only pour l'inspecteur) */}
            {phaseData.documents && Object.keys(phaseData.documents).length > 0 && (
              <div className="p-4 bg-card border border-border rounded-xl">
                <p className="text-xs text-muted-foreground mb-2">Documents soumis par l'exploitant</p>
                <div className="space-y-1.5">
                  {Object.entries(phaseData.documents).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      {val ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-muted" />}
                      <span>{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {phase2Status === 'en_attente' && !isLocked && !isCompleted && (
              <div className="text-center py-4">
                <button type="button" onClick={handleAccuseReception} className="btn btn-primary gap-2">
                  <CheckCircle2 className="w-4 h-4" />Accuser réception
                </button>
              </div>
            )}

            {(phase2Status === 'accuse' || phase2Status === 'en_cours') && !isLocked && !isCompleted && (
              <div className="space-y-4 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground">Instruction de la demande formelle</h4>

                <div className="form-field">
                  <label className="filter-label"><Upload className="h-3.5 w-3.5 mr-1 inline" />Rapport d'évaluation</label>
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
                  <label className="filter-label"><AlertCircle className="h-3.5 w-3.5 mr-1 inline" />Avis et commentaires</label>
                  <textarea
                    className={`form-textarea ${focusClass}`}
                    value={phaseData.inspecteur_commentaires || ''}
                    onChange={(e) => setPhaseData({ ...phaseData, inspecteur_commentaires: e.target.value })}
                    rows={4}
                    placeholder="Avis détaillé, observations..."
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

            {phase2Status === 'favorable' && (
              <div className="alert alert-success">
                <CheckCircle2 className="alert-icon" />
                <div className="alert-content">Avis favorable — Passage à la phase suivante.</div>
              </div>
            )}
            {phase2Status === 'a_reviser' && (
              <div className="alert alert-warning">
                <AlertCircle className="alert-icon" />
                <div className="alert-content">Demande à réviser — L'exploitant doit compléter son dossier.</div>
              </div>
            )}
            {phase2Status === 'defavorable' && (
              <div className="alert alert-danger">
                <XCircle className="alert-icon" />
                <div className="alert-content">Demande rejetée.</div>
              </div>
            )}

            {phaseData.inspecteur_commentaires && (
              <div className="p-4 bg-card border border-border rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Commentaires de l'inspecteur</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{phaseData.inspecteur_commentaires}</p>
              </div>
            )}
          </div>
        );
      }

      case 3:
        return (
          <div className="space-y-5 animate-fade-up">
            <div className="p-5 bg-gradient-to-br from-role-primary-soft/10 to-transparent border border-role-primary/20 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="kpi-icon !w-10 !h-10 bg-role-primary-soft">
                  <Eye className="h-5 w-5 text-role-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Vérification sur Site</h4>
                  <p className="text-xs text-muted-foreground">Phase 3 — Évaluation terrain</p>
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
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date vérification *</label>
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
              <label className="filter-label"><User className="h-3.5 w-3.5 mr-1 inline" />Équipe de vérification</label>
              <select className={`form-select w-full mt-1 ${focusClass}`} style={selectStyle} value={phaseData.chef_id || ''} onChange={(e) => setPhaseData({ ...phaseData, chef_id: e.target.value })} disabled={isLocked || isCompleted}>
                <option value="">Chef d'équipe</option>
                {utilisateurs.filter(u => u.role === 'inspector' || u.role === 'superviseur').map(u => (
                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="filter-label"><Upload className="h-3.5 w-3.5 mr-1 inline" />Rapport vérification</label>
              <input type="text" className={`form-input ${focusClass}`} placeholder="URL du rapport" value={phaseData.rapport_verification_url || ''} onChange={(e) => setPhaseData({ ...phaseData, rapport_verification_url: e.target.value })} disabled={isLocked || isCompleted} />
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
              <div className="flex gap-3 flex-wrap">
                {[
                  { value: 'favorable', label: 'Favorable', icon: CheckCircle2, variant: 'success' },
                  { value: 'favorable_conditions', label: 'Favorable sous conditions', icon: AlertCircle, variant: 'warning' },
                  { value: 'defavorable', label: 'Défavorable', icon: XCircle, variant: 'danger' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setPhaseData({ ...phaseData, conclusion: opt.value as any })}
                    disabled={isLocked || isCompleted}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all duration-200 ${
                      phaseData.conclusion === opt.value
                        ? `border-${opt.variant}/50 bg-${opt.variant}/10 text-${opt.variant} shadow-${opt.variant}-glow`
                        : 'border-border bg-card text-muted-foreground hover:border-foreground/20'
                    }`}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
              {!canAdvance && phaseData.conclusion === 'defavorable' && (
                <div className="mt-3 alert alert-danger">
                  <AlertCircle className="alert-icon" />
                  <div className="alert-content">Conclusion défavorable — la phase ne peut pas être clôturée. Vous pouvez enregistrer les données mais le dossier n'avancera pas.</div>
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

      case 4:
        return (
          <div className="space-y-5 animate-fade-up">
            <div className="p-5 bg-gradient-to-br from-success/5 to-transparent border border-success/20 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="kpi-icon !w-10 !h-10 bg-success/20">
                  <Shield className="h-5 w-5 text-success" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Délivrance du Certificat</h4>
                  <p className="text-xs text-muted-foreground">Phase 4 — Émission du certificat OACI</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="form-field">
                <label className="filter-label"><FileText className="h-3.5 w-3.5 mr-1 inline" />N° certificat *</label>
                <input className={`form-input ${focusClass}`} value={phaseData.numero_certificat || ''} onChange={(e) => setPhaseData({ ...phaseData, numero_certificat: e.target.value })} disabled={isLocked || isCompleted} placeholder="ANACIM/CERT/AAAA/NNN" />
              </div>
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date délivrance *</label>
                <input type="date" className={`form-input ${focusClass}`} value={phaseData.date_delivrance || ''} onChange={(e) => setPhaseData({ ...phaseData, date_delivrance: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date expiration *</label>
                <input type="date" className={`form-input ${focusClass}`} value={phaseData.date_expiration || ''} onChange={(e) => setPhaseData({ ...phaseData, date_expiration: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
            </div>

            <div className="p-4 bg-card border border-border rounded-xl">
              <label className="filter-label"><Upload className="h-3.5 w-3.5 mr-1 inline" />Certificat (PDF)</label>
              <input type="text" className={`form-input ${focusClass}`} placeholder="URL du certificat signé" value={phaseData.certificat_url || ''} onChange={(e) => setPhaseData({ ...phaseData, certificat_url: e.target.value })} disabled={isLocked || isCompleted} />
            </div>

            {!canAdvance && (
              <div className="flex items-center gap-2 text-xs text-warning p-3 bg-warning/5 border border-warning/20 rounded-xl">
                <Clock className="w-3 h-3 animate-pulse" />
                <span>Remplissez le N° certificat, les dates de délivrance et d'expiration pour pouvoir valider et clôturer la phase</span>
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-5 animate-fade-up">
            <div className="p-5 bg-gradient-to-br from-role-primary-soft/10 to-transparent border border-role-primary/20 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="kpi-icon !w-10 !h-10 bg-role-primary-soft">
                  <Globe className="h-5 w-5 text-role-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Publication Statut</h4>
                  <p className="text-xs text-muted-foreground">Phase 5 — Publication officielle AIP</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-card border border-border rounded-xl">
              <div className="form-field">
                <label className="filter-label"><Globe className="h-3.5 w-3.5 mr-1 inline" />Statut officiel *</label>
                <select className={`form-select ${focusClass}`} style={selectStyle} value={phaseData.statut_officiel || ''} onChange={(e) => setPhaseData({ ...phaseData, statut_officiel: e.target.value as any })} disabled={isLocked || isCompleted}>
                  <option value="">Sélectionner</option>
                  <option value="certifie">Certifié</option>
                  <option value="certifie_restrictions">Certifié avec restrictions</option>
                  <option value="non_certifie">Non certifié</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date publication AIP *</label>
                <input type="date" className={`form-input ${focusClass}`} value={phaseData.date_publication_aip || ''} onChange={(e) => setPhaseData({ ...phaseData, date_publication_aip: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
              <div className="form-field">
                <label className="filter-label"><FileText className="h-3.5 w-3.5 mr-1 inline" />Référence AIP</label>
                <input className={`form-input ${focusClass}`} value={phaseData.reference_aip || ''} onChange={(e) => setPhaseData({ ...phaseData, reference_aip: e.target.value })} disabled={isLocked || isCompleted} placeholder="AIP/AAAA/NNN" />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!mounted || !open) return null;

  return (
    <FormShell
      open={mounted && open}
      onClose={() => onOpenChange(false)}
      title={`Phase ${phase} — ${getPhaseTitle()}`}
      icon={Shield}
      size="3xl"
      dataRole={userRole}
      tabs={
        phaseData.statut && (phase === 1 || phase === 2)
          ? [{ id: 'informations', label: 'Informations' }]
          : [
              { id: 'informations', label: 'Informations' },
              { id: 'documents', label: 'Documents & Signature' },
            ]
      }
      activeTab={activeTab}
      onTabChange={setActiveTab}
      footer={
        phaseData.statut && (phase === 1 || phase === 2) ? undefined : (
          <div className="flex items-center gap-2 w-full justify-between">
            <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              <XCircle className="w-4 h-4" />
              Annuler
            </button>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-secondary gap-2"
                onClick={handleSave}
                disabled={isLocked || isCompleted || isSubmitting}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              {phase < 5 && canAdvance && (
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
        )
      }
    >
      <div>
            <p className="text-muted text-sm mb-4">
              Aérodrome: {aerodrome?.nom} ({aerodrome?.code_oaci})
            </p>

            {activeTab === 'informations' && (
              <div className="space-y-4">
                {renderPhaseContent()}
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-4">
                <CertificationDocumentUpload
                documents={(phaseData.documents || {}) as Record<string, boolean>}
                  onDocumentChange={(key, uploaded) => {
                    const newDocs = { ...phaseData.documents, [key]: uploaded };
                    const total = Object.keys(newDocs).length;
                    const uploadedCount = Object.values(newDocs).filter(Boolean).length;
                    const newCompletude = total > 0 ? Math.round((uploadedCount / total) * 100) : 0;
                    setPhaseData({ ...phaseData, documents: newDocs, completude: newCompletude });
                  }}
                  disabled={isLocked || isCompleted}
                  type="certification"
                  userRole={userRole}
                />
                {(phase === 1 || phase === 2) && (
                  <div className="mt-4 p-4 border border-border rounded-xl">
                    <label className="filter-label mb-2 block">Lettre de transmission DG</label>
                    <LettreTransmissionUpload
                      currentUrl={phaseData.lettre_transmission_url}
                      currentDate={phaseData.lettre_transmission_date as string | undefined}
                      onUpload={(url, _fileName, date) => setPhaseData({ ...phaseData, lettre_transmission_url: url, lettre_transmission_date: date })}
                      onRemove={() => setPhaseData({ ...phaseData, lettre_transmission_url: '', lettre_transmission_date: undefined })}
                      disabled={isLocked || isCompleted}
                    />
                  </div>
                )}
                {phase === 4 && (
                  <div className="mt-4 p-4 border border-border rounded-xl">
                    <label className="filter-label mb-2 block">Certificat signé</label>
                    <SignatureSection
                      documentType="certificat"
                      documentId={certification?.id || 'new'}
                      signataireNom="DG ANACIM"
                dateSignature={phaseData.date_signature as string | undefined}
                      onSigned={(url) => setPhaseData({ ...phaseData, certificat_url: url, date_signature: new Date().toISOString() })}
                      disabled={isLocked || isCompleted}
                    />
                  </div>
                )}
              </div>
            )}
      </div>
    </FormShell>
  );
}

// Composant principal
export default function CertificationModule({ userRole: userRoleProp, user: userProp }: CertificationModuleProps) {
  const { startTransition } = useGlobalTransition();
  const aerodromes = useOptimizedStore(s => s.aerodromes)
  const certifications = useOptimizedStore(s => s.certifications)
  const updateCertification = useAppStore(s => s.updateCertification)
  const addCertification = useAppStore(s => s.addCertification)
  const addNotification = useAppStore(s => s.addNotification)
  const setActiveModule = useAppStore(s => s.setActiveModule)
  const storeUser = useOptimizedStore(s => s.user);
  const user = storeUser ?? userProp;
  const userRole = userRoleProp ?? userProp?.role ?? storeUser?.role ?? 'inspector';

  const [selectedPhase, setSelectedPhase] = useState<{ aerodrome: Aerodrome; phase: number } | null>(null);
  const [phaseModalOpen, setPhaseModalOpen] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');
  const [exemptionManagerOpen, setExemptionManagerOpen] = useState(false);
  const [currentCertificationForExemption, setCurrentCertificationForExemption] = useState<Certification | null>(null);
  const [phaseDocsAerodrome, setPhaseDocsAerodrome] = useState<Aerodrome | null>(null);
  const [phaseDocsModalOpen, setPhaseDocsModalOpen] = useState(false);

  // IA states
  const [isIaAnalyzing, setIsIaAnalyzing] = useState(false);
  const [iaAnalysis, setIaAnalysis] = useState<CertificationAnalysisResult | null>(null);
  const [showIaAnalysis, setShowIaAnalysis] = useState(false);

  const allCertifications = certifications || [];
  const internationalAerodromes = useMemo(() => {
    return aerodromes.filter(a => a.type === 'international');
  }, [aerodromes]);

  // Défini avant filteredAerodromes pour éviter la TDZ (const n'est pas hoistée)
  const getCertification = (aerodromeId: string) => {
    return allCertifications.find(c => c.aerodrome_id === aerodromeId);
  };

  const filteredAerodromes = useMemo(() => {
    if (filterStatut === 'all') return internationalAerodromes;
    return internationalAerodromes.filter(a => {
      const cert = getCertification(a.id);
      return cert?.statut_global === filterStatut;
    });
  }, [internationalAerodromes, filterStatut, certifications]);

  // Certifications archivées (terminées)
  const archivedCertifications = useMemo(() => {
    return allCertifications.filter(c => c.statut_global === 'certifie' || c.statut_global === 'archive');
  }, [allCertifications]);

  const stats = useMemo(() => {
    const total = internationalAerodromes.length;
    const enCours = allCertifications.filter(c => c.statut_global === 'en_cours').length;
    const certifies = allCertifications.filter(c => c.statut_global === 'certifie').length;
    const { expiringSoon, expired } = checkExpiringCertifications(allCertifications);

    const blockedPhases = allCertifications.reduce((acc, cert) => {
      const phaseStats = getPhaseStats(cert);
      return acc + phaseStats.blocked;
    }, 0);

    const inactivePhases = allCertifications.reduce((acc, cert) => {
      const phaseStats = getPhaseStats(cert);
      return acc + phaseStats.inactive;
    }, 0);

    return {
      total,
      enCours,
      certifies,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
      blockedPhases,
      inactivePhases
    };
  }, [internationalAerodromes, allCertifications]);

  const isPhaseAccessible = (certification: Certification | undefined, aerodrome: Aerodrome, phase: number) => {
    if (aerodrome.statut_certification === 'certifie' && !certification) return true;
    if (!certification) return phase === 1;
    const currentPhase = certification.phase_active;
    return phase <= currentPhase;
  };

  const isPhaseCompleted = (certification: Certification | undefined, aerodrome: Aerodrome, phase: number) => {
    if (aerodrome.statut_certification === 'certifie' && !certification) return false;
    if (!certification) return false;
    return phase < certification.phase_active;
  };

  const handlePhaseClick = (aerodrome: Aerodrome, phase: number, action: 'view' | 'edit' | 'notify' | 'delete' | 'exemptions') => {
    // Aérodrome déjà certifié mais sans dossier → ouvrir PhaseDocsModal
    if (aerodrome.statut_certification === 'certifie' && !getCertification(aerodrome.id)) {
      setPhaseDocsAerodrome(aerodrome);
      startTransition(() => setPhaseDocsModalOpen(true));
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
      const certification = getCertification(aerodrome.id);
      if (certification && window.confirm(`Êtes-vous sûr de vouloir réinitialiser la phase ${phase} ?`)) {
        const updatedPhasesData = {
          ...certification.phases_data,
          [`phase${phase}`]: {}
        };

        updateCertification(certification.id, {
          phases_data: updatedPhasesData,
          updated_at: new Date().toISOString()
        });

        addNotification({
          user_id: user?.id || '',
          type: 'warning',
          title: 'Phase réinitialisée',
          message: `Phase ${phase} du dossier ${certification.reference} a été réinitialisée.`,
          canal: 'in_app',
        });
      }
      return;
    }

    if (action === 'exemptions') {
      setCurrentCertificationForExemption(getCertification(aerodrome.id) ?? null);
      startTransition(() => setExemptionManagerOpen(true));
      return;
    }

    setSelectedPhase({ aerodrome, phase });
    startTransition(() => setPhaseModalOpen(true));
  };

  const handleSavePhase = async (phaseData: CertificationPhaseData, advancePhase = true) => {
    if (!selectedPhase) return;
    try {
      const certification = getCertification(selectedPhase.aerodrome.id);
      const now = new Date().toISOString();

      const updatedPhasesData = {
        ...(certification?.phases_data || {}),
        [`phase${selectedPhase.phase}`]: {
          ...phaseData,
          last_activity: now,
          ...(advancePhase ? { cloture_le: now } : {}),
        } as any
      };

      const newPhaseActive = !advancePhase
        ? (certification?.phase_active || 1)
        : selectedPhase.phase >= 5 ? 5 : (selectedPhase.phase + 1) as 1 | 2 | 3 | 4 | 5;

      if (certification) {
        await updateCertification(certification.id, {
          phases_data: updatedPhasesData,
          phase_active: newPhaseActive,
          updated_at: now,
        } as any);
      } else {
        const year = new Date().getFullYear()
        await addCertification({
          id: crypto.randomUUID(),
          aerodrome_id: selectedPhase.aerodrome.id,
          reference: `CERT-${selectedPhase.aerodrome.code_oaci}-${year}`,
          phase_active: newPhaseActive,
          phases_data: updatedPhasesData,
          statut_global: 'en_cours',
          created_at: now,
          updated_at: now,
        });
      }

      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Phase mise à jour',
        message: `Phase ${selectedPhase.phase} du dossier ${selectedPhase.aerodrome.code_oaci} enregistrée.${advancePhase ? ` Phase ${newPhaseActive} débloquée.` : ''}`,
        canal: 'in_app',
      });
    } catch (error) {
      console.error('Erreur sauvegarde phase certification:', error)
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Impossible de sauvegarder la phase. Veuillez réessayer.',
        canal: 'in_app',
      })
    }
  };

  const handleRestoreFromArchive = async (item: Certification) => {
    try {
      await updateCertification(item.id, { statut_global: 'en_cours', archived_at: null });
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Dossier restauré',
        message: `Le dossier ${item.reference} a été restauré depuis les archives.`,
        canal: 'in_app',
      });
    } catch (error) {
      console.error('Erreur restauration certification:', error)
    }
  };

  const handleIaAnalyze = async (certification: Certification | undefined) => {
    if (!certification) return;
    setIsIaAnalyzing(true);
    try {
      const result = await certificationAgent.analyzeProcess({
        processId: certification.id,
        type: 'certification',
        options: {
          includePredictions: true,
          includeBlockageDetection: true,
          includeInspectorSuggestions: true,
        },
      });
      setIaAnalysis(result);
      startTransition(() => setShowIaAnalysis(true));
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


  const getPhaseLastActivity = (certification: Certification | undefined, phase: number): string | null => {
    const phaseData = (certification?.phases_data as Record<string, CertificationPhaseData | undefined>)?.[`phase${phase}`];
    if (!phaseData) return null;

    const dates = [
      phaseData.last_activity,
      phaseData.date_reception,
      phaseData.date_verification,
      phaseData.date_delivrance,
      phaseData.cloture_le
    ].filter((d): d is string => Boolean(d));

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

  const getDaysInactive = (certification: Certification | undefined, phase: number): number => {
    const phaseData = (certification?.phases_data as Record<string, CertificationPhaseData | undefined>)?.[`phase${phase}`];
    if (!phaseData) return 0;

    const dates = [
      phaseData.last_activity,
      phaseData.date_reception,
      phaseData.date_verification,
      phaseData.date_delivrance
    ].filter((d): d is string => Boolean(d));

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
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="certification">

      {/* En-tête */}
      <ModuleHeader
        icon={<ShieldCheck className="h-6 w-6" />}
        title="Certification"
        description="Gestion des certifications des aérodromes internationaux"
        actions={<div className="flex items-center gap-2">
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border appearance-none ${focusClass}`}
            style={selectStyle}
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="en_cours">En cours</option>
            <option value="certifie">Certifié</option>
            <option value="expire">Expiré</option>
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
            <List className="w-4 h-4 inline mr-1.5" /> Liste des certifications
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
      {activeTab === 'dashboard' && <CertDashboard userRole={userRole} />}

      {/* Liste des certifications */}
      {activeTab === 'list' && (
        <AccordionGroup spacing="sm">
          {filteredAerodromes.map((aerodrome) => {
            const certification = getCertification(aerodrome.id);
            const phaseActive = certification?.phase_active || 1;

            const statutBadge = aerodrome.statut_certification === 'certifie' ? 'success' :
              certification?.statut_global === 'expire' ? 'danger' :
              certification?.statut_global === 'suspendu' ? 'warning' : certification ? 'primary' : 'neutral';
            const statutLabel = aerodrome.statut_certification === 'certifie' ? 'Certifié' :
              certification?.statut_global === 'expire' ? 'Expiré' :
              certification?.statut_global === 'suspendu' ? 'Suspendu' : certification ? 'En cours' : 'Non certifié';

            return (
              <AccordionSection
                key={aerodrome.id}
                icon={certification?.statut_global === 'certifie' ? <ShieldCheck className="w-4 h-4 text-white" /> : <Shield className="w-4 h-4 text-white" />}
                title={<><span className="code-oaci-badge mr-2">{aerodrome.code_oaci}</span>{aerodrome.nom}</>}
                badges={
                  <>
                    <span className={`badge ${statutBadge}`}>{statutLabel}</span>
                    {certification?.date_expiration && (
                      <span className={`badge ${
                        new Date(certification.date_expiration) < new Date() ? 'danger' :
                        new Date(certification.date_expiration).getTime() - Date.now() < 60 * 24 * 3600 * 1000 ? 'warning' : 'neutral'
                      }`}>
                        Expire: {new Date(certification.date_expiration).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {certification && <span className="badge outline">Phase {phaseActive}/5</span>}
                    {!certification && aerodrome.statut_certification === 'certifie' && (
                      <span className="badge outline">Préexistante</span>
                    )}
                  </>
                }
                actions={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleIaAnalyze(certification);
                    }}
                    disabled={isIaAnalyzing}
                    className="action-button text-role-primary"
                    title="Analyser avec IA"
                  >
                    {isIaAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  </button>
                }
              >
                {certification && (
                  <CertExpiryAlert
                    certification={certification}
                    onRenouvellement={() => {
                      addNotification({
                        user_id: user?.id || '',
                        type: 'info',
                        title: 'Renouvellement',
                        message: `Préparation du renouvellement pour ${aerodrome.code_oaci}`,
                        canal: 'in_app',
                      });
                    }}
                  />
                )}

                {!certification && aerodrome.statut_certification === 'certifie' ? (
                  <div className="p-4 bg-gradient-to-r from-role-primary-soft/10 to-transparent border border-role-primary/20 rounded-xl flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="kpi-icon !w-10 !h-10 bg-role-primary-soft">
                        <FileText className="h-5 w-5 text-role-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Certification préexistante</h4>
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
                      isCompleted={isPhaseCompleted(certification, aerodrome, phase)}
                      isLocked={!isPhaseAccessible(certification, aerodrome, phase)}
                      data={certification?.phases_data?.[`phase${phase}`]}
                      lastActivity={getPhaseLastActivity(certification, phase)}
                      daysInactive={getDaysInactive(certification, phase)}
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
            <div className="card">
              <div className="card-content py-12 text-center">
                <Shield className="h-12 w-12 text-muted mx-auto mb-4" />
                <p className="text-muted">Aucun aérodrome international trouvé</p>
              </div>
            </div>
          )}
        </AccordionGroup>
      )}


      {/* Modal de phase */}
      {selectedPhase && (
        <PhaseModal
          open={phaseModalOpen}
          onOpenChange={setPhaseModalOpen}
          phase={selectedPhase.phase}
          aerodrome={selectedPhase.aerodrome}
          certification={getCertification(selectedPhase.aerodrome.id)}
          onSave={handleSavePhase}
          userRole={userRole}
        />
      )}

      {/* Modal de gestion des exemptions */}
      {exemptionManagerOpen && currentCertificationForExemption && (
        <ExemptionManager
          open={exemptionManagerOpen}
          onOpenChange={setExemptionManagerOpen}
          parentId={currentCertificationForExemption.id}
          parentType="certification"
          parentReference={currentCertificationForExemption.reference}
          aerodromeId={currentCertificationForExemption.aerodrome_id}
          userRole={userRole}
        />
      )}

      {/* PhaseDocsModal pour aérodromes déjà certifiés */}
      {phaseDocsModalOpen && phaseDocsAerodrome && (
        <PhaseDocsModal
          open={phaseDocsModalOpen}
          onOpenChange={setPhaseDocsModalOpen}
          aerodrome={phaseDocsAerodrome}
          type="certification"
        />
      )}
    </div>
  );
}