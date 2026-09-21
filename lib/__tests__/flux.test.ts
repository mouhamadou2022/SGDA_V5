// lib/__tests__/flux.test.ts — Monolithe modulaire
// Contrat des règles partagées des transferts inter-workflows.

import {
  DELAI_PAR_NIVEAU,
  normaliserNiveauEcart,
  calculerDelaisEcart,
  normaliserIdEcart,
} from '../flux'

describe('flux — barème des délais', () => {
  test('table de référence inchangée', () => {
    expect(DELAI_PAR_NIVEAU).toEqual({
      critique: { pac: 3,  regularisation: 7   },
      eleve:    { pac: 7,  regularisation: 30  },
      moyen:    { pac: 15, regularisation: 90  },
      faible:   { pac: 30, regularisation: 180 },
    })
  })

  test('normaliserNiveauEcart : inconnu → moyen', () => {
    expect(normaliserNiveauEcart('critique')).toBe('critique')
    expect(normaliserNiveauEcart('tres_faible')).toBe('moyen')
    expect(normaliserNiveauEcart(undefined)).toBe('moyen')
    expect(normaliserNiveauEcart(null)).toBe('moyen')
  })

  test('calculerDelaisEcart : échéances cohérentes (base injectée)', () => {
    const base = new Date('2026-01-01T00:00:00.000Z').getTime()
    const { delai_pac, delai_regularisation } = calculerDelaisEcart('critique', base)
    expect(delai_pac).toBe('2026-01-04T00:00:00.000Z')
    expect(delai_regularisation).toBe('2026-01-08T00:00:00.000Z')
    const fallback = calculerDelaisEcart('inconnu', base)
    expect(fallback.delai_pac).toBe('2026-01-16T00:00:00.000Z')
  })

  test('normaliserIdEcart : UUID conservé, sinon généré', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    expect(normaliserIdEcart(uuid, () => 'gen')).toBe(uuid)
    expect(normaliserIdEcart('ecart-123-abc', () => 'gen')).toBe('gen')
    expect(normaliserIdEcart(undefined, () => 'gen')).toBe('gen')
  })
})
