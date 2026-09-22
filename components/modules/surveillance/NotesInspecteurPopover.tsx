// components/modules/surveillance/NotesInspecteurPopover.tsx
// Extrait de SurveillanceEcartsRedaction (comportement identique).
'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// COMPOSANT: NotesInspecteurPopover — popover au clic (portal)
// ─────────────────────────────────────────────────────────────
export function NotesInspecteurPopover({ texte }: { texte: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openPopover = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ top: r.top, left: r.left });
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); openPopover(); }}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-role-primary hover:bg-role-primary-soft hover:text-role-primary rounded px-1 py-0.5 -ml-1 transition-colors"
        title="Voir les notes de l'inspecteur"
      >
        <StickyNote className="w-3.5 h-3.5" />
        Notes inspecteur
      </button>
      {open && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1999]" onClick={() => setOpen(false)}>
          <div
            className="role-tooltip"
            style={{ top: pos.top - 8, left: Math.min(pos.left, window.innerWidth - 360) }}
            onClick={(e) => e.stopPropagation()}
          >
            {texte}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-role-primary text-white text-xs flex items-center justify-center shadow"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
