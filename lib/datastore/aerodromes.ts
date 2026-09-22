// lib/datastore/aerodromes.ts — Domaine aerodromes (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Aerodrome } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// AÉRODROMES
// ─────────────────────────────────────────────────────────────

export async function fetchAerodromes(): Promise<DatastoreResult<Aerodrome[]>> {
  const { data, error } = await supabase.from('aerodromes').select('*').order('nom')
  return { data: data as Aerodrome[] | null, error: error?.message ?? null }
}

export async function createAerodrome(payload: Omit<Aerodrome, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Aerodrome>> {
  const { data, error } = await supabase
    .from('aerodromes')
    .insert({ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as Aerodrome | null, error: error?.message ?? null }
}

export async function updateAerodrome(id: string, payload: Partial<Aerodrome>): Promise<DatastoreResult<Aerodrome>> {
  const { data, error } = await supabase
    .from('aerodromes')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Aerodrome | null, error: error?.message ?? null }
}

export async function deleteAerodrome(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('aerodromes').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
