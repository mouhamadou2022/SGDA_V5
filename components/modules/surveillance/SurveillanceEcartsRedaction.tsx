// components/modules/surveillance/SurveillanceEcartsRedaction.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  RefreshCw,
  StickyNote,
} from 'lucide-react';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import DetectionCombinaisonsProactive, { ProactiveItem } from './DetectionCombinaisonsProactive';
import { Card } from '@/components/ui/card';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { ecartAgent } from '@/lib/ia/agents/ecartAgent';
import { mergeArrayById } from '@/lib/persistence/iaStorage';
import { libelleMemory } from '@/lib/ia/libelleMemory';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { recordRiskIndexFeedback, getRiskLevelFromCellIdx } from '@/lib/riskIndex';
import { getRiskLevelFromCell, getCellColor, getRiskLevelClass, getRiskLevelVariant } from '@/lib/risque';
import { classifyEcartTexte, suggestGraviteFromTexte } from '@/lib/risque/ecartClassifier';
import { generateEcartReference, computeNextEcartCounter, getTypeAbbr } from '@/lib/surveillanceUtils';
import { inspecteurMonitoring } from '@/lib/ia/engines/inspecteurMonitoring';

// Classes CSS réutilisées depuis globals.css
const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

// Liste déroulante fiable : la valeur choisie s'affiche toujours dans le champ.
interface RiskCellSelectProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  widthClass?: string;
}
function RiskCellSelect<T extends string | number>({ value, options, onChange, widthClass }: RiskCellSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? String(value);

  return (
    <div ref={ref} className={`relative ${widthClass || 'w-14'}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between gap-1.5 h-8 w-full px-2 rounded-lg border-2 border-[hsl(var(--border))] bg-white text-sm font-semibold text-foreground hover:border-[var(--role-primary)] transition-all"
      >
        <span>{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {options.map(o => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full text-left px-2.5 py-1.5 text-sm hover:bg-[hsl(var(--muted))] transition-colors ${o.value === value ? 'font-bold text-[var(--role-primary)] bg-[hsl(var(--muted))]' : 'text-foreground'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Types
export interface EcartRedaction {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible' | 'tres_faible';
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
  /** Délai de soumission du PAC (en jours) — prérempli par l'IA, ajustable */
  delai_pac?: number;
  /** Délai de régularisation complète (en jours) — prérempli par l'IA, ajustable */
  delai_regularisation?: number;
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
  /** Notes/constatations de l'inspecteur liées à la question (checklist / éval SGS) */
  observation?: string;
  /** Justification / constat détaillé de l'écart (remonté depuis l'évaluation SGS) */
  justification?: string;
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
  /** Type de la surveillance pour l'abréviation dans la référence */
  surveillanceType?: string;
  /** Code OACI de l'aérodrome */
  aerodromeCode?: string;
  /** Préfixe de l'écart : SDT (standard) ou SGS */
  ecartPrefix?: 'SDT' | 'SGS';
}

const NIVEAUX = [
  { value: 'critique', label: 'Critique', variant: 'danger', delais: { pac: 3, regularisation: 7 } },
  { value: 'eleve', label: 'Élevé', variant: 'warning', delais: { pac: 7, regularisation: 30 } },
  { value: 'moyen', label: 'Moyen', variant: 'primary', delais: { pac: 15, regularisation: 90 } },
  { value: 'faible', label: 'Faible', variant: 'success', delais: { pac: 30, regularisation: 180 } },
];

function isValidOACI(cellule: string | undefined | null): cellule is string {
  return typeof cellule === 'string' && /^[1-5][A-E]$/.test(cellule);
}

/**
 * Découpe un libellé combiné (puces numérotées « 1. », « 2. », « 3. ») en libellés
 * séparés. Si le libellé contient plusieurs puces, renvoie une puce par élément.
 * Sinon renvoie le libellé entier en un seul élément.
 */
function decouperLibelleEnEcarts(libelle: string): string[] {
  const parts = libelle
    .split(/(?=^\s*\d+[.)]\s*)/m)
    .map(p => p.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [libelle.trim()];
}

function getProgressBarColorDynamic(taux: number): string {
  if (taux >= 80) return 'bg-success';
  if (taux >= 60) return 'bg-primary';
  if (taux >= 40) return 'bg-warning';
  return 'bg-danger';
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT: NotesInspecteurPopover — popover au clic (portal)
// ─────────────────────────────────────────────────────────────
function NotesInspecteurPopover({ texte }: { texte: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openPopover = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ top: r.top, left: r.left });
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); openPopover(); }}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-role-primary hover:bg-role-primary-soft hover:text-role-primary rounded px-1 py-0.5 -ml-1 transition-colors"
        title="Voir les notes de l'inspecteur"
      >
        <StickyNote className="w-3.5 h-3.5" />
        Notes inspecteur
      </button>
      {open && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1999]" onClick={() => setOpen(false)}>
          <div
            className="role-tooltip"
            style={{ top: pos.top - 8, left: Math.min(pos.left, window.innerWidth - 360) }}
            onClick={(e) => e.stopPropagation()}
          >
            {texte}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-role-primary text-white text-xs flex items-center justify-center shadow"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
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

  const getNiveauBadge = () => {
    switch (ecart.niveau) {
      case 'critique': return 'badge danger';
      case 'eleve': return 'badge eleve';
      case 'moyen': return 'badge moyen';
      default: return 'badge neutral';
    }
  };

  const ecartIcon = ecart.domaine === 'SGS'
    ? <Target className="w-4 h-4 !text-white" />
    : <FileText className="w-4 h-4 !text-white" />;

  const ecartBadges = (
    <>
      {isValidOACI(ecart.cellule_risque_oaci) && ecart.cellule_risque_oaci !== 'N/A' && (
        <span className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getCellColor(ecart.cellule_risque_oaci)}`}>
          {ecart.cellule_risque_oaci}
        </span>
      )}
      {ecart.domaine === 'SGS' ? (
        <span className="badge warning text-[10px]">SGS</span>
      ) : (
        <span className={getNiveauBadge()}>{ecart.niveau}</span>
      )}
      <span className="text-[10px] text-muted-foreground">{ecart.item_ids.length} item(s)</span>
    </>
  );

  const ecartActions = !readOnly ? (
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
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(ecart); }}
        className="action-button"
        title="Voir détails"
      >
        <Eye className="w-4 h-4" />
      </button>
    </>
  ) : (
    <button
      onClick={(e) => { e.stopPropagation(); onViewDetails(ecart); }}
      className="action-button"
      title="Voir détails"
    >
      <Eye className="w-4 h-4" />
    </button>
  );

  return (
    <AccordionSection
      icon={ecartIcon}
      title={<span className="text-sm font-mono">{ecart.reference}</span>}
      badges={ecartBadges}
      actions={ecartActions}
      className="mb-2"
    >
            <div>
              <p className="text-xs text-muted-foreground">Référence réglementaire</p>
              <p className="text-sm">{ecart.ref_reglementaire}</p>
            </div>
            <div className="flex items-center gap-3">
          {isValidOACI(ecart.cellule_risque_oaci) && ecart.cellule_risque_oaci !== 'N/A' && (
                <div>
                  <p className="text-xs text-muted-foreground">Cellule OACI</p>
                  <span className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wide mt-0.5 ${getCellColor(ecart.cellule_risque_oaci)}`}>
                    {ecart.cellule_risque_oaci}
                  </span>
                </div>
              )}
              {/* SGS : pas de niveau de risque — Standard : afficher le niveau + délais */}
              {ecart.domaine !== 'SGS' && (
                <div>
                  <p className="text-xs text-muted-foreground">Niveau de risque</p>
                  <span className={`${getNiveauBadge()} mt-0.5 inline-block`}>{ecart.niveau}</span>
                  {(() => {
                    const delais = NIVEAUX.find(n => n.value === ecart.niveau)?.delais;
                    if (!delais) return null;
                    return (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        PAC {delais.pac}j · Régul {delais.regularisation}j
                      </p>
                    );
                  })()}
                </div>
              )}
              {/* SGS : délais manuels */}
              {ecart.domaine === 'SGS' && (ecart.delai_pac || ecart.delai_regularisation) && (
                <div>
                  <p className="text-xs text-muted-foreground">Délais</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {ecart.delai_pac && `PAC ${ecart.delai_pac}j`}
                    {ecart.delai_pac && ecart.delai_regularisation && ' · '}
                    {ecart.delai_regularisation && `Régul ${ecart.delai_regularisation}j`}
                  </p>
                </div>
              )}
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
    </AccordionSection>
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
  onRegenerate,
  isLoading,
  hideCellule = false,
  selectedQuestions = [],
}: {
  suggestion: { libelle: string; niveau: string; ref_reglementaire: string; justification: string; confiance: number; cellule: string; probabilite: 1 | 2 | 3 | 4 | 5; gravite: 'A' | 'B' | 'C' | 'D' | 'E'; avis?: string; nbEcarts?: number; pourquoi?: string; intervalleConfiance?: { min: number; max: number } } | null;
  onApply: () => void;
  onAdjustAndApply: (probabilite: 1 | 2 | 3 | 4 | 5, gravite: 'A' | 'B' | 'C' | 'D' | 'E', libelle?: string) => void;
  onIgnore: () => void;
  onRegenerate?: (instruction?: string) => void;
  isLoading: boolean;
  /** Masquer l'indice OACI — utilisé pour le domaine SGS */
  hideCellule?: boolean;
  /** Rappel des questions sélectionnées ayant servi à la suggestion */
  selectedQuestions?: QuestionNSNV[];
}) {
  const [adjustMode, setAdjustMode] = useState(false);
  const [regenMode, setRegenMode] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [numeroMode, setNumeroMode] = useState(false);
  const [adjProb, setAdjProb] = useState<1 | 2 | 3 | 4 | 5>(suggestion?.probabilite ?? 3);
  const [adjGrav, setAdjGrav] = useState<'A' | 'B' | 'C' | 'D' | 'E'>(String(suggestion?.gravite ?? 'C') as 'A' | 'B' | 'C' | 'D' | 'E');
  const [adjLibelle, setAdjLibelle] = useState(suggestion?.libelle || '');
  const adjLibelleRef = useRef<HTMLTextAreaElement>(null);
  const regenInstructionRef = useRef<HTMLTextAreaElement>(null);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isLoading) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => autoResize(adjLibelleRef.current));
    return () => cancelAnimationFrame(raf);
  }, [adjLibelle, adjustMode]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => autoResize(regenInstructionRef.current));
    return () => cancelAnimationFrame(raf);
  }, [regenInstruction, regenMode]);

  useEffect(() => {
    if (!suggestion) return;
    setAdjProb(suggestion.probabilite);
    setAdjGrav(suggestion.gravite);
    setAdjLibelle(suggestion.libelle);
    setAdjustMode(false);
    setRegenMode(false);
  }, [suggestion]);

  const adjCellule = `${Number(adjProb)}${String(adjGrav)}`;

  if (isLoading) {
    return (
      <div className="alert alert-info mb-4 animate-pulse">
        <Loader2 className="alert-icon w-4 h-4 animate-spin" />
        <div className="alert-content flex-1">
          <div className="alert-title">🤖 AERORISQ en cours d'analyse...</div>
          <div className="alert-description">
            {elapsed > 15
              ? `Toujours en cours... (${elapsed}s) — l'analyse peut prendre un moment sur un gros périmètre`
              : `Génération d'une suggestion d'écart basée sur les items sélectionnés`}
          </div>
        </div>
      </div>
    );
  }

  if (!suggestion) return null;

  return (
    <div className="alert alert-info mb-4 animate-fade-in items-start">
      <Sparkles className="alert-icon w-4 h-4 shrink-0" />
      <div className="alert-content flex-1">
        <div className="alert-title">🤖 Suggestion AERORISQ</div>
        <div className="alert-description space-y-2">
          {/* Indice OACI — masqué pour le domaine SGS */}
          {!hideCellule && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Indice OACI:</span>
                <span
                  className={`inline-flex items-center justify-center rounded font-bold text-sm px-2.5 py-1 font-mono tracking-widest ${getCellColor(suggestion.cellule)}`}
                  title={suggestion.justification}
                >
                  {suggestion.cellule}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Probabilité <strong>{suggestion.probabilite}</strong>/5 × Gravité <strong>{suggestion.gravite}</strong>
              </div>
              <div>
                <span className={`badge ${getRiskLevelClass(suggestion.niveau)} text-xs`}>{suggestion.niveau}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Confiance: <strong>{suggestion.confiance}%</strong>
                {suggestion.intervalleConfiance && (
                  <span className="ml-1">
                    (intervalle {suggestion.intervalleConfiance.min}–{suggestion.intervalleConfiance.max}%)
                  </span>
                )}
              </div>
            </div>
          )}
          {hideCellule && (
            <div className="flex items-center gap-2">
              <span className="badge neutral text-[9px]">SGS — évaluation du risque non applicable</span>
            </div>
          )}

          {!regenMode && (
            <div>
              <span className="text-xs font-semibold text-foreground">Libellé suggéré :</span>
              <div className="mt-1 w-full bg-white p-2.5 rounded-lg border border-primary/20 text-sm whitespace-pre-wrap text-foreground">
                {suggestion.libelle}
              </div>
            </div>
          )}
          <div className="text-xs">
            <span className="font-medium">Réf.:</span>{' '}
            <span className="code-oaci-badge">{suggestion.ref_reglementaire}</span>
          </div>
          <p className="text-xs text-muted-foreground italic">{suggestion.justification}</p>
          {suggestion.pourquoi && (
            <div className="text-xs flex items-start gap-2 bg-primary/5 rounded-lg p-2 border border-primary/20">
              <span className="font-medium whitespace-nowrap flex items-center gap-1">
                <StickyNote className="w-3 h-3" />
                Pourquoi :
              </span>
              <span className="text-foreground">{suggestion.pourquoi}</span>
            </div>
          )}
          {suggestion.avis && (
            <div className="text-xs flex items-start gap-2 bg-primary/5 rounded-lg p-2 border border-primary/20">
              <span className="font-medium whitespace-nowrap flex items-center gap-1">
                <Eye className="w-3 h-3" />
                Watch-dog :
              </span>
              <span className="text-foreground">{suggestion.avis}</span>
              {typeof suggestion.nbEcarts === 'number' && suggestion.nbEcarts >= 1 && (
                <span className="badge badge-primary ml-auto shrink-0 whitespace-nowrap">{suggestion.nbEcarts} écart{suggestion.nbEcarts > 1 ? 's' : ''} recommandé{suggestion.nbEcarts > 1 ? 's' : ''}</span>
              )}
            </div>
          )}

          {/* Rappel des questions sélectionnées ayant servi à la suggestion */}
          {selectedQuestions.length > 0 && (
            <div className="text-xs bg-gray-50 rounded-lg p-2 border border-border">
              <div className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <FolderTree className="w-3 h-3" />
                {selectedQuestions.length} question(s) concernée(s) :
              </div>
              <div className="space-y-1.5">
                {selectedQuestions.map((q) => (
                  <div key={q.id} className="flex items-start gap-2">
                    <span className="code-oaci-badge shrink-0">{q.numero}</span>
                    <span
                      className={`badge text-[10px] shrink-0 ${
                        q.domaine === 'SGS'
                          ? (q.paoeLevel === 'absent' ? 'danger' : q.paoeLevel === 'present' ? 'muted' : 'warning')
                          : (q.resultat === 'NS' ? 'danger' : 'warning')
                      }`}
                    >
                      {q.domaine === 'SGS'
                        ? (q.paoeLevel === 'absent' ? '—' : q.paoeLevel === 'present' ? 'P' : 'A')
                        : q.resultat}
                    </span>
                    <span className="text-foreground whitespace-pre-wrap">{q.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {regenMode && (
            <div className="mt-2 p-3 bg-white rounded-lg border border-primary/30 space-y-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Constatation (libellé proposé) :</label>
                <div className="mt-1 w-full bg-gray-50 p-2.5 rounded-lg border border-primary/20 text-sm whitespace-pre-wrap">
                  {suggestion.libelle}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Instruction pour l'IA :</label>
                <textarea
                  ref={regenInstructionRef}
                  value={regenInstruction}
                  onChange={e => { setRegenInstruction(e.target.value); autoResize(e.target); }}
                  onInput={e => autoResize(e.target as HTMLTextAreaElement)}
                  placeholder="Ex : insister sur le défaut d'éclairage de piste..."
                  className="form-input text-xs w-full min-h-[36px] resize-none overflow-hidden mt-1"
                />
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs mt-1.5">
                  <input
                    type="checkbox"
                    checked={numeroMode}
                    onChange={e => setNumeroMode(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  Numéroter chaque constat en puces (« 1. », « 2. », « 3. »)
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const insts: string[] = [];
                    if (regenInstruction.trim()) insts.push(regenInstruction.trim());
                    if (numeroMode) insts.push('Numérote chaque constat en puces (« 1. », « 2. », « 3. »), une puce par item.');
                    onRegenerate?.(insts.length ? insts.join(' ') : undefined);
                    setRegenMode(false);
                    setRegenInstruction('');
                    setNumeroMode(false);
                  }}
                  className="btn btn-sm px-3 py-1 btn-primary gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  OK
                </button>
                <button onClick={() => setRegenMode(false)} className="btn btn-sm px-3 py-1 btn-secondary">
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Mode ajustement inspecteur — OACI : indice + constatation */}
          {adjustMode && !hideCellule && (
            <div className="mt-2 p-3 bg-white rounded-lg border border-primary/30 space-y-2">
              <p className="text-xs font-semibold text-foreground">Ajuster l'indice OACI :</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Probabilité (1-5):</label>
                  <RiskCellSelect
                    value={adjProb}
                    options={([1, 2, 3, 4, 5] as const).map(p => ({ value: p, label: String(p) }))}
                    onChange={v => setAdjProb(v as 1 | 2 | 3 | 4 | 5)}
                    widthClass="w-16"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Gravité (A-E):</label>
                  <RiskCellSelect
                    value={adjGrav}
                    options={(['A', 'B', 'C', 'D', 'E'] as const).map(g => ({ value: g, label: g }))}
                    onChange={v => setAdjGrav(v as 'A' | 'B' | 'C' | 'D' | 'E')}
                    widthClass="w-16"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center rounded font-bold text-sm px-2 py-0.5 font-mono border ${getCellColor(adjCellule)} border-black/10`}>
                    {adjCellule}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${getRiskLevelClass(getRiskLevelFromCell(adjCellule)) === 'danger' ? 'bg-red-600 text-white' : getRiskLevelClass(getRiskLevelFromCell(adjCellule)) === 'eleve' ? 'bg-orange-500 text-white' : getRiskLevelClass(getRiskLevelFromCell(adjCellule)) === 'moyen' ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>
                    {getRiskLevelFromCell(adjCellule) === 'moyen' ? 'Moyen' : getRiskLevelFromCell(adjCellule) === 'eleve' ? 'Élevé' : getRiskLevelFromCell(adjCellule) === 'critique' ? 'Critique' : 'Faible'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Ajuster la constatation :</label>
                <textarea
                  ref={adjLibelleRef}
                  rows={1}
                  value={adjLibelle}
                  onChange={e => { setAdjLibelle(e.target.value); autoResize(e.target); }}
                  onInput={e => autoResize(e.target as HTMLTextAreaElement)}
                  className="form-input text-sm w-full overflow-hidden resize-none mt-1"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onAdjustAndApply(adjProb, adjGrav, adjLibelle)}
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

          {/* Mode ajustement — SGS : uniquement la constatation */}
          {adjustMode && hideCellule && (
            <div className="mt-2 p-3 bg-white rounded-lg border border-primary/30 space-y-2">
              <p className="text-xs font-semibold text-foreground">Ajuster la constatation :</p>
              <textarea
                ref={adjLibelleRef}
                rows={1}
                value={adjLibelle}
                onChange={e => { setAdjLibelle(e.target.value); autoResize(e.target); }}
                onInput={e => autoResize(e.target as HTMLTextAreaElement)}
                className="form-input text-sm w-full overflow-hidden resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onAdjustAndApply(adjProb, adjGrav, adjLibelle)}
                  className="btn btn-sm px-3 py-1 btn-primary gap-1"
                >
                  <Zap className="w-3 h-3" />
                  Appliquer
                </button>
                <button onClick={() => setAdjustMode(false)} className="btn btn-sm px-3 py-1 btn-secondary">
                  Annuler
                </button>
              </div>
            </div>
          )}
          {!adjustMode && !regenMode && (
            <div className="flex items-center gap-2 pt-2 border-t border-primary/10 mt-1 flex-wrap">
              <button onClick={() => onApply()} className="btn btn-sm px-3 py-1 btn-primary gap-1 whitespace-nowrap">
                <Zap className="w-3 h-3" />
                Valider
              </button>
              <button
                onClick={() => { setAdjProb(suggestion.probabilite); setAdjGrav(suggestion.gravite); setAdjLibelle(suggestion.libelle); setAdjustMode(true); }}
                className="btn btn-sm px-3 py-1 btn-secondary gap-1 whitespace-nowrap"
              >
                Ajuster la constatation
              </button>
              {onRegenerate && (
                <button
                  onClick={() => setRegenMode(true)}
                  className="btn btn-sm px-3 py-1 btn-secondary gap-1 whitespace-nowrap"
                >
                  <RefreshCw className="w-3 h-3" />
                  Régénérer
                </button>
              )}
              <button onClick={onIgnore} className="btn btn-sm px-3 py-1 btn-danger gap-1 whitespace-nowrap">
                <X className="w-3 h-3" />
                Refuser
              </button>
            </div>
          )}
        </div>
      </div>
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
        title="Assistant AERORISQ"
      >
        <Brain className="w-4 h-4" />
      </button>

      {show && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-lg z-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-sm font-semibold">Assistant AERORISQ</span>
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
  surveillanceType,
  aerodromeCode,
  ecartPrefix = 'SDT',
}: SurveillanceEcartsRedactionProps) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const updateDelegation = useAppStore(s => s.updateDelegation);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const surveillances = useOptimizedStore(s => s.surveillances);
  const aerodromes = useOptimizedStore(s => s.aerodromes);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === aerodromeId);
  const oaciCode = aerodromeCode || aerodrome?.code_oaci || '';
  const typeAbbr = getTypeAbbr(surveillanceType || surveillance?.type || '');

  const officialEcarts = useAppStore(s => s.ecarts).filter(e => e.surveillance_id === surveillanceId);
  const [ecarts, setEcarts] = useState<EcartRedaction[]>(ecartsExistants || []);

  const getNouvelleReference = useCallback((prefix: 'SDT' | 'SGS' = ecartPrefix): string => {
    const year = new Date().getFullYear();
    const nextNum = computeNextEcartCounter(ecarts, officialEcarts, year, oaciCode, typeAbbr, prefix);
    return generateEcartReference(oaciCode, year, typeAbbr, prefix, nextNum);
  }, [ecarts, officialEcarts, oaciCode, typeAbbr, ecartPrefix]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [formEcart, setFormEcart] = useState<Partial<EcartRedaction>>({ niveau: 'moyen' });
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedEcartDetails, setSelectedEcartDetails] = useState<EcartRedaction | null>(null);
  const [expandedDomaines, setExpandedDomaines] = useState<string[]>([]);
  
  // États IA
  const [iaSuggestion, setIaSuggestion] = useState<{ libelle: string; niveau: string; ref_reglementaire: string; justification: string; confiance: number; cellule: string; probabilite: 1 | 2 | 3 | 4 | 5; gravite: 'A' | 'B' | 'C' | 'D' | 'E'; avis?: string; nbEcarts?: number; pourquoi?: string; intervalleConfiance?: { min: number; max: number } } | null>(null);
  const [isIaGenerating, setIsIaGenerating] = useState(false);
  const [iaAnswer, setIaAnswer] = useState<string | null>(null);
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [showIaSuggestion, setShowIaSuggestion] = useState(false);
  const [isSuggestingLibelle, setIsSuggestingLibelle] = useState(false);
  // true quand l'IA est indisponible et qu'on bascule sur la rédaction manuelle
  const [iaIndisponible, setIaIndisponible] = useState(false);

  // Garde anti-race : chaque nouvelle génération incrémente l'id. Le résultat
  // d'une génération n'est pris en compte que s'il provient de la génération
  // la plus récente — sinon on le jette (évite spinner infini / écrasement de
  // l'état par un ancien appel LLM qui se résout en retard).
  const iaGenerationRef = useRef(0);
  const suggestingLibelleRef = useRef(0);

  // Refs pour auto-resize des textareas du formulaire écart
  const refReglementaireRef = useRef<HTMLTextAreaElement>(null);
  const libelleRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  // Auto-resize des textareas quand le contenu change
  useEffect(() => { autoResize(refReglementaireRef.current); }, [formEcart.ref_reglementaire]);
  useEffect(() => { autoResize(libelleRef.current); }, [formEcart.libelle]);

  // Charger la mémoire des libellés corrigés (boucle d'apprentissage textuelle)
  useEffect(() => { libelleMemory.initFromIDB(); }, []);

  const profilAerodrome = profilsRisque?.[aerodromeId] || null;

  // Classification du libellé → suggestion domaine/niveau (moteur ecartClassifier, 100% local)
  const classificationLibelle = useMemo(() => {
    const libelle = formEcart.libelle?.trim() || '';
    if (libelle.length < 10) return null;
    try {
      const cls = classifyEcartTexte(libelle);
      const grav = suggestGraviteFromTexte(libelle);
      return { domaine: cls.domaine, confiance: Math.round(cls.score * 100), keywords: cls.keywords, gravite: grav.gravite, scoreGravite: grav.score };
    } catch { return null; }
  }, [formEcart.libelle]);

  // Sync ecarts existants when prop changes — FUSION (et non écrasement) pour ne
  // pas perdre les écarts encore présents uniquement en local (fraîchement ajoutés,
  // pas encore répercutés côté parent) tout en intégrant les vraies mises à jour
  // venant du parent (autre onglet / autre inspecteur).
  useEffect(() => {
    if (ecartsExistants && ecartsExistants.length > 0) {
      setEcarts(prev => mergeArrayById(prev, ecartsExistants));
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
        iaGenerationRef.current += 1;
        setIaSuggestion(null);
        setIaIndisponible(false);
        setIsIaGenerating(false);
        return;
      }

      const generationId = ++iaGenerationRef.current;
      // Le debounce n'annule pas une requête déjà partie : un changement de
      // sélection pendant une génération produit un second appel. Les deux
      // peuvent se résoudre dans le désordre. On ne rend visible que le
      // résultat de la génération la plus récente.
      setIsIaGenerating(true);
      // Une nouvelle sélection → on remasque le banner (l'inspecteur le
      // rouvre via le bouton clignotant sur « Items NS/NV à traiter »).
      setShowIaSuggestion(false);
      try {
        const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
        
        const result = await ecartAgent.generateEcart({
          itemsNSNV: selectedQuestions.map(item => ({
            id: item.id,
            numero: item.numero,
            point_verification: item.description,
            reference_reglementaire: item.reference_reglementaire,
            observation: item.observation || '',
            resultat: item.resultat,
            domaine: item.domaine,
            paoeLevel: item.paoeLevel,
          })),
          aerodromeId: aerodromeId,
          surveillanceId: surveillanceId,
          profil: profilAerodrome || undefined,
        }, {});

        // Résultat obsolète (une génération plus récente a démarré) → on jette.
        if (generationId !== iaGenerationRef.current) {
          setIsIaGenerating(false);
          return;
        }

        // IA indisponible → le champ « Libellé de la constatation » sert de
        // fallback : on n'affiche pas de fausse suggestion IA, on pré-remplit
        // le formulaire manuel avec l'ébauche locale pour que l'inspecteur
        // la révise puis clique « Ajouter ».
        if (result.iaDisponible === false) {
          setIaSuggestion(null);
          setShowIaSuggestion(true);
          setIaIndisponible(true);
          if (result.libelle) {
            setFormEcart(prev => ({
              ...prev,
              libelle: result.libelle,
              niveau: result.niveau_risque as EcartRedaction['niveau'],
              ref_reglementaire: result.ref_reglementaire || prev.ref_reglementaire || '',
              cellule_risque_oaci: result.cellule,
              probabilite_risque: result.probabilite,
              gravite_risque: result.gravite,
              justification_risque_ia: result.justification,
              cellule_ia_suggeree: result.cellule,
            }));
          }
          return;
        }

        // IA opérationnelle : on présente la suggestion (banner watch-dog).
        setIaIndisponible(false);
        setIaSuggestion({
          libelle: result.libelle,
          niveau: result.niveau_risque,
          ref_reglementaire: result.ref_reglementaire,
          justification: isSGSDomain
            ? `Basé sur ${selectedItems.length} élément(s) PAOE non conforme(s) et l'évaluation SGS (score ${profilAerodrome?.score_global || 'N/A'})`
            : `Basé sur ${selectedItems.length} items NS/NV et le profil de risque (score ${profilAerodrome?.score_global || 'N/A'})`,
          confiance: result.confiance,
          cellule: result.cellule,
          probabilite: result.probabilite,
          gravite: result.gravite,
          avis: result.avis || undefined,
          nbEcarts: result.nbEcartsRecommande || undefined,
          pourquoi: result.pourquoi || undefined,
          intervalleConfiance: result.intervalleConfiance || undefined,
        });
        // Affichage direct de la suggestion dès qu'elle est prête (pas besoin
        // de cliquer sur le bouton « Suggestion AERORISQ »).
        setShowIaSuggestion(true);
      } catch (error) {
        console.error('[IA] Erreur génération suggestion:', error);
        if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
      } finally {
        if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
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
    adjustedLibelle?: string,
  ) => {
    if (!iaSuggestion) return;

    // Garde : si un handler React a transmis un event (PointerEvent) à la
    // place des valeurs, on le neutralise pour ne jamais le persister.
    const safeProb = [1, 2, 3, 4, 5].includes(adjustedProbabilite as number) ? adjustedProbabilite : undefined;
    const safeGrav = ['A', 'B', 'C', 'D', 'E'].includes(String(adjustedGravite)) ? adjustedGravite : undefined;

    const finalProbabilite = (safeProb ?? iaSuggestion?.probabilite ?? 3) as 1 | 2 | 3 | 4 | 5;
    const finalGravite = safeGrav ?? iaSuggestion?.gravite ?? 'C';
    const finalCellule = `${finalProbabilite}${finalGravite}`;
    const finalNiveau = getRiskLevelFromCell(finalCellule);
    const wasAdjusted = safeProb !== undefined || safeGrav !== undefined || adjustedLibelle !== undefined;

    // ── DÉCOUPAGE WATCH-DOG : si l'IA recommande N écarts et que le libellé contient
    // plusieurs puces (1., 2., 3.), on crée un écart distinct PAR question sélectionnée.
    const libelleFinal = adjustedLibelle ?? iaSuggestion.libelle;
    const libelleParts = decouperLibelleEnEcarts(libelleFinal);
    const doitDecouper = libelleParts.length > 1 && selectedItems.length > 1 && (iaSuggestion.nbEcarts ?? 1) > 1;

    if (doitDecouper) {
      const now = new Date().toISOString();
      const itemsSel = selectedItems
        .map(id => ({ id, item: itemsNSNV.find(i => i.id === id) }))
        .filter(x => x.item);
      const domaineItems = itemsSel.map(x => x.item!.domaine).filter(Boolean);
      const domaineDeduit = domaineItems[0] || '';
      const libelles = libelleParts.length >= itemsSel.length
        ? itemsSel.map((_, k) => libelleParts[k % libelleParts.length])
        : (() => {
            const out: string[] = [];
            itemsSel.forEach((_, k) => {
              if (k < libelleParts.length) out.push(libelleParts[k]);
              else out[out.length - 1] = `${out[out.length - 1]} - ${libelleParts[k]}`;
            });
            return out;
          })();

      const created = itemsSel.map((x, k) => {
        const newEcart: EcartRedaction = {
          id: crypto.randomUUID(),
          reference: getNouvelleReference(),
          ref_reglementaire: iaSuggestion.ref_reglementaire || '',
          libelle: libelles[k] || x.item!.description || '',
          niveau: finalNiveau as EcartRedaction['niveau'],
          item_ids: [x.id],
          domaine: x.item!.domaine || domaineDeduit,
          created_at: now,
          updated_at: now,
          cellule_risque_oaci: (x.item!.domaine === 'SGS') ? undefined : finalCellule,
          probabilite_risque: (x.item!.domaine === 'SGS') ? undefined : finalProbabilite,
          gravite_risque: (x.item!.domaine === 'SGS') ? undefined : finalGravite,
          justification_risque_ia: iaSuggestion.justification,
          cellule_ia_suggeree: iaSuggestion.cellule,
          delai_pac: NIVEAUX.find(n => n.value === finalNiveau)?.delais.pac,
          delai_regularisation: NIVEAUX.find(n => n.value === finalNiveau)?.delais.regularisation,
        };
        return newEcart;
      });

      const updated = [...ecarts, ...created];
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: `${created.length} écarts créés`,
        message: `Découpage watch-dog : 1 écart par question (${iaSuggestion.nbEcarts} recommandés)`,
        canal: 'in_app',
      });
      setSelectedItems([]);
      setFormEcart({ niveau: 'moyen' });
      setEditingId(null);
      setErrors({});
      setIaSuggestion(null);
      setShowIaSuggestion(true);
      return;
    }

    setFormEcart(prev => ({
      ...prev,
      libelle: adjustedLibelle ?? iaSuggestion.libelle,
      niveau: finalNiveau as EcartRedaction['niveau'],
      ref_reglementaire: iaSuggestion.ref_reglementaire,
      cellule_risque_oaci: finalCellule,
      probabilite_risque: finalProbabilite,
      gravite_risque: finalGravite,
      justification_risque_ia: iaSuggestion.justification,
      cellule_ia_suggeree: iaSuggestion.cellule,
      delai_pac: NIVEAUX.find(n => n.value === finalNiveau)?.delais.pac,
      delai_regularisation: NIVEAUX.find(n => n.value === finalNiveau)?.delais.regularisation,
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
          niveau: getRiskLevelFromCellIdx(iaSuggestion.cellule),
          score: 0,
          confidence: iaSuggestion.confiance,
          volatilite: 0,
          tendance: 'stable',
        },
        {
          probabilite: finalProbabilite,
          gravite: finalGravite,
          cellule: finalCellule,
          niveau: getRiskLevelFromCellIdx(finalCellule),
          score: 0,
          confidence: iaSuggestion.confiance,
          volatilite: 0,
          tendance: 'stable',
        },
      );
    }

    setShowIaSuggestion(false);
    inspecteurMonitoring.enregistrer({
      capacite: 'ecart',
      action: wasAdjusted ? 'corrigee' : 'acceptee',
      aerodromeId,
      surveillanceId,
      confiance: iaSuggestion.confiance,
    })

    // Boucle d'apprentissage textuelle : mémoriser le libellé final (réajusté ou accepté)
    // comme exemple de référence pour les prochaines suggestions.
    const libelleRetenue = adjustedLibelle ?? iaSuggestion.libelle;
    if (libelleRetenue) {
      const itemsContexte = selectedItems
        .map(id => itemsNSNV.find(i => i.id === id))
        .filter(Boolean) as QuestionNSNV[];
      ecartAgent.enregistrerCorrectionLibelle({
        isSGS: isAllSGSDomain || itemsContexte.some(i => i.domaine === 'SGS'),
        references: iaSuggestion.ref_reglementaire
          ? iaSuggestion.ref_reglementaire.split(/[;,]|\bet\b/i).map(s => s.trim()).filter(Boolean)
          : itemsContexte.map(i => i.reference_reglementaire).filter(Boolean),
        itemIds: itemsContexte.map(i => i.id),
        libellePropose: iaSuggestion.libelle,
        libelleCorrige: libelleRetenue,
        avis: iaSuggestion.avis || undefined,
        nbEcartsRecommande: typeof iaSuggestion.nbEcarts === 'number' ? iaSuggestion.nbEcarts : undefined,
        contexte: itemsContexte
          .map(i => `${i.description}${i.observation ? ` → ${i.observation}` : ''}`)
          .join(' | ')
          .slice(0, 400),
      });
    }
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestion AERORISQ appliquée',
      message: wasAdjusted
        ? `Suggestion appliquée avec ajustement : ${iaSuggestion.cellule} → ${finalCellule}`
        : `Champs pré-remplis — Indice OACI : ${finalCellule}`,
      canal: 'in_app',
    });
  };

  const handleIgnoreIaSuggestion = () => {
    inspecteurMonitoring.enregistrer({
      capacite: 'ecart',
      action: 'rejetee',
      aerodromeId,
      surveillanceId,
      confiance: iaSuggestion?.confiance,
    })
    if (iaSuggestion?.libelle) {
      const isSGS = isAllSGSDomain || selectedItems.some(id => itemsNSNV.find(i => i.id === id)?.domaine === 'SGS');
      ecartAgent.enregistrerRefusGroupement({
        isSGS,
        references: iaSuggestion.ref_reglementaire
          ? iaSuggestion.ref_reglementaire.split(/[;,]|\bet\b/i).map(s => s.trim()).filter(Boolean)
          : [],
        itemIds: selectedItems.slice(),
        libelleCorrige: iaSuggestion.libelle,
        contexte: selectedItems
          .map(id => itemsNSNV.find(i => i.id === id))
          .filter((q): q is QuestionNSNV => Boolean(q))
          .map(i => `${i.description}${i.observation ? ` → ${i.observation}` : ''}`)
          .join(' | ')
          .slice(0, 400),
      });
    }
    setIaSuggestion(null);
    setShowIaSuggestion(false);
  };

  const handleRegenerateIaSuggestion = async (instruction?: string) => {
    if (selectedItems.length === 0) return;
    const generationId = ++iaGenerationRef.current;
    setIsIaGenerating(true);
    try {
      const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
      const result = await ecartAgent.generateEcart({
        itemsNSNV: selectedQuestions.map(item => ({
          id: item.id,
          numero: item.numero,
          point_verification: item.description,
          reference_reglementaire: item.reference_reglementaire,
          observation: item.observation || '',
          resultat: item.resultat,
          domaine: item.domaine,
          paoeLevel: item.paoeLevel,
        })),
        aerodromeId,
        surveillanceId,
        profil: profilAerodrome || undefined,
        instruction,
      }, {});
      if (generationId !== iaGenerationRef.current) {
        setIsIaGenerating(false);
        return;
      }
      setIaSuggestion({
        libelle: result.libelle,
        niveau: result.niveau_risque,
        ref_reglementaire: result.ref_reglementaire,
        justification: `Régénéré${instruction ? ` avec instruction: "${instruction}"` : ''}`,
        confiance: result.confiance,
        cellule: result.cellule,
        probabilite: result.probabilite,
        gravite: result.gravite,
        avis: result.avis || undefined,
        nbEcarts: result.nbEcartsRecommande || undefined,
        pourquoi: result.pourquoi || undefined,
        intervalleConfiance: result.intervalleConfiance || undefined,
      });
      // Affichage direct après régénération.
      setShowIaSuggestion(true);
    } catch (error) {
      console.error('[IA] Erreur régénération suggestion:', error);
      if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
    } finally {
      if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
    }
  };

  const revealIaSuggestion = () => {
    setShowIaSuggestion(true);
    setTimeout(() => {
      document.getElementById('suggestion-ia-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  // Valider une combinaison proactive (via le composant partagé) : on fusionne
  // les ids du groupe dans la sélection. L'effet existant sur `selectedItems`
  // déclenche alors la génération IA de la suggestion → le workflow validé
  // (valider/ajuster/refuser la suggestion) continue normalement pour la suite.
  const handleProactifValider = (items: ProactiveItem[]) => {
    setSelectedItems(prev => [...new Set([...prev, ...items.map(i => i.id)])]);
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

  const handleSuggesterLibelle = async () => {
    // Appel IA unique et factorisé : timeout navigateur (AbortSignal) pour ne
    // jamais bloquer le spinner + garde anti-race pour ignorer les réponses
    // obsolètes si l'utilisateur clique plusieurs fois.
    const redigerLibelle = async (payload: Record<string, unknown>) => {
      const requestId = ++suggestingLibelleRef.current;
      const controller = new AbortController();
      const serveurBudgetMs = 30000;
      const timeout = window.setTimeout(() => controller.abort(), serveurBudgetMs + 2000);
      try {
        const res = await fetch('/api/ia/rediger-ecart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await res.json();
        return requestId === suggestingLibelleRef.current ? data : null;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const libelleActuel = (formEcart.libelle || '').trim();
    // Reformulation IA de la constatation existante (prioritaire)
    if (libelleActuel.length > 0) {
      setIsSuggestingLibelle(true);
      try {
        const data = await redigerLibelle({
          constatation: libelleActuel,
          domaine: formEcart.domaine,
          aerodromeCode,
          aerodromeNom: aerodrome?.nom,
          isSGS: isAllSGSDomain || formEcart.domaine === 'SGS',
        });
        if (data && data.ok && data.libelle) {
          setFormEcart(prev => ({ ...prev, libelle: data.libelle }));
          addNotification({ user_id: user?.id || '', type: 'success', title: 'Constatation reformulée', message: 'La constatation a été reformulée par l\'IA.', canal: 'in_app' });
        } else if (data) {
          addNotification({ user_id: user?.id || '', type: 'warning', title: 'Reformulation IA', message: data.error || 'Impossible de reformuler la constatation', canal: 'in_app' });
        }
      } catch (error) {
        addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: "Erreur lors de la reformulation IA", canal: 'in_app' });
      } finally {
        setIsSuggestingLibelle(false);
      }
      return;
    }
    if (selectedItems.length === 0) return;
    setIsSuggestingLibelle(true);
    try {
      const items = selectedItems.map(id => itemsNSNV.find(i => i.id === id)).filter(Boolean) as typeof itemsNSNV;
      const isSGS = items.some(i => i.domaine === 'SGS');
      const data = await redigerLibelle({
        items: items.map(i => ({
          id: i.id,
          description: i.description,
          reference_reglementaire: i.reference_reglementaire,
          justification: i.justification,
          resultat: i.resultat,
          paoeLevel: i.paoeLevel,
        })),
        domaine: items[0]?.domaine,
        aerodromeCode,
        aerodromeNom: aerodrome?.nom,
        isSGS,
      });
      if (data && data.ok && data.libelle) {
        setFormEcart(prev => ({ ...prev, libelle: data.libelle }));
      } else if (data) {
        addNotification({ user_id: user?.id || '', type: 'warning', title: 'Suggestion IA', message: data.error || 'Impossible de générer une suggestion', canal: 'in_app' });
      }
    } catch (error) {
      addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: "Erreur lors de la suggestion IA", canal: 'in_app' });
    } finally {
      setIsSuggestingLibelle(false);
    }
  };

  const handleAjouterEcart = () => {
    if (selectedItems.length === 0) {
      setErrors({ selectItems: 'Veuillez sélectionner au moins une question NS/NV' });
      return;
    }

    const newErrors: Record<string, string> = {};
    if (!formEcart.libelle) newErrors.libelle = "Le libellé est requis";
    if (isAllSGSDomain) {
      if (!formEcart.delai_pac) newErrors.delai_pac = "Le délai PAC est requis pour les écarts SGS";
      if (!formEcart.delai_regularisation) newErrors.delai_regularisation = "Le délai de régularisation est requis pour les écarts SGS";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const now = new Date().toISOString();
    // Déduire le domaine depuis les items sélectionnés (premier domaine trouvé)
    const domaineItems = selectedItems
      .map(id => itemsNSNV.find(i => i.id === id)?.domaine)
      .filter(Boolean);
    const domaineDeduit = domaineItems[0] || formEcart.domaine || classificationLibelle?.domaine || '';
    const newEcart: EcartRedaction = {
      id: editingId || crypto.randomUUID(),
      reference: formEcart.reference || getNouvelleReference(),
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
      delai_pac: formEcart.delai_pac ?? NIVEAUX.find(n => n.value === formEcart.niveau)?.delais.pac,
      delai_regularisation: formEcart.delai_regularisation ?? NIVEAUX.find(n => n.value === formEcart.niveau)?.delais.regularisation,
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
      cellule_risque_oaci: ecart.cellule_risque_oaci,
      probabilite_risque: ecart.probabilite_risque,
      gravite_risque: ecart.gravite_risque,
      delai_pac: ecart.delai_pac,
      delai_regularisation: ecart.delai_regularisation,
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
    const fullSurv = useAppStore.getState().surveillances.find(s => s.id === surveillanceId)
    const existingSigs = fullSurv?.signatures_ecarts || []
    const newSig = {
      signataire_id: user?.id || '',
      signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
      date_signature: new Date().toISOString(),
      signature_url: signatureUrl,
    }
    const allSigs = [...existingSigs.filter(s => s.signataire_id !== user?.id), newSig]

    // Vérifier si TOUS les délégués ont signé
    let allDelegatedSigned = true
    const planningObj = fullSurv?.planning_id
      ? useAppStore.getState().plannings.find(p => p.id === fullSurv.planning_id)
      : undefined
    const delegations: Record<string, string> = planningObj?.delegations || {}
    if (Object.keys(delegations).length > 0) {
      const delegatedIds = new Set(Object.values(delegations).filter(Boolean))
      const signedIds = new Set(allSigs.map(s => s.signataire_id))
      allDelegatedSigned = delegatedIds.size === 0 || [...delegatedIds].every(id => signedIds.has(id))
    }

    // Si un onSigner est fourni (page parente), c'est le parent qui gère le statut global
    // (permet la validation SGS+standard avant de passer à ecarts_signes)
    if (!onSigner) {
      updateSurveillance(surveillanceId, {
        statut: allDelegatedSigned ? 'ecarts_signes' : fullSurv?.statut || 'checklist_signee',
      });
    }
    updateSurveillance(surveillanceId, { signatures_ecarts: allSigs });

    // Avancement auto du statut des délégations de l'inspecteur signataire
    const now = new Date().toISOString();
    const storeDels = useAppStore.getState();
    storeDels.getDelegationsBySurveillance(surveillanceId)
      .filter(d => d.assigne_a === user?.id)
      .forEach(d => {
        updateDelegation(d.id, {
          statut: 'ecarts_signes',
          ecarts_signature_url: signatureUrl,
          ecarts_signes_le: now,
          derniere_activite: now,
          derniere_sync: now,
        });
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

  const shouldShowSignedBanner = isSigned || readOnly;

  const getEcartGroupe = (e: EcartRedaction) => {
    if (e.domaine === 'SGS') {
      const comp = (e.item_ids || [])
        .map(id => itemsNSNV.find(i => i.id === id)?.sousDomaine)
        .find(Boolean) as string | undefined;
      return comp && comp.trim() ? comp : 'SGS';
    }
    return e.domaine || 'Autre';
  };

  return (
    <div className="space-y-6" data-role={userRole} data-module="ecarts-redaction">

      {/* Bannière lecture seule / signé */}
      {shouldShowSignedBanner && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-success/10 border border-success/30 text-success">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium text-sm">Écarts signés — consultation en lecture seule</span>
        </div>
      )}

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

      {/* Grille items — NS/NV (standard) ou PAOE (SGS) — masquée en lecture seule */}
      {!readOnly && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Colonne gauche: Items à traiter */}
        <Card
          icon={<Target className="w-4 h-4 text-role-primary" />}
          heading={
            <div className="w-full">
              <div className="flex items-center gap-2">
                {isAllSGSDomain
                  ? <>Éléments PAOE non conformes <span className="badge warning text-[10px]">SGS</span></>
                  : 'Items NS/NV à traiter'
                }
                <span className="badge outline text-xs">{itemsRestantsCount} restant(s)</span>

                {/* Bouton proactif (composant partagé) : combinaisons détectées
                    parmi les items restants de même référence réglementaire —
                    la modale s'ouvre en overlay sans toucher à la grille. */}
                <DetectionCombinaisonsProactive
                  items={itemsNSNV.filter(i => !processedItemIds.includes(i.id) && !selectedItems.includes(i.id))}
                  selectedIds={selectedItems}
                  onValidate={handleProactifValider}
                  buttonClassName="ml-auto"
                />

                {/* État IA sur les items sélectionnés : analyse en cours → bouton prêt */}
                {selectedItems.length > 0 && (
                  isIaGenerating ? (
                    <span className="ai-proposed-row inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ml-auto shrink-0 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      AERORISQ analyse...
                    </span>
                  ) : !showIaSuggestion && iaSuggestion ? (
                    <button
                      type="button"
                      onClick={revealIaSuggestion}
                      className="ai-proposed-row inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 ml-auto shrink-0"
                      title="Cliquer pour valider / ajuster / régénérer la suggestion AERORISQ"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Suggestion AERORISQ
                      {typeof iaSuggestion.nbEcarts === 'number' && iaSuggestion.nbEcarts >= 1 && (
                        <span className="badge badge-primary text-[10px]">
                          {iaSuggestion.nbEcarts} écart{iaSuggestion.nbEcarts > 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  ) : null
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {isAllSGSDomain
                  ? 'Éléments évalués Absent, Présent ou Approprié — sélectionnez pour créer un écart SGS'
                  : 'Sélectionnez une ou plusieurs questions pour créer un écart'
                }
              </div>
            </div>
          }
        >
          <div className="max-h-[500px] overflow-y-auto">
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
                          {items.map((item, idx) => (
                            <div
                              key={`${item.id}-${idx}`}
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
                                {item.observation && (
                                  <NotesInspecteurPopover texte={item.observation} />
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
        </Card>

        {/* Colonne droite: Formulaire de saisie avec IA */}
        {!readOnly && (
        <Card
          icon={<PenLine className="w-4 h-4 text-role-primary" />}
          title={`${editingId ? 'Modifier' : 'Nouvel'} écart`}
          badge={selectedItems.length > 0 ? (
            <span className="badge primary text-[10px]">{selectedItems.length} item(s) sélectionné(s)</span>
          ) : undefined}
        >
          <div className="space-y-4">
            
            {/* Suggestion IA */}
            <div id="suggestion-ia-panel">
            {showIaSuggestion && selectedItems.length > 0 && (
              <IaSuggestionBanner
                suggestion={iaSuggestion}
                onApply={handleApplyIaSuggestion}
                onAdjustAndApply={handleApplyIaSuggestion}
                onIgnore={handleIgnoreIaSuggestion}
                onRegenerate={handleRegenerateIaSuggestion}
                isLoading={isIaGenerating}
                hideCellule={isSGSDomain}
                selectedQuestions={itemsNSNV.filter(item => selectedItems.includes(item.id))}
              />
            )}
            </div>

            {/* IA indisponible → rédaction manuelle (champ Libellé) en fallback */}
            {iaIndisponible && !isIaGenerating && (
              <div className="alert alert-warning mb-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <strong className="block">AERORISQ indisponible</strong>
                  <span>La suggestion IA n'a pas pu être générée. Le champ « Libellé de la constatation » ci-dessous a été pré-rempli à titre indicatif — révisez-le puis cliquez sur « Ajouter ».</span>
                </div>
              </div>
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
                value={formEcart.reference || (editingId ? '' : getNouvelleReference())}
                onChange={(e) => setFormEcart({ ...formEcart, reference: e.target.value })}
                placeholder="2026-GOBD-CERT-SDT-01"
                className={`form-input bg-gray-50 ${focusClass}`}
                disabled={!editingId}
              />
              <p className="field-description">Année-Code OACI-Type-Prefix-Numéro</p>
            </div>

            <div className="form-field">
              <label className="filter-label">Référence réglementaire</label>
              <textarea
                ref={refReglementaireRef}
                value={formEcart.ref_reglementaire || ''}
                readOnly
                className="form-textarea bg-gray-50 cursor-not-allowed overflow-hidden"
              />
              <p className="field-description">Auto-tirée des items checklist sélectionnés</p>
            </div>

            {/* Délais manuels — SGS uniquement */}
            {isAllSGSDomain && (
              <div className="grid grid-cols-2 gap-3">
                <div className="form-field">
                  <label className="filter-label">Délai PAC (jours) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={formEcart.delai_pac ?? ''}
                    onChange={(e) => setFormEcart({ ...formEcart, delai_pac: parseInt(e.target.value) || undefined })}
                    className={`form-input ${errors.delai_pac ? 'border-danger' : ''} ${focusClass}`}
                    placeholder="ex: 15"
                  />
                  <p className="field-description">Soumission du plan d'actions correctives</p>
                  {errors.delai_pac && (
                    <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.delai_pac}
                    </p>
                  )}
                </div>
                <div className="form-field">
                  <label className="filter-label">Délai régularisation (jours) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={formEcart.delai_regularisation ?? ''}
                    onChange={(e) => setFormEcart({ ...formEcart, delai_regularisation: parseInt(e.target.value) || undefined })}
                    className={`form-input ${errors.delai_regularisation ? 'border-danger' : ''} ${focusClass}`}
                    placeholder="ex: 90"
                  />
                  <p className="field-description">Régularisation complète de l'écart</p>
                  {errors.delai_regularisation && (
                    <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.delai_regularisation}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="form-field">
              <label className="filter-label flex items-center gap-2">
                Libellé constatation <span className="text-danger">*</span>
                {((formEcart.libelle || '').trim().length > 0 || selectedItems.length > 0) && (
                  <button
                    type="button"
                    onClick={handleSuggesterLibelle}
                    disabled={isSuggestingLibelle}
                    className="btn btn-ghost btn-sm !p-1 !h-5 text-role-primary"
                    title={(formEcart.libelle || '').trim().length > 0 ? "Reformuler la constatation avec l'IA" : "Générer le libellé avec l'IA"}
                  >
                    {isSuggestingLibelle
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />
                    }
                  </button>
                )}
              </label>
              <textarea
                ref={libelleRef}
                value={formEcart.libelle || ''}
                onChange={(e) => { setFormEcart({ ...formEcart, libelle: e.target.value }); autoResize(e.target as HTMLTextAreaElement); }}
                onInput={(e) => autoResize(e.target as HTMLTextAreaElement)}
                placeholder="Description détaillée de l'écart..."
                className={`form-textarea overflow-hidden ${errors.libelle ? 'border-danger' : ''} ${focusClass}`}
              />
              {errors.libelle && (
                <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.libelle}
                </p>
              )}
              {classificationLibelle && selectedItems.length === 0 && (
                <div className="mt-2 p-2.5 rounded-lg border border-role-primary/30 bg-role-primary-soft/40">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-role-primary" />
                    Classification AERORISQ (libellé)
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-foreground">
                      Domaine suggéré : <strong className="font-mono">{classificationLibelle.domaine}</strong> (confiance {classificationLibelle.confiance}%)
                    </span>
                    <span className="text-xs text-foreground">
                      Niveau suggéré : <strong>{classificationLibelle.gravite}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormEcart(prev => ({
                          ...prev,
                          domaine: classificationLibelle.domaine,
                          niveau: classificationLibelle.gravite as EcartRedaction['niveau'],
                        }));
                      }}
                      className="btn btn-primary btn-sm gap-1 !py-1 !px-2 text-[11px]"
                    >
                      <Zap className="w-3 h-3" /> Appliquer
                    </button>
                  </div>
                  {classificationLibelle.keywords.length > 0 && (
                    <p className="text-[10px] text-foreground mt-1.5">
                      Mots-clés détectés : {classificationLibelle.keywords.map((k: string) => `«${k}»`).join(', ')}
                    </p>
                  )}
                </div>
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
        </Card>
      )}
      </div>
      )}

      {/* Liste des écarts rédigés — masqué en lecture seule (déjà dans "Écarts déjà rédigés") */}
      {!readOnly && (
      <Card
        icon={<FileText className="w-4 h-4 text-role-primary" />}
        title={`Écarts rédigés (${ecarts.length})`}
        badge={stats.restants === 0 && ecarts.length > 0 && !readOnly ? (
          <button onClick={handleSigner} className="btn btn-success btn-sm gap-2">
            <Send className="w-4 h-4" />
            Signer les écarts
          </button>
        ) : undefined}
      >
        <div className={isAllSGSDomain ? '' : 'max-h-[400px] overflow-y-auto'}>
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
            <AccordionGroup spacing="sm">
              {Object.entries(
                ecarts.reduce<Record<string, EcartRedaction[]>>((acc, e) => {
                  const d = getEcartGroupe(e);
                  (acc[d] ??= []).push(e);
                  return acc;
                }, {})
              ).map(([groupe, groupedEcarts]) => (
                <AccordionSection
                  key={groupe}
                  icon={<FolderTree className="w-4 h-4 !text-white" />}
                  title={groupe}
                  subtitle={`${groupedEcarts.length} écart(s)`}
                  defaultOpen
                >
                  <div className="space-y-2">
                    {groupedEcarts.map(ecart => (
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
                </AccordionSection>
              ))}
            </AccordionGroup>
          )}
        </div>
      </Card>
      )}

      {/* Note info — masquée en lecture seule */}
      {!readOnly && (
      <div className="alert alert-info">
        <AlertCircle className="alert-icon h-4 w-4" />
        <span>
          Les écarts sont sauvegardés automatiquement. La signature est disponible uniquement 
          lorsque tous les items NS/NV sont traités.
        </span>
      </div>
      )}

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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isValidOACI(selectedEcartDetails.cellule_risque_oaci) && (
                      <span className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wide ${getCellColor(selectedEcartDetails.cellule_risque_oaci)}`}>
                        {selectedEcartDetails.cellule_risque_oaci}
                      </span>
                    )}
                    <span className={`badge ${getRiskLevelVariant(selectedEcartDetails.niveau)}`}>
                      {selectedEcartDetails.niveau}
                    </span>
                  </div>
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