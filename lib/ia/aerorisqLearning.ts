// lib/ia/aerorisqLearning.ts
// « Langage clair » → apprentissage d'AERORISQ (IA maison).
// Chaque texte affiché (fallback ou IA) est enregistré au fil de l'eau auprès
// de la route /api/aerorisq/langage-clair, avec un vote 👍/👎 optionnel.
// Le cron quotidien aggrège ces enregistrements pour entraîner AERORISQ.

export interface LangageClairPayload {
  module: string
  aerodromeId?: string
  contexte: Record<string, unknown>
  texte: string
  fallbackIA: boolean
  vote?: 'up' | 'down'
}

const LOCAL_DEDUP_KEY = 'sgda_aerorisq_lc_sent_v1'

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

function readSent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_DEDUP_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function markSent(key: string): void {
  if (typeof window === 'undefined') return
  try {
    const sent = readSent().filter((k) => k !== key)
    sent.push(key)
    window.localStorage.setItem(LOCAL_DEDUP_KEY, JSON.stringify(sent.slice(-200)))
  } catch {
    // localStorage plein — on ignore
  }
}

export function texteHash(payload: Pick<LangageClairPayload, 'module' | 'texte'>): string {
  return hashString(`${payload.module}::${payload.texte}`)
}

export function enregistrerLangageClair(payload: LangageClairPayload): void {
  if (typeof window === 'undefined') return
  const key = texteHash(payload)
  const sent = readSent()

  // Auto-enregistrement (vote non renseigné) : une seule fois par navigateur.
  // Un vote est toujours transmis pour mettre à jour la ligne existante.
  if (!payload.vote && sent.includes(key)) return

  try {
    fetch('/api/aerorisq/langage-clair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, texte_hash: key }),
    }).catch(() => { /* best-effort : l'apprentissage ne bloque jamais l'UI */ })
  } catch {
    // fetch indisponible — l'enregistrement reste local seulement
  }

  markSent(key)
}
