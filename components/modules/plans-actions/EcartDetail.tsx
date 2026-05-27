'use client';

import {
  X,
  AlertTriangle,
  MapPin,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  ClipboardList,
  Send,
  Shield,
  AlertOctagon,
  ChevronRight,
  User,
} from 'lucide-react';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { Ecart } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EcartDetailProps {
  ecartId: string;
  onClose: () => void;
}

type StatutEcart = Ecart['statut'];

// ─── Config workflow PAC ──────────────────────────────────────────────────────

interface WorkflowStep {
  id: StatutEcart;
  label: string;
  description: string;
  icon: React.ElementType;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 'ouvert', label: 'Ouvert', description: 'Écart créé, notification envoyée à l\'exploitant', icon: AlertTriangle },
  { id: 'pac_attendu', label: 'PAC attendu', description: 'Exploitant doit soumettre son Plan d\'Actions Correctives', icon: ClipboardList },
  { id: 'pac_soumis', label: 'PAC soumis', description: 'PAC reçu, en attente d\'évaluation par l\'inspecteur', icon: Send },
  { id: 'pac_accepte', label: 'PAC accepté', description: 'PAC évalué et accepté par l\'ANACIM', icon: CheckCircle2 },
  { id: 'preuves_soumises', label: 'Preuves soumises', description: 'Exploitant a soumis les preuves de mise en oeuvre', icon: FileText },
  { id: 'cloture', label: 'Clôturé', description: 'Écart validé et clôturé par l\'inspecteur référent', icon: Shield },
];

const STATUT_ORDER: Record<string, number> = {
  ouvert: 0,
  pac_attendu: 1,
  pac_soumis: 2,
  pac_refuse: 2,
  pac_accepte: 3,
  preuves_soumises: 4,
  preuves_evaluees: 4,
  en_retard: 1,
  cloture: 5,
};

// ─── Config niveaux risque ─────────────────────────────────────────────────────

const NIVEAU_CONFIG: Record<Ecart['niveau_risque'], { label: string; badgeClass: string; icon: React.ElementType; textClass: string }> = {
  critique: { label: 'Critique', badgeClass: 'danger', icon: AlertOctagon, textClass: 'text-red-700' },
  eleve: { label: 'Élevé', badgeClass: 'warning', icon: AlertTriangle, textClass: 'text-amber-700' },
  moyen: { label: 'Moyen', badgeClass: 'primary', icon: AlertCircle, textClass: 'text-blue-700' },
  faible: { label: 'Faible', badgeClass: 'success', icon: CheckCircle2, textClass: 'text-green-700' },
};

function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

// ─── Sous-composant: step workflow ────────────────────────────────────────────

function WorkflowStepItem({
  step,
  state,
  isLast,
}: {
  step: WorkflowStep;
  state: 'completed' | 'active' | 'future';
  isLast: boolean;
}) {
  const Icon = step.icon;

  const circleClass =
    state === 'completed'
      ? 'bg-green-500 border-green-500 text-white'
      : state === 'active'
      ? 'bg-blue-600 border-blue-600 text-white animate-pulse'
      : 'bg-white border-gray-300 text-gray-300';

  const lineClass = state === 'completed' ? 'bg-green-400' : 'bg-gray-200';

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${circleClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        {!isLast && <div className={`w-0.5 flex-1 min-h-6 mt-1 ${lineClass}`} />}
      </div>
      <div className="pb-4 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${state === 'future' ? 'text-gray-400' : 'text-gray-800'}`}>
            {step.label}
          </span>
          {state === 'active' && <span className="badge primary text-xs">Actuel</span>}
          {state === 'completed' && <span className="badge success text-xs">Fait</span>}
        </div>
        <p className={`text-xs mt-0.5 ${state === 'future' ? 'text-gray-300' : 'text-gray-500'}`}>
          {step.description}
        </p>
      </div>
    </div>
  );
}

// ─── Sous-composant: actions PAC ──────────────────────────────────────────────

