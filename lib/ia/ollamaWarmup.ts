// lib/ia/ollamaWarmup.ts
// Préchauffage + maintien au chaud d'Ollama.
// - À l'ouverture : micro-inférence qui charge le modèle en RAM (fini le
//   chargement à froid de ~16s sur le premier appel) + keep_alive 30 min.
// - Ensuite : battement toutes les 20 min (onglet visible uniquement) pour
//   renouveler le keep_alive — le modèle ne se décharge jamais tant que
//   l'app est ouverte. Silencieux : Ollama éteint = no-op, jamais d'erreur.
'use client'

const CLE_DERNIER_CHAUD = 'sgda_ollama_warm_at'
// Sous le keep_alive 30 min : on bat avant l'expiration.
const INTERVALLE_ENTRETIEN_MS = 20 * 60 * 1000
const DUREE_CHAUD_MS = 25 * 60 * 1000

let entretien: ReturnType<typeof setInterval> | null = null

async function microInference(): Promise<boolean> {
  // Import différé : la chaîne du pilote (outils) ne doit pas alourdir
  // le premier chargement — le warm-up part en arrière-plan de toute façon.
  const { configPilote, variantesUrlOllama } = await import('./pilote/bouclePilote')
  const { url, modele } = configPilote()
  for (const base of variantesUrlOllama(url)) {
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modele,
            messages: [{ role: 'user', content: 'ok' }],
            stream: false,
            // Pas de réflexion pour une micro-inférence de chauffe.
            think: false,
            keep_alive: '30m',
            options: { num_predict: 2 },
          }),
      })
      if (res.ok) return true
    } catch {
      /* variante suivante (localhost <-> 127.0.0.1) */
    }
  }
  return false
}

function noterChaud(): void {
  try {
    window.localStorage.setItem(CLE_DERNIER_CHAUD, String(Date.now()))
  } catch { /* stockage indisponible : on préchauffera à chaque ouverture */ }
}

function estEncoreChaud(): boolean {
  try {
    const dernier = Number(window.localStorage.getItem(CLE_DERNIER_CHAUD) || 0)
    return Date.now() - dernier < DUREE_CHAUD_MS
  } catch {
    return false
  }
}

/** Démarre le battement d'entretien (une seule fois, onglet visible uniquement). */
export function entretenirChaleur(): void {
  if (entretien || typeof window === 'undefined') return
  entretien = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      // Onglet caché = « cours du soir » : extraction des textes Kit
      // manquants + OCR vision des scans (avec reprise, ~50 pages par
      // passe : un gros scanné passe d'un coup), sans doublon, sans erreur.
      import('./coursDuSoir').then(m => m.coursDuSoir({ ocr: true })).catch(() => {})
      return
    }
    microInference().then(ok => { if (ok) noterChaud() }).catch(() => {})
  }, INTERVALLE_ENTRETIEN_MS)
}

export async function prechaufferOllama(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    // Encore chaud (rechargement récent) : pas de micro-inférence, juste l'entretien.
    if (estEncoreChaud()) {
      entretenirChaleur()
      return true
    }
    const ok = await microInference()
    if (ok) {
      noterChaud()
      entretenirChaleur()
    }
    return ok
  } catch {
    return false
  }
}
