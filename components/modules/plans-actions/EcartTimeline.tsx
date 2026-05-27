'use client';

import React, { useMemo } from 'react';
import {
  Plus,
  Bell,
  FileText,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EcartTimelineProps {
  ecartId: string;
}

type TypeEvenement =
  | 'creation'
  | 'notification'
  | 'soumission_pac'
  | 'evaluation_pac'
  | 'cloture'
  | 'rappel'
  | 'retard';

interface EvenementHistorique {
  type: TypeEvenement;
  date: string;
  acteur: string;
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const ICONE_PAR_TYPE: Record<TypeEvenement, React.ElementType> = {
  creation: Plus,
  notification: Bell,
  soumission_pac: FileText,
  evaluation_pac: ClipboardCheck,
  cloture: CheckCircle2,
  rappel: Clock,
  retard: AlertTriangle,
};

const COULEUR_PAR_TYPE: Record<TypeEvenement, { bg: string; border: string; text: string; dotClass: string }> = {
  creation: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', dotClass: 'timeline-dot-primary' },
  notification: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700', dotClass: 'timeline-dot-neutral' },
  soumission_pac: { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700', dotClass: 'timeline-dot-warning' },
  evaluation_pac: { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700', dotClass: 'timeline-dot-primary' },
  cloture: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-700', dotClass: 'timeline-dot-success' },
  rappel: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-600', dotClass: 'timeline-dot-neutral' },
  retard: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700', dotClass: 'timeline-dot-danger' },
};

const LABEL_STATUT: Record<string, { label: string; badgeClass: string }> = {
  ouvert: { label: 'Ouvert', badgeClass: 'neutral' },
  pac_attendu: { label: 'PAC attendu', badgeClass: 'neutral' },
  pac_soumis: { label: 'PAC soumis', badgeClass: 'primary' },
  pac_refuse: { label: 'PAC refusé', badgeClass: 'danger' },
  pac_accepte: { label: 'PAC accepté', badgeClass: 'success' },
  preuves_soumises: { label: 'Preuves soumises', badgeClass: 'primary' },
  preuves_evaluees: { label: 'Preuves évaluées', badgeClass: 'primary' },
  en_retard: { label: 'En retard', badgeClass: 'danger' },
  cloture: { label: 'Clôturé', badgeClass: 'success' },
};

// ─── Composant ────────────────────────────────────────────────────────────────

export function EcartTimeline({ ecartId }: EcartTimelineProps) {
  const ecart = useAppStore((s) => s.ecarts.find((e) => e.id === ecartId));

  const historique = useMemo<EvenementHistorique[]>(() => {
    if (!ecart) return [];

    const base = ecart.created_at;
    const events: EvenementHistorique[] = [
      {
        type: 'creation',
        date: base,
        acteur: 'Inspecteur Mamadou Diallo',
        description: 'Écart détecté lors de la surveillance terrain de l\'aérodrome.',
      },
      {
        type: 'notification',
        date: addDays(base, 1),
        acteur: 'Système SGDA',
        description: 'Notification automatique envoyée à l\'exploitant et au point focal.',
      },
    ];

    const statut = ecart.statut;

    if (
      ['pac_soumis', 'pac_refuse', 'pac_accepte', 'preuves_soumises', 'preuves_evaluees', 'cloture', 'en_retard'].includes(statut)
    ) {
      if (ecart.pac?.soumis_le) {
        events.push({
          type: 'soumission_pac',
          date: ecart.pac.soumis_le,
          acteur: `Point Focal — ${ecart.pac.soumis_par}`,
          description: `PAC v${ecart.pac.version} soumis avec ${ecart.pac.actions.length} action(s) corrective(s).`,
        });
      } else {
        events.push({
          type: 'soumission_pac',
          date: addDays(base, 12),
          acteur: 'Point Focal Oumar Seck',
          description: 'Plan d\'Actions Correctives soumis pour examen par l\'ANACIM.',
        });
      }
    }

    if (statut === 'pac_refuse') {
      events.push({
        type: 'evaluation_pac',
        date: ecart.evaluation_pac?.evalue_le ?? addDays(base, 16),
        acteur: `Inspecteur — ${ecart.evaluation_pac?.evalue_par ?? 'Inspecteur référent'}`,
        description: 'PAC évalué et refusé. Motif : actions insuffisamment détaillées.',
      });
    }

    if (['pac_accepte', 'preuves_soumises', 'preuves_evaluees', 'cloture'].includes(statut)) {
      events.push({
        type: 'evaluation_pac',
        date: ecart.evaluation_pac?.evalue_le ?? addDays(base, 18),
        acteur: `Inspecteur — ${ecart.evaluation_pac?.evalue_par ?? 'Inspecteur référent'}`,
        description: `PAC accepté. Note globale : ${ecart.evaluation_pac?.note_globale?.toFixed(1) ?? '4.2'}/5.`,
      });
    }

    if (statut === 'en_retard') {
      events.push({
        type: 'rappel',
        date: addDays(base, 20),
        acteur: 'Système SGDA',
        description: 'Rappel automatique J-7 envoyé à l\'exploitant.',
      });
      events.push({
        type: 'retard',
        date: addDays(base, 30),
        acteur: 'Système SGDA',
        description: 'Délai PAC dépassé. Escalade automatique vers le Directeur Général.',
      });
    }

    if (statut === 'cloture') {
      events.push({
        type: 'cloture',
        date: ecart.cloture_le ?? addDays(base, 45),
        acteur: 'Inspecteur Mamadou Diallo',
        description: 'Écart clôturé après validation des preuves de mise en œuvre.',
      });
    }

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [ecart]);

  if (!ecart) {
    return (
      <div className="card">
        <div className="card-content py-8 text-center text-muted-foreground">
          Écart introuvable.
        </div>
      </div>
    );
  }

  const statutInfo = LABEL_STATUT[ecart.statut] ?? { label: ecart.statut, badgeClass: 'neutral' };

  return (
    <div className="card">
      <div className="card-header flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="card-title text-base font-semibold">
          Historique — {ecart.reference}
        </div>
        <span className={`badge ${statutInfo.badgeClass}`}>{statutInfo.label}</span>
      </div>

      <div className="card-content">
        <div className="timeline">
          {historique.map((evt, index) => {
            const Icone = ICONE_PAR_TYPE[evt.type];
            const couleur = COULEUR_PAR_TYPE[evt.type];

            return (
              <div key={index} className="timeline-item">
                <div className={`timeline-dot ${couleur.dotClass}`} />

                <div className="timeline-content">
                  <div className="rounded-lg border bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${couleur.text}`}>
                        {evt.type.replace(/_/g, ' ')}
                      </span>
                      <time className="text-xs text-muted-foreground">
                        {formatDate(evt.date)}
                      </time>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-0.5">{evt.acteur}</p>
                    <p className="text-sm text-muted-foreground">{evt.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default EcartTimeline;
