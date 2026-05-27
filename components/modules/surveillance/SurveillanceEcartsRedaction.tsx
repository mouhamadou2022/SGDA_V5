// components/modules/surveillance/SurveillanceEcartsRedaction.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle,
  PenLine,
  Trash2,
  Plus,
  AlertTriangle,
  X,
  Save,
  Clock,
  FileText,
  Eye,
  Download,
  ChevronDown,
  ChevronRight,
  Users,
  Target,
  Send,
  FolderTree,
  Sparkles,
  Brain,
  Loader2,
  Zap,
  MapPin,
  Calendar,
} from 'lucide-react';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { ecartAgent } from '@/lib/ia/agents/ecartAgent';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { recordRiskIndexFeedback, getRiskLevelFromCell } from '@/lib/riskIndex';

// Classes CSS réutilisées depuis globals.css
const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

// Types
export interface EcartRedaction {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  item_ids: string[];
  created_at: string;
  updated_at: string;
  cellule_risque_oaci?: string;
  probabilite_risque?: 1 | 2 | 3 | 4 | 5;
  gravite_risque?: 'A' | 'B' | 'C' | 'D' | 'E';
  justification_risque_ia?: string;
  cellule_ia_suggeree?: string;
  /** Domaine réglementaire de l'écart (SGS, PHY, OLS…) — utilisé lors de la transmission */
  domaine?: string;
  /** ID de la surveillance source */
  surveillance_id?: string;
  /** ID de l'aérodrome */
  aerodrome_id?: string;
  /** ID de l'inspecteur rédacteur */
  created_by?: string;
  /** ID du dernier modificateur */
  updated_by?: string;
}

export interface QuestionNSNV {
  id: string;
  numero: string;
  reference_reglementaire: string;
  description: string;
  domaine: string;
  sousDomaine: string;
  sousSousDomaine: string;
  resultat: 'NS' | 'NV';
  /** Niveau PAOE réel de l'élément — SGS uniquement (absent | present | approprie) */
  paoeLevel?: 'absent' | 'present' | 'approprie';
}

interface SurveillanceEcartsRedactionProps {
  surveillanceId: string;
  itemsNSNV: QuestionNSNV[];
  ecartsExistants?: EcartRedaction[];
  onSave?: (ecarts: EcartRedaction[]) => void;
  onSigner?: (signatureUrl: string) => void;
  readOnly?: boolean;
  isSigned?: boolean;
  userRole?: string;
  aerodromeId: string;
}

const NIVEAUX = [
  { value: 'critique', label: 'Critique', variant: 'danger', delais: { pac: 3, regularisation: 7 } },
  { value: 'eleve', label: 'Élevé', variant: 'warning', delais: { pac: 7, regularisation: 30 } },
  { value: 'moyen', label: 'Moyen', variant: 'primary', delais: { pac: 15, regularisation: 90 } },
  { value: 'faible', label: 'Faible', variant: 'success', delais: { pac: 30, regularisation: 180 } },
];

const NIVEAU_VARIANTS: Record<string, string> = {
  critique: 'danger',
  eleve: 'warning',
  moyen: 'primary',
  faible: 'success',
};

function getNiveauRisqueBadge(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'badge danger';
    case 'eleve': return 'badge warning';
    case 'moyen': return 'badge primary';
    case 'faible': return 'badge success';
    default: return 'badge neutral';
  }
}

