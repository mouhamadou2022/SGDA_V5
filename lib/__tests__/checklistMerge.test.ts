// lib/__tests__/checklistMerge.test.ts
// Règle d'or : la réponse de l'IA ne doit JAMAIS faire perdre un item.
// Avant, un domaine renvoyé remplaçait l'existant → perte si réponse partielle.

import {
  fusionnerItemsIA,
  fusionnerDomainesIA,
  domainesTouchesIA,
  domaineEstTouche,
} from '../checklistMerge'

function domaine(id: string, nom: string, items: any[] = [], extra: any = {}) {
  return { id, nom, items, ...extra }
}

describe('fusionnerItemsIA', () => {
  test('conserve tous les items existants non renvoyés', () => {
    const existants = [
      { id: 'a', numero: 'A', point_verification: 'Question A' },
      { id: 'b', numero: 'B', point_verification: 'Question B' },
      { id: 'c', numero: 'C', point_verification: 'Question C' },
    ]
    const fusion = fusionnerItemsIA(existants, [{ id: 'b', point_verification: 'Question B modifiée' }])
    expect(fusion).toHaveLength(3)
    expect(fusion.map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(fusion[1].point_verification).toBe('Question B modifiée')
    expect(fusion[0].point_verification).toBe('Question A')
  })

  test('patch partiel : les champs absents de la réponse sont conservés', () => {
    const existants = [
      {
        id: 'a',
        numero: 'QSC01',
        reference_reglementaire: 'RAS 14 §1.4.1.3',
        point_verification: 'Question initiale',
        directive_preuve: 'Preuve initiale',
        prediction: 'NV',
      },
    ]
    const fusion = fusionnerItemsIA(existants, [{ id: 'a', point_verification: 'Question reformulée' }])
    expect(fusion[0]).toMatchObject({
      numero: 'QSC01',
      reference_reglementaire: 'RAS 14 §1.4.1.3',
      point_verification: 'Question reformulée',
      directive_preuve: 'Preuve initiale',
      prediction: 'NV',
    })
  })

  test('les valeurs undefined/null de l’IA n’écrasent pas l’existant', () => {
    const existants = [{ id: 'a', numero: 'QSC01', directive_sa: 'Directive SA' }]
    const fusion = fusionnerItemsIA(existants, [{ id: 'a', numero: null, directive_sa: undefined }])
    expect(fusion[0].numero).toBe('QSC01')
    expect(fusion[0].directive_sa).toBe('Directive SA')
  })

  test('ajoute les nouveaux items à la fin', () => {
    const existants = [{ id: 'a', numero: 'A' }]
    const fusion = fusionnerItemsIA(existants, [
      { id: 'a', numero: 'A' },
      { id: 'nouveau', numero: 'IT1', point_verification: 'Balisage lumineux conforme ?' },
    ])
    expect(fusion.map(i => i.id)).toEqual(['a', 'nouveau'])
  })

  test('ne mute pas les entrées', () => {
    const existants = [{ id: 'a', numero: 'A', point_verification: 'Initiale' }]
    const copie = JSON.parse(JSON.stringify(existants))
    fusionnerItemsIA(existants, [{ id: 'a', point_verification: 'Modifiée' }])
    expect(existants).toEqual(copie)
  })

  test('gère des listes vides ou absentes', () => {
    expect(fusionnerItemsIA(undefined as any, undefined as any)).toEqual([])
    expect(fusionnerItemsIA([], [])).toEqual([])
  })

  test('retrouve un item par son numéro si l’id est approximatif (pas de doublon)', () => {
    const existants = [
      { id: 'item_1', numero: 'SGS.01', point_verification: 'Question initiale', directive_sa: 'SA' },
    ]
    const fusion = fusionnerItemsIA(existants, [
      { id: 'sgs_01_autre', numero: 'SGS.01', point_verification: 'Question reformulée' },
    ])
    expect(fusion).toHaveLength(1)
    expect(fusion[0].id).toBe('item_1')
    expect(fusion[0].point_verification).toBe('Question reformulée')
    expect(fusion[0].directive_sa).toBe('SA')
  })
})

describe('fusionnerDomainesIA', () => {
  const existants = [
    domaine('d_ops', 'OPS', [
      { id: 'o1', numero: 'OPS01', point_verification: 'Question 1' },
      { id: 'o2', numero: 'OPS02', point_verification: 'Question 2' },
    ]),
    domaine('d_sgs', 'SGS', [{ id: 's1', numero: 'SGS01', point_verification: 'Question SGS' }], {
      sousDomaines: [
        {
          id: 'sd1',
          nom: 'Sous-domaine existant',
          items: [{ id: 'sd1_1', numero: 'SD01', point_verification: 'Question SD' }],
          sousSousDomaines: [
            {
              id: 'ssd1',
              nom: 'Sous-sous-domaine existant',
              items: [{ id: 'ssd1_1', numero: 'SSD01', point_verification: 'Question SSD' }],
            },
          ],
        },
      ],
    }),
  ]

  test('une réponse partielle ne fait perdre aucun item', () => {
    const fusion = fusionnerDomainesIA(existants, [
      { id: 'd_ops', nom: 'OPS', items: [{ id: 'o1', point_verification: 'Question 1 reformulée' }] },
    ])
    expect(fusion[0].items).toHaveLength(2)
    expect(fusion[0].items.map((i: any) => i.id)).toEqual(['o1', 'o2'])
    expect(fusion[0].items[0].point_verification).toBe('Question 1 reformulée')
    // Domaine non mentionné : intact
    expect(fusion[1]).toEqual(existants[1])
  })

  test('ajoute les nouveaux items du balisage lumineux au domaine visé', () => {
    const nouveaux = [1, 2, 3].map(n => ({
      id: `ai_item_${n}`,
      numero: `OLS0${n}`,
      point_verification: `Balisage lumineux — contrôle ${n}`,
    }))
    const fusion = fusionnerDomainesIA(existants, [
      { id: 'd_ops', nom: 'OPS', items: nouveaux },
    ])
    expect(fusion[0].items).toHaveLength(5)
    expect(fusion[0].items.slice(2).map((i: any) => i.id)).toEqual(['ai_item_1', 'ai_item_2', 'ai_item_3'])
  })

  test('ajoute un domaine inconnu', () => {
    const fusion = fusionnerDomainesIA(existants, [
      domaine('d_nouveau', 'ELEC', [{ id: 'e1', numero: 'ELEC01', point_verification: 'Réseaux ?' }]),
    ])
    expect(fusion).toHaveLength(3)
    expect(fusion[2].id).toBe('d_nouveau')
    expect(fusion[2].items).toHaveLength(1)
  })

  test('ajoute un sous-domaine et un sous-sous-domaine', () => {
    const fusion = fusionnerDomainesIA(existants, [
      {
        id: 'd_sgs',
        nom: 'SGS',
        sousDomaines: [
          {
            id: 'sd_nouveau',
            nom: 'Gestion des risques',
            items: [{ id: 'r1', numero: 'RSK01', point_verification: 'Risques identifiés ?' }],
          },
        ],
      },
    ])
    const sgs: any = fusion[1]
    expect(sgs.sousDomaines).toHaveLength(2)
    expect(sgs.sousDomaines[1].id).toBe('sd_nouveau')
    // Le sous-domaine existant et son sous-sous-domaine sont intacts
    expect(sgs.sousDomaines[0].id).toBe('sd1')
    expect(sgs.sousDomaines[0].sousSousDomaines[0].items).toHaveLength(1)
  })

  test('fusionne un sous-sous-domaine existant sans perdre ses items', () => {
    const fusion = fusionnerDomainesIA(existants, [
      {
        id: 'd_sgs',
        nom: 'SGS',
        sousDomaines: [
          {
            id: 'sd1',
            nom: 'Sous-domaine existant',
            sousSousDomaines: [
              {
                id: 'ssd1',
                nom: 'Sous-sous-domaine existant',
                items: [{ id: 'ssd1_2', numero: 'SSD02', point_verification: 'Nouvelle question SSD' }],
              },
            ],
          },
        ],
      },
    ])
    const ssd: any = (fusion[1] as any).sousDomaines[0].sousSousDomaines[0]
    expect(ssd.items).toHaveLength(2)
    expect(ssd.items.map((i: any) => i.id)).toEqual(['ssd1_1', 'ssd1_2'])
  })

  test('retrouve un domaine par son nom quand l’id a changé', () => {
    const fusion = fusionnerDomainesIA(existants, [
      { id: 'autre_id', nom: 'SGS', items: [{ id: 's2', numero: 'SGS02', point_verification: 'Nouvelle' }] },
    ])
    expect(fusion).toHaveLength(2)
    expect((fusion[1] as any).items).toHaveLength(2)
  })

  test('préserve les champs spécifiques du planning (resultat, commentaire)', () => {
    const planning = [
      {
        id: 'd_ops',
        nom: 'OPS',
        items: [
          { id: 'o1', numero: 'OPS01', point_verification: 'Q1', resultat: 'SA', commentaire: 'RAS', preuve_url: 'x' },
        ],
      },
    ]
    const fusion = fusionnerDomainesIA(planning, [
      { id: 'd_ops', nom: 'OPS', items: [{ id: 'o1', point_verification: 'Q1 reformulée' }] },
    ])
    expect(fusion[0].items[0]).toMatchObject({
      resultat: 'SA',
      commentaire: 'RAS',
      preuve_url: 'x',
      point_verification: 'Q1 reformulée',
    })
  })

  test('ne mute pas la checklist d’origine', () => {
    const copie = JSON.parse(JSON.stringify(existants))
    fusionnerDomainesIA(existants, [
      { id: 'd_ops', nom: 'OPS', items: [{ id: 'o1', point_verification: 'modifiée' }] },
    ])
    expect(existants).toEqual(copie)
  })

  test('entrée nulle : checklist inchangée', () => {
    expect(fusionnerDomainesIA(existants, null)).toEqual(existants)
    expect(fusionnerDomainesIA(existants, undefined)).toEqual(existants)
    expect(fusionnerDomainesIA(existants, [])).toEqual(existants)
  })
})

describe('domainesTouchesIA / domaineEstTouche', () => {
  test('repère les domaines par id ou par nom', () => {
    const cles = domainesTouchesIA([{ id: 'd1' }, { nom: 'OPS' }])
    expect(domaineEstTouche({ id: 'd1', nom: 'Autre' }, cles)).toBe(true)
    expect(domaineEstTouche({ id: 'd2', nom: 'OPS' }, cles)).toBe(true)
    expect(domaineEstTouche({ id: 'd3', nom: 'SGS' }, cles)).toBe(false)
  })
})
