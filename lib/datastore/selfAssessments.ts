// lib/datastore/selfAssessments.ts — Domaine auto-évaluation Bow-Tie.
// Sans persistance, tout le travail de la modale (cases, observations,
// actions perso) est perdu à la fermeture. Une ligne par utilisateur
// (UNIQUE user_id), reponses = dernier état. Best-effort.

import { supabase } from '../supabase';
import { DatastoreResult } from './_shared';

export interface ActionAutoEvaluee {
  id: string;
  texte: string;
  gain?: number;
  checked: boolean;
}

export interface AutoEvaluationBowTie {
  aerodrome_id: string;
  checked: Record<string, boolean>;
  observations: Record<string, string>;
  customActions: Array<{ id: string; barriereId: string; texte: string; gain: number }>;
  /** Toutes les actions avec leur texte (générées + perso) — pour la file. */
  actions?: ActionAutoEvaluee[];
  scoreProjete: number;
  savedAt: string;
}

export async function chargerAutoEvaluation(
  userId: string,
): Promise<DatastoreResult<AutoEvaluationBowTie | null>> {
  const { data, error } = await supabase
    .from('self_assessments')
    .select('reponses')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: error.message ?? null };
  const r = (data as { reponses?: unknown } | null)?.reponses;
  if (!r || typeof r !== 'object') return { data: null, error: null };
  return { data: r as AutoEvaluationBowTie, error: null };
}

export async function sauvegarderAutoEvaluation(
  userId: string,
  aerodromeId: string,
  contenu: Omit<AutoEvaluationBowTie, 'aerodrome_id' | 'savedAt'> & { scoreProjete: number },
): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('self_assessments').upsert(
    {
      user_id: userId,
      aerodrome_id: aerodromeId,
      reponses: { ...contenu, aerodrome_id: aerodromeId, savedAt: new Date().toISOString() },
    },
    { onConflict: 'user_id' },
  );
  return { data: null, error: error?.message ?? null };
}
