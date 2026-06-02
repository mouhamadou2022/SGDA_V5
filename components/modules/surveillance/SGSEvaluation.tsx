'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SignaturePad from 'signature_pad';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import {
  Shield, ChevronDown, ChevronRight, CheckCircle, AlertCircle, Info, FileText,
  Save, X, TrendingUp, Brain, Upload, Eye, PenLine, Calendar, MapPin, Users,
  Plus, Trash2, Keyboard, Type, Loader2, Sparkles, ArrowLeft, Activity,
} from 'lucide-react';
import {
  SGS_COMPOSANTES,
  PAOE_LABELS,
  PAOE_SCORES,
  PAOE_ORDER,
  type PAOELevel,
  type SGSQuestion,
  type SGSComposante,
  type EvaluationSGS,
  type SGSElementNotes,
  type SGSDirectives,
  type SGSGuideEtape,
  computeSGSElementScore,
  computeSGSComposanteScore,
  computeMaturiteSGS,
  buildEvaluationSGS,
  getPAOENiveauFromScore,
} from '@/types/checklist';

type ModeSaisie = 'clavier' | 'stylet' | 'mixte';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

function getPAOEColor(level: PAOELevel): string {
  switch (level) {
    case 'efficace': return 'bg-success/20 text-success-800 border-success';
    case 'operationnel': return 'bg-primary/20 text-primary-800 border-primary';
    case 'approprie': return 'bg-warning/20 text-warning-800 border-warning';
    case 'present': return 'bg-gray-200 text-gray-700 border-gray-300';
    case 'absent': return 'bg-danger/20 text-danger-800 border-danger';
  }
}

function getNiveauLabel(niveau: PAOELevel): string {
  switch (niveau) {
    case 'efficace': return 'Efficace (E)';
    case 'operationnel': return 'Opérationnel (O)';
    case 'approprie': return 'Approprié (A)';
    case 'present': return 'Présent (P)';
    case 'absent': return 'Absent';
  }
}

const NIVEAU_LABELS: Record<string, string> = { N0: 'N0 — Non évalué', N1: 'N1 — Absent', N2: 'N2 — Présent', N3: 'N3 — Approprié', N4: 'N4 — Opérationnel', N5: 'N5 — Efficace' }

function getNiveauN0N5(score: number): string {
  if (score >= 95) return 'N5';
  if (score >= 80) return 'N4';
  if (score >= 60) return 'N3';
  if (score >= 40) return 'N2';
  if (score >= 20) return 'N1';
  return 'N0';
}

function getNiveauN0N5Label(score: number): string {
  return NIVEAU_LABELS[getNiveauN0N5(score)] || 'N0';
}

function getNiveauN0N5BadgeClass(score: number): string {
  if (score >= 95) return 'badge success';   // N5 — vert
  if (score >= 80) return 'badge primary';   // N4 — bleu
  if (score >= 60) return 'badge primary';   // N3 — bleu
  if (score >= 40) return 'badge warning';   // N2 — orange
  if (score >= 15) return 'badge danger';    // N1 — rouge
  return 'badge danger';                     // N0 — rouge (critique)
}

function getProgressColor(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-warning';
  if (score >= 15) return 'bg-orange-500';
  return 'bg-danger';
}

function getActiveClass(level: PAOELevel): string {
  switch (level) {
    case 'efficace': return 'active-sa';
    case 'operationnel': return 'active-na';
    case 'approprie': return 'active-nv';
    case 'present': return 'active-na';
    case 'absent': return 'active-ns';
  }
}

/** Retourne la classe badge CSS standard selon le niveau PAOE */
function getPAOEBadgeClass(level: PAOELevel): string {
  switch (level) {
    case 'efficace':     return 'badge success';
    case 'operationnel': return 'badge primary';
    case 'approprie':    return 'badge warning';
    case 'present':      return 'badge muted';
    case 'absent':       return 'badge danger';
  }
}

