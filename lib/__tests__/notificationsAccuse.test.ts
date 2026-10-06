// lib/__tests__/notificationsAccuse.test.ts — Alertes exigeantes R4 :
// accusé de réception (vaut prise en compte) + escalade chef SNA sous délai.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createNotificationsSlice, type NotificationSlice } from '../store/notificationsSlice'

const chainable = () => {
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  const chain = ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'is', 'or']
  chain.forEach(m => { builder[m] = () => builder })
  builder.single = () => Promise.resolve({ data: { id: 'db-id' }, error: null })
  return builder
}

jest.mock('../supabase', () => ({
  supabase: { from: () => chainable() },
}))

jest.mock('../datastore', () => ({
  sendNotification: async () => ({ data: null, error: null }),
  markNotificationRead: async () => ({ data: null, error: null }),
  accuseNotification: async () => ({ data: null, error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const NOTIF = {
  id: 'n1',
  user_id: 'chef-1',
  type: 'danger' as const,
  title: 'Signalement critique — PHY',
  message: '2 écarts critiques',
  canal: 'in_app' as const,
  sent_at: new Date(Date.now() - 30 * 3600000).toISOString(),
  exige_accuse: true,
  data: { niveau: 'critique' },
}

describe('accuserReceptionNotification', () => {
  test('accuse = prise en compte + lecture, non rejouable', () => {
    const s = isolated<NotificationSlice>(createNotificationsSlice)
    s.setState({ user: { id: 'chef-1' }, utilisateurs: [], notifications: [{ ...NOTIF }], unreadCount: 1 } as never)
    s.getState().accuserReceptionNotification('n1', 'Pris en compte, mission avancée')
    const n = s.getState().notifications[0]
    expect(n.accuse_reception).toMatchObject({ par: 'chef-1', commentaire: 'Pris en compte, mission avancée' })
    expect(n.read_at).toBeTruthy()
    expect(s.getState().unreadCount).toBe(0)
    s.getState().accuserReceptionNotification('n1')
    expect(s.getState().notifications[0].accuse_reception?.commentaire).toBe('Pris en compte, mission avancée')
  })
})

describe('verifierEscaladesNotifications', () => {
  test('exigeante critique 30 h sans accusé → escalade chef SNA, une fois', () => {
    const s = isolated<NotificationSlice>(createNotificationsSlice)
    const envoyees: Array<{ user_id: string; title?: string }> = []
    s.setState({
      user: { id: 'chef-1' },
      utilisateurs: [{ id: 'sna-1', poste: 'chef_sna' }],
      notifications: [{ ...NOTIF }],
      unreadCount: 1,
      addNotification: (n: never) => { envoyees.push(n as never) },
    } as never)
    s.getState().verifierEscaladesNotifications()
    expect(envoyees).toHaveLength(1)
    expect(envoyees[0].user_id).toBe('sna-1')
    expect((s.getState().notifications[0].data as { escaladee?: boolean }).escaladee).toBe(true)
    s.getState().verifierEscaladesNotifications()
    expect(envoyees).toHaveLength(1)
  })
  test('accusée ou récente → rien', () => {
    const s = isolated<NotificationSlice>(createNotificationsSlice)
    const envoyees: unknown[] = []
    s.setState({
      user: { id: 'chef-1' },
      utilisateurs: [{ id: 'sna-1', poste: 'chef_sna' }],
      notifications: [
        { ...NOTIF, id: 'n2', accuse_reception: { par: 'chef-1', le: new Date().toISOString() } },
        { ...NOTIF, id: 'n3', sent_at: new Date().toISOString(), data: { niveau: 'critique' } },
      ],
      unreadCount: 2,
      addNotification: (n: never) => { envoyees.push(n) },
    } as never)
    s.getState().verifierEscaladesNotifications()
    expect(envoyees).toHaveLength(0)
  })
})
