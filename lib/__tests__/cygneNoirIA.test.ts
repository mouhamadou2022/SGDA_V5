// lib/__tests__/cygneNoirIA.test.ts
// Vérifie que l'explication de l'« Alerte Cygne Noir » est construite depuis
// les données réelles (prior / posterior / écarts) et non d'un texte statique.

import { expliquerCygneNoirEnClair } from '@/lib/ia/cygneNoirIA'
import type { ProfilRisque, Ecart } from '@/lib/store'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'aero-1',
    score_global: 55,
    niveau: 'moyen',
    c1: 60, c2: 55, c3: 50, c4: 45, c5: 40,
    prediction_3m: 55,
    prediction_6m: 50,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
    bayesian_prior: 0.1,
    bayesian_posterior: 0.6,
    bayesian_black_swan: true,
    ...overrides,
  }
}

function makeEcart(niveau: Ecart['niveau_risque'], statut: Ecart['statut'] = 'ouvert'): Ecart {
  return {
    id: `e-${niveau}-${statut}`,
    aerodrome_id: 'aero-1',
    domaine: 'OPS',
    reference: 'ref',
    ref_reglementaire: 'ref',
    libelle: 'libellé',
    niveau_risque: niveau,
    statut,
    delai_pac: '2026-03-01',
    delai_regularisation: '2026-04-01',
    inspecteur_ref_id: 'insp-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('expliquerCygneNoirEnClair', () => {
  it('construit une explication à partir du prior/posterior réel (pas de texte statique)', async () => {
    const res = await expliquerCygneNoirEnClair({
      profil: makeProfil({ bayesian_prior: 0.1, bayesian_posterior: 0.6 }),
      ecarts: [],
      evenementsCount: 0,
    })
    expect(res.explication).toContain('10')
    expect(res.explication).toContain('60')
    expect(res.actions.length).toBeGreaterThanOrEqual(2)
  })

  it('mentionne les écarts critiques non clôturés et leurs actions associées', async () => {
    const res = await expliquerCygneNoirEnClair({
      profil: makeProfil(),
      ecarts: [makeEcart('critique'), makeEcart('critique', 'cloture')],
      evenementsCount: 2,
    })
    expect(res.explication).toContain('1 écart(s) critique(s)')
    expect(res.actions.some((a) => a.includes('écart'))).toBe(true)
  })

  it('reste cohérent sans données bayésiennes chiffrées', async () => {
    const res = await expliquerCygneNoirEnClair({
      profil: makeProfil({ bayesian_prior: undefined, bayesian_posterior: undefined }),
      ecarts: [],
      evenementsCount: 0,
    })
    expect(res.explication.length).toBeGreaterThan(20)
  })
})
