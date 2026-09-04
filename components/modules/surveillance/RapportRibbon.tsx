'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Hash, Search, SpellCheck,
  Paintbrush, Columns, Move,
  ChevronDown, Clock, RefreshCw, Loader2,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */
const FONTS = [
  'Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana',
  'Trebuchet MS', 'Tahoma', 'Cambria', 'Garamond', 'Courier New',
];

const SIZES = [
  { label: '8 pt', value: '1' },
  { label: '9 pt', value: '1' },
  { label: '10 pt', value: '2' },
  { label: '10.5 pt', value: '2' },
  { label: '11 pt', value: '3' },
  { label: '12 pt', value: '3' },
  { label: '14 pt', value: '4' },
  { label: '16 pt', value: '5' },
  { label: '18 pt', value: '5' },
  { label: '20 pt', value: '6' },
  { label: '24 pt', value: '6' },
  { label: '28 pt', value: '7' },
  { label: '36 pt', value: '7' },
  { label: '48 pt', value: '7' },
  { label: '72 pt', value: '7' },
];

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
  '#A61C00', '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3C78D8', '#3D85C6', '#674EA7', '#A64D79',
  '#85200C', '#990000', '#B45F06', '#BF9000', '#38761D', '#134F5C', '#1155CC', '#0B5394', '#351C75', '#741B47',
  '#5B0F00', '#660000', '#783F04', '#7F6000', '#274E13', '#0C343D', '#1C4587', '#073763', '#20124D', '#4C1130',
];

const THEMES = [
  { name: 'Défaut', heading: '#1a3a6b', body: '#1a1a1a', accent: '#2563eb' },
  { name: 'ANACIM Bleu', heading: '#0d3b66', body: '#1a1a1a', accent: '#1e5fa8' },
  { name: 'Sombre', heading: '#374151', body: '#1f2937', accent: '#4b5563' },
  { name: 'Classique', heading: '#7c2d12', body: '#1a1a1a', accent: '#c2410c' },
  { name: 'Moderne', heading: '#1e293b', body: '#0f172a', accent: '#0ea5e9' },
];

const MARGINS = [
  { label: 'Étroites (1.27 cm)', value: '12.7mm' },
  { label: 'Normales (2.54 cm)', value: '25.4mm' },
  { label: 'Larges (3.18 cm)', value: '31.8mm' },
  { label: 'Très larges (5 cm)', value: '50mm' },
];

/* ═══════════════════════════════════════════════════════════════════════
   Micro-components
   ═══════════════════════════════════════════════════════════════════════ */
function Btn({
  active, onClick, title, children, disabled, size = 'sm',
}: {
  active?: boolean; onClick: () => void; title: string;
  children: React.ReactNode; disabled?: boolean; size?: 'sm' | 'md';
}) {
  const sz = size === 'md' ? 'w-7 h-7' : 'w-6 h-6';
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center ${sz} rounded
        hover:bg-blue-50 text-gray-700 transition-colors
        ${active ? 'bg-blue-100 text-blue-700 shadow-inner' : ''}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5" role="group" aria-label={label}>
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="text-[9px] text-gray-400 leading-none select-none">{label}</span>
    </div>
  );
}

