// lib/__tests__/hydratation.test.ts — Fusions local-prime (lib/hydratation.ts).
// Le local (IndexedDB, hors-ligne) prime, Supabase complète.

import {
  fusionnerParId,
  fusionnerUtilisateurs,
  fusionnerInspecteurs,
  rehydraterChecklists,
} from '../hydratation'

describe('fusionnerParId', () => {
  test('local prime, distant complète sans doublons', () => {
    const locaux = [{ id: 'a', v: 1 }]
    const distants = [{ id: 'a', v: 2 }, { id: 'b', v: 2 }]
    expect(fusionnerParId(locaux, distants)).toEqual([
      { id: 'a', v: 1 }, { id: 'b', v: 2 },
    ])
    expect(fusionnerParId(undefined, undefined)).toEqual([])
  })
})

describe('fusionnerUtilisateurs', () => {
  test('dédup par id + email', () => {
    const locaux = [{ id: 'u1', email: 'a@x.fr' }]
    const distants = [
      { id: 'u1', email: 'a@x.fr' },
      { id: 'u2', email: 'a@x.fr' },
      { id: 'u3', email: 'b@x.fr' },
    ]
    expect(fusionnerUtilisateurs(locaux as never, distants as never).map(u => u.id))
      .toEqual(['u1', 'u3'])
  })
})

describe('fusionnerInspecteurs', () => {
  test('dédup par id + email + matricule', () => {
    const locaux = [{ id: 'i1', email: 'a@x.fr', matricule: 'M1' }]
    const distants = [
      { id: 'i1', email: 'x@y.fr', matricule: 'Mx' },
      { id: 'i2', email: 'a@x.fr', matricule: 'Mx' },
      { id: 'i3', email: 'x@y.fr', matricule: 'M1' },
      { id: 'i4', email: 'x@y.fr', matricule: 'Mx' },
    ]
    expect(fusionnerInspecteurs(locaux as never, distants as never).map(i => i.id))
      .toEqual(['i1', 'i4'])
  })
})

describe('rehydraterChecklists', () => {
  test('sans hiérarchie → vide, avec → clés par surveillance', () => {
    expect(rehydraterChecklists(undefined)).toEqual({ hierarchyFromDb: {}, itemsFromDb: {} })
    expect(rehydraterChecklists([{ id: 's1' }] as never).hierarchyFromDb).toEqual({})
  })
})
