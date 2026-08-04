// lib/__tests__/bayesExplicationIA.test.ts
// Vérifie que l'explication de la carte « Analyse bayésienne » est construite
// depuis les données réelles (prior / posterior / critères dégradés / écarts)
// et non d'un texte statique — fallback déterministe si l'API n'est pas dispo.

import { expliquerBayesEnClair, pctBayes, CRITERE_INDICE } from '@/lib/ia/bayesExplicationIA'
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
    bayesian_posterior: 0.3,
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

describe('expliquerBayesEnClair', () => {
  it("construit l'interprétation à partir du prior/posterior réel (pas de texte statique)", async () => {
    const res = await expliquerBayesEnClair({
      profil: makeProfil({ bayesian_prior: 0.1, bayesian_posterior: 0.3 }),
      ecarts: [],
    })
    expect(res.explication.length).toBeGreaterThan(20)
    expect(res.interpretation).toContain('10')
    expect(res.interpretation).toContain('30')
    expect(res.actions.length).toBeGreaterThanOrEqual(1)
  })

  it('évoque les écarts actifs et y relie une action', async () => {
    const res = await expliquerBayesEnClair({
      profil: makeProfil({ c4: 30, c2: 25 }),
      ecarts: [makeEcart('critique'), makeEcart('eleve')],
    })
    expect(res.interpretation).toContain('2 écart(s)')
    expect(res.actions.some((a) => a.toLowerCase().includes('écart'))).toBe(true)
  })

  it("détecte le cygne noir dans l'interprétation", async () => {
    const res = await expliquerBayesEnClair({
      profil: makeProfil({ bayesian_prior: 0.1, bayesian_posterior: 0.6, bayesian_black_swan: true }),
      ecarts: [],
    })
    expect(res.interpretation.toLowerCase()).toContain('cygne noir')
  })

  it('pctBayes normalise fractions et pourcentages 0-100', () => {
    expect(pctBayes(0.15)).toBe(15)
    expect(pctBayes(42)).toBe(42)
    expect(pctBayes(undefined)).toBeNull()
  })

  it('CRITERE_INDICE couvre les 5 critères C1-C5', () => {
    expect(Object.keys(CRITERE_INDICE)).toHaveLength(5)
    expect(CRITERE_INDICE.c4.signal).toContain('écarts critiques')
  })
})
