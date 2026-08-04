// lib/__tests__/explicabiliteIA.test.ts
// Vérifie que l'explication de la carte « Explicabilité du score » est construite
// depuis les données réelles (score, critères, importance, deltas) et non d'un
// texte statique — fallback déterministe si l'API n'est pas disponible.

import { expliquerScoreEnClair } from '@/lib/ia/explicabiliteIA'
import type { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'GOBD',
    score_global: 45,
    niveau: 'eleve',
    c1: 60, c2: 40, c3: 70, c4: 25, c5: 80,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as ProfilRisque
}

describe('expliquerScoreEnClair (fallback déterministe)', () => {
  it('reflète le score global et le critère le plus dégradé', async () => {
    const res = await expliquerScoreEnClair({ profil: makeProfil(), ecarts: [], correlation: null })
    expect(res.synthese).toContain('45/100')
    expect(res.synthese).toContain('Charge critique')
    expect(res.fallbackIA).toBe(true)
  })

  it('cite le critère le plus pondéré (importance) dans les facteurs', async () => {
    const res = await expliquerScoreEnClair({ profil: makeProfil(), ecarts: [], correlation: null })
    expect(res.facteurs).toContain('Efficacité PAC') // poids par défaut C2=25%
  })

  it('liste les critères sous le seuil de vigilance en priorités', async () => {
    const res = await expliquerScoreEnClair({ profil: makeProfil(), ecarts: [], correlation: null })
    expect(res.priorites).toContain('Charge critique')
    expect(res.priorites).toContain('Efficacité PAC')
  })

  it('détecte les évolutions depuis le mois dernier via les deltas', async () => {
    const history: ScoreHistoryPoint[] = [
      { date: '2025-12-01', score: 40, c4: 15 },
      { date: '2026-01-01', score: 45, c4: 25 },
    ]
    const res = await expliquerScoreEnClair({ profil: makeProfil({ historical_scores: history }), ecarts: [], correlation: null })
    expect(res.evolutions).toContain('Charge critique')
    expect(res.evolutions).toContain('gagné')
  })

  it('indique la stabilité quand aucun critère n\'a évolué', async () => {
    const res = await expliquerScoreEnClair({ profil: makeProfil(), ecarts: [], correlation: null })
    expect(res.evolutions).toContain('stable')
  })

  it('confirme l\'absence de priorité quand tous les critères sont solides', async () => {
    const res = await expliquerScoreEnClair({
      profil: makeProfil({ c1: 85, c2: 80, c3: 90, c4: 75, c5: 88, score_global: 82 }),
      ecarts: [],
      correlation: null,
    })
    expect(res.priorites).toContain('Aucun critère sous le seuil de vigilance')
  })
})
