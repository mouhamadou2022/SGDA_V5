// lib/datastore/profilsRisque.ts — Domaine profilsRisque (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { ProfilRisque } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// PROFILS RISQUE
// ─────────────────────────────────────────────────────────────

export async function fetchProfilsRisque(): Promise<DatastoreResult<ProfilRisque[]>> {
  const { data, error } = await supabase.from('profils_risque').select('*')
  return { data: data as ProfilRisque[] | null, error: error?.message ?? null }
}

export async function upsertProfilRisque(profil: ProfilRisque): Promise<DatastoreResult<ProfilRisque>> {
  // Whitelist : colonnes réellement présentes dans la table profils_risque (voir SQL 13.O).
  // Les champs Phase 3 (hmm_state, survival_metrics, qualityScore, etc.) n'ont pas de
  // colonne Supabase → les exclure, sinon l'upsert est rejeté par PostgREST (silencieusement).
  const allowedCols = [
    'aerodrome_id', 'score_global', 'niveau', 'c1', 'c2', 'c3', 'c4', 'c5',
    'prediction_3m', 'prediction_6m', 'prediction_12m',
    'prediction_interval_3m', 'prediction_interval_6m',
    'tendance', 'computed_at', 'historical_scores',
    'velocity_metrics', 'system_stress', 'proactive_alert',
    'hawkes_intensity', 'effectiveness_score', 'last_change_point',
    'incident_prediction_3m', 'incident_prediction_6m', 'incident_prediction_12m',
    'event_frequency', 'event_severity_trend', 'days_since_last_event',
    'event_trend_acceleration', 'bayesian_posterior', 'bayesian_prior',
    'bayesian_black_swan', 'scenarios', 'ensemble_confidence', 'infrastructure',
  ] as const
  const payload: Record<string, unknown> = {}
  for (const col of allowedCols) {
    if (profil[col as keyof ProfilRisque] !== undefined) payload[col] = profil[col as keyof ProfilRisque]
  }
  const { data, error } = await supabase
    .from('profils_risque')
    .upsert(payload)
    .select()
    .single()
  return { data: data as ProfilRisque | null, error: error?.message ?? null }
}
