import { dedupeHierarchyItems, ensureUniqueHierarchyItemIds } from '../checklistNormalize'

function hierarchyWithDuplicates() {
  return [
    {
      id: 'dom-1',
      nom: 'PHY',
      items: [
        { id: 'IT6', numero: 'IT6' },
        { id: 'IT6', numero: 'IT6' },
      ],
      sousDomaines: [
        {
          id: 'sd-1',
          nom: 'PHY-1',
          items: [{ id: 'IT7', numero: 'IT7' }],
          sousSousDomaines: [
            {
              id: 'ssd-1',
              nom: 'PHY-1-1',
              items: [
                { id: 'IT8', numero: 'IT8' },
                { id: 'IT8', numero: 'IT8' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'dom-2',
      nom: 'OPS',
      items: [{ id: 'IT6', numero: 'IT6' }],
      sousDomaines: [],
    },
  ] as never
}

describe('ensureUniqueHierarchyItemIds', () => {
  test('renomme les doublons sans supprimer d’items, y compris imbriqués', () => {
    const source = hierarchyWithDuplicates()
    const result = ensureUniqueHierarchyItemIds(source) as any[]

    const ids = [
      ...result[0].items.map((i: any) => i.id),
      ...result[0].sousDomaines[0].items.map((i: any) => i.id),
      ...result[0].sousDomaines[0].sousSousDomaines[0].items.map((i: any) => i.id),
      ...result[1].items.map((i: any) => i.id),
    ]

    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['IT6', 'IT6_2', 'IT7', 'IT8', 'IT8_2', 'IT6_3'])
  })

  test('ne modifie pas une hiérarchie déjà valide', () => {
    const source = [{ id: 'dom', nom: 'PHY', items: [{ id: 'A' }, { id: 'B' }], sousDomaines: [] }] as never
    expect(ensureUniqueHierarchyItemIds(source)).toBe(source)
  })
})

describe('dedupeHierarchyItems', () => {
  test('déduplique aussi les sous-sous-domaines', () => {
    const result = dedupeHierarchyItems(hierarchyWithDuplicates()) as any[]
    const ids = [
      ...result[0].items.map((i: any) => i.id),
      ...result[0].sousDomaines[0].items.map((i: any) => i.id),
      ...result[0].sousDomaines[0].sousSousDomaines[0].items.map((i: any) => i.id),
      ...result[1].items.map((i: any) => i.id),
    ]
    expect(ids).toEqual(['IT6', 'IT7', 'IT8'])
  })

  test('déduplique même quand les doublons sont uniquement dans un sous-sous-domaine', () => {
    const source = [{
      id: 'dom',
      nom: 'PHY',
      items: [],
      sousDomaines: [{
        id: 'sd',
        nom: 'PHY-1',
        items: [],
        sousSousDomaines: [{
          id: 'ssd',
          nom: 'PHY-1-1',
          items: [{ id: 'IT8' }, { id: 'IT8' }],
        }],
      }],
    }] as never

    const result = dedupeHierarchyItems(source) as any[]
    expect(result[0].sousDomaines[0].sousSousDomaines[0].items).toHaveLength(1)
  })
})
