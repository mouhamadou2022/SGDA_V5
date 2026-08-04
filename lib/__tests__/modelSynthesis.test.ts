// lib/__tests__/modelSynthesis.test.ts
// Vérifie le moteur de synthèse : le nombre de votes ne dépasse jamais le
// maximum affiché « X modèles actifs / max » (carte Statut des modèles).

import { synthetiserModeles, NOMBRE_MAX_VOTES, dataSupportFor } from '@/lib/risque/modelSynthesis'
import type { ProfilRisque } from '@/lib/store'

function profilComplet(): ProfilRisque {
  return {
    aerodrome_id: 'GOBD',
    score_global: 55,
    niveau: 'moyen',
    c1: 60, c2: 55, c3: 50, c4: 45, c5: 40,
    ensemble_confidence: 70,
    velocity_metrics: { vitesse: -1.2, niveau_vigilance: 'surveillance', derniere_maj: '2026-01-01' },
    system_stress: { score: 40, niveau_stress: 'modere', recommandation: 'vérifier' },
    proactive_alert: { niveau_urgence: 'info', message_court: 'ok' },
    hawkes_intensity: 0.8,
    hmm_state: { currentStateName: 'stable', isTransitioning: false, transitionRisk: 12, daysToCritical: 999 },
    survival_metrics: { hazard90d: 0.25, hazard180d: 0.4, medianDays: 180 },
    extreme_risk: { tailRisk: 0.1, isHeavyTailed: false, maxExpected12m: 5 },
    bayesian_posterior: 30,
    bayesian_prior: 25,
    copula_metrics: { maxTailDependence: 0.5, worstCaseProbability: 0.2, worstCaseDescription: 'conjonction' },
    negbin_metrics: { isOverdispersed: false, dispersion: 1.1, mean: 2, variance: 2.2 },
    incident_prediction_3m: 35,
    prediction_3m: 50,
    prediction_6m: 45,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
  } as unknown as ProfilRisque
}

describe('modelSynthesis', () => {
  it('expose un maximum de 12 votes cohérent avec le moteur', () => {
    expect(NOMBRE_MAX_VOTES).toBe(12)
  })

  it('émet exactement 12 votes pour un profil complet', () => {
    const diag = synthetiserModeles(profilComplet())
    expect(diag.votes.length).toBe(12)
    expect(diag.votes.length).toBeLessThanOrEqual(NOMBRE_MAX_VOTES)
  })

  it('n\'émet que les votes dont les données existent (data-driven)', () => {
    const diag = synthetiserModeles({
      aerodrome_id: 'GOBD',
      score_global: 55,
      niveau: 'moyen',
      c1: 60, c2: 55, c3: 50, c4: 45, c5: 40,
      prediction_3m: 50,
      prediction_6m: 45,
      tendance: 'stable',
      computed_at: '2026-01-01T00:00:00Z',
    } as ProfilRisque)
    expect(diag.votes.length).toBe(1) // seul le score global C1-C5 vote
    expect(diag.votes[0].nom).toBe('Score global C1-C5')
  })

  it('calcule une confiance globale bornée entre 20 et 100', () => {
    const diag = synthetiserModeles(profilComplet())
    expect(diag.confianceGlobale).toBeGreaterThanOrEqual(20)
    expect(diag.confianceGlobale).toBeLessThanOrEqual(100)
  })

  it('pondère les modèles prédictifs selon la quantité de données', () => {
    expect(dataSupportFor('HMM (Markov)', { score_global: 55 } as ProfilRisque)).toBe(0.4)
    expect(
      dataSupportFor('HMM (Markov)', {
        score_global: 55,
        historical_scores: Array.from({ length: 10 }, (_, i) => ({ date: `2025-${i + 1}-01`, score: 55 })),
      } as ProfilRisque)
    ).toBe(1)
  })

  it('expose le support de données sur chaque vote', () => {
    const diag = synthetiserModeles(profilComplet())
    const hmm = diag.votes.find((v) => v.nom === 'HMM (Markov)')
    expect(hmm?.dataSupport).toBe(40) // pas d'historique dans le profil complet
    expect(diag.votes.every((v) => v.dataSupport !== undefined)).toBe(true)
  })

  it('tempère un vote extrême porté par peu de données (pas de contradiction)', () => {
    const diag = synthetiserModeles({
      ...profilComplet(),
      score_global: 70, // score solide → indice 30
      historical_scores: Array.from({ length: 3 }, (_, i) => ({ date: `2025-${i + 1}-01`, score: 70, c1: 60, c2: 55, c3: 50, c4: 45, c5: 40 })),
      hmm_state: { currentStateName: 'dégradation', isTransitioning: true, transitionRisk: 90, daysToCritical: 45 },
    })
    const hmm = diag.votes.find((v) => v.nom === 'HMM (Markov)')
    expect(hmm?.indiceDegradation).toBe(85) // vote extrême
    expect(hmm?.dataSupport).toBeLessThan(70) // mais données limitées (3 relevés, puis pénalisé)
    expect(diag.indiceGlobal).toBeLessThan(55) // consensus tempéré, pas tiré par le vote faible
    expect(diag.indiceGlobal).toBeGreaterThan(30)
  })

  it('la confiance globale augmente avec l\'historique disponible', () => {
    const sansHistoire = synthetiserModeles(profilComplet()).confianceGlobale
    const avecHistoire = synthetiserModeles({
      ...profilComplet(),
      historical_scores: Array.from({ length: 10 }, (_, i) => ({ date: `2025-${i + 1}-01`, score: 55, c1: 60, c2: 55, c3: 50, c4: 45, c5: 40 })),
    }).confianceGlobale
    expect(avecHistoire).toBeGreaterThan(sansHistoire)
  })
})
