// lib/ia/ourAirports.ts — Base OurAirports côté serveur (jamais 30 Mo côté navigateur).
import { retirerDiacritiques } from '../domaines';
// Matching pur et testé : code exact, nom/municipalité insensible aux accents,
// départagé par proximité, rayon progressif. Le formulaire appelle la route
// /api/ia/aerodromes-ourairports (pas de CORS, pas de téléchargement client).

export interface OurAirportsRecord {
  oaci: string
  type: string
  nom: string
  municipality: string
  region_iso: string
  latitude: number | null
  longitude: number | null
  altitude: number | null
}

/** Préfixes OACI Afrique de l'Ouest (même filtre que le formulaire). */
export const WEST_AFRICA_ICAO = /^(DB|DG|DI|DN|DR|DX|GA|GB|GG|GL|GO|GU|GV|GX)/i

/** Minuscules + sans accents pour comparer les noms. */
export function normaliserNom(texte: string): string {
  return retirerDiacritiques((texte || '').toLowerCase())
}

function decouperCsv(ligne: string): string[] {
  const cols: string[] = []
  let champ = ''
  let guillemets = false
  for (const c of ligne) {
    if (c === '"') { guillemets = !guillemets; continue }
    if (c === ',' && !guillemets) { cols.push(champ); champ = ''; continue }
    champ += c
  }
  cols.push(champ)
  return cols.map(s => s.trim())
}

/** Parse le CSV OurAirports (id,ident,type,name,lat,lon,…,elev,…,iso_region,municipality,…) filtré Afrique de l'Ouest. */
export function parserOurAirports(csv: string): OurAirportsRecord[] {
  const rows: OurAirportsRecord[] = []
  for (const line of csv.split('\n')) {
    if (!line.trim()) continue
    const cols = decouperCsv(line)
    const oaci = (cols[1] || '').trim()
    if (!WEST_AFRICA_ICAO.test(oaci)) continue
    rows.push({
      oaci,
      type: cols[2] || '',
      nom: cols[3] || '',
      municipality: cols[10] || '',
      region_iso: cols[9] || '',
      latitude: parseFloat(cols[4]) || null,
      longitude: parseFloat(cols[5]) || null,
      altitude: parseFloat(cols[8]) || null,
    })
  }
  return rows
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface CritereRecherche {
  code?: string
  nom?: string
  lat?: number
  lon?: number
}

/**
 * Meilleur candidat : code exact d'abord, sinon nom/municipalité (accents
 * ignorés) départagés par proximité, sinon le plus proche par rayon
 * progressif (20 → 50 → 150 km). Ne devine jamais hors rayon.
 */
export function rechercherMeilleur(
  rows: OurAirportsRecord[],
  critere: CritereRecherche,
): OurAirportsRecord | null {
  const code = (critere.code || '').toUpperCase()
  if (code) {
    const exact = rows.find(r => r.oaci === code)
    if (exact) return exact
  }
  const q = normaliserNom(critere.nom || '')
  const aCoord = typeof critere.lat === 'number' && typeof critere.lon === 'number' &&
    isFinite(critere.lat) && isFinite(critere.lon) && !(critere.lat === 0 && critere.lon === 0)
  const distance = (r: OurAirportsRecord): number | null => {
    if (!aCoord || r.latitude == null || r.longitude == null) return null
    return haversineKm(critere.lat as number, critere.lon as number, r.latitude, r.longitude)
  }
  if (q) {
    const candidats = rows
      .map(r => {
        const nom = normaliserNom(r.nom)
        const mun = normaliserNom(r.municipality)
        const touche = nom.includes(q) || mun.includes(q) || (q.length >= 4 && (nom.startsWith(q) || mun.startsWith(q)))
        return { r, touche, d: distance(r) }
      })
      .filter(x => x.touche)
    if (candidats.length > 0) {
      candidats.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
      return candidats[0].r
    }
  }
  if (aCoord) {
    for (const rayon of [20, 50, 150]) {
      const proches = rows
        .map(r => ({ r, d: distance(r) }))
        .filter((x): x is { r: OurAirportsRecord; d: number } => x.d != null && x.d <= rayon)
        .sort((a, b) => a.d - b.d)
      if (proches.length > 0) return proches[0].r
    }
  }
  return null
}

// ── Chargement serveur (cache mémoire + TTL) ──

const URL_CSV = 'https://ourairports.com/data/airports.csv'
const TTL_MS = 24 * 3600 * 1000

let cache: { date: number; rows: OurAirportsRecord[] } | null = null
let chargementEnCours: Promise<OurAirportsRecord[]> | null = null

/** Charge (une fois / 24 h) la base filtrée Afrique de l'Ouest. */
export async function chargerOurAirports(): Promise<OurAirportsRecord[]> {
  if (cache && Date.now() - cache.date < TTL_MS) return cache.rows
  if (chargementEnCours) return chargementEnCours
  chargementEnCours = (async () => {
    try {
      const res = await fetch(URL_CSV)
      if (!res.ok) return cache?.rows || []
      const csv = await res.text()
      const rows = parserOurAirports(csv)
      if (rows.length > 0) cache = { date: Date.now(), rows }
      return cache?.rows || []
    } catch {
      return cache?.rows || []
    } finally {
      chargementEnCours = null
    }
  })()
  return chargementEnCours
}
