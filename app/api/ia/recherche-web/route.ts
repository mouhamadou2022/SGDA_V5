// app/api/ia/recherche-web/route.ts
// Recherche web sur les sites des autorités aviation — endpoint serveur.
// Interroge DuckDuckGo (HTML, gratuit, sans clé), filtre strictement les
// résultats sur la liste blanche des autorités reconnues (OACI, EASA, FAA,
// DGAC, IATA, ACI, ANACIM, ASECNA, ANAC...), et renvoie les extraits citables.
// L'appel s'exécute côté serveur (pas de CORS, données protégées).

import { NextResponse } from 'next/server'
import {
  estAutoriteAviation,
  autoritePourHostname,
  type ResultatWebAutorite,
} from '@/lib/ia/rag/whitelistAviation'

export const maxDuration = 30

export interface RequeteRechercheWeb {
  q: string
  max?: number
  sites?: string[]
}

const DDG_URL = 'https://html.duckduckgo.com/html/'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

function decodageURL(uddgRaw: string): string | null {
  // l'URL cible est dans : //duckduckgo.com/l/?uddg=<urlencoded>&rut=...
  const m = uddgRaw.match(/[?&]uddg=([^&]+)/)
  if (!m) return null
  try {
    const decoded = decodeURIComponent(m[1].replace(/\+/g, ' '))
    return decoded.startsWith('http') ? decoded : null
  } catch {
    return null
  }
}

function extraireHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

async function rechercheDuckDuckGo(queries: string[]): Promise<ResultatWebAutorite[]> {
  const vus = new Set<string>()
  const resultats: ResultatWebAutorite[] = []

  for (const q of queries) {
    try {
      const url = `${DDG_URL}?q=${encodeURIComponent(q)}`
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) continue
      const html = await res.text()
      if (!html || html.length < 500) continue

      // Séparer chaque bloc de résultat (évite de matcher <div class="results">)
      const blocs = html.split(/<div class="result[ \"]/g)
      for (const bloc of blocs) {
        try {
          const a = bloc.match(/class="result__a"[^>]*href="([^"]+)"/)
          if (!a) continue
          const urlCible = decodageURL(a[1])
          if (!urlCible) continue

          const host = extraireHostname(urlCible)
          if (!estAutoriteAviation(host)) continue

          const titreMatch = bloc.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
          const titre = titreMatch
            ? titreMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
            : urlCible

          const snippetMatch = bloc.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
          const extrait = snippetMatch
            ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\u00e0/g, 'à').trim()
            : ''

          if (vus.has(urlCible)) continue
          vus.add(urlCible)

          resultats.push({
            titre,
            url: urlCible,
            extrait,
            source: autoritePourHostname(host) || host,
          })
        } catch {
          /* ignore un bloc malformé */
        }
      }
    } catch {
      /* échec d'une requête → on continue avec les autres */
    }
  }

  return resultats
}

export async function POST(request: Request) {
  try {
    const body: RequeteRechercheWeb = await request.json()
    const q = (body.q || '').trim()
    const max = Math.min(Number(body.max) || 5, 10)
    if (!q) {
      return NextResponse.json({ error: 'requête manquante' }, { status: 400 })
    }

    const sites = body.sites && body.sites.length > 0 ? body.sites : []
    const libelleSite = sites.length > 0 ? sites.join(' OR ') : ''
    // Deux requêtes : une ciblant les site: demandés, une sur les termes généraux
    // (les résultats sont ensuite filtrés sur la liste blanche des autorités).
    const queries: string[] = []
    if (libelleSite) queries.push(`${q} ${libelleSite}`)
    queries.push(q)

    const resultats = await rechercheDuckDuckGo(queries)
    if (resultats.length === 0) {
      return NextResponse.json({ results: [], notPresent: true })
    }
    return NextResponse.json({ results: resultats.slice(0, max) })
  } catch (error) {
    console.error('[/api/ia/recherche-web]', error)
    return NextResponse.json(
      { error: (error as Error).message || 'recherche échouée', results: [] },
      { status: 500 }
    )
  }
}
