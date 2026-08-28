// lib/ia/aiClient.ts
// Client IA partagé — utilisé par tous les agents SGDA
// Gère les appels à /api/ia/analyze avec retry, fallback et cache persistant
// Inclut un layer de déduplication pour éviter les appels simultanés identiques

'use client'

import { makeStorageKey, getCached, setCached } from './cache'

function extractBalancedJSON(text: string): string | null {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') {
      if (start === -1) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) return text.slice(start, i + 1)
    }
  }
  return null
}

export interface AICallOptions {
  systemPrompt: string
  userMessage: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json_object'
  /**
   * Timeout navigateur (ms) pour CET appel précis. Surcharge le défaut dérivé
   * de maxTokens. Utilisé par callJSON pour borner les tentatives de retry
   * (2ᵉ/3ᵉ palier) qui n'ont pas besoin de la fenêtre pleine du 1ᵉʳ appel.
   */
  timeoutMs?: number
}

export interface AICallResult {
  content: string
  ok: boolean
  error?: string
}

// Clé de déduplication basée sur le hash du prompt + message
function hashOptions(opts: AICallOptions): string {
  const histStr = opts.history ? opts.history.map(h => `${h.role}:${h.content}`).join('|') : ''
  return `${opts.systemPrompt}|${opts.userMessage}|${histStr}|${opts.responseFormat ?? 'text'}`
}

class AIClientClass {
  private available: boolean | null = null
  private dedupCache = new Map<string, Promise<AICallResult>>()
  private dedupTTL = 5000 // 5s avant de laisser repasser

  async call(options: AICallOptions): Promise<AICallResult> {
    // Déduplication : si un appel identique est en cours, on réutilise sa promesse
    const key = hashOptions(options)
    const existing = this.dedupCache.get(key)
    if (existing) return existing

    const promise = this._call(options)

    // Nettoyer après résolution
    const cleanup = () => {
      setTimeout(() => this.dedupCache.delete(key), this.dedupTTL)
    }
    promise.then(cleanup, cleanup)

    this.dedupCache.set(key, promise)
    return promise
  }

  private async _call(options: AICallOptions): Promise<AICallResult> {
    try {
      const messages: Array<{ role: string; content: string }> = [
        ...(options.history ?? []),
        { role: 'user', content: options.userMessage },
      ]

      // Délai navigateur aligné sur les timeouts serveur : AERORISQ peut être
      // servi en inférence locale (Ollama/mistral sur CPU) — chargement du
      // modèle au premier appel + génération lente. La valeur par défaut borne
      // l'attente côté navigateur sans laisser un spinner s'éterniser : le
      // budget serveur de callWithFallback est de 30 s, on laisse une marge
      // pour les réponses JSON « watch-dog » plus longues (avis + nb_ecarts).
      // Surchargable via env.
      const baseTimeout = Number(process.env.NEXT_PUBLIC_IA_TIMEOUT_MS) || 90000
      // Timeout explicite pour cet appel (ex. paliers de retry JSON) sinon dérivé de maxTokens.
      const timeout = options.timeoutMs
        ?? (options.maxTokens && options.maxTokens > 12000 ? baseTimeout * 2 : baseTimeout)
      const res = await fetch('/api/ia/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: options.systemPrompt,
          messages,
          temperature: options.temperature ?? 0.3,
          maxTokens: options.maxTokens ?? 2048,
          responseFormat: options.responseFormat,
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        this.available = false
        const errMsg = err.code ? `${err.error ?? 'Erreur API'} [${err.code}]` : (err.error ?? res.statusText)
        console.error(`[aiClient] API ${res.status}:`, errMsg)
        return { content: '', ok: false, error: errMsg }
      }

      const data = await res.json()
      this.available = true
      if (!data.content) {
        console.error('[aiClient] Réponse API vide — données brutes:', JSON.stringify(data).slice(0, 300))
      }
      return { content: data.content ?? '', ok: true }
    } catch (err: any) {
      // Un `AbortSignal.timeout()` expiré rejette avec une DOMException de nom
      // `TimeoutError` (message « signal timed out »). Ce n'est PAS une panne de
      // l'IA : le modèle peut simplement être lent (inférence locale Ollama au
      // premier chargement, gros payload). On ne marque donc PAS l'IA
      // indisponible dans ce cas — sinon un seul appel dépassant la marge
      // désactivait toute génération IA pour la session.
      const isTimeout =
        err?.name === 'TimeoutError' ||
        err?.name === 'AbortError' ||
        /abort|tim(e|ed)[ -]?out/i.test(String(err?.message ?? ''))

      if (!isTimeout) this.available = false
      if (isTimeout) {
        console.warn('[aiClient] Appel abandonné (délai dépassé):', err?.message)
        return { content: '', ok: false, error: 'Délai dépassé — IA lente, réessayez' }
      }
      console.error('[aiClient] Exception appel API:', err?.message)
      return { content: '', ok: false, error: err?.message }
    }
  }

