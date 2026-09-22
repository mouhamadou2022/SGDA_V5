// lib/datastore/competences.ts — Domaine competences (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Competence } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// COMPETENCES
// ─────────────────────────────────────────────────────────────

export async function fetchCompetences(): Promise<DatastoreResult<Competence[]>> {
  const { data, error } = await supabase.from('competences').select('*')
  return { data: data as Competence[] | null, error: error?.message ?? null }
}

export async function createCompetence(payload: Omit<Competence, 'id'>): Promise<DatastoreResult<Competence>> {
  const { data, error } = await supabase
    .from('competences')
    .insert({ ...payload, id: crypto.randomUUID() })
    .select()
    .single()
  return { data: data as Competence | null, error: error?.message ?? null }
}

export async function getCompetencesByInspecteur(inspecteurId: string): Promise<DatastoreResult<Competence[]>> {
  const { data, error } = await supabase
    .from('competences')
    .select('*')
    .eq('inspecteur_id', inspecteurId)
  return { data: data as Competence[] | null, error: error?.message ?? null }
}

export async function updateCompetence(id: string, payload: Partial<Competence>): Promise<DatastoreResult<Competence>> {
  const { data, error } = await supabase
    .from('competences')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Competence | null, error: error?.message ?? null }
}

export async function deleteCompetence(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('competences').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
