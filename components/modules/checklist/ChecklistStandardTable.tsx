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
  PenLine, Eye, TrendingUp, X, Plus, FolderPlus, Sparkles, CheckCircle2,
} from 'lucide-react';
import { DOMAINES_SURVEILLANCE } from '@/lib/domaines';
import type {
  DomaineChecklist, ChecklistItem, ResultatChecklist,
  SousDomaine, SousSousDomaine, ModeSaisie,
} from '@/types/checklist';

// ─── Constants ────────────────────────────────────────────────────────────────

export interface NouveauDomaineInfo {
  code: string;
  label: string;
  description: string;
}

/** Cible d'un « split » du tableau courant : à quelle table on se trouve
 *  (domaine → sous-domaine → sous-sous-domaine) et à partir de quel item. */
export interface SplitTarget {
  domaineId: string;
  sdId?: string;
  ssdId?: string;
  afterIndex: number;
}

// Domaines canoniques (SGS, SLI, PHY, OLS, RA, ELEC, MFP, COP, OPS) non déjà
// présents dans la checklist (match par code OU par label).
export function getAvailableDomaines(domaines: Array<{ nom?: string }>): NouveauDomaineInfo[] {
  const existing = new Set((domaines || []).map(d => (d?.nom || '').toLowerCase()))
  return (DOMAINES_SURVEILLANCE as readonly any[])
    .filter((d: any) => !('estGlobal' in d && d.estGlobal))
    .filter((d: any) =>
      !existing.has(String(d.code).toLowerCase()) &&
      !existing.has(String(d.label).toLowerCase())
    )
    .map((d: any) => ({ code: d.code, label: d.label, description: d.description }))
}

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

