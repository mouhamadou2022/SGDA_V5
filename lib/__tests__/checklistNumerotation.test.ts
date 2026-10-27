// lib/__tests__/checklistNumerotation.test.ts
// Non-régression : la colonne « Réf » doit contenir une référence UNIQUE par
// question (avant : « 01 » répété dans chaque section, ou référence géante
// « QSC_CONTINUE_SEC6.1.19 » qui débordait de la colonne).

import {
  assurerReferencesUniques,
  aDesReferencesNonUniques,
  numerosUtilises,
  prefixeDepuisItems,
  prefixeDepuisNom,
  prochaineReference,
} from '../checklistNumerotation'

const item = (numero: string, extra: Record<string, unknown> = {}) => ({
  id: `id_${numero || Math.random()}`,
  numero,
  point_verification: `Question ${numero}`,
  ...extra,
})

describe('prefixeDepuisItems / prefixeDepuisNom', () => {
  test('déduit le préfixe des items existants', () => {
    expect(prefixeDepuisItems([item('QSC01')])).toBe('QSC')
    expect(prefixeDepuisItems([item('SGS.01')])).toBe('SGS.')
    expect(prefixeDepuisItems([item('')])).toBe('')
    expect(prefixeDepuisItems([])).toBe('')
  })

  test('déduit un préfixe court du nom de la section', () => {
    expect(prefixeDepuisNom('OPS — Procédures opérationnelles')).toBe('OPS')
    expect(prefixeDepuisNom('SGS')).toBe('SGS')
    expect(prefixeDepuisNom('')).toBe('IT')
  })
})

describe('prochaineReference', () => {
  test('continue la numérotation du préfixe', () => {
    expect(prochaineReference('QSC', ['QSC01', 'QSC02'])).toBe('QSC03')
    expect(prochaineReference('QSC', ['QSC01', 'QSC18'])).toBe('QSC19')
  })

  test('conserve la largeur (zéros à gauche)', () => {
    expect(prochaineReference('QSC', ['QSC008'])).toBe('QSC009')
    expect(prochaineReference('IT', [])).toBe('IT01')
  })

  test('ne réutilise jamais une référence déjà prise', () => {
    expect(prochaineReference('QSC', ['QSC01', 'QSC03'])).toBe('QSC04')
  })
})

describe('assurerReferencesUniques', () => {
  test('renumérote les doublons en gardant la première occurrence', () => {
    const domaines = [
      { id: 'd1', nom: 'OPS', items: [item('QSC01'), item('QSC01'), item('QSC02')] },
    ]
    const { domaines: out, renommes } = assurerReferencesUniques(domaines)
    expect(renommes).toBe(1)
    expect(out[0].items.map(i => i.numero)).toEqual(['QSC01', 'QSC03', 'QSC02'])
  })

  test('corrige les sections qui repartent à « 01 »', () => {
    const domaines = [
      { id: 'd1', nom: 'OPS', items: [item('01'), item('02')] },
      { id: 'd2', nom: 'SLI', items: [item('01'), item('02')] },
      { id: 'd3', nom: 'PHY', items: [item('01')] },
    ]
    const { domaines: out } = assurerReferencesUniques(domaines)
    const refs = numerosUtilises(out)
    expect(new Set(refs).size).toBe(refs.length)
    expect(refs).toHaveLength(5)
  })

  test('génère une référence pour un item sans numéro', () => {
    const { domaines: out, renommes } = assurerReferencesUniques([
      { id: 'd1', nom: 'OPS — Procédures', items: [item('QSC01'), item('')] },
    ])
    expect(renommes).toBe(1)
    expect(out[0].items[1].numero).toBe('QSC02')
  })

  test('traite les sous-domaines et sous-sous-domaines', () => {
    const domaines = [
      {
        id: 'd1',
        nom: 'SGS',
        items: [item('SGS.01')],
        sousDomaines: [
          {
            id: 'sd1',
            nom: 'Gestion des risques',
            items: [item('SGS.01'), item('SGS.02')],
            sousSousDomaines: [
              { id: 'ssd1', nom: 'Sous-groupe', items: [item('SGS.02')] },
            ],
          },
        ],
      },
    ]
    const { domaines: out } = assurerReferencesUniques(domaines)
    const refs = numerosUtilises(out)
    expect(new Set(refs).size).toBe(refs.length)
    expect(refs[0]).toBe('SGS.01')
    expect(refs).toHaveLength(4)
  })

  test('ne produit jamais de référence démesurée', () => {
    const { domaines: out } = assurerReferencesUniques([
      { id: 'QSC_CONTINUE_SEC6.1', nom: 'OPS', items: [item('')] },
    ])
    expect(out[0].items[0].numero.length).toBeLessThanOrEqual(8)
  })

  test('ne mute pas la checklist d’origine', () => {
    const domaines = [{ id: 'd1', nom: 'OPS', items: [item('QSC01'), item('QSC01')] }]
    const copie = JSON.parse(JSON.stringify(domaines))
    assurerReferencesUniques(domaines)
    expect(domaines).toEqual(copie)
  })

  test('checklist sans anomalie : rien ne change', () => {
    const domaines = [{ id: 'd1', nom: 'OPS', items: [item('QSC01'), item('QSC02')] }]
    const { renommes } = assurerReferencesUniques(domaines)
    expect(renommes).toBe(0)
  })

  test('aDesReferencesNonUniques détecte doublons et vides', () => {
    expect(aDesReferencesNonUniques([{ id: 'd', nom: 'OPS', items: [item('A1'), item('A1')] }])).toBe(true)
    expect(aDesReferencesNonUniques([{ id: 'd', nom: 'OPS', items: [item('')] }])).toBe(true)
    expect(aDesReferencesNonUniques([{ id: 'd', nom: 'OPS', items: [item('A1'), item('A2')] }])).toBe(false)
  })
})
