// lib/__tests__/storeSlicesWave6.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices auth/utilisateurs/aerodromes, testés ISOLÉS via
// zustand/vanilla. Persistance + Auth API mockées (doubles documentés).

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createAuthSlice, type AuthSlice } from '../store/authSlice'
import type { AuthUser } from '../auth'
import { createUtilisateursSlice, type UtilisateurSlice } from '../store/utilisateursSlice'
import { createAerodromesSlice, type AerodromeSlice } from '../store/aerodromesSlice'
import { stopDossiersSync } from '../store/dossiersSlice'

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
  createAerodrome: async (a: unknown) => ({ data: { ...(a as object), id: 'db-id' }, error: null }),
  updateAerodrome: async () => ({ error: null }),
  deleteAerodrome: async () => ({ error: null }),
  revokeCodeAcces: async () => ({ error: null }),
  updateUtilisateur: async () => ({ error: null }),
  deleteUtilisateur: async () => ({ error: null }),
  createInspecteur: async () => ({ error: null }),
  fetchNotifications: async () => ({ data: [], error: null }),
}))

jest.mock('../notifications', () => ({
  notifyAerodromeDeleted: async () => {},
  notifyInspecteurDeleted: () => {},
  notifyDeletionCascade: () => {},
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

afterEach(() => {
  // La connexion (setUser) démarre le polling dossiers : le stopper pour
  // ne pas laisser d'intervalle ouvert après les tests.
  stopDossiersSync()
})

describe('authSlice', () => {
  test('setUser/setAuthLoading', () => {
    const s = isolated<AuthSlice>(createAuthSlice)
    s.getState().setAuthLoading(true)
    expect(s.getState().authLoading).toBe(true)
    s.setState({ setNotifications: () => {} } as unknown as Partial<AuthSlice>)
    s.getState().setUser({ id: 'u1' } as AuthUser)
    expect(s.getState().user?.id).toBe('u1')
    s.getState().setUser(null)
    expect(s.getState().user).toBeNull()
  })
})

describe('utilisateursSlice', () => {
  const base = {
    id: 'u1', email: 'a@b.c', nom: 'N', prenom: 'P', role: 'admin', statut: 'actif',
  }
  test('add/get/update', async () => {
    const s = isolated<UtilisateurSlice>(createUtilisateursSlice)
    await s.getState().addUtilisateur(base)
    expect(s.getState().getUtilisateur('u1')?.email).toBe('a@b.c')
    await s.getState().updateUtilisateur('u1', { statut: 'inactif' })
    expect(s.getState().getUtilisateur('u1')?.statut).toBe('inactif')
  })

  test('delete sans inspecteur lié', async () => {
    const s = isolated<UtilisateurSlice>(createUtilisateursSlice)
    // Double : deleteUtilisateur lit state.inspecteurs (slice formations en prod).
    s.setState({ inspecteurs: [], addNotification: () => {} } as unknown as Partial<UtilisateurSlice>)
    await s.getState().addUtilisateur(base)
    await s.getState().deleteUtilisateur('u1')
    expect(s.getState().utilisateurs).toHaveLength(0)
    // Inexistant → no-op
    await s.getState().deleteUtilisateur('nope')
  })
})

describe('aerodromesSlice', () => {
  const base = {
    id: 'tmp', nom: 'A', code_oaci: 'GOOO', type: 'national' as const, type_entite: 'aerodrome' as const,
    categorie_sslia: '1', region: 'Dakar', maturite_sgs: 50, statut: 'actif' as const,
    lat: 0, lon: 0, altitude: 0, created_at: '', updated_at: '',
  }
  test('add optimiste + update + actifs', async () => {
    const s = isolated<AerodromeSlice>(createAerodromesSlice)
    s.setState({ recalculerProfilRisque: async () => {} } as unknown as Partial<AerodromeSlice>)
    const saved = await s.getState().addAerodrome(base)
    expect(s.getState().aerodromes).toHaveLength(1)
    expect(saved.id).toBeTruthy()
    await s.getState().updateAerodrome(saved.id, { statut: 'suspendu' })
    expect(s.getState().aerodromes[0].statut).toBe('suspendu')
    expect(s.getState().getActiveAerodromes()).toHaveLength(1)
  })

  test('delete : cascade locale + codes + profils (doubles documentés)', async () => {
    const s = isolated<AerodromeSlice>(createAerodromesSlice)
    s.setState({
      codesAcces: [{ id: 'c1', aerodrome_id: 'a1', statut: 'actif' }],
      utilisateurs: [], surveillances: [{ id: 's1', aerodrome_id: 'a1' }],
      certifications: [], homologations: [], ecarts: [], plannings: [],
      profilsRisque: { a1: {} }, iaSuggestions: [],
      addNotification: () => {}, incrementerVersion: () => {},
    } as unknown as Partial<AerodromeSlice>)
    s.getState().setAerodromes([{ ...base, id: 'a1' }])
    await s.getState().deleteAerodrome('a1')
    const state = s.getState()
    expect(state.aerodromes).toHaveLength(0)
    // Vue élargie documentée : ces clés vivent dans d'autres slices
    // (store composé en production).
    const elargi = state as unknown as Record<string, { length: number } & Record<string, unknown>>
    expect(elargi['surveillances']).toHaveLength(0)
    expect(elargi['codesAcces']).toHaveLength(0)
    expect((elargi['profilsRisque'] as Record<string, unknown>)['a1']).toBeUndefined()
    // Inexistant → no-op
    await s.getState().deleteAerodrome('nope')
  })
})
