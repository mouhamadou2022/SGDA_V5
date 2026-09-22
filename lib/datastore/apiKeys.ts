// lib/datastore/apiKeys.ts — Domaine apiKeys (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { ApiKey } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// API KEYS
// ─────────────────────────────────────────────────────────────

export async function fetchApiKeys(): Promise<DatastoreResult<ApiKey[]>> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .order('service')
    .order('fallback_order')
  return { data: data as ApiKey[] | null, error: error?.message ?? null }
}

export async function createApiKey(payload: ApiKey): Promise<DatastoreResult<ApiKey>> {
  const { data, error } = await supabase
    .from('api_keys')
    .insert(payload)
    .select()
    .single()
  return { data: data as ApiKey | null, error: error?.message ?? null }
}

export async function updateApiKey(id: string, payload: Partial<ApiKey>): Promise<DatastoreResult<ApiKey>> {
  const { data, error } = await supabase
    .from('api_keys')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as ApiKey | null, error: error?.message ?? null }
}

export async function deleteApiKey(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('api_keys').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
