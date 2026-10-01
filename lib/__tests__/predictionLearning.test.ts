import {
  verifierPredictions,
  agregerMetriques,
  PLAN_APPRENTISSAGE,
  MOIS_MS,
} from '../ia/predictionLearning'

const JOUR = 86400000
const T0 = Date.UTC(2026, 0, 1)

const iso = (t: number) => new Date(t).toISOString()

describe('verifierPredictions', () => {
  test('horizon non atteint : rien à vérifier', () => {
    const r = verifierPredictions(
      [{ id: 'p1', aerodrome_id: 'a', predicted_at: iso(T0), pred_3m: 70, pred_6m: 68 }],
      [{ date: iso(T0 + 10 * JOUR), score: 71 }],
      T0 + 20 * JOUR,
    )
    expect(r).toEqual([])
  })

  test('horizon 3m atteint : erreur signée correcte', () => {
    const r = verifierPredictions(
      [{ id: 'p1', aerodrome_id: 'a', predicted_at: iso(T0), pred_3m: 70, pred_6m: 68 }],
      [{ date: iso(T0 + 3 * MOIS_MS + 5 * JOUR), score: 75 }],
      T0 + 4 * MOIS_MS,
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'p1', horizon: '3m', predit: 70, reel: 75, erreur: 5 })
  })

  test('déjà vérifié : ignoré', () => {
    const r = verifierPredictions(
      [{ id: 'p1', aerodrome_id: 'a', predicted_at: iso(T0), pred_3m: 70, pred_6m: 68, verifie_3m: true }],
      [{ date: iso(T0 + 3 * MOIS_MS), score: 75 }],
      T0 + 4 * MOIS_MS,
    )
    expect(r).toEqual([])
  })
})

describe('agregerMetriques', () => {
  test('MAE et biais par horizon', () => {
    const m = agregerMetriques([
      { id: 'a', horizon: '3m', predit: 70, reel: 75, erreur: 5 },
      { id: 'b', horizon: '3m', predit: 80, reel: 77, erreur: -3 },
    ])
    const m3 = m.find(x => x.horizon === '3m')!
    expect(m3.n).toBe(2)
    expect(m3.mae).toBe(4)
    expect(m3.biais).toBe(1)
    expect(m.find(x => x.horizon === '6m')!.n).toBe(0)
  })
})

describe('PLAN_APPRENTISSAGE', () => {
  test('chaque boucle a job, route et fréquence', () => {
    expect(PLAN_APPRENTISSAGE.length).toBeGreaterThanOrEqual(4)
    const jobs = PLAN_APPRENTISSAGE.map(b => b.job)
    expect(new Set(jobs).size).toBe(jobs.length)
    for (const b of PLAN_APPRENTISSAGE) {
      expect(b.route.startsWith('/api/cron/')).toBe(true)
      expect(b.frequence.length).toBeGreaterThan(0)
    }
    expect(jobs).toContain('evaluer-predictions')
  })
})
