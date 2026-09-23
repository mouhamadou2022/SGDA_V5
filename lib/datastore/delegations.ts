// lib/datastore/delegations.ts — Domaine delegations (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Delegation } from '../store';
import { DatastoreResult, marshalDelegation, unmarshalDelegation } from './_shared';

// ─────────────────────────────────────────────────────────────
// DÉLÉGATIONS (Phase 3 : persistance serveur, best-effort côté slice)
// La table existait (SQL ligne ~1275) mais n'était ni lue ni écrite.
// ─────────────────────────────────────────────────────────────

/**
 * Retire les champs purement locaux avant envoi (la table n'a pas
 * de colonne `assigne_nom` — nom d'affichage calculé côté client).
 */


export async function fetchDelegations(): Promise<DatastoreResult<Delegation[]>> {
  const { data, error } = await supabase.from('delegations').select('*').order('assigne_le', { ascending: false })
  return { data: (data ?? []).map(unmarshalDelegation), error: error?.message ?? null }
}

export async function createDelegation(payload: Delegation): Promise<DatastoreResult<Delegation>> {
  const { data, error } = await supabase
    .from('delegations')
    .insert(marshalDelegation(payload))
    .select()
    .single()
  return { data: data ? unmarshalDelegation(data) : null, error: error?.message ?? null }
}

export async function updateDelegation(id: string, payload: Partial<Delegation>): Promise<DatastoreResult<Delegation>> {
  const colonnes = { ...payload }
  delete colonnes.assigne_nom
  const { data, error } = await supabase
    .from('delegations')
    .update({ ...colonnes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data ? unmarshalDelegation(data) : null, error: error?.message ?? null }
}

export async function deleteDelegation(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('delegations').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
