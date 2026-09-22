// lib/datastore/iaFeedbacks.ts — Domaine iaFeedbacks (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { EngineFeedbackRecord } from '../ia/engines/engineFeedback';
import type { CapaciteInspecteur, ActionInspecteur } from '../ia/engines/inspecteurMonitoring';
import { DatastoreResult } from './_shared';

export interface InspecteurFeedbackRow {
  id: string
  created_at: string
  updated_at?: string
  capacite: CapaciteInspecteur
  action: ActionInspecteur
  aerodrome_id: string | null
  surveillance_id: string | null
  user_id?: string | null
  confiance: number | null
  synced_at?: string | null
}

// ─────────────────────────────────────────────────────────────
// IA FEEDBACK — Apprentissage continu AERORISQ
// ─────────────────────────────────────────────────────────────

export async function fetchIAFeedbacks(aerodromeId?: string): Promise<DatastoreResult<EngineFeedbackRecord[]>> {
  let query = supabase.from('ia_feedback').select('*').order('created_at', { ascending: false }).limit(200)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query
  return { data: data as EngineFeedbackRecord[] | null, error: error?.message ?? null }
}

export async function createIAFeedback(payload: Omit<EngineFeedbackRecord, 'id' | 'date'>): Promise<DatastoreResult<EngineFeedbackRecord>> {
  const { data, error } = await supabase
    .from('ia_feedback')
    .insert({
      engine_type: payload.engineType,
      aerodrome_id: payload.aerodromeId,
      planning_id: payload.contexte?.planningId || null,
      surveillance_id: payload.contexte?.surveillanceId || null,
      decision_type: payload.decision.type,
      decision_data: JSON.parse(JSON.stringify(payload.decision.donnees)),
      vote: payload.vote,
      commentaire: payload.commentaire || null,
      user_id: null,
    })
    .select()
    .single()
  return { data: data as EngineFeedbackRecord | null, error: error?.message ?? null }
}

export async function syncIAFeedbacks(feedbacks: EngineFeedbackRecord[]): Promise<DatastoreResult<number>> {
  const rows = feedbacks.map(f => ({
    engine_type: f.engineType,
    aerodrome_id: f.aerodromeId,
    planning_id: f.contexte?.planningId || null,
    surveillance_id: f.contexte?.surveillanceId || null,
    decision_type: f.decision.type,
    decision_data: JSON.parse(JSON.stringify(f.decision.donnees)),
    vote: f.vote,
    commentaire: f.commentaire || null,
    synced_at: new Date().toISOString(),
  }))
  const { error, count } = await supabase.from('ia_feedback').upsert(rows, { ignoreDuplicates: true })
  return { data: count ?? 0, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// INSPECTEUR FEEDBACK — Suivi ML de l'Inspecteur Virtuel
// ─────────────────────────────────────────────────────────────

export async function fetchInspecteurFeedbacks(aerodromeId?: string): Promise<DatastoreResult<InspecteurFeedbackRow[]>> {
  let query = supabase.from('inspecteur_feedback').select('*').order('created_at', { ascending: false }).limit(500)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query
  return { data: data as InspecteurFeedbackRow[] | null, error: error?.message ?? null }
}

export async function createInspecteurFeedback(payload: Omit<InspecteurFeedbackRow, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<InspecteurFeedbackRow>> {
  const { data, error } = await supabase
    .from('inspecteur_feedback')
    .insert(payload)
    .select()
    .single()
  return { data: data as InspecteurFeedbackRow | null, error: error?.message ?? null }
}

export async function syncInspecteurFeedbacks(records: InspecteurFeedbackRow[]): Promise<DatastoreResult<number>> {
  const rows = records.map(r => ({
    ...r,
    synced_at: new Date().toISOString(),
  }))
  const { error, count } = await supabase.from('inspecteur_feedback').upsert(rows, { ignoreDuplicates: true })
  return { data: count ?? 0, error: error?.message ?? null }
}
