// lib/__tests__/calibration.test.ts
import {
  computeMAE,
  computeBias,
  computeCoverage,
  computeModelPerformance,
  isCorrectionNeeded,
  computeBiasCorrection,
  computeLearningFactor,
  adjustWeights,
  getPerformanceClass,
  generateCorrection,
} from '../risque/calibration'
import type { FeedbackInspecteur, MatricePerformance } from '../risque/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeFeedback = (
  type: FeedbackInspecteur['type'],
  erreur: number
): FeedbackInspecteur => ({
  id: `fb-${Math.random().toString(36).slice(2)}`,
  aerodrome_id: 'aero-1',
  inspecteur_id: 'insp-1',
  createdAt: new Date().toISOString(),
  submittedAt: new Date().toISOString(),
  valeurPredite: 70,
  valeurReelle: 70 - erreur,
  erreur,
  type,
  commentaire: '',
})

// ─── computeMAE ─────────────────────────────────────────────────────────────

describe('computeMAE', () => {
  it('retourne 0 pour une liste vide', () => {
    expect(computeMAE([])).toBe(0)
  })

  it('calcule la MAE exacte (5, -3, 8) => 16/3', () => {
    const feedbacks = [
      makeFeedback('prediction_3m', 5),
      makeFeedback('prediction_3m', -3),
      makeFeedback('prediction_3m', 8),
    ]
    expect(computeMAE(feedbacks)).toBeCloseTo(16 / 3, 5)
  })

  it('retourne la valeur absolue des erreurs negatives', () => {
    const feedbacks = [makeFeedback('prediction_3m', -10)]
    expect(computeMAE(feedbacks)).toBe(10)
  })
})

// ─── computeBias ────────────────────────────────────────────────────────────

describe('computeBias', () => {
  it('retourne 0 pour une liste vide', () => {
    expect(computeBias([])).toBe(0)
  })

  it('calcule le biais moyen signe (5 + -3) / 2 = 1', () => {
    const feedbacks = [
      makeFeedback('prediction_3m', 5),
      makeFeedback('prediction_3m', -3),
    ]
    expect(computeBias(feedbacks)).toBe(1)
  })

  it('biais positif quand le modele surestime', () => {
    const feedbacks = [makeFeedback('prediction_3m', 8)]
    expect(computeBias(feedbacks)).toBeGreaterThan(0)
  })

  it('biais negatif quand le modele sous-estime', () => {
    const feedbacks = [makeFeedback('prediction_3m', -8)]
    expect(computeBias(feedbacks)).toBeLessThan(0)
  })
})

// ─── computeCoverage ────────────────────────────────────────────────────────

describe('computeCoverage', () => {
  it('retourne 0 pour une liste vide', () => {
    expect(computeCoverage([])).toBe(0)
  })

  it("retourne 100 si toutes les valeurs reelles sont dans l'intervalle", () => {
    const predictions = [
      { predite: 70, reelle: 70, intervalle: [60, 80] as [number, number] },
      { predite: 50, reelle: 55, intervalle: [45, 65] as [number, number] },
    ]
    expect(computeCoverage(predictions)).toBe(100)
  })

  it("retourne 0 si aucune valeur reelle dans l'intervalle", () => {
    const predictions = [
      { predite: 70, reelle: 90, intervalle: [60, 80] as [number, number] },
      { predite: 50, reelle: 10, intervalle: [45, 65] as [number, number] },
    ]
    expect(computeCoverage(predictions)).toBe(0)
  })

  it('calcule le taux partiel correctement (50%)', () => {
    const predictions = [
      { predite: 70, reelle: 72, intervalle: [60, 80] as [number, number] }, // dans
      { predite: 50, reelle: 30, intervalle: [45, 65] as [number, number] }, // hors
    ]
    expect(computeCoverage(predictions)).toBe(50)
  })
})

// ─── computeModelPerformance ─────────────────────────────────────────────────

