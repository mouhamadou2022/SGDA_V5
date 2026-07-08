// lib/__tests__/randomForest.test.ts
import { trainRandomForest, predictRandomForest, profilToFeatures, scoreToLabel } from '../risque/randomForest'
import type { TrainingSample } from '../risque/randomForest'

describe('RandomForest', () => {
  describe('trainRandomForest', () => {
    it('devrait entraîner un modèle avec des échantillons', async () => {
      const samples: TrainingSample[] = [
        { features: { score_global: 85, c1: 80, c2: 90, c3: 85, c4: 80, c5: 90, tendance_baisse: 0, tendance_hausse: 1, prediction_3m: 85, prediction_6m: 88, ecart_c1_c2: 10, ecart_c3_c4: 5, min_critere: 80 }, label: 'faible' },
        { features: { score_global: 70, c1: 65, c2: 75, c3: 70, c4: 60, c5: 80, tendance_baisse: 0, tendance_hausse: 0, prediction_3m: 68, prediction_6m: 65, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 60 }, label: 'moyen' },
        { features: { score_global: 45, c1: 40, c2: 50, c3: 45, c4: 30, c5: 60, tendance_baisse: 1, tendance_hausse: 0, prediction_3m: 40, prediction_6m: 35, ecart_c1_c2: 10, ecart_c3_c4: 15, min_critere: 30 }, label: 'eleve' },
        { features: { score_global: 20, c1: 15, c2: 25, c3: 20, c4: 10, c5: 30, tendance_baisse: 1, tendance_hausse: 0, prediction_3m: 15, prediction_6m: 10, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 10 }, label: 'critique' },
        { features: { score_global: 90, c1: 95, c2: 85, c3: 90, c4: 85, c5: 95, tendance_baisse: 0, tendance_hausse: 1, prediction_3m: 92, prediction_6m: 94, ecart_c1_c2: 10, ecart_c3_c4: 5, min_critere: 85 }, label: 'faible' },
        { features: { score_global: 75, c1: 70, c2: 80, c3: 75, c4: 65, c5: 85, tendance_baisse: 0, tendance_hausse: 0, prediction_3m: 73, prediction_6m: 70, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 65 }, label: 'moyen' },
        { features: { score_global: 50, c1: 45, c2: 55, c3: 50, c4: 40, c5: 60, tendance_baisse: 1, tendance_hausse: 0, prediction_3m: 48, prediction_6m: 42, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 40 }, label: 'eleve' },
        { features: { score_global: 15, c1: 10, c2: 20, c3: 15, c4: 5, c5: 25, tendance_baisse: 1, tendance_hausse: 0, prediction_3m: 10, prediction_6m: 5, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 5 }, label: 'critique' },
        { features: { score_global: 88, c1: 85, c2: 92, c3: 88, c4: 82, c5: 90, tendance_baisse: 0, tendance_hausse: 1, prediction_3m: 88, prediction_6m: 90, ecart_c1_c2: 7, ecart_c3_c4: 6, min_critere: 82 }, label: 'faible' },
        { features: { score_global: 65, c1: 60, c2: 70, c3: 65, c4: 55, c5: 75, tendance_baisse: 0, tendance_hausse: 0, prediction_3m: 63, prediction_6m: 60, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 55 }, label: 'moyen' },
        { features: { score_global: 35, c1: 30, c2: 40, c3: 35, c4: 25, c5: 45, tendance_baisse: 1, tendance_hausse: 0, prediction_3m: 30, prediction_6m: 25, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 25 }, label: 'eleve' },
        { features: { score_global: 25, c1: 20, c2: 30, c3: 25, c4: 15, c5: 35, tendance_baisse: 1, tendance_hausse: 0, prediction_3m: 22, prediction_6m: 18, ecart_c1_c2: 10, ecart_c3_c4: 10, min_critere: 15 }, label: 'critique' },
      ]

      const model = await trainRandomForest(samples, 5, 3, 2)
      expect(model).toBeDefined()
      expect(model.trainingSamples).toBe(12)
    })
  })

  describe('predictRandomForest', () => {
    it('devrait prédire "moyen" si le modèle est vide', () => {
      const model = { trees: [], featureImportance: new Map(), accuracy: 0, trainingSamples: 0 }
      const prediction = predictRandomForest(model, { score_global: 50 })
      expect(prediction).toBe('moyen')
    })
  })

  describe('profilToFeatures', () => {
    it('devrait extraire les caractéristiques', () => {
      const profil = { score_global: 75, c1: 70, c2: 80, c3: 75, c4: 65, c5: 85, tendance: 'hausse' as const, prediction_3m: 72, prediction_6m: 68 }
      const features = profilToFeatures(profil)

      expect(features.score_global).toBe(75)
      expect(features.tendance_hausse).toBe(1)
      expect(features.tendance_baisse).toBe(0)
      expect(features.ecart_c1_c2).toBe(10)
      expect(features.min_critere).toBe(65)
    })
  })

  describe('scoreToLabel', () => {
    it('devrait mapper les scores aux labels', () => {
      expect(scoreToLabel(85)).toBe('faible')
      expect(scoreToLabel(70)).toBe('moyen')
      expect(scoreToLabel(45)).toBe('eleve')
      expect(scoreToLabel(20)).toBe('critique')
    })
  })
})
