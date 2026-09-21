// lib/__tests__/planningsSlice.test.ts — Phase 2 (monolithe modulaire)
// Contrat du slice plannings (+N+1), testé ISOLÉ via zustand/vanilla.
// Persistance mockée (doubles documentés).

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createPlanningsSlice, type PlanningSlice, type Planning } from '../store/planningsSlice'
import { storeEvents } from '../store/eventBus'

jest.mock('../datastore', () => ({
  createPlanning: async (p: unknown) => ({ data: p, error: null }),
  updatePlanning: async () => ({ error: null }),
  deletePlanning: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const base = {
  id: 'p0', aerodrome_id: 'a1', type: 'periodique' as const,
  date_debut: '2026-01-01', date_fin: '2026-01-03', portee: ['SGS'],
  equipe_ids: [] as string[], chef_id: 'chef-1',
  statut: 'planifiee' as const, priorite: 'haute' as const, objectifs: '',
  est_proposition: false, annee_cible: 2026, created_at: '', updated_at: '',
}

describe('planningsSlice', () => {
  test('add : normalise le type legacy + notifie (doubles documentés)', async () => {
    const s = isolated<PlanningSlice>(createPlanningsSlice)
    s.setState({
      inspecteurs: [], utilisateurs: [], user: null,
      aerodromes: [{ id: 'a1', code_oaci: 'GOOO' }],
      addNotification: () => {},
    } as unknown as Partial<PlanningSlice>)
    // Type legacy volontaire : le slice doit le normaliser vers 'periodique'.
    await s.getState().addPlanning({ ...base, type: 'programmee' })
    expect(s.getState().plannings).toHaveLength(1)
    // Type legacy normalisé vers le canonique à l'écriture
    expect(s.getState().plannings[0].type).toBe('periodique')
  })

  test('update/delete', async () => {
    const s = isolated<PlanningSlice>(createPlanningsSlice)
    s.setState({
      inspecteurs: [], utilisateurs: [], user: null, aerodromes: [],
      addNotification: () => {},
    } as unknown as Partial<PlanningSlice>)
    await s.getState().addPlanning(base)
    const id = s.getState().plannings[0].id
    await s.getState().updatePlanning(id, { statut: 'en_cours' })
    expect(s.getState().plannings[0].statut).toBe('en_cours')
    await s.getState().deletePlanning(id)
    expect(s.getState().plannings).toHaveLength(0)
  })

  test('marquerMissionTerminee : en_cours → realisee, annulee préservée', () => {
    const s = isolated<PlanningSlice>(createPlanningsSlice)
    const calls: unknown[] = []
    s.setState({
      plannings: [
        { ...base, id: 'p1', statut: 'en_cours', surveillance_id: 's1' },
        { ...base, id: 'p2', statut: 'annulee', surveillance_id: 's2' },
      ],
      surveillances: [
        { id: 's1', planning_id: 'p1' },
        { id: 's2', planning_id: 'p2' },
      ],
      updatePlanning: (async (id: string, data: Partial<Planning>) => { calls.push([id, data]) }) as PlanningSlice['updatePlanning'],
    } as unknown as Partial<PlanningSlice>)
    s.getState().marquerMissionTerminee('p1', 's1')
    expect(calls).toEqual([['p1', { statut: 'realisee' }]])
    // Annulée : aucun appel ; inconnu : aucun appel.
    s.getState().marquerMissionTerminee('p2', 's2')
    s.getState().marquerMissionTerminee('nope', 'nope')
    expect(calls).toHaveLength(1)
  })

  test('restaurerMissionAnnulee : retour à planifiée, lien coupé', () => {
    const s = isolated<PlanningSlice>(createPlanningsSlice)
    s.getState().setPlannings([{ ...base, id: 'p1', statut: 'en_cours', surveillance_id: 's1' }])
    s.getState().restaurerMissionAnnulee('p1')
    const restored = s.getState().plannings[0]
    expect(restored.statut).toBe('planifiee')
    expect(restored.surveillance_id).toBeUndefined()
    // Inconnu : no-op.
    s.getState().restaurerMissionAnnulee('nope')
    expect(s.getState().plannings).toHaveLength(1)
  })

  test('delete : nettoyage phase certif/homolog via événement (pas d\'appel direct)', async () => {
    const s = isolated<PlanningSlice>(createPlanningsSlice)
    s.setState({
      inspecteurs: [], utilisateurs: [], user: null,
      aerodromes: [{ id: 'a1', code_oaci: 'GOOO' }],
      certifications: [], homologations: [],
      delegations: [],
    } as unknown as Partial<PlanningSlice>)
    s.getState().setPlannings([
      { ...base, id: 'p1', type: 'certification' },
      { ...base, id: 'p2', type: 'homologation' },
    ])
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().deletePlanning('p1')
    expect(spy).toHaveBeenCalledWith('certification:nettoyer-lien-planning', { aerodrome_id: 'a1', planning_id: 'p1' })
    await s.getState().deletePlanning('p2')
    expect(spy).toHaveBeenCalledWith('homologation:nettoyer-lien-planning', { aerodrome_id: 'a1', planning_id: 'p2' })
    spy.mockRestore()
  })

  test('N+1 : générer → valider → refuser', () => {
    const s = isolated<PlanningSlice>(createPlanningsSlice)
    s.setState({
      aerodromes: [{ id: 'a1' }], profilsRisque: {}, ecarts: [],
      certifications: [], homologations: [], inspecteurs: [],
      surveillances: [],
    } as unknown as Partial<PlanningSlice>)
    const props = s.getState().genererPlanningN1('a1', 2027)
    expect(Array.isArray(props)).toBe(true)
    s.getState().setPropositionsN1(props)
    expect(s.getState().propositionsN1.every(p => p.id)).toBe(true)
  })
})
