// lib/datastore/iaModeles.ts — Domaine iaModeles (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// IA THRESHOLDS — Seuils dynamiques persistés
// ─────────────────────────────────────────────────────────────

export interface ThresholdRow {
  id: string
  parametre: string
  valeur: number
  engine: string
  raison?: string
  actif: boolean
}

export async function fetchThresholds(): Promise<DatastoreResult<ThresholdRow[]>> {
  const { data, error } = await supabase.from('ia_thresholds').select('*').eq('actif', true)
  return { data: data as ThresholdRow[] | null, error: error?.message ?? null }
}

export async function upsertThreshold(parametre: string, valeur: number, engine: string, raison?: string): Promise<DatastoreResult<ThresholdRow>> {
  const { data, error } = await supabase
    .from('ia_thresholds')
    .upsert({ parametre, valeur, engine, raison: raison || null, actif: true }, { onConflict: 'parametre' })
    .select()
    .single()
  return { data: data as ThresholdRow | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// IA DECISIONS — Historique des décisions AERORISQ
// ─────────────────────────────────────────────────────────────

export interface DecisionRow {
  id: string
  aerodrome_id: string
  type: string
  date_decision: string
  recommendation_action?: string
  recommendation_type?: string
  recommendation_urgence?: string
  certificat_action?: string
  declencheur_type?: string
  suggestion_type?: string
  suggestion_confiance?: number
  status: string
  effectiveness: string
  applied_at?: string
  commentaire?: string
  confiance?: number
}

export async function fetchDecisions(aerodromeId?: string): Promise<DatastoreResult<DecisionRow[]>> {
  let query = supabase.from('ia_decisions').select('*').order('created_at', { ascending: false }).limit(100)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query
  return { data: data as DecisionRow[] | null, error: error?.message ?? null }
}

export async function createDecision(payload: {
  aerodrome_id: string
  type: string
  recommendation_action?: string
  recommendation_type?: string
  recommendation_urgence?: string
  certificat_action?: string
  declencheur_type?: string
  suggestion_type?: string
  suggestion_confiance?: number
  confiance?: number
}): Promise<DatastoreResult<DecisionRow>> {
  const { data, error } = await supabase
    .from('ia_decisions')
    .insert({ ...payload, status: 'pending', effectiveness: 'non_evalue', date_decision: new Date().toISOString() })
    .select()
    .single()
  return { data: data as DecisionRow | null, error: error?.message ?? null }
}

export async function updateDecisionStatus(id: string, status: string, effectiveness?: string, commentaire?: string): Promise<DatastoreResult<null>> {
  const upd: Record<string, unknown> = { status }
  if (status === 'applied') upd.applied_at = new Date().toISOString()
  if (effectiveness) upd.effectiveness = effectiveness
  if (commentaire) upd.commentaire = commentaire
  const { error } = await supabase.from('ia_decisions').update(upd).eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// IA MODEL STATE — Poids des modèles ML persistés
// ─────────────────────────────────────────────────────────────

export interface ModelStateRow {
  id: string
  model_name: string
  aerodrome_id?: string
  version: number
  weights: Record<string, number>
  biases: Record<string, number>
  total_feedbacks: number
  accuracy_history: number[]
  learning_rate: number
  model_data: Record<string, unknown>
}

export async function fetchModelState(modelName: string, aerodromeId?: string): Promise<DatastoreResult<ModelStateRow>> {
  let query = supabase.from('ia_model_state').select('*').eq('model_name', modelName)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query.maybeSingle()
  return { data: data as ModelStateRow | null, error: error?.message ?? null }
}

export async function upsertModelState(payload: {
  model_name: string
  aerodrome_id?: string
  version: number
  weights: Record<string, number>
  biases: Record<string, number>
  total_feedbacks: number
  accuracy_history: number[]
  learning_rate: number
  model_data?: Record<string, unknown>
}): Promise<DatastoreResult<ModelStateRow>> {
  const { data, error } = await supabase
    .from('ia_model_state')
    .upsert({
      model_name: payload.model_name,
      aerodrome_id: payload.aerodrome_id || null,
      version: payload.version,
      weights: payload.weights,
      biases: payload.biases,
      total_feedbacks: payload.total_feedbacks,
      accuracy_history: payload.accuracy_history,
      learning_rate: payload.learning_rate,
      model_data: payload.model_data || {},
    }, { onConflict: 'model_name,aerodrome_id' })
    .select()
    .single()
  return { data: data as ModelStateRow | null, error: error?.message ?? null }
}
