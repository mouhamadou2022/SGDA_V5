// lib/datastore/realtime.ts — Domaine realtime (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import { REALTIME_LISTEN_TYPES, type RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Surveillance, Ecart, Certification, Notification, Message } from '../store';

// ─────────────────────────────────────────────────────────────
// REALTIME SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Adapte nos callbacks au typage strict du canal (payload réel transmis
 * tel quel — eventType/new/old sont bien les champs du payload Postgres).
 */
function adapter<P>(callback: (payload: P) => void) {
  return (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) =>
    callback(payload as unknown as P);
}

export function subscribeToSurveillances(
  callback: (payload: { eventType: string; new: Surveillance; old: Surveillance }) => void,
) {
  return supabase
    .channel('surveillances_changes')
    .on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, { event: '*', schema: 'public', table: 'surveillances' }, adapter(callback))
    .subscribe()
}

export function subscribeToEcarts(
  callback: (payload: { eventType: string; new: Ecart; old: Ecart }) => void,
) {
  return supabase
    .channel('ecarts_changes')
    .on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, { event: '*', schema: 'public', table: 'ecarts' }, adapter(callback))
    .subscribe()
}

export function subscribeToCertifications(
  callback: (payload: { eventType: string; new: Certification; old: Certification }) => void,
) {
  return supabase
    .channel('certifications_changes')
    .on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, { event: '*', schema: 'public', table: 'certifications' }, adapter(callback))
    .subscribe()
}

export function subscribeToNotifications(
  userId: string,
  callback: (payload: { eventType: string; new: Notification }) => void,
) {
  return supabase
    .channel(`notifications_${userId}`)
    .on(
      REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      adapter(callback),
    )
    .subscribe()
}

export function subscribeToMessages(
  userId: string,
  callback: (payload: { eventType: string; new: Message }) => void,
) {
  return supabase
    .channel(`messages_${userId}`)
    .on(
      REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_id=eq.${userId}` },
      adapter(callback),
    )
    .subscribe()
}