  // Retourne du JSON parsé ; en cas d'erreur retourne fallback
  async callJSON<T>(options: AICallOptions, fallback: T): Promise<T> {
    const cacheKey = await makeStorageKey({
      systemPrompt: options.systemPrompt,
      userMessage: options.userMessage,
      history: options.history,
      responseFormat: 'json_object',
    })

    const cached = await getCached<T>(cacheKey)
    if (cached !== null) {
      console.log(`[aiClient] Cache HIT (${cacheKey.slice(0, 16)}...)`)
      return cached
    }

    // Déduplication : deux appels callJSON identiques en parallèle (même prompt,
    // même message, même format) partagent un seul déroulé complet de paliers,
    // au lieu de lancer deux fois la boucle de retry / deux requêtes réseau.
    const key = hashOptions({ ...options, responseFormat: 'json_object' })
    const existing = this.dedupCache.get(key)
    if (existing) return existing as Promise<T>

    const promise = this._callJSONWithRetry<T>(options, fallback, cacheKey)

    const cleanup = () => {
      setTimeout(() => this.dedupCache.delete(key), this.dedupTTL)
    }
    promise.then(
      () => cleanup(),
      () => cleanup()
    )
    this.dedupCache.set(key, promise as Promise<AICallResult>)

    return promise
  }

  private async _callJSONWithRetry<T>(options: AICallOptions, fallback: T, cacheKey: string): Promise<T> {
    // Paliers de maxTokens progressifs pour retry
    const tokenTiers = options.maxTokens
      ? [...new Set([options.maxTokens, Math.floor(options.maxTokens / 2), Math.floor(options.maxTokens / 4)])]
      : [32768, 16000, 8000]

    // Le 1er palier garde le timeout standard (la génération complète a besoin
    // de la fenêtre entière pour aboutir). Les paliers de retry, eux, ne servent
    // qu'à re-tester si un JSON mal formé redevient parseable : ils n'ont pas
    // besoin de la fenêtre pleine — un timeout réduit borne le pire cas cumulé
    // (3 paliers × 90 s ≈ 4,5 min) sans jamais raccourcir un appel qui réussit.
    const retryTimeoutMs = 20000

    for (let i = 0; i < tokenTiers.length; i++) {
      const isFirst = i === 0
      const maxTokens = tokenTiers[i]
      const result = await this._call({
        ...options,
        maxTokens,
        responseFormat: 'json_object',
        timeoutMs: isFirst ? options.timeoutMs : retryTimeoutMs,
      })
      if (!result.ok || !result.content) {
        continue
      }

      const parsed = this._tryParseJSON(result.content)
      if (parsed !== null) {
        setCached(cacheKey, parsed).catch(() => {})
        return parsed as T
      }

      console.warn(`[aiClient] JSON invalide avec maxTokens=${maxTokens}, retry...`)
    }

    console.error('[aiClient] Échec après tous les paliers maxTokens')
    return fallback
  }

  private _tryParseJSON<T>(content: string): T | null {
    // Prétraitement : apostrophes échappées (courant en sortie LLM française) — `\'` est invalide en JSON.
    const cleaned = content.replace(/\\'/g, "'")
    const tryParse = (s: string): T => JSON.parse(s) as T
    const tentatives = [
      () => tryParse(cleaned),
      // Bloc markdown ```json ... ```
      () => {
        const m = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
        return m ? tryParse(m[1]) : null
      },
      // Premier objet JSON { ... } — extraction par comptage d'accolades (supporte l'imbrication)
      () => {
        const json = extractBalancedJSON(cleaned)
        return json ? tryParse(json) : null
      },
      // Réparation JSON tronqué : ferme les guillemets/accolades/crochets manquants
      () => {
        let fixed = cleaned.trim()
        const stack: string[] = []
        let inString = false
        let escape = false
        for (const ch of fixed) {
          if (escape) { escape = false; continue }
          if (ch === '\\') { escape = true; continue }
          if (ch === '"') { inString = !inString; continue }
          if (inString) continue
          if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
          if (ch === '}' || ch === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop()
          }
        }
        if (inString) fixed += '"'
        for (let i = stack.length - 1; i >= 0; i--) fixed += stack[i]
        return tryParse(fixed)
      },
      // Très robuste : supprime les caractères non-JSON hors des chaînes, puis retente
      () => {
        let fixed = cleaned.trim()
        if (fixed.startsWith('{') && !fixed.endsWith('}')) {
          fixed = fixed.slice(0, fixed.lastIndexOf('}') + 1)
        }
        return tryParse(fixed)
      },
    ]

    for (const t of tentatives) {
      try {
        const parsed = t()
        if (parsed !== null) return parsed as T
      } catch {
        continue
      }
    }

    console.error('[aiClient] Échec parsing JSON — réponse brute:', content.slice(0, 500))
    return null
  }

  /** Vide le cache de déduplication (utile après changement significatif de données) */
  clearDedupCache(): void {
    this.dedupCache.clear()
  }

  isAvailable(): boolean | null {
    return this.available
  }
}

export const aiClient = new AIClientClass()
