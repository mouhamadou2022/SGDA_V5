// lib/__tests__/evenementUtils.test.ts
import { evenementUtils } from '../evenementUtils'

describe('evenementUtils', () => {
  describe('determinerGravite', () => {
    it('devrait retourner CRITIQUE pour Incursion sur piste', () => {
      expect(evenementUtils.determinerGravite('Incursion sur piste')).toBe('CRITIQUE')
    })

    it('devrait retourner CRITIQUE pour Événement lié à des travaux/maintenance sur ou à proximité d\'une piste', () => {
      expect(evenementUtils.determinerGravite('Événement lié à des travaux/maintenance sur ou à proximité d\'une piste')).toBe('CRITIQUE')
    })

    it('devrait retourner ORANGE pour Émission lasers ou feux non aéronautiques', () => {
      expect(evenementUtils.determinerGravite('Émission lasers ou feux non aéronautiques')).toBe('ORANGE')
    })

    it('devrait retourner JAUNE pour FOD', () => {
      expect(evenementUtils.determinerGravite('FOD')).toBe('JAUNE')
    })

    it('devrait retourner BLEU pour type inconnu', () => {
      expect(evenementUtils.determinerGravite('Inconnu')).toBe('BLEU')
    })
  })

  describe('getDelaiNotification', () => {
    it('devrait retourner 24h pour CRITIQUE', () => {
      expect(evenementUtils.getDelaiNotification('CRITIQUE')).toBe(24)
    })

    it('devrait retourner 48h pour ORANGE', () => {
      expect(evenementUtils.getDelaiNotification('ORANGE')).toBe(48)
    })
  })

  describe('necessiteSMSUrgent', () => {
    it('devrait retourner true pour CRITIQUE', () => {
      expect(evenementUtils.necessiteSMSUrgent('CRITIQUE')).toBe(true)
    })

    it('devrait retourner false pour JAUNE', () => {
      expect(evenementUtils.necessiteSMSUrgent('JAUNE')).toBe(false)
    })
  })

  describe('calculerImpactC5', () => {
    it('devrait retourner 100 si aucun événement', () => {
      expect(evenementUtils.calculerImpactC5([])).toBe(100)
    })

    it('devrait calculer correctement la pénalité', () => {
      const evenements = [
        { gravite: 'CRITIQUE', statut: 'en_cours' } as any,
        { gravite: 'ORANGE', statut: 'en_cours' } as any
      ]
      // CRITIQUE = 40, ORANGE = 20, total 60 → 100-60=40
      expect(evenementUtils.calculerImpactC5(evenements)).toBe(40)
    })
  })

  describe('formatStatut', () => {
    it('devrait formater correctement les statuts', () => {
      expect(evenementUtils.formatStatut('recu')).toBe('Reçu')
      expect(evenementUtils.formatStatut('en_cours')).toBe('En cours d\'instruction')
      expect(evenementUtils.formatStatut('cloture')).toBe('Clôturé')
    })
  })

  describe('estEnRetard', () => {
    it('devrait retourner false si clôturé', () => {
      const evenement = { statut: 'cloture', created_at: new Date().toISOString() } as any
      expect(evenementUtils.estEnRetard(evenement)).toBe(false)
    })

    it('devrait retourner true si délai dépassé', () => {
      const datePassee = new Date()
      datePassee.setDate(datePassee.getDate() - 10)
      const evenement = { 
        statut: 'recu', 
        created_at: datePassee.toISOString() 
      } as any
      expect(evenementUtils.estEnRetard(evenement)).toBe(true)
    })
  })
})