'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import type { AnyExtension } from '@tiptap/core';
import FontSize from 'tiptap-extension-font-size';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, Heading1, Heading2, Heading3, Pilcrow,
  Highlighter, Palette, Paintbrush, Table as TableIcon,
  ChevronDown, Type, Eraser, Baseline,
} from 'lucide-react';
import { setActiveTipTapEditor } from '@/lib/tipTapActiveEditor';

interface TipTapSectionEditorProps {
  initialHtml: string;
  onGetEditor?: (editor: Editor | null) => void;
  className?: string;
  /** Nom de la classe CSS sur le conteneur externe (ex: import-mammoth-toolbar). */
  toolbarClassName?: string;
}

/* ── Fonts dispo ────────────────────────────────────────────────────── */
const FONT_FAMILIES = [
  'Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana',
  'Trebuchet MS', 'Tahoma', 'Comic Sans MS', 'Courier New',
  'Cambria', 'Garamond',
];

const FONT_SIZES = [
  { label: '8', value: '8pt' },
  { label: '9', value: '9pt' },
  { label: '10', value: '10pt' },
  { label: '10.5', value: '10.5pt' },
  { label: '11', value: '11pt' },
  { label: '12', value: '12pt' },
  { label: '14', value: '14pt' },
  { label: '16', value: '16pt' },
  { label: '18', value: '18pt' },
  { label: '20', value: '20pt' },
  { label: '24', value: '24pt' },
  { label: '28', value: '28pt' },
  { label: '36', value: '36pt' },
  { label: '48', value: '48pt' },
  { label: '72', value: '72pt' },
];

