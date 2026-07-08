import { supabase } from './supabase'
import type { Certification, Ecart, EvenementSecurite, Notification, Surveillance } from './store'

export function subscribeToEcarts(
  callback: (payload: { eventType: string; new: Ecart; old: Ecart }) => void,
) {
  return supabase
    .channel('ecarts_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'ecarts' }, callback)
    .subscribe()
}

export function subscribeToCertifications(
  callback: (payload: { eventType: string; new: Certification; old: Certification }) => void,
) {
  return supabase
    .channel('certifications_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'certifications' }, callback)
    .subscribe()
}

export function subscribeToSurveillances(
  callback: (payload: { eventType: string; new: Surveillance; old: Surveillance }) => void,
) {
  return supabase
    .channel('surveillances_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'surveillances' }, callback)
    .subscribe()
}

export function subscribeToNotifications(
  userId: string,
  callback: (payload: { eventType: string; new: Notification }) => void,
) {
  return supabase
    .channel(`notifications_${userId}`)
    .on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      callback,
    )
    .subscribe()
}

export function subscribeToMessages(
  userId: string,
  callback: (payload: { eventType: string; new: any }) => void,
) {
  return supabase
    .channel(`messages_${userId}`)
    .on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_id=eq.${userId}` },
      callback,
    )
    .subscribe()
}

export function subscribeToEvenements(
  callback: (payload: { eventType: string; new: EvenementSecurite; old: EvenementSecurite }) => void,
) {
  return supabase
    .channel('evenements_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'evenements_securite' }, callback)
    .subscribe()
}
