// lib/__tests__/checklistNumerotation.test.ts
// Non-régression : la colonne « Réf » doit contenir une référence UNIQUE par
// question (avant : « 01 » répété dans chaque section, ou référence géante
// « QSC_CONTINUE_SEC6.1.19 » qui débordait de la colonne).

import {
  assurerReferencesUniques,
  aDesReferencesNonUniques,
  extraireNumeroQuestion,
  normaliserQuestionsEtReferences,
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

describe('extraireNumeroQuestion', () => {
  test('retire un numéro d’item simple', () => {
    expect(extraireNumeroQuestion('11 la pente de l’aire de sécurité est-elle conforme ?'))
      .toEqual({ numero: '11', question: 'la pente de l’aire de sécurité est-elle conforme ?' })
    expect(extraireNumeroQuestion('1. L’hélistation est-elle dotée d’un indicateur ?'))
      .toEqual({ numero: '1', question: 'L’hélistation est-elle dotée d’un indicateur ?' })
    expect(extraireNumeroQuestion('3) Les dimensions sont-elles conformes ?'))
      .toEqual({ numero: '3', question: 'Les dimensions sont-elles conformes ?' })
  })

  test('retire un numéro de paragraphe pointé', () => {
    expect(extraireNumeroQuestion('7.2.4 L’exploitant communique-t-il les informations ?'))
      .toEqual({ numero: '7.2.4', question: 'L’exploitant communique-t-il les informations ?' })
  })

  test('conserve les nombres qui font partie de la question', () => {
    expect(extraireNumeroQuestion('24 h de veille sont-elles assurées ?').numero).toBe('')
    expect(extraireNumeroQuestion('2 500 m de longueur sont-ils exigés ?').numero).toBe('')
    expect(extraireNumeroQuestion('3 % de pente maximum ?').numero).toBe('')
    expect(extraireNumeroQuestion('La pente est-elle inférieure à 3 % ?').numero).toBe('')
  })
})

describe('normaliserQuestionsEtReferences', () => {
  test('déplace le numéro de la question vers la référence', () => {
    const domaines = [{
      id: 'd1', nom: 'PHY',
      items: [
        { id: 'a', numero: 'IT12', point_verification: '11 la pente de l’aire de sécurité est-elle conforme ?' },
        { id: 'b', numero: 'IT13', point_verification: 'Les dimensions de la voie de circulation sont-elles conformes ?' },
        { id: 'c', numero: 'IT16', point_verification: '15 l’emplacement de l’itinéraire est-il conforme ?' },
      ],
    }]
    const { domaines: out, questionsNettoyees } = normaliserQuestionsEtReferences(domaines)
    expect(questionsNettoyees).toBe(2)
    expect(out[0].items[0].numero).toBe('IT12.11')
    expect(out[0].items[0].point_verification).toBe('la pente de l’aire de sécurité est-elle conforme ?')
    expect(out[0].items[2].numero).toBe('IT16.15')
    // Item sans numéro de tête : inchangé
    expect(out[0].items[1].numero).toBe('IT13')
  })

  test('numérote une suite d’items qui partagent la même référence', () => {
    const domaines = [{
      id: 'd1', nom: 'HMG',
      items: [
        { id: 'a', numero: 'IT2', point_verification: '1 L’héliplate-forme est-elle dotée d’une FATO ?' },
        { id: 'b', numero: 'IT2', point_verification: '2 La FATO est-elle de taille suffisante ?' },
        { id: 'c', numero: 'IT2', point_verification: '3 La TLOF est-elle de taille suffisante ?' },
      ],
    }]
    const { domaines: out } = normaliserQuestionsEtReferences(domaines)
    expect(out[0].items.map(i => i.numero)).toEqual(['IT2.1', 'IT2.2', 'IT2.3'])
    expect(out[0].items.map(i => i.point_verification)).toEqual([
      'L’héliplate-forme est-elle dotée d’une FATO ?',
      'La FATO est-elle de taille suffisante ?',
      'La TLOF est-elle de taille suffisante ?',
    ])
  })

  test('numéro de paragraphe : question nettoyée, référence conservée', () => {
    const domaines = [{
      id: 'd1', nom: 'OPS',
      items: [{ id: 'a', numero: 'QSC86', point_verification: '7.2.4 L’exploitant communique-t-il les informations ?' }],
    }]
    const { domaines: out } = normaliserQuestionsEtReferences(domaines)
    expect(out[0].items[0].numero).toBe('QSC86')
    expect(out[0].items[0].point_verification).toBe('L’exploitant communique-t-il les informations ?')
  })

  test('nettoie aussi description quand elle recopie la question', () => {
    const domaines = [{
      id: 'd1', nom: 'OPS',
      items: [
        { id: 'a', numero: 'QSC01', description: '1 Le nom est-il spécifié ?', point_verification: '1 Le nom est-il spécifié ?' },
        { id: 'b', numero: 'QSC02', description: '2 L’indicatif est-il publié ?', point_verification: '2 L’indicatif est-il publié ?' },
      ],
    }]
    const { domaines: out } = normaliserQuestionsEtReferences(domaines)
    expect(out[0].items[0].description).toBe('Le nom est-il spécifié ?')
    expect(out[0].items[0].point_verification).toBe('Le nom est-il spécifié ?')
  })

  test('laisse intacte une checklist déjà propre', () => {
    const domaines = [{
      id: 'd1', nom: 'OPS',
      items: [
        { id: 'a', numero: 'QSC01', point_verification: 'Le nom est-il spécifié ?' },
        { id: 'b', numero: 'QSC02', point_verification: 'L’indicatif est-il publié ?' },
      ],
    }]
    const { questionsNettoyees, renommes } = normaliserQuestionsEtReferences(domaines)
    expect(questionsNettoyees).toBe(0)
    expect(renommes).toBe(0)
  })

  test('garantit l’unicité après nettoyage', () => {
    const domaines = [{
      id: 'd1', nom: 'SOP',
      items: [
        { id: 'a', numero: 'SOP1.4', point_verification: '1 Indicateur d’emplacement' },
        { id: 'b', numero: 'SOP1.4', point_verification: '2 Données géographiques' },
      ],
    }]
    const { domaines: out } = normaliserQuestionsEtReferences(domaines)
    const refs = numerosUtilises(out)
    expect(new Set(refs).size).toBe(refs.length)
    expect(refs).toEqual(['SOP1.4.1', 'SOP1.4.2'])
  })
})
