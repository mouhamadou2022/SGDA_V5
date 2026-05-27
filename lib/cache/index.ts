'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'

// ============================================================
// LRU Cache générique
// ============================================================

type CacheEntry<T> = { data: T; timestamp: number }

interface CacheOptions {
  ttl?: number
  maxSize?: number
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private readonly ttl: number
  private readonly maxSize: number

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl ?? 5 * 60 * 1000
    this.maxSize = options.maxSize ?? 100
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return undefined
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.data
  }

  set(key: string, data: T): void {
    if (this.cache.has(key)) this.cache.delete(key)
    else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) this.cache.delete(key)
    }
  }

  clear(): void { this.cache.clear() }

  get size(): number { return this.cache.size }
}

// ============================================================
// Caches partagés par domaine
// ============================================================

export const apiCache = new LRUCache<unknown>({ ttl: 30000, maxSize: 200 })
export const computationCache = new LRUCache<unknown>({ ttl: 5000, maxSize: 100 })

// ============================================================
// Memoize générique
// ============================================================

export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options: CacheOptions & { resolver?: (...args: Parameters<T>) => string; cache?: LRUCache<ReturnType<T>> } = {}
): T {
  const cache = options.cache ?? new LRUCache<ReturnType<T>>(options)
  return ((...args: Parameters<T>) => {
    const key = options.resolver ? options.resolver(...args) : JSON.stringify(args)
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const result = fn(...args)
    cache.set(key, result)
    return result
  }) as T
}

// ============================================================
// useCachedApiCall — pour les appels fetch/API
// ============================================================

export function useCachedApiCall<T>(
  fetcher: () => Promise<T>,
  cacheKey: string,
  ttl = 30000
): { data: T | null; loading: boolean; error: Error | null; refresh: () => void } {
  const cached = apiCache.get(cacheKey) as T | undefined
  const [data, setData] = useState<T | null>(cached ?? null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      apiCache.set(cacheKey, result)
      if (mountedRef.current) setData(result)
    } catch (err) {
      if (mountedRef.current) setError(err as Error)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [cacheKey])

  useEffect(() => {
    mountedRef.current = true
    if (!cached) fetch()
    return () => { mountedRef.current = false }
  }, [cacheKey])

  return { data, loading, error, refresh: fetch }
}
