// lib/store/apiKeysSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Clés API extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  service: string
  key_value: string
  label?: string
  is_active: boolean
  fallback_order: number
  last_tested_at?: string
  last_test_ok?: boolean
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface ApiKeySlice {
  apiKeys: ApiKey[]
  setApiKeys: (keys: ApiKey[]) => void
  addApiKey: (key: Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateApiKey: (id: string, data: Partial<ApiKey>) => Promise<void>
  deleteApiKey: (id: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createApiKeysSlice)
// ─────────────────────────────────────────────────────────────

export const createApiKeysSlice: StateCreator<AppStore, [], [], ApiKeySlice> = (set, get) => ({
  apiKeys: [],

  setApiKeys: (keys) => set({ apiKeys: keys }),

  addApiKey: async (keyData) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newKey: ApiKey = { ...keyData, id, created_at: now, updated_at: now }
    set((state) => ({ apiKeys: [...state.apiKeys, newKey] }))
    const { createApiKey } = await import('../datastore')
    await createApiKey(newKey).catch(() => {})
  },

  updateApiKey: async (id, data) => {
    const snapshot = get().apiKeys
    set((state) => ({ apiKeys: state.apiKeys.map(k => k.id === id ? { ...k, ...data, updated_at: new Date().toISOString() } : k) }))
    const { updateApiKey: update } = await import('../datastore')
    const { error } = await update(id, data)
    if (error) { set({ apiKeys: snapshot }) }
  },

  deleteApiKey: async (id) => {
    const snapshot = get().apiKeys
    set((state) => ({ apiKeys: state.apiKeys.filter(k => k.id !== id) }))
    const { deleteApiKey: del } = await import('../datastore')
    const { error } = await del(id)
    if (error) { set({ apiKeys: snapshot }) }
  },
})