/* ── Dropdown générique ─────────────────────────────────────────────── */
function Dropdown({
  value, options, onChange, title, className,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  title: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      className={`h-7 min-w-[44px] rounded border border-border bg-white px-1 text-[10px] leading-tight text-foreground hover:border-role-primary focus:border-role-primary focus:outline-none ${className ?? ''}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/* ── Bouton icône unique ────────────────────────────────────────────── */
function Btn({
  active, onClick, title, children, disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-foreground
        hover:bg-role-primary/10
        ${active ? 'bg-role-primary/15 text-role-primary shadow-inner' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}

/* ── Séparateur vertical ────────────────────────────────────────────── */
function Sep() {
  return <div className="w-px h-5 bg-border mx-1 shrink-0" />;
}

/* ── Groupe avec étiquette ──────────────────────────────────────────── */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/* ── Color picker natif ─────────────────────────────────────────────── */
function ColorButton({
  color, onChange, title, icon: Icon,
}: {
  color: string;
  onChange: (c: string) => void;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); ref.current?.click(); }}
      title={title}
      className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-role-primary/10 cursor-pointer relative group"
    >
      <Icon className="w-3.5 h-3.5" />
      <span
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-3.5 rounded-sm"
        style={{ backgroundColor: color || '#000' }}
      />
      <input
        ref={ref}
        type="color"
        value={color || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Toolbar Ribbon Word-like
   ═══════════════════════════════════════════════════════════════════════ */
function Toolbar({ editor }: { editor: Editor | null }) {
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('#FFFF00');

  if (!editor) return null;

  const getCurrentFont = () => {
    const attrs = editor.getAttributes('textStyle');
    return (attrs.fontFamily as string) || 'Calibri';
  };

  const getCurrentSize = () => {
    const attrs = editor.getAttributes('textStyle');
    return (attrs.fontSize as string) || '11pt';
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-gradient-to-b from-gray-50 to-white flex-wrap import-mammoth-toolbar"
         style={{ minHeight: 36 }}>

      {/* ─── Police ──────────────────────────────────────────────────── */}
      <Group label="Police">
        <Dropdown
          value={getCurrentFont()}
          options={FONT_FAMILIES.map(f => ({ label: f, value: f }))}
          onChange={(v) => editor.chain().focus().setFontFamily(v).run()}
          title="Police"
          className="w-[110px]"
        />
        <Dropdown
          value={getCurrentSize()}
          options={FONT_SIZES}
          onChange={(v) => editor.chain().focus().setFontSize(v).run()}
          title="Taille"
          className="w-[48px]"
        />
      </Group>

      <Sep />

      {/* ─── Formatage texte ────────────────────────────────────────── */}
      <Group label="Formatage">
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Gras (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" strokeWidth={2.5} />
        </Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italique (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Souligné (Ctrl+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Barré">
          <Strikethrough className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Surligner">
          <Highlighter className="w-3.5 h-3.5" />
        </Btn>
      </Group>

      <Sep />

      {/* ─── Couleurs ───────────────────────────────────────────────── */}
      <Group label="Couleurs">
        <ColorButton
          color={textColor}
          onChange={(c) => { setTextColor(c); editor.chain().focus().setColor(c).run(); }}
          title="Couleur du texte"
          icon={Baseline}
        />
        <ColorButton
          color={highlightColor}
          onChange={(c) => { setHighlightColor(c); editor.chain().focus().setHighlight({ color: c }).run(); }}
          title="Couleur de surlignage"
          icon={Paintbrush}
        />
      </Group>

      <Sep />

      {/* ─── Paragraphe ─────────────────────────────────────────────── */}
      <Group label="Paragraphe">
        <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Aligner à gauche">
          <AlignLeft className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centrer">
          <AlignCenter className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Aligner à droite">
          <AlignRight className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justifier">
          <AlignJustify className="w-3.5 h-3.5" />
        </Btn>
      </Group>

      <Sep />

      {/* ─── Listes ─────────────────────────────────────────────────── */}
      <Group label="Listes">
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste à puces">
          <List className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Liste numérotée">
          <ListOrdered className="w-3.5 h-3.5" />
        </Btn>
      </Group>

      <Sep />

      {/* ─── Titres ─────────────────────────────────────────────────── */}
      <Group label="Titres">
        <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Titre 1">
          <Heading1 className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Titre 2">
          <Heading2 className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Titre 3">
          <Heading3 className="w-3.5 h-3.5" />
        </Btn>
        <Btn active={editor.isActive('paragraph') && !editor.isActive('heading')} onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraphe normal">
          <Pilcrow className="w-3.5 h-3.5" />
        </Btn>
      </Group>

      <Sep />

      {/* ─── Tableau ────────────────────────────────────────────────── */}
      <Group label="Insérer">
        <Btn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insérer un tableau"
        >
          <TableIcon className="w-3.5 h-3.5" />
        </Btn>
      </Group>

      <Sep />

      {/* ─── Annuler / Rétablir ─────────────────────────────────────── */}
      <Group label="Historique">
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Annuler (Ctrl+Z)" disabled={!editor.can().undo()}>
          <Undo2 className="w-3.5 h-3.5" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Rétablir (Ctrl+Y)" disabled={!editor.can().redo()}>
          <Redo2 className="w-3.5 h-3.5" />
        </Btn>
      </Group>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Éditeur riche TipTap
   ═══════════════════════════════════════════════════════════════════════ */
export default function TipTapSectionEditor({ initialHtml, onGetEditor, className, toolbarClassName }: TipTapSectionEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      FontSize as unknown as AnyExtension,
      Color,
      FontFamily,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: 'rapport-text-editable min-h-[120px] focus:outline-none',
      },
      handleDOMEvents: {
        focus: () => {
          setActiveTipTapEditor(editor);
          return false;
        },
        blur: () => {
          setActiveTipTapEditor(null);
          return false;
        },
      },
    },
    onDestroy: () => {
      setActiveTipTapEditor(null);
    },
  });

  useEffect(() => {
    onGetEditor?.(editor);
    return () => onGetEditor?.(null);
  }, [editor, onGetEditor]);

  return (
    <div className={`rounded-xl border border-border bg-white overflow-hidden shadow-sm ${className ?? ''}`}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="max-h-[75vh] overflow-y-auto" />
    </div>
  );
}

export function getEditorHtml(editor: Editor | null): string {
  return editor?.getHTML() ?? '';
}
