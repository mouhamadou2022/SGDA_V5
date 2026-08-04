// lib/__tests__/ongletExplicationIA.test.ts
// Vérifie que l'explication de chaque onglet du profil de risque retombe bien
// sur le fallback déterministe (construit à partir des valeurs réelles du
// profil) quand l'API IA n'est pas disponible.

import { expliquerOngletProfil } from '@/lib/ia/ongletExplicationIA'
import type { ProfilRisque } from '@/lib/store'

function makeProfil(): ProfilRisque {
  return {
    aerodrome_id: 'aero-1',
    score_global: 55,
    niveau: 'moyen',
    c1: 60, c2: 55, c3: 50, c4: 45, c5: 40,
    prediction_3m: 52,
    prediction_6m: 48,
    prediction_12m: 45,
    incident_prediction_3m: 30,
    incident_prediction_6m: 45,
    incident_prediction_12m: 60,
    tendance: 'baisse',
    computed_at: '2026-01-01T00:00:00Z',
    extreme_risk: { tailRisk: 0.08, isHeavyTailed: true, maxExpected12m: 90 },
  }
}

describe('expliquerOngletProfil', () => {
  it.each(['synthese', 'diagnostic', 'anticipation', 'actions'] as const)(
    'retombe sur le fallback déterministe pour l\'onglet %s',
    async (ongletId) => {
      const res = await expliquerOngletProfil({
        ongletId,
        profil: makeProfil(),
        historiqueScores: [],
      })
      expect(res.explication.length).toBeGreaterThan(20)
      expect(res.fallbackIA).toBe(true)
    }
  )

  it('reflète les valeurs réelles du profil dans le fallback Synthèse', async () => {
    const profil = makeProfil()
    const res = await expliquerOngletProfil({
      ongletId: 'synthese',
      profil,
      historiqueScores: [],
    })
    expect(res.explication).toContain('55/100')
    expect(res.explication).toContain('moyen')
    expect(res.explication).toContain('dégradation')
  })

  it('reflète les valeurs réelles du profil dans le fallback Anticipation', async () => {
    const profil = makeProfil()
    const res = await expliquerOngletProfil({
      ongletId: 'anticipation',
      profil,
      historiqueScores: [],
    })
    expect(res.explication).toContain('52')
    expect(res.explication).toContain('48')
    expect(res.explication).toContain('45 %')
    expect(res.explication).toContain('8')
  })

  it('reflète le critère le plus faible dans le fallback Diagnostic', async () => {
    const profil = makeProfil()
    const res = await expliquerOngletProfil({
      ongletId: 'diagnostic',
      profil,
      historiqueScores: [{ date: '2026-01-01', score: 60 }, { date: '2026-02-01', score: 55 }],
    })
    expect(res.explication).toContain('résilience')
    expect(res.explication).toContain('40/100')
    expect(res.explication).toContain('2 points')
  })

  it('reflète le score dans le fallback Actions', async () => {
    const profil = makeProfil()
    const res = await expliquerOngletProfil({
      ongletId: 'actions',
      profil,
      historiqueScores: [],
    })
    expect(res.explication).toContain('55/100')
  })
})
