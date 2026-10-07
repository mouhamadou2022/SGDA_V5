// lib/datastore/presence.ts — Domaine presence (fiches de présence).
// Sync best-effort : sans elle, les fiches signées sur un poste restent
// invisibles ailleurs (même classe d'orphelin que les événements avant
// leur chargement initial). Les échecs ne bloquent jamais l'UI.

import { supabase } from '../supabase';
import type { PresenceEntry } from '../store/presenceSlice';
import { DatastoreResult } from './_shared';

export async function fetchPresence(): Promise<DatastoreResult<PresenceEntry[]>> {
  const { data, error } = await supabase
    .from('presence_entries')
    .select('*')
    .order('signature_date', { ascending: false })
    .limit(2000);
  return { data: data as PresenceEntry[] | null, error: error?.message ?? null };
}

export async function createPresence(
  payload: Omit<PresenceEntry, 'id'> & { id?: string },
): Promise<DatastoreResult<PresenceEntry>> {
  const { data, error } = await supabase
    .from('presence_entries')
    .insert(payload)
    .select()
    .single();
  return { data: data as PresenceEntry | null, error: error?.message ?? null };
}

export async function updatePresence(
  id: string,
  patch: Partial<PresenceEntry>,
): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('presence_entries').update(patch).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

export async function deletePresence(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('presence_entries').delete().eq('id', id);
  return { data: null, error: error?.message ?? null };
}
