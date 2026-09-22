// lib/datastore/homologations.ts — Domaine homologations (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Homologation } from '../store';
import { DatastoreResult } from './_shared';

export async function fetchHomologations(): Promise<DatastoreResult<Homologation[]>> {
  const { data, error } = await supabase.from('homologations').select('*')
  return { data: data as Homologation[] | null, error: error?.message ?? null }
}

export async function updateHomologation(id: string, payload: Partial<Homologation>): Promise<DatastoreResult<Homologation>> {
  const { data, error } = await supabase
    .from('homologations')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Homologation | null, error: error?.message ?? null }
}
