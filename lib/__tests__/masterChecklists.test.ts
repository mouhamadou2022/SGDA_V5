// Contrat du slice checklists maîtres : résolution strict + assemblage.
// Testé ISOLÉ via zustand/vanilla (aucune dépendance Supabase/IDB).

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import {
  createMasterChecklistsSlice,
  type MasterChecklistSlice,
} from '../store/masterChecklistsSlice'

function makeStore() {
  return createStore<MasterChecklistSlice>()(
    createMasterChecklistsSlice as unknown as StateCreator<MasterChecklistSlice, [], [], MasterChecklistSlice>,
  )
}

const domaine = (nom: string, items: string[]) => ({
  nom,
  items: items.map(id => ({ id, numero: id, point_verification: `Vérifier ${id}` })),
})

describe('resoudreChecklist', () => {
  test('strict : un template couvrant tout, SGS retiré', () => {
    const s = makeStore()
    s.getState().setMasterChecklist('QSC_ALL', [
      domaine('PHY', ['p1']), domaine('OPS', ['o1']), domaine('SGS', ['s1']),
    ] as never)
    const r = s.getState().resoudreChecklist(['SGS', 'PHY', 'OPS'], ['QSC'])
    expect(r?.assemble).toBe(false)
    expect(r?.manquants).toEqual([])
    expect((r?.checklist || []).map(d => d.nom).sort()).toEqual(['OPS', 'PHY'])
  })

  test('assemblage : un template par domaine, manquants signalés', () => {
    const s = makeStore()
    s.getState().setMasterChecklist('HMG_H', [domaine('PHY', ['p1'])] as never)
    s.getState().setMasterChecklist('SOP_S', [domaine('OPS', ['o1'])] as never)
    const r = s.getState().resoudreChecklist(['SGS', 'PHY', 'OPS', 'COP'], ['HMG', 'SOP'])
    expect(r?.assemble).toBe(true)
    expect((r?.checklist || []).map(d => d.nom).sort()).toEqual(['OPS', 'PHY'])
    expect(r?.manquants).toEqual(['COP'])
  })

  test('rien couvert → null ; portée SGS seule → null', () => {
    const s = makeStore()
    expect(s.getState().resoudreChecklist(['PHY'], ['QSC'])).toBeNull()
    s.getState().setMasterChecklist('QSC_ALL', [domaine('PHY', ['p1'])] as never)
    expect(s.getState().resoudreChecklist(['SGS'], ['QSC'])).toBeNull()
  })
})
