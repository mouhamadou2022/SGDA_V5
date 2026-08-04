// lib/__tests__/shapExplainer.test.ts
// Tests de l'attribution additive SHAP-like du score AERORISQ.
// Propriété clé : pour le modèle linéaire pondéré, baseline + Σ φ = score
// (exactitude additive, analogue exacte d'une valeur de Shapley).

import type { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'
import { calculerExplicationShap, construireNarrationShap } from '@/lib/ia/shapExplainer'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'LFOB',
    score_global: 70,
    niveau: 'faible',
    c1: 70, c2: 72, c3: 68, c4: 66, c5: 74,
    prediction_3m: 71,
    prediction_6m: 69,
    tendance: 'stable',
    computed_at: new Date().toISOString(),
    ...overrides,
  }
}

const HISTORIQUE: ScoreHistoryPoint[] = [
  { date: '2026-03-01', score: 64, c1: 62, c2: 66, c3: 60, c4: 58, c5: 70 },
  { date: '2026-04-01', score: 66, c1: 64, c2: 68, c3: 62, c4: 61, c5: 72 },
]

describe('calculerExplicationShap — exactitude additive', () => {
  test('baseline neutre : base + Σφ = score', () => {
    const profil = makeProfil()
    const ex = calculerExplicationShap(profil, HISTORIQUE, 'neutre')
    expect(ex.baseline.valeur).toBe(50)
    expect(Math.abs(ex.ecart)).toBeLessThan(0.51)
    expect(ex.score).toBe(profil.score_global)
    expect(ex.contributions).toHaveLength(5)
  })

  test('baseline moyenne : base + Σφ = score', () => {
    const profil = makeProfil()
    const ex = calculerExplicationShap(profil, HISTORIQUE, 'moyenne')
    expect(Math.abs(ex.ecart)).toBeLessThan(0.51)
  })

test('baseline précédent : base + Σφ = score', () => {
    const profil = makeProfil()
    const ex = calculerExplicationShap(profil, HISTORIQUE, 'precedent')
    // Référence = prédiction attendue au mois précédent (Σ W·refs/100) : 65
    expect(ex.baseline.valeur).toBe(65)
    expect(Math.abs(ex.ecart)).toBeLessThan(0.51)
    expect(ex.variation).toBe(profil.score_global - 65)
  })

  test('chaque φ = poids/100 × (x − référence)', () => {
    const profil = makeProfil()
    const ex = calculerExplicationShap(profil, [], 'neutre')
    // c2 : 25/100 × (72 − 50) = +5.5
    const c2 = ex.contributions.find(c => c.key === 'c2')!
    expect(c2.phi).toBeCloseTo(5.5, 2)
    // c4 : 20/100 × (66 − 50) = +3.2
    const c4 = ex.contributions.find(c => c.key === 'c4')!
    expect(c4.phi).toBeCloseTo(3.2, 2)
  })

  test('sans historique, les modes reviennent à la référence neutre', () => {
    const profil = makeProfil()
    for (const mode of ['moyenne', 'precedent'] as const) {
      const ex = calculerExplicationShap(profil, [], mode)
      expect(ex.baseline.valeur).toBe(50)
      expect(Math.abs(ex.ecart)).toBeLessThan(0.51)
    }
  })

  test('un critère faible crée une contribution négative (baisse)', () => {
    const profil = makeProfil({ c4: 20 })
    const ex = calculerExplicationShap(profil, [], 'neutre')
    const c4 = ex.contributions.find(c => c.key === 'c4')!
    expect(c4.phi).toBeCloseTo(-6, 1)
    expect(c4.direction).toBe('baisse')
    expect(ex.totalBaisse).toBeLessThan(0)
  })
})

describe('construireNarrationShap', () => {
  test('produit une phrase qui mentionne le score et la référence', () => {
    const profil = makeProfil()
    const ex = calculerExplicationShap(profil, HISTORIQUE, 'neutre')
    const narration = construireNarrationShap(ex)
    expect(narration).toContain(String(ex.score))
    expect(narration.length).toBeGreaterThan(40)
  })

  test('cas aligné sur la référence', () => {
    const profil = makeProfil({ c1: 50, c2: 50, c3: 50, c4: 50, c5: 50, score_global: 50 })
    const ex = calculerExplicationShap(profil, [], 'neutre')
    const narration = construireNarrationShap(ex)
    expect(narration).toContain('aucun critère ne tire')
  })
})

