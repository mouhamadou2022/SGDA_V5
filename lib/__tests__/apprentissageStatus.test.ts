import { libelleBiais } from '../ia/apprentissageStatus'
import { PLAN_APPRENTISSAGE } from '../ia/predictionLearning'

describe('apprentissageStatus', () => {
  test('libellé biais', () => {
    expect(libelleBiais(null)).toBe('—')
    expect(libelleBiais(3)).toContain('pessimiste')
    expect(libelleBiais(-2)).toContain('optimiste')
    expect(libelleBiais(0.5)).toBe('neutre')
  })
  test('plan cohérent (jobs uniques, routes cron)', () => {
    const jobs = PLAN_APPRENTISSAGE.map(b => b.job)
    expect(new Set(jobs).size).toBe(jobs.length)
    expect(jobs).toContain('capitaliser-historique')
    expect(jobs).toContain('evaluer-predictions')
  })
})
