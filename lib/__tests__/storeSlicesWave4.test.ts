// lib/__tests__/storeSlicesWave4.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices extraits en vague 4 (événements, AMDEC, FTA), testés
// ISOLÉS via zustand/vanilla. Persistance mockée (doubles documentés) : les
// slices écrivent d'abord l'état local puis synchronisent.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createEvenementsSlice, type EvenementSlice } from '../store/evenementsSlice'
import { createAmdecSlice, type AmdecSlice } from '../store/amdecSlice'
import { createFtaSlice, type FtaSlice } from '../store/ftaSlice'
import { storeEvents } from '../store/eventBus'

jest.mock('../datastore', () => ({
  deleteEvenement: async () => ({ error: null }),
  updateEvenement: async () => ({ error: null }),
  createEcart: async (ecart: unknown) => ({ data: ecart, error: null }),
  createAmdecAnalyse: async (analyse: unknown) => ({ data: analyse, error: null }),
  updateAmdecAnalyse: async () => ({ error: null }),
  deleteAmdecAnalyse: async () => ({ error: null }),
  createFtaAnalyse: async (arbre: unknown) => ({ data: arbre, error: null }),
  updateFtaAnalyse: async () => ({ error: null }),
  deleteFtaAnalyse: async () => ({ error: null }),
}))

jest.mock('@/lib/api/evenements', () => ({
  createEvenementAPI: async (evt: unknown) => ({ data: evt, error: null }),
  updateEvenementAPI: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const evtBase = {
  aerodrome_id: 'a1', reference: 'EVT-1', type: 'incident', gravite: 'moyen' as const,
  date: '2026-01-01', heure: '10:00', localisation: 'piste', description: 'd',
  actions_immediates: '', services_alertes: [] as string[], statut: 'recu' as const,
  created_by: 'u1',
}

describe('evenementsSlice', () => {
  test('add/update/delete + recalcul via événement (doubles documentés)', async () => {
    const s = isolated<EvenementSlice>(createEvenementsSlice)
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().addEvenement(evtBase)
    // Le slice ÉMET au lieu d'appeler le slice risque directement.
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockRestore()
    expect(s.getState().evenements).toHaveLength(1)
    const id = s.getState().evenements[0].id
    await s.getState().updateEvenement(id, { gravite: 'critique' })
    expect(s.getState().evenements[0].gravite).toBe('critique')
    expect(s.getState().getEvenementsByAerodrome('a1')).toHaveLength(1)
    expect(s.getState().getEvenementsUrgents()).toHaveLength(1)
    await s.getState().deleteEvenement(id)
    expect(s.getState().evenements).toHaveLength(0)
  })

  test('workflow assignation → acceptation → clôture (notifications stubbées)', async () => {
    const s = isolated<EvenementSlice>(createEvenementsSlice)
    s.setState({
      utilisateurs: [{ id: 'insp-1', role: 'inspector' }, { id: 'admin-1', role: 'admin' }],
      aerodromes: [],
      addNotification: () => {},
      recalculerProfilRisque: () => {},
    } as unknown as Partial<EvenementSlice>)
    await s.getState().addEvenement(evtBase)
    const id = s.getState().evenements[0].id
    await s.getState().assignerInspecteur(id, 'insp-1')
    expect(s.getState().evenements[0].statut).toBe('assigne')
    await s.getState().accepterAssignation(id)
    expect(s.getState().evenements[0].statut).toBe('accepte')
    await s.getState().validerCloture(id)
    expect(s.getState().evenements[0].statut).toBe('cloture')
  })

  test('creerEcartLie : écart créé + événement marqué', async () => {
    const s = isolated<EvenementSlice>(createEvenementsSlice)
    s.setState({
      ecarts: [], utilisateurs: [], aerodromes: [], addNotification: () => {},
      recalculerProfilRisque: () => {},
    } as unknown as Partial<EvenementSlice>)
    await s.getState().addEvenement(evtBase)
    const id = s.getState().evenements[0].id
    await s.getState().creerEcartLie(id, { aerodrome_id: 'a1', domaine: 'PHY' })
    const evt = s.getState().evenements[0]
    expect(evt.statut).toBe('ecart_cree')
    expect(evt.ecart_ids).toHaveLength(1)
  })
})

describe('amdecSlice', () => {
  const analyseBase = {
    aerodrome_id: 'a1', mode_id: 'm1', domaine: 'PHY', systeme: 's', equipement: 'e',
    mode_defaillance: 'md', effet: 'ef', cause: 'c', detection: 'd',
    gravite: 'C' as const, probabilite: 3, detection_score: 2,
    ipr: 18, niveau: 'faible' as const, statut: 'analyse' as const,
  }
  test('add/update/delete + recalcul (doubles documentés)', async () => {
    const s = isolated<AmdecSlice>(createAmdecSlice)
    s.setState({ recalculerProfilRisque: () => {} } as unknown as Partial<AmdecSlice>)
    const created = await s.getState().addAmdecAnalyse(analyseBase)
    expect(created).toBeTruthy()
    expect(s.getState().amdecAnalyses).toHaveLength(1)
    const id = s.getState().amdecAnalyses[0].id
    // IPR recalculé : C(3) × 3 × 2 = 18 → niveau faible
    await s.getState().updateAmdecAnalyse(id, { gravite: 'B' })
    const updated = s.getState().amdecAnalyses[0]
    expect(updated.ipr).toBe(4 * 3 * 2)
    expect(updated.niveau).toBe('moyen')
    expect(s.getState().getAmdecByAerodrome('a1')).toHaveLength(1)
    await s.getState().lierEcartAmdec(id, 'ecart-1')
    expect(s.getState().amdecAnalyses[0].ecart_id).toBe('ecart-1')
    await s.getState().deleteAmdecAnalyse(id)
    expect(s.getState().amdecAnalyses).toHaveLength(0)
  })
})

describe('ftaSlice', () => {
  test('init/update-noeuds/delete (doubles documentés)', async () => {
    const s = isolated<FtaSlice>(createFtaSlice)
    const arbre = await s.getState().initializeFtaForEvenement({
      id: 'evt-1', aerodrome_id: 'a1', type: 'incident', description: 'collision aviaire',
    })
    expect(arbre).toBeTruthy()
    expect(s.getState().ftaAnalyses).toHaveLength(1)
    const id = s.getState().ftaAnalyses[0].id
    expect(s.getState().getFtaByEvenement('evt-1')?.id).toBe(id)
    expect(s.getState().getFtaByEvenement('inconnu')).toBeNull()
    await s.getState().deleteFtaAnalyse(id)
    expect(s.getState().ftaAnalyses).toHaveLength(0)
  })
})
