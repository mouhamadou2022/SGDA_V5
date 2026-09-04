'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Indent, Outdent,
  Undo2, Redo2, RemoveFormatting,
  Highlighter, Palette, Type,
  Link2, Image as ImageIcon, Table as TableIcon,
  Minus, CornerDownLeft,
  Printer, Download, FileText, Save,
  Sparkles, Brain, Mic, MicOff,
  Search, SpellCheck, Replace,
  Paintbrush, Columns, Move,
  Clock, RefreshCw, Loader2,
  Scissors, Copy, ClipboardPaste,
  CaseSensitive, CaseUpper, CaseLower,
  Square, Circle, Triangle, Star, Hexagon, Diamond, ArrowRight,
  Hash, FileSignature, Stamp,
  Eye, EyeOff, MessageSquare,
  ZoomIn, ZoomOut, Maximize,
  Settings, Grid3x3, Pencil, Eraser,
  Frame, PaintBucket,
  ChevronDown, ChevronUp,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */
const FONTS = [
  'Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana',
  'Trebuchet MS', 'Tahoma', 'Cambria', 'Garamond', 'Courier New',
];

const SIZES = [
  { label: '8 pt', value: '1' }, { label: '9 pt', value: '1' },
  { label: '10 pt', value: '2' }, { label: '10.5 pt', value: '2' },
  { label: '11 pt', value: '3' }, { label: '12 pt', value: '3' },
  { label: '14 pt', value: '4' }, { label: '16 pt', value: '5' },
  { label: '18 pt', value: '5' }, { label: '20 pt', value: '6' },
  { label: '24 pt', value: '6' }, { label: '28 pt', value: '7' },
  { label: '36 pt', value: '7' }, { label: '48 pt', value: '7' },
  { label: '72 pt', value: '7' },
];

const COLORS = [
  '#000000','#434343','#666666','#999999','#B7B7B7','#CCCCCC','#D9D9D9','#EFEFEF','#F3F3F3','#FFFFFF',
  '#980000','#FF0000','#FF9900','#FFFF00','#00FF00','#00FFFF','#4A86E8','#0000FF','#9900FF','#FF00FF',
  '#E6B8AF','#F4CCCC','#FCE5CD','#FFF2CC','#D9EAD3','#D0E0E3','#C9DAF8','#CFE2F3','#D9D2E9','#EAD1DC',
  '#DD7E6B','#EA9999','#F9CB9C','#FFE599','#B6D7A8','#A2C4C9','#A4C2F4','#9FC5E8','#B4A7D6','#D5A6BD',
  '#CC4125','#E06666','#F6B26B','#FFD966','#93C47D','#76A5AF','#6D9EEB','#6FA8DC','#8E7CC3','#C27BA0',
  '#A61C00','#CC0000','#E69138','#F1C232','#6AA84F','#45818E','#3C78D8','#3D85C6','#674EA7','#A64D79',
  '#85200C','#990000','#B45F06','#BF9000','#38761D','#134F5C','#1155CC','#0B5394','#351C75','#741B47',
  '#5B0F00','#660000','#783F04','#7F6000','#274E13','#0C343D','#1C4587','#073763','#20124D','#4C1130',
];

const BG_COLORS = [
  '#FFFFFF','#FFFF00','#00FF00','#00FFFF','#FF00FF','#FF0000','#0000FF','#000000',
  '#F0F0F0','#DCE6F4','#E8D5B7','#D5E8D4','#F8CECC','#CFE2F3','#D9D2E9','#EAD1DC',
  '#FFF2CC','#FCE5CD','#F4CCCC','#E6B8AF','#B6D7A8','#A2C4C9','#A4C2F4','#9FC5E8',
];

const THEMES = [
  { name: 'Défaut', heading: '#1a3a6b', body: '#1a1a1a', accent: '#2563eb' },
  { name: 'ANACIM Bleu', heading: '#0d3b66', body: '#1a1a1a', accent: '#1e5fa8' },
  { name: 'Sombre', heading: '#374151', body: '#1f2937', accent: '#4b5563' },
  { name: 'Classique', heading: '#7c2d12', body: '#1a1a1a', accent: '#c2410c' },
  { name: 'Moderne', heading: '#1e293b', body: '#0f172a', accent: '#0ea5e9' },
];

