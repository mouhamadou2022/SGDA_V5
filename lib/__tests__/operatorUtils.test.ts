// lib/__tests__/operatorUtils.test.ts
import { operatorUtils } from '../operatorUtils'

describe('operatorUtils', () => {
  const mockEcarts = [
    { aerodrome_id: 'a1', niveau_risque: 'critique', statut: 'ouvert' },
    { aerodrome_id: 'a1', niveau_risque: 'eleve', statut: 'ouvert' },
    { aerodrome_id: 'a1', niveau_risque: 'moyen', statut: 'pac_attendu' },
    { aerodrome_id: 'a1', niveau_risque: 'faible', statut: 'cloture' },
    { aerodrome_id: 'a2', niveau_risque: 'critique', statut: 'en_retard' }
  ] as any

  describe('getEcartsExploitant', () => {
    it('devrait filtrer par aérodrome', () => {
      const result = operatorUtils.getEcartsExploitant(mockEcarts, 'a1')
      expect(result).toHaveLength(4)
      expect(result.every(e => e.aerodrome_id === 'a1')).toBe(true)
    })
  })

  describe('getStatsEcarts', () => {
    it('devrait calculer les statistiques', () => {
      const stats = operatorUtils.getStatsEcarts(mockEcarts)
      expect(stats).toEqual({
        critiques: 2,
        eleves: 1,
        moyens: 1,
        faibles: 0,
        total: 5,
        enRetard: 1
      })
    })
  })

  describe('peutSoumettrePAC', () => {
    it('devrait permettre pour dg_operator sur écart ouvert', () => {
      const ecart = { statut: 'ouvert' } as any
      expect(operatorUtils.peutSoumettrePAC(ecart, 'dg_operator')).toBe(true)
    })

    it('devrait permettre pour focal_operator sur écart refusé', () => {
      const ecart = { statut: 'pac_refuse' } as any
      expect(operatorUtils.peutSoumettrePAC(ecart, 'focal_operator')).toBe(true)
    })

    it('devrait refuser pour staff_operator', () => {
      const ecart = { statut: 'ouvert' } as any
      expect(operatorUtils.peutSoumettrePAC(ecart, 'staff_operator')).toBe(false)
    })

    it('devrait refuser si statut incorrect', () => {
      const ecart = { statut: 'cloture' } as any
      expect(operatorUtils.peutSoumettrePAC(ecart, 'dg_operator')).toBe(false)
    })
  })

  describe('peutSoumettrePreuves', () => {
    it('devrait permettre si PAC accepté', () => {
      const ecart = { statut: 'pac_accepte' } as any
      expect(operatorUtils.peutSoumettrePreuves(ecart, 'dg_operator')).toBe(true)
    })

    it('devrait refuser si autre statut', () => {
      const ecart = { statut: 'ouvert' } as any
      expect(operatorUtils.peutSoumettrePreuves(ecart, 'dg_operator')).toBe(false)
    })
  })

  describe('getActionsRequises', () => {
    it('devrait compter les actions nécessaires', () => {
      const ecarts = [
        { statut: 'ouvert' },
        { statut: 'pac_refuse' },
        { statut: 'pac_accepte' },
        { statut: 'cloture' }
      ] as any
      expect(operatorUtils.getActionsRequises(ecarts)).toEqual({
        pacASoumettre: 2,
        preuvesASoumettre: 1,
        total: 3
      })
    })
  })

  describe('formatRole', () => {
    it('devrait formater les rôles', () => {
      expect(operatorUtils.formatRole('dg_operator')).toBe('Directeur d\'Exploitation')
      expect(operatorUtils.formatRole('focal_operator')).toBe('Point Focal')
      expect(operatorUtils.formatRole('staff_operator')).toBe('Personnel')
    })
  })

  describe('hasWriteAccess', () => {
    it('devrait donner accès écriture à DG et Focal', () => {
      expect(operatorUtils.hasWriteAccess('dg_operator')).toBe(true)
      expect(operatorUtils.hasWriteAccess('focal_operator')).toBe(true)
      expect(operatorUtils.hasWriteAccess('staff_operator')).toBe(false)
    })
  })
})