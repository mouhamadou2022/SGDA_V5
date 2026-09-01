'use client';

import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
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
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Heading1, Heading2, Heading3, Pilcrow,
} from 'lucide-react';
import { setActiveTipTapEditor } from '@/lib/tipTapActiveEditor';

interface TipTapSectionEditorProps {
  initialHtml: string;
  onGetEditor?: (editor: Editor | null) => void;
  className?: string;
}

// Composant interne : barre d'outils de formatage liée à un éditeur TipTap.
function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (cmd: () => void, active: boolean, children: React.ReactNode, title: string) => (
    <button
      onMouseDown={(e) => { e.preventDefault(); cmd(); }}
      className={`action-button p-1 ${active ? 'bg-primary/10 text-primary' : ''}`}
      title={title}
    >
      {children}
    </button>
  );

  const sep = <div className="w-px h-4 bg-border mx-0.5" />;

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-gray-50 flex-wrap rounded-t-xl">
      {btn(() => editor.chain().focus().toggleBold().run(), editor.isActive('bold'),
        <Bold className="w-3 h-3" />, 'Gras')}
      {btn(() => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'),
        <Italic className="w-3 h-3" />, 'Italique')}
      {btn(() => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'),
        <UnderlineIcon className="w-3 h-3" />, 'Souligné')}
      {btn(() => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'),
        <Strikethrough className="w-3 h-3" />, 'Barré')}
      {btn(() => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'),
        <span className="text-[10px] font-bold">Surl</span>, 'Surligner')}
      {sep}
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }),
        <Heading1 className="w-3 h-3" />, 'Titre 1')}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }),
        <Heading2 className="w-3 h-3" />, 'Titre 2')}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }),
        <Heading3 className="w-3 h-3" />, 'Titre 3')}
      {btn(() => editor.chain().focus().setParagraph().run(), editor.isActive('paragraph') && !editor.isActive('heading'),
        <Pilcrow className="w-3 h-3" />, 'Paragraphe')}
      {sep}
      {btn(() => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'),
        <List className="w-3 h-3" />, 'Liste à puces')}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'),
        <ListOrdered className="w-3 h-3" />, 'Liste numérotée')}
      {sep}
      {btn(() => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }),
        <AlignLeft className="w-3 h-3" />, 'Aligner gauche')}
      {btn(() => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }),
        <AlignCenter className="w-3 h-3" />, 'Centrer')}
      {btn(() => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }),
        <AlignRight className="w-3 h-3" />, 'Aligner droite')}
      {sep}
      {btn(() => editor.chain().focus().undo().run(), false,
        <Undo2 className="w-3 h-3" />, 'Annuler')}
      {btn(() => editor.chain().focus().redo().run(), false,
        <Redo2 className="w-3 h-3" />, 'Rétablir')}
    </div>
  );
}

// Éditeur riche TipTap pour une section de rapport.
// Props :
//   initialHtml  — le HTML initial (contenu de la section).
//   onGetEditor  — callback optionnel exposant l'instance editor (pour l'IA, sélection, etc.).
//   className    — classes CSS supplémentaires sur le conteneur.
// La classe CSS 'rapport-text-editable' est appliquée sur le conteneur pour rester
// cohérent avec le style document existant.
export default function TipTapSectionEditor({ initialHtml, onGetEditor, className }: TipTapSectionEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      TextStyle,
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
        class: 'rapport-text-editable min-h-[120px] focus:outline-none px-4 py-3',
      },
      // À la prise de focus, on déclare cet éditeur comme l'éditeur actif
      // afin que la barre d'outils globale (Row 2) puisse le piloter.
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

  // Expose l'instance editor au parent (utile pour le panneau IA / sélection).
  useEffect(() => {
    onGetEditor?.(editor);
    return () => onGetEditor?.(null);
  }, [editor, onGetEditor]);

  return (
    <div className={`rounded-xl border border-border bg-white overflow-hidden ${className ?? ''}`}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

// Utilitaire : récupérer le HTML de l'éditeur (à appeler depuis le parent via ref).
export function getEditorHtml(editor: Editor | null): string {
  return editor?.getHTML() ?? '';
}
