// lib/datastore/checklistMemory.ts — Mémoire checklist partagée (SECTION 28).
// Persistance serveur best-effort (voir tranches) : l'apprentissage n'est
// plus cantonné à l'IndexedDB du poste.
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { ChecklistMemoryRecord } from '../store';
import { DatastoreResult } from './_shared';

export async function fetchChecklistMemory(): Promise<DatastoreResult<ChecklistMemoryRecord[]>> {
  const { data, error } = await supabase
    .from('checklist_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5000)
  return { data: (data ?? []) as ChecklistMemoryRecord[], error: error?.message ?? null }
}

/** Upsert last-write-wins sur la clé composite (id texte, pas uuid). */
export async function upsertChecklistMemory(
  record: ChecklistMemoryRecord,
): Promise<DatastoreResult<ChecklistMemoryRecord>> {
  const { data, error } = await supabase
    .from('checklist_memory')
    .upsert({ ...record, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  return { data: data as ChecklistMemoryRecord | null, error: error?.message ?? null }
}
