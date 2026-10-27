// lib/__tests__/kitDocFusion.test.ts
// Non-régression : lecture intégrale d'un document (map → reduce) et
// déduplication des items générés sur plusieurs lots.

import { fusionnerAnalysesDocument, cleItemGenere } from '../ia/agents/kitDocAgent'

describe('fusionnerAnalysesDocument', () => {
  test('moyenne les scores et fusionne réserves / recommandations', () => {
    const res = fusionnerAnalysesDocument([
      {
        score_global: 60,
        criteres: [{ nom: 'Lisibilité', score: 80, satisfait: true, commentaire: 'A' }],
        reserves: ['R1'],
        recommandations: ['C1'],
        confiance: 70,
      },
      {
        score_global: 40,
        criteres: [{ nom: 'Lisibilité', score: 20, satisfait: false, commentaire: 'B' }],
        reserves: ['R1', 'R2'],
        recommandations: ['C2'],
        confiance: 50,
      },
    ])
    expect(res.score_global).toBe(50)
    expect(res.criteres).toHaveLength(1)
    expect(res.criteres[0].score).toBe(50)
    expect(res.reserves).toEqual(['R1', 'R2'])
    expect(res.recommandations).toEqual(['C1', 'C2'])
    expect(res.confiance).toBe(60)
  })

  test('un seul lot : résultat inchangé', () => {
    const unique = {
      score_global: 72,
      criteres: [],
      reserves: [],
      recommandations: [],
      confiance: 80,
    }
    expect(fusionnerAnalysesDocument([unique])).toBe(unique)
  })

  test('aucun lot : repli neutre', () => {
    const res = fusionnerAnalysesDocument([])
    expect(res.score_global).toBe(50)
    expect(res.confiance).toBe(40)
  })
})

describe('cleItemGenere', () => {
  test('normalise accents / ponctuation pour dédupliquer les lots', () => {
    expect(cleItemGenere('Vérifier la RESA de la piste 18R ?')).toBe(
      cleItemGenere('verifier la resa de la piste 18r'),
    )
  })
})