function getProgressBarColorDynamic(taux: number): string {
  if (taux >= 80) return 'bg-success';
  if (taux >= 60) return 'bg-primary';
  if (taux >= 40) return 'bg-warning';
  return 'bg-danger';
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT: EcartCard
// ─────────────────────────────────────────────────────────────
function EcartCard({
  ecart,
  onEdit,
  onDelete,
  onViewDetails,
  readOnly,
}: {
  ecart: EcartRedaction;
  onEdit: (ecart: EcartRedaction) => void;
  onDelete: (id: string) => void;
  onViewDetails: (ecart: EcartRedaction) => void;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const getNiveauBadge = () => {
    switch (ecart.niveau) {
      case 'critique': return 'badge danger';
      case 'eleve': return 'badge warning';
      case 'moyen': return 'badge primary';
      default: return 'badge neutral';
    }
  };

  return (
    <div className="card border-border mb-2 overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-role-primary-soft transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <span className="code-oaci-badge text-xs">{ecart.reference}</span>
          <span className={getNiveauBadge()}>{ecart.niveau}</span>
          <span className="text-sm text-foreground flex-1 truncate">{ecart.libelle}</span>
          <span className="text-xs text-muted-foreground">{ecart.item_ids.length} item(s)</span>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(ecart); }}
                className="action-button"
                title="Modifier"
              >
                <PenLine className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(ecart.id); }}
                className="action-button text-danger"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetails(ecart); }}
            className="action-button"
            title="Voir détails"
          >
            <Eye className="w-4 h-4" />
          </button>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="p-3 pt-0 border-t border-border animate-fade-in">
          <div className="mt-2 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Référence réglementaire</p>
              <p className="text-sm">{ecart.ref_reglementaire}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Libellé</p>
              <p className="text-sm whitespace-pre-wrap">{ecart.libelle}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Questions associées</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {ecart.item_ids.map((itemId, idx) => (
                  <span key={idx} className="badge outline text-[10px]">{itemId}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Créé le {new Date(ecart.created_at).toLocaleDateString('fr-FR')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Modifié le {new Date(ecart.updated_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT: IaSuggestionBanner
// ─────────────────────────────────────────────────────────────
function IaSuggestionBanner({
  suggestion,
  onApply,
  onAdjustAndApply,
  onIgnore,
  isLoading,
  hideCellule = false,
}: {
  suggestion: { libelle: string; niveau: string; ref_reglementaire: string; justification: string; confiance: number; cellule: string; probabilite: 1 | 2 | 3 | 4 | 5; gravite: 'A' | 'B' | 'C' | 'D' | 'E' } | null;
  onApply: () => void;
  onAdjustAndApply: (probabilite: 1 | 2 | 3 | 4 | 5, gravite: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  onIgnore: () => void;
  isLoading: boolean;
  /** Masquer l'indice OACI — utilisé pour le domaine SGS */
  hideCellule?: boolean;
}) {
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjProb, setAdjProb] = useState<1 | 2 | 3 | 4 | 5>(suggestion?.probabilite ?? 3);
  const [adjGrav, setAdjGrav] = useState<'A' | 'B' | 'C' | 'D' | 'E'>(suggestion?.gravite ?? 'C');

  const adjCellule = `${adjProb}${adjGrav}`;

  const getCelluleBadgeCls = (cellule: string) => {
    const n = getRiskLevelFromCell(cellule);
    if (n === 'critique') return 'bg-red-600 text-white';
    if (n === 'eleve') return 'bg-amber-500 text-white';
    if (n === 'moyen') return 'bg-blue-500 text-white';
    return 'bg-green-500 text-white';
  };

  if (isLoading) {
    return (
      <div className="alert alert-info mb-4 animate-pulse">
        <Loader2 className="alert-icon w-4 h-4 animate-spin" />
        <div className="alert-content flex-1">
          <div className="alert-title">🤖 IA en cours d'analyse...</div>
          <div className="alert-description">Génération d'une suggestion d'écart basée sur les items sélectionnés</div>
        </div>
      </div>
    );
  }

  if (!suggestion) return null;

  return (
    <div className="alert alert-info mb-4 animate-fade-in">
      <Sparkles className="alert-icon w-4 h-4 shrink-0" />
      <div className="alert-content flex-1">
        <div className="alert-title">🤖 Suggestion IA</div>
        <div className="alert-description space-y-2">
          {/* Indice OACI — masqué pour le domaine SGS */}
          {!hideCellule && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Indice OACI:</span>
                <span
                  className={`inline-flex items-center justify-center rounded font-bold text-sm px-2.5 py-1 font-mono tracking-widest ${getCelluleBadgeCls(suggestion.cellule)}`}
                  title={suggestion.justification}
                >
                  {suggestion.cellule}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Probabilité <strong>{suggestion.probabilite}</strong>/5 × Gravité <strong>{suggestion.gravite}</strong>
              </div>
              <div>
                <span className={`badge ${getNiveauRisqueBadge(suggestion.niveau)} text-xs`}>{suggestion.niveau}</span>
              </div>
              <div className="text-xs text-muted-foreground">Confiance: <strong>{suggestion.confiance}%</strong></div>
            </div>
          )}
          {hideCellule && (
            <div className="flex items-center gap-2">
              <span className="badge neutral text-[9px]">SGS — évaluation du risque non applicable</span>
            </div>
          )}

          <div>
            <span className="font-medium text-xs">Libellé suggéré:</span>
            <p className="text-sm mt-1 bg-white p-2 rounded-lg border border-primary/20">{suggestion.libelle}</p>
          </div>
          <div className="text-xs">
            <span className="font-medium">Réf.:</span>{' '}
            <span className="code-oaci-badge">{suggestion.ref_reglementaire}</span>
          </div>
          <p className="text-xs text-muted-foreground italic">{suggestion.justification}</p>

          {/* Mode ajustement inspecteur */}
          {adjustMode && (
            <div className="mt-2 p-3 bg-white rounded-lg border border-primary/30 space-y-2">
              <p className="text-xs font-semibold text-foreground">Ajuster l'indice OACI :</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Probabilité (1-5):</label>
                  <select
                    value={adjProb}
                    onChange={e => setAdjProb(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="form-select text-xs h-7 px-2 py-0"
                  >
                    {([1, 2, 3, 4, 5] as const).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Gravité (A-E):</label>
                  <select
                    value={adjGrav}
                    onChange={e => setAdjGrav(e.target.value as 'A' | 'B' | 'C' | 'D' | 'E')}
                    className="form-select text-xs h-7 px-2 py-0"
                  >
                    {(['A', 'B', 'C', 'D', 'E'] as const).map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <span className={`inline-flex items-center justify-center rounded font-bold text-sm px-2 py-0.5 font-mono ${getCelluleBadgeCls(adjCellule)}`}>
                  {adjCellule}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onAdjustAndApply(adjProb, adjGrav)}
                  className="btn btn-sm px-3 py-1 btn-primary gap-1"
                >
                  <Zap className="w-3 h-3" />
                  Appliquer avec ajustement
                </button>
                <button onClick={() => setAdjustMode(false)} className="btn btn-sm px-3 py-1 btn-secondary">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {!adjustMode && (
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={onApply} className="btn btn-sm px-3 py-1 btn-primary gap-1 whitespace-nowrap">
            <Zap className="w-3 h-3" />
            Valider
          </button>
          <button
            onClick={() => { setAdjProb(suggestion.probabilite); setAdjGrav(suggestion.gravite); setAdjustMode(true); }}
            className="btn btn-sm px-3 py-1 btn-secondary gap-1 whitespace-nowrap"
          >
            Ajuster
          </button>
          <button onClick={onIgnore} className="btn btn-sm px-2 py-1 btn-ghost text-xs">
            Ignorer
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT: IaAssistant
// ─────────────────────────────────────────────────────────────
function IaAssistant({ onQuestion, isAsking }: { onQuestion: (question: string) => void; isAsking: boolean }) {
  const [question, setQuestion] = useState('');
  const [show, setShow] = useState(false);

  const handleAsk = () => {
    if (question.trim()) {
      onQuestion(question);
      setQuestion('');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="action-button text-role-primary"
        title="Assistant IA"
      >
        <Brain className="w-4 h-4" />
      </button>

      {show && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-lg z-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-sm font-semibold">Assistant IA</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Posez une question sur la rédaction des écarts..."
              className={`flex-1 form-input text-sm ${focusClass}`}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            />
            <button
              onClick={handleAsk}
              disabled={isAsking || !question.trim()}
              className="btn btn-sm px-3 py-1 btn-primary"
            >
              {isAsking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function SurveillanceEcartsRedaction({
  surveillanceId,
  itemsNSNV,
  ecartsExistants,
  onSave,
  onSigner,
  readOnly = false,
  isSigned = false,
  userRole = 'inspector',
  aerodromeId,
}: SurveillanceEcartsRedactionProps) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const surveillances = useOptimizedStore(s => s.surveillances);
  const aerodromes = useOptimizedStore(s => s.aerodromes);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === aerodromeId);

  const [ecarts, setEcarts] = useState<EcartRedaction[]>(ecartsExistants || []);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [formEcart, setFormEcart] = useState<Partial<EcartRedaction>>({ niveau: 'moyen' });
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedEcartDetails, setSelectedEcartDetails] = useState<EcartRedaction | null>(null);
  const [expandedDomaines, setExpandedDomaines] = useState<string[]>([]);
  
  // États IA
  const [iaSuggestion, setIaSuggestion] = useState<{ libelle: string; niveau: string; ref_reglementaire: string; justification: string; confiance: number; cellule: string; probabilite: 1 | 2 | 3 | 4 | 5; gravite: 'A' | 'B' | 'C' | 'D' | 'E' } | null>(null);
  const [isIaGenerating, setIsIaGenerating] = useState(false);
  const [iaAnswer, setIaAnswer] = useState<string | null>(null);
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [showIaSuggestion, setShowIaSuggestion] = useState(true);

  const profilAerodrome = profilsRisque?.[aerodromeId] || null;

  // Sync ecarts existants when prop changes
  useEffect(() => {
    if (ecartsExistants && ecartsExistants.length > 0) {
      setEcarts(ecartsExistants);
    }
  }, [ecartsExistants]);

  // Calcul des items restants (non encore traités)
  const processedItemIds = useMemo(() => {
    return ecarts.flatMap(e => e.item_ids);
  }, [ecarts]);

  // Grouper les items par domaine pour l'affichage
  const itemsByDomaine = useMemo(() => {
    const groups: Record<string, QuestionNSNV[]> = {};
    itemsNSNV.forEach(item => {
      if (!processedItemIds.includes(item.id)) {
        if (!groups[item.domaine]) groups[item.domaine] = [];
        groups[item.domaine].push(item);
      }
    });
    return groups;
  }, [itemsNSNV, processedItemIds]);

  const itemsRestantsCount = itemsNSNV.filter(i => !processedItemIds.includes(i.id)).length;

  // Générer la suggestion IA quand des items sont sélectionnés
  useEffect(() => {
    const generateIaSuggestion = async () => {
      if (selectedItems.length === 0) {
        setIaSuggestion(null);
        return;
      }

      setIsIaGenerating(true);
      try {
        const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
        
        const result = await ecartAgent.generateEcart({
          itemsNSNV: selectedQuestions.map(item => ({
            id: item.id,
            numero: item.numero,
            point_verification: item.description,
            reference_reglementaire: item.reference_reglementaire,
            observation: '',
            domaine: item.domaine,
            paoeLevel: item.paoeLevel,
          } as any)),
          aerodromeId: aerodromeId,
          surveillanceId: surveillanceId,
          profil: profilAerodrome || undefined,
        }, {});

        setIaSuggestion({
          libelle: result.libelle,
          niveau: result.niveau_risque,
          ref_reglementaire: result.ref_reglementaire,
          justification: `Basé sur ${selectedItems.length} items NS/NV et le profil de risque (score ${profilAerodrome?.score_global || 'N/A'})`,
          confiance: result.confiance,
          cellule: result.cellule,
          probabilite: result.probabilite,
          gravite: result.gravite,
        });
      } catch (error) {
        console.error('[IA] Erreur génération suggestion:', error);
      } finally {
        setIsIaGenerating(false);
      }
    };

    const timeout = setTimeout(() => {
      generateIaSuggestion();
    }, 500);

    return () => clearTimeout(timeout);
  }, [selectedItems, itemsNSNV, aerodromeId, surveillanceId, profilAerodrome]);

  // Mise à jour automatique des références réglementaires lors de la sélection
  useEffect(() => {
    if (selectedItems.length > 0) {
      const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
      const uniqueRefs = [...new Set(selectedQuestions.map(q => q.reference_reglementaire).filter(Boolean))];
      const refReglementaire = uniqueRefs.join(', ');
      
      setFormEcart(prev => ({
        ...prev,
        ref_reglementaire: refReglementaire || prev.ref_reglementaire || '',
      }));
    }
  }, [selectedItems, itemsNSNV]);

  const toggleDomaineExpand = (domaine: string) => {
    setExpandedDomaines(prev =>
      prev.includes(domaine) ? prev.filter(d => d !== domaine) : [...prev, domaine]
    );
  };

  const handleApplyIaSuggestion = (
    adjustedProbabilite?: 1 | 2 | 3 | 4 | 5,
    adjustedGravite?: 'A' | 'B' | 'C' | 'D' | 'E',
  ) => {
    if (!iaSuggestion) return;

    const finalProbabilite = adjustedProbabilite ?? iaSuggestion.probabilite;
    const finalGravite = adjustedGravite ?? iaSuggestion.gravite;
    const finalCellule = `${finalProbabilite}${finalGravite}`;
    const wasAdjusted = adjustedProbabilite !== undefined || adjustedGravite !== undefined;

    setFormEcart(prev => ({
      ...prev,
      libelle: iaSuggestion.libelle,
      niveau: iaSuggestion.niveau as EcartRedaction['niveau'],
      ref_reglementaire: iaSuggestion.ref_reglementaire,
      cellule_risque_oaci: finalCellule,
      probabilite_risque: finalProbabilite,
      gravite_risque: finalGravite,
      justification_risque_ia: iaSuggestion.justification,
      cellule_ia_suggeree: iaSuggestion.cellule,
    }));

    if (profilAerodrome) {
      recordRiskIndexFeedback(
        aerodromeId,
        {
          score_global: profilAerodrome.score_global,
          c1: profilAerodrome.c1,
          c2: profilAerodrome.c2,
          c3: profilAerodrome.c3,
          c4: profilAerodrome.c4,
          c5: profilAerodrome.c5,
          velocity: profilAerodrome.velocity_metrics?.vitesse || 0,
          nb_ecarts_critiques: 0,
          nb_nv: itemsNSNV.filter(i => i.resultat === 'NV').length,
          nb_ns: itemsNSNV.filter(i => i.resultat === 'NS').length,
        },
        {
          probabilite: iaSuggestion.probabilite,
          gravite: iaSuggestion.gravite,
          cellule: iaSuggestion.cellule,
          niveau: getRiskLevelFromCell(iaSuggestion.cellule),
          score: 0,
          confidence: iaSuggestion.confiance,
          volatilite: 0,
          tendance: 'stable',
        },
        {
          probabilite: finalProbabilite,
          gravite: finalGravite,
          cellule: finalCellule,
          niveau: getRiskLevelFromCell(finalCellule),
          score: 0,
          confidence: iaSuggestion.confiance,
          volatilite: 0,
          tendance: 'stable',
        },
      );
    }

    setShowIaSuggestion(false);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestion IA appliquée',
      message: wasAdjusted
        ? `Suggestion appliquée avec ajustement : ${iaSuggestion.cellule} → ${finalCellule}`
        : `Champs pré-remplis — Indice OACI : ${finalCellule}`,
      canal: 'in_app',
    });
  };

  const handleIgnoreIaSuggestion = () => {
    setIaSuggestion(null);
    setShowIaSuggestion(false);
  };

  const handleAskAssistant = async (question: string) => {
    setIsAskingAssistant(true);
    try {
      const result = await assistantAgent.chat({
        message: question,
        contexte: {
          module: 'ecarts-redaction',
          aerodromeId: aerodromeId,
          surveillanceId: surveillanceId,
        },
        userRole: userRole,
      });
      setIaAnswer(result.message);
      setTimeout(() => setIaAnswer(null), 8000);
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: "Impossible de contacter l'assistant",
        canal: 'in_app',
      });
    } finally {
      setIsAskingAssistant(false);
    }
  };

  const handleAjouterEcart = () => {
    if (selectedItems.length === 0) {
      setErrors({ selectItems: 'Veuillez sélectionner au moins une question NS/NV' });
      return;
    }

    const newErrors: Record<string, string> = {};
    if (!formEcart.ref_reglementaire) newErrors.ref_reglementaire = "La référence réglementaire est requise";
    if (!formEcart.libelle) newErrors.libelle = "Le libellé est requis";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const now = new Date().toISOString();
    // Déduire le domaine depuis les items sélectionnés (premier domaine trouvé)
    const domaineItems = selectedItems
      .map(id => itemsNSNV.find(i => i.id === id)?.domaine)
      .filter(Boolean);
    const domaineDeduit = domaineItems[0] || formEcart.domaine || '';
    const newEcart: EcartRedaction = {
      id: editingId || crypto.randomUUID(),
      reference: formEcart.reference || `ECA-${new Date().getFullYear()}-${String(ecarts.length + 1).padStart(3, '0')}`,
      ref_reglementaire: formEcart.ref_reglementaire || '',
      libelle: formEcart.libelle || '',
      niveau: (formEcart.niveau as EcartRedaction['niveau']) || 'moyen',
      item_ids: selectedItems,
      domaine: domaineDeduit,
      created_at: editingId ? (ecarts.find(e => e.id === editingId)?.created_at || now) : now,
      updated_at: now,
      // L'indice OACI (matrice probabilité × gravité) n'est pas applicable au domaine SGS
      cellule_risque_oaci: domaineDeduit === 'SGS' ? undefined : formEcart.cellule_risque_oaci,
      probabilite_risque: domaineDeduit === 'SGS' ? undefined : formEcart.probabilite_risque,
      gravite_risque: domaineDeduit === 'SGS' ? undefined : formEcart.gravite_risque,
      justification_risque_ia: formEcart.justification_risque_ia,
      cellule_ia_suggeree: formEcart.cellule_ia_suggeree,
    };

    if (editingId) {
      const updated = ecarts.map(e => e.id === editingId ? newEcart : e);
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Écart modifié',
        message: `L'écart ${newEcart.reference} a été modifié`,
        canal: 'in_app',
      });
    } else {
      const updated = [...ecarts, newEcart];
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Écart créé',
        message: `L'écart ${newEcart.reference} a été créé`,
        canal: 'in_app',
      });
    }

    setSelectedItems([]);
    setFormEcart({ niveau: 'moyen' });
    setEditingId(null);
    setErrors({});
    setIaSuggestion(null);
    setShowIaSuggestion(true);
  };

  const handleModifierEcart = (ecart: EcartRedaction) => {
    setEditingId(ecart.id);
    setFormEcart({
      reference: ecart.reference,
      ref_reglementaire: ecart.ref_reglementaire,
      libelle: ecart.libelle,
      niveau: ecart.niveau,
    });
    setSelectedItems(ecart.item_ids);
    setIaSuggestion(null);
  };

  const handleSupprimerEcart = (id: string) => {
    const ecart = ecarts.find(e => e.id === id);
    if (window.confirm(`Supprimer l'écart ${ecart?.reference} ?`)) {
      const updated = ecarts.filter(e => e.id !== id);
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Écart supprimé',
        message: `L'écart ${ecart?.reference} a été supprimé`,
        canal: 'in_app',
      });
    }
  };

  const handleSigner = () => {
    if (itemsRestantsCount > 0) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Items non traités',
        message: `${itemsRestantsCount} item(s) NS/NV non encore traités`,
        canal: 'in_app',
      });
      return;
    }
    setSignatureDialogOpen(true);
  };

  const onSignatureSave = (signatureUrl: string) => {
    updateSurveillance(surveillanceId, {
      statut: 'ecarts_signes',
      signatures_ecarts: [
        {
          signataire_id: user?.id || '',
          signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
          date_signature: new Date().toISOString(),
          signature_url: signatureUrl,
        },
      ],
    });
    onSigner?.(signatureUrl);
    setSignatureDialogOpen(false);
    onSave?.(ecarts);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Écarts signés',
      message: 'Tous les écarts ont été signés',
      canal: 'in_app',
    });
  };

  // Auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      if (ecarts.length > 0 && !readOnly && !isSigned) {
        setLastSaved(new Date());
        onSave?.(ecarts);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [ecarts, readOnly, isSigned, onSave]);

  const stats = {
    total: itemsNSNV.length,
    traites: processedItemIds.length,
    restants: itemsRestantsCount,
    ecartsCount: ecarts.length,
  };

  const progression = stats.total > 0 ? Math.round((stats.traites / stats.total) * 100) : 100;

  // Détecter si tous les items sélectionnés appartiennent au domaine SGS
  // → l'indice OACI n'est pas applicable au SGS (système de gestion de la sécurité)
  const isSGSDomain = useMemo(() => {
    if (selectedItems.length === 0) return false;
    return selectedItems.every(id => {
      const item = itemsNSNV.find(i => i.id === id);
      return item?.domaine === 'SGS';
    });
  }, [selectedItems, itemsNSNV]);

  // Détecter si TOUS les items de la liste sont SGS (mode SGS global)
  // → affichage PAOE (Absent/Présent/Approprié) au lieu de NS/NV
  const isAllSGSDomain = useMemo(
    () => itemsNSNV.length > 0 && itemsNSNV.every(i => i.domaine === 'SGS'),
    [itemsNSNV]
  );

  if (isSigned) {
    return (
      <div className="card border-success bg-success/10" data-role={userRole}>
        <div className="card-content p-6 text-center">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <h3 className="text-lg font-medium text-success-800 mb-2">Document des écarts signé</h3>
          <p className="text-small text-success-600">Tous les écarts ont été rédigés et le document est signé.</p>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={() => onSave?.(ecarts)} className="btn btn-secondary gap-2">
              <Download className="w-4 h-4" />
              Exporter les écarts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-role={userRole} data-module="ecarts-redaction">
      
      {/* En-tête avec infos surveillance */}
      <div className="card border-l-4 border-l-danger bg-gradient-to-r from-danger/10 to-danger/5">
        <div className="card-content p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-danger" />
                <div>
                  <p className="text-xs text-muted-foreground">Aérodrome</p>
                  <p className="font-bold text-sm">{aerodrome?.nom} ({aerodrome?.code_oaci})</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-danger" />
                <div>
                  <p className="text-xs text-muted-foreground">Période</p>
                  <p className="text-sm">
                    {surveillance ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} → {surveillance ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-danger" />
                <div>
                  <p className="text-xs text-muted-foreground">Équipe</p>
                  <p className="text-sm">{surveillance?.equipe_ids?.length || 0} inspecteur(s)</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="progress w-32 h-2">
                <div className={`progress-bar ${getProgressBarColorDynamic(progression)}`} style={{ width: `${progression}%` }} />
              </div>
              <span className="text-sm font-medium">{progression}%</span>
              {lastSaved && (
                <span className="text-xs text-muted-foreground">
                  Sauvegardé à {lastSaved.toLocaleTimeString()}
                </span>
              )}
              <IaAssistant onQuestion={handleAskAssistant} isAsking={isAskingAssistant} />
            </div>
          </div>
        </div>
      </div>

      {/* Réponse assistant IA */}
      {iaAnswer && (
        <div className="alert alert-info animate-fade-in">
          <Brain className="alert-icon w-4 h-4" />
          <div className="alert-content flex-1">
            <div className="alert-title">🤖 Réponse de l'assistant</div>
            <div className="alert-description">{iaAnswer}</div>
          </div>
          <button onClick={() => setIaAnswer(null)} className="btn btn-sm px-3 py-1 btn-ghost">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Liste des écarts existants (s'ils viennent du store) */}
      {ecartsExistants && ecartsExistants.length > 0 && (
        <div className="card border-border">
          <div className="card-header bg-gradient-to-r from-success/5 to-transparent">
            <div className="card-title text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Écarts déjà rédigés ({ecartsExistants.length})
            </div>
          </div>
          <div className="card-content p-3 max-h-[300px] overflow-y-auto">
            <div className="space-y-2">
              {ecartsExistants.map(ecart => (
                <EcartCard
                  key={ecart.id}
                  ecart={ecart}
                  onEdit={handleModifierEcart}
                  onDelete={handleSupprimerEcart}
                  onViewDetails={setSelectedEcartDetails}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grille items — NS/NV (standard) ou PAOE (SGS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Colonne gauche: Items à traiter */}
        <div className="card border-border">
          <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
            <div className="card-title text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-role-primary" />
              {isAllSGSDomain
                ? <>Éléments PAOE non conformes <span className="badge warning text-[10px]">SGS</span></>
                : 'Items NS/NV à traiter'
              }
              <span className="badge outline text-xs">{itemsRestantsCount} restant(s)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isAllSGSDomain
                ? 'Éléments évalués Absent, Présent ou Approprié — sélectionnez pour créer un écart SGS'
                : 'Sélectionnez une ou plusieurs questions pour créer un écart'
              }
            </p>
          </div>
          <div className="card-content p-4 max-h-[500px] overflow-y-auto">
            {Object.keys(itemsByDomaine).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-success" />
                <p className="text-sm">Tous les items ont été traités</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(itemsByDomaine).map(([domaine, items]) => {
                  const isExpanded = expandedDomaines.includes(domaine);
                  return (
                    <div key={domaine} className="border border-border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between p-2 bg-muted/20 hover:bg-role-primary-soft transition-colors"
                        onClick={() => toggleDomaineExpand(domaine)}
                      >
                        <div className="flex items-center gap-2">
                          <FolderTree className="w-3 h-3 text-role-primary" />
                          <span className="font-medium text-sm">{domaine}</span>
                          <span className="badge outline text-[10px]">{items.length} item(s)</span>
                        </div>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="p-2 space-y-2">
                          {items.map(item => (
                            <div
                              key={item.id}
                              className={`flex items-start gap-2 p-2 border border-border rounded-lg cursor-pointer transition-colors ${
                                selectedItems.includes(item.id) 
                                  ? 'border-role-primary bg-role-primary/5' 
                                  : 'hover:bg-role-primary-soft'
                              }`}
                              onClick={() => {
                                if (selectedItems.includes(item.id)) {
                                  setSelectedItems(prev => prev.filter(id => id !== item.id));
                                } else {
                                  setSelectedItems(prev => [...prev, item.id]);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedItems.includes(item.id)}
                                onChange={() => {}}
                                className="form-checkbox mt-1"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="code-oaci-badge text-xs">{item.numero}</span>
                                  <span className="badge neutral text-[10px]">{item.sousDomaine}</span>
                                  {item.domaine === 'SGS' ? (
                                    <span className={`badge text-[10px] ${
                                      item.paoeLevel === 'absent'    ? 'danger'  :
                                      item.paoeLevel === 'present'   ? 'muted'   :
                                                                       'warning'
                                    }`}>
                                      {item.paoeLevel === 'absent' ? '—' :
                                       item.paoeLevel === 'present' ? 'P' : 'A'}
                                    </span>
                                  ) : (
                                    <span className={`badge ${item.resultat === 'NS' ? 'danger' : 'warning'} text-[10px]`}>
                                      {item.resultat}
                                    </span>
                                  )}
                                </div>
                                <p className="text-small mt-1">{item.description}</p>
                                {item.reference_reglementaire && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Réf: {item.reference_reglementaire}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite: Formulaire de saisie avec IA */}
        <div className="card border-border">
          <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
            <div className="card-title text-base flex items-center gap-2">
              <PenLine className="w-4 h-4 text-role-primary" />
              {editingId ? 'Modifier' : 'Nouvel'} écart
              {selectedItems.length > 0 && (
                <span className="badge primary text-[10px]">{selectedItems.length} item(s) sélectionné(s)</span>
              )}
            </div>
          </div>
          <div className="card-content p-4 space-y-4">
            
            {/* Suggestion IA */}
            {showIaSuggestion && selectedItems.length > 0 && (
              <IaSuggestionBanner
                suggestion={iaSuggestion}
                onApply={handleApplyIaSuggestion}
                onAdjustAndApply={handleApplyIaSuggestion}
                onIgnore={handleIgnoreIaSuggestion}
                isLoading={isIaGenerating}
                hideCellule={isSGSDomain}
              />
            )}

            {errors.selectItems && (
              <div className="alert alert-danger p-2 text-sm">
                <AlertCircle className="alert-icon w-4 h-4" />
                {errors.selectItems}
              </div>
            )}

            <div className="form-field">
              <label className="filter-label">Référence (auto-générée)</label>
              <input
                type="text"
                value={formEcart.reference || (editingId ? '' : `ECA-${new Date().getFullYear()}-${String(ecarts.length + 1).padStart(3, '0')}`)}
                onChange={(e) => setFormEcart({ ...formEcart, reference: e.target.value })}
                placeholder="ECA-2025-001"
                className={`form-input bg-gray-50 ${focusClass}`}
                disabled={!editingId}
              />
              <p className="field-description">La référence est générée automatiquement</p>
            </div>

            <div className="form-field">
              <label className="filter-label">
                Référence réglementaire <span className="text-danger">*</span>
              </label>
              <textarea
                value={formEcart.ref_reglementaire || ''}
                onChange={(e) => setFormEcart({ ...formEcart, ref_reglementaire: e.target.value })}
                placeholder="RAS 14 - Section X.X"
                className={`form-textarea min-h-[60px] ${errors.ref_reglementaire ? 'border-danger' : ''} ${focusClass}`}
              />
              {errors.ref_reglementaire && (
                <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.ref_reglementaire}
                </p>
              )}
            </div>

            {/* Niveau de risque — masqué pour le domaine SGS (pas d'évaluation OACI) */}
            {!isAllSGSDomain && (
              <div className="form-field">
                <label className="filter-label">
                  Niveau de risque <span className="text-danger">*</span>
                </label>
                <select
                  className={`form-select ${focusClass}`}
                  style={selectStyle}
                  value={formEcart.niveau || 'moyen'}
                  onChange={e => setFormEcart({ ...formEcart, niveau: e.target.value as any })}
                >
                  {NIVEAUX.map(n => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  {NIVEAUX.map(n => (
                    <div key={n.value} className={`p-1.5 rounded ${formEcart.niveau === n.value ? `bg-${n.variant}/10 border border-${n.variant}` : ''}`}>
                      <span className={`badge ${getNiveauRisqueBadge(n.value)} mr-1`}>{n.label}</span>
                      <span>PAC: {n.delais.pac}j • Régul: {n.delais.regularisation}j</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-field">
              <label className="filter-label">
                Libellé constatation <span className="text-danger">*</span>
              </label>
              <textarea
                value={formEcart.libelle || ''}
                onChange={(e) => setFormEcart({ ...formEcart, libelle: e.target.value })}
                placeholder="Description détaillée de l'écart..."
                className={`form-textarea min-h-[120px] ${errors.libelle ? 'border-danger' : ''} ${focusClass}`}
              />
              {errors.libelle && (
                <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.libelle}
                </p>
              )}
            </div>

            <div className="bg-role-primary-soft p-3 rounded-lg">
              <p className="text-sm text-foreground">
                Items sélectionnés: <span className="font-bold">{selectedItems.length}</span>
              </p>
              {selectedItems.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedItems.map(itemId => {
                    const item = itemsNSNV.find(i => i.id === itemId);
                    return item ? (
                      <span key={itemId} className="badge outline text-[10px]">{item.numero}</span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAjouterEcart}
                disabled={selectedItems.length === 0 || !formEcart.libelle}
                className={`btn btn-primary flex-1 gap-2 ${(selectedItems.length === 0 || !formEcart.libelle) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingId ? 'Modifier' : 'Ajouter'} l'écart
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormEcart({ niveau: 'moyen' });
                    setSelectedItems([]);
                    setErrors({});
                    setIaSuggestion(null);
                  }}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Liste des écarts rédigés */}
      <div className="card border-border">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-title text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-role-primary" />
              Écarts rédigés ({ecarts.length})
            </div>
            {stats.restants === 0 && ecarts.length > 0 && !readOnly && (
              <button onClick={handleSigner} className="btn btn-success btn-sm gap-2">
                <Send className="w-4 h-4" />
                Signer les écarts
              </button>
            )}
          </div>
        </div>
        <div className="card-content p-4 max-h-[400px] overflow-y-auto">
          {ecarts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-body">Aucun écart rédigé pour le moment</p>
              <p className="text-small text-muted-foreground mt-1">
                {isAllSGSDomain
                  ? 'Sélectionnez des éléments PAOE (Absent/Présent) dans la liste ci-dessus'
                  : 'Sélectionnez des questions NS/NV dans la liste ci-dessus'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ecarts.map(ecart => (
                <EcartCard
                  key={ecart.id}
                  ecart={ecart}
                  onEdit={handleModifierEcart}
                  onDelete={handleSupprimerEcart}
                  onViewDetails={setSelectedEcartDetails}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Récapitulatif des délais suggérés */}
      {formEcart.niveau && (
        <div className="card border-border bg-role-primary-soft">
          <div className="card-content p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              ⏰ Délais recommandés
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">PAC à soumettre:</span>
                <span className="ml-2 font-bold text-role-primary">
                  {NIVEAUX.find(n => n.value === formEcart.niveau)?.delais.pac} jours
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Régularisation complète:</span>
                <span className="ml-2 font-bold text-role-primary">
                  {NIVEAUX.find(n => n.value === formEcart.niveau)?.delais.regularisation} jours
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note info */}
      <div className="alert alert-info">
        <AlertCircle className="alert-icon h-4 w-4" />
        <span>
          Les écarts sont sauvegardés automatiquement. La signature est disponible uniquement 
          lorsque tous les items NS/NV sont traités.
        </span>
      </div>

      {/* Modal détails écart */}
      {selectedEcartDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEcartDetails(null)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Détail de l'écart</h2>
              <button className="modal-close" onClick={() => setSelectedEcartDetails(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Référence</p>
                  <p className="code-oaci-badge text-sm">{selectedEcartDetails.reference}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Niveau</p>
                  <span className={`badge ${NIVEAU_VARIANTS[selectedEcartDetails.niveau]}`}>
                    {selectedEcartDetails.niveau}
                  </span>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Référence réglementaire</p>
                  <p className="text-sm">{selectedEcartDetails.ref_reglementaire}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Libellé</p>
                  <p className="text-sm">{selectedEcartDetails.libelle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Créé le</p>
                  <p className="text-sm">{new Date(selectedEcartDetails.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Modifié le</p>
                  <p className="text-sm">{new Date(selectedEcartDetails.updated_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Questions associées</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedEcartDetails.item_ids.map((itemId, idx) => {
                      const item = itemsNSNV.find(i => i.id === itemId);
                      return (
                        <span key={idx} className="badge outline text-xs">
                          {item?.numero || itemId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedEcartDetails(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal signature */}
      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl border-t-4 border-t-role-primary" data-role={userRole} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Signature du document des écarts</h2>
              <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body">
              <SignaturePadWithColor
                onSave={onSignatureSave}
                onCancel={() => setSignatureDialogOpen(false)}
                signataireNom={`${user?.prenom || ''} ${user?.nom || ''}`}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}