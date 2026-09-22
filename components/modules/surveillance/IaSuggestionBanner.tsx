// components/modules/surveillance/IaSuggestionBanner.tsx
// Extrait de SurveillanceEcartsRedaction (comportement identique).
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Loader2, Sparkles, StickyNote, Eye, FolderTree, Scissors, Zap, Minus, Plus,
  RefreshCw, X,
} from 'lucide-react';
import { getCellColor, getRiskLevelClass, getRiskLevelFromCell } from '@/lib/risque';
import type { QuestionNSNV } from './EcartsRedactionTypes';
import { RiskCellSelect } from './RiskCellSelect';

// ─────────────────────────────────────────────────────────────
// COMPOSANT: IaSuggestionBanner
// ─────────────────────────────────────────────────────────────
export function IaSuggestionBanner({
  suggestion,
  onApply,
  onAdjustAndApply,
  onApplySplit,
  onApplyForceSingle,
  onIgnore,
  onRegenerate,
  isLoading,
  hideCellule = false,
  selectedQuestions = [],
}: {
  suggestion: { libelle: string; niveau: string; ref_reglementaire: string; justification: string; confiance: number; cellule: string; probabilite: 1 | 2 | 3 | 4 | 5; gravite: 'A' | 'B' | 'C' | 'D' | 'E'; avis?: string; nbEcarts?: number; pourquoi?: string; intervalleConfiance?: { min: number; max: number } } | null;
  onApply: () => void;
  onAdjustAndApply: (probabilite: 1 | 2 | 3 | 4 | 5, gravite: 'A' | 'B' | 'C' | 'D' | 'E', libelle?: string) => void;
  /** Applique explicitement le découpage en N écarts (1 par question). */
  onApplySplit?: (nbEcarts: number) => void;
  /** Refuse le découpage : valide un seul écart fusionné (désactive le découpage auto). */
  onApplyForceSingle?: () => void;
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
  const [splitMode, setSplitMode] = useState(false);
  const [splitNb, setSplitNb] = useState(2);
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
    setSplitMode(false);
    setSplitNb(suggestion.nbEcarts && suggestion.nbEcarts > 1 ? suggestion.nbEcarts : (selectedQuestions.length > 1 ? selectedQuestions.length : 2));
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

          {/* Découpage en N écarts : l'IA recommande de créer plusieurs écarts
              (1 par question). Appliquer / Ajuster / Refuser la recommandation. */}
          {onApplySplit && typeof suggestion.nbEcarts === 'number' && suggestion.nbEcarts > 1 && selectedQuestions.length > 1 && !adjustMode && !regenMode && (
            <div className="text-xs bg-role-primary-soft rounded-lg p-2.5 border border-role-primary/30">
              <div className="flex items-center gap-2 flex-wrap">
                <Scissors className="w-4 h-4 text-role-primary shrink-0" />
                <span className="font-semibold text-foreground">
                  L'IA recommande de créer <strong>{suggestion.nbEcarts} écarts</strong> (1 par question)
                </span>
              </div>

              {!splitMode ? (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <button
                    onClick={() => onApplySplit(suggestion.nbEcarts!)}
                    className="btn btn-sm px-3 py-1 btn-primary gap-1 whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Appliquer le découpage
                  </button>
                  <button
                    onClick={() => setSplitMode(true)}
                    className="btn btn-sm px-3 py-1 btn-secondary gap-1 whitespace-nowrap"
                  >
                    Ajuster
                  </button>
                  <button
                    onClick={() => (onApplyForceSingle ? onApplyForceSingle() : onApply())}
                    className="btn btn-sm px-3 py-1 btn-secondary gap-1 whitespace-nowrap"
                    title="Annuler le découpage et valider un seul écart fusionné"
                  >
                    Refuser le découpage
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <label className="text-xs font-medium text-foreground whitespace-nowrap">Nb d'écarts :</label>
                  <label className="relative">
                    <Minus
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground cursor-pointer"
                      onClick={() => setSplitNb(n => Math.max(1, n - 1))}
                    />
                    <input
                      type="number"
                      min={1}
                      max={selectedQuestions.length}
                      value={splitNb}
                      onChange={e => setSplitNb(Math.max(1, Math.min(selectedQuestions.length, Number(e.target.value) || 1)))}
                      className="input input-sm w-24 pl-7 text-sm"
                    />
                    <Plus
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground cursor-pointer"
                      onClick={() => setSplitNb(n => Math.min(selectedQuestions.length, n + 1))}
                    />
                  </label>
                  <button
                    onClick={() => { onApplySplit(splitNb); }}
                    className="btn btn-sm px-3 py-1 btn-primary gap-1 whitespace-nowrap"
                    disabled={splitNb < 1}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Appliquer ({splitNb})
                  </button>
                  <button onClick={() => setSplitMode(false)} className="btn btn-sm px-3 py-1 btn-secondary">
                    Annuler
                  </button>
                </div>
              )}
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
