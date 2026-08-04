// lib/__tests__/evenementUtils.test.ts
import { evenementUtils, normaliserGravite } from '../evenementUtils'

describe('evenementUtils', () => {
  describe('determinerGravite', () => {
    it('devrait retourner critique pour Incursion sur piste', () => {
      expect(evenementUtils.determinerGravite('Incursion sur piste')).toBe('critique')
    })

    it('devrait retourner critique pour Événement lié à des travaux/maintenance sur ou à proximité d\'une piste', () => {
      expect(evenementUtils.determinerGravite('Événement lié à des travaux/maintenance sur ou à proximité d\'une piste')).toBe('critique')
    })

    it('devrait retourner eleve pour Émission lasers ou feux non aéronautiques', () => {
      expect(evenementUtils.determinerGravite('Émission lasers ou feux non aéronautiques')).toBe('eleve')
    })

    it('devrait retourner moyen pour FOD', () => {
      expect(evenementUtils.determinerGravite('FOD')).toBe('moyen')
    })

    it('devrait retourner faible pour type inconnu', () => {
      expect(evenementUtils.determinerGravite('Inconnu')).toBe('faible')
    })
  })

  describe('normaliserGravite', () => {
    it('devrait convertir les anciennes valeurs OACI vers les 4 niveaux de risque', () => {
      expect(normaliserGravite('CRITIQUE')).toBe('critique')
      expect(normaliserGravite('ORANGE')).toBe('eleve')
      expect(normaliserGravite('JAUNE')).toBe('moyen')
      expect(normaliserGravite('GRIS')).toBe('faible')
      expect(normaliserGravite('BLEU')).toBe('faible')
      expect(normaliserGravite('critique')).toBe('critique')
      expect(normaliserGravite('')).toBe('moyen')
    })
  })

  describe('getDelaiNotification', () => {
    it('devrait retourner 24h pour critique', () => {
      expect(evenementUtils.getDelaiNotification('critique')).toBe(24)
    })

    it('devrait retourner 48h pour eleve', () => {
      expect(evenementUtils.getDelaiNotification('eleve')).toBe(48)
    })

    it('devrait gérer les anciennes valeurs OACI', () => {
      expect(evenementUtils.getDelaiNotification('CRITIQUE')).toBe(24)
    })
  })

  describe('necessiteSMSUrgent', () => {
    it('devrait retourner true pour critique', () => {
      expect(evenementUtils.necessiteSMSUrgent('critique')).toBe(true)
    })

    it('devrait retourner false pour moyen', () => {
      expect(evenementUtils.necessiteSMSUrgent('moyen')).toBe(false)
    })
  })

  describe('calculerImpactC5', () => {
    it('devrait retourner 100 si aucun événement', () => {
      expect(evenementUtils.calculerImpactC5([])).toBe(100)
    })

    it('devrait calculer correctement la pénalité', () => {
      const evenements = [
        { gravite: 'critique', statut: 'en_cours' } as any,
        { gravite: 'eleve', statut: 'en_cours' } as any
      ]
      // critique = 40, eleve = 20, total 60 → 100-60=40
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