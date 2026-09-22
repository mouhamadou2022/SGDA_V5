// lib/datastore/utilisateurs.ts — Domaine utilisateurs (fetch/update + create/delete) (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Utilisateur } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// UTILISATEURS
// ─────────────────────────────────────────────────────────────

export async function fetchUtilisateurs(): Promise<DatastoreResult<Utilisateur[]>> {
  const { data, error } = await supabase.from('utilisateurs').select('*').order('nom')
  return { data: data as Utilisateur[] | null, error: error?.message ?? null }
}

export async function updateUtilisateur(id: string, payload: Partial<Utilisateur>): Promise<DatastoreResult<Utilisateur>> {
  const { data, error } = await supabase
    .from('utilisateurs')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Utilisateur | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// UTILISATEURS (CRUD complet)
// ─────────────────────────────────────────────────────────────

export async function createUtilisateur(payload: Omit<Utilisateur, 'id'>): Promise<DatastoreResult<Utilisateur>> {
  const { data, error } = await supabase
    .from('utilisateurs')
    .insert({ ...payload, id: crypto.randomUUID() })
    .select()
    .single()
  return { data: data as Utilisateur | null, error: error?.message ?? null }
}

export async function deleteUtilisateur(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('utilisateurs').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
