'use client';

import { useCallback } from 'react';
import {
  CalendarCheck,
  ClipboardList,
  FileSignature,
  AlertTriangle,
  FileText,
  Mail,
  Archive,
  CheckCircle2,
  Circle,
  Clock,
} from 'lucide-react';
import { Surveillance } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Etape {
  id: string;
  statut_cle: Surveillance['statut'];
  label: string;
  description: string;
  icon: React.ElementType;
  date_field?: keyof Surveillance;
}

interface SurveillanceStepperProps {
  surveillance: Surveillance;
  onEtapeClick?: (etape: string) => void;
}

// ─── Données statiques des étapes ─────────────────────────────────────────────

const ETAPES: Etape[] = [
  {
    id: 'planifiee',
    statut_cle: 'planifiee',
    label: 'Planifiée',
    description: 'Surveillance programmée dans le calendrier',
    icon: CalendarCheck,
    date_field: 'created_at',
  },
  {
    id: 'en_cours',
    statut_cle: 'en_cours',
    label: 'En cours',
    description: 'Visite sur site — remplissage de la checklist',
    icon: ClipboardList,
  },
  {
    id: 'checklist_signee',
    statut_cle: 'checklist_signee',
    label: 'Checklist signée',
    description: 'Checklist complétée et signée par l\'équipe',
    icon: FileSignature,
  },
  {
    id: 'ecarts_signes',
    statut_cle: 'ecarts_signes',
    label: 'Écarts signés',
    description: 'Écarts constatés rédigés et signés',
    icon: AlertTriangle,
  },
  {
    id: 'rapport_signe',
    statut_cle: 'rapport_signe',
    label: 'Rapport signé',
    description: 'Rapport de surveillance validé et signé',
    icon: FileText,
    date_field: 'rapport_signe_le',
  },
  {
    id: 'lettre_signee',
    statut_cle: 'lettre_signee',
    label: 'Lettre signée',
    description: 'Lettre de notification signée par le DG',
    icon: Mail,
  },
  {
    id: 'transmise',
    statut_cle: 'transmise',
    label: 'Transmise / Archivée',
    description: 'Dossier transmis à l\'exploitant et archivé',
    icon: Archive,
    date_field: 'transmitted_at',
  },
];

const STATUT_ORDER: Record<Surveillance['statut'], number> = {
  planifiee: 0,
  en_cours: 1,
  checklist_signee: 2,
  ecarts_signes: 3,
  rapport_signe: 4,
  lettre_signee: 5,
  transmise: 6,
  archivee: 6,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Statuts considérés comme terminaux : la dernière étape doit s'afficher
// "Complété" et non "En cours"
const TERMINAL_STATUTS: Surveillance['statut'][] = ['transmise', 'archivee']

function getEtapeState(
  etapeIndex: number,
  currentIndex: number,
  isTerminal: boolean
): 'completed' | 'active' | 'future' {
  if (etapeIndex < currentIndex) return 'completed';
  if (etapeIndex === currentIndex) return isTerminal ? 'completed' : 'active';
  return 'future';
}

function formatDate(val: unknown): string | null {
  if (!val || typeof val !== 'string') return null;
  try {
    return new Date(val).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

// ─── Sous-composant: un step ───────────────────────────────────────────────────

interface StepItemProps {
  etape: Etape;
  state: 'completed' | 'active' | 'future';
  isLast: boolean;
  date?: string | null;
  onClick?: () => void;
}

function StepItem({ etape, state, isLast, date, onClick }: StepItemProps) {
  const Icon = etape.icon;

  const circleClass =
    state === 'completed'
      ? 'bg-green-500 border-green-500 text-white'
      : state === 'active'
      ? 'bg-blue-600 border-blue-600 text-white animate-pulse'
      : 'bg-white border-gray-300 text-gray-400';

  const lineClass =
    state === 'completed' ? 'bg-green-400' : 'bg-gray-200';

  const labelClass =
    state === 'completed'
      ? 'text-green-700 font-semibold'
      : state === 'active'
      ? 'text-blue-700 font-semibold'
      : 'text-gray-400 font-medium';

  const descClass =
    state === 'future' ? 'text-gray-300' : 'text-gray-500';

  return (
    <div className="flex gap-4">
      {/* Colonne gauche: cercle + ligne */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={onClick}
          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${circleClass} ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
          aria-label={etape.label}
        >
          {state === 'completed' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : state === 'active' ? (
            <Icon className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-8 mt-1 ${lineClass}`} />
        )}
      </div>

      {/* Colonne droite: texte */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${labelClass}`}>{etape.label}</span>
          {state === 'active' && (
            <span className="badge primary text-xs">En cours</span>
          )}
          {state === 'completed' && (
            <span className="badge success text-xs">Complété</span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${descClass}`}>{etape.description}</p>
        {date && (
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400">{date}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function SurveillanceStepper({ surveillance, onEtapeClick }: SurveillanceStepperProps) {
  const currentIndex = STATUT_ORDER[surveillance.statut] ?? 0;
  const isTerminal = TERMINAL_STATUTS.includes(surveillance.statut)
  const progression = Math.round((currentIndex / (ETAPES.length - 1)) * 100);

  const handleClick = useCallback(
    (etapeId: string) => {
      onEtapeClick?.(etapeId);
    },
    [onEtapeClick]
  );

  return (
    <div className="w-full space-y-4">
      {/* En-tête progression */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Progression du workflow</span>
          <span className="text-sm font-bold text-blue-700">{progression}%</span>
        </div>
        <div className="progress h-2">
          <div className="progress-bar" style={{ width: `${progression}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Étape {currentIndex + 1} / {ETAPES.length}</span>
          <span>
            {surveillance.date_debut
              ? `Débuté le ${formatDate(surveillance.date_debut)}`
              : ''}
          </span>
        </div>
      </div>

      {/* Liste des étapes */}
      <div className="mt-4">
        {ETAPES.map((etape, idx) => {
          const state = getEtapeState(idx, currentIndex, isTerminal);
          const dateVal = etape.date_field
            ? formatDate(surveillance[etape.date_field as keyof Surveillance])
            : null;

          return (
            <StepItem
              key={etape.id}
              etape={etape}
              state={state}
              isLast={idx === ETAPES.length - 1}
              date={dateVal}
              onClick={onEtapeClick ? () => handleClick(etape.id) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SurveillanceStepper;
