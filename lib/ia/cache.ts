// lib/ia/cache.ts
// Cache persistant pour réponses LLM — IndexedDB + mémoire
'use client'

import localforage from 'localforage'

export const CACHE_VERSION = 1

const forage = localforage.createInstance({
  name: 'sgda-llm-cache',
  storeName: 'responses',
  description: 'Cache persistant des réponses LLM (7 jours par défaut)',
})

const MEM_CACHE_TTL = 5 * 60 * 1000
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000

interface CacheEntry<T> {
  data: T
  timestamp: number
  version: number
  ttl: number
}

const memCache = new Map<string, { data: unknown; timestamp: number; ttl: number }>()

export async function hashKey(input: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  } catch {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  }
}

export function buildCacheKey(opts: {
  systemPrompt: string
  userMessage: string
  history?: Array<{ role: string; content: string }>
  responseFormat?: string
}): string {
  const histStr = opts.history ? opts.history.map(h => `${h.role}:${h.content}`).join('|') : ''
  return `${opts.systemPrompt}|${opts.userMessage}|${histStr}|${opts.responseFormat ?? 'text'}`
}

export async function makeStorageKey(opts: Parameters<typeof buildCacheKey>[0]): Promise<string> {
  return hashKey(buildCacheKey(opts) + '|v' + CACHE_VERSION)
}

export async function getCached<T>(key: string): Promise<T | null> {
  const memEntry = memCache.get(key)
  if (memEntry && Date.now() - memEntry.timestamp < memEntry.ttl) return memEntry.data as T
  if (memEntry) memCache.delete(key)

  try {
    const entry = await forage.getItem<CacheEntry<T>>(key)
    if (entry && entry.version === CACHE_VERSION && Date.now() - entry.timestamp < (entry.ttl ?? DEFAULT_TTL)) {
      memCache.set(key, { data: entry.data, timestamp: Date.now(), ttl: MEM_CACHE_TTL })
      return entry.data
    }
    if (entry) await forage.removeItem(key)
  } catch {}

  return null
}

export async function setCached<T>(key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
  memCache.set(key, { data, timestamp: Date.now(), ttl: MEM_CACHE_TTL })
  const entry: CacheEntry<T> = { data, timestamp: Date.now(), version: CACHE_VERSION, ttl }
  forage.setItem(key, entry).catch(() => {})
}

export async function clearCache(): Promise<void> {
  memCache.clear()
  await forage.clear()
}

export async function invalidateOlder(version: number): Promise<void> {
  try {
    const keys = await forage.keys()
    await Promise.all(keys.map(async (key) => {
      const entry = await forage.getItem<CacheEntry<unknown>>(key)
      if (entry && entry.version !== version) {
        memCache.delete(key)
        await forage.removeItem(key)
      }
    }))
  } catch {}
}
