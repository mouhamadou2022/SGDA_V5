// components/modules/certification/CertificationModule.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  AlertTriangle,
  Clock,
  User,
  Users,
  Paperclip,
  Brain,
  Loader2,
  Upload,
  BarChart3,
  Filter,
  Search,
  ChevronRight,
} from 'lucide-react';

import { useOptimizedStore, useGlobalTransition } from '@/lib/performance/globalOptimizer';
import { useAppStore, Aerodrome, Certification, CertificationPhaseData, Planning } from '@/lib/store';
import type { CertificationAnalysisResult } from '@/lib/ia/agents/certificationAgent';
import { useRouter } from 'next/navigation';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { certificationAgent } from '@/lib/ia/agents/certificationAgent';
import { checkExpiringCertifications, getPhaseStats } from '@/lib/certificationUtils';
import { CertificationDocumentUpload } from './CertificationDocumentUpload';
import { SignatureSection } from '../signatures/SignatureSection';
import { LettreTransmissionUpload } from '@/components/ui/LettreTransmissionUpload';
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
  surveillanceBadge?: React.ReactNode;
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
  daysInactive,
  surveillanceBadge
}: PhaseCardProps) {
  const getProgressValue = () => {
    if (isCompleted) return 100;
    if (isActive) {
      if (data?.completude) return data.completude;
      if (!data?.date_reception) return 75;
      return 50;
    }
    return 0;
  };

  const getStatusBadge = () => {
    if (surveillanceBadge) return surveillanceBadge;
    if (isCompleted) return <span className="badge success">Complété</span>;
    if (isActive && !data?.date_reception && phase > 1) return <span className="badge warning">En attente exploitant</span>;
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
    </Card>
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
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const exemptions = useAppStore(s => s.exemptions);
  const checklistItemsMap = useAppStore(s => s.checklistItems);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  const router = useRouter();
  const [showTypeChoice, setShowTypeChoice] = useState<'standard' | 'sgs' | null>(null);
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
  const today = new Date().toISOString().split('T')[0];
  const dateError = phaseData.date_fin && phaseData.date_debut && phaseData.date_fin <= phaseData.date_debut
    ? 'La date de fin doit être postérieure à la date de début'
    : phaseData.date_debut && phaseData.date_debut < today
    ? 'La date de début ne peut pas être dans le passé'
    : null;

  useEffect(() => {
    setMounted(true);
    if (open && certification) {
      setPhaseData(
        (certification?.phases_data as Record<string, CertificationPhaseData | undefined>)?.[`phase${phase}`] || {}
      );
    }
  }, [open, certification, phase]);

  const isLocked = phase > (certification?.phase_active || 1);
  const isCompleted = phase < (certification?.phase_active || 1);

  const canAdvance = useMemo(() => {
    if (phase === 1) return !!phaseData.date_reception && !!phaseData.coordonnees?.nom && !!phaseData.coordonnees?.email
    if (phase === 2) return !!phaseData.date_reception && !!phaseData.numero_dossier && !!phaseData.responsable_id
    if (phase === 3) {
      const surv = surveillances.find(s => s.id === phaseData.surveillance_id);
      const isTransmise = surv?.statut === 'transmise';
      const related = ecarts.filter(e => e.surveillance_id === phaseData.surveillance_id);
      const allPacAccepted = related.length === 0 || related.every(e => e.statut === 'pac_accepte' || e.statut === 'cloture');
      const certExemps = exemptions.filter(e => e.parent_id === certification?.id);
      const allExemptionsEval = certExemps.length === 0 || certExemps.every(e => e.avis_final !== undefined);
      return !!phaseData.date_debut && !!phaseData.date_fin && !dateError && !!phaseData.chef_id && isTransmise && allPacAccepted && allExemptionsEval && (phaseData.conclusion === 'favorable' || phaseData.conclusion === 'favorable_conditions');
    }
    if (phase === 4) return !!phaseData.numero_certificat && !!phaseData.date_delivrance && !!phaseData.date_expiration && new Date(phaseData.date_expiration) > new Date(phaseData.date_delivrance)
    if (phase === 5) return false
    return false
  }, [phase, phaseData, surveillances, ecarts, exemptions, certification]);

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
    const updated = { ...phaseData, statut: 'accuse' as const, date_accuse_reception: now };
    setPhaseData(updated);
    setIsSubmitting(true);
    try {
      await onSave(updated, false);
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur accusé réception certification:', error)
    } finally {
      setIsSubmitting(false);
    }
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
      const shouldAdvance = phase === 2 && decision === 'favorable';
      await onSave(updatedData, shouldAdvance);
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur décision phase certification:', error)
    } finally {
      setIsDeciding(false);
    }
  };

  const handleInspectorFileUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const { uploadFile } = await import('@/lib/datastore');
        const path = `certifications/${aerodrome.id}/${Date.now()}_${file.name}`;
        const result = await uploadFile('documents', path, file);
        if (result.error) throw new Error(result.error);
        if (result.data) {
          setInspecteurFichiers(prev => [...prev, { nom: file.name, url: result.data!.url }]);
        }
      } catch (err) {
        console.error('Erreur upload fichier inspecteur:', err);
      }
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

  const DOCUMENT_LABELS: Record<string, string> = {
    lettre_demande_formelle: 'Lettre de demande formelle',
    formulaire_demande_formelle: 'Formulaire de demande formelle',
    plan_masse: 'Plan de masse',
    plan_situation: 'Plan de situation',
    manuel_aerodrome: "Manuel d'aérodrome",
    manuel_sgs: 'Manuel SGS',
    plan_urgence: "Plan d'urgence",
    plan_enlevement: "Plan d'enlèvement",
  };

  const handleCreateSurveillance = async () => {
    if (!aerodrome) return;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const planningId = crypto.randomUUID();
    const porteeComplete = ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS'];
    const planning: Planning = {
      id: planningId,
      aerodrome_id: aerodrome.id,
      type: 'certification',
      date_debut: today,
      date_fin: today,
      portee: porteeComplete,
      equipe_ids: [],
      chef_id: null as any,
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

    setPhaseData(prev => ({
      ...prev,
      planning_id: planningId,
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
            {/* Carte demandeur */}
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
              {phaseData.lettre_intent_url || phaseData.inspecteur_fichiers?.length ? (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Documents</p>
                  <div className="space-y-2">
                    {phaseData.lettre_intent_url && (
                      <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm truncate">{phaseData.lettre_intent_name || phaseData.lettre_intent_url.split('/').pop()?.replace(/^\d+_/, '') || 'Dossier de demande'}</span>
                        </div>
                        <a href={phaseData.lettre_intent_url} target="_blank" rel="noopener noreferrer" className="action-button shrink-0" title="Voir">
                          <Eye className="w-4 h-4" />
                        </a>
                        <a href={phaseData.lettre_intent_url} download target="_blank" rel="noopener noreferrer" className="action-button shrink-0" title="Télécharger">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                    {phaseData.inspecteur_fichiers?.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{f.nom || `Fichier ${i + 1}`}</span>
                        </div>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="action-button shrink-0" title="Voir">
                          <Eye className="w-4 h-4" />
                        </a>
                        <a href={f.url} download target="_blank" rel="noopener noreferrer" className="action-button shrink-0" title="Télécharger">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {phaseData.date_accuse_reception && (
                <p className="text-xs text-muted mt-2">Accusé réception: {new Date(phaseData.date_accuse_reception).toLocaleDateString('fr-FR')}</p>
              )}
            </div>

            {/* Phase 1 workflow */}
            {phase1Status === 'en_attente' && !isLocked && !isCompleted && (
              <div className="p-4 bg-role-primary-soft/5 border border-role-primary/20 rounded-xl text-center">
                <p className="text-sm text-foreground mb-4">Demande en attente de traitement — accuser réception pour débuter l'instruction</p>
                <button type="button" onClick={handleAccuseReception} className="btn btn-primary gap-2">
                  <CheckCircle2 className="w-4 h-4" />Accuser réception
                </button>
              </div>
            )}

            {(phase1Status === 'accuse' || phase1Status === 'en_cours') && !isLocked && !isCompleted && (
              <div className="space-y-5 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground">Instruction de la demande</h4>

                {/* Commentaires — zone d'évaluation principale */}
                <div className="form-field">
                  <label className="filter-label"><AlertCircle className="h-3.5 w-3.5 mr-1 inline" />Avis de l'inspecteur</label>
                  <textarea
                    className={`form-textarea ${focusClass}`}
                    value={phaseData.inspecteur_commentaires || ''}
                    onChange={(e) => setPhaseData({ ...phaseData, inspecteur_commentaires: e.target.value })}
                    rows={4}
                    placeholder="Évaluez la demande : conformité, complétude, observations..."
                  />
                </div>

                {/* 3 décisions — action principale */}
                <div className="flex flex-wrap gap-3">
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

                {/* Fichiers d'évaluation — optionnel */}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground select-none">Ajouter des fichiers d'évaluation (optionnel)</summary>
                  <div className="space-y-2 mt-3">
                    {inspecteurFichiers.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-success/5 border border-success/30 rounded-xl">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-success shrink-0" />
                          <span className="text-sm text-foreground truncate">{f.nom}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="action-button" title="Voir"><Eye className="w-4 h-4" /></a>
                          <a href={f.url} download target="_blank" rel="noopener noreferrer" className="action-button" title="Télécharger"><Download className="w-4 h-4" /></a>
                          <button type="button" className="action-button hover:text-danger" onClick={() => removeInspectorFile(i)}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={handleInspectorFileUpload} className="btn btn-secondary w-full gap-2 py-4 border-dashed">
                      <Upload className="w-5 h-5" />
                      <span>Ajouter un fichier</span>
                    </button>
                  </div>
                </details>
              </div>
            )}

            {/* Messages de résultat */}
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
              <p className="text-xs mt-1">La Phase 2 sera accessible après avis favorable de la Phase 1 — l'exploitant soumet depuis le portail exploitant.</p>
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

            {/* Documents soumis par l'exploitant */}
            {phaseData.documents && Object.keys(phaseData.documents).length > 0 && (
              <div className="p-4 bg-card border border-border rounded-xl">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Documents soumis par l'exploitant</p>
                <div className="space-y-2">
                  {Object.entries(phaseData.documents).filter(([, val]) => val).map(([key, val]) => {
                    const url = typeof val === 'string' ? val : undefined;
                    return (
                      <div key={key} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm truncate">{DOCUMENT_LABELS[key] || key}</span>
                        </div>
                        {url && (
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="action-button" title="Voir">
                              <Eye className="w-4 h-4" />
                            </a>
                            <a href={url} download target="_blank" rel="noopener noreferrer" className="action-button" title="Télécharger">
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fichiers joints (rapport évaluation, lettre transmission) */}
            {(phaseData.rapport_evaluation_url || phaseData.lettre_transmission_url || phaseData.inspecteur_fichiers?.length) && (
              <div className="p-4 bg-card border border-border rounded-xl">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Fichiers</p>
                <div className="space-y-2">
                  {phaseData.rapport_evaluation_url && (
                    <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm truncate">Rapport d'évaluation</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={phaseData.rapport_evaluation_url} target="_blank" rel="noopener noreferrer" className="action-button" title="Voir">
                          <Eye className="w-4 h-4" />
                        </a>
                        <a href={phaseData.rapport_evaluation_url} download target="_blank" rel="noopener noreferrer" className="action-button" title="Télécharger">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}
                  {phaseData.lettre_transmission_url && (
                    <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm truncate">Lettre de transmission</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={phaseData.lettre_transmission_url} target="_blank" rel="noopener noreferrer" className="action-button" title="Voir">
                          <Eye className="w-4 h-4" />
                        </a>
                        <a href={phaseData.lettre_transmission_url} download target="_blank" rel="noopener noreferrer" className="action-button" title="Télécharger">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}
                  {phaseData.inspecteur_fichiers?.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{f.nom || `Fichier ${i + 1}`}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="action-button" title="Voir"><Eye className="w-4 h-4" /></a>
                        <a href={f.url} download target="_blank" rel="noopener noreferrer" className="action-button" title="Télécharger"><Download className="w-4 h-4" /></a>
                        {!isLocked && !isCompleted && (
                          <button type="button" className="action-button hover:text-danger" onClick={() => removeInspectorFile(i)}><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!isLocked && !isCompleted && (
                    <button type="button" onClick={handleInspectorFileUpload} className="btn btn-secondary w-full gap-2 py-2 border-dashed text-xs">
                      <Upload className="w-4 h-4" />
                      <span>Ajouter un fichier</span>
                    </button>
                  )}
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
              <div className="space-y-5 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground">Instruction de la demande formelle</h4>

                <div className="form-field">
                  <label className="filter-label"><AlertCircle className="h-3.5 w-3.5 mr-1 inline" />Avis de l'inspecteur</label>
                  <textarea
                    className={`form-textarea ${focusClass}`}
                    value={phaseData.inspecteur_commentaires || ''}
                    onChange={(e) => setPhaseData({ ...phaseData, inspecteur_commentaires: e.target.value })}
                    rows={4}
                    placeholder="Évaluez la demande : conformité du dossier, complétude, observations..."
                  />
                </div>

                <div className="flex flex-wrap gap-3">
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

                {!isLocked && !isCompleted && (
                  <div className="mt-4">
                    <button type="button" onClick={handleInspectorFileUpload} className="btn btn-secondary gap-2 text-xs">
                      <Upload className="w-4 h-4" />Ajouter un fichier d'évaluation
                    </button>
                  </div>
                )}
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

      case 3: {
        const surv = surveillances.find(s => s.id === phaseData.surveillance_id);
        const isTransmise = surv?.statut === 'transmise';
        const checklistItems = checklistItemsMap?.[phaseData.surveillance_id || ''] || [];
        const saCount = checklistItems.filter(i => i.resultat === 'SA').length;
        const nvCount = checklistItems.filter(i => i.resultat === 'NV').length;
        const nsCount = checklistItems.filter(i => i.resultat === 'NS').length;
        const denominator = saCount + nvCount + nsCount;
        const tcScore = denominator > 0 ? Math.round((saCount / denominator) * 100) : surv?.score_global ?? 0;
        const relatedEcarts = ecarts.filter(e => e.surveillance_id === phaseData.surveillance_id);
        const allPacAccepted = relatedEcarts.length === 0 || relatedEcarts.every(e => e.statut === 'pac_accepte' || e.statut === 'cloture');
        const certExemptions = exemptions.filter(e => e.parent_id === certification?.id);
        const allExemptionsEval = certExemptions.length === 0 || certExemptions.every(e => e.avis_final !== undefined);
        const conclusionUnlocked = isTransmise && allPacAccepted && allExemptionsEval;

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
              {!phaseData.surveillance_id && !phaseData.planning_id && (
                <div className="alert alert-info">
                  <AlertCircle className="alert-icon" />
                  <div className="alert-content">
                    <div className="alert-title">Surveillance requise</div>
                    <div className="alert-description mb-3">
                      Créez un planning de surveillance. Rendez-vous ensuite dans le module <strong>Planning</strong> pour lancer la surveillance.
                    </div>
                    <button type="button" onClick={handleCreateSurveillance} className="btn btn-primary gap-2 shadow-role-glow">
                      <Calendar className="h-4 w-4" />Créer le planning
                    </button>
                  </div>
                </div>
              )}
              {phaseData.planning_id && !phaseData.surveillance_id && (
                <div className="alert alert-warning">
                  <Clock className="alert-icon" />
                  <div className="alert-content">
                    <div className="alert-title">Planning créé</div>
                    <div className="alert-description mb-3">
                      Le planning a été créé. Lancez la surveillance depuis le module <strong>Planning</strong>.
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setActiveModule('planning')} className="btn btn-primary gap-2">
                        <Calendar className="h-4 w-4" />Aller au module Planning
                      </button>
                      <button type="button" onClick={() => {
                        const planningPortee = ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS'];
                        const hasSGS = planningPortee.includes('SGS');
                        if (hasSGS) {
                          setShowTypeChoice('standard');
                        } else {
                          router.push(`/preparation-checklist/${phaseData.planning_id}?type=standard`);
                        }
                      }} className="btn btn-outline gap-2">
                        <ClipboardList className="h-4 w-4" />Préparer la checklist
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {phaseData.surveillance_id && (
                <div className="alert alert-success">
                  <CheckCircle2 className="alert-icon" />
                  <div className="alert-content">
                    <div className="alert-title">Surveillance créée</div>
                    <span className="text-sm">Statut: <strong>{surv?.statut === 'transmise' ? 'Transmise à l\'exploitant' : surv?.statut ? surv.statut.replace(/_/g, ' ') : '—'}</strong></span>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => {
                        const survPortee = surv?.portee || [];
                        const hasSGS = survPortee.includes('SGS');
                        const isSgsOnly = survPortee.length === 1 && survPortee[0] === 'SGS';
                        if (hasSGS && !isSgsOnly) {
                          setShowTypeChoice('standard');
                        } else if (isSgsOnly) {
                          router.push(`/surveillance/${phaseData.surveillance_id}/checklist?type=sgs`);
                        } else {
                          router.push(`/surveillance/${phaseData.surveillance_id}/checklist?type=standard`);
                        }
                      }} className="btn btn-sm btn-primary gap-1 mt-1">
                        <ClipboardList className="h-3.5 w-3.5" />Ouvrir la checklist
                      </button>
                      <button type="button" onClick={() => router.push(`/surveillance/${phaseData.surveillance_id}`)} className="btn btn-sm btn-outline gap-1 mt-1">
                        <Eye className="h-3.5 w-3.5" />Détails surveillance
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date début *</label>
                <input type="date" className={`form-input ${focusClass}`} min={today} max={phaseData.date_fin || undefined} value={phaseData.date_debut || phaseData.date_verification || ''} onChange={(e) => setPhaseData({ ...phaseData, date_debut: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
              <div className="form-field">
                <label className="filter-label"><Calendar className="h-3.5 w-3.5 mr-1 inline" />Date fin *</label>
                <input type="date" className={`form-input ${focusClass}`} min={phaseData.date_debut || today} value={phaseData.date_fin || ''} onChange={(e) => setPhaseData({ ...phaseData, date_fin: e.target.value })} disabled={isLocked || isCompleted} />
              </div>
            </div>

            {dateError && !isLocked && !isCompleted && (
              <div className="alert alert-warning p-2 text-xs">
                <AlertCircle className="alert-icon w-3.5 h-3.5" />
                <span>{dateError}</span>
              </div>
            )}

            {/* Équipe de surveillance */}
            <div className="p-4 bg-card border border-border rounded-xl">
              <label className="filter-label mb-3"><Users className="h-3.5 w-3.5 mr-1 inline" />Équipe de surveillance</label>
              <div className="space-y-3">
                <div className="form-field">
                  <label className="text-xs text-muted-foreground">Chef d'équipe *</label>
                  <select className={`form-select ${focusClass}`} style={selectStyle} value={phaseData.chef_id || ''} onChange={(e) => setPhaseData({ ...phaseData, chef_id: e.target.value })} disabled={isLocked || isCompleted}>
                    <option value="">Sélectionner</option>
                    {utilisateurs.filter(u => ['inspecteur', 'chef_inspecteur', 'admin'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {utilisateurs.filter(u => ['inspecteur', 'chef_inspecteur', 'admin'].includes(u.role)).map(u => (
                    <button key={u.id} type="button"
                      onClick={() => { const current = phaseData.equipe_ids || []; const next = current.includes(u.id) ? current.filter((i: string) => i !== u.id) : [...current, u.id]; setPhaseData({ ...phaseData, equipe_ids: next }); }}
                      disabled={isLocked || isCompleted}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${phaseData.equipe_ids?.includes(u.id) ? 'bg-role-gradient text-white shadow-role-glow' : 'btn btn-secondary'}`}>
                      {u.prenom} {u.nom}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="filter-label"><BarChart3 className="h-3.5 w-3.5 mr-1 inline" />Score conformité</label>
                <div className="p-4 bg-background rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">TC = SA / (SA + NV + NS)</span>
                    <span className={`text-2xl font-bold ${tcScore >= 80 ? 'text-success' : tcScore >= 60 ? 'text-warning' : 'text-danger'}`}>
                      {tcScore}%
                    </span>
                  </div>
                  <div className="progress h-2">
                    <div className={`progress-bar ${tcScore >= 80 ? 'progress-eleve' : tcScore >= 60 ? 'progress-moyen' : 'progress-faible'}`} style={{ width: `${tcScore}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>SA: {saCount}</span>
                    <span>NV: {nvCount}</span>
                    <span>NS: {nsCount}</span>
                    <span>NA: {checklistItems.filter(i => i.resultat === 'NA').length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Prérequis avant conclusion */}
            <div className="p-4 bg-card border border-border rounded-xl">
              <label className="filter-label mb-3"><CheckCircle2 className="h-3.5 w-3.5 mr-1 inline" />Prérequis avant conclusion</label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {isTransmise ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" /> : <Clock className="w-5 h-5 text-warning shrink-0" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium">Surveillance transmise à l'exploitant</p>
                    <p className="text-xs text-muted-foreground">{isTransmise ? 'Rapport transmis' : 'En attente de transmission du rapport'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {allPacAccepted ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" /> : <Clock className="w-5 h-5 text-warning shrink-0" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium">Plans d'actions acceptés</p>
                    <p className="text-xs text-muted-foreground">{allPacAccepted ? `${relatedEcarts.length} PAC(s) accepté(s)` : `${relatedEcarts.filter(e => e.evaluation_pac?.decision === 'accepte' || e.evaluation_pac?.decision === 'reserve' || e.statut === 'pac_accepte').length}/${relatedEcarts.length} PAC accepté(s)`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {allExemptionsEval ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" /> : <Clock className="w-5 h-5 text-warning shrink-0" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{certExemptions.length > 0 ? 'Exemptions évaluées' : 'Exemptions'}</p>
                    <p className="text-xs text-muted-foreground">{allExemptionsEval ? (certExemptions.length > 0 ? `${certExemptions.length} exemption(s) évaluée(s)` : 'Aucune exemption requise') : `${certExemptions.filter(e => e.avis_final !== undefined).length}/${certExemptions.length} évaluée(s)`}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Conclusion */}
            <div className={`p-5 rounded-2xl border-2 transition-all duration-300 ${
              !conclusionUnlocked ? 'border-muted/30 bg-muted/10 opacity-70' :
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
              {conclusionUnlocked ? (
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
              ) : (
                <div className="alert alert-warning">
                  <Lock className="alert-icon" />
                  <div className="alert-content">
                    La conclusion est verrouillée. Complétez tous les prérequis ci-dessus pour la déverrouiller.
                  </div>
                </div>
              )}
              {!canAdvance && phaseData.conclusion === 'defavorable' && (
                <div className="mt-3 alert alert-danger">
                  <AlertCircle className="alert-icon" />
                  <div className="alert-content">Conclusion défavorable — la phase ne peut pas être clôturée.</div>
                </div>
              )}
              {!canAdvance && !phaseData.conclusion && conclusionUnlocked && (
                <div className="mt-3 flex items-center gap-2 text-xs text-warning">
                  <Clock className="w-3 h-3 animate-pulse" />
                  <span>Sélectionnez une conclusion pour pouvoir valider et clôturer la phase</span>
                </div>
              )}
            </div>
          </div>
        );
      }

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

  // Phases 1 et 2 : workflow exploitant → inspecteur (statut requis pour agir)
  const hasWorkflow = !!(phaseData.statut && (phase === 1 || phase === 2))

  return (
    <>
    <FormShell
      open={mounted && open}
      onClose={() => onOpenChange(false)}
      title={`Phase ${phase} — ${getPhaseTitle()}`}
      icon={Shield}
      size="3xl"
      dataRole={userRole}
      tabs={
        hasWorkflow
          ? [{ id: 'informations', label: 'Informations' }]
          : phase === 3
            ? [{ id: 'informations', label: 'Informations' }]
            : phase >= 4
              ? [
                  { id: 'informations', label: 'Informations' },
                  { id: 'documents', label: 'Documents & Signature' },
                ]
              : [{ id: 'informations', label: 'Informations' }]
      }
      activeTab={activeTab}
      onTabChange={setActiveTab}
      footer={
        hasWorkflow ? undefined : (
          <div className="flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              <XCircle className="w-4 h-4" /> Fermer
            </button>
            {phase >= 3 && (
              <>
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
              </>
            )}
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
                documents={(phaseData.documents || {})}
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

    {typeof window !== 'undefined' && showTypeChoice && createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => setShowTypeChoice(null)}>
        <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
              <div className="modal-title flex items-center gap-2"><ClipboardList className="w-5 h-5 text-role-primary" />Choisir le type de checklist</div>
              <button className="modal-close" onClick={() => setShowTypeChoice(null)}><XCircle className="w-4 h-4" /></button>
            </div>
            <div className="modal-body py-5 px-5 space-y-4">
              <p className="text-sm text-muted-foreground">Cette surveillance inclut le domaine SGS. Sélectionnez le format à consulter :</p>
              <button type="button" className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left" onClick={() => {
                setShowTypeChoice(null);
                const id = phaseData.surveillance_id || phaseData.planning_id;
                const prefix = phaseData.surveillance_id ? `/surveillance/${id}` : `/preparation-checklist/${id}`;
                router.push(`${prefix}?type=standard`);
              }}>
                <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5 text-role-primary" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground">Checklist Standard</p><p className="text-xs text-muted-foreground">Items standards RAS-14</p></div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <button type="button" className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left" onClick={() => {
                setShowTypeChoice(null);
                const id = phaseData.surveillance_id || phaseData.planning_id;
                const prefix = phaseData.surveillance_id ? `/surveillance/${id}` : `/preparation-checklist/${id}`;
                router.push(`${prefix}?type=sgs`);
              }}>
                <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><Shield className="w-5 h-5 text-role-primary" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground">Checklist SGS</p><p className="text-xs text-muted-foreground">Évaluation SGS (PAOE - Annexe 19 OACI)</p></div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
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
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const user = storeUser ?? userProp;
  const userRole = userRoleProp ?? userProp?.role ?? storeUser?.role ?? 'inspector';

  const [selectedPhase, setSelectedPhase] = useState<{ aerodrome: Aerodrome; phase: number } | null>(null);
  const [phaseModalOpen, setPhaseModalOpen] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAerodrome, setFilterAerodrome] = useState<string>('all');
  const [filterPhase, setFilterPhase] = useState<number>(0);
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
    let list = internationalAerodromes;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(a => a.nom.toLowerCase().includes(q) || a.code_oaci.toLowerCase().includes(q));
    }

    if (filterAerodrome !== 'all') {
      list = list.filter(a => a.id === filterAerodrome);
    }

    if (filterPhase > 0) {
      list = list.filter(a => {
        const cert = getCertification(a.id);
        return cert ? cert.phase_active === filterPhase : filterPhase === 1;
      });
    }

    if (filterStatut !== 'all') {
      list = list.filter(a => {
        const cert = getCertification(a.id);
        return cert?.statut_global === filterStatut || (!cert && filterStatut === 'non_certifie');
      });
    }

    return list;
  }, [internationalAerodromes, searchTerm, filterAerodrome, filterPhase, filterStatut, certifications]);

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
      } else if (advancePhase) {
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
        actions={<button className="btn btn-secondary gap-2 flex items-center">
          <Download className="w-4 h-4" />
          Exporter
        </button>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-icon bg-role-primary-soft"><BarChart3 className="w-5 h-5 text-role-primary" /></div><div className="kpi-content"><div className="kpi-label">Total</div><div className="kpi-value">{stats.total}</div></div></div>
        <div className="kpi-card"><div className="kpi-icon bg-warning-soft"><Clock className="w-5 h-5 text-warning" /></div><div className="kpi-content"><div className="kpi-label">En cours</div><div className="kpi-value text-warning">{stats.enCours}</div></div></div>
        <div className="kpi-card"><div className="kpi-icon bg-success-soft"><ShieldCheck className="w-5 h-5 text-success" /></div><div className="kpi-content"><div className="kpi-label">Certifiés</div><div className="kpi-value text-success">{stats.certifies}</div></div></div>
        <div className="kpi-card"><div className="kpi-icon bg-warning-soft"><AlertTriangle className="w-5 h-5 text-warning" /></div><div className="kpi-content"><div className="kpi-label">Exp. ≤ 30j</div><div className="kpi-value text-warning">{stats.expiringSoon}</div></div></div>
        <div className="kpi-card"><div className="kpi-icon bg-danger-soft"><AlertCircle className="w-5 h-5 text-danger" /></div><div className="kpi-content"><div className="kpi-label">Expirés</div><div className="kpi-value text-danger">{stats.expired}</div></div></div>
        <div className="kpi-card"><div className="kpi-icon bg-danger-soft"><Lock className="w-5 h-5 text-danger" /></div><div className="kpi-content"><div className="kpi-label">Blocages</div><div className="kpi-value text-danger">{stats.blockedPhases}</div></div></div>
      </div>

      {/* Filtres & recherche */}
      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
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

          <select
            value={filterAerodrome}
            onChange={(e) => setFilterAerodrome(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">Tous aérodromes</option>
            {internationalAerodromes.map(a => (
              <option key={a.id} value={a.id}>{a.code_oaci} — {a.nom}</option>
            ))}
          </select>

          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(Number(e.target.value))}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value={0}>Toutes phases</option>
            <option value={1}>Phase 1</option>
            <option value={2}>Phase 2</option>
            <option value={3}>Phase 3</option>
            <option value={4}>Phase 4</option>
            <option value={5}>Phase 5</option>
          </select>

          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">Tous statuts</option>
            <option value="en_cours">En cours</option>
            <option value="certifie">Certifié</option>
            <option value="non_certifie">Non certifié</option>
            <option value="expire">Expiré</option>
          </select>
        </div>
      </Card>

      {/* Liste des certifications */}
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
              ) : !certification ? (
                <div className="p-6 bg-card border border-border rounded-xl text-center">
                  <Shield className="h-12 w-12 text-muted mx-auto mb-4" />
                  <p className="font-semibold text-foreground">Aérodrome non certifié</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                    L'exploitant doit être invité à soumettre une expression d'intérêt de certification depuis son portail point focal.
                  </p>
                </div>
              ) : (
                PHASES.map(({ phase, title, icon, description }) => {
                  const phaseData = certification?.phases_data?.[`phase${phase}`] as CertificationPhaseData | undefined;
                  const isSurveillancePhase = phase === 3;
                  const surv = isSurveillancePhase && phaseData?.surveillance_id
                    ? surveillances.find(s => s.id === phaseData.surveillance_id) : undefined;
                  const relatedEcarts = surv ? ecarts.filter(e => e.surveillance_id === surv.id) : [];
                  const allPacAccepted = relatedEcarts.length === 0 || relatedEcarts.every(e => e.statut === 'pac_accepte' || e.statut === 'cloture');
                  const isSurvTransmise = surv?.statut === 'transmise';
                  const surveillanceBadge = isSurveillancePhase && phaseActive === phase ? (
                    surv ? (
                      isSurvTransmise ? (
                        allPacAccepted ? <span className="badge success">PAC validés</span>
                        : <span className="badge warning">Attente de PAC</span>
                      ) : <span className="badge primary pulse">Surveillance en cours</span>
                    ) : <span className="badge warning">En attente vérification sur site</span>
                  ) : undefined;
                  return (
                  <PhaseCard
                    key={phase}
                    phase={phase}
                    title={title}
                    icon={icon}
                    description={description}
                    isActive={phaseActive === phase}
                    isCompleted={isPhaseCompleted(certification, aerodrome, phase)}
                    isLocked={!isPhaseAccessible(certification, aerodrome, phase)}
                    data={phaseData}
                    lastActivity={getPhaseLastActivity(certification, phase)}
                    daysInactive={getDaysInactive(certification, phase)}
                    onView={() => handlePhaseClick(aerodrome, phase, 'view')}
                    onEdit={() => handlePhaseClick(aerodrome, phase, 'edit')}
                    onNotify={() => handlePhaseClick(aerodrome, phase, 'notify')}
                    onDelete={() => handlePhaseClick(aerodrome, phase, 'delete')}
                    onManageExemptions={() => handlePhaseClick(aerodrome, phase, 'exemptions')}
                    surveillanceBadge={surveillanceBadge}
                  />
                  );
                })
              )}
            </AccordionSection>
          );
        })}

        {filteredAerodromes.length === 0 && (
          <Card className="[&>div:last-child]:!py-12 [&>div:last-child]:!text-center">
            <Shield className="h-12 w-12 text-muted mx-auto mb-4" />
            <p className="text-muted">Aucun aérodrome international trouvé</p>
          </Card>
        )}
      </AccordionGroup>


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