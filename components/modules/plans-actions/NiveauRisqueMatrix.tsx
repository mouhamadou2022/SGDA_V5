// components/modules/plans-actions/NiveauRisqueMatrix.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Flame,
  AlertOctagon,
  Info,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  FileText,
  Repeat,
  Globe,
  Activity,
} from 'lucide-react';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface CritereNiveauRisque {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  niveaux: {
    valeur: number;
    label: string;
    description: string;
  }[];
}

export const CRITERES_NIVEAU_RISQUE: CritereNiveauRisque[] = [
  {
    id: 'impact_securite',
    label: 'Impact sur la sécurité',
    description: 'Quel est l\'impact potentiel sur la sécurité des opérations aériennes ?',
    icon: Shield,
    niveaux: [
      { valeur: 4, label: 'Critique', description: 'Accident imminent — perte de vie ou destruction d\'aéronef possible' },
      { valeur: 3, label: 'Élevé', description: 'Incident grave — blessures possibles ou dommages significatifs' },
      { valeur: 2, label: 'Moyen', description: 'Incident mineur — gêne opérationnelle sans danger immédiat' },
      { valeur: 1, label: 'Faible', description: 'Anomalie — aucun impact direct sur la sécurité' },
    ],
  },
  {
    id: 'conformite_reglementaire',
    label: 'Conformité réglementaire',
    description: 'Quel est le degré de non-conformité avec la réglementation ?',
    icon: FileText,
    niveaux: [
      { valeur: 4, label: 'Critique', description: 'Violation directe d\'une exigence réglementaire obligatoire' },
      { valeur: 3, label: 'Élevé', description: 'Non-conformité majeure à une norme ou procédure essentielle' },
      { valeur: 2, label: 'Moyen', description: 'Écart partiel — certains éléments conformes, d\'autres non' },
      { valeur: 1, label: 'Faible', description: 'Écart mineur — interprétation ou formalisme' },
    ],
  },
  {
    id: 'recurrence',
    label: 'Récurrence',
    description: 'Cet écart a-t-il déjà été constaté auparavant ?',
    icon: Repeat,
    niveaux: [
      { valeur: 4, label: 'Critique', description: '≥ 3 fois par an — problème systémique non résolu' },
      { valeur: 3, label: 'Élevé', description: '2 fois par an — tendance à la répétition' },
      { valeur: 2, label: 'Moyen', description: '1 fois par an — occurrence isolée mais significative' },
      { valeur: 1, label: 'Faible', description: 'Première constatation — cas unique' },
    ],
  },
  {
    id: 'portee',
    label: 'Portée',
    description: 'Quelle est l\'étendue de l\'impact de cet écart ?',
    icon: Globe,
    niveaux: [
      { valeur: 4, label: 'Critique', description: 'Tous les aérodromes du réseau sont concernés' },
      { valeur: 3, label: 'Élevé', description: 'Un type d\'aérodrome entier est concerné' },
      { valeur: 2, label: 'Moyen', description: 'Aérodrome spécifique — zone opérationnelle large' },
      { valeur: 1, label: 'Faible', description: 'Zone ou équipement limité' },
    ],
  },
  {
    id: 'tendance',
    label: 'Tendance',
    description: 'Quelle est l\'évolution de la situation ?',
    icon: Activity,
    niveaux: [
      { valeur: 4, label: 'Critique', description: 'Aggravation rapide — situation qui se détériore fortement' },
      { valeur: 3, label: 'Élevé', description: 'Aggravation lente — dégradation progressive' },
      { valeur: 2, label: 'Moyen', description: 'Stable — pas de changement significatif' },
      { valeur: 1, label: 'Faible', description: 'Amélioration — situation en voie de résolution' },
    ],
  },
];

function getNiveauFromScore(score: number): { label: string; icon: React.ComponentType<{ className?: string }>; color: string; badge: string } {
  if (score >= 17) return { label: 'Critique', icon: Flame, color: 'text-danger', badge: 'bg-danger text-white' };
  if (score >= 13) return { label: 'Élevé', icon: AlertOctagon, color: 'text-warning', badge: 'bg-warning text-white' };
  if (score >= 9) return { label: 'Moyen', icon: AlertTriangle, color: 'text-primary', badge: 'bg-primary text-white' };
  return { label: 'Faible', icon: Info, color: 'text-success', badge: 'bg-success text-white' };
}

interface NiveauRisqueMatrixProps {
  onNiveauChange: (niveau: 'critique' | 'eleve' | 'moyen' | 'faible', score: number, notes: Record<string, number>) => void;
  initialNotes?: Record<string, number>;
  userRole?: string;
}

