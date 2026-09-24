// Contrat du slice mémoire checklist, testé ISOLÉ via zustand/vanilla.
// La sync serveur est best-effort (fire-and-forget, erreurs absorbées) :
// ici on prouve le comportement local.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import {
  createChecklistMemorySlice,
  type ChecklistMemorySlice,
} from '../store/checklistMemorySlice'

function makeStore() {
  return createStore<ChecklistMemorySlice>()(
    createChecklistMemorySlice as unknown as StateCreator<ChecklistMemorySlice, [], [], ChecklistMemorySlice>,
  )
}

describe('checklistMemorySlice — apprentissage local', () => {
  test('upsertItemHistory crée un enregistrement (sync serveur best-effort)', () => {
    const s = makeStore()
    s.getState().upsertItemHistory('a1', 'periodique', 'SGS', '', '', {
      id: 'i1', numero: 'Q1', point_verification: 'Vérifier X', resultat: 'SA',
    }, 's1')
    const all = s.getState().checklistMemoryRecords
    expect(all).toHaveLength(1)
    expect(all[0].id).toContain('a1')
    expect(all[0].item_id).toBe('i1')
  })

  test('recordCorrection met à jour le feedback (sync serveur best-effort)', () => {
    const s = makeStore()
    s.getState().upsertItemHistory('a1', 'periodique', 'SGS', '', '', {
      id: 'i1', numero: 'Q1', point_verification: 'Vérifier X', resultat: 'SA',
    }, 's1')
    s.getState().recordCorrection('a1', 'periodique', 'SGS', '', '', 'i1', 'SA', 'NS', 'Constat différent')
    const rec = s.getState().checklistMemoryRecords.find(r => r.item_id === 'i1')
    expect(rec?.feedback_correction).toBe('NS')
  })
})
