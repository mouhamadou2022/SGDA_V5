'use client';

/**
 * ChecklistStandardTable
 * ──────────────────────
 * • SA / NS / NV / NA — conformité = SA/(SA+NS+NV)×100
 * • Guide inline sub-row avec parsing ÉVALUATION OBJECTIVE
 * • Toutes les colonnes éditables inline (clic dans la cellule)
 * • Ajout/suppression de lignes, sous-domaines, groupes
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SignaturePad from 'signature_pad';
import {
  Shield, ChevronDown, ChevronRight, FileText, Upload, Trash2,
  PenLine, Eye, TrendingUp, X, Plus, FolderPlus,
} from 'lucide-react';
import type {
  DomaineChecklist, ChecklistItem, ResultatChecklist,
  SousDomaine, SousSousDomaine, ModeSaisie,
} from '@/types/checklist';

// ─── Constants ────────────────────────────────────────────────────────────────

const ETAT_BTNS: { r: ResultatChecklist; label: string; shortLabel: string; activeClass: string }[] = [
  { r: 'SA', label: 'Satisfaisant',     shortLabel: 'SA', activeClass: 'active-sa' },
  { r: 'NS', label: 'Non Satisfaisant', shortLabel: 'NS', activeClass: 'active-ns' },
  { r: 'NV', label: 'Non Validé',       shortLabel: 'NV', activeClass: 'active-nv' },
  { r: 'NA', label: 'Non Applicable',   shortLabel: 'NA', activeClass: 'active-na' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeConformite(items: ChecklistItem[]) {
  let sa = 0, ns = 0, nv = 0, na = 0;
  items.forEach(i => {
    const r = i.resultat || 'NV';
    if (r === 'SA') sa++; else if (r === 'NS') ns++; else if (r === 'NA') na++; else nv++;
  });
  const conformite = (sa + ns + nv) > 0 ? Math.round((sa / (sa + ns + nv)) * 100) : 0;
  return { sa, ns, nv, na, total: items.length, conformite };
}

function conformiteBadgeClass(taux: number): string {
  if (taux >= 80) return 'badge success';
  if (taux >= 60) return 'badge primary';
  if (taux >= 40) return 'badge warning';
  return 'badge danger';
}

function getAllItemsFlat(domaine: DomaineChecklist): ChecklistItem[] {
  return [
    ...(domaine.items || []),
    ...(domaine.sousDomaines || []).flatMap(sd => [
      ...(sd.items || []),
      ...(sd.sousSousDomaines || []).flatMap(ssd => ssd.items || []),
    ]),
  ];
}

function getAllSousDomainItems(sd: SousDomaine): ChecklistItem[] {
  return [
    ...(sd.items || []),
    ...(sd.sousSousDomaines || []).flatMap(ssd => ssd.items || []),
  ];
}

function genId(prefix = 'item') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeBlankItem(numero: string): ChecklistItem {
  return {
    id: genId('item'),
    numero,
    reference_reglementaire: '',
    point_verification: 'Nouvelle question',
    directive_preuve: '',
    directive_sa: '',
    directive_ns: '',
    directive_nv: '',
    directive_na: '',
    resultat: undefined,
    prediction: 'NV',
    confiance: 50,
    justification: '',
    alerte: false,
    prefilled: false,
  } as ChecklistItem;
}

/**
 * Parse directive_preuve pour extraire étapes (guide) et critères SA/NS/NV/NA.
 * Si directive_sa/etc. déjà renseignés → directive_preuve est déjà du texte guide propre.
 */