const SHAPES = [
  { name: 'Rectangle', svg: '<svg width="40" height="30"><rect x="2" y="2" width="36" height="26" fill="#4A86E8" stroke="#1a3a6b" rx="2"/></svg>', html: '<div style="display:inline-block;width:120px;height:80px;background:#4A86E8;border:1px solid #1a3a6b;border-radius:4px;vertical-align:middle"></div>' },
  { name: 'Cercle', svg: '<svg width="40" height="30"><circle cx="20" cy="15" r="13" fill="#E06666" stroke="#980000"/></svg>', html: '<div style="display:inline-block;width:100px;height:100px;background:#E06660;border:1px solid #980000;border-radius:50%;vertical-align:middle"></div>' },
  { name: 'Triangle', svg: '<svg width="40" height="30"><polygon points="20,2 38,28 2,28" fill="#93C47D" stroke="#38761D"/></svg>', html: '<svg width="100" height="86" style="vertical-align:middle"><polygon points="50,0 100,86 0,86" fill="#93C47D" stroke="#38761D" stroke-width="2"/></svg>' },
  { name: 'Étoile', svg: '<svg width="40" height="30"><polygon points="20,2 24,12 35,12 26,18 30,28 20,22 10,28 14,18 5,12 16,12" fill="#F1C232" stroke="#B45F06"/></svg>', html: '<svg width="80" height="80" style="vertical-align:middle"><polygon points="40,4 48,28 74,28 52,44 60,72 40,56 20,72 28,44 6,28 32,28" fill="#F1C232" stroke="#B45F06" stroke-width="2"/></svg>' },
  { name: 'Flèche', svg: '<svg width="40" height="30"><polygon points="0,10 25,10 25,2 40,15 25,28 25,20 0,20" fill="#6D9EEB" stroke="#1C4587"/></svg>', html: '<svg width="120" height="40" style="vertical-align:middle"><polygon points="0,12 70,12 70,2 120,20 70,38 70,28 0,28" fill="#6D9EEB" stroke="#1C4587" stroke-width="2"/></svg>' },
  { name: 'Losange', svg: '<svg width="40" height="30"><polygon points="20,2 38,15 20,28 2,15" fill="#B4A7D6" stroke="#351C75"/></svg>', html: '<svg width="80" height="80" style="vertical-align:middle"><polygon points="40,4 76,40 40,76 4,40" fill="#B4A7D6" stroke="#351C75" stroke-width="2"/></svg>' },
];

const MARGINS_PRESETS = [
  { label: 'Étroites (1.27 cm)', top: '12.7mm', right: '12.7mm', bottom: '12.7mm', left: '12.7mm' },
  { label: 'Normales (2.54 cm)', top: '25.4mm', right: '25.4mm', bottom: '25.4mm', left: '25.4mm' },
  { label: 'Larges (3.18 cm)', top: '31.8mm', right: '31.8mm', bottom: '31.8mm', left: '31.8mm' },
  { label: 'Miroir', top: '25.4mm', right: '31.8mm', bottom: '25.4mm', left: '31.8mm' },
];

const PARAGRAPH_SPACINGS = [
  { label: 'compact (6pt)', value: '6pt' },
  { label: 'normal (8pt)', value: '8pt' },
  { label: '1.0 (interligne)', value: '0pt 0pt 12pt 0pt' },
  { label: '1.15', value: '0pt 0pt 14pt 0pt' },
  { label: '1.5', value: '0pt 0pt 18pt 0pt' },
  { label: 'double (2.0)', value: '0pt 0pt 24pt 0pt' },
];

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200, 300];

const LINE_SPACING = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
  { label: '2.5', value: '2.5' },
  { label: '3.0', value: '3' },
];

/* ═══════════════════════════════════════════════════════════════════════
   Micro-components
   ═══════════════════════════════════════════════════════════════════════ */
