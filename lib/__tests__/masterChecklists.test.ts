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

describe('résolution selon le type d\'entité (aérodrome / hélistation)', () => {
  function storeAvecAeroEtHeli() {
    const s = makeStore()
    s.getState().setMasterChecklist('QSC_QSC_CERT', [domaine('PHY', ['a1']), domaine('OPS', ['a2'])] as never)
    s.getState().setMasterChecklist('QSC_QSC_HELI_MER', [domaine('PHY', ['h1']), domaine('OPS', ['h2'])] as never)
    s.getState().setMasterChecklist('QSC_QSC_HELI_SURFACE', [domaine('PHY', ['s1']), domaine('OPS', ['s2'])] as never)
    return s
  }

  test('hélistation en mer → template HELI_MER, jamais le template aérodrome', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], {
      type_entite: 'helistation',
      helistation: { type_installation: 'plateforme_fixe' },
    })
    expect(r?.id).toBe('QSC_QSC_HELI_MER')
  })

  test('hélistation terrestre → template HELI_SURFACE', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], {
      type_entite: 'helistation',
      helistation: { type_installation: 'terrestre' },
    })
    expect(r?.id).toBe('QSC_QSC_HELI_SURFACE')
  })

  test('hélistation sans type d\'installation → préfère un template HELI_*', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], { type_entite: 'helistation' })
    expect(r?.id.startsWith('QSC_QSC_HELI_')).toBe(true)
  })

  test('aérodrome → template aérodrome, jamais un template HELI_*', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], { type_entite: 'aerodrome' })
    expect(r?.id).toBe('QSC_QSC_CERT')
  })

  test('type_entite absent en base mais données hélistation → template HELI_*', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], {
      type_entite: null,
      helistation: { type_installation: 'terrestre' },
    })
    expect(r?.id).toBe('QSC_QSC_HELI_SURFACE')
  })

  test('type_entite saisi « aerodrome » mais aucune piste → hélistation', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], {
      type_entite: 'aerodrome',
      helistation: { type_installation: 'terrestre' },
    })
    expect(r?.id).toBe('QSC_QSC_HELI_SURFACE')
  })

  test('aérodrome (piste) même avec données hélistation → template aérodrome', () => {
    const s = storeAvecAeroEtHeli()
    const r = s.getState().resoudreChecklist(['PHY', 'OPS'], ['QSC'], {
      type_entite: 'aerodrome',
      helistation: { type_installation: 'terrestre' },
      piste_principale: { longueur: 2400 },
    })
    expect(r?.id).toBe('QSC_QSC_CERT')
  })

  test('hélistation sans template dédié → jamais le template aérodrome', () => {
    const s = makeStore()
    s.getState().setMasterChecklist('QSC_QSC_CERT', [domaine('PHY', ['a1'])] as never)
    const r = s.getState().resoudreChecklist(['PHY'], ['QSC'], { type_entite: 'helistation' })
    expect(r).toBeNull()
  })
})
