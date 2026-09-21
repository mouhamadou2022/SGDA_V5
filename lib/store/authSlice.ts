// lib/store/authSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Auth (session utilisateur) extraite du store monolithique,
// comportement identique. Appels inter-slices via get() (store composé) :
// setNotifications. Démarre la sync dossiers via dossiersSlice
// (import statique sans cycle : dossiersSlice n'importe pas authSlice).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { AuthUser } from '../auth'
import type { Notification } from './notificationsSlice'
import { startDossiersSync } from './dossiersSlice'

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface AuthSlice {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  authLoading: boolean
  setAuthLoading: (loading: boolean) => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createAuthSlice)
// ─────────────────────────────────────────────────────────────

export const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (set, get) => ({
  user: null,

  setUser: (user) => {
    set({ user })
    if (user?.id) {
      startDossiersSync(user.id)
      import('@/lib/datastore').then(({ fetchNotifications }) => {
        fetchNotifications(user.id).then((res) => {
          if (res.data) get().setNotifications(res.data as Notification[])
        }).catch((err) => console.error('[Notifications] Échec fetch:', err))
      }).catch((err) => console.error('[Notifications] Échec import datastore:', err))
    }
  },

  authLoading: false,

  setAuthLoading: (loading) => set({ authLoading: loading }),
})
