// lib/__tests__/cronRecalculateRisk.test.ts
// Tests E2E pour le cron de recalcul des profils de risque + A/B testing

import { calculateC1, calculateC3, calculateGlobalScore } from '../risque'

describe('calculateC1 (Maturité SGS)', () => {
  test('maturité 5 → 100', () => {
    expect(calculateC1(5)).toBe(100)
  })
  test('maturité 1 → 0', () => {
    expect(calculateC1(1)).toBe(0)
  })
  test('maturité 3 → 50', () => {
    expect(calculateC1(3)).toBe(50)
  })
  test('ne dépasse jamais 100 avec enquête', () => {
    expect(calculateC1(10, 5)).toBeLessThanOrEqual(100)
  })
})

describe('calculateC3 (Conformité)', () => {
  test('retourne 30 si aucune surveillance', () => {
    expect(calculateC3([])).toBe(30)
  })
  test('moyenne pondérée : la plus récente pèse 2x', () => {
    const survs = [
      { score: 100, date: '2025-06-01' },
      { score: 0, date: '2025-01-01' },
    ]
    // récente 100 * 2 + ancienne 0 * 1 = 200 / 3 = 66.66 -> 67
    expect(calculateC3(survs)).toBe(67)
  })
})

describe('calculateGlobalScore', () => {
  test('score cohérent avec C1-C5 équilibrés', () => {
    const score = calculateGlobalScore({ c1: 80, c2: 80, c3: 80, c4: 80, c5: 80 })
    expect(score).toBe(80)
  })
  test('pondération : C5 > C4 (0.25 vs 0.15)', () => {
    const basC5 = calculateGlobalScore({ c1: 100, c2: 100, c3: 100, c4: 100, c5: 0 })
    const basC4 = calculateGlobalScore({ c1: 100, c2: 100, c3: 100, c4: 0, c5: 100 })
    expect(basC5).toBeLessThan(basC4)
  })
  test('score entre 0 et 100', () => {
    const score = calculateGlobalScore({ c1: 50, c2: 50, c3: 50, c4: 50, c5: 50 })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

describe('A/B Testing utility', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sgda_ab_testing')
    }
  })

  test('recordABTest enregistre et getABStats retourne les stats', () => {
    const ab = require('../ab_testing')
    ab.recordABTest({
      aerodrome_id: 'a1', code_oaci: 'GOBD',
      features: [80, 70, 75, 80, 90, 80, 2, 1, 85],
      score_neural_net: 72,
      score_formulas: 84,
    })
    const stats = ab.getABStats()
    expect(stats).not.toBeNull()
    expect(stats!.total).toBe(1)
  })

  test('getABStats retourne null si aucun test', () => {
    const ab = require('../ab_testing')
    expect(ab.getABStats()).toBeNull()
  })

  test('clearABHistory vide tout', () => {
    const ab = require('../ab_testing')
    ab.recordABTest({
      aerodrome_id: 'a1', code_oaci: 'GOBD',
      features: [80, 70, 75, 80, 90, 80, 2, 1, 85],
      score_neural_net: 72,
      score_formulas: 84,
    })
    ab.clearABHistory()
    expect(ab.getABStats()).toBeNull()
  })

  test('bestProvider = neural_net si MAE NN < MAE formules', () => {
    const ab = require('../ab_testing')
    // Scores : NN=72, formules=84. Si actual=75, NN gagne
    const r = ab.recordABTest({
      aerodrome_id: 'a1', code_oaci: 'GOBD',
      features: [80, 70, 75, 80, 90, 80, 2, 1, 85],
      score_neural_net: 72,
      score_formulas: 84,
    })
    ab.updateActualScore(r.id, 75)
    const stats = ab.getABStats()
    expect(stats!.bestProvider).toBe('neural_net')
  })

  test('limite à 500 enregistrements', () => {
    const ab = require('../ab_testing')
    for (let i = 0; i < 600; i++) {
      ab.recordABTest({
        aerodrome_id: `a${i}`, code_oaci: `TEST${i}`,
        features: [50, 50, 50, 50, 50, 50, 0, 0, 70],
        score_neural_net: 50,
        score_formulas: 60,
      })
    }
    const stats = ab.getABStats()
    expect(stats!.total).toBeLessThanOrEqual(500)
  })
})