describe('computeModelPerformance', () => {
  it('retourne des metriques correctes par type de feedback', () => {
    const feedbacks: FeedbackInspecteur[] = [
      makeFeedback('prediction_3m', 5),
      makeFeedback('prediction_3m', -3),
      makeFeedback('prediction_6m', 10),
    ]

    const perf = computeModelPerformance(feedbacks)
    expect(perf.mae3m).toBeCloseTo(4, 0)   // (5+3)/2 = 4
    expect(perf.mae6m).toBe(10)
    expect(perf.nbObservations).toBe(3)
    expect(typeof perf.derniereCalibration).toBe('string')
  })

  it('retourne 0 pour MAE et biais si aucun feedback', () => {
    const perf = computeModelPerformance([])
    expect(perf.mae3m).toBe(0)
    expect(perf.mae6m).toBe(0)
    expect(perf.nbObservations).toBe(0)
  })
})

// ─── isCorrectionNeeded ──────────────────────────────────────────────────────

describe('isCorrectionNeeded', () => {
  const goodPerf: MatricePerformance = {
    mae3m: 4,
    mae6m: 3,
    biais3m: 2,
    biais6m: -1,
    coverage95: 90,
    derniereCalibration: new Date().toISOString(),
    nbObservations: 20,
  }

  it('ne necessite pas de correction avec de bonnes metriques', () => {
    const result = isCorrectionNeeded(goodPerf)
    expect(result.besoin).toBe(false)
    expect(result.raisons).toHaveLength(0)
  })

  it('signale une MAE trop elevee (>10)', () => {
    const perf = { ...goodPerf, mae3m: 15 }
    const result = isCorrectionNeeded(perf)
    expect(result.besoin).toBe(true)
    expect(result.raisons.some(r => r.includes('MAE 3m'))).toBe(true)
  })

  it('signale un biais positif trop eleve (surestime)', () => {
    const perf = { ...goodPerf, biais3m: 10 }
    const result = isCorrectionNeeded(perf)
    expect(result.besoin).toBe(true)
    expect(result.raisons.some(r => r.includes('Biais 3m') && r.includes('surestime'))).toBe(true)
  })

  it('signale un biais negatif (sous-estimation)', () => {
    const perf = { ...goodPerf, biais6m: -12 }
    const result = isCorrectionNeeded(perf)
    expect(result.besoin).toBe(true)
    expect(result.raisons.some(r => r.includes('sous-estime'))).toBe(true)
  })

  it('signale un coverage insuffisant (<85%)', () => {
    const perf = { ...goodPerf, coverage95: 70 }
    const result = isCorrectionNeeded(perf)
    expect(result.besoin).toBe(true)
    expect(result.raisons.some(r => r.includes('Coverage'))).toBe(true)
  })

  it('peut cumuler plusieurs raisons', () => {
    const perf = { ...goodPerf, mae3m: 20, biais3m: 8, coverage95: 60 }
    const result = isCorrectionNeeded(perf)
    expect(result.besoin).toBe(true)
    expect(result.raisons.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── computeBiasCorrection ──────────────────────────────────────────────────

describe('computeBiasCorrection', () => {
  it("retourne l'oppose de la moitie du biais", () => {
    expect(computeBiasCorrection(10)).toBe(-5)
    expect(computeBiasCorrection(-10)).toBe(5)
  })

  it('est limite a +/-15 pour les biais extremes', () => {
    expect(computeBiasCorrection(100)).toBe(-15)
    expect(computeBiasCorrection(-100)).toBe(15)
  })

  it('retourne 0 si biais nul', () => {
    // Math.min/max(-0*0.5) peut retourner -0 ; toBeCloseTo gere les deux
    expect(computeBiasCorrection(0)).toBeCloseTo(0)
  })
})

// ─── computeLearningFactor ──────────────────────────────────────────────────

describe('computeLearningFactor', () => {
  it('retourne 0.05 pour 0 feedbacks', () => {
    expect(computeLearningFactor(0)).toBeCloseTo(0.05, 5)
  })

  it('augmente avec le nombre de feedbacks', () => {
    expect(computeLearningFactor(10)).toBeGreaterThan(computeLearningFactor(5))
  })

  it('est limite a 0.3 pour un grand nombre de feedbacks', () => {
    expect(computeLearningFactor(1000)).toBe(0.3)
  })

  it('atteint exactement 0.3 a 25 feedbacks (0.05 + 25*0.01)', () => {
    expect(computeLearningFactor(25)).toBe(0.3)
  })
})

// ─── adjustWeights ──────────────────────────────────────────────────────────

describe('adjustWeights', () => {
  it('retourne les memes poids si aucun feedback', () => {
    const poids = { alerte: 1.0, surveillance: 1.2 }
    expect(adjustWeights(poids, [])).toEqual(poids)
  })

  it('maintient les poids dans les bornes [0.5, 1.5]', () => {
    const poids = { alerte: 1.0 }
    const feedbacks = [makeFeedback('alerte', 20), makeFeedback('alerte', 30)]
    const result = adjustWeights(poids, feedbacks)
    expect(result.alerte).toBeGreaterThanOrEqual(0.5)
    expect(result.alerte).toBeLessThanOrEqual(1.5)
  })

  it("ne modifie pas les cles absentes des feedbacks", () => {
    const poids = { alerte: 1.0, surveillance: 1.2 }
    const feedbacks = [makeFeedback('alerte', 10)]
    const result = adjustWeights(poids, feedbacks)
    // 'surveillance' n'est pas dans les feedbacks, doit rester inchange
    expect(result.surveillance).toBe(1.2)
  })
})

// ─── getPerformanceClass ────────────────────────────────────────────────────

describe('getPerformanceClass', () => {
  it('retourne "badge neutral" pour null', () => {
    expect(getPerformanceClass(null)).toBe('badge neutral')
  })

  it('retourne "badge success" pour MAE <= 5', () => {
    expect(getPerformanceClass(0)).toBe('badge success')
    expect(getPerformanceClass(5)).toBe('badge success')
  })

  it('retourne "badge primary" pour MAE <= 10', () => {
    expect(getPerformanceClass(6)).toBe('badge primary')
    expect(getPerformanceClass(10)).toBe('badge primary')
  })

  it('retourne "badge warning" pour MAE <= 15', () => {
    expect(getPerformanceClass(11)).toBe('badge warning')
    expect(getPerformanceClass(15)).toBe('badge warning')
  })

  it('retourne "badge danger" pour MAE > 15', () => {
    expect(getPerformanceClass(16)).toBe('badge danger')
    expect(getPerformanceClass(100)).toBe('badge danger')
  })
})

// ─── generateCorrection ─────────────────────────────────────────────────────

describe('generateCorrection', () => {
  it('genere une correction avec un ID unique', () => {
    const c1 = generateCorrection('matrix', 'seuil', 50, 55, 'test', true)
    const c2 = generateCorrection('matrix', 'seuil', 50, 55, 'test', true)
    expect(c1.id).not.toBe(c2.id)
  })

  it('marque "auto" pour les corrections automatiques', () => {
    const c = generateCorrection('bayesian', 'poids', 1.0, 1.2, 'recalibration', true)
    expect(c.appliqueePar).toBe('auto')
    expect(c.modele).toBe('bayesian')
    expect(c.typeCorrection).toBe('poids')
    expect(c.ancienneValeur).toBe(1.0)
    expect(c.nouvelleValeur).toBe(1.2)
  })

  it('marque "admin" pour les corrections manuelles', () => {
    const c = generateCorrection('triggers', 'vraisemblance', 0.8, 0.9, 'ajustement', false)
    expect(c.appliqueePar).toBe('admin')
  })

  it('inclut la raison dans la correction', () => {
    const c = generateCorrection('frequency', 'seuil', 4, 6, 'biais detecte', true)
    expect(c.raison).toBe('biais detecte')
  })
})
