// lib/__tests__/surveillancesSlice.test.ts — Phase 2 (monolithe modulaire)
// Contrat du slice surveillances, testé ISOLÉ via zustand/vanilla.
// Persistance mockée (doubles documentés).

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createSurveillancesSlice, type SurveillanceSlice } from '../store/surveillancesSlice'
import { storeEvents } from '../store/eventBus'

jest.mock('../datastore', () => ({
  createSurveillance: async (s: unknown) => ({
    data: { ...(s as object), id: 'db-id', created_at: '', updated_at: '' },
    error: null,
  }),
  updateSurveillance: async () => ({ error: null }),
  deleteSurveillance: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const base = {
  aerodrome_id: 'a1', type: 'periodique' as const, portee: ['SGS'],
  equipe_ids: [] as string[], chef_id: 'chef-1',
  date_debut: '2026-01-01', date_fin: '2026-01-03', statut: 'planifiee' as const,
}

describe('surveillancesSlice', () => {
  test('add : persistance + notification + version (doubles documentés)', async () => {
    const s = isolated<SurveillanceSlice>(createSurveillancesSlice)
    s.setState({
      plannings: [], inspecteurs: [], utilisateurs: [], user: null,
      addNotification: () => {}, incrementerVersion: () => {},
    } as unknown as Partial<SurveillanceSlice>)
    const saved = await s.getState().addSurveillance(base)
    expect(saved.id).toBeTruthy()
    expect(saved.chef_id).toBe('chef-1')
    expect(s.getState().surveillances).toHaveLength(1)
  })

  test('update statut : notifie équipe + exploitants via événement', async () => {
    const s = isolated<SurveillanceSlice>(createSurveillancesSlice)
    s.setState({
      aerodromes: [{ id: 'a1', code_oaci: 'GOOO' }],
      utilisateurs: [{ id: 'op-1', role: 'focal_operator', aerodrome_id: 'a1' }],
      incrementerVersion: () => {},
    } as unknown as Partial<SurveillanceSlice>)
    s.getState().setSurveillances([{ ...base, id: 's1', equipe_ids: ['insp-1'], created_at: '', updated_at: '' }])
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().updateSurveillance('s1', { statut: 'transmise' })
    expect(s.getState().surveillances[0].statut).toBe('transmise')
    // 1 exploitant + 1 équipier notifiés via le bus (plus d'appel direct).
    const envois = spy.mock.calls.filter(([name]) => name === 'notification:envoyer')
    expect(envois).toHaveLength(2)
    spy.mockRestore()
  })

  test('delete : planning restauré via événement + délégations purgées', async () => {
    const s = isolated<SurveillanceSlice>(createSurveillancesSlice)
    s.setState({
      plannings: [{ id: 'p1', statut: 'en_cours' }],
      certifications: [], homologations: [],
      delegations: [{ id: 'd1', surveillance_id: 's1' }],
      utilisateurs: [], addNotification: () => {},
    } as unknown as Partial<SurveillanceSlice>)
    s.getState().setSurveillances([{
      ...base, id: 's1', planning_id: 'p1', equipe_ids: [], created_at: '', updated_at: '',
    }])
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().deleteSurveillance('s1')
    expect(s.getState().surveillances).toHaveLength(0)
    // La restauration du planning est du ressort de l'abonné
    // (registerStoreSubscriptions) : ici on prouve l'émission.
    expect(spy).toHaveBeenCalledWith('planning:mission-annulee', { planning_id: 'p1' })
    spy.mockRestore()
    // Le planning reste inchangé en isolation (aucun abonné ici).
    const plannings = (s.getState() as unknown as { plannings: { statut: string }[] }).plannings
    expect(plannings[0].statut).toBe('en_cours')
    const delegations = (s.getState() as unknown as { delegations: unknown[] }).delegations
    expect(delegations).toHaveLength(0)
  })
})