function Drop({
  value, options, onChange, title, className,
}: {
  value: string; options: { label: string; value: string }[];
  onChange: (v: string) => void; title: string; className?: string;
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      className={`h-6 rounded border border-gray-200 bg-white px-1 text-[10px] leading-tight text-gray-700
        hover:border-blue-400 focus:border-blue-500 focus:outline-none cursor-pointer ${className ?? ''}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ColorPicker({
  color, onChange, title, icon: Icon,
}: {
  color: string; onChange: (c: string) => void;
  title: string; icon: React.ComponentType<{ className?: string }>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen(!open); }}
        title={title}
        className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-blue-50 cursor-pointer relative group"
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-3.5 rounded-sm" style={{ backgroundColor: color || '#000' }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 w-[200px]">
            <div className="grid grid-cols-10 gap-0.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); }}
                  className="w-4 h-4 rounded border border-gray-200 hover:scale-125 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
              <span className="text-[10px] text-gray-500">Personnalisée:</span>
              <input
                ref={ref}
                type="color"
                value={color || '#000000'}
                onChange={(e) => { onChange(e.target.value); setOpen(false); }}
                className="w-5 h-5 cursor-pointer border-0 p-0"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Accueil
   ═══════════════════════════════════════════════════════════════════════ */
function TabAccueil({ exec, currentFont, currentSize }: {
  exec: (cmd: string, val?: string) => void;
  currentFont: string;
  currentSize: string;
}) {
  const [textColor, setTextColor] = useState('#000000');
  const [hlColor, setHlColor] = useState('#FFFF00');

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Presse-papiers">
        <Btn onClick={() => exec('undo')} title="Annuler (Ctrl+Z)"><Undo2 className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('redo')} title="Rétablir (Ctrl+Y)"><Redo2 className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Police">
        <Drop
          value={currentFont}
          options={FONTS.map(f => ({ label: f, value: f }))}
          onChange={(v) => exec('fontName', v)}
          title="Police"
          className="w-[100px]"
        />
        <Drop
          value={currentSize}
          options={SIZES}
          onChange={(v) => exec('fontSize', v)}
          title="Taille"
          className="w-[50px]"
        />
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

      <Group label="Couleurs">
        <ColorPicker
          color={textColor}
          onChange={(c) => { setTextColor(c); exec('foreColor', c); }}
          title="Couleur du texte"
          icon={Palette}
        />
        <ColorPicker
          color={hlColor}
          onChange={(c) => { setHlColor(c); exec('hiliteColor', c); }}
          title="Surlignage"
          icon={Highlighter}
        />
      </Group>

      <Sep />

      <Group label="Paragraphe">
        <Btn onClick={() => exec('justifyLeft')} title="Aligner à gauche"><AlignLeft className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('justifyCenter')} title="Centrer"><AlignCenter className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('justifyRight')} title="Aligner à droite"><AlignRight className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('justifyFull')} title="Justifier"><AlignJustify className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Listes">
        <Btn onClick={() => exec('insertUnorderedList')} title="Liste à puces"><List className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Liste numérotée"><ListOrdered className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('indent')} title="Augmenter le retrait"><Indent className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => exec('outdent')} title="Diminuer le retrait"><Outdent className="w-3.5 h-3.5" /></Btn>
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

  const insertImage = () => {
    const url = prompt("URL de l'image:");
    if (url) exec('insertImage', url);
  };

  const insertLink = () => {
    const url = prompt('URL du lien:');
    if (url) exec('createLink', url);
  };

  const insertHr = () => {
    exec('insertHTML', '<hr style="border:none;border-top:1px solid #ccc;margin:12px 0" />');
  };

  const insertPageBreak = () => {
    exec('insertHTML', '<div style="page-break-after:always;border-bottom:2px dashed #ccc;margin:16px 0;padding-bottom:8px"><span style="font-size:9px;color:#999">— Saut de page —</span></div>');
  };

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Pages">
        <Btn onClick={insertPageBreak} title="Saut de page"><CornerDownLeft className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={insertHr} title="Ligne horizontale"><Minus className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Tableau">
        <Btn onClick={insertTable} title="Insérer un tableau"><TableIcon className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Illustrations">
        <Btn onClick={insertImage} title="Insérer une image"><ImageIcon className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Liens">
        <Btn onClick={insertLink} title="Insérer un lien"><Link2 className="w-3.5 h-3.5" /></Btn>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Design
   ═══════════════════════════════════════════════════════════════════════ */
function TabDesign({ onApplyTheme, currentTheme, exec }: {
  onApplyTheme: (theme: typeof THEMES[0]) => void;
  currentTheme: string;
  exec: (cmd: string, val?: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Thèmes">
        <div className="flex gap-1">
          {THEMES.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => onApplyTheme(t)}
              title={t.name}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded border transition-all cursor-pointer
                ${currentTheme === t.name ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
            >
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
          {['#FFFFFF', '#F0F0F0', '#DCE6F4', '#E8D5B7', '#D5E8D4', '#F8CECC'].map(c => (
            <button
              key={c}
              type="button"
              title={c}
              className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform cursor-pointer"
              style={{ backgroundColor: c }}
              onClick={() => exec('backColor', c)}
            />
          ))}
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
}: {
  onSetMargins: (m: string) => void;
  onSetOrientation: (o: 'portrait' | 'landscape') => void;
  onSetColumns: (c: number) => void;
  currentMargins: string;
  currentOrientation: string;
}) {
  const [marginsOpen, setMarginsOpen] = useState(false);
  const [orientOpen, setOrientOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);

  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Marges">
        <div className="relative">
          <Btn onClick={() => setMarginsOpen(!marginsOpen)} title="Marges">
            <Move className="w-3.5 h-3.5" />
          </Btn>
          {marginsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMarginsOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-48">
                {MARGINS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => { onSetMargins(m.value); setMarginsOpen(false); }}
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2
                      ${currentMargins === m.value ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                  >
                    {currentMargins === m.value && <span className="text-blue-500">✓</span>}
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </Group>

      <Sep />

      <Group label="Orientation">
        <div className="relative">
          <Btn onClick={() => setOrientOpen(!orientOpen)} title="Orientation">
            <Columns className="w-3.5 h-3.5" />
          </Btn>
          {orientOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOrientOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-40">
                <button
                  type="button"
                  onClick={() => { onSetOrientation('portrait'); setOrientOpen(false); }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2
                    ${currentOrientation === 'portrait' ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                >
                  {currentOrientation === 'portrait' && <span className="text-blue-500">✓</span>}
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={() => { onSetOrientation('landscape'); setOrientOpen(false); }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2
                    ${currentOrientation === 'landscape' ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                >
                  {currentOrientation === 'landscape' && <span className="text-blue-500">✓</span>}
                  Paysage
                </button>
              </div>
            </>
          )}
        </div>
      </Group>

      <Sep />

      <Group label="Colonnes">
        <div className="relative">
          <Btn onClick={() => setColsOpen(!colsOpen)} title="Colonnes">
            <Columns className="w-3.5 h-3.5 rotate-90" />
          </Btn>
          {colsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColsOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-32">
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { onSetColumns(n); setColsOpen(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50"
                  >
                    {n} colonne{n > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </>
          )}
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
  onCheckSpelling, onSearchReplace,
}: {
  wordCount: number; charCount: number; paragraphCount: number; readingTime: string;
  onCheckSpelling: () => void; onSearchReplace: () => void;
}) {
  return (
    <div className="flex items-stretch gap-1 px-2 py-1.5 overflow-x-auto">
      <Group label="Vérification">
        <Btn onClick={onCheckSpelling} title="Vérification orthographique"><SpellCheck className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={onSearchReplace} title="Rechercher et remplacer"><Search className="w-3.5 h-3.5" /></Btn>
      </Group>

      <Sep />

      <Group label="Statistiques">
        <div className="flex items-center gap-3 px-2 text-[10px] text-gray-500">
          <span>Mots: <strong className="text-gray-700">{wordCount}</strong></span>
          <span>Caractères: <strong className="text-gray-700">{charCount}</strong></span>
          <span>Paragraphes: <strong className="text-gray-700">{paragraphCount}</strong></span>
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
  onSave: () => void;
  onPrint: () => void;
  onExportPDF: () => void;
  onExportDOCX: () => void;
  onRegenerate: () => void;
  readOnly: boolean;
  onSign: () => void;
  isSigned: boolean;
  onIACommand: (instruction: string) => void;
  isIaGenerating: boolean;
  onDictate: () => void;
  isDictating: boolean;
  onAnalyse?: () => void;
  onShowVersionHistory: () => void;
  /** Stats du document pour l'onglet Review */
  documentStats?: { words: number; chars: number; paragraphs: number; readingTime: string };
  /** Params layout pour les changements */
  layoutProps?: {
    margins: string;
    orientation: string;
    onSetMargins: (m: string) => void;
    onSetOrientation: (o: 'portrait' | 'landscape') => void;
    onSetColumns: (c: number) => void;
  };
  /** Thème design */
  designProps?: {
    currentTheme: string;
    onApplyTheme: (theme: typeof THEMES[0]) => void;
  };
}

export default function RapportRibbon({
  onExecCommand, onSave, onPrint, onExportPDF, onExportDOCX, onRegenerate,
  readOnly, onSign, isSigned, onIACommand, isIaGenerating,
  onDictate, isDictating, onAnalyse, onShowVersionHistory,
  documentStats, layoutProps, designProps,
}: RapportRibbonProps) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('accueil');
  const [iaPanelOpen, setIaPanelOpen] = useState(false);
  const [iaInstruction, setIaInstruction] = useState('');
  const [iaJustSent, setIaJustSent] = useState(false);

  const exec = (cmd: string, val?: string) => onExecCommand(cmd, val);

  const handleIA = () => {
    if (iaInstruction.trim() && !isIaGenerating) {
      setIaJustSent(true);
      onIACommand(iaInstruction);
    }
  };

  useEffect(() => {
    if (iaJustSent && !isIaGenerating) {
      const t = setTimeout(() => { setIaInstruction(''); setIaJustSent(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [iaJustSent, isIaGenerating]);

  const stats = documentStats || { words: 0, chars: 0, paragraphs: 0, readingTime: '0 min' };
  const defaultLayout = { margins: '25.4mm', orientation: 'portrait', onSetMargins: () => {}, onSetOrientation: () => {}, onSetColumns: () => {} };
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
      {/* ── Row 0: Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-gray-100 px-2 gap-0">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.key
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Quick actions (toujours visibles) */}
        <div className="flex items-center gap-1 pr-2">
          <button onClick={onSave} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]" title="Sauvegarder">
            <Save className="w-3 h-3" /> Sauvegarder
          </button>
          <button onClick={onExportPDF} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]" title="Exporter PDF">
            <Download className="w-3 h-3" /> PDF
          </button>
          <button onClick={onExportDOCX} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]" title="Exporter Word">
            <FileText className="w-3 h-3" /> Word
          </button>
          <button onClick={onPrint} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]" title="Imprimer">
            <Printer className="w-3 h-3" /> Imprimer
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {!readOnly && !isSigned && (
            <>
              <button onClick={onRegenerate} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]" title="Régénérer avec l'IA">
                <RefreshCw className="w-3 h-3" /> Régénérer
              </button>
              <button
                onClick={() => setIaPanelOpen(!iaPanelOpen)}
                className={`btn btn-sm px-2 py-0.5 gap-1 text-[10px] ${iaPanelOpen ? 'btn-primary' : ''}`}
                title="Assistant AERORISQ"
              >
                <Brain className="w-3 h-3" /> AERORISQ
              </button>
              <button
                onClick={onDictate}
                className={`btn btn-sm px-2 py-0.5 gap-1 text-[10px] ${isDictating ? 'bg-red-500 text-white' : ''}`}
                title="Dictée vocale"
              >
                {isDictating ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              </button>
              <button onClick={onShowVersionHistory} className="btn btn-sm px-2 py-0.5 gap-1 text-[10px]" title="Historique">
                <Clock className="w-3 h-3" />
              </button>
              <div className="w-px h-4 bg-gray-200 mx-1" />
            </>
          )}
          {!readOnly && !isSigned && (
            <button onClick={onSign} className="btn btn-sm px-3 py-1 btn-primary gap-1 text-[10px] font-medium">
              Signer le rapport
            </button>
          )}
          {isSigned && <span className="text-[10px] text-green-600 font-medium">✓ Signé</span>}
        </div>
      </div>

      {/* ── Row 1: Active tab content ────────────────────────────────── */}
      {activeTab === 'accueil' && (
        <TabAccueil exec={exec} currentFont="Calibri" currentSize="3" />
      )}
      {activeTab === 'inserer' && <TabInserer exec={exec} />}
      {activeTab === 'design' && <TabDesign onApplyTheme={design.onApplyTheme} currentTheme={design.currentTheme} exec={exec} />}
      {activeTab === 'layout' && (
        <TabLayout
          onSetMargins={layout.onSetMargins}
          onSetOrientation={layout.onSetOrientation}
          onSetColumns={layout.onSetColumns}
          currentMargins={layout.margins}
          currentOrientation={layout.orientation}
        />
      )}
      {activeTab === 'review' && (
        <TabReview
          wordCount={stats.words}
          charCount={stats.chars}
          paragraphCount={stats.paragraphs}
          readingTime={stats.readingTime}
          onCheckSpelling={() => { /* browser spellcheck is automatic */ }}
          onSearchReplace={() => { const q = prompt('Rechercher:'); if (q) { /* TODO: implement search */ void q; } }}
        />
      )}

      {/* ── IA Panel (expansible sous le ribbon) ─────────────────────── */}
      {iaPanelOpen && !readOnly && !isSigned && (
        <div className="border-t border-gray-100 px-3 py-2 bg-blue-50/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={iaInstruction}
              onChange={(e) => setIaInstruction(e.target.value)}
              placeholder="Ex: Améliore la conclusion, ajoute des recommandations..."
              className="flex-1 form-input text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleIA()}
            />
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
            {[
              { label: 'Résumé', cmd: 'Génère un résumé exécutif' },
              { label: 'Recommandations', cmd: 'Ajoute des recommandations' },
              { label: 'Conclusion', cmd: 'Rédige une conclusion' },
              { label: 'Analyser', cmd: 'Analyse les résultats' },
              { label: 'Reformuler', cmd: 'Reformule la conclusion de manière plus professionnelle' },
              { label: 'Développer', cmd: 'Développe et détaille l\'analyse des résultats' },
              { label: 'Raccourcir', cmd: 'Résume et rends plus concis le résumé exécutif' },
            ].map(p => (
              <button key={p.label} onClick={() => onIACommand(p.cmd)} className="btn btn-sm px-2 py-0.5 text-[10px]">
                {p.label}
              </button>
            ))}
            {onAnalyse && (
              <button onClick={onAnalyse} className="btn btn-sm px-2 py-0.5 text-[10px] bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200">
                Qualité
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { Loader2 };
