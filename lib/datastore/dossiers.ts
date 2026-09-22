// lib/datastore/dossiers.ts — Domaine dossiers (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Dossier } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// DOSSIERS
// ─────────────────────────────────────────────────────────────

export async function createDossier(payload: Partial<Dossier> & { titre: string; reference: string; statut: string }): Promise<DatastoreResult<Dossier>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('dossiers')
    .insert({ ...payload, created_at: payload.created_at || now, updated_at: now })
    .select()
    .single()
  return { data: data as Dossier | null, error: error?.message ?? null }
}

export async function updateDossier(id: string, payload: Partial<Dossier>): Promise<DatastoreResult<Dossier>> {
  const { data, error } = await supabase
    .from('dossiers')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Dossier | null, error: error?.message ?? null }
}

export async function deleteDossier(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('dossiers').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
