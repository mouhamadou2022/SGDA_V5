'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Download, Printer } from 'lucide-react';

// CSS spécifique à Paged.js (pagination A4) — le CSS de fidélité Word est
// importé dans RapportImportEditeur et s'applique automatiquement.
const PAGED_CSS = `
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }

  /* ── Container extérieur (hors pages) ──────────────────────────────── */
  body { margin: 0; padding: 0; background: #e5e7eb; }

  /* ── Pages Paged.js ────────────────────────────────────────────────── */
  .pagedjs_page {
    position: relative;
    margin: 16px auto;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08);
    background: white;
    page-break-after: always;
  }

  .pagedjs_page:last-child {
    page-break-after: auto;
  }

  /* Cadre de bordure double style Word autour de chaque page */
  .pagedjs_page::before {
    content: "";
    position: absolute;
    top: 10mm; right: 10mm; bottom: 10mm; left: 10mm;
    border: 2.5px double #1a3a6b;
    pointer-events: none;
    z-index: 1;
  }

  /* Zone de contenu de la page */
  .pagedjs_page_content {
    position: relative;
    z-index: 2;
  }

  /* ── En-tête de page ───────────────────────────────────────────────── */
  .pagedjs_page_top {
    position: absolute;
    top: 6mm; left: 15mm; right: 15mm;
    text-align: center;
    font-family: Calibri, 'Segoe UI', Arial, sans-serif;
    font-size: 8pt;
    color: #666;
    border-bottom: 0.5pt solid #ccc;
    padding-bottom: 2mm;
    z-index: 3;
  }

  /* ── Pied de page ──────────────────────────────────────────────────── */
  .pagedjs_page_bottom {
    position: absolute;
    bottom: 6mm; left: 15mm; right: 15mm;
    text-align: center;
    font-family: Calibri, 'Segoe UI', Arial, sans-serif;
    font-size: 8pt;
    color: #666;
    border-top: 0.5pt solid #ccc;
    padding-top: 2mm;
    z-index: 3;
  }

  .pagedjs_page_bottom .pagedjs_page_number {
    font-weight: 600;
    color: #333;
  }

  /* ── Séparation entre pages ────────────────────────────────────────── */
  .pagedjs_pages {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
`;

interface RapportImportApercuProps {
  html: string;
}

/**
 * Aperçu « façon Word » : vraie pagination A4 via Paged.js.
 *
 * • Chaque page a un cadre de bordure double (style Word), des marges réelles,
 *   un en-tête et un pied de page.
 * • Le CSS de fidélité (rapport-import-fidelity.css) s'applique automatiquement
 *   via le CSS global importé dans le parent.
 */
export default function RapportImportApercu({ html }: RapportImportApercuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

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
        const content = `<div class="import-mammoth rapport-a4"><div class="rapport-content">${html}</div></div>`;
        await previewer.preview(
          content,
          [PAGED_CSS],
          containerRef.current,
        );

        if (!cancelled) {
          const pages = containerRef.current.querySelectorAll('.pagedjs_page');
          setPageCount(pages.length);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Échec de l'aperçu Paged.js");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [html]);

  return (
    <div className="space-y-3">
      {/* Header aperçu */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">Aperçu Word</span>
            {!loading && pageCount > 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                {pageCount} page{pageCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {!loading && pageCount > 0 && (
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       border border-border bg-white hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimer / PDF
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && html && (
        <div className="rounded-xl border border-border bg-white px-4 py-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Génération de l&apos;aperçu…
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pages */}
      <div ref={containerRef} className="rapport-apercu-paged" />
    </div>
  );
}
