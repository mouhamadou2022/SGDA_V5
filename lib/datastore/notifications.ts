// lib/datastore/notifications.ts — Domaine notifications (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Notification } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<DatastoreResult<Notification[]>> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(100)
  return { data: data as Notification[] | null, error: error?.message ?? null }
}

export async function markNotificationRead(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function sendNotification(payload: Omit<Notification, 'id' | 'sent_at' | 'read_at'>): Promise<DatastoreResult<Notification>> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ ...payload, sent_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as Notification | null, error: error?.message ?? null }
}
