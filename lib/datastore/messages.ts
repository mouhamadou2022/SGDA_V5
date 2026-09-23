// lib/datastore/messages.ts — Domaine messages (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Message } from '../store';
import { DatastoreResult, marshalMessage, unmarshalMessage } from './_shared';

// ─────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────



export async function fetchMessages(userId: string): Promise<DatastoreResult<Message[]>> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .limit(200)
  // Charger aussi les messages où l'utilisateur est en CC
  const { data: ccData, error: ccError } = await supabase
    .from('messages')
    .select('*')
    .filter('cc_id', 'cs', `["${userId}"]`)
    .limit(200)
  const merged = [...(data ?? []), ...(ccData ?? [])]
  const seen = new Set<string>()
  const unique = merged.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
  unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return { data: unique.map(unmarshalMessage) as Message[], error: error?.message ?? ccError?.message ?? null }
}

export async function createMessage(payload: Omit<Message, 'id' | 'created_at'>): Promise<DatastoreResult<Message>> {
  try {
    const now = new Date().toISOString()
    const marshalled = marshalMessage(payload as Partial<Message>)
    // Utiliser l'ID fourni par le payload (même que l'optimistic update)
    if (!marshalled.id) marshalled.id = crypto.randomUUID()
    if (!marshalled.created_at) marshalled.created_at = now
    const { data, error } = await supabase
      .from('messages')
      .insert(marshalled)
      .select()
      .single()
    if (error) {
      console.error('[datastore/createMessage] Supabase error:', error)
      return { data: null, error: error?.message ?? null }
    }
    return { data: unmarshalMessage(data) as Message, error: null }
  } catch (err) {
    console.error('[datastore/createMessage] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function updateMessage(id: string, payload: Partial<Message>): Promise<DatastoreResult<Message>> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .update(marshalMessage(payload))
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.warn('[datastore/updateMessage] Supabase error:', error?.message || JSON.stringify(error))
      return { data: null, error: error?.message ?? JSON.stringify(error) }
    }
    return { data: unmarshalMessage(data) as Message, error: null }
  } catch (err) {
    console.warn('[datastore/updateMessage] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function deleteMessage(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
