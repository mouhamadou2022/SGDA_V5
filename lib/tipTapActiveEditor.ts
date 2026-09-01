'use client';

import type { Editor } from '@tiptap/react';

// Registre de l'éditeur TipTap actuellement actif (celui qui a le focus).
// Permet à la barre d'outils globale (Row 2) d'agir sur la section en cours
// d'édition, au lieu de dépendre de document.execCommand.
let activeEditor: Editor | null = null;

export function setActiveTipTapEditor(editor: Editor | null) {
  activeEditor = editor;
}

export function getActiveTipTapEditor(): Editor | null {
  return activeEditor;
}

// Traduit les commandes « execCommand » (utilisées par la barre d'outils globale
// Row 2) en commandes TipTap, exécutées sur l'éditeur actif.
// Retourne true si la commande a été prise en charge par TipTap.
export function execCommandForActiveEditor(cmd: string, value?: string): boolean {
  const editor = activeEditor;
  if (!editor) return false;
  const chain = editor.chain().focus();

  switch (cmd) {
    case 'undo': chain.undo().run(); return true;
    case 'redo': chain.redo().run(); return true;
    case 'bold': chain.toggleBold().run(); return true;
    case 'italic': chain.toggleItalic().run(); return true;
    case 'underline': chain.toggleUnderline().run(); return true;
    case 'strikeThrough': chain.toggleStrike().run(); return true;
    case 'hiliteColor':
      if (value) editor.chain().focus().setHighlight({ color: value }).run();
      else editor.chain().focus().unsetHighlight().run();
      return true;
    case 'foreColor':
      chain.setColor(value || '').run();
      return true;
    case 'formatBlock':
      if (value === '<h1>') chain.toggleHeading({ level: 1 }).run();
      else if (value === '<h2>') chain.toggleHeading({ level: 2 }).run();
      else if (value === '<h3>') chain.toggleHeading({ level: 3 }).run();
      else chain.setParagraph().run();
      return true;
    case 'insertUnorderedList': chain.toggleBulletList().run(); return true;
    case 'insertOrderedList': chain.toggleOrderedList().run(); return true;
    case 'justifyLeft': chain.setTextAlign('left').run(); return true;
    case 'justifyCenter': chain.setTextAlign('center').run(); return true;
    case 'justifyRight': chain.setTextAlign('right').run(); return true;
    case 'justifyFull': chain.setTextAlign('justify').run(); return true;
    case 'removeFormat': chain.unsetAllMarks().clearNodes().run(); return true;
    case 'createLink':
      if (value) {
        const ed = editor;
        const { from, to } = ed.state.selection;
        const text = ed.state.doc.textBetween(from, to, ' ');
        ed.chain().focus().extendMarkRange('link')
          .insertContent({ type: 'text', marks: [{ type: 'link', attrs: { href: value } }], text: text || value })
          .run();
      }
      return true;
    case 'insertHTML':
      if (value) editor.chain().focus().insertContent(value).run();
      return true;
    case 'fontName':
      if (value) editor.chain().focus().setFontFamily(value).run();
      return true;
    default:
      return false;
  }
}
