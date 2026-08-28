// lib/ia/rag/rechercheWeb.ts
// Helper client pour la recherche web sur les autorités aviation (via la
// route serveur /api/ia/recherche-web). Fournit aussi le formateur de
// sources citables à injecter dans les prompts des agents IA.

import type { ResultatWebAutorite } from './whitelistAviation'

export interface ResultatRechercheWeb {
  results: ResultatWebAutorite[]
  notPresent?: boolean
}

/**
 * Lance une recherche web restreinte aux autorités aviation reconnues.
 * Retourne [] en cas d'échec (ne bloque jamais l'IA).
 */
export async function rechercherAutorite(q: string, opts?: { max?: number; sites?: string[] }): Promise<ResultatWebAutorite[]> {
  try {
    const res = await fetch('/api/ia/recherche-web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, max: opts?.max ?? 4, sites: opts?.sites }),
      signal: AbortSignal.timeout(16000),
    })
    if (!res.ok) return []
    const data: ResultatRechercheWeb = await res.json()
    return data.results || []
  } catch {
    return []
  }
}

/**
 * Formate les sources web d'autorités en bloc de contexte injectable,
 * avec URL et source pour vérification et anti-fabrication.
 */
export function formaterSourcesWeb(resultats: ResultatWebAutorite[], max: number = 4): string {
  if (!resultats || resultats.length === 0) return ''
  const retenus = resultats.slice(0, max)
  const lignes = retenus.map((r, i) => {
    const extrait = r.extrait ? ` — ${r.extrait.slice(0, 220)}` : ''
    return `${i + 1}. [${r.source}] ${r.titre}${extrait}\n   Source : ${r.url}`
  })
  return [
    '',
    '## SOURCES WEB D\'AUTORITÉS AVIATION (recherche en ligne)',
    'Ces références proviennent de sites officiels reconnus (OACI, EASA, FAA, DGAC, IATA, ACI, ANACIM, ASECNA, ANAC...).',
    'Utilise-les uniquement si pertinent et cite la source (URL) correspondante. Ne les invente pas si tu ne les as pas.',
    lignes.join('\n'),
  ].join('\n')
}
