// lib/__tests__/enquetesSlice.test.ts — Phase 3 (monolithe modulaire)
// Contrat du slice enquêtes, testé ISOLÉ via zustand/vanilla.
// La sync serveur est best-effort (fire-and-forget, erreurs absorbées) :
// ici on prouve le comportement local.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import {
  createEnquetesSlice,
  type Enquete,
  type EnqueteSlice,
} from '../store/enquetesSlice'

function makeStore() {
  return createStore<EnqueteSlice>()(
    createEnquetesSlice as unknown as StateCreator<EnqueteSlice, [], [], EnqueteSlice>,
  )
}

const baseEnquete = {
  reference: 'ENQ-2026-001',
  titre: 'Enquête SGS',
  description: 'Test',
  type_enquete: 'sgs',
  aerodrome_ids: ['a1'],
  questions: [],
  deadline: '2026-12-31',
  statut: 'active' as const,
  created_by: 'admin-1',
}

describe('enquetesSlice — CRUD', () => {
  test('add/update/delete enquete (sync serveur best-effort)', () => {
    const s = makeStore()
    s.getState().addEnquete(baseEnquete)
    expect(s.getState().enquetes).toHaveLength(1)
    const id = s.getState().enquetes[0].id
    expect(id).toBeTruthy()
    s.getState().updateEnquete(id, { statut: 'terminee' })
    expect(s.getState().enquetes[0].statut).toBe('terminee')
    s.getState().deleteEnquete(id)
    expect(s.getState().enquetes).toHaveLength(0)
  })

  test('soumettreReponse ajoute id + submitted_at', () => {
    const s = makeStore()
    s.getState().addEnquete(baseEnquete)
    const enqueteId = s.getState().enquetes[0].id
    s.getState().soumettreReponse({
      enquete_id: enqueteId,
      aerodrome_id: 'a1',
      repondant_id: 'op-1',
      repondant_nom: 'Opérateur',
      repondant_role: 'focal_operator',
      reponses: { q1: 4 },
      score_c1: 4,
    })
    const all = s.getState().reponsesEnquetes
    expect(all).toHaveLength(1)
    expect(all[0].id).toBeTruthy()
    expect(all[0].submitted_at).toBeTruthy()
    expect(s.getState().getStatistiquesEnquete(enqueteId).total_reponses).toBe(1)
  })
})