export function NiveauRisqueMatrix({ onNiveauChange, initialNotes, userRole }: NiveauRisqueMatrixProps) {
  const [notes, setNotes] = useState<Record<string, number>>(() => {
    if (initialNotes) return { ...initialNotes };
    return {
      impact_securite: 0,
      conformite_reglementaire: 0,
      recurrence: 0,
      portee: 0,
      tendance: 0,
    };
  });
  const [expandedCritere, setExpandedCritere] = useState<string | null>(null);

  const scoreTotal = useMemo(() => Object.values(notes).reduce((a, b) => a + b, 0), [notes]);
  const niveau = useMemo(() => getNiveauFromScore(scoreTotal), [scoreTotal]);
  const NiveauIcon = niveau.icon;
  const tousNotes = Object.values(notes).every(v => v > 0);

  const handleNoteChange = (critereId: string, valeur: number) => {
    const newNotes = { ...notes, [critereId]: valeur };
    setNotes(newNotes);
    const newScore = Object.values(newNotes).reduce((a, b) => a + b, 0);
    const newNiveau = getNiveauFromScore(newScore);
    const niveauMap: Record<string, 'critique' | 'eleve' | 'moyen' | 'faible'> = {
      'Critique': 'critique',
      'Élevé': 'eleve',
      'Moyen': 'moyen',
      'Faible': 'faible',
    };
    onNiveauChange(niveauMap[newNiveau.label] || 'moyen', newScore, newNotes);
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-role-primary/5 to-transparent rounded-lg border-l-4 border-l-role-primary">
        <div className="p-2 bg-role-gradient rounded-lg">
          <AlertTriangle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold">Matrice d'évaluation du niveau de risque</h3>
          <p className="text-xs text-muted-foreground">Évaluez chaque critère pour déterminer objectivement le niveau de risque de l'écart</p>
        </div>
        {tousNotes && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${niveau.badge}`}>
            <NiveauIcon className="w-4 h-4" />
            <div className="text-center">
              <p className="text-sm font-bold leading-none">{niveau.label}</p>
              <p className="text-[10px] opacity-80">{scoreTotal}/20</p>
            </div>
          </div>
        )}
      </div>

      {/* Légende des scores */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="p-2 rounded bg-danger/10 border border-danger/20">
          <Flame className="w-3.5 h-3.5 text-danger mx-auto mb-1" />
          <p className="font-semibold text-danger">Critique</p>
          <p className="text-[10px] text-muted-foreground">17-20</p>
        </div>
        <div className="p-2 rounded bg-warning/10 border border-warning/20">
          <AlertOctagon className="w-3.5 h-3.5 text-warning mx-auto mb-1" />
          <p className="font-semibold text-warning">Élevé</p>
          <p className="text-[10px] text-muted-foreground">13-16</p>
        </div>
        <div className="p-2 rounded bg-primary/10 border border-primary/20">
          <AlertTriangle className="w-3.5 h-3.5 text-primary mx-auto mb-1" />
          <p className="font-semibold text-primary">Moyen</p>
          <p className="text-[10px] text-muted-foreground">9-12</p>
        </div>
        <div className="p-2 rounded bg-success/10 border border-success/20">
          <Info className="w-3.5 h-3.5 text-success mx-auto mb-1" />
          <p className="font-semibold text-success">Faible</p>
          <p className="text-[10px] text-muted-foreground">5-8</p>
        </div>
      </div>

      {/* Critères */}
      <div className="space-y-2">
        {CRITERES_NIVEAU_RISQUE.map((critere) => {
          const CritereIcon = critere.icon;
          const noteActuelle = notes[critere.id] || 0;
          const isExpanded = expandedCritere === critere.id;

          return (
            <div key={critere.id} className="card border border-border overflow-hidden">
              {/* En-tête du critère */}
              <button
                type="button"
                onClick={() => setExpandedCritere(isExpanded ? null : critere.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CritereIcon className={`w-4 h-4 ${noteActuelle > 0 ? 'text-role-primary' : 'text-muted-foreground'}`} />
                  <div className="text-left">
                    <p className="text-sm font-semibold">{critere.label}</p>
                    <p className="text-[10px] text-muted-foreground">{critere.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {noteActuelle > 0 && (
                    <span className={`text-sm font-bold ${
                      noteActuelle >= 4 ? 'text-danger' :
                      noteActuelle >= 3 ? 'text-warning' :
                      noteActuelle >= 2 ? 'text-primary' : 'text-success'
                    }`}>
                      {noteActuelle}/4
                    </span>
                  )}
                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Détail du critère */}
              {isExpanded && (
                <div className="p-3 border-t border-border bg-muted/30 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {critere.niveaux.map((niveau) => {
                      const isSelected = noteActuelle === niveau.valeur;
                      const Icon = niveau.valeur >= 4 ? Flame : niveau.valeur >= 3 ? AlertOctagon : niveau.valeur >= 2 ? AlertTriangle : Info;
                      const colorClass = niveau.valeur >= 4 ? 'border-danger bg-danger/5' : niveau.valeur >= 3 ? 'border-warning bg-warning/5' : niveau.valeur >= 2 ? 'border-primary bg-primary/5' : 'border-success bg-success/5';
                      const textClass = niveau.valeur >= 4 ? 'text-danger' : niveau.valeur >= 3 ? 'text-warning' : niveau.valeur >= 2 ? 'text-primary' : 'text-success';

                      return (
                        <button
                          key={niveau.valeur}
                          type="button"
                          onClick={() => handleNoteChange(critere.id, niveau.valeur)}
                          className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                            isSelected
                              ? `${colorClass} border-current ring-2 ring-offset-1 ring-role-primary`
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-3.5 h-3.5 ${textClass}`} />
                            <span className={`text-xs font-bold ${textClass}`}>{niveau.label}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">({niveau.valeur} pts)</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">{niveau.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Résumé */}
      {tousNotes && (
        <div className={`p-4 rounded-lg border-2 ${
          niveau.label === 'Critique' ? 'border-danger bg-danger/5' :
          niveau.label === 'Élevé' ? 'border-warning bg-warning/5' :
          niveau.label === 'Moyen' ? 'border-primary bg-primary/5' :
          'border-success bg-success/5'
        }`}>
          <div className="flex items-center gap-3">
            <NiveauIcon className={`w-6 h-6 ${niveau.color}`} />
            <div className="flex-1">
              <p className={`text-sm font-bold ${niveau.color}`}>
                Niveau suggéré : {niveau.label} ({scoreTotal}/20)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Détail : {CRITERES_NIVEAU_RISQUE.map(c => `${c.label}: ${notes[c.id]}/4`).join(' • ')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
