// components/modules/surveillance/__tests__/ecartsRedactionUtils.test.ts
// Helpers purs extraits de SurveillanceEcartsRedaction.

import {
  isValidOACI,
  decouperLibelleEnEcarts,
  getProgressBarColorDynamic,
  NIVEAUX,
} from '../ecartsRedactionUtils'

describe('isValidOACI', () => {
  test('cellule 1-5 × A-E valide, reste invalide', () => {
    expect(isValidOACI('4C')).toBe(true)
    expect(isValidOACI('1A')).toBe(true)
    expect(isValidOACI('6A')).toBe(false)
    expect(isValidOACI('4F')).toBe(false)
    expect(isValidOACI(undefined)).toBe(false)
    expect(isValidOACI(null)).toBe(false)
  })
})

describe('decouperLibelleEnEcarts', () => {
  test('puces numérotées → un libellé par puce', () => {
    const res = decouperLibelleEnEcarts('1. Premier constat\n2. Second constat')
    expect(res).toEqual(['Premier constat', 'Second constat'])
  })
  test('sans puces → libellé entier', () => {
    expect(decouperLibelleEnEcarts('Constat unique')).toEqual(['Constat unique'])
  })
})

describe('getProgressBarColorDynamic', () => {
  test('seuils 80/60/40', () => {
    expect(getProgressBarColorDynamic(90)).toBe('bg-success')
    expect(getProgressBarColorDynamic(70)).toBe('bg-primary')
    expect(getProgressBarColorDynamic(50)).toBe('bg-warning')
    expect(getProgressBarColorDynamic(10)).toBe('bg-danger')
  })
})

describe('NIVEAUX', () => {
  test('4 niveaux avec délais PAC/régularisation', () => {
    expect(NIVEAUX).toHaveLength(4)
    expect(NIVEAUX[0]).toMatchObject({ value: 'critique', delais: { pac: 3, regularisation: 7 } })
  })
})
