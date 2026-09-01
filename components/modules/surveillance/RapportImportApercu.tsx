'use client';

import React, { useEffect, useRef, useState } from 'react';

// Style co-localisé (scopé à .import-mammoth) pour le rendu « façon Word ».
// On ne modifie PAS les règles partagées .rapport-a4/.rapport-content : cette
// feuille ne s'applique qu'au contenu importé, le mode redige reste intact.
const IMPORT_MAMMOTH_CSS = `
  @page { size: A4; margin: 20mm 15mm; }
  .import-mammoth p { margin: 0 0 8pt 0; line-height: 1.15; text-align: justify; }
  .import-mammoth h2 { page-break-after: avoid; }
  .import-mammoth h3 { page-break-after: avoid; }
  .import-mammoth table { border-collapse: collapse; width: 100%; }
  .import-mammoth td, .import-mammoth th {
    border: 1px solid #000; padding: 4px 8px; text-align: left; vertical-align: top;
  }
  .import-mammoth tr, .import-mammoth img, .import-mammoth figure { break-inside: avoid; page-break-inside: avoid; }
  .import-mammoth table { break-inside: auto; }
  /* Encadrés / callouts à liseré bleu */
  .import-mammoth p.rapport-callout, .import-mammoth .rapport-callout {
    border-left: 4px solid #1e5fa8; background: #eef4fb; padding: 8px 12px; margin: 8pt 0;
  }
  /* Titres de section avec barre latérale */
  .import-mammoth h2.rapport-section-accent {
    border-left: 6px solid #1e5fa8; border-bottom: 1px solid #1e5fa8;
    padding: 4px 0 4px 8px; color: #1a3a6b;
  }
  /* Tableaux à cellules colorées */
  .import-mammoth table.rapport-table-colored th { background: #dce6f4; }
  .import-mammoth table.rapport-table-colored td { background: #ffffff; }
`;

// Cadre de page : on recrée la bordure double Word autour de chaque page A4.
const PAGE_BORDER_CSS = `
  .pagedjs_page { position: relative; }
  .pagedjs_page::before {
    content: "";
    position: absolute; top: 8mm; right: 8mm; bottom: 8mm; left: 8mm;
    border: 3px double #1a3a6b;
    pointer-events: none;
  }
`;

interface RapportImportApercuProps {
  html: string;
}

// Aperçu « façon Word » : vraie pagination A4 via Paged.js, en lecture seule.
// Réutilise les règles @page / break-inside (une source de vérité), scopées au
// contenu importé — le mode redige standard n'est jamais touché.
export default function RapportImportApercu({ html }: RapportImportApercuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || !html) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { Previewer } = await import('pagedjs');
        if (cancelled || !containerRef.current) return;

        const previewer = new Previewer();
        const content = `<div class="rapport-a4 import-mammoth"><div class="rapport-content">${html}</div></div>`;
        // Previewer.preview(content, stylesheets, renderTo) : remplit target
        // avec un empilement de vraies pages A4 (marges, ombre, séparation).
        await previewer.preview(
          content,
          [IMPORT_MAMMOTH_CSS, PAGE_BORDER_CSS],
          containerRef.current,
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Échec de l'aperçu Paged.js");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Nettoyage : on vide le conteneur quand le HTML change.
    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [html]);

  return (
    <div className="space-y-3">
      {loading && html && (
        <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted">
          Génération de l&apos;aperçu…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div ref={containerRef} className="rapport-apercu-paged" />
    </div>
  );
}
