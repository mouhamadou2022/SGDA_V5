// lib/datastore/historiqueEcarts.ts — Domaine historique des écarts.
// Sans sync, les refus passés (overwrite de evaluation_pac/validation_preuves)
// ne sont visibles que sur le poste d'évaluation : l'exploitant resoumet à
// l'aveugle. Sync best-effort idempotente (upsert par id).

import { supabase } from '../supabase';
import type { HistoriqueEcart } from '../store/ecartsTypes';
import { DatastoreResult } from './_shared';

export async function listHistoriqueEcart(ecartId: string): Promise<DatastoreResult<HistoriqueEcart[]>> {
  const { data, error } = await supabase
    .from('historique_ecarts')
    .select('*')
    .eq('ecart_id', ecartId)
    .order('date', { ascending: true });
  return { data: data as HistoriqueEcart[] | null, error: error?.message ?? null };
}

export async function syncHistoriqueEcart(
  ecartId: string,
  entries: HistoriqueEcart[],
): Promise<DatastoreResult<null>> {
  if (entries.length === 0) return { data: null, error: null };
  const rows = entries.map(e => ({ ...e, ecart_id: ecartId }));
  const { error } = await supabase
    .from('historique_ecarts')
    .upsert(rows, { onConflict: 'id' });
  return { data: null, error: error?.message ?? null };
}
