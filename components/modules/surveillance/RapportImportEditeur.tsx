'use client';

import React, { useRef, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Save, Eye, PenLine, Loader2, CheckCircle, AlertCircle, FileText,
} from 'lucide-react';
import TipTapSectionEditor, { getEditorHtml } from './TipTapSectionEditor';
import RapportImportApercu from './RapportImportApercu';

// Style fidélité Word — importé une seule fois, appliqué à tout le composant.
import '@/app/rapport-import-fidelity.css';

interface RapportImportEditeurProps {
  html: string;
  readOnly: boolean;
  onSave?: (html: string) => void;
}

/**
 * Éditeur pour un rapport importé depuis un .docx.
 *
 * Deux modes :
 *   • **Modifier** — TipTap dans un shell A4 fidèle Word (police Calibri, 11pt,
 *     interligne 1,15). La toolbar Word-like est intégrée.
 *   • **Aperçu**  — Paged.js rend de vraies pages A4 avec cadres, marges et
 *     pagination, comme un vrai Word.
 *
 * Le CSS `rapport-import-fidelity.css` (scopé `.import-mammoth`) garantit que
 * le rendu est identique dans les deux modes. Le mode redige standard n'est
 * jamais touché.
 */
export default function RapportImportEditeur({ html, readOnly, onSave }: RapportImportEditeurProps) {
  const tipTapRef = useRef<Editor | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = !readOnly;
  const content = draft ?? html;

  const handleSave = useCallback(async () => {
    const edHtml = tipTapRef.current ? getEditorHtml(tipTapRef.current) : '';
    const finalContent = edHtml || content;
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
    <div className="space-y-3 import-mammoth">
      {/* ── Header du mode import ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-border bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">Rapport importé</span>
            <span className="text-xs text-muted-foreground ml-2">
              {isEditing ? '— Mode édition' : '— Mode aperçu'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={() => {
                if (isEditing) {
                  // Sauvegarder le brouillon avant de basculer en aperçu
                  const cur = tipTapRef.current ? getEditorHtml(tipTapRef.current) : content;
                  setDraft(cur);
                }
                setIsEditing((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         bg-role-primary text-white hover:bg-role-primary/90 transition-colors shadow-sm"
            >
              {isEditing ? <Eye className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
              {isEditing ? 'Aperçu' : 'Modifier'}
            </button>
          )}
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm
                         disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Enregistrer
            </button>
          )}
        </div>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {saved && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          Rapport enregistré avec succès.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Contenu ────────────────────────────────────────────────────── */}
      {!content ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">Aucun contenu importé.</p>
        </div>
      ) : isEditing && canEdit ? (
        /* ─── Modifier : TipTap dans le shell A4 ────────────────────── */
        <div className="rapport-a4 import-mammoth shadow-lg" data-import-editor>
          <div className="p-0">
            <TipTapSectionEditor
              initialHtml={content}
              onGetEditor={(e) => { tipTapRef.current = e; }}
              toolbarClassName="import-mammoth-toolbar"
            />
          </div>
        </div>
      ) : (
        /* ─── Aperçu : Paged.js pagination A4 ────────────────────────── */
        <RapportImportApercu html={content} />
      )}
    </div>
  );
}
