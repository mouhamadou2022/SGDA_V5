// lib/workflow/extractionEcarts.ts — Logique pure du workflow (saga)
// Extraction des écarts rédigés depuis le HTML du rapport signé.
// Déplacé verbatim depuis lib/store/workflowSlice.ts : aucun changement
// de comportement, uniquement testable isolément (DOM + repli regex).

import type { Surveillance } from '../store/surveillancesSlice';
import type { Ecart } from '../store';
import type { EcartRedaction } from '../store/ecartsRedactionSlice';

export function stripHtmlToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeEcartNiveau(value: string): Ecart['niveau_risque'] {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (normalized.includes('critique')) return 'critique'
  if (normalized.includes('eleve')) return 'eleve'
  if (normalized.includes('faible')) return 'faible'
  return 'moyen'
}

export function extractEcartsFromRapportHtml(surveillance: Surveillance): Partial<EcartRedaction>[] {
  const html = surveillance.rapport_html
  if (!html) return []

  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const annexeTitle = Array.from(document.querySelectorAll('h3'))
      .find(h => h.textContent?.toLowerCase().includes('écarts constatés'))
    const table = annexeTitle?.nextElementSibling?.tagName === 'TABLE'
      ? annexeTitle.nextElementSibling
      : annexeTitle?.parentElement?.querySelector('table')

    return Array.from(table?.querySelectorAll('tbody tr') || [])
      .map((row, index) => {
        const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '')
        if (cells.length < 4 || cells.join(' ').toLowerCase().includes('aucun écart constaté')) return null
        return {
          id: `rapport-${surveillance.id}-${index}`,
          reference: cells[0],
          ref_reglementaire: cells[1],
          libelle: cells[2],
          niveau: normalizeEcartNiveau(cells[3]),
          surveillance_id: surveillance.id,
          aerodrome_id: surveillance.aerodrome_id,
          domaine: surveillance.portee?.[0] || 'SGS',
          created_at: surveillance.transmitted_at || surveillance.updated_at || new Date().toISOString(),
        }
      })
      .filter((ecart): ecart is Exclude<typeof ecart, null> => !!ecart && !!ecart.reference && !!ecart.libelle)
  }

  const annexeMatch = html.match(/Annexe A-2[\s\S]*?(?:<h3>|$)/i)
  const annexeHtml = annexeMatch?.[0] || ''
  const rows = Array.from(annexeHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi))

  return rows
    .map((row, index) => {
      const cells = Array.from(row[0].matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi))
        .map(cell => stripHtmlToText(cell[1]))
      if (cells.length < 4 || cells.join(' ').toLowerCase().includes('aucun écart constaté')) return null
      return {
        id: `rapport-${surveillance.id}-${index}`,
        reference: cells[0],
        ref_reglementaire: cells[1],
        libelle: cells[2],
        niveau: normalizeEcartNiveau(cells[3]),
        surveillance_id: surveillance.id,
        aerodrome_id: surveillance.aerodrome_id,
        domaine: surveillance.portee?.[0] || 'SGS',
        created_at: surveillance.transmitted_at || surveillance.updated_at || new Date().toISOString(),
      }
    })
    .filter((ecart): ecart is Exclude<typeof ecart, null> => !!ecart && !!ecart.reference && !!ecart.libelle)
}
