// lib/datastore/formations.ts — Domaine formations (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Formation } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// FORMATIONS
// ─────────────────────────────────────────────────────────────

export async function fetchFormations(): Promise<DatastoreResult<Formation[]>> {
  const { data, error } = await supabase.from('formations').select('*').order('date', { ascending: false })
  return { data: data as Formation[] | null, error: error?.message ?? null }
}

export async function createFormation(payload: Omit<Formation, 'id' | 'created_at'>): Promise<DatastoreResult<Formation>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('formations')
    .insert({ ...payload, created_at: now })
    .select()
    .single()
  return { data: data as Formation | null, error: error?.message ?? null }
}

export async function updateFormation(id: string, payload: Partial<Formation>): Promise<DatastoreResult<Formation>> {
  const { data, error } = await supabase
    .from('formations')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Formation | null, error: error?.message ?? null }
}

export async function deleteFormation(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('formations').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