function parseGuideAndDirectives(item: ChecklistItem): {
  steps: string[];
  sa?: string;
  ns?: string;
  nv?: string;
  na?: string;
} {
  const cleanLine = (l: string) =>
    l.replace(/^\d+\.\s*/, '').replace(/^[-–→•]\s*/, '').trim();

  if (item.directive_sa || item.directive_ns || item.directive_nv || item.directive_na) {
    return {
      steps: (item.directive_preuve || '').split('\n').map(cleanLine).filter(Boolean),
      sa: item.directive_sa,
      ns: item.directive_ns,
      nv: item.directive_nv,
      na: item.directive_na,
    };
  }

  const raw = item.directive_preuve || '';
  const EVAL_MARKER  = '📌 ÉVALUATION OBJECTIVE';
  const SEUIL_MARKER = '⚠️ Seuil';

  const evalIdx = raw.indexOf(EVAL_MARKER);
  const guideRaw = evalIdx !== -1 ? raw.slice(0, evalIdx) : raw;

  let evalSection = '';
  if (evalIdx !== -1) {
    evalSection = raw.slice(evalIdx + EVAL_MARKER.length).replace(/^\s*:\s*/, '').trim();
    const seuilIdx = evalSection.indexOf(SEUIL_MARKER);
    if (seuilIdx !== -1) evalSection = evalSection.slice(0, seuilIdx).trim();
  }

  const extract = (key: string): string | undefined => {
    const m = evalSection.match(
      new RegExp(`-\\s*${key}\\s*:\\s*(.+?)(?=\\n\\s*-\\s*[A-Z]{2}\\s*:|$)`, 's')
    );
    return m?.[1]?.trim() || undefined;
  };

  return {
    steps: guideRaw.split('\n')
      .map(cleanLine)
      .filter(l => l.length > 0 && !l.startsWith('📌') && !l.startsWith('⚠️')),
    sa: extract('SA'),
    ns: extract('NS'),
    nv: extract('NV'),
    na: extract('NA'),
  };
}

// ─── InlineEdit — édition inline sans casser le rendu ────────────────────────

/**
 * Clic → le contenu devient un champ de saisie qui s'adapte à la cellule.
 * Blur ou Entrée → sauvegarde et retour en affichage.
 * readOnly=true → affichage seul, sans interaction.
 */
function InlineEdit({
  value, onChange, multiline = false, readOnly = false,
  placeholder = '—', className = '', inputClassName = '',
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft]   = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (active && multiline && taRef.current) {
      const el = taRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [active, draft, multiline]);

  const open = () => {
    if (readOnly) return;
    setDraft(value);
    setActive(true);
  };

  const commit = useCallback(() => {
    onChange(draft);
    setActive(false);
  }, [draft, onChange]);

  if (active) {
    const sharedCls = `w-full bg-white/95 border border-blue-400 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-500 ${inputClassName}`;
    return multiline ? (
      <textarea
        ref={taRef}
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setActive(false); } }}
        className={`${sharedCls} resize-none overflow-hidden`}
        rows={Math.max(2, (draft || '').split('\n').length)}
      />
    ) : (
      <input
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setActive(false); } }}
        className={sharedCls}
      />
    );
  }

  return (
    <span
      onClick={open}
      className={`block leading-snug ${!readOnly ? 'cursor-text hover:bg-blue-50 rounded px-0.5 -mx-0.5 transition-colors' : ''} ${!value ? 'text-gray-300' : ''} ${className}`}
    >
      {value || placeholder}
    </span>
  );
}

// ─── StylusCanvas ─────────────────────────────────────────────────────────────

