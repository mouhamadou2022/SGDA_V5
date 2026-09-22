// lib/datastore/plannings.ts — Domaine plannings (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Planning } from '../store';
import { DatastoreResult, groupEquipeIds } from './_shared';

// ─────────────────────────────────────────────────────────────
// PLANNINGS
// ─────────────────────────────────────────────────────────────

export async function fetchPlannings(): Promise<DatastoreResult<Planning[]>> {
  const [planningsRes, equipeRes] = await Promise.all([
    supabase.from('plannings').select('*').order('date_debut', { ascending: false }),
    supabase.from('planning_equipe').select('*'),
  ])
  if (planningsRes.error) return { data: null, error: planningsRes.error.message }
  const data = groupEquipeIds(planningsRes.data as Planning[], (equipeRes.data ?? []) as any[])
  return { data, error: null }
}

export async function createPlanning(payload: Omit<Planning, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Planning>> {
  const now = new Date().toISOString()
  const { equipe_ids, id: _ignoredId, ...restPayload } = payload as any
  const { data, error } = await supabase
    .from('plannings')
    .insert({ ...restPayload, created_at: now, updated_at: now })
    .select()
    .single()
  if (error || !data) return { data: null, error: error?.message ?? null }
  if (equipe_ids && equipe_ids.length > 0) {
    const rows = equipe_ids.map((uid: string) => ({ planning_id: data.id, utilisateur_id: uid }))
    await supabase.from('planning_equipe').insert(rows)
  }
  return { data: { ...data, equipe_ids: equipe_ids || [] } as Planning | null, error: null }
}

export async function updatePlanning(id: string, payload: Partial<Planning>): Promise<DatastoreResult<Planning>> {
  if (!id || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    console.error('[datastore] updatePlanning called with invalid id:', id)
    return { data: null, error: 'ID de planning invalide' }
  }
  const { equipe_ids, ...restPayload } = payload as any
  const { data, error } = await supabase
    .from('plannings')
    .update({ ...restPayload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return { data: null, error: error?.message ?? null }
  if (!data) {
    // 0 ligne mise à jour : le planning n'existe pas en base (id local hors-ligne)
    // ou la RLS le masque. On ne considère pas ça comme une erreur bloquante.
    return { data: { ...restPayload, id, equipe_ids: equipe_ids ?? [] } as Planning, error: null }
  }
  if (equipe_ids !== undefined) {
    await supabase.from('planning_equipe').delete().eq('planning_id', id)
    if (equipe_ids.length > 0) {
      const rows = equipe_ids.map((uid: string) => ({ planning_id: id, utilisateur_id: uid }))
      await supabase.from('planning_equipe').insert(rows)
    }
  }
  return { data: { ...data, equipe_ids: equipe_ids ?? [] } as Planning | null, error: null }
}

export async function deletePlanning(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('plannings').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