function Btn({ active, onClick, title, children, disabled, size = 'sm' }: {
  active?: boolean; onClick: () => void; title: string;
  children: React.ReactNode; disabled?: boolean; size?: 'sm' | 'md';
}) {
  const sz = size === 'md' ? 'w-7 h-7' : 'w-6 h-6';
  return (
    <button type="button" onMouseDown={(e) => { e.preventDefault(); onClick(); }} disabled={disabled} title={title}
      className={`inline-flex items-center justify-center ${sz} rounded hover:bg-blue-50 text-gray-700 transition-colors ${active ? 'bg-blue-100 text-blue-700 shadow-inner' : ''} ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}>
      {children}
    </button>
  );
}

function Sep() { return <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />; }

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5" role="group" aria-label={label}>
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="text-[9px] text-gray-400 leading-none select-none">{label}</span>
    </div>
  );
}

function Drop({ value, options, onChange, title, className }: {
  value: string; options: { label: string; value: string }[];
  onChange: (v: string) => void; title: string; className?: string;
}) {
  return (
    <select value={value} title={title} onChange={(e) => onChange(e.target.value)}
      className={`h-6 rounded border border-gray-200 bg-white px-1 text-[10px] leading-tight text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:outline-none cursor-pointer ${className ?? ''}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ColorPicker({ color, onChange, title, icon: Icon }: {
  color: string; onChange: (c: string) => void; title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const colors = title.toLowerCase().includes('fond') || title.toLowerCase().includes('arrière') ? BG_COLORS : COLORS;
  return (
    <div className="relative">
      <button type="button" onMouseDown={(e) => { e.preventDefault(); setOpen(!open); }} title={title}
        className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-blue-50 cursor-pointer relative">
        <Icon className="w-3.5 h-3.5" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-3.5 rounded-sm" style={{ backgroundColor: color || '#000' }} />
      </button>
      {open && (<>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 w-[200px]">
          <div className="grid grid-cols-10 gap-0.5">
            {colors.map(c => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); }}
                className="w-4 h-4 rounded border border-gray-200 hover:scale-125 transition-transform"
                style={{ backgroundColor: c }} title={c} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-500">Custom:</span>
            <input type="color" value={color || '#000000'}
              onChange={(e) => { onChange(e.target.value); setOpen(false); }}
              className="w-5 h-5 cursor-pointer border-0 p-0" />
          </div>
        </div>
      </>)}
    </div>
  );
}

function Popup({ open, onClose, children, className }: {
  open: boolean; onClose: () => void; children: React.ReactNode; className?: string;
}) {
  if (!open) return null;
  return (<>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div className={`absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 ${className ?? ''}`}>
      {children}
    </div>
  </>);
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Accueil
   ═══════════════════════════════════════════════════════════════════════ */
function TabAccueil({ exec, currentFont, currentSize }: {
  exec: (cmd: string, val?: string) => void;
  currentFont: string; currentSize: string;
}) {
  const [textColor, setTextColor] = useState('#000000');
  const [hlColor, setHlColor] = useState('#FFFF00');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [showParagraph, setShowParagraph] = useState(false);
  const [spacing, setSpacing] = useState('8pt');
  const [lineH, setLineH] = useState('1.15');

  const applyParagraphSpacing = (before: string, after: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const el = (node?.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
    if (el) {
      const p = el.closest('p, h1, h2, h3, h4, h5, h6, li, td, th') || el;
      (p as HTMLElement).style.marginTop = before;
      (p as HTMLElement).style.marginBottom = after;
    }
  };

  const setLineHeight = (lh: string) => {
    setLineH(lh);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const el = (node?.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
    if (el) {
      const p = el.closest('p, h1, h2, h3, h4, h5, h6, li, td, th, div') || el;
      (p as HTMLElement).style.lineHeight = lh;
    }
  };

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Presse-papiers">
        <Btn onClick={() => exec('cut')} title="Couper (Ctrl+X)"><Scissors className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('copy')} title="Copier (Ctrl+C)"><Copy className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('paste')} title="Coller (Ctrl+V)"><ClipboardPaste className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('undo')} title="Annuler (Ctrl+Z)"><Undo2 className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('redo')} title="Rétablir (Ctrl+Y)"><Redo2 className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Police">
        <Drop value={currentFont} options={FONTS.map(f => ({ label: f, value: f }))}
          onChange={(v) => exec('fontName', v)} title="Police" className="w-[100px]" />
        <Drop value={currentSize} options={SIZES}
          onChange={(v) => exec('fontSize', v)} title="Taille" className="w-[50px]" />
      </Group>

      <Sep />

      <Group label="Formatage">
        <Btn onClick={() => exec('bold')} title="Gras (Ctrl+B)"><Bold className="w-3.5 h-3.5" strokeWidth={2.5} /></Btn>
        <Btn onClick={() => exec('italic')} title="Italique (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('underline')} title="Souligné (Ctrl+U)"><Underline className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('strikeThrough')} title="Barré"><Strikethrough className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('subscript')} title="Indice"><span className="text-[10px] font-bold">X₂</span></Btn>
        <Btn onClick={() => exec('superscript')} title="Exposant"><span className="text-[10px] font-bold">X²</span></Btn>
      </Group>

      <Sep />

      <Group label="Casse">
        <Btn onClick={() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const text = sel.toString();
          if (text) { exec('insertHTML', text.toUpperCase()); }
        }} title="MAJUSCULES"><CaseUpper className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const text = sel.toString();
          if (text) { exec('insertHTML', text.toLowerCase()); }
        }} title="minuscules"><CaseLower className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Couleurs">
        <ColorPicker color={textColor} onChange={(c) => { setTextColor(c); exec('foreColor', c); }}
          title="Couleur du texte" icon={Palette} />
        <ColorPicker color={hlColor} onChange={(c) => { setHlColor(c); exec('hiliteColor', c); }}
          title="Surlignage" icon={Highlighter} />
        <ColorPicker color={bgColor} onChange={(c) => { setBgColor(c); exec('backColor', c); }}
          title="Couleur de fond" icon={PaintBucket} />
      </Group>

      <Sep />

      <Group label="Paragraphe">
        <Btn onClick={() => exec('justifyLeft')} title="Aligner à gauche"><AlignLeft className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('justifyCenter')} title="Centrer"><AlignCenter className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('justifyRight')} title="Aligner à droite"><AlignRight className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('justifyFull')} title="Justifier"><AlignJustify className="w-3.5 h-3.5" /></Btn>
        <div className="relative">
          <Btn onClick={() => setShowParagraph(!showParagraph)} title="Interligne">
            <span className="text-[9px] font-mono">{lineH}</span>
          </Btn>
          <Popup open={showParagraph} onClose={() => setShowParagraph(false)} className="w-36">
            {LINE_SPACING.map(ls => (
              <button key={ls.value} type="button" onClick={() => { setLineHeight(ls.value); setShowParagraph(false); }}
                className={`w-full px-3 py-1 text-left text-xs hover:bg-blue-50 ${lineH === ls.value ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>
                Interligne {ls.label}
              </button>
            ))}
          </Popup>
        </div>
        <Btn onClick={() => exec('insertHorizontalRule')} title="Ligne horizontale"><Minus className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Espacement">
        <Btn onClick={() => applyParagraphSpacing('0pt', '4pt')} title="Avant: 4pt / Après: 4pt"><span className="text-[8px]">↕4</span></Btn>
        <Btn onClick={() => applyParagraphSpacing('0pt', '8pt')} title="Avant: 0pt / Après: 8pt"><span className="text-[8px]">↕8</span></Btn>
        <Btn onClick={() => applyParagraphSpacing('0pt', '12pt')} title="Avant: 0pt / Après: 12pt"><span className="text-[8px]">↕12</span></Btn>
        <Btn onClick={() => applyParagraphSpacing('12pt', '12pt')} title="Avant: 12pt / Après: 12pt"><span className="text-[8px]">↕24</span></Btn>
      </Group>

      <Sep />

      <Group label="Listes">
        <Btn onClick={() => exec('insertUnorderedList')} title="Liste à puces"><List className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Liste numérotée"><ListOrdered className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('indent')} title="Augmenter le retrait"><Indent className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('outdent')} title="Diminuer le retrait"><Outdent className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Bordures">
        <Btn onClick={() => exec('insertHTML', '<table style="border:2px solid #000;width:100%;margin:8px 0;border-collapse:collapse"><tr><td style="padding:8px;border:1px solid #000">&nbsp;</td></tr></table>')}
          title="Bordure externe"><Grid3x3 className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('insertHTML', '<div style="border:1px solid #ccc;padding:8px;margin:8px 0;background:#f9f9f9">Encadré</div>')}
          title="Encadré"><Frame className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Styles">
        <Btn onClick={() => exec('formatBlock', '<h1>')} title="Titre 1"><span className="text-[10px] font-bold">H1</span></Btn>
        <Btn onClick={() => exec('formatBlock', '<h2>')} title="Titre 2"><span className="text-[10px] font-bold">H2</span></Btn>
        <Btn onClick={() => exec('formatBlock', '<h3>')} title="Titre 3"><span className="text-[10px] font-bold">H3</span></Btn>
        <Btn onClick={() => exec('formatBlock', '<p>')} title="Normal"><span className="text-[10px]">¶</span></Btn>
        <Btn onClick={() => exec('removeFormat')} title="Effacer la mise en forme"><RemoveFormatting className="w-3.5 h-3.5" /></Btn>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Insérer
   ═══════════════════════════════════════════════════════════════════════ */
function TabInserer({ exec }: { exec: (cmd: string, val?: string) => void }) {
  const [shapesOpen, setShapesOpen] = useState(false);

  const insertTable = () => {
    const rows = prompt('Nombre de lignes:', '3');
    const cols = prompt('Nombre de colonnes:', '3');
    if (!rows || !cols) return;
    let h = '<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0">';
    for (let i = 0; i < parseInt(rows); i++) {
      h += '<tr>';
      for (let j = 0; j < parseInt(cols); j++) {
        h += i === 0
          ? '<th style="padding:6px 10px;background:#dce6f4;font-weight:700;border:1px solid #000;text-align:center">&nbsp;</th>'
          : '<td style="padding:6px 10px;border:1px solid #000">&nbsp;</td>';
      }
      h += '</tr>';
    }
    h += '</table><p>&nbsp;</p>';
    exec('insertHTML', h);
  };

  const insertPageNumber = () => {
    exec('insertHTML', '<span style="font-size:9pt;color:#666" data-page-number="true">— Page 1 —</span>');
  };

  const insertHeader = () => {
    exec('insertHTML', '<div contenteditable="false" style="border-bottom:1px solid #ccc;padding:4px 0;margin-bottom:12px;font-size:9pt;color:#666;text-align:center"><em>En-tête du document — cliquez pour modifier</em></div>');
  };

  const insertFooter = () => {
    exec('insertHTML', '<div contenteditable="false" style="border-top:1px solid #ccc;padding:4px 0;margin-top:12px;font-size:9pt;color:#666;text-align:center"><em>Pied de page — cliquez pour modifier</em></div>');
  };

  const insertPageBorders = () => {
    const el = document.querySelector('.rapport-a4') as HTMLElement | null;
    if (el) {
      el.style.border = el.style.border ? '' : '3px double #1a3a6b';
      el.style.padding = el.style.border ? '15mm' : '';
    }
  };

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Pages">
        <Btn onClick={() => exec('insertHTML', '<div style="page-break-after:always;border-bottom:2px dashed #ccc;margin:16px 0;padding-bottom:8px"><span style="font-size:9px;color:#999">— Saut de page —</span></div>')} title="Saut de page"><CornerDownLeft className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={insertHeader} title="En-tête"><FileSignature className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={insertFooter} title="Pied de page"><Stamp className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={insertPageNumber} title="Numéro de page"><Hash className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={insertPageBorders} title="Bordure de page"><Frame className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Tableau">
        <Btn onClick={insertTable} title="Insérer un tableau"><TableIcon className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Illustrations">
        <Btn onClick={() => { const url = prompt("URL de l'image:"); if (url) exec('insertImage', url); }} title="Image"><ImageIcon className="w-3.5 h-3.5" /></Btn>
        <div className="relative">
          <Btn onClick={() => setShapesOpen(!shapesOpen)} title="Formes"><Square className="w-3.5 h-3.5" /></Btn>
          <Popup open={shapesOpen} onClose={() => setShapesOpen(false)} className="w-56 p-2">
            <div className="grid grid-cols-3 gap-1">
              {SHAPES.map(s => (
                <button key={s.name} type="button" onClick={() => { exec('insertHTML', s.html); setShapesOpen(false); }}
                  className="flex flex-col items-center gap-1 p-2 rounded hover:bg-blue-50 cursor-pointer" title={s.name}>
                  <span dangerouslySetInnerHTML={{ __html: s.svg }} />
                  <span className="text-[8px] text-gray-500">{s.name}</span>
                </button>
              ))}
            </div>
          </Popup>
        </div>
      </Group>

      <Sep />

      <Group label="Liens">
        <Btn onClick={() => { const url = prompt('URL du lien:'); if (url) exec('createLink', url); }} title="Lien hypertexte"><Link2 className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Texte">
        <Btn onClick={() => exec('insertHTML', '<div style="border:1px dashed #999;padding:12px;margin:8px 0;color:#999;font-style:italic">Zone de texte — cliquez pour éditer</div>')} title="Zone de texte"><Type className="w-3.5 h-3.5" /></Btn>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Design
   ═══════════════════════════════════════════════════════════════════════ */
function TabDesign({ onApplyTheme, currentTheme, exec }: {
  onApplyTheme: (theme: typeof THEMES[0]) => void; currentTheme: string;
  exec: (cmd: string, val?: string) => void;
}) {
  const [bordersOpen, setBordersOpen] = useState(false);

  const applyPageBorder = (style: string, color: string) => {
    const el = document.querySelector('.rapport-a4') as HTMLElement | null;
    if (el) el.style.border = `${style} ${color}`;
  };

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Thèmes">
        <div className="flex gap-1">
          {THEMES.map(t => (
            <button key={t.name} type="button" onClick={() => onApplyTheme(t)} title={t.name}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded border transition-all cursor-pointer ${currentTheme === t.name ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300'}`}>
              <div className="flex gap-0.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.heading }} />
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.accent }} />
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.body }} />
              </div>
              <span className="text-[8px] text-gray-500 leading-none">{t.name}</span>
            </button>
          ))}
        </div>
      </Group>

      <Sep />

      <Group label="Couleurs de paragraphe">
        <div className="flex gap-0.5">
          {BG_COLORS.slice(0, 12).map(c => (
            <button key={c} type="button" title={c}
              className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform cursor-pointer"
              style={{ backgroundColor: c }} onClick={() => exec('backColor', c)} />
          ))}
        </div>
      </Group>

      <Sep />

      <Group label="Bordures de page">
        <div className="relative">
          <Btn onClick={() => setBordersOpen(!bordersOpen)} title="Bordures de page"><Frame className="w-3.5 h-3.5" /></Btn>
          <Popup open={bordersOpen} onClose={() => setBordersOpen(false)} className="w-48 p-2">
            {[
              { label: 'Aucune', style: 'none' },
              { label: 'Simple', style: '1px solid #000' },
              { label: 'Double', style: '3px double #1a3a6b' },
              { label: 'Pointillée', style: '2px dashed #999' },
              { label: 'Épaisse', style: '4px solid #333' },
            ].map(b => (
              <button key={b.label} type="button" onClick={() => { applyPageBorder(b.style, '#000'); setBordersOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2">
                <div className="w-8 h-6 border" style={{ border: b.style === 'none' ? '1px solid #eee' : b.style }} />
                {b.label}
              </button>
            ))}
          </Popup>
        </div>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Layout
   ═══════════════════════════════════════════════════════════════════════ */
function TabLayout({
  onSetMargins, onSetOrientation, onSetColumns, currentMargins, currentOrientation,
  onSetIndividualMargins, individualMargins,
}: {
  onSetMargins: (m: string) => void; onSetOrientation: (o: 'portrait' | 'landscape') => void;
  onSetColumns: (c: number) => void; currentMargins: string; currentOrientation: string;
  onSetIndividualMargins?: (m: { top: string; right: string; bottom: string; left: string }) => void;
  individualMargins?: { top: string; right: string; bottom: string; left: string };
}) {
  const [marginsOpen, setMarginsOpen] = useState(false);
  const [orientOpen, setOrientOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [customMargins, setCustomMargins] = useState(false);

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Marges">
        <div className="relative">
          <Btn onClick={() => setMarginsOpen(!marginsOpen)} title="Marges"><Move className="w-3.5 h-3.5" /></Btn>
          <Popup open={marginsOpen} onClose={() => setMarginsOpen(false)} className="w-56">
            {MARGINS_PRESETS.map(m => (
              <button key={m.label} type="button"
                onClick={() => { onSetMargins(m.top); onSetIndividualMargins?.(m); setMarginsOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 ${currentMargins === m.top ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>
                {currentMargins === m.top && <span className="text-blue-500 mr-1">✓</span>}{m.label}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button type="button" onClick={() => setCustomMargins(!customMargins)}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2">
                <Settings className="w-3 h-3" /> Marges personnalisées
              </button>
            </div>
          </Popup>
        </div>
        {customMargins && (
          <div className="flex gap-1 items-center">
            {(['top', 'right', 'bottom', 'left'] as const).map(side => (
              <div key={side} className="flex items-center gap-0.5">
                <span className="text-[8px] text-gray-400">{side === 'top' ? 'H' : side === 'right' ? 'D' : side === 'bottom' ? 'B' : 'G'}</span>
                <input type="text" defaultValue={individualMargins?.[side] || '25.4mm'}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (onSetIndividualMargins && individualMargins) {
                      onSetIndividualMargins({ ...individualMargins, [side]: val });
                    }
                  }}
                  className="w-12 h-5 text-[9px] border border-gray-200 rounded px-1 text-center" />
              </div>
            ))}
          </div>
        )}
      </Group>

      <Sep />

      <Group label="Orientation">
        <div className="relative">
          <Btn onClick={() => setOrientOpen(!orientOpen)} title="Orientation"><Columns className="w-3.5 h-3.5" /></Btn>
          <Popup open={orientOpen} onClose={() => setOrientOpen(false)} className="w-36">
            {(['portrait', 'landscape'] as const).map(o => (
              <button key={o} type="button" onClick={() => { onSetOrientation(o); setOrientOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 ${currentOrientation === o ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>
                {currentOrientation === o && <span className="text-blue-500 mr-1">✓</span>}
                {o === 'portrait' ? 'Portrait' : 'Paysage'}
              </button>
            ))}
          </Popup>
        </div>
      </Group>

      <Sep />

      <Group label="Colonnes">
        <div className="relative">
          <Btn onClick={() => setColsOpen(!colsOpen)} title="Colonnes"><Columns className="w-3.5 h-3.5 rotate-90" /></Btn>
          <Popup open={colsOpen} onClose={() => setColsOpen(false)} className="w-32">
            {[1, 2, 3].map(n => (
              <button key={n} type="button" onClick={() => { onSetColumns(n); setColsOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50">
                {n} colonne{n > 1 ? 's' : ''}
              </button>
            ))}
          </Popup>
        </div>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Review
   ═══════════════════════════════════════════════════════════════════════ */
function TabReview({
  wordCount, charCount, paragraphCount, readingTime,
  trackChanges, onToggleTrackChanges,
}: {
  wordCount: number; charCount: number; paragraphCount: number; readingTime: string;
  trackChanges: boolean; onToggleTrackChanges: () => void;
}) {
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState(0);

  const doFind = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    if (!findText) { setMatchCount(0); return; }
    const body = document.querySelector('.rapport-a4 .rapport-content');
    if (!body) return;
    let count = 0;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const idx = (textNode.textContent || '').toLowerCase().indexOf(findText.toLowerCase());
      if (idx !== -1) count++;
    }
    setMatchCount(count);
    // highlight first match
    const range = document.createRange();
    const first = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (first.nextNode()) {
      const idx = (first.currentNode.textContent || '').toLowerCase().indexOf(findText.toLowerCase());
      if (idx !== -1) {
        range.setStart(first.currentNode, idx);
        range.setEnd(first.currentNode, idx + findText.length);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        break;
      }
    }
  }, [findText]);

  const doReplace = useCallback(() => {
    const body = document.querySelector('.rapport-a4 .rapport-content');
    if (!body || !findText) return;
    const html = body.innerHTML;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    body.innerHTML = html.replace(regex, replaceText);
    doFind();
  }, [findText, replaceText, doFind]);

  const doReplaceAll = useCallback(() => {
    const body = document.querySelector('.rapport-a4 .rapport-content');
    if (!body || !findText) return;
    const html = body.innerHTML;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    body.innerHTML = html.replace(regex, replaceText);
    setMatchCount(0);
  }, [findText, replaceText]);

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Recherche">
        <Btn onClick={() => setFindOpen(!findOpen)} title="Rechercher et remplacer"><Search className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => { document.execCommand('undo'); }} title="Annuler"><Undo2 className="w-3 h-3" /></Btn>
        <Btn onClick={() => { document.execCommand('redo'); }} title="Rétablir"><Redo2 className="w-3 h-3" /></Btn>
      </Group>

      {findOpen && (
        <div className="flex items-center gap-2 px-2">
          <input type="text" value={findText} onChange={(e) => setFindText(e.target.value)}
            placeholder="Rechercher..." onKeyDown={(e) => e.key === 'Enter' && doFind()}
            className="h-6 w-32 text-[10px] border border-gray-200 rounded px-2" autoFocus />
          <input type="text" value={replaceText} onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Remplacer par..." className="h-6 w-32 text-[10px] border border-gray-200 rounded px-2" />
          <Btn onClick={doFind} title="Rechercher"><Search className="w-3 h-3" /></Btn>
          <Btn onClick={doReplace} title="Remplacer"><Replace className="w-3 h-3" /></Btn>
          <Btn onClick={doReplaceAll} title="Tout remplacer"><Replace className="w-3 h-3" /><span className="text-[8px]">Tout</span></Btn>
          {matchCount > 0 && <span className="text-[9px] text-gray-500">{matchCount} résultat(s)</span>}
        </div>
      )}

      <Sep />

      <Group label="Suivi">
        <Btn active={trackChanges} onClick={onToggleTrackChanges} title="Suivi des modifications">
          <Pencil className="w-3.5 h-3.5" />
        </Btn>
      </Group>

      <Sep />

      <Group label="Commentaires">
        <Btn onClick={() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { alert('Sélectionnez du texte pour ajouter un commentaire.'); return; }
          const text = prompt('Commentaire:');
          if (!text) return;
          const range = sel.getRangeAt(0);
          const mark = document.createElement('mark');
          mark.style.backgroundColor = '#FFF176';
          mark.style.borderBottom = '2px solid #F59E0B';
          mark.title = `Commentaire: ${text}`;
          range.surroundContents(mark);
          sel.removeAllRanges();
        }} title="Ajouter un commentaire"><MessageSquare className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Vérification">
        <Btn onClick={() => { alert('La vérification orthographique est gérée automatiquement par le navigateur (clic droit).'); }} title="Orthographe"><SpellCheck className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Statistiques">
        <div className="flex items-center gap-3 px-2 text-[10px] text-gray-500">
          <span>Mots: <strong className="text-gray-700">{wordCount}</strong></span>
          <span>Caractères: <strong className="text-gray-700">{charCount}</strong></span>
          <span>Para: <strong className="text-gray-700">{paragraphCount}</strong></span>
          <span>~{readingTime}</span>
        </div>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main: RapportRibbon
   ═══════════════════════════════════════════════════════════════════════ */
export type RibbonTab = 'accueil' | 'inserer' | 'design' | 'layout' | 'review';

interface RapportRibbonProps {
  onExecCommand: (cmd: string, value?: string) => void;
  onSave: () => void; onPrint: () => void;
  onExportPDF: () => void; onExportDOCX: () => void;
  onRegenerate: () => void; readOnly: boolean;
  onSign: () => void; isSigned: boolean;
  onIACommand: (instruction: string) => void; isIaGenerating: boolean;
  onDictate: () => void; isDictating: boolean;
  onAnalyse?: () => void; onShowVersionHistory: () => void;
  documentStats?: { words: number; chars: number; paragraphs: number; readingTime: string };
  layoutProps?: {
    margins: string; orientation: string;
    onSetMargins: (m: string) => void;
    onSetOrientation: (o: 'portrait' | 'landscape') => void;
    onSetColumns: (c: number) => void;
    individualMargins?: { top: string; right: string; bottom: string; left: string };
    onSetIndividualMargins?: (m: { top: string; right: string; bottom: string; left: string }) => void;
  };
  designProps?: { currentTheme: string; onApplyTheme: (theme: typeof THEMES[0]) => void };
  zoom?: number; onSetZoom?: (z: number) => void;
}

export default function RapportRibbon({
  onExecCommand, onSave, onPrint, onExportPDF, onExportDOCX, onRegenerate,
  readOnly, onSign, isSigned, onIACommand, isIaGenerating,
  onDictate, isDictating, onAnalyse, onShowVersionHistory,
  documentStats, layoutProps, designProps, zoom = 100, onSetZoom,
}: RapportRibbonProps) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('accueil');
  const [iaPanelOpen, setIaPanelOpen] = useState(false);
  const [iaInstruction, setIaInstruction] = useState('');
  const [iaJustSent, setIaJustSent] = useState(false);
  const [trackChanges, setTrackChanges] = useState(false);

  const exec = (cmd: string, val?: string) => onExecCommand(cmd, val);

  const handleIA = () => {
    if (iaInstruction.trim() && !isIaGenerating) { setIaJustSent(true); onIACommand(iaInstruction); }
  };

  useEffect(() => {
    if (iaJustSent && !isIaGenerating) {
      const t = setTimeout(() => { setIaInstruction(''); setIaJustSent(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [iaJustSent, isIaGenerating]);

  const stats = documentStats || { words: 0, chars: 0, paragraphs: 0, readingTime: '0 min' };
  const defaultLayout = { margins: '25.4mm', orientation: 'portrait', onSetMargins: () => {}, onSetOrientation: () => {}, onSetColumns: () => {},
    individualMargins: { top: '25.4mm', right: '25.4mm', bottom: '25.4mm', left: '25.4mm' }, onSetIndividualMargins: () => {} };
  const layout = layoutProps || defaultLayout;
  const defaultDesign = { currentTheme: 'ANACIM Bleu', onApplyTheme: () => {} };
  const design = designProps || defaultDesign;

  const tabs: { key: RibbonTab; label: string }[] = [
    { key: 'accueil', label: 'Accueil' },
    { key: 'inserer', label: 'Insérer' },
    { key: 'design', label: 'Design' },
    { key: 'layout', label: 'Layout' },
    { key: 'review', label: 'Review' },
  ];

  return (
    <div className="sticky top-0 z-[100] bg-white border-b border-gray-200 shadow-sm select-none">
      {/* Row 0: Tabs + Quick actions + Zoom */}
      <div className="flex items-center border-b border-gray-100 px-2 gap-0">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${activeTab === t.key ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        <div className="flex items-center gap-1 pr-2">
          <button onClick={onSave} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]"><Save className="w-3 h-3" /> Sauvegarder</button>
          <button onClick={onExportPDF} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]"><Download className="w-3 h-3" /> PDF</button>
          <button onClick={onExportDOCX} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]"><FileText className="w-3 h-3" /> Word</button>
          <button onClick={onPrint} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]"><Printer className="w-3 h-3" /> Imprimer</button>
          <div className="w-px h-4 bg-gray-200 mx-1" />

          {/* Zoom */}
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => onSetZoom?.(Math.max(25, zoom - 25))} title="Zoom arrière"><ZoomOut className="w-3 h-3" /></Btn>
            <select value={zoom} onChange={(e) => onSetZoom?.(parseInt(e.target.value))}
              className="h-5 text-[9px] border border-gray-200 rounded px-1 bg-white cursor-pointer w-12 text-center">
              {ZOOM_LEVELS.map(z => <option key={z} value={z}>{z}%</option>)}
            </select>
            <Btn onClick={() => onSetZoom?.(Math.min(400, zoom + 25))} title="Zoom avant"><ZoomIn className="w-3 h-3" /></Btn>
          </div>

          <div className="w-px h-4 bg-gray-200 mx-1" />
          {!readOnly && !isSigned && (<>
            <button onClick={onRegenerate} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]"><RefreshCw className="w-3 h-3" /> Régénérer</button>
            <button onClick={() => setIaPanelOpen(!iaPanelOpen)} className={`btn btn-sm px-2 py-0.5 gap-1 text-[10px] ${iaPanelOpen ? 'btn-primary' : ''}`}><Brain className="w-3 h-3" /> AERORISQ</button>
            <button onClick={onDictate} className={`btn btn-sm px-2 py-0.5 gap-1 text-[10px] ${isDictating ? 'bg-red-500 text-white' : ''}`}>
              {isDictating ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            </button>
            <button onClick={onShowVersionHistory} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]"><Clock className="w-3 h-3" /></button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
          </>)}
          {!readOnly && !isSigned && (
            <button onClick={onSign} className="btn btn-sm px-3 py-1 btn-primary gap-1 text-[10px] font-medium">Signer</button>
          )}
          {isSigned && <span className="text-[10px] text-green-600 font-medium">✓ Signé</span>}
        </div>
      </div>

      {/* Row 1: Active tab */}
      {activeTab === 'accueil' && <TabAccueil exec={exec} currentFont="Calibri" currentSize="3" />}
      {activeTab === 'inserer' && <TabInserer exec={exec} />}
      {activeTab === 'design' && <TabDesign onApplyTheme={design.onApplyTheme} currentTheme={design.currentTheme} exec={exec} />}
      {activeTab === 'layout' && (
        <TabLayout onSetMargins={layout.onSetMargins} onSetOrientation={layout.onSetOrientation}
          onSetColumns={layout.onSetColumns} currentMargins={layout.margins} currentOrientation={layout.orientation}
          onSetIndividualMargins={layout.onSetIndividualMargins} individualMargins={layout.individualMargins} />
      )}
      {activeTab === 'review' && (
        <TabReview wordCount={stats.words} charCount={stats.chars} paragraphCount={stats.paragraphs}
          readingTime={stats.readingTime} trackChanges={trackChanges} onToggleTrackChanges={() => setTrackChanges(!trackChanges)} />
      )}

      {/* IA Panel */}
      {iaPanelOpen && !readOnly && !isSigned && (
        <div className="border-t border-gray-100 px-3 py-2 bg-blue-50/50">
          <div className="flex gap-2">
            <input type="text" value={iaInstruction} onChange={(e) => setIaInstruction(e.target.value)}
              placeholder="Ex: Améliore la conclusion, ajoute des recommandations..."
              className="flex-1 form-input text-xs" onKeyDown={(e) => e.key === 'Enter' && handleIA()} />
            <button onClick={handleIA} disabled={isIaGenerating || !iaInstruction.trim()} className="btn btn-sm px-3 py-1 btn-primary gap-1 text-xs">
              {isIaGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {isIaGenerating ? 'Génération...' : 'Appliquer'}
            </button>
          </div>
          {isIaGenerating && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-blue-100 border border-blue-200 text-xs text-blue-800">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
              <span>AERORISQ génère la section… Veuillez patienter.</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {[{ label: 'Résumé', cmd: 'Génère un résumé exécutif' }, { label: 'Recommandations', cmd: 'Ajoute des recommandations' },
              { label: 'Conclusion', cmd: 'Rédige une conclusion' }, { label: 'Analyser', cmd: 'Analyse les résultats' },
              { label: 'Reformuler', cmd: 'Reformule la conclusion de manière plus professionnelle' },
              { label: 'Développer', cmd: "Développe et détaille l'analyse des résultats" },
              { label: 'Raccourcir', cmd: 'Résume et rends plus concis le résumé exécutif' },
            ].map(p => (
              <button key={p.label} onClick={() => onIACommand(p.cmd)} className="btn btn-sm px-2 py-0.5 text-[10px]">{p.label}</button>
            ))}
            {onAnalyse && (
              <button onClick={onAnalyse} className="btn btn-sm px-2 py-0.5 text-[10px] bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200">Qualité</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { Loader2 };
