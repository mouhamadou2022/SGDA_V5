// lib/datastore/codesAcces.ts — Domaine codesAcces (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { CodeAcces } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// CODES ACCES (CRUD complet)
// ─────────────────────────────────────────────────────────────

export async function createCodeAcces(payload: CodeAcces): Promise<DatastoreResult<CodeAcces>> {
  const { data, error } = await supabase
    .from('codes_acces')
    .insert(payload)
    .select()
    .single()
  return { data: data as CodeAcces | null, error: error?.message ?? null }
}

export async function revokeCodeAcces(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('codes_acces')
    .update({ statut: 'revogue' })
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function deleteCodeAcces(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('codes_acces')
    .delete()
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}
