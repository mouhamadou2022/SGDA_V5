// lib/__tests__/risqueUtils.test.ts
import { risqueUtils } from '../risque'

describe('risqueUtils', () => {
  describe('calculateC2FromEcarts', () => {
    it('devrait retourner 100 si aucun écart', () => {
      expect(risqueUtils.calculateC2FromEcarts([])).toBe(100)
    })

    it('devrait calculer le score C2', () => {
      const maintenant = new Date()
      const dateCreation = new Date(maintenant)
      dateCreation.setDate(dateCreation.getDate() - 10)
      
      const dateEcheance = new Date(maintenant)
      dateEcheance.setDate(dateEcheance.getDate() + 10)
      
      const ecart = {
        aerodrome_id: 'a1',
        statut: 'cloture',
        cloture_le: maintenant.toISOString(),
        created_at: dateCreation.toISOString(),
        delai_regularisation: dateEcheance.toISOString()
      }
      
      const ecarts = [ecart] as any
      
      const score = risqueUtils.calculateC2FromEcarts(ecarts, 'a1')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  describe('calculateC4FromEcarts', () => {
    it('devrait retourner 100 si aucun écart actif', () => {
      expect(risqueUtils.calculateC4FromEcarts([])).toBe(100)
    })

    it('devrait pénaliser les écarts critiques', () => {
      const ecarts = [
        { aerodrome_id: 'a1', niveau_risque: 'critique', statut: 'ouvert' },
        { aerodrome_id: 'a1', niveau_risque: 'eleve', statut: 'ouvert' }
      ] as any
      
      const score = risqueUtils.calculateC4FromEcarts(ecarts, 'a1')
      // critique(4) + eleve(2) = 6 → 100 - (6/50*100) = 88
      expect(score).toBe(88)
    })
  })

  describe('mettreAJourProfilRisque', () => {
    it('devrait mettre à jour le profil', () => {
      // Profil parfait (100) → tout écart actif doit le dégrader
      const ancienProfil = {
        aerodrome_id: 'a1',
        score_global: 100,
        niveau: 'faible' as const,
        c1: 100,
        c2: 100,
        c3: 100,
        c4: 100,
        c5: 100,
        prediction_3m: 100,
        prediction_6m: 100,
        tendance: 'stable' as const,
        computed_at: new Date().toISOString()
      }

      // 1 écart critique → penalty=4 → c4 = 100 - (4/50)*100 = 92 < 100
      const ecarts = [
        { aerodrome_id: 'a1', niveau_risque: 'critique', statut: 'ouvert' }
      ] as any

      const nouveauProfil = risqueUtils.mettreAJourProfilRisque(ancienProfil, ecarts, 'a1')
      // c4 passe de 100 à 92 (dégradé par l'écart critique)
      expect(nouveauProfil.c4).toBeLessThan(ancienProfil.c4)
      // score_global passe de 100 à ~99 (c4 pénalisé, autres dims conservées)
      expect(nouveauProfil.score_global).toBeLessThan(ancienProfil.score_global)
    })
  })

  describe('calculateC1 (clamp NaN)', () => {
    it('devrait retourner 50 si maturiteSgs est NaN', () => {
      expect(risqueUtils.calculateC1(NaN)).toBe(50)
    })

    it('devrait retourner 50 si maturiteSgs est undefined (castée)', () => {
      expect(risqueUtils.calculateC1(undefined as any)).toBe(50)
    })

    it('devrait clamp entre 0 et 100', () => {
      expect(risqueUtils.calculateC1(-5)).toBe(0)
      expect(risqueUtils.calculateC1(10)).toBeLessThanOrEqual(100)
    })

    it('devrait calculer normalement pour des valeurs valides', () => {
      expect(risqueUtils.calculateC1(1)).toBe(0)   // (1-1)*25 = 0
      expect(risqueUtils.calculateC1(3)).toBe(50)  // (3-1)*25 = 50
      expect(risqueUtils.calculateC1(5)).toBe(100) // (5-1)*25 = 100
    })
  })

  describe('computeIncidentPrediction (gravite manquante)', () => {
    it('ne devrait pas crasher si gravite est undefined', () => {
      const evenements = [
        { gravite: 'CRITIQUE', date: new Date().toISOString() },
        { gravite: '', date: new Date().toISOString() },
        { date: new Date().toISOString() } as any,
      ]
      expect(() => risqueUtils.computeIncidentPrediction(evenements)).not.toThrow()
    })

    it('devrait retourner une prédiction', () => {
      const result = risqueUtils.computeIncidentPrediction([
        { gravite: 'CRITIQUE', date: new Date().toISOString() },
      ])
      expect(result).toHaveProperty('probability3m')
      expect(result).toHaveProperty('probability6m')
      expect(result).toHaveProperty('expectedEventsPerMonth')
      expect(result).toHaveProperty('severityTrend')
    })
  })
})
