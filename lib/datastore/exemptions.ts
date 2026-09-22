// lib/datastore/exemptions.ts — Domaine exemptions (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Exemption } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// EXEMPTIONS (Phase 3 : persistance serveur, best-effort côté slice)
// ─────────────────────────────────────────────────────────────

export async function fetchExemptions(): Promise<DatastoreResult<Exemption[]>> {
  const { data, error } = await supabase.from('exemptions').select('*').order('updated_at', { ascending: false })
  return { data: (data ?? []) as Exemption[], error: error?.message ?? null }
}

export async function createExemption(payload: Exemption): Promise<DatastoreResult<Exemption>> {
  const { data, error } = await supabase
    .from('exemptions')
    .insert({ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as Exemption | null, error: error?.message ?? null }
}

export async function updateExemption(id: string, payload: Partial<Exemption>): Promise<DatastoreResult<Exemption>> {
  const { data, error } = await supabase
    .from('exemptions')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Exemption | null, error: error?.message ?? null }
}

export async function deleteExemption(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('exemptions').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
