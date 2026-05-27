// lib/ia/aiClient.ts
// Client IA partagé — utilisé par tous les agents SGDA
// Gère les appels à /api/ia/analyze avec retry et fallback
// Inclut un layer de déduplication pour éviter les appels simultanés identiques

'use client'

export interface AICallOptions {
  systemPrompt: string
  userMessage: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json_object'
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
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        this.available = false
        return { content: '', ok: false, error: err.error ?? 'Erreur API' }
      }

      const data = await res.json()
      this.available = true
      return { content: data.content ?? '', ok: true }
    } catch (err: any) {
      this.available = false
      return { content: '', ok: false, error: err.message }
    }
  }

  // Retourne du JSON parsé ; en cas d'erreur retourne fallback
  async callJSON<T>(options: AICallOptions, fallback: T): Promise<T> {
    const result = await this.call({ ...options, responseFormat: 'json_object' })
    if (!result.ok || !result.content) return fallback
    try {
      return JSON.parse(result.content) as T
    } catch {
      // Le LLM peut parfois entourer le JSON de texte — on cherche le premier {...}
      const match = result.content.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return JSON.parse(match[0]) as T
        } catch {
          return fallback
        }
      }
      return fallback
    }
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
