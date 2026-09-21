// lib/store/notificationsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Notifications extraite du store monolithique, comportement identique.
// Lit getUtilisateur via get() (store composé) ; throttle email local au slice.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  user_id: string
  type: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  message: string
  link?: string
  canal: 'in_app' | 'email' | 'sms' | 'email_sms'
  sent_at: string
  read_at?: string
  data?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface NotificationSlice {
  notifications: Notification[]
  unreadCount: number
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Omit<Notification, 'id' | 'sent_at'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  envoyerNotificationMultiCanal: (userId: string, notification: Omit<Notification, 'id' | 'sent_at' | 'user_id'>, canaux: Notification['canal'][]) => Promise<void>
}

// Throttle email : max 1 email/30s par utilisateur (déplacé avec le slice).
const emailThrottle = new Map<string, number>()

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createNotificationsSlice)
// ─────────────────────────────────────────────────────────────

export const createNotificationsSlice: StateCreator<AppStore, [], [], NotificationSlice> = (set, get) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter((n) => !n.read_at).length,
  }),

  addNotification: (notification) => {
    const newNotification: Notification = {
      id: crypto.randomUUID(),
      sent_at: new Date().toISOString(),
      ...notification
    }
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }))
    // Persister dans Supabase (fire & forget)
    import('@/lib/datastore').then(({ sendNotification }) => {
      const { id, sent_at, ...payload } = newNotification
      sendNotification(payload).catch(() => {})
    }).catch(() => {})
    const utilisateur = get().getUtilisateur(notification.user_id)
    // Email — throttle: max 1 email/30s par utilisateur
    if ((notification.canal === 'email' || notification.canal === 'email_sms') && utilisateur?.notifications_email !== false) {
      const now = Date.now()
      const lastSent = emailThrottle.get(notification.user_id) || 0
      if (now - lastSent >= 30000) {
        emailThrottle.set(notification.user_id, now)
        const emailTo = utilisateur?.notification_email || utilisateur?.email
        if (emailTo) {
          fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: emailTo,
              subject: `SGDA - ${notification.title || 'Notification'}`,
              message: notification.message,
              link: notification.link
            })
          })
          .catch(() => {})
        }
      }
    }
    // SMS
    if ((notification.canal === 'sms' || notification.canal === 'email_sms') && utilisateur?.telephone) {
      fetch('/api/notifications/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: utilisateur.telephone,
          message: `SGDA: ${notification.message}`
        })
      })
      .catch(error => console.error('[Notification] Erreur sms:', error))
    }
  },

  envoyerNotificationMultiCanal: async (userId, notification, canaux) => {
    const hasEmail = canaux.includes('email') || canaux.includes('email_sms')
    const canalFinal: Notification['canal'] = hasEmail ? 'email_sms' : 'in_app'
    get().addNotification({
      user_id: userId,
      ...notification,
      canal: canalFinal
    })
  },

  markAsRead: (id) => {
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read_at).length
      }
    })
    import('@/lib/datastore').then(({ markNotificationRead }) => {
      markNotificationRead(id).catch(() => {})
    }).catch(() => {})
  },

  markAllAsRead: () => {
    const unreadIds = get().notifications.filter((n) => !n.read_at).map((n) => n.id)
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        read_at: n.read_at || new Date().toISOString(),
      })),
      unreadCount: 0,
    }))
    import('@/lib/datastore').then(({ markNotificationRead }) => {
      unreadIds.forEach((id) => markNotificationRead(id).catch(() => {}))
    }).catch(() => {})
  },
})