function makeBlankItem(numero: string, existingItems?: ChecklistItem[]): ChecklistItem {
  // Auto-numérotation : prend le max des numéros existants + 1
  let finalNumero = `${numero}`
  if (existingItems && existingItems.length > 0) {
    const maxNum = Math.max(
      ...existingItems
        .map(i => parseInt(i.numero, 10))
        .filter(n => !isNaN(n)),
      0
    )
    finalNumero = String(maxNum + 1).padStart(Math.max(2, String(existingItems.length + 1).length), '0')
  }
  return {
    id: genId('item'),
    numero: finalNumero,
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

// Insère un nouvel item après l'index donné (ou en fin de liste si index vide)
function insertItemAfter(items: ChecklistItem[], afterIndex: number | undefined, newItem: ChecklistItem): ChecklistItem[] {
  const list = [...(items || [])]
  if (afterIndex === undefined || afterIndex === null) {
    list.push(newItem)
    return list
  }
  const idx = Math.min(afterIndex + 1, list.length)
  list.splice(idx, 0, newItem)
  return list
}

/**
 * SPLIT du domaine courant comme « scinder un tableau » dans Word :
 * - on coupe la table cible juste après afterIndex (ligne sur laquelle on a cliqué +)
 * - tout ce qui suit (lignes restantes de la table + toutes les tables en dessous)
 *   bascule dans le NOUVEAU domaine
 * - le nouveau domaine est inséré immédiatement après le domaine courant
 */
function splitDomaineAt(domaines: DomaineChecklist[], target: SplitTarget, info: NouveauDomaineInfo): DomaineChecklist[] {
  const idx = domaines.findIndex(d => d.id === target.domaineId);
  if (idx === -1) return domaines;
  const d = domaines[idx];
  const { sdId, ssdId, afterIndex } = target;

  const newDomaine = (items: ChecklistItem[], sousDomaines: SousDomaine[]): DomaineChecklist => ({
    id: `dom-${Date.now()}`,
    nom: info.code,
    description: info.description || info.label,
    items,
    sousDomaines,
    isExpanded: true,
    progression: 0,
    ordre: idx + 1,
  });

  let head: DomaineChecklist;
  let tail: DomaineChecklist;

  if (!sdId) {
    // ── Split dans la table des items directs du domaine ──
    head = { ...d, items: (d.items || []).slice(0, afterIndex + 1), sousDomaines: [] };
    tail = newDomaine((d.items || []).slice(afterIndex + 1), d.sousDomaines || []);
  } else {
    const sds = d.sousDomaines || [];
    const sdIdx = sds.findIndex(s => s.id === sdId);
    if (sdIdx === -1) return domaines;
    const sd = sds[sdIdx];

    if (!ssdId) {
      // ── Split dans la table des items directs d'un sous-domaine ──
      const headSd = { ...sd, items: (sd.items || []).slice(0, afterIndex + 1), sousSousDomaines: [] };
      const tailSd = { ...sd, items: (sd.items || []).slice(afterIndex + 1) };
      head = { ...d, sousDomaines: [...sds.slice(0, sdIdx), headSd] };
      tail = newDomaine([], [tailSd, ...sds.slice(sdIdx + 1)]);
    } else {
      // ── Split dans la table d'un sous-sous-domaine ──
      const ssds = sd.sousSousDomaines || [];
      const ssdIdx = ssds.findIndex(s => s.id === ssdId);
      if (ssdIdx === -1) return domaines;
      const ssd = ssds[ssdIdx];
      const headSsd = { ...ssd, items: (ssd.items || []).slice(0, afterIndex + 1) };
      const tailSsd = { ...ssd, items: (ssd.items || []).slice(afterIndex + 1) };
      const headSd = { ...sd, sousSousDomaines: [...ssds.slice(0, ssdIdx), headSsd] };
      const tailSd = { ...sd, sousSousDomaines: [tailSsd, ...ssds.slice(ssdIdx + 1)] };
      head = { ...d, sousDomaines: [...sds.slice(0, sdIdx), headSd] };
      tail = newDomaine([], [tailSd, ...sds.slice(sdIdx + 1)]);
    }
  }

  const list = [...domaines];
  list[idx] = head;
  list.splice(idx + 1, 0, tail);
  return list.map((x, i) => ({ ...x, ordre: i }));
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

  const preuve = Array.isArray(item.directive_preuve) ? item.directive_preuve.join('\n') : (item.directive_preuve ?? '')
  if (item.directive_sa || item.directive_ns || item.directive_nv || item.directive_na) {
    return {
      steps: String(preuve).split('\n').map(cleanLine).filter(Boolean),
      sa: item.directive_sa,
      ns: item.directive_ns,
      nv: item.directive_nv,
      na: item.directive_na,
    };
  }

  const raw = String(preuve);
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

// ─── DomainePicker — liste déroulante des domaines disponibles ────────────────

function DomaineList({ options, onPick }: {
  options: NouveauDomaineInfo[];
  onPick: (info: NouveauDomaineInfo) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="px-3 py-2.5 text-xs text-gray-400">Tous les domaines sont déjà présents dans cette checklist.</div>
    );
  }
  return (
    <>
      {options.map(d => (
        <button
          key={d.code}
          onClick={() => onPick(d)}
          className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-2 text-xs">
          <span className="font-mono font-bold text-blue-700 bg-blue-100 rounded px-1 py-0.5 w-10 text-center flex-shrink-0">{d.code}</span>
          <span className="text-gray-800">{d.label}</span>
        </button>
      ))}
    </>
  );
}

/**
 * Bouton « + Ajouter un domaine » avec liste déroulante des domaines canoniques.
 * Options déjà présentes dans la checklist masquées. S'affiche au-dessus du menu
 * (positionnement absolu, ouverture vers le bas). Utilisé pour l'ajout en tête de
 * liste ET au pied de liste.
 */
export function DomainePicker({ domaines, onPick, className = '' }: {
  domaines: Array<{ nom?: string }>;
  onPick: (info: NouveauDomaineInfo) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = getAvailableDomaines(domaines);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="px-4 py-2 text-xs font-medium text-blue-600 bg-white hover:bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl transition-colors">
        <Plus className="w-3.5 h-3.5 inline mr-1" /> Ajouter un domaine
        <ChevronDown className={`w-3 h-3 inline ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-80 max-h-72 overflow-y-auto bg-white border border-border rounded-xl shadow-xl py-1">
          <DomaineList options={options} onPick={info => { onPick(info); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

// ─── Menu contextuel « + » (question après ou domaine après) ──────────────────

/**
 * Petit menu affiché en surimpression (portail) au-dessus du bouton + de la
 * colonne Observations. Propose d'ajouter une question après, OU de scinder
 * le tableau ici en insérant un nouveau domaine (séparateur de domaines).
 */
function RowAddMenu({ anchor, onAddQuestion, onSplitDomaine, domaines, onClose }: {
  anchor: { left: number; top: number; bottom: number; width: number } | null;
  onAddQuestion: () => void;
  onSplitDomaine: (info: NouveauDomaineInfo) => void;
  domaines: Array<{ nom?: string }>;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<'main' | 'domaine'>('main');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!anchor) return null;

  const left = Math.min(anchor.left, window.innerWidth - 320);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-80 bg-white border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ left: Math.max(8, left), top: anchor.bottom + 4 }}
    >
      {panel === 'main' ? (
        <>
          <button
            onClick={() => { onAddQuestion(); onClose(); }}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Ajouter une question après
          </button>
          <button
            onClick={() => setPanel('domaine')}
            className="w-full text-left px-3 py-2 text-[13px] font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-2 border-t border-border/60">
            <FolderPlus className="w-3.5 h-3.5" /> Scinder ici — nouveau domaine
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-border/60">
            <button onClick={() => setPanel('main')} className="text-blue-600 hover:text-blue-800 text-xs font-medium">←</button>
            <span className="text-xs font-semibold text-blue-900">Scinder ici — nouveau domaine</span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <DomaineList options={getAvailableDomaines(domaines)} onPick={info => { onSplitDomaine(info); onClose(); }} />
          </div>
        </>
      )}
    </div>,
    document.body
  );
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
        onClick={e => e.stopPropagation()}
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
        onClick={e => e.stopPropagation()}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setActive(false); } }}
        className={sharedCls}
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); open(); }}
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
  const valueRef = useRef(value);
  valueRef.current = value;

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
    const onBegin = () => setIsDrawing(true);
    const onEnd = () => { setIsDrawing(false); onChange(sp.toDataURL('image/png')); };
    sp.addEventListener('beginStroke', onBegin);
    sp.addEventListener('endStroke', onEnd);
    if (valueRef.current) sp.fromDataURL(valueRef.current);
    return () => { sp.removeEventListener('beginStroke', onBegin); sp.removeEventListener('endStroke', onEnd); };
  }, [height, onChange]);

  useEffect(() => {
    if (value && sigPadRef.current && !isDrawing) {
      sigPadRef.current.clear();
      sigPadRef.current.fromDataURL(value);
    }
  }, [value]);

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

function PreuveModal({ isOpen, onClose, itemRef, preuves, onAdd, onRemove, uploadFile }: {
  isOpen: boolean; onClose: () => void; itemRef: string;
  preuves: Preuve[]; onAdd: (p: Preuve) => void; onRemove: (id: string) => void;
  uploadFile?: (file: File) => Promise<string>;
}) {
  const [nom, setNom]   = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const url = uploadFile ? await uploadFile(file) : URL.createObjectURL(file);
      onAdd({ id: `pf-${Date.now()}`, nom: nom.trim() || file.name, url, dateUpload: new Date().toISOString() });
      setNom(''); setFile(null);
    } catch (e) {
      console.error('[PreuveModal] Erreur upload:', e);
    } finally {
      setUploading(false);
    }
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
              <button type="button" onClick={handleAdd} disabled={!file || uploading}
                className={`btn btn-sm w-full gap-1.5 ${!file || uploading ? 'opacity-50 cursor-not-allowed' : 'btn-primary'}`}>
                {uploading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Upload...</> : <><Upload className="w-3 h-3" /> Ajouter</>}
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

function ItemRow({ item, onUpdate, onDelete, onAdd, onSplitDomaine, domaines, readOnly, structureReadOnly, modeSaisie, onUploadPreuve, aerodromeId, domaineNom }: {
  item: ChecklistItem;
  onUpdate: (updated: ChecklistItem) => void;
  onDelete?: () => void;
  onAdd?: () => void;
  /** Scinde le tableau courant ici : insère un nouveau domaine après cette ligne (menu + de la colonne Observations) */
  onSplitDomaine?: (info: NouveauDomaineInfo) => void;
  /** Liste complète des domaines de la checklist (pour filtrer les domaines déjà présents) */
  domaines?: Array<{ nom?: string }>;
  readOnly: boolean;
  structureReadOnly?: boolean;
  modeSaisie: ModeSaisie;
  onUploadPreuve?: (file: File, itemId: string) => Promise<string>;
  /** Contexte AERORISQ : calibre la génération des SA/NS/NV/NA sur le profil de risque */
  aerodromeId?: string;
  domaineNom?: string;
}) {
  const [preuveOpen, setPreuveOpen] = useState(false);
  const [obsEdit, setObsEdit]       = useState(false);
  const [obsTemp, setObsTemp]       = useState(item.observation || '');
  const [stylusTemp, setStylusTemp] = useState(item.observation_stylus_data || '');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestingQuestion, setSuggestingQuestion] = useState(false);
  const [suggestingGuide, setSuggestingGuide] = useState(false);
  const [addMenu, setAddMenu]       = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const addBtnRef                   = useRef<HTMLButtonElement>(null);

  const preuves: Preuve[] = item.fichiers || [];
  const showKeyboard = modeSaisie === 'clavier' || modeSaisie === 'mixte';
  const showStylus   = modeSaisie === 'stylet'  || modeSaisie === 'mixte';
  const hasStylusData = !!item.observation_stylus_data;
  const isProposed = !!item.aiPropose;

  const { steps, sa, ns, nv, na } = parseGuideAndDirectives(item);

  const handleResultat = (r: ResultatChecklist) => {
    if (readOnly) return;
    onUpdate({ ...item, resultat: item.resultat === r ? undefined : r });
  };

  const handleObsSave = () => {
    onUpdate({ ...item, observation: obsTemp, ...(stylusTemp ? { observation_stylus_data: stylusTemp } : {}) });
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

  const handleSuggest = async () => {
    setSuggesting(true)
    try {
      const { suggestDirectives } = await import('@/lib/ia/suggestDirectives')
      const result = await suggestDirectives(
        item.directive_preuve || '',
        item.point_verification,
        item.reference_reglementaire || '',
        { aerodromeId, domaine: domaineNom },
      )
      if (result.directive_sa || result.directive_ns || result.directive_nv || result.directive_na) {
        normalizedUpdate({
          directive_sa: result.directive_sa,
          directive_ns: result.directive_ns,
          directive_nv: result.directive_nv,
          directive_na: result.directive_na,
        })
      }
    } catch {
      // silencieux — l'utilisateur peut réessayer
    } finally {
      setSuggesting(false)
    }
  }

  const handleSuggestQuestion = async () => {
    setSuggestingQuestion(true)
    try {
      const { suggestQuestion } = await import('@/lib/ia/suggestDirectives')
      const question = await suggestQuestion(item.point_verification, {
        referenceReglementaire: item.reference_reglementaire || undefined,
        guideEtape: item.directive_preuve || undefined,
        directiveSA: item.directive_sa || undefined,
        aerodromeId,
        domaine: domaineNom,
      })
      if (question) onUpdate({ ...item, point_verification: question })
    } catch {
      // silencieux
    } finally {
      setSuggestingQuestion(false)
    }
  }

  const handleSuggestGuide = async () => {
    setSuggestingGuide(true)
    try {
      const { suggestGuideEtape } = await import('@/lib/ia/suggestDirectives')
      const guide = await suggestGuideEtape(item.point_verification, {
        referenceReglementaire: item.reference_reglementaire || undefined,
        guideActuel: item.directive_preuve || undefined,
        aerodromeId,
        domaine: domaineNom,
      })
      if (guide) normalizedUpdate({ directive_preuve: guide })
    } catch {
      // silencieux
    } finally {
      setSuggestingGuide(false)
    }
  }

  return (
    <>
      <tr className={`border-b border-blue-100 hover:bg-blue-50/20 transition-colors group ${isProposed ? 'ai-proposed-row' : ''}`}>

        {/* ── Réf (structureLocked) ── */}
        <td className="p-1.5 border-r border-blue-100 bg-white w-14 min-w-[3.5rem] max-w-[3.5rem] align-top">
          <InlineEdit
            value={item.numero}
            onChange={v => onUpdate({ ...item, numero: v })}
            readOnly={structureReadOnly}
            className="text-[13px] font-mono text-foreground"
            inputClassName="text-[13px] font-mono"
            placeholder="Réf"
          />
          {item.prefilled && <span className="text-[9px] text-purple-500 font-semibold block">IA</span>}
        </td>

        {/* ── Réf. réglementaire (structureLocked) ── */}
        <td className="p-1.5 border-r border-blue-100 bg-white w-28 min-w-[7rem] max-w-[7rem] align-top">
          <InlineEdit
            value={item.reference_reglementaire || ''}
            onChange={v => onUpdate({ ...item, reference_reglementaire: v })}
            readOnly={structureReadOnly}
            className="text-[13px] font-mono text-gray-900 break-words"
            inputClassName="text-[13px] font-mono"
            placeholder="—"
          />
        </td>

        {/* ── Question (structureLocked) ── */}
        <td className="p-1.5 border-r border-blue-100 min-w-[10rem] max-w-[15rem] align-top">
          <InlineEdit
            value={item.point_verification}
            onChange={v => onUpdate({ ...item, point_verification: v })}
            readOnly={structureReadOnly}
            multiline
            className="text-[13px] text-foreground"
            inputClassName="text-[13px]"
            placeholder="Point à vérifier…"
          />
          {!structureReadOnly && (
            <button type="button" onClick={handleSuggestQuestion} disabled={suggestingQuestion}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors disabled:opacity-50"
              title="Reformuler ou rédiger la question par IA">
              <Sparkles className="w-2.5 h-2.5" />
              {suggestingQuestion ? 'Analyse...' : 'Suggérer par IA'}
            </button>
          )}
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
                onClick={() => { if (!readOnly) { setObsTemp(item.observation || ''); setStylusTemp(item.observation_stylus_data || ''); setObsEdit(true); } }}
                className="inline-flex items-start gap-1 text-[13px] text-muted-foreground hover:text-primary text-left flex-1">
                <PenLine className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {item.observation || hasStylusData
                  ? <span className="leading-snug">{item.observation && hasStylusData ? '✍️ + texte' : hasStylusData ? '✍️ Stylet' : item.observation}</span>
                  : <span className="text-[12px] text-gray-400">{readOnly ? '—' : 'Ajouter'}</span>}
              </button>
            )}
            {/* Bouton valider proposition IA — disparait avec la brillance */}
            {isProposed && !obsEdit && (
              <button type="button"
                onClick={() => onUpdate({ ...item, aiPropose: false })}
                className="p-1 rounded text-amber-600 hover:text-green-700 hover:bg-green-50 transition-colors flex-shrink-0"
                title="Valider la proposition IA — retirer la brillance">
                <CheckCircle2 className="w-3 h-3" />
              </button>
            )}
            {/* Bouton ajouter — structureLocked */}
            {!structureReadOnly && (onAdd || onSplitDomaine) && !obsEdit && (
              <button type="button"
                ref={addBtnRef}
                onClick={() => {
                  if (!onSplitDomaine) { onAdd?.(); return }
                  const r = addBtnRef.current?.getBoundingClientRect()
                  setAddMenu(r ? { left: r.left, top: r.top, bottom: r.bottom, width: r.width } : { left: 0, top: 0, bottom: 0, width: 0 })
                }}
                className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Ajouter une question après, ou scinder le tableau ici (nouveau domaine)">
                <Plus className="w-3 h-3" />
              </button>
            )}
            {/* Bouton supprimer — structureLocked */}
            {!structureReadOnly && onDelete && !obsEdit && (
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
      <tr className={`bg-blue-50 border-b border-blue-200 group/guide ${isProposed ? 'ai-proposed-subrow' : ''}`}>
        <td colSpan={6} className="px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[13px] font-bold text-blue-900 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-700" />
              Guide d'évaluation — Étape par étape
            </p>
            {!structureReadOnly && (
              <button type="button" onClick={handleSuggestGuide} disabled={suggestingGuide}
                className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-100/50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                title="Rédiger le guide d'évaluation étape par étape par IA">
                <Sparkles className="w-2.5 h-2.5" />
                {suggestingGuide ? 'Analyse...' : 'Suggérer par IA'}
              </button>
            )}
          </div>

          {/* Étapes — structureLocked (guide d'évaluation) */}
          <div className="mb-1.5">
            {structureReadOnly ? (
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
                readOnly={structureReadOnly}
                multiline
                placeholder="Cliquer pour ajouter des étapes (une par ligne)…"
                className="text-[13px] text-blue-800 whitespace-pre-wrap"
                inputClassName="text-[13px] text-blue-900 bg-white/90"
              />
            )}
          </div>

          {/* Attribuer l'état de chaque point — structureLocked */}
          <div className="pt-1.5 border-t border-blue-200/70">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[13px] font-semibold text-blue-900">Attribuer l'état de chaque point :</p>
              <button type="button" onClick={handleSuggest} disabled={suggesting}
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-100/50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                title="Suggérer SA/NS/NV/NA depuis le guide d'évaluation">
                <Sparkles className="w-3 h-3" />
                {suggesting ? 'Analyse...' : 'Suggérer par IA'}
              </button>
            </div>
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
                      readOnly={structureReadOnly}
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
        onRemove={id => onUpdate({ ...item, fichiers: preuves.filter(p => p.id !== id) } as any)}
        uploadFile={onUploadPreuve ? (file) => onUploadPreuve(file, item.id) : undefined} />

      <RowAddMenu
        anchor={addMenu}
        onAddQuestion={() => onAdd?.()}
        onSplitDomaine={info => onSplitDomaine?.(info)}
        domaines={domaines || []}
        onClose={() => setAddMenu(null)}
      />
    </>
  );
}

// ─── ItemsTableBody ───────────────────────────────────────────────────────────

function ItemsTableBody({ items, onUpdate, onDeleteItem, onAddItem, onSplitDomaine, splitTarget, domaines, readOnly, structureReadOnly, modeSaisie, onUploadPreuve, aerodromeId, domaineNom }: {
  items: ChecklistItem[];
  onUpdate: (updated: ChecklistItem) => void;
  onDeleteItem?: (id: string) => void;
  /** Ajoute un item après l'index donné (ou en fin de liste si index vide) */
  onAddItem?: (afterIndex?: number) => void;
  /** Scinde le tableau ici : insère un nouveau domaine après la ligne afterIndex (menu +) */
  onSplitDomaine?: (afterIndex: number, info: NouveauDomaineInfo) => void;
  /** Position du tableau dans l'arborescence (domaine / sous-domaine / sous-sous-domaine) */
  splitTarget?: Omit<SplitTarget, 'afterIndex'>;
  /** Liste complète des domaines de la checklist (filtre des domaines déjà présents) */
  domaines?: Array<{ nom?: string }>;
  /** readOnly = verrouillage évaluation */
  readOnly: boolean;
  /** structureReadOnly = verrouillage structure */
  structureReadOnly?: boolean;
  modeSaisie: ModeSaisie;
  onUploadPreuve?: (file: File, itemId: string) => Promise<string>;
  aerodromeId?: string;
  domaineNom?: string;
}) {
  if (!items || items.length === 0) {
    if (!onAddItem || structureReadOnly) return null;
    return (
      <div className="checklist-items-empty">
        <button type="button" onClick={() => onAddItem()}
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
            {items.map((item, index) => (
              <ItemRow key={item.id} item={item} onUpdate={onUpdate}
                onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                onAdd={onAddItem ? () => onAddItem(index) : undefined}
                onSplitDomaine={onSplitDomaine && splitTarget ? (info) => onSplitDomaine(index, info) : undefined}
                domaines={domaines}
                readOnly={readOnly} structureReadOnly={structureReadOnly} modeSaisie={modeSaisie}
                onUploadPreuve={onUploadPreuve} aerodromeId={aerodromeId} domaineNom={domaineNom} />
            ))}
          </tbody>
        </table>
      </div>
      {!structureReadOnly && onAddItem && (
        <div className="px-2 py-1 border-t border-blue-100 bg-gray-50/60">
          <button type="button" onClick={() => onAddItem()}
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
  sd, ssdList, onUpdateItem, onMutateSd, onSplitDomaine, domaineId, domaines,
  modeSaisie, readOnly, structureReadOnly, collapsed, onToggle, onUploadPreuve, aerodromeId, domaineNom,
}: {
  sd: SousDomaine;
  ssdList: SousSousDomaine[];
  onUpdateItem: (item: ChecklistItem) => void;
  onMutateSd?: (updated: SousDomaine) => void;
  /** Scinde le tableau : insère un nouveau domaine après la ligne afterIndex (menu +) */
  onSplitDomaine?: (target: SplitTarget, info: NouveauDomaineInfo) => void;
  /** Id du domaine parent (pour construire la cible du split) */
  domaineId: string;
  /** Liste complète des domaines de la checklist (filtre des domaines déjà présents) */
  domaines?: Array<{ nom?: string }>;
  modeSaisie: ModeSaisie;
  /** readOnly = verrouillage évaluation */
  readOnly: boolean;
  /** structureReadOnly = verrouillage structure */
  structureReadOnly?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onUploadPreuve?: (file: File, itemId: string) => Promise<string>;
  aerodromeId?: string;
  domaineNom?: string;
}) {
  const [addingSsd, setAddingSsd]   = useState(false);
  const [newSsdName, setNewSsdName] = useState('');

  const allItems = getAllSousDomainItems(sd);
  const { conformite, total } = computeConformite(allItems);
  const done = allItems.filter(i => i.resultat).length;
  const canEdit = !structureReadOnly && !!onMutateSd;

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
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {canEdit ? (
            <InlineEdit
              value={sd.nom}
              onChange={v => onMutateSd?.({ ...sd, nom: v })}
              readOnly={!canEdit}
              className="text-[13px] font-medium text-blue-900"
              inputClassName="text-[13px] font-medium"
              placeholder="Nom du sous-domaine"
            />
          ) : (
            <span className="text-[13px] font-medium text-blue-900">{sd.nom}</span>
          )}
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
            onAddItem={canEdit ? (afterIndex) => updateSdItems(insertItemAfter(sd.items || [], afterIndex, makeBlankItem(`${sd.id}.${(sd.items || []).length + 1}`, sd.items))) : undefined}
            onSplitDomaine={onSplitDomaine ? (afterIndex, info) => onSplitDomaine({ domaineId, sdId: sd.id, afterIndex }, info) : undefined}
            splitTarget={{ domaineId, sdId: sd.id }}
            domaines={domaines}
            readOnly={readOnly}
            structureReadOnly={structureReadOnly}
            modeSaisie={modeSaisie}
            onUploadPreuve={onUploadPreuve}
            aerodromeId={aerodromeId}
            domaineNom={domaineNom}
          />

          {/* Sous-sous-domaines */}
          {ssdList.map(ssd => (
            ((ssd.items?.length ?? 0) > 0 || canEdit) ? (
              <div key={ssd.id}>
                <div className="px-2 py-1 bg-slate-50 border-t border-border/50 flex items-center justify-between">
                  {canEdit ? (
                    <InlineEdit
                      value={ssd.nom}
                      onChange={v => onMutateSd?.({ ...sd, sousSousDomaines: (sd.sousSousDomaines || []).map(s => s.id === ssd.id ? { ...s, nom: v } : s) })}
                      readOnly={!canEdit}
                      className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider"
                      inputClassName="text-[12px] font-semibold uppercase"
                      placeholder="Nom du groupe"
                    />
                  ) : (
                    <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">{ssd.nom.replace(/^[A-Z]{2,4}-\d+\s*/, '')}</span>
                  )}
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
                  onAddItem={canEdit ? (afterIndex) => updateSsdItems(ssd.id, insertItemAfter(ssd.items || [], afterIndex, makeBlankItem(`${ssd.id}.${(ssd.items || []).length + 1}`, ssd.items))) : undefined}
                  onSplitDomaine={onSplitDomaine ? (afterIndex, info) => onSplitDomaine({ domaineId, sdId: sd.id, ssdId: ssd.id, afterIndex }, info) : undefined}
                  splitTarget={{ domaineId, sdId: sd.id, ssdId: ssd.id }}
                  domaines={domaines}
                  readOnly={readOnly}
                  structureReadOnly={structureReadOnly}
                  modeSaisie={modeSaisie}
                  onUploadPreuve={onUploadPreuve}
                  aerodromeId={aerodromeId}
                  domaineNom={domaineNom}
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
  /** readOnly = verrouillage évaluation (résultats, observations, preuves) */
  readOnly?: boolean;
  /** structureReadOnly = verrouillage structure (réf, questions, guide, add/delete) */
  structureReadOnly?: boolean;
  /** Callback pour uploader un fichier preuve vers le stockage permanent */
  onUploadPreuve?: (file: File, itemId: string) => Promise<string>;
  /** Contexte AERORISQ : aérodrome de la surveillance (pour calibrer les SA/NS/NV/NA) */
  aerodromeId?: string;
}

export function ChecklistStandardTable({
  domaines, onUpdateItem, onUpdateDomaines, modeSaisie = 'clavier', readOnly = false, structureReadOnly = false,
  onUploadPreuve, aerodromeId,
}: ChecklistStandardTableProps) {
  const [collapsedDomaines,     setCollapsedDomaines]     = useState<Set<string>>(new Set());
  const [collapsedSousDomaines, setCollapsedSousDomaines] = useState<Set<string>>(new Set());
  const [addingSd, setAddingSd] = useState<string | null>(null);
  const [newSdName, setNewSdName] = useState('');

  const canEdit = !structureReadOnly && !!onUpdateDomaines;

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

  // SPLIT du domaine courant (menu + de la colonne Observations) :
  // coupe la table à la ligne choisie et insère un nouveau domaine juste après,
  // en y basculant tout le contenu qui suit (lignes + tables en dessous).
  const handleSplitDomaine = (target: SplitTarget, info: NouveauDomaineInfo) =>
    mutateDomaines(ds => splitDomaineAt(ds, target, info));

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
                    {canEdit ? (
                      <InlineEdit
                        value={domaine.nom}
                        onChange={v => mutateDomaines(ds => ds.map(d => d.id === domaine.id ? { ...d, nom: v } : d))}
                        readOnly={!canEdit}
                        className="font-semibold text-[14px] text-white"
                        inputClassName="font-semibold text-[14px] text-blue-900"
                        placeholder="Nom du domaine"
                      />
                    ) : (
                      <p className="font-semibold text-[14px] text-white">{domaine.nom}</p>
                    )}
                    {canEdit ? (
                      <InlineEdit
                        value={domaine.description || ''}
                        onChange={v => mutateDomaines(ds => ds.map(d => d.id === domaine.id ? { ...d, description: v } : d))}
                        readOnly={!canEdit}
                        multiline
                        className="text-[12px] text-blue-200"
                        inputClassName="text-[12px] text-blue-900 bg-white/95"
                        placeholder="Description du domaine…"
                      />
                    ) : domaine.description ? (
                      <p className="text-[12px] text-blue-200">{domaine.description} — {total} items</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {total > 0 && (
                    <span className={`${conformiteBadgeClass(conformite)} font-semibold text-[12px]`}>
                      Conformité {conformite}% — {done}/{total}
                    </span>
                  )}
                  {canEdit && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setAddingSd(domaine.id); setNewSdName(''); }}
                      className="p-1 rounded text-blue-200 hover:text-white hover:bg-white/20 transition-colors"
                      title="Ajouter un sous-domaine">
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                  {canEdit && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); if (window.confirm(`Supprimer le domaine "${domaine.nom}" et tout son contenu ?`))
                        mutateDomaines(ds => ds.filter(d => d.id !== domaine.id)); }}
                      className="p-1 rounded text-blue-200 hover:text-red-200 hover:bg-red-900/40 transition-colors"
                      title="Supprimer le domaine">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-blue-200" /> : <ChevronDown className="w-4 h-4 text-blue-200" />}
                </div>
              </div>
            </div>

            {/* ── Contenu ── */}
            {!isCollapsed && (
              <div className="border-t border-blue-800">

                {/* Items directs */}
                {((domaine.items?.length ?? 0) > 0 || canEdit) && (
                  <ItemsTableBody
                    items={domaine.items}
                    onUpdate={onUpdateItem}
                    onDeleteItem={canEdit ? (id) => mutateDomaines(ds => ds.map(d =>
                      d.id !== domaine.id ? d : { ...d, items: (d.items || []).filter(i => i.id !== id) }
                    )) : undefined}
                    onAddItem={canEdit ? (afterIndex) => mutateDomaines(ds => ds.map(d =>
                      d.id !== domaine.id ? d : { ...d, items: insertItemAfter(d.items || [], afterIndex, makeBlankItem(`${domaine.id}.${(d.items || []).length + 1}`, d.items)) }
                    )) : undefined}
                    onSplitDomaine={canEdit ? (afterIndex, info) => handleSplitDomaine({ domaineId: domaine.id, afterIndex }, info) : undefined}
                    splitTarget={{ domaineId: domaine.id }}
                    domaines={domaines}
                    readOnly={readOnly}
                    structureReadOnly={structureReadOnly}
                    modeSaisie={modeSaisie}
                    onUploadPreuve={onUploadPreuve}
                    aerodromeId={aerodromeId}
                    domaineNom={domaine.nom}
                  />
                )}

                {/* Ajouter un sous-domaine — APRÈS le tableau */}
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

                {/* Sous-domaines — avec leurs propres boutons Ajouter APRÈS le tableau */}
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
                        onSplitDomaine={canEdit ? (target, info) => handleSplitDomaine(target, info) : undefined}
                        domaineId={domaine.id}
                        domaines={domaines}
                        modeSaisie={modeSaisie}
                        readOnly={readOnly}
                        structureReadOnly={structureReadOnly}
                        collapsed={collapsedSousDomaines.has(sd.id)}
                        onToggle={() => toggleSousDomaine(sd.id)}
                        onUploadPreuve={onUploadPreuve}
                        aerodromeId={aerodromeId}
                        domaineNom={domaine.nom}
                      />
                      {/* Ajouter une question — APRÈS le tableau du sous-domaine */}
                      {canEdit && (
                        <div className="px-2 py-1 border-t border-dashed border-blue-200/40 bg-blue-50/30">
                          <button type="button"
                            onClick={() => {
                              onUpdateDomaines?.(domaines.map(d =>
                                d.id !== domaine.id ? d : {
                                  ...d,
                                  sousDomaines: (d.sousDomaines || []).map(s =>
                                    s.id !== sd.id ? s : { ...s, items: [...(s.items || []), makeBlankItem(`${sd.id}.${(sd.items || []).length + 1}`, sd.items)] }
                                  ),
                                }
                              ));
                            }}
                            className="inline-flex items-center gap-1.5 text-[12px] text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded px-2 py-0.5">
                            <Plus className="w-3.5 h-3.5" /> Ajouter une question
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ChecklistStandardTable;
