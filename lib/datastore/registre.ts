// lib/datastore/registre.ts — Domaine registre (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { RegistreEntry } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// REGISTRE ENTRIES (Archivage)
// ─────────────────────────────────────────────────────────────

export async function saveRegistreEntry(entry: RegistreEntry): Promise<DatastoreResult<RegistreEntry>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('registre_entries')
    .upsert({
      id: entry.id,
      type: entry.type,
      reference: entry.reference,
      titre: entry.titre,
      description: entry.description,
      date_entree: entry.date_entree,
      aerodrome_id: entry.aerodrome_id || null,
      fichiers: JSON.parse(JSON.stringify(entry.fichiers)),
      timeline: JSON.parse(JSON.stringify(entry.timeline)),
      statut: entry.statut,
      auto_generated: entry.auto_generated,
      source_id: entry.source_id || null,
      source_type: entry.source_type || null,
      metadata: entry.metadata || null,
      ia_analysis: entry.ia_analysis || null,
      created_by: entry.created_by,
      updated_at: now,
    }, { onConflict: 'id' })
    .select()
    .single()
  return { data: data as RegistreEntry | null, error: error?.message ?? null }
}

export async function deleteRegistreEntryFromDB(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('registre_entries').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function getRegistreEntriesFromDB(): Promise<DatastoreResult<RegistreEntry[]>> {
  const { data, error } = await supabase
    .from('registre_entries')
    .select('*')
    .order('date_entree', { ascending: false })
  return { data: data as RegistreEntry[] | null, error: error?.message ?? null }
}