function StylusCanvas({ value, onChange, height = 80 }: {
  value: string; onChange: (data: string) => void; height?: number;
}) {
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
    const sp = new SignaturePad(canvas, { penColor: 'rgb(0,0,0)', minWidth: 1, maxWidth: 2 });
    sigPadRef.current = sp;
    sp.addEventListener('beginStroke', () => setIsDrawing(true));
    sp.addEventListener('endStroke',   () => { setIsDrawing(false); onChange(sp.toDataURL('image/png')); });
    if (value) sp.fromDataURL(value);
    return () => { sp.removeEventListener('beginStroke', () => {}); sp.removeEventListener('endStroke', () => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="checklist-stylus-canvas">
      <canvas ref={canvasRef} className="canvas-dynamic" style={{ height: `${height}px` } as React.CSSProperties} />
      {!isDrawing && !value && <div className="stylus-hint">✍️ Écrire ici avec le stylet ou le doigt</div>}
      {value && (
        <button type="button" onClick={() => { sigPadRef.current?.clear(); onChange(''); }} className="checklist-stylus-clear" title="Effacer">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

// ─── PreuveModal ──────────────────────────────────────────────────────────────

interface Preuve { id: string; nom: string; url: string; dateUpload: string; }

function PreuveModal({ isOpen, onClose, itemRef, preuves, onAdd, onRemove }: {
  isOpen: boolean; onClose: () => void; itemRef: string;
  preuves: Preuve[]; onAdd: (p: Preuve) => void; onRemove: (id: string) => void;
}) {
  const [nom, setNom]   = useState('');
  const [file, setFile] = useState<File | null>(null);
  if (!isOpen) return null;

  const handleAdd = () => {
    if (!file) return;
    onAdd({ id: `pf-${Date.now()}`, nom: nom.trim() || file.name, url: URL.createObjectURL(file), dateUpload: new Date().toISOString() });
    setNom(''); setFile(null);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header">
            <div className="modal-title flex items-center gap-2">
              <FileText className="w-4 h-4 text-role-primary" />
              Preuves — <span className="font-mono font-bold text-role-primary">{itemRef}</span>
            </div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
          <div className="modal-body p-4 space-y-3">
            {preuves.length > 0 && (
              <div className="mb-3">
                <p className="text-[12px] font-semibold text-muted-foreground mb-1.5">{preuves.length} preuve(s)</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {preuves.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-border">
                      <div className="w-7 h-7 rounded bg-role-gradient flex items-center justify-center flex-shrink-0">
                        <FileText className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="flex-1 text-[12px] font-medium truncate">{p.nom}</p>
                      <button onClick={() => window.open(p.url, '_blank')} className="btn btn-sm px-1.5 py-1 btn-ghost"><Eye className="w-3 h-3" /></button>
                      <button onClick={() => onRemove(p.id)} className="btn btn-sm px-1.5 py-1 btn-ghost text-red-600"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border border-border rounded-lg p-3 bg-gray-50 space-y-2">
              <p className="text-[12px] font-semibold flex items-center gap-1"><Upload className="w-3.5 h-3.5 text-role-primary" /> Ajouter une preuve</p>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom de la preuve…" className="form-input w-full text-xs" />
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !nom) setNom(f.name); }} className="form-input w-full text-xs" />
              <button type="button" onClick={handleAdd} disabled={!file}
                className={`btn btn-sm w-full gap-1.5 ${!file ? 'opacity-50 cursor-not-allowed' : 'btn-primary'}`}>
                <Upload className="w-3 h-3" /> Ajouter
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm btn-primary px-4" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── ItemRow ─────────────────────────────────────────────────────────────────

function ItemRow({ item, onUpdate, onDelete, readOnly, modeSaisie }: {
  item: ChecklistItem;
  onUpdate: (updated: ChecklistItem) => void;
  onDelete?: () => void;
  readOnly: boolean;
  modeSaisie: ModeSaisie;
}) {
  const [preuveOpen, setPreuveOpen] = useState(false);
  const [obsEdit, setObsEdit]       = useState(false);
  const [obsTemp, setObsTemp]       = useState(item.observation || '');
  const [stylusTemp, setStylusTemp] = useState((item as any).observation_stylus_data || '');

  const preuves: Preuve[] = (item as any).fichiers || [];
  const showKeyboard = modeSaisie === 'clavier' || modeSaisie === 'mixte';
  const showStylus   = modeSaisie === 'stylet'  || modeSaisie === 'mixte';
  const hasStylusData = !!(item as any).observation_stylus_data;

  const { steps, sa, ns, nv, na } = parseGuideAndDirectives(item);

  const handleResultat = (r: ResultatChecklist) => {
    if (readOnly) return;
    onUpdate({ ...item, resultat: item.resultat === r ? undefined : r });
  };

  const handleObsSave = () => {
    onUpdate({ ...item, observation: obsTemp, ...(stylusTemp ? { observation_stylus_data: stylusTemp } : {}) } as any);
    setObsEdit(false);
  };

  // Normalise l'item avant de sauvegarder un champ du guide
  // (si format hérité avec ÉVALUATION OBJECTIVE dans directive_preuve, on le décompose)
  const normalizedUpdate = (patch: Partial<ChecklistItem>) => {
    const parsed = parseGuideAndDirectives(item);
    const base: Partial<ChecklistItem> = {};
    if (!item.directive_sa && !item.directive_ns && !item.directive_nv && !item.directive_na) {
      // Premier edit sur un item en format hérité → normaliser
      base.directive_preuve = parsed.steps.join('\n');
      base.directive_sa = parsed.sa;
      base.directive_ns = parsed.ns;
      base.directive_nv = parsed.nv;
      base.directive_na = parsed.na;
    }
    onUpdate({ ...item, ...base, ...patch });
  };

  return (
    <>
      <tr className="border-b border-blue-100 hover:bg-blue-50/20 transition-colors group">

        {/* ── Réf ── */}
        <td className="p-1.5 border-r border-blue-100 bg-white w-14 min-w-[3.5rem] max-w-[3.5rem] align-top">
          <InlineEdit
            value={item.numero}
            onChange={v => onUpdate({ ...item, numero: v })}
            readOnly={readOnly}
            className="text-[13px] font-mono text-foreground"
            inputClassName="text-[13px] font-mono"
            placeholder="Réf"
          />
          {item.prefilled && <span className="text-[9px] text-purple-500 font-semibold block">IA</span>}
        </td>

        {/* ── Réf. réglementaire ── */}
        <td className="p-1.5 border-r border-blue-100 bg-white w-28 min-w-[7rem] max-w-[7rem] align-top">
          <InlineEdit
            value={item.reference_reglementaire || ''}
            onChange={v => onUpdate({ ...item, reference_reglementaire: v })}
            readOnly={readOnly}
            className="text-[13px] font-mono text-gray-900 break-words"
            inputClassName="text-[13px] font-mono"
            placeholder="—"
          />
        </td>

        {/* ── Question ── */}
        <td className="p-1.5 border-r border-blue-100 min-w-[10rem] max-w-[15rem] align-top">
          <InlineEdit
            value={item.point_verification}
            onChange={v => onUpdate({ ...item, point_verification: v })}
            readOnly={readOnly}
            multiline
            className="text-[13px] text-foreground"
            inputClassName="text-[13px]"
            placeholder="Point à vérifier…"
          />
        </td>

        {/* ── État SA/NS/NV/NA ── */}
        <td className="p-1.5 border-r border-blue-100 w-28 min-w-[7rem] max-w-[7rem] align-middle">
          <div className="checklist-etat">
            {ETAT_BTNS.map(({ r, shortLabel, activeClass }) => (
              <button key={r} type="button"
                onClick={() => handleResultat(r)}
                className={`checklist-etat-btn ${item.resultat === r ? activeClass : ''} ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {shortLabel}
              </button>
            ))}
          </div>
        </td>

        {/* ── Preuves ── */}
        <td className="p-1.5 text-center border-r border-blue-100 w-32 min-w-[7rem] max-w-[9rem] align-middle">
          <button type="button" onClick={() => setPreuveOpen(true)}
            className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 w-full justify-center">
            <FileText className="w-3.5 h-3.5" />
            {preuves.length > 0 ? (
              <div className="flex flex-col items-center gap-0.5 w-full">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[11px] font-bold text-primary">{preuves.length}</span>
                {preuves.slice(0, 2).map(p => (
                  <span key={p.id} className="text-[9px] text-primary truncate max-w-[90px] text-center">{p.nom}</span>
                ))}
                {preuves.length > 2 && <span className="text-[9px] text-muted-foreground">+{preuves.length - 2}</span>}
              </div>
            ) : (
              <span className="text-[11px] text-gray-400">Ajouter</span>
            )}
          </button>
        </td>

        {/* ── Observations ── */}
        <td className="p-1.5 min-w-[13rem] max-w-[20rem] align-top">
          <div className="flex items-start gap-1 justify-between group/obs">
            {obsEdit ? (
              <div className="space-y-1 w-full">
                {showKeyboard && (
                  <textarea value={obsTemp} onChange={e => setObsTemp(e.target.value)}
                    placeholder="Observation…" rows={2} autoFocus
                    className="form-textarea w-full text-[13px]" />
                )}
                {showStylus && <StylusCanvas value={stylusTemp} onChange={setStylusTemp} height={60} />}
                <div className="flex gap-1">
                  <button type="button" onClick={handleObsSave} className="btn btn-sm px-2 py-1 btn-primary text-[12px]">OK</button>
                  <button type="button" onClick={() => setObsEdit(false)} className="btn btn-sm px-2 py-1 btn-secondary text-[12px]">✕</button>
                </div>
              </div>
            ) : (
              <button type="button"
                onClick={() => { if (!readOnly) { setObsTemp(item.observation || ''); setStylusTemp((item as any).observation_stylus_data || ''); setObsEdit(true); } }}
                className="inline-flex items-start gap-1 text-[13px] text-muted-foreground hover:text-primary text-left flex-1">
                <PenLine className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {item.observation || hasStylusData
                  ? <span className="leading-snug">{item.observation && hasStylusData ? '✍️ + texte' : hasStylusData ? '✍️ Stylet' : item.observation}</span>
                  : <span className="text-[12px] text-gray-400">{readOnly ? '—' : 'Ajouter'}</span>}
              </button>
            )}
            {/* Bouton supprimer — visible au survol de la ligne (group) */}
            {!readOnly && onDelete && !obsEdit && (
              <button type="button"
                onClick={() => { if (window.confirm(`Supprimer "${item.numero}" ?`)) onDelete!(); }}
                className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Supprimer cette ligne">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* ── Guide d'évaluation — sous-ligne inline ── */}
      <tr className="bg-blue-50 border-b border-blue-200 group/guide">
        <td colSpan={6} className="px-3 py-2">
          <p className="text-[13px] font-bold text-blue-900 flex items-center gap-1 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-blue-700" />
            Guide d'évaluation — Étape par étape
          </p>

          {/* Étapes — édition comme un bloc textarea */}
          <div className="mb-1.5">
            {readOnly ? (
              <div className="space-y-0.5">
                {steps.length > 0
                  ? steps.map((l, i) => (
                      <div key={i} className="flex gap-2 text-[13px] text-blue-800">
                        <span className="text-blue-400 flex-shrink-0 mt-px">—</span>
                        <span className="leading-snug">{l}</span>
                      </div>
                    ))
                  : <span className="text-[11px] text-blue-300 italic">Aucune étape</span>}
              </div>
            ) : (
              <InlineEdit
                value={steps.join('\n')}
                onChange={v => normalizedUpdate({ directive_preuve: v })}
                readOnly={false}
                multiline
                placeholder="Cliquer pour ajouter des étapes (une par ligne)…"
                className="text-[13px] text-blue-800 whitespace-pre-wrap"
                inputClassName="text-[13px] text-blue-900 bg-white/90"
              />
            )}
          </div>

          {/* Attribuer l'état de chaque point */}
          <div className="pt-1.5 border-t border-blue-200/70">
            <p className="text-[13px] font-semibold text-blue-900 mb-0.5">Attribuer l'état de chaque point :</p>
            <div className="space-y-0.5">
              {([
                { r: 'SA', cls: 'text-emerald-700', field: 'directive_sa' as keyof ChecklistItem, dir: sa },
                { r: 'NS', cls: 'text-red-600',     field: 'directive_ns' as keyof ChecklistItem, dir: ns },
                { r: 'NV', cls: 'text-amber-600',   field: 'directive_nv' as keyof ChecklistItem, dir: nv },
                { r: 'NA', cls: 'text-slate-500',   field: 'directive_na' as keyof ChecklistItem, dir: na },
              ] as const).map(({ r, cls, field, dir }) => (
                <div key={r} className="flex gap-2 text-[12px] items-start">
                  <span className={`font-bold flex-shrink-0 w-6 pt-0.5 ${cls}`}>{r}</span>
                  <div className="flex-1">
                    <InlineEdit
                      value={dir || ''}
                      onChange={v => normalizedUpdate({ [field]: v || undefined })}
                      readOnly={readOnly}
                      multiline
                      placeholder="Cliquer pour définir le critère…"
                      className="text-blue-800 leading-snug"
                      inputClassName="text-[13px] text-blue-900 bg-white/90"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </td>
      </tr>

      <PreuveModal isOpen={preuveOpen} onClose={() => setPreuveOpen(false)} itemRef={item.numero}
        preuves={preuves}
        onAdd={p => onUpdate({ ...item, fichiers: [...preuves, p] } as any)}
        onRemove={id => onUpdate({ ...item, fichiers: preuves.filter(p => p.id !== id) } as any)} />
    </>
  );
}

// ─── ItemsTableBody ───────────────────────────────────────────────────────────

function ItemsTableBody({ items, onUpdate, onDeleteItem, onAddItem, readOnly, modeSaisie }: {
  items: ChecklistItem[];
  onUpdate: (updated: ChecklistItem) => void;
  onDeleteItem?: (id: string) => void;
  onAddItem?: () => void;
  readOnly: boolean;
  modeSaisie: ModeSaisie;
}) {
  if (!items || items.length === 0) {
    if (!onAddItem || readOnly) return null;
    return (
      <div className="checklist-items-empty">
        <button type="button" onClick={onAddItem}
          className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1">
          <Plus className="w-3.5 h-3.5" /> Ajouter une question
        </button>
      </div>
    );
  }

  return (
    <div className="checklist-items-wrap">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-blue-200">
              <th className="text-left p-1.5 text-[13px] font-bold text-foreground w-14 min-w-[3.5rem] max-w-[3.5rem] border-r border-blue-100">Réf</th>
              <th className="text-left p-1.5 text-[13px] font-bold text-foreground w-28 min-w-[7rem] max-w-[7rem] border-r border-blue-100">Réf. réglementaire</th>
              <th className="text-left p-1.5 text-[13px] font-bold text-foreground min-w-[10rem] max-w-[15rem] border-r border-blue-100">Question</th>
              <th className="text-center p-1.5 text-[13px] font-bold text-foreground w-28 min-w-[7rem] max-w-[7rem] border-r border-blue-100">État</th>
              <th className="text-center p-1.5 text-[13px] font-bold text-foreground w-32 min-w-[7rem] max-w-[9rem] border-r border-blue-100">Preuves</th>
              <th className="text-left p-1.5 text-[13px] font-bold text-foreground min-w-[13rem] max-w-[20rem]">Observations</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <ItemRow key={item.id} item={item} onUpdate={onUpdate}
                onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                readOnly={readOnly} modeSaisie={modeSaisie} />
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && onAddItem && (
        <div className="px-2 py-1 border-t border-blue-100 bg-gray-50/60">
          <button type="button" onClick={onAddItem}
            className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1">
            <Plus className="w-3.5 h-3.5" /> Ajouter une question
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ElementSection (SousDomaine) ─────────────────────────────────────────────

function ElementSection({
  sd, ssdList, onUpdateItem, onMutateSd,
  modeSaisie, readOnly, collapsed, onToggle,
}: {
  sd: SousDomaine;
  ssdList: SousSousDomaine[];
  onUpdateItem: (item: ChecklistItem) => void;
  onMutateSd?: (updated: SousDomaine) => void;
  modeSaisie: ModeSaisie;
  readOnly: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [addingSsd, setAddingSsd]   = useState(false);
  const [newSsdName, setNewSsdName] = useState('');

  const allItems = getAllSousDomainItems(sd);
  const { conformite, total } = computeConformite(allItems);
  const done = allItems.filter(i => i.resultat).length;
  const canEdit = !readOnly && !!onMutateSd;

  const updateSdItems = (items: ChecklistItem[]) =>
    onMutateSd?.({ ...sd, items });

  const updateSsdItems = (ssdId: string, items: ChecklistItem[]) =>
    onMutateSd?.({
      ...sd,
      sousSousDomaines: (sd.sousSousDomaines || []).map(s => s.id === ssdId ? { ...s, items } : s),
    });

  const addSsd = () => {
    if (!newSsdName.trim()) return;
    const newSsd: SousSousDomaine = {
      id: genId('ssd'),
      nom: newSsdName.trim(),
      items: [],
      isExpanded: true,
      ordre: (sd.sousSousDomaines || []).length,
    };
    onMutateSd?.({ ...sd, sousSousDomaines: [...(sd.sousSousDomaines || []), newSsd] });
    setNewSsdName(''); setAddingSsd(false);
  };

  return (
    <div className="mb-1">
      {/* ── Sous-domaine header ── */}
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-blue-100 cursor-pointer hover:bg-blue-200 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="code-oaci-badge text-[11px]">{sd.id}</span>
          <span className="text-[13px] font-medium text-blue-900">{sd.nom}</span>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className={`${conformiteBadgeClass(conformite)} text-[11px] font-semibold`}>
              Conformité {conformite}% — {done}/{total}
            </span>
          )}
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />}
        </div>
      </div>

      {!collapsed && (
        <div>
          {/* Items directs */}
          <ItemsTableBody
            items={sd.items || []}
            onUpdate={onUpdateItem}
            onDeleteItem={canEdit ? (id) => updateSdItems((sd.items || []).filter(i => i.id !== id)) : undefined}
            onAddItem={canEdit ? () => updateSdItems([...(sd.items || []), makeBlankItem(`${sd.id}.${(sd.items || []).length + 1}`)]) : undefined}
            readOnly={readOnly}
            modeSaisie={modeSaisie}
          />

          {/* Sous-sous-domaines */}
          {ssdList.map(ssd => (
            ((ssd.items?.length ?? 0) > 0 || canEdit) ? (
              <div key={ssd.id}>
                <div className="px-2 py-1 bg-slate-50 border-t border-border/50 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">{ssd.nom}</span>
                  {canEdit && (
                    <button type="button"
                      onClick={() => { if (window.confirm(`Supprimer le groupe "${ssd.nom}" ?`))
                        onMutateSd?.({ ...sd, sousSousDomaines: (sd.sousSousDomaines || []).filter(s => s.id !== ssd.id) }); }}
                      className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Supprimer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <ItemsTableBody
                  items={ssd.items || []}
                  onUpdate={onUpdateItem}
                  onDeleteItem={canEdit ? (id) => updateSsdItems(ssd.id, (ssd.items || []).filter(i => i.id !== id)) : undefined}
                  onAddItem={canEdit ? () => updateSsdItems(ssd.id, [...(ssd.items || []), makeBlankItem(`${ssd.id}.${(ssd.items || []).length + 1}`)]) : undefined}
                  readOnly={readOnly}
                  modeSaisie={modeSaisie}
                />
              </div>
            ) : null
          ))}

          {/* Ajouter un groupe */}
          {canEdit && (
            <div className="px-2 py-1 border-t border-dashed border-blue-200 bg-blue-50/30">
              {addingSsd ? (
                <div className="flex items-center gap-2">
                  <input className="form-input flex-1 text-[13px]"
                    placeholder="Nom du groupe…" value={newSsdName}
                    onChange={e => setNewSsdName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSsd(); if (e.key === 'Escape') setAddingSsd(false); }}
                    autoFocus />
                  <button type="button" onClick={addSsd} className="btn btn-sm btn-primary text-[12px]">Ajouter</button>
                  <button type="button" onClick={() => setAddingSsd(false)} className="btn btn-sm btn-secondary text-[12px]">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingSsd(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded px-2 py-0.5">
                  <FolderPlus className="w-3.5 h-3.5" /> Ajouter un groupe
                </button>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── ChecklistStandardTable ───────────────────────────────────────────────────

export interface ChecklistStandardTableProps {
  domaines: DomaineChecklist[];
  onUpdateItem: (updated: ChecklistItem) => void;
  onUpdateDomaines?: (domaines: DomaineChecklist[]) => void;
  /** Mode de saisie global — piloté depuis le composant parent */
  modeSaisie?: ModeSaisie;
  readOnly?: boolean;
}

export function ChecklistStandardTable({
  domaines, onUpdateItem, onUpdateDomaines, modeSaisie = 'clavier', readOnly = false,
}: ChecklistStandardTableProps) {
  const [collapsedDomaines,     setCollapsedDomaines]     = useState<Set<string>>(new Set());
  const [collapsedSousDomaines, setCollapsedSousDomaines] = useState<Set<string>>(new Set());
  const [addingSd, setAddingSd] = useState<string | null>(null);
  const [newSdName, setNewSdName] = useState('');

  const canEdit = !readOnly && !!onUpdateDomaines;

  const toggleDomaine     = (id: string) => setCollapsedDomaines(p     => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSousDomaine = (id: string) => setCollapsedSousDomaines(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const mutateDomaines = (fn: (d: DomaineChecklist[]) => DomaineChecklist[]) => {
    if (onUpdateDomaines) onUpdateDomaines(fn(domaines));
  };

  const mutateSd = (domaineId: string, sdId: string, updated: SousDomaine) =>
    mutateDomaines(ds => ds.map(d =>
      d.id !== domaineId ? d : {
        ...d,
        sousDomaines: (d.sousDomaines || []).map(sd => sd.id === sdId ? updated : sd),
      }
    ));

  const addSousDomaine = (domaineId: string) => {
    if (!newSdName.trim()) return;
    const newSd: SousDomaine = {
      id: genId('sd'),
      nom: newSdName.trim(),
      items: [],
      sousSousDomaines: [],
      isExpanded: true,
      ordre: (domaines.find(d => d.id === domaineId)?.sousDomaines || []).length,
    };
    mutateDomaines(ds => ds.map(d =>
      d.id !== domaineId ? d : { ...d, sousDomaines: [...(d.sousDomaines || []), newSd] }
    ));
    setNewSdName(''); setAddingSd(null);
  };

  if (!domaines || domaines.length === 0) {
    return (
      <div className="card border-border p-8 text-center text-muted-foreground text-sm">
        Aucun domaine chargé.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {domaines.map(domaine => {
        const isCollapsed = collapsedDomaines.has(domaine.id);
        const allItems    = getAllItemsFlat(domaine);
        const { conformite, total } = computeConformite(allItems);
        const done = allItems.filter(i => i.resultat).length;

        return (
          <div key={domaine.id} className="card border-border overflow-hidden">

            {/* ── Domaine header ── */}
            <div className="cursor-pointer bg-blue-900 hover:bg-blue-800 transition-colors"
              onClick={() => toggleDomaine(domaine.id)}>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-blue-200" />
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[12px] font-bold bg-white/20 text-white flex-shrink-0">
                    {domaine.nom.slice(0, 3)}
                  </span>
                  <div>
                    <p className="font-semibold text-[14px] text-white">{domaine.nom}</p>
                    {domaine.description && (
                      <p className="text-[12px] text-blue-200">{domaine.description} — {total} items</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {total > 0 && (
                    <span className={`${conformiteBadgeClass(conformite)} font-semibold text-[12px]`}>
                      Conformité {conformite}% — {done}/{total}
                    </span>
                  )}
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-blue-200" /> : <ChevronDown className="w-4 h-4 text-blue-200" />}
                </div>
              </div>
            </div>

            {/* ── Contenu ── */}
            {!isCollapsed && (
              <div className="border-t border-blue-800">

                {/* Items directs */}
                {(domaine.items?.length ?? 0) > 0 && (
                  <ItemsTableBody
                    items={domaine.items}
                    onUpdate={onUpdateItem}
                    readOnly={readOnly}
                    modeSaisie={modeSaisie}
                  />
                )}

                {/* Sous-domaines */}
                {(domaine.sousDomaines || []).map(sd => {
                  const hasContent =
                    (sd.items?.length ?? 0) > 0 ||
                    (sd.sousSousDomaines || []).some(ssd => (ssd.items?.length ?? 0) > 0);
                  if (!hasContent && !canEdit) return null;

                  return (
                    <div key={sd.id} className="relative group/sd border-t border-blue-100/30">
                      {canEdit && (
                        <button type="button"
                          onClick={() => { if (window.confirm(`Supprimer "${sd.nom}" et tout son contenu ?`))
                            mutateDomaines(ds => ds.map(d =>
                              d.id !== domaine.id ? d : { ...d, sousDomaines: (d.sousDomaines || []).filter(s => s.id !== sd.id) }
                            )); }}
                          className="absolute right-1 top-1 z-10 p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover/sd:opacity-100 transition-opacity"
                          title="Supprimer">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <ElementSection
                        sd={sd}
                        ssdList={sd.sousSousDomaines || []}
                        onUpdateItem={onUpdateItem}
                        onMutateSd={canEdit ? (updated) => mutateSd(domaine.id, sd.id, updated) : undefined}
                        modeSaisie={modeSaisie}
                        readOnly={readOnly}
                        collapsed={collapsedSousDomaines.has(sd.id)}
                        onToggle={() => toggleSousDomaine(sd.id)}
                      />
                    </div>
                  );
                })}

                {/* Ajouter un sous-domaine */}
                {canEdit && (
                  <div className="px-2 py-1.5 border-t border-dashed border-blue-700/40 bg-blue-900/5">
                    {addingSd === domaine.id ? (
                      <div className="flex items-center gap-2">
                        <input className="form-input flex-1 text-[13px]"
                          placeholder="Nom du sous-domaine…" value={newSdName}
                          onChange={e => setNewSdName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addSousDomaine(domaine.id); if (e.key === 'Escape') setAddingSd(null); }}
                          autoFocus />
                        <button type="button" onClick={() => addSousDomaine(domaine.id)} className="btn btn-sm btn-primary text-[12px]">Ajouter</button>
                        <button type="button" onClick={() => setAddingSd(null)} className="btn btn-sm btn-secondary text-[12px]">✕</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAddingSd(domaine.id); setNewSdName(''); }}
                        className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-0.5">
                        <Plus className="w-3.5 h-3.5" /> Ajouter un sous-domaine
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ChecklistStandardTable;
