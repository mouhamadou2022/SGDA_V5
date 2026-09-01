'use client';

import React, { useRef, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Save, Eye, PenLine, Loader2, CheckCircle, AlertCircle,
} from 'lucide-react';
import TipTapSectionEditor, { getEditorHtml } from './TipTapSectionEditor';
import RapportImportApercu from './RapportImportApercu';

interface RapportImportEditeurProps {
  html: string;
  readOnly: boolean;
  onSave?: (html: string) => void;
}

// Éditeur libre pour un rapport importé (structure / mise en forme quelconques).
//
// Deux modes, conformément à l'architecture validée (éditeurs sérieux sur TipTap) :
//   • Modifier — flux continu TipTap dans le shell A4 (.rapport-a4), pas d'illusion
//     de pages : c'est là qu'on tape/formate librement.
//   • Aperçu   — rendu Paged.js, vraie pagination A4 fidèle à l'export (marges,
//     ombre, espace entre pages), discutée côté Word.
// Le contenu importé est scopé à `.import-mammoth` ; le mode redige n'est jamais touché.
export default function RapportImportEditeur({ html, readOnly, onSave }: RapportImportEditeurProps) {
  const tipTapRef = useRef<Editor | null>(null);
  // Brouillon local : conserve les modifications tant que non enregistrées,
  // et se ré-synchronise quand la prop html change (après un save).
  const [draft, setDraft] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = !readOnly;
  const content = draft ?? html;

  const handleSave = useCallback(async () => {
    const edHtml = tipTapRef.current ? getEditorHtml(tipTapRef.current) : '';
    const editorEl = document.querySelector('[data-import-editor] [contenteditable="true"]');
    const finalContent = edHtml || (editorEl?.innerHTML ?? content);
    if (!onSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(finalContent);
      setDraft(null);
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Impossible d'enregistrer le rapport. Réessayez.");
    } finally {
      setSaving(false);
    }
  }, [onSave, content]);

  return (
    <div className="space-y-3">
      {/* Barre d'action : édition / aperçu / enregistrement */}
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-border bg-white px-3 py-2">
        <div className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Eye className="h-4 w-4 text-role-primary" />
          Rapport importé
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={() => {
                const cur = tipTapRef.current ? getEditorHtml(tipTapRef.current) : content;
                setDraft(cur);
                setIsEditing((v) => !v);
              }}
              className="btn btn-sm btn-primary gap-1"
            >
              {isEditing ? <Eye className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              {isEditing ? 'Aperçu' : 'Modifier'}
            </button>
          )}
          {isEditing && (
            <button onClick={handleSave} disabled={saving} className="btn btn-sm btn-success gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </button>
          )}
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-xs text-success">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          Rapport enregistré.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {!content ? (
        <div className="rounded-xl border border-border bg-white p-6 text-sm text-muted">
          Aucun contenu importé.
        </div>
      ) : isEditing && canEdit ? (
        // Modifier : flux continu TipTap dans le shell A4.
        <div className="rapport-a4 import-mammoth" data-import-editor>
          <div className="rapport-content">
            <TipTapSectionEditor
              initialHtml={content}
              onGetEditor={(e) => { tipTapRef.current = e; }}
            />
          </div>
        </div>
      ) : (
        // Aperçu : vraie pagination Paged.js, fidèle à l'export Word.
        <RapportImportApercu html={content} />
      )}
    </div>
  );
}