function PacActionsSection({ ecart }: { ecart: Ecart }) {
  const pac = ecart.pac;
  if (!pac) return null;

  return (
    <div className="space-y-3">
      {pac.actions.map((action, idx) => (
        <div key={idx} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Action {idx + 1}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(action.date_prevue)}</span>
            </div>
          </div>
          <p className="text-sm text-gray-800">{action.description}</p>
          <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{action.responsable}</span>
            </div>
            {action.livrables.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-medium">Livrables:</span>
                {action.livrables.map((l, li) => (
                  <span key={li} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{l}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {pac.observations && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
          <span className="font-semibold">Observations : </span>
          {pac.observations}
        </div>
      )}

      <div className="text-xs text-gray-400 flex items-center gap-2">
        <Clock className="w-3 h-3" />
        <span>Soumis le {formatDate(pac.soumis_le)} par {pac.soumis_par}</span>
        <span>— Version {pac.version}</span>
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function EcartDetail({ ecartId, onClose }: EcartDetailProps) {
  const ecart = useOptimizedStore(s => s.ecarts.find((e: Ecart) => e.id === ecartId));
  const aerodromes = useOptimizedStore(s => s.aerodromes);

  if (!ecart) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <p className="text-gray-500 text-sm">Écart introuvable (ID: {ecartId})</p>
        <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    );
  }

  const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id);
  const niveauCfg = NIVEAU_CONFIG[ecart.niveau_risque];
  const NiveauIcon = niveauCfg.icon;
  const currentStep = STATUT_ORDER[ecart.statut] ?? 0;
  const progressionPac = Math.round((currentStep / (WORKFLOW_STEPS.length - 1)) * 100);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-gray-500">{ecart.reference}</span>
            <span className={`badge ${niveauCfg.badgeClass} gap-1`}>
              <NiveauIcon className="w-3 h-3" />
              {niveauCfg.label}
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 leading-snug">{ecart.libelle}</h2>
          <div className="flex items-center gap-4 flex-wrap text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{aerodrome?.nom ?? ecart.aerodrome_id}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Créé le {formatDate(ecart.created_at)}</span>
            </div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm flex-shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="border-t border-border my-2" />

      {/* Section 1: Description */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          Description de l&apos;écart
        </h3>
        <div className="card">
          <div className="card-content pt-4 space-y-3">
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Libellé complet</span>
              <p className="text-sm text-gray-800 mt-1">{ecart.libelle}</p>
            </div>
            <div className="border-t border-border my-2" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Référence réglementaire</span>
                <p className="text-sm font-mono text-blue-700 mt-1">{ecart.ref_reglementaire}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Surveillance source</span>
                <p className="text-sm text-gray-700 mt-1">
                  {ecart.surveillance_id ? (
                    <span className="flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                      {ecart.surveillance_id}
                    </span>
                  ) : '—'}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Délai PAC</span>
                <p className="text-sm text-gray-700 mt-1">{formatDate(ecart.delai_pac)}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Délai régularisation</span>
                <p className="text-sm text-gray-700 mt-1">{formatDate(ecart.delai_regularisation)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Workflow PAC */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-blue-600" />
          Workflow PAC
        </h3>
        <div className="card">
          <div className="card-content pt-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Progression</span>
              <span className="text-xs font-bold text-blue-700">{progressionPac}%</span>
            </div>
            <div className="progress h-1.5 mb-4">
              <div className="progress-bar" style={{width:`${progressionPac}%`}} />
            </div>
            {WORKFLOW_STEPS.map((step, idx) => {
              const stepIndex = STATUT_ORDER[step.id] ?? idx;
              const state =
                stepIndex < currentStep ? 'completed'
                : stepIndex === currentStep ? 'active'
                : 'future';
              return (
                <WorkflowStepItem
                  key={step.id}
                  step={step}
                  state={state}
                  isLast={idx === WORKFLOW_STEPS.length - 1}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 3: PAC actuel */}
      {ecart.pac && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            Plan d&apos;Actions Correctives soumis
          </h3>
          <div className="card">
            <div className="card-content pt-4">
              <PacActionsSection ecart={ecart} />
            </div>
          </div>
        </div>
      )}

      {!ecart.pac && (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
          <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Aucun PAC soumis pour le moment.</p>
        </div>
      )}
    </div>
  );
}

export default EcartDetail;
