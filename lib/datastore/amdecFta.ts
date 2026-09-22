// lib/datastore/amdecFta.ts — Domaine amdecFta (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { AmdecAnalyse } from '../risque/amdecEngine';
import type { ArbreFTA } from '../risque/ftaEngine';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// AMDEC ANALYSES
// ─────────────────────────────────────────────────────────────

export async function fetchAmdecAnalyses(): Promise<DatastoreResult<AmdecAnalyse[]>> {
  const { data, error } = await supabase.from('amdec_analyses').select('*').order('updated_at', { ascending: false })
  return { data: data as AmdecAnalyse[] | null, error: error?.message ?? null }
}

export async function createAmdecAnalyse(payload: Omit<AmdecAnalyse, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<AmdecAnalyse>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('amdec_analyses')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as AmdecAnalyse | null, error: error?.message ?? null }
}

export async function updateAmdecAnalyse(id: string, payload: Partial<AmdecAnalyse>): Promise<DatastoreResult<AmdecAnalyse>> {
  const { data, error } = await supabase
    .from('amdec_analyses')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as AmdecAnalyse | null, error: error?.message ?? null }
}

export async function deleteAmdecAnalyse(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('amdec_analyses').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// FTA ANALYSES (arbres de défaillance)
// ─────────────────────────────────────────────────────────────

export async function fetchFtaAnalyses(): Promise<DatastoreResult<ArbreFTA[]>> {
  const { data, error } = await supabase.from('fta_analyses').select('*').order('updated_at', { ascending: false })
  return { data: data as ArbreFTA[] | null, error: error?.message ?? null }
}

export async function createFtaAnalyse(payload: Omit<ArbreFTA, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<ArbreFTA>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('fta_analyses')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as ArbreFTA | null, error: error?.message ?? null }
}

export async function updateFtaAnalyse(id: string, payload: Partial<ArbreFTA>): Promise<DatastoreResult<ArbreFTA>> {
  const { data, error } = await supabase
    .from('fta_analyses')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as ArbreFTA | null, error: error?.message ?? null }
}

export async function deleteFtaAnalyse(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('fta_analyses').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
