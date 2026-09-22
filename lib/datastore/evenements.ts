// lib/datastore/evenements.ts — Domaine evenements (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { EvenementSecurite } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// EVENEMENTS
// ─────────────────────────────────────────────────────────────

export async function fetchEvenements(): Promise<DatastoreResult<EvenementSecurite[]>> {
  const { data, error } = await supabase.from('evenements_securite').select('*').order('date', { ascending: false })
  return { data: data as EvenementSecurite[] | null, error: error?.message ?? null }
}

export async function createEvenement(payload: Omit<EvenementSecurite, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<EvenementSecurite>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('evenements_securite')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as EvenementSecurite | null, error: error?.message ?? null }
}

export async function updateEvenement(id: string, payload: Partial<EvenementSecurite>): Promise<DatastoreResult<EvenementSecurite>> {
  const { data, error } = await supabase
    .from('evenements_securite')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as EvenementSecurite | null, error: error?.message ?? null }
}

export async function deleteEvenement(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('evenements_securite').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
