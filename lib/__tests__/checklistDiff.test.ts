// lib/__tests__/checklistDiff.test.ts — Diff de versions (lib/checklistDiff.ts).

import { signerDomaine, diffHierarchieVersions } from '../checklistDiff'

const domaine = (nom: string, items: Array<{ id: string; libelle: string }>) => ({
  nom,
  items: items.map(i => ({ id: i.id, numero: i.id, point_verification: i.libelle })),
})

describe('signerDomaine', () => {
  test('stable et sensible au contenu', () => {
    const a = domaine('SGS', [{ id: 'i1', libelle: 'Un' }])
    const b = domaine('SGS', [{ id: 'i1', libelle: 'Un' }])
    const c = domaine('SGS', [{ id: 'i1', libelle: 'Deux' }])
    expect(signerDomaine(a as never)).toBe(signerDomaine(b as never))
    expect(signerDomaine(a as never)).not.toBe(signerDomaine(c as never))
  })
})

describe('diffHierarchieVersions', () => {
  test('ajouts, retraits, modifications', () => {
    const avant = [
      domaine('SGS', [{ id: 'i1', libelle: 'Un' }]),
      domaine('PHY', [{ id: 'p1', libelle: 'Piste' }]),
      domaine('OLD', [{ id: 'o1', libelle: 'Vieux' }]),
    ]
    const apres = [
      domaine('SGS', [{ id: 'i1', libelle: 'Un modifié' }]),
      domaine('PHY', [{ id: 'p1', libelle: 'Piste' }]),
      domaine('OLS', [{ id: 'n1', libelle: 'Nouveau' }]),
    ]
    expect(diffHierarchieVersions(avant as never, apres as never)).toEqual({
      ajoutes: ['OLS'],
      retires: ['OLD'],
      modifies: ['SGS'],
    })
  })
  test('vide et identique', () => {
    expect(diffHierarchieVersions(undefined, undefined)).toEqual({ ajoutes: [], retires: [], modifies: [] })
    const h = [domaine('SGS', [])]
    expect(diffHierarchieVersions(h as never, h as never).modifies).toEqual([])
  })
})
