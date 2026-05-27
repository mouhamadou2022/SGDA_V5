// lib/__tests__/enqueteUtils.test.ts
import { enqueteUtils } from '../enqueteUtils'

describe('enqueteUtils', () => {
  describe('calculerImpactC1', () => {
    it('devrait retourner 0 si aucune question Likert', () => {
      const questions: any[] = []
      const reponses: any[] = []
      expect(enqueteUtils.calculerImpactC1(reponses, questions)).toBe(0)
    })

    it('devrait calculer correctement le score C1', () => {
      const questions = [
        { id: 'q1', impact_c1: true },
        { id: 'q2', impact_c1: true }
      ]
      const reponses = [
        { id: 'q1', reponse: 4 },
        { id: 'q2', reponse: 5 }
      ]
      // (4+5)/2 = 4.5 → *20 = 90
      expect(enqueteUtils.calculerImpactC1(reponses as any, questions as any)).toBe(90)
    })
  })

  describe('calculerTauxReponse', () => {
    it('devrait retourner 0 si aucun aérodrome ciblé', () => {
      const enquete = { aerodrome_ids: [] } as any
      expect(enqueteUtils.calculerTauxReponse(enquete, [])).toBe(0)
    })

    it('devrait calculer correctement le taux', () => {
      const enquete = { aerodrome_ids: ['a1', 'a2', 'a3', 'a4'] } as any
      const reponses = [
        { enquete_id: 'e1', aerodrome_id: 'a1' },
        { enquete_id: 'e1', aerodrome_id: 'a2' }
      ] as any
      expect(enqueteUtils.calculerTauxReponse(enquete, reponses)).toBe(50)
    })
  })

  describe('getStatistiquesQuestion', () => {
    it('devrait calculer la moyenne pour likert', () => {
      const question = { id: 'q1', type: 'likert_5' } as any
      const reponses = [
        { q1: 4 },
        { q1: 5 },
        { q1: 3 }
      ]
      const stats = enqueteUtils.getStatistiquesQuestion(question, reponses)
      expect(stats.moyenne).toBe(4)
      expect(stats.repartition).toEqual({ '3': 1, '4': 1, '5': 1 })
    })

    it('devrait compter pour texte libre', () => {
      const question = { id: 'q1', type: 'texte_libre' } as any
      const reponses = [
        { q1: 'réponse 1' },
        { q1: 'réponse 2' }
      ]
      const stats = enqueteUtils.getStatistiquesQuestion(question, reponses)
      expect(stats.count).toBe(2)
    })
  })

  describe('estExpiree', () => {
    it('devrait retourner true si date dépassée', () => {
      const datePassee = new Date()
      datePassee.setDate(datePassee.getDate() - 1)
      const enquete = { deadline: datePassee.toISOString() } as any
      expect(enqueteUtils.estExpiree(enquete)).toBe(true)
    })

    it('devrait retourner false si date future', () => {
      const dateFuture = new Date()
      dateFuture.setDate(dateFuture.getDate() + 1)
      const enquete = { deadline: dateFuture.toISOString() } as any
      expect(enqueteUtils.estExpiree(enquete)).toBe(false)
    })
  })
})