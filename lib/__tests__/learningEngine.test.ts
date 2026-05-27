// lib/__tests__/learningEngine.test.ts

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Empêche l'import de checklistMemory → store → supabase (qui lève une erreur
// si les variables d'environnement Supabase sont absentes en test).
jest.mock('../checklistMemory', () => ({
  checklistMemory: {
    recordCorrection: jest.fn(),
    getProblematicItems: jest.fn(() => []),
    getLearningStats: jest.fn(() => ({ confiance_moyenne: 80 })),
  },
}))

// riskEngine est importé par learningEngine (chemin transitif vers store/supabase)
jest.mock('../riskEngine', () => ({
  riskEngine: {},
}))

// Le type ProfilRisque vient de store — on mock le module pour éviter le throw
jest.mock('../store', () => ({
  useAppStore: jest.fn(),
}))

import { recordLearningFeedback, calculatePerformance, recalibrateModel, getDetailedLearningStats, resetLearningData } from '../learningEngine'

describe('LearningEngine', () => {
  beforeEach(() => {
    resetLearningData()
  })

  describe('recordLearningFeedback', () => {
    it('devrait enregistrer un feedback et le retourner', () => {
      const feedback = recordLearningFeedback(
        'aero-1', 'SGS', 'Documentation', 'item-1',
        'SA', 80, 'NS', 'Erreur de prédiction'
      )

      expect(feedback).toBeDefined()
      expect(feedback.justesse).toBe(false)
      expect(feedback.impact_confiance).toBe(-10)
      expect(feedback.aerodrome_id).toBe('aero-1')
    })

    it('devrait marquer comme correct si prédiction == correction', () => {
      const feedback = recordLearningFeedback(
        'aero-1', 'SGS', 'Documentation', 'item-1',
        'SA', 80, 'SA'
      )

      expect(feedback.justesse).toBe(true)
      expect(feedback.impact_confiance).toBe(5)
    })
  })

  describe('calculatePerformance', () => {
    it('devrait retourner 0 si aucun feedback', () => {
      const perf = calculatePerformance()
      expect(perf.precision_globale).toBe(0)
      expect(perf.total_feedbacks).toBe(0)
    })

    it('devrait calculer la précision avec des feedbacks', () => {
      // Ajouter 3 feedbacks corrects, 1 incorrect
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i1', 'SA', 80, 'SA')
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i2', 'NS', 70, 'NS')
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i3', 'SA', 85, 'SA')
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i4', 'SA', 80, 'NS')

      const perf = calculatePerformance()
      expect(perf.total_feedbacks).toBe(4)
      expect(perf.precision_globale).toBe(75) // 3/4
    })

    it('devrait calculer le taux de faux positifs', () => {
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i1', 'SA', 80, 'NS')
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i2', 'SA', 80, 'SA')
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i3', 'SA', 80, 'NS')

      const perf = calculatePerformance()
      expect(perf.taux_faux_positifs).toBeGreaterThan(0)
    })

    it('devrait grouper par domaine', () => {
      recordLearningFeedback('aero-1', 'SGS', 'Doc', 'i1', 'SA', 80, 'SA')
      recordLearningFeedback('aero-1', 'PHY', 'Piste', 'i2', 'NS', 70, 'NS')

      const perf = calculatePerformance()
      expect(Object.keys(perf.precision_par_domaine)).toContain('SGS')
      expect(Object.keys(perf.precision_par_domaine)).toContain('PHY')
    })
  })

  describe('recalibrateModel', () => {
    it('devrait incrémenter la version du modèle', () => {
      const model1 = recalibrateModel('auto', 'system')
      expect(model1.version).toBe(2) // version initiale = 1

      const model2 = recalibrateModel('manuel', 'test-admin')
      expect(model2.version).toBe(3)
    })

    it('devrait enregistrer le déclencheur', () => {
      const model = recalibrateModel('manuel', 'admin-test')
      expect(model.declencheur).toBe('manuel')
      expect(model.initie_par).toBe('admin-test')
    })
  })

  describe('getDetailedLearningStats', () => {
    it('devrait retourner des stats avec ou sans données', () => {
      const stats = getDetailedLearningStats()
      expect(stats).toBeDefined()
      expect(stats).toHaveProperty('total_feedbacks')
      expect(stats).toHaveProperty('taux_justesse')
      expect(stats).toHaveProperty('version_modele')
    })
  })
})
