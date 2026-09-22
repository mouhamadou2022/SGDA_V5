// lib/datastore/enquetes.ts — Domaine enquetes (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Enquete, ReponseEnquete } from '../store';
import { DatastoreResult, unmarshalReponseEnquete } from './_shared';

// ─────────────────────────────────────────────────────────────
// ENQUÊTES + RÉPONSES (Phase 3 : tables SECTION 26, best-effort côté slice)
// ─────────────────────────────────────────────────────────────

export async function fetchEnquetes(): Promise<DatastoreResult<Enquete[]>> {
  const { data, error } = await supabase.from('enquetes').select('*').order('updated_at', { ascending: false })
  return { data: (data ?? []) as Enquete[], error: error?.message ?? null }
}

export async function createEnquete(payload: Enquete): Promise<DatastoreResult<Enquete>> {
  const { data, error } = await supabase
    .from('enquetes')
    .insert({ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as Enquete | null, error: error?.message ?? null }
}

export async function updateEnquete(id: string, payload: Partial<Enquete>): Promise<DatastoreResult<Enquete>> {
  const { data, error } = await supabase
    .from('enquetes')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Enquete | null, error: error?.message ?? null }
}

export async function deleteEnquete(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('enquetes').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

/** NUMERIC PostgREST → string : reconverti en nombre (score C1). */

export async function fetchReponsesEnquetes(): Promise<DatastoreResult<ReponseEnquete[]>> {
  const { data, error } = await supabase.from('reponses_enquetes').select('*').order('submitted_at', { ascending: false })
  return { data: ((data ?? []) as any[]).map(unmarshalReponseEnquete), error: error?.message ?? null }
}

export async function createReponseEnquete(payload: ReponseEnquete): Promise<DatastoreResult<ReponseEnquete>> {
  const { data, error } = await supabase
    .from('reponses_enquetes')
    .insert({ ...payload })
    .select()
    .single()
  return { data: data ? unmarshalReponseEnquete(data) : null, error: error?.message ?? null }
}

export async function deleteReponseEnquete(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('reponses_enquetes').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
