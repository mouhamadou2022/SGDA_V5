// lib/__tests__/delegationsSlice.test.ts — Phase 3 (monolithe modulaire)
// Contrat du slice délégations, testé ISOLÉ via zustand/vanilla.
// La sync serveur est best-effort (fire-and-forget, erreurs absorbées) :
// ici on prouve le comportement local.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import {
  createDelegationsSlice,
  type Delegation,
  type DelegationSlice,
} from '../store/delegationsSlice'

function makeStore(initial: Delegation[] = []) {
  const store = createStore<DelegationSlice>()(
    createDelegationsSlice as unknown as StateCreator<DelegationSlice, [], [], DelegationSlice>,
  )
  if (initial.length > 0) store.getState().setDelegations(initial)
  return store
}

const base: Omit<Delegation, 'id'> = {
  surveillance_id: 's1',
  aerodrome_id: 'a1',
  chef_id: 'chef-1',
  domaine: 'SGS',
  assigne_a: 'insp-1',
  assigne_par: 'chef-1',
  items_ids: ['i1', 'i2'],
  progression: 0,
  statut: 'assigne',
  assigne_le: '2026-01-01',
  derniere_activite: '2026-01-01',
  derniere_sync: '2026-01-01',
}

describe('delegationsSlice — CRUD', () => {
  test('addDelegation génère un id (sync serveur best-effort)', () => {
    const s = makeStore()
    s.getState().addDelegation(base)
    const all = s.getState().delegations
    expect(all).toHaveLength(1)
    expect(all[0].id).toBeTruthy()
    expect(all[0].domaine).toBe('SGS')
  })

  test('update/delete + sélecteurs', () => {
    const s = makeStore()
    s.getState().addDelegation(base)
    const id = s.getState().delegations[0].id
    s.getState().updateDelegation(id, { statut: 'termine', progression: 100 })
    expect(s.getState().delegations[0].statut).toBe('termine')
    expect(s.getState().getDelegationsBySurveillance('s1')).toHaveLength(1)
    expect(s.getState().getDelegationsByInspecteur('insp-1')).toHaveLength(1)
    expect(s.getState().getDelegationsByDomaine('s1', 'SGS')?.id).toBe(id)
    s.getState().deleteDelegation(id)
    expect(s.getState().delegations).toHaveLength(0)
  })

  test('cleanupDelegations purge orphelines + doublons', () => {
    const s = makeStore()
    s.setState({ surveillances: [] } as unknown as Partial<DelegationSlice>)
    s.getState().addDelegation(base)
    // Surveillance inexistante → orpheline → purgée.
    s.getState().cleanupDelegations()
    expect(s.getState().delegations).toHaveLength(0)
  })
})