// ── Stylus Canvas (uses .checklist-stylus-canvas, .stylus-hint, .checklist-stylus-clear) ──
function StylusCanvas({ value, onChange, height = 80 }: { value: string; onChange: (data: string) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    const width = canvas.parentElement?.clientWidth || 300;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
    const sigPad = new SignaturePad(canvas, { penColor: 'rgb(0, 0, 0)', minWidth: 1, maxWidth: 2 });
    sigPadRef.current = sigPad;
    sigPad.addEventListener('beginStroke', () => setIsDrawing(true));
    sigPad.addEventListener('endStroke', () => { setIsDrawing(false); onChange(sigPad.toDataURL('image/png')); });
    if (value) sigPad.fromDataURL(value);
    return () => { sigPad.removeEventListener('beginStroke', () => {}); sigPad.removeEventListener('endStroke', () => {}); };
  }, []);

  const handleClear = () => { sigPadRef.current?.clear(); onChange(''); };

  return (
    <div className="checklist-stylus-canvas">
      <canvas ref={canvasRef} className="canvas-dynamic" style={{ height: `${height}px` } as React.CSSProperties} />
      {!isDrawing && !value && <div className="stylus-hint">✍️ Écrire ici avec le stylet ou le doigt</div>}
      {value && (
        <button type="button" onClick={handleClear} className="checklist-stylus-clear" title="Effacer">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

// ── Preuve Modal (uses .modal-overlay, .modal-content, .modal-header, .modal-body, .modal-footer, .modal-title, .modal-close) ──
interface PreuveModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionRef: string;
  preuves: { id: string; nom: string; url: string; dateUpload: string }[];
  onAddPreuve: (preuve: { id: string; nom: string; url: string; dateUpload: string }) => void;
  onRemovePreuve: (preuveId: string) => void;
}

function PreuveModal({ isOpen, onClose, questionRef, preuves, onAddPreuve, onRemovePreuve }: PreuveModalProps) {
  const [newPreuveNom, setNewPreuveNom] = useState('');
  const [newPreuveFile, setNewPreuveFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleAddPreuve = () => {
    if (!newPreuveFile) return;
    const url = URL.createObjectURL(newPreuveFile);
    const nom = newPreuveNom.trim() || newPreuveFile.name;
    onAddPreuve({ id: `proof-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, nom, url, dateUpload: new Date().toISOString() });
    setNewPreuveNom('');
    setNewPreuveFile(null);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header">
            <div className="modal-title flex items-center gap-2">
              <FileText className="w-4 h-4 text-role-primary" />
              <span>Preuves — Question <span className="font-mono font-bold text-role-primary">{questionRef}</span></span>
            </div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
          <div className="modal-body p-4">
            {/* Preuves existantes */}
            {preuves.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">{preuves.length} preuve(s) jointe(s)</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {preuves.map(p => (
                    <div key={p.id} className="card-compact flex items-center gap-2 p-2">
                      <div className="w-7 h-7 rounded bg-role-gradient flex items-center justify-center flex-shrink-0">
                        <FileText className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.nom}</p>
                      </div>
                      <button onClick={() => window.open(p.url, '_blank')} className="btn btn-sm px-1.5 py-1 btn-ghost" title="Aperçu"><Eye className="w-3 h-3" /></button>
                      <button onClick={() => onRemovePreuve(p.id)} className="btn btn-sm px-1.5 py-1 btn-ghost text-red-600" title="Supprimer"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ajouter une nouvelle preuve */}
            <div className="border border-border rounded-lg p-3 bg-gray-50">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                <Upload className="w-3.5 h-3.5 text-role-primary" />
                Ajouter une preuve
              </p>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Nom de la preuve</label>
                  <input
                    type="text"
                    value={newPreuveNom}
                    onChange={(e) => setNewPreuveNom(e.target.value)}
                    placeholder="Ex: Photo installation, Capture écran..."
                    className={`form-input w-full text-xs ${focusClass}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Fichier</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setNewPreuveFile(file);
                      if (file && !newPreuveNom) {
                        setNewPreuveNom(file.name);
                      }
                    }}
                    className={`form-input w-full text-xs ${focusClass}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPreuve}
                  disabled={!newPreuveFile}
                  className={`btn btn-sm w-full gap-1.5 ${!newPreuveFile ? 'opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                >
                  <Upload className="w-3 h-3" />
                  Ajouter la preuve
                </button>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm px-3 py-1 btn-primary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Element Table (uses .checklist-etat, .checklist-etat-btn, .checklist-header-obs-btn, .checklist-stylus-canvas) ──
interface ElementTableProps {
  elementDef: typeof SGS_COMPOSANTES[number]['elements'][number];
  composantePrefixe: string;
  questions: SGSQuestion[];
  modeSaisie: ModeSaisie;
  onModeSaisieChange: (mode: ModeSaisie) => void;
  onQuestionChange: (questionId: string, niveau: PAOELevel) => void;
  onAddQuestion: (question: SGSQuestion) => void;
  onRemoveQuestion: (questionId: string) => void;
  onAddPreuve: (questionId: string, preuve: { id: string; nom: string; url: string; dateUpload: string }) => void;
  onRemovePreuve: (questionId: string, preuveId: string) => void;
  onObservationChange: (questionId: string, observation: string, stylusData?: string) => void;
  readOnly: boolean;
  onGenerateByIA?: () => void;
  isGeneratingIA?: boolean;
  hasGeneratedIA?: boolean;
  // Notes inspecteur par colonne
  noteQuestions?: string;
  noteDirectives?: string;
  noteGuide?: string;
  onNoteChange?: (col: keyof SGSElementNotes, val: string) => void;
}

function ElementTable({ elementDef, composantePrefixe, questions, modeSaisie, onModeSaisieChange, onQuestionChange, onAddQuestion, onRemoveQuestion, onAddPreuve, onRemovePreuve, onObservationChange, readOnly, onGenerateByIA, isGeneratingIA, hasGeneratedIA, noteQuestions, noteDirectives, noteGuide, onNoteChange }: ElementTableProps) {
  const [preuveModalOpen, setPreuveModalOpen] = useState<string | null>(null);
  const [observationEdit, setObservationEdit] = useState<string | null>(null);
  const [observationTemp, setObservationTemp] = useState('');
  const [stylusTemp, setStylusTemp] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editingRefTemp, setEditingRefTemp] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editingQuestionTemp, setEditingQuestionTemp] = useState('');
  const [editingDirective, setEditingDirective] = useState<{ level: string; index: number } | null>(null);
  const [editingDirectiveTemp, setEditingDirectiveTemp] = useState('');
  const [editingGuideAction, setEditingGuideAction] = useState<{ etapeIdx: number; actionIdx: number } | null>(null);
  const [editingGuideActionTemp, setEditingGuideActionTemp] = useState('');
  const [editingSourceReg, setEditingSourceReg] = useState<string | null>(null);
  const [editingSourceRegTemp, setEditingSourceRegTemp] = useState('');
  const [localDirectives, setLocalDirectives] = useState(elementDef.directives);
  const [localGuideEtapes, setLocalGuideEtapes] = useState(elementDef.guideEtapes);
  // Ouverture des zones de notes
  const [noteQuestionsOpen, setNoteQuestionsOpen] = useState(!!noteQuestions);
  const [noteDirectivesOpen, setNoteDirectivesOpen] = useState(!!noteDirectives);
  const [noteGuideOpen, setNoteGuideOpen] = useState(!!noteGuide);

  const { score, niveauGlobal } = useMemo(() => computeSGSElementScore(questions), [questions]);

  // Sélection libre — aucune restriction d'ordre séquentiel
  const handleLevelChange = (questionId: string, newLevel: PAOELevel) => {
    onQuestionChange(questionId, newLevel);
  };

  const handleAddQuestion = () => {
    if (!newQuestionText.trim()) return;
    const nextNum = questions.length + 1;
    const ref = `${composantePrefixe}-${elementDef.id}.${nextNum}`;
    onAddQuestion({
      id: `${elementDef.id}.q${nextNum}`,
      ref,
      texte: newQuestionText.trim(),
      niveau: 'absent',
    });
    setNewQuestionText('');
    setShowAddQuestion(false);
  };

  const currentPreuveQuestion = preuveModalOpen ? questions.find(q => q.id === preuveModalOpen) : null;
  const showStylus = modeSaisie === 'stylet' || modeSaisie === 'mixte';
  const showKeyboard = modeSaisie === 'clavier' || modeSaisie === 'mixte';

  return (
    <div className="ml-4 mb-4 bg-white border border-border">
       {/* Element header */}
      <div className="flex items-center justify-between p-2 bg-blue-50 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-role-primary" />
          <span className="text-sm font-medium text-gray-900">Élément {elementDef.id} — {elementDef.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${getPAOEBadgeClass(niveauGlobal)} text-[10px] font-semibold`}>
            {getNiveauLabel(niveauGlobal)} — {score}%
          </span>
          {onGenerateByIA && !readOnly && (
            <button
              type="button"
              onClick={onGenerateByIA}
              disabled={isGeneratingIA}
              className={`btn btn-sm px-2 py-1 ${isGeneratingIA ? 'btn-ghost opacity-50' : 'btn-ghost text-purple-600'}`}
              title={hasGeneratedIA ? 'Questions IA générées — cliquer pour ajouter d\'autres' : 'Générer des questions par IA'}
            >
              {isGeneratingIA ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
            </button>
          )}
          {!readOnly && (
            <button type="button" onClick={() => setShowAddQuestion(!showAddQuestion)} className="btn btn-sm px-2 py-1 btn-ghost text-primary" title="Ajouter une question">
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Add question form */}
      {showAddQuestion && !readOnly && (
        <div className="p-3 bg-primary/5 border-b border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="Nouvelle question d'évaluation..."
              className={`form-input flex-1 text-sm ${focusClass}`}
              onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
            />
            <button type="button" onClick={handleAddQuestion} className="btn btn-sm px-3 py-1 btn-primary">Ajouter</button>
            <button type="button" onClick={() => setShowAddQuestion(false)} className="btn btn-sm px-2 py-1 btn-secondary">✕</button>
          </div>
        </div>
      )}

      <div className="card-content p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
               <tr className="bg-gray-50 border-b border-blue-200">
                <th className="text-left p-2 text-sm font-bold text-foreground w-14 min-w-[3.5rem] max-w-[3.5rem] border-r border-blue-100">Réf</th>
                <th className="text-left p-2 text-sm font-bold text-foreground w-28 min-w-[7rem] max-w-[7rem] border-r border-blue-100">Réf. réglementaire</th>
                <th className="text-left p-2 text-sm font-bold text-foreground min-w-[14rem] max-w-[20rem] border-r border-blue-100">Question</th>
                <th className="text-center p-2 text-sm font-bold text-foreground w-28 min-w-[7rem] max-w-[7rem] border-r border-blue-100">État</th>
                <th className="text-center p-2 text-sm font-bold text-foreground w-28 min-w-[7rem] max-w-[8rem] border-r border-blue-100">Preuves</th>
                <th className="text-left p-2 text-sm font-bold text-foreground min-w-[8rem] max-w-[12rem]">Observations</th>
                {!readOnly && <th className="w-8 min-w-[2rem] max-w-[2rem]"></th>}
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => {
                return (
                  <tr key={q.id} className="border-b border-blue-100">
                    {/* ── Réf ── */}
                    <td className="p-2 border-r border-blue-100 bg-white min-w-[3.5rem] max-w-[3.5rem]">
                      {editingRef === q.id ? (
                        <input
                          type="text"
                          value={editingRefTemp}
                          onChange={(e) => setEditingRefTemp(e.target.value)}
                          onBlur={() => { setEditingRef(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setEditingRef(null); } }}
                          className="form-input w-full text-[11px] p-0.5 text-foreground border-blue-400"
                          autoFocus
                        />
                      ) : (
                        <span className="text-[11px] font-mono text-foreground cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded block" onClick={() => { setEditingRef(q.id); setEditingRefTemp(q.ref); }}>{q.ref}</span>
                      )}
                    </td>

                    {/* ── Référence réglementaire ── */}
                    <td className="p-2 border-r border-blue-100 bg-white min-w-[7rem] max-w-[7rem]">
                      {editingSourceReg === q.id ? (
                        <input
                          type="text"
                          value={editingSourceRegTemp}
                          onChange={(e) => setEditingSourceRegTemp(e.target.value)}
                          onBlur={() => { setEditingSourceReg(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setEditingSourceReg(null); } }}
                          className="form-input w-full text-[11px] p-0.5 text-foreground border-blue-400"
                          placeholder="RAS 14.x.x"
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={() => { if (!readOnly) { setEditingSourceReg(q.id); setEditingSourceRegTemp(q.sourceReglementaire || ''); } }}
                          className={`block text-[11px] font-mono leading-tight px-1 py-0.5 rounded ${q.sourceReglementaire ? 'text-blue-700 bg-blue-50 cursor-pointer hover:bg-blue-100' : 'text-gray-300 cursor-pointer hover:bg-blue-50'}`}
                          title={q.sourceReglementaire || 'Cliquer pour ajouter une référence'}
                        >
                          {q.sourceReglementaire || (readOnly ? '—' : '+ Ajouter')}
                        </span>
                      )}
                    </td>

                    {/* ── Question ── */}
                    <td className="p-2 border-r border-blue-100 min-w-[14rem] max-w-[20rem]">
                      {editingQuestion === q.id ? (
                        <textarea
                          value={editingQuestionTemp}
                          onChange={(e) => setEditingQuestionTemp(e.target.value)}
                          onBlur={() => { setEditingQuestion(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { setEditingQuestion(null); } }}
                          className="form-input w-full text-sm text-foreground p-1 border-blue-400"
                          rows={2}
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <span className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded flex-1 text-sm text-foreground leading-snug" onClick={() => { setEditingQuestion(q.id); setEditingQuestionTemp(q.texte); }}>{q.texte}</span>
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            {q.generatedByIA && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${
                                q.statutIA === 'nouvelle'
                                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                                  : q.statutIA === 'modifiee'
                                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}>
                                <Sparkles className="w-2.5 h-2.5" />
                                {q.statutIA === 'nouvelle' ? 'IA' : q.statutIA === 'modifiee' ? 'IA*' : 'IA'}
                              </span>
                            )}
                            {q.prefilled && !q.generatedByIA && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                <Brain className="w-2.5 h-2.5" />
                                Suggéré
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    {/* ── États PAOE — style badges dégradés (5 colonnes) ── */}
<td className="p-1.5 border-r border-blue-100 min-w-[5rem] max-w-[6rem]">
  <div className="grid grid-cols-5 gap-1" onMouseDown={e => e.stopPropagation()}>
    {PAOE_ORDER.map(level => {
      const isSelected = q.niveau === level;
      const shortLabel = level === 'absent' ? '—' : 
                        level === 'present' ? 'P' :
                        level === 'approprie' ? 'A' :
                        level === 'operationnel' ? 'O' : 'E';
      
      // Style sélectionné avec dégradé
      const selectedStyle = (() => {
        switch (level) {
          case 'absent':
            return 'bg-gradient-to-br from-red-600 to-red-700 text-white border-red-600/50 shadow-lg shadow-red-600/25';
          case 'present':
            return 'bg-gradient-to-br from-red-400 to-rose-500 text-white border-red-400/50 shadow-lg shadow-red-400/25';
          case 'approprie':
            return 'bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-500/50 shadow-lg shadow-amber-500/25';
          case 'operationnel':
            return 'bg-gradient-to-br from-green-400 to-emerald-500 text-white border-green-400/50 shadow-lg shadow-green-400/25';
          case 'efficace':
            return 'bg-gradient-to-br from-emerald-600 to-green-700 text-white border-emerald-600/50 shadow-lg shadow-emerald-600/25';
        }
      })();
      
      // Style non sélectionné
      const unselectedStyle = (() => {
        switch (level) {
          case 'absent':
            return 'bg-white text-red-400 border border-red-200 hover:bg-red-50 hover:border-red-300';
          case 'present':
            return 'bg-white text-red-300 border border-red-100 hover:bg-red-50 hover:border-red-200';
          case 'approprie':
            return 'bg-white text-amber-400 border border-amber-200 hover:bg-amber-50 hover:border-amber-300';
          case 'operationnel':
            return 'bg-white text-green-400 border border-green-200 hover:bg-green-50 hover:border-green-300';
          case 'efficace':
            return 'bg-white text-emerald-500 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300';
        }
      })();
      
      return (
        <button
          key={level}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && handleLevelChange(q.id, level)}
          title={getNiveauLabel(level)}
          className={`
            rounded-lg text-center py-1.5 text-[11px] font-bold transition-all duration-200 select-none
            ${readOnly ? 'cursor-default opacity-60' : 'cursor-pointer hover:scale-105 active:scale-95'}
            ${isSelected ? selectedStyle : unselectedStyle}
          `}
        >
          {shortLabel}
        </button>
      );
    })}
  </div>
</td>
                    <td className="p-2 text-center border-r border-blue-100 min-w-[8rem] max-w-[10rem]">
                      <button
                        type="button"
                        onClick={() => setPreuveModalOpen(q.id)}
                        className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 w-full justify-center"
                      >
                        <FileText className="w-3 h-3" />
                        {q.preuves && q.preuves.length > 0 ? (
                          <div className="flex flex-col items-center gap-0.5 w-full">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[10px] font-bold text-primary">{q.preuves.length}</span>
                            <div className="flex flex-col items-center w-full">
                              {q.preuves.slice(0, 3).map((p, i) => (
                                <span key={p.id} className="text-[8px] text-primary truncate max-w-[100px] text-center">{p.nom}</span>
                              ))}
                              {q.preuves.length > 3 && (
                                <span className="text-[8px] text-muted-foreground">+{q.preuves.length - 3} autre(s)</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[9px] text-gray-400">Ajouter</span>
                        )}
                      </button>
                    </td>
                    <td className="p-2 min-w-[8rem] max-w-[12rem]">
                      {observationEdit === q.id ? (
                        <div className="space-y-1">
                          {showKeyboard && (
                            <textarea
                              value={observationTemp}
                              onChange={(e) => setObservationTemp(e.target.value)}
                              placeholder="Observation..."
                              rows={2}
                              className={`form-textarea w-full text-[12px] text-foreground ${focusClass}`}
                            />
                          )}
                          {showStylus && (
                            <StylusCanvas value={stylusTemp} onChange={setStylusTemp} height={60} />
                          )}
                          <div className="flex gap-1">
                            <button type="button" onClick={() => { onObservationChange(q.id, observationTemp, stylusTemp || undefined); setObservationEdit(null); }} className="btn btn-sm px-2 py-1 btn-primary text-[11px]">OK</button>
                            <button type="button" onClick={() => setObservationEdit(null)} className="btn btn-sm px-2 py-1 btn-secondary text-[11px]">✕</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setObservationEdit(q.id); setObservationTemp(q.justification || ''); setStylusTemp((q as any).observation_stylus_data || ''); }}
                          className="inline-flex items-start gap-1 text-[11px] text-muted-foreground hover:text-primary w-full text-left"
                        >
                          <PenLine className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          {q.justification || (q as any).observation_stylus_data ? (
                            <span className="truncate max-w-[90px] leading-snug">
                              {q.justification && (q as any).observation_stylus_data ? '✍️ + texte' : (q as any).observation_stylus_data ? '✍️ Stylet' : q.justification}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">Ajouter</span>
                          )}
                        </button>
                      )}
                    </td>
                    {!readOnly && (
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => onRemoveQuestion(q.id)} className="btn btn-sm px-1 py-1 btn-ghost text-red-600" title="Supprimer">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Note inspecteur — Questions ── */}
      <div className="border-t border-blue-100 bg-white">
        {noteQuestionsOpen ? (
          <div className="px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-700 flex items-center gap-1"><PenLine className="w-3 h-3" /> Note inspecteur — Questions</span>
              <button type="button" onClick={() => setNoteQuestionsOpen(false)} className="text-muted-foreground hover:text-foreground text-[10px]">▲ Réduire</button>
            </div>
            <textarea
              value={noteQuestions || ''}
              onChange={(e) => onNoteChange?.('questions', e.target.value)}
              placeholder="Ajouter une note sur les questions de cet élément (constats, contexte, remarques terrain…)"
              rows={2}
              readOnly={readOnly}
              className={`form-textarea w-full text-[12px] text-foreground bg-blue-50/40 border-blue-200 placeholder:text-blue-300 resize-none ${focusClass}`}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteQuestionsOpen(true)}
            className="w-full px-3 py-1.5 flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-colors text-left"
          >
            <PenLine className="w-3 h-3" />
            {noteQuestions ? <span className="truncate max-w-[300px] italic">{noteQuestions}</span> : <span>Note inspecteur sur les questions…</span>}
          </button>
        )}
      </div>

      {/* Mode selector (uses .checklist-header-obs-btn) */}
      {!readOnly && (
        <div className="p-2 bg-gray-50 border-t border-border flex items-center gap-2">
          <span className="text-sm text-black font-medium">Mode saisie:</span>
          <div className="flex gap-1">
            {([
              { mode: 'clavier' as ModeSaisie, icon: Keyboard, label: 'Clavier' },
              { mode: 'stylet' as ModeSaisie, icon: PenLine, label: 'Stylet' },
              { mode: 'mixte' as ModeSaisie, icon: Type, label: 'Mixte' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => onModeSaisieChange(mode)}
                className={`checklist-header-obs-btn ${modeSaisie === mode ? 'active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Directives */}
      <div className="p-3 bg-primary/5 border-t border-border">
        <p className="text-sm font-bold text-black mb-2 flex items-center gap-1"><Info className="w-4 h-4" /> Directives d'évaluation {!readOnly && <span className="text-xs font-normal text-muted-foreground ml-2">(cliquer sur un item pour modifier)</span>}</p>
        <div className="grid grid-cols-4 gap-2">
          {(['present', 'approprie', 'operationnel', 'efficace'] as const).map((level) => (
            <div key={level} className="p-2 bg-white rounded border">
              <p className="text-sm font-bold text-black mb-1">{PAOE_LABELS[level]}</p>
              <ul className="text-sm text-black space-y-0.5">
                {(localDirectives as SGSDirectives)[level].map((d, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="mt-1">•</span>
                    {editingDirective?.level === level && editingDirective?.index === i ? (
                      <input
                        type="text"
                        value={editingDirectiveTemp}
                        onChange={(e) => setEditingDirectiveTemp(e.target.value)}
                        onBlur={() => {
                          const updated = { ...localDirectives };
                          (updated as any)[level] = [...(updated as any)[level]];
                          (updated as any)[level][i] = editingDirectiveTemp;
                          setLocalDirectives(updated);
                          setEditingDirective(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const updated = { ...localDirectives };
                            (updated as any)[level] = [...(updated as any)[level]];
                            (updated as any)[level][i] = editingDirectiveTemp;
                            setLocalDirectives(updated);
                            setEditingDirective(null);
                          }
                        }}
                        className="form-input w-full text-xs p-0.5 text-foreground border-blue-400"
                        autoFocus
                      />
                    ) : (
                      <span className="flex-1 cursor-pointer hover:bg-blue-50 px-0.5 rounded" onClick={() => { setEditingDirective({ level, index: i }); setEditingDirectiveTemp(d); }}>{d}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Note inspecteur — Directives ── */}
      <div className="px-3 pb-3 bg-primary/5">
        {noteDirectivesOpen ? (
          <div className="space-y-1.5 pt-2 border-t border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-role-primary flex items-center gap-1"><PenLine className="w-3 h-3" /> Note inspecteur — Directives</span>
              <button type="button" onClick={() => setNoteDirectivesOpen(false)} className="text-muted-foreground hover:text-foreground text-[10px]">▲ Réduire</button>
            </div>
            <textarea
              value={noteDirectives || ''}
              onChange={(e) => onNoteChange?.('directives', e.target.value)}
              placeholder="Ajouter une note sur les directives d'évaluation (écarts observés, difficultés d'application…)"
              rows={2}
              readOnly={readOnly}
              className={`form-textarea w-full text-[12px] text-foreground bg-white border-primary/30 placeholder:text-muted-foreground/50 resize-none ${focusClass}`}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteDirectivesOpen(true)}
            className="w-full pt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-role-primary transition-colors text-left border-t border-primary/20"
          >
            <PenLine className="w-3 h-3" />
            {noteDirectives ? <span className="truncate max-w-[300px] italic">{noteDirectives}</span> : <span>Note inspecteur sur les directives…</span>}
          </button>
        )}
      </div>

      {/* Guide étape par étape */}
      <div className="p-3 bg-blue-50 border-t border-blue-200">
        <p className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-1"><TrendingUp className="w-4 h-4 text-blue-700" /> Guide d'évaluation — Étape par étape {!readOnly && <span className="text-xs font-normal text-muted-foreground ml-2">(cliquer sur une action pour modifier)</span>}</p>
        <div className="space-y-2">
          {(localGuideEtapes as SGSGuideEtape[]).map((etape, etapeIdx) => (
            <div key={etape.etape} className="flex gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[13px] font-bold flex-shrink-0">{etape.etape}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900">{etape.titre}</p>
                <ul className="text-[12px] text-blue-700 space-y-0.5 mt-0.5">
                  {etape.actions.map((a, actionIdx) => (
                    <li key={actionIdx} className="flex items-start gap-1">
                      <span className="mt-0.5 text-blue-400">→</span>
                      {editingGuideAction?.etapeIdx === etapeIdx && editingGuideAction?.actionIdx === actionIdx ? (
                        <input
                          type="text"
                          value={editingGuideActionTemp}
                          onChange={(e) => setEditingGuideActionTemp(e.target.value)}
                          onBlur={() => {
                            const updated = [...localGuideEtapes] as SGSGuideEtape[];
                            updated[etapeIdx] = { ...updated[etapeIdx], actions: [...updated[etapeIdx].actions] };
                            updated[etapeIdx].actions[actionIdx] = editingGuideActionTemp;
                            setLocalGuideEtapes(updated);
                            setEditingGuideAction(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const updated = [...localGuideEtapes] as SGSGuideEtape[];
                              updated[etapeIdx] = { ...updated[etapeIdx], actions: [...updated[etapeIdx].actions] };
                              updated[etapeIdx].actions[actionIdx] = editingGuideActionTemp;
                              setLocalGuideEtapes(updated);
                              setEditingGuideAction(null);
                            }
                          }}
                          className="form-input w-full text-xs p-0.5 text-foreground border-blue-400"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 cursor-pointer hover:bg-blue-100 px-0.5 rounded text-[12px] text-blue-800" onClick={() => { setEditingGuideAction({ etapeIdx, actionIdx }); setEditingGuideActionTemp(a); }}>{a}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Note inspecteur — Guide ── */}
      <div className="px-3 pb-3 bg-blue-50">
        {noteGuideOpen ? (
          <div className="space-y-1.5 pt-2 border-t border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-700 flex items-center gap-1"><PenLine className="w-3 h-3" /> Note inspecteur — Guide terrain</span>
              <button type="button" onClick={() => setNoteGuideOpen(false)} className="text-muted-foreground hover:text-blue-700 text-[10px]">▲ Réduire</button>
            </div>
            <textarea
              value={noteGuide || ''}
              onChange={(e) => onNoteChange?.('guide', e.target.value)}
              placeholder="Ajouter une note sur le déroulement terrain (difficultés, constats d'étapes, points de vigilance…)"
              rows={2}
              readOnly={readOnly}
              className={`form-textarea w-full text-[12px] text-foreground bg-white border-blue-300 placeholder:text-blue-300 resize-none ${focusClass}`}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteGuideOpen(true)}
            className="w-full pt-2 flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-700 transition-colors text-left border-t border-blue-200"
          >
            <PenLine className="w-3 h-3" />
            {noteGuide ? <span className="truncate max-w-[300px] italic">{noteGuide}</span> : <span>Note inspecteur sur le guide terrain…</span>}
          </button>
        )}
      </div>

      {/* Preuve Modal */}
      {currentPreuveQuestion && (
        <PreuveModal
          isOpen={preuveModalOpen !== null}
          onClose={() => setPreuveModalOpen(null)}
          questionRef={currentPreuveQuestion.ref}
          preuves={currentPreuveQuestion.preuves || []}
          onAddPreuve={(preuve) => onAddPreuve(currentPreuveQuestion.id, preuve)}
          onRemovePreuve={(preuveId) => onRemovePreuve(currentPreuveQuestion.id, preuveId)}
        />
      )}
    </div>
  );
}

// ── Main Modal ──
interface SGSEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  aerodromeId: string;
  surveillanceId: string;
  aerodromeNom?: string;
  surveillanceType?: string;
  surveillanceDate?: string;
  equipeCount?: number;
  inspecteurId: string;
  inspecteurNom: string;
  onSave: (evaluation: EvaluationSGS) => void;
  existingEvaluation?: EvaluationSGS | null;
  previousEvaluation?: EvaluationSGS | null;
  readOnly?: boolean;
  riskTrend?: 'stable' | 'improving' | 'degrading';
  onGenerateByIA?: (composanteId: number, elementId: string) => Promise<{
    questions: { ref: string; texte: string; sourceReglementaire: string }[]
    directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
    guideEtapes: { etape: number; titre: string; actions: string[] }[]
  } | null>;
}

export function SGSEvaluationModal({
  isOpen, onClose, aerodromeId, surveillanceId, aerodromeNom, surveillanceType, surveillanceDate, equipeCount,
  inspecteurId, inspecteurNom, onSave, existingEvaluation, previousEvaluation, readOnly = false, riskTrend = 'stable',
  onGenerateByIA,
}: SGSEvaluationModalProps) {
  const [questionsByElement, setQuestionsByElement] = useState<{ [elementId: string]: SGSQuestion[] }>({});
  const [modeSaisieByElement, setModeSaisieByElement] = useState<{ [elementId: string]: ModeSaisie }>({});
  const [expandedComposantes, setExpandedComposantes] = useState<Set<number>>(new Set([1]));
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set(['1.1']));
  const [observations, setObservations] = useState('');
  const [elementNotes, setElementNotes] = useState<Record<string, SGSElementNotes>>({});
  const [iaGenerating, setIaGenerating] = useState<string | null>(null);
  const [iaGeneratedElements, setIaGeneratedElements] = useState<Set<string>>(new Set());

  const handleElementNoteChange = useCallback((elementId: string, col: keyof SGSElementNotes, val: string) => {
    setElementNotes(prev => ({ ...prev, [elementId]: { ...prev[elementId], [col]: val } }));
  }, []);

  const handleGenerateByIA = useCallback(async (composanteId: number, elementId: string) => {
    if (!onGenerateByIA || iaGenerating) return;
    const key = `${composanteId}-${elementId}`;
    setIaGenerating(key);
    try {
      const result = await onGenerateByIA(composanteId, elementId);
      if (result) {
        setQuestionsByElement(prev => {
          const existing = prev[elementId] || [];
          const existingRefs = new Set(existing.map(q => q.ref));
          const newQuestions: SGSQuestion[] = result.questions
            .filter(q => !existingRefs.has(q.ref))
            .map(q => ({
              id: `${elementId}.${q.ref}`,
              ref: q.ref,
              texte: q.texte,
              niveau: 'absent' as PAOELevel,
              sourceReglementaire: q.sourceReglementaire,
              generatedByIA: true,
              statutIA: 'nouvelle' as const,
            }));
          return { ...prev, [elementId]: [...existing, ...newQuestions] };
        });
        setIaGeneratedElements(prev => new Set(prev).add(elementId));
      }
    } catch (err) {
      console.error('[SGSEvaluation] Erreur génération IA:', err);
    } finally {
      setIaGenerating(null);
    }
  }, [onGenerateByIA, iaGenerating]);

  React.useEffect(() => {
    if (existingEvaluation) {
      const byElem: { [elementId: string]: SGSQuestion[] } = {};
      existingEvaluation.composantes.forEach(comp => {
        comp.elements.forEach(elem => {
          byElem[elem.elementId] = elem.questions;
        });
      });
      setQuestionsByElement(byElem);
      setObservations(existingEvaluation.observations || '');
      setElementNotes(existingEvaluation.elementNotes || {});
    } else if (previousEvaluation) {
      const byElem: { [elementId: string]: SGSQuestion[] } = {};
      const modes: { [elementId: string]: ModeSaisie } = {};
      previousEvaluation.composantes.forEach(comp => {
        comp.elements.forEach(elem => {
          const adjustedQuestions = elem.questions.map(q => {
            let adjustedLevel = q.niveau;
            let raison = 'Évaluation précédente';
            if (riskTrend === 'degrading' && q.niveau !== 'absent') {
              const idx = PAOE_ORDER.indexOf(q.niveau);
              if (idx > 0) {
                adjustedLevel = PAOE_ORDER[idx - 1];
                raison = 'Risque en dégradation — suggestion ajustée';
              }
            } else if (riskTrend === 'improving' && q.niveau !== 'efficace') {
              const idx = PAOE_ORDER.indexOf(q.niveau);
              if (idx < PAOE_ORDER.length - 1) {
                adjustedLevel = PAOE_ORDER[idx + 1];
                raison = 'Risque en amélioration — suggestion ajustée';
              }
            }
            return {
              ...q,
              niveau: adjustedLevel,
              prefilled: true,
              suggestion: { previousLevel: q.niveau, adjustedLevel: adjustedLevel !== q.niveau ? adjustedLevel : undefined, raison },
            };
          });
          byElem[elem.elementId] = adjustedQuestions;
          modes[elem.elementId] = 'clavier';
        });
      });
      setQuestionsByElement(byElem);
      setModeSaisieByElement(modes);
      setObservations('');
    } else {
      const initial: { [elementId: string]: SGSQuestion[] } = {};
      const modes: { [elementId: string]: ModeSaisie } = {};
      SGS_COMPOSANTES.forEach(comp => {
        comp.elements.forEach(elem => {
          initial[elem.id] = elem.questions.map(q => ({ ...q }));
          modes[elem.id] = 'clavier';
        });
      });
      setQuestionsByElement(initial);
      setModeSaisieByElement(modes);
      setObservations('');
    }
  }, [existingEvaluation, previousEvaluation, isOpen, riskTrend]);

  const handleQuestionChange = useCallback((elementId: string, questionId: string, niveau: PAOELevel) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, niveau } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleAddQuestion = useCallback((elementId: string, question: SGSQuestion) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      return { ...prev, [elementId]: [...questions, question] };
    });
  }, []);

  const handleRemoveQuestion = useCallback((elementId: string, questionId: string) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      return { ...prev, [elementId]: questions.filter(q => q.id !== questionId) };
    });
  }, []);

  const handleAddPreuve = useCallback((elementId: string, questionId: string, preuve: { id: string; nom: string; url: string; dateUpload: string }) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, preuves: [...(q.preuves || []), preuve] } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleRemovePreuve = useCallback((elementId: string, questionId: string, preuveId: string) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, preuves: (q.preuves || []).filter(p => p.id !== preuveId) } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleObservationChange = useCallback((elementId: string, questionId: string, observation: string, stylusData?: string) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, justification: observation, ...(stylusData ? { observation_stylus_data: stylusData } : {}) } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleModeSaisieChange = useCallback((elementId: string, mode: ModeSaisie) => {
    setModeSaisieByElement(prev => ({ ...prev, [elementId]: mode }));
  }, []);

  const toggleComposante = useCallback((id: number) => {
    setExpandedComposantes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleElement = useCallback((id: string) => {
    setExpandedElements(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const evaluation = useMemo(() => {
    return buildEvaluationSGS(aerodromeId, surveillanceId, inspecteurId, inspecteurNom, questionsByElement);
  }, [questionsByElement, aerodromeId, surveillanceId, inspecteurId, inspecteurNom]);

  const totalQuestions = Object.values(questionsByElement).flat().length;
  const evaluatedQuestions = Object.values(questionsByElement).flat().filter(q => q.niveau !== 'absent').length;

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-6xl max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent sticky top-0 z-10">
            <div className="modal-title">
              <Brain className="w-5 h-5 text-role-primary" />
              Évaluation de la maturité SGS — Modèle PAOE (RAS 19 et RAS 14)
            </div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>

          <div className="modal-body p-5">
            {/* En-tête surveillance */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Aérodrome</p><p className="font-medium">{aerodromeNom || aerodromeId}</p></div></div>
                <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Type</p><p className="font-medium">{surveillanceType || '—'}</p></div></div>
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Date</p><p className="font-medium">{surveillanceDate ? new Date(surveillanceDate).toLocaleDateString('fr-FR') : '—'}</p></div></div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Équipe</p><p className="font-medium">{equipeCount ? `${equipeCount} inspecteurs` : inspecteurNom}</p></div></div>
              </div>
            </div>

            {/* Statistiques temps réel */}
            <div className="mb-4 p-3 bg-role-primary/5 rounded-lg border border-role-primary/20">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-muted-foreground">Progression</p>
                  <p className="text-sm font-semibold">{evaluatedQuestions}/{totalQuestions} questions évaluées ({totalQuestions > 0 ? Math.round((evaluatedQuestions / totalQuestions) * 100) : 0}%)</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Score maturité global</p>
                  <p className="text-2xl font-bold text-role-primary">{evaluation.scoreGlobal}%</p>
                </div>
              </div>
              <div className="progress h-2 mb-3">
                <div className="progress-bar progress-fill bg-role-primary" style={{ '--pf': totalQuestions > 0 ? Math.round((evaluatedQuestions / totalQuestions) * 100) : 0 } as React.CSSProperties} />
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold flex items-center gap-2">
                  Niveau de maturité :
                  <span className={`badge font-semibold ${
                    (() => {
                      const n = totalQuestions > 0 ? getPAOENiveauFromScore(evaluation.scoreGlobal) : 'absent';
                      if (n === 'efficace')     return 'success';
                      if (n === 'operationnel') return 'primary';
                      if (n === 'approprie')    return 'warning';
                      if (n === 'present')      return 'muted';
                      return 'danger';
                    })()
                  }`}>
                    {getNiveauLabel(totalQuestions > 0 ? getPAOENiveauFromScore(evaluation.scoreGlobal) : 'absent')}
                  </span>
                  <span className={`${getNiveauN0N5BadgeClass(evaluation.scoreGlobal)} font-bold`}>
                    {getNiveauN0N5Label(evaluation.scoreGlobal)}
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {evaluation.composantes.map(comp => (
                  <div key={comp.id} className="text-center p-2 bg-white rounded border">
                    <p className="text-[10px] text-muted-foreground">C{comp.id}</p>
                    <p className="text-lg font-bold">{comp.score}%</p>
                    <p className={`text-[9px] font-medium ${getPAOEColor(comp.niveauGlobal).split(' ')[1]}`}>{getNiveauLabel(comp.niveauGlobal)}</p>
                    <div className="progress h-1 mt-1"><div className="progress-bar progress-fill bg-role-primary" style={{ '--pf': comp.score } as React.CSSProperties} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Composantes */}
            {SGS_COMPOSANTES.map(compDef => {
              const isExpanded = expandedComposantes.has(compDef.id);
              const elements = compDef.elements.map(elemDef => {
                const questions = questionsByElement[elemDef.id] || elemDef.questions;
                const { score, niveauGlobal } = computeSGSElementScore(questions);
                return { ...elemDef, questions, score, niveauGlobal };
              });
              const { score: compScore, niveauGlobal: compNiveau } = computeSGSComposanteScore(elements);

              return (
                <div key={compDef.id} className="mb-4 card border-border overflow-hidden">
                  <div
                    className={`card-header cursor-pointer transition-colors ${isExpanded ? 'bg-role-primary/5' : 'bg-gray-50'} hover:bg-role-primary-soft`}
                    onClick={() => toggleComposante(compDef.id)}
                  >
                    <div className="card-title text-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-role-primary" />
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[13px] font-bold bg-role-primary text-white">{compDef.id}</span>
                        <div>
                          <p className="font-semibold">{compDef.label}</p>
                          <p className="text-xs text-muted-foreground">Poids: {Math.round(compDef.poids * 100)}% — {compDef.elements.length} éléments</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`${getPAOEBadgeClass(compNiveau)} font-semibold`}>{compScore}% — {getNiveauLabel(compNiveau)}</span>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="card-content p-3 border-t border-border">
                      {compDef.elements.map(elemDef => {
                        const questions = questionsByElement[elemDef.id] || elemDef.questions;
                        const isElementExpanded = expandedElements.has(elemDef.id);
                        const { score: elemScore, niveauGlobal: elemNiveau } = computeSGSElementScore(questions);

                        return (
                          <div key={elemDef.id} className="mb-2">
                            <div
                              className="flex items-center justify-between p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                              onClick={() => toggleElement(elemDef.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="code-oaci-badge text-[10px]">{compDef.prefixe}-{elemDef.id}</span>
                                <span className="text-sm font-medium">{elemDef.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`${getPAOEBadgeClass(elemNiveau)} text-[10px] font-semibold`}>{getNiveauLabel(elemNiveau)} — {elemScore}%</span>
                                {isElementExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </div>
                            </div>
                            {isElementExpanded && (
                              <ElementTable
                                elementDef={elemDef}
                                composantePrefixe={compDef.prefixe}
                                questions={questions}
                                modeSaisie={modeSaisieByElement[elemDef.id] || 'clavier'}
                                onModeSaisieChange={(mode) => handleModeSaisieChange(elemDef.id, mode)}
                                onQuestionChange={(questionId, niveau) => handleQuestionChange(elemDef.id, questionId, niveau)}
                                onAddQuestion={(question) => handleAddQuestion(elemDef.id, question)}
                                onRemoveQuestion={(questionId) => handleRemoveQuestion(elemDef.id, questionId)}
                                onAddPreuve={(questionId, preuve) => handleAddPreuve(elemDef.id, questionId, preuve)}
                                onRemovePreuve={(questionId, preuveId) => handleRemovePreuve(elemDef.id, questionId, preuveId)}
                                onObservationChange={(questionId, obs, stylus) => handleObservationChange(elemDef.id, questionId, obs, stylus)}
                                readOnly={readOnly}
                                onGenerateByIA={onGenerateByIA ? () => handleGenerateByIA(compDef.id, elemDef.id) : undefined}
                                isGeneratingIA={iaGenerating === `${compDef.id}-${elemDef.id}`}
                                hasGeneratedIA={iaGeneratedElements.has(elemDef.id)}
                                noteQuestions={elementNotes[elemDef.id]?.questions}
                                noteDirectives={elementNotes[elemDef.id]?.directives}
                                noteGuide={elementNotes[elemDef.id]?.guide}
                                onNoteChange={(col, val) => handleElementNoteChange(elemDef.id, col, val)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {!readOnly && (
              <div className="mt-4">
                <label className="text-xs text-muted-foreground mb-1 block">Observations générales</label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Observations sur la maturité globale du SGS..."
                  rows={3}
                  className={`form-textarea w-full text-sm ${focusClass}`}
                />
              </div>
            )}
          </div>

          <div className="modal-footer sticky bottom-0 bg-background border-t border-border">
            <button className="btn btn-sm px-3 py-1 btn-secondary" onClick={onClose}>{readOnly ? 'Fermer' : 'Annuler'}</button>
            {!readOnly && (
              <button className="btn btn-sm px-3 py-1 btn-primary" onClick={() => { onSave({ ...evaluation, observations, elementNotes }); onClose(); }}>
                <Save className="w-4 h-4" /> Enregistrer l'évaluation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Full-page version (no modal/portal) ──
interface SGSEvaluationContentProps {
  aerodromeId: string;
  surveillanceId: string;
  aerodromeNom?: string;
  surveillanceType?: string;
  surveillanceDate?: string;
  equipeCount?: number;
  inspecteurId: string;
  inspecteurNom: string;
  onSave: (evaluation: EvaluationSGS) => void;
  onComplete?: () => void;
  onSigner?: (signatureUrl: string) => void;
  existingEvaluation?: EvaluationSGS | null;
  previousEvaluation?: EvaluationSGS | null;
  readOnly?: boolean;
  isSigned?: boolean;
  riskTrend?: 'stable' | 'improving' | 'degrading';
  onGenerateByIA?: (composanteId: number, elementId: string) => Promise<{
    questions: { ref: string; texte: string; sourceReglementaire: string }[]
    directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
    guideEtapes: { etape: number; titre: string; actions: string[] }[]
  } | null>;
  onBack?: () => void;
}

export function SGSEvaluationContent({
  aerodromeId, surveillanceId, aerodromeNom, surveillanceType, surveillanceDate, equipeCount,
  inspecteurId, inspecteurNom, onSave, onComplete, onSigner, existingEvaluation, previousEvaluation, readOnly = false, isSigned = false, riskTrend = 'stable',
  onGenerateByIA, onBack,
}: SGSEvaluationContentProps) {
  const [questionsByElement, setQuestionsByElement] = useState<{ [elementId: string]: SGSQuestion[] }>({});
  const [modeSaisieByElement, setModeSaisieByElement] = useState<{ [elementId: string]: ModeSaisie }>({});
  const [expandedComposantes, setExpandedComposantes] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set(SGS_COMPOSANTES.flatMap(c => c.elements.map(e => e.id))));
  const [observations, setObservations] = useState('');
  const [elementNotes, setElementNotes] = useState<Record<string, SGSElementNotes>>({});
  const [iaGenerating, setIaGenerating] = useState<string | null>(null);
  const [iaGeneratedElements, setIaGeneratedElements] = useState<Set<string>>(new Set());
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);

  const handleElementNoteChange = useCallback((elementId: string, col: keyof SGSElementNotes, val: string) => {
    setElementNotes(prev => ({ ...prev, [elementId]: { ...prev[elementId], [col]: val } }));
  }, []);

  const handleGenerateByIA = useCallback(async (composanteId: number, elementId: string) => {
    if (!onGenerateByIA || iaGenerating) return;
    const key = `${composanteId}-${elementId}`;
    setIaGenerating(key);
    try {
      const result = await onGenerateByIA(composanteId, elementId);
      if (result) {
        setQuestionsByElement(prev => {
          const existing = prev[elementId] || [];
          const existingRefs = new Set(existing.map(q => q.ref));
          const newQuestions: SGSQuestion[] = result.questions
            .filter(q => !existingRefs.has(q.ref))
            .map(q => ({
              id: `${elementId}.${q.ref}`,
              ref: q.ref,
              texte: q.texte,
              niveau: 'absent' as PAOELevel,
              sourceReglementaire: q.sourceReglementaire,
              generatedByIA: true,
              statutIA: 'nouvelle' as const,
            }));
          return { ...prev, [elementId]: [...existing, ...newQuestions] };
        });
        setIaGeneratedElements(prev => new Set(prev).add(elementId));
      }
    } catch (err) {
      console.error('[SGSEvaluationContent] Erreur génération IA:', err);
    } finally {
      setIaGenerating(null);
    }
  }, [onGenerateByIA, iaGenerating]);

  React.useEffect(() => {
    if (existingEvaluation) {
      const byElem: { [elementId: string]: SGSQuestion[] } = {};
      existingEvaluation.composantes.forEach(comp => {
        comp.elements.forEach(elem => {
          byElem[elem.elementId] = elem.questions;
        });
      });
      setQuestionsByElement(byElem);
      setObservations(existingEvaluation.observations || '');
      setElementNotes(existingEvaluation.elementNotes || {});
    } else if (previousEvaluation) {
      const byElem: { [elementId: string]: SGSQuestion[] } = {};
      const modes: { [elementId: string]: ModeSaisie } = {};
      previousEvaluation.composantes.forEach(comp => {
        comp.elements.forEach(elem => {
          const adjustedQuestions = elem.questions.map(q => {
            let adjustedLevel = q.niveau;
            let raison = 'Évaluation précédente';
            if (riskTrend === 'degrading' && q.niveau !== 'absent') {
              const idx = PAOE_ORDER.indexOf(q.niveau);
              if (idx > 0) {
                adjustedLevel = PAOE_ORDER[idx - 1];
                raison = 'Risque en dégradation — suggestion ajustée';
              }
            } else if (riskTrend === 'improving' && q.niveau !== 'efficace') {
              const idx = PAOE_ORDER.indexOf(q.niveau);
              if (idx < PAOE_ORDER.length - 1) {
                adjustedLevel = PAOE_ORDER[idx + 1];
                raison = 'Risque en amélioration — suggestion ajustée';
              }
            }
            return {
              ...q,
              niveau: adjustedLevel,
              prefilled: true,
              suggestion: { previousLevel: q.niveau, adjustedLevel: adjustedLevel !== q.niveau ? adjustedLevel : undefined, raison },
            };
          });
          byElem[elem.elementId] = adjustedQuestions;
          modes[elem.elementId] = 'clavier';
        });
      });
      setQuestionsByElement(byElem);
      setModeSaisieByElement(modes);
      setObservations('');
    } else {
      const initial: { [elementId: string]: SGSQuestion[] } = {};
      const modes: { [elementId: string]: ModeSaisie } = {};
      SGS_COMPOSANTES.forEach(comp => {
        comp.elements.forEach(elem => {
          initial[elem.id] = elem.questions.map(q => ({ ...q }));
          modes[elem.id] = 'clavier';
        });
      });
      setQuestionsByElement(initial);
      setModeSaisieByElement(modes);
      setObservations('');
    }
  }, [existingEvaluation, previousEvaluation, riskTrend]);

  const handleQuestionChange = useCallback((elementId: string, questionId: string, niveau: PAOELevel) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, niveau } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleAddQuestion = useCallback((elementId: string, question: SGSQuestion) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      return { ...prev, [elementId]: [...questions, question] };
    });
  }, []);

  const handleRemoveQuestion = useCallback((elementId: string, questionId: string) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      return { ...prev, [elementId]: questions.filter(q => q.id !== questionId) };
    });
  }, []);

  const handleAddPreuve = useCallback((elementId: string, questionId: string, preuve: { id: string; nom: string; url: string; dateUpload: string }) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, preuves: [...(q.preuves || []), preuve] } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleRemovePreuve = useCallback((elementId: string, questionId: string, preuveId: string) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, preuves: (q.preuves || []).filter(p => p.id !== preuveId) } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleObservationChange = useCallback((elementId: string, questionId: string, observation: string, stylusData?: string) => {
    setQuestionsByElement(prev => {
      const questions = prev[elementId] || [];
      const updated = questions.map(q => q.id === questionId ? { ...q, justification: observation, ...(stylusData ? { observation_stylus_data: stylusData } : {}) } : q);
      return { ...prev, [elementId]: updated };
    });
  }, []);

  const handleModeSaisieChange = useCallback((elementId: string, mode: ModeSaisie) => {
    setModeSaisieByElement(prev => ({ ...prev, [elementId]: mode }));
  }, []);

  const toggleComposante = useCallback((id: number) => {
    setExpandedComposantes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleElement = useCallback((id: string) => {
    setExpandedElements(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const evaluation = useMemo(() => {
    return buildEvaluationSGS(aerodromeId, surveillanceId, inspecteurId, inspecteurNom, questionsByElement);
  }, [questionsByElement, aerodromeId, surveillanceId, inspecteurId, inspecteurNom]);

  const totalQuestions = Object.values(questionsByElement).flat().length;
  const evaluatedQuestions = Object.values(questionsByElement).flat().filter(q => q.niveau !== 'absent').length;

  const paoeStats = useMemo(() => {
    const allQ = Object.values(questionsByElement).flat();
    return {
      absent: allQ.filter(q => q.niveau === 'absent').length,
      present: allQ.filter(q => q.niveau === 'present').length,
      approprie: allQ.filter(q => q.niveau === 'approprie').length,
      operationnel: allQ.filter(q => q.niveau === 'operationnel').length,
      efficace: allQ.filter(q => q.niveau === 'efficace').length,
    };
  }, [questionsByElement]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBack && (
                <button onClick={onBack} className="btn btn-ghost p-2">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">Évaluation SGS — Modèle PAOE</h1>
                  <p className="text-xs text-muted-foreground">RAS 19 et RAS 14 — {aerodromeNom || aerodromeId}</p>
                </div>
              </div>
            </div>
            {!readOnly && (
              <button className="btn btn-primary gap-2" onClick={() => onSave({ ...evaluation, observations, elementNotes })}>
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        {/* En-tête surveillance */}
        <div className="mb-4 p-3 bg-white rounded-lg border border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Aérodrome</p><p className="font-medium">{aerodromeNom || aerodromeId}</p></div></div>
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Type</p><p className="font-medium">{surveillanceType || '—'}</p></div></div>
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Date</p><p className="font-medium">{surveillanceDate ? new Date(surveillanceDate).toLocaleDateString('fr-FR') : '—'}</p></div></div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-role-primary" /><div><p className="text-[10px] text-muted-foreground">Équipe</p><p className="font-medium">{equipeCount ? `${equipeCount} inspecteurs` : inspecteurNom}</p></div></div>
          </div>
        </div>

        {/* Statistiques temps réel PAOE */}
        <div className="mb-4 bg-white rounded-lg border border-border overflow-hidden">
          <div className="p-3 border-b border-border bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-role-primary" />
                Statistiques PAOE
              </span>
              <span className="text-xs text-muted-foreground">{evaluatedQuestions}/{totalQuestions} évaluées</span>
            </div>
            <div className="progress h-2 mt-2">
              <div className={`progress-bar progress-fill ${getProgressColor(evaluation.scoreGlobal)}`} style={{ '--pf': totalQuestions > 0 ? Math.round((evaluatedQuestions / totalQuestions) * 100) : 0 } as React.CSSProperties} />
            </div>
          </div>
          <div className="grid grid-cols-5 divide-x divide-blue-200">
            {[
              { label: 'Absent', key: 'absent' as const, short: '—', color: 'text-danger', bg: 'bg-danger/10' },
              { label: 'Présent', key: 'present' as const, short: 'P', color: 'text-gray-700', bg: 'bg-gray-100' },
              { label: 'Approprié', key: 'approprie' as const, short: 'A', color: 'text-warning', bg: 'bg-warning/10' },
              { label: 'Opérationnel', key: 'operationnel' as const, short: 'O', color: 'text-primary', bg: 'bg-primary/10' },
              { label: 'Efficace', key: 'efficace' as const, short: 'E', color: 'text-success', bg: 'bg-success/10' },
            ].map(s => (
              <div key={s.key} className="text-center p-3">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${s.bg} ${s.color}`}>
                  {s.short}
                </span>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{paoeStats[s.key]}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-semibold">Niveau de maturité</span>
            <div className="flex items-center gap-2">
              {/* Badge niveau PAOE (Absent / Présent / Approprié / Opérationnel / Efficace) */}
              <span className={`badge badge-icon font-semibold ${
                (() => {
                  const n = totalQuestions > 0 ? getPAOENiveauFromScore(evaluation.scoreGlobal) : 'absent';
                  if (n === 'efficace')    return 'success';
                  if (n === 'operationnel') return 'primary';
                  if (n === 'approprie')   return 'warning';
                  if (n === 'present')     return 'muted';
                  return 'danger';
                })()
              }`}>
                {getNiveauLabel(totalQuestions > 0 ? getPAOENiveauFromScore(evaluation.scoreGlobal) : 'absent')}
              </span>
              {/* Badge N0–N5 */}
              <span className={`${getNiveauN0N5BadgeClass(evaluation.scoreGlobal)} font-bold`}>
                {getNiveauN0N5Label(evaluation.scoreGlobal)}
              </span>
              <span className="text-xl font-bold text-role-primary">{evaluation.scoreGlobal}%</span>
            </div>
          </div>
        </div>

        {/* Composantes */}
        {SGS_COMPOSANTES.map(compDef => {
          const isExpanded = expandedComposantes.has(compDef.id);
          const elements = compDef.elements.map(elemDef => {
            const questions = questionsByElement[elemDef.id] || elemDef.questions;
            const { score, niveauGlobal } = computeSGSElementScore(questions);
            return { ...elemDef, questions, score, niveauGlobal };
          });
          const { score: compScore, niveauGlobal: compNiveau } = computeSGSComposanteScore(elements);

          return (
            <div key={compDef.id} className="mb-3 border border-border rounded-lg overflow-hidden">
              {/* Composante header — fond bleu sombre, police blanche */}
              <div
                className="cursor-pointer bg-blue-900 text-white px-4 py-3 flex items-center justify-between"
                onClick={() => toggleComposante(compDef.id)}
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-white" />
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[13px] font-bold bg-blue-700 text-white">{compDef.id}</span>
                  <div>
                    <p className="font-bold text-base text-white">{compDef.label}</p>
                    <p className="text-[11px] text-white/80">Poids: {Math.round(compDef.poids * 100)}% — {compDef.elements.length} éléments</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${getPAOEBadgeClass(compNiveau)} text-sm font-bold`}>{compScore}% — {getNiveauLabel(compNiveau)}</span>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-white">
                  {compDef.elements.map(elemDef => {
                    const questions = questionsByElement[elemDef.id] || elemDef.questions;
                    const isElementExpanded = expandedElements.has(elemDef.id);
                    const { score: elemScore, niveauGlobal: elemNiveau } = computeSGSElementScore(questions);

                    return (
                      <div key={elemDef.id} className="border-t border-blue-100">
                        {/* Élément header — fond bleu léger, police blanche */}
                        <div
                          className="flex items-center justify-between px-4 py-2 bg-blue-500 text-white cursor-pointer hover:bg-blue-600"
                          onClick={() => toggleElement(elemDef.id)}
                        >
           <div className="flex items-center gap-2">
             <span className="text-[11px] font-mono font-semibold text-white bg-white/20 px-1.5 py-0.5 rounded">{compDef.prefixe}-{elemDef.id}</span>
             <span className="text-[13px] font-semibold text-white">{elemDef.label}</span>
           </div>
                          <div className="flex items-center gap-2">
                            <span className={`${getPAOEBadgeClass(elemNiveau)} text-[10px] font-semibold`}>{getNiveauLabel(elemNiveau)} — {elemScore}%</span>
                            {isElementExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </div>
                        </div>
                        {isElementExpanded && (
                          <ElementTable
                            elementDef={elemDef}
                            composantePrefixe={compDef.prefixe}
                            questions={questions}
                            modeSaisie={modeSaisieByElement[elemDef.id] || 'clavier'}
                            onModeSaisieChange={(mode) => handleModeSaisieChange(elemDef.id, mode)}
                            onQuestionChange={(questionId, niveau) => handleQuestionChange(elemDef.id, questionId, niveau)}
                            onAddQuestion={(question) => handleAddQuestion(elemDef.id, question)}
                            onRemoveQuestion={(questionId) => handleRemoveQuestion(elemDef.id, questionId)}
                            onAddPreuve={(questionId, preuve) => handleAddPreuve(elemDef.id, questionId, preuve)}
                            onRemovePreuve={(questionId, preuveId) => handleRemovePreuve(elemDef.id, questionId, preuveId)}
                            onObservationChange={(questionId, obs, stylus) => handleObservationChange(elemDef.id, questionId, obs, stylus)}
                            readOnly={readOnly}
                            onGenerateByIA={onGenerateByIA ? () => handleGenerateByIA(compDef.id, elemDef.id) : undefined}
                            isGeneratingIA={iaGenerating === `${compDef.id}-${elemDef.id}`}
                            hasGeneratedIA={iaGeneratedElements.has(elemDef.id)}
                            noteQuestions={elementNotes[elemDef.id]?.questions}
                            noteDirectives={elementNotes[elemDef.id]?.directives}
                            noteGuide={elementNotes[elemDef.id]?.guide}
                            onNoteChange={(col, val) => handleElementNoteChange(elemDef.id, col, val)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!readOnly && (
          <div className="mt-4">
            <label className="text-xs text-muted-foreground mb-1 block">Observations générales</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observations sur la maturité globale du SGS..."
              rows={3}
              className={`form-textarea w-full text-sm ${focusClass}`}
            />
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-6 flex justify-end gap-3 pb-6">
          {onBack && (
            <button className="btn btn-secondary" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Retour
            </button>
          )}
          {!readOnly && !isSigned && (
            <>
              <button className="btn btn-secondary" onClick={() => onSave({ ...evaluation, observations, elementNotes })}>
                <Save className="w-4 h-4 mr-1" /> Enregistrer
              </button>
              {onSigner && (
                <button className="btn btn-primary" onClick={() => setSignatureDialogOpen(true)}>
                  <PenLine className="w-4 h-4 mr-1" /> Terminer et signer
                </button>
              )}
            </>
          )}
          {isSigned && (
            <span className="badge success text-sm">
              <CheckCircle className="w-4 h-4 mr-1" /> Évaluation signée
            </span>
          )}
        </div>
      </div>

      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">Signature de l'évaluation SGS</div>
                <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body">
                <SignaturePadWithColor
                  onSave={(signatureUrl) => {
                    onSave({ ...evaluation, observations, elementNotes });
                    onSigner?.(signatureUrl);
                    setSignatureDialogOpen(false);
                    onComplete?.();
                  }}
                  onCancel={() => setSignatureDialogOpen(false)}
                  signataireNom={inspecteurNom}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SGSEvaluationModal;
