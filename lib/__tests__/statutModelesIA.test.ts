// lib/__tests__/statutModelesIA.test.ts
// Vérifie l'inventaire data-driven des modèles (actifs/inactifs) de la carte
// « Statut des modèles » : le fallback déterministe reflète les chiffres réels
// du diagnostic et liste pourquoi les modèles absents ne tournent pas.

import { calculerStatutModeles, enrichirStatutsAvecVotes, expliquerStatutModeles } from '@/lib/ia/statutModelesIA'
import { synthetiserModeles } from '@/lib/risque/modelSynthesis'
import type { ProfilRisque } from '@/lib/store'
import type { RandomForestModelStored } from '@/lib/store/models'

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
    ts_metrics: { recommendedAction: 'audit_complet', bestProbability: 70 },
    prediction_3m: 50,
    prediction_6m: 45,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
  } as unknown as ProfilRisque
}

function rfInfo(): RandomForestModelStored {
  return {
    version: 1,
    trained_at: '2026-01-01T00:00:00Z',
    accuracy: 0.82,
    training_samples: 120,
    feature_importance: { c1: 0.4, c2: 0.3, c3: 0.3 },
  } as unknown as RandomForestModelStored
}

describe('calculerStatutModeles', () => {
  it('marque actifs les modèles dont les données existent, inactifs les autres', () => {
    const statuts = calculerStatutModeles(profilComplet(), null)
    const actifs = statuts.filter((s) => s.actif)
    const inactifs = statuts.filter((s) => !s.actif)
    expect(actifs.map((s) => s.id)).toEqual(
      expect.arrayContaining(['score', 'velocity', 'stress', 'alerte', 'hawkes', 'hmm', 'survie', 'evt', 'bayes', 'copula', 'negbin', 'pred'])
    )
    expect(inactifs.map((s) => s.id)).toContain('rf')
    expect(inactifs.find((s) => s.id === 'rf')?.raisonInactif).toContain('non entraîné')
  })

  it('met Random Forest actif quand un modèle entraîné est fourni', () => {
    const statuts = calculerStatutModeles(profilComplet(), rfInfo())
    expect(statuts.find((s) => s.id === 'rf')?.actif).toBe(true)
    expect(statuts.every((s) => s.actif)).toBe(true)
  })

  it('justifie les modèles prédictifs inactifs par le seuil de 3 relevés', () => {
    const statuts = calculerStatutModeles({ score_global: 60, niveau: 'moyen', c1: 60, c2: 55, c3: 50, c4: 45, c5: 40, tendance: 'stable', computed_at: '2026-01-01T00:00:00Z' } as ProfilRisque, null)
    const hmm = statuts.find((s) => s.id === 'hmm')
    const survie = statuts.find((s) => s.id === 'survie')
    expect(hmm?.actif).toBe(false)
    expect(hmm?.raisonInactif).toContain('3 relevés')
    expect(survie?.raisonInactif).toContain('3 relevés')
  })
})

describe('enrichirStatutsAvecVotes', () => {
  it('injecte indice, confiance et interprétation sur les modèles actifs', () => {
    const statuts = calculerStatutModeles(profilComplet(), null)
    const diag = synthetiserModeles(profilComplet())
    const enrichis = enrichirStatutsAvecVotes(statuts, diag.votes)
    const hmm = enrichis.find((s) => s.id === 'hmm')
    expect(hmm?.actif).toBe(true)
    expect(hmm?.indiceDegradation).toBe(diag.votes.find((v) => v.nom === 'HMM (Markov)')?.indiceDegradation)
    expect(hmm?.confiance).toBeDefined()
    expect(hmm?.interpretation).toBeDefined()
  })
})

describe('expliquerStatutModeles (fallback déterministe)', () => {
  it('reflète l\'indice global et la confiance réels du diagnostic', async () => {
    const profil = profilComplet()
    const diag = synthetiserModeles(profil)
    const res = await expliquerStatutModeles(profil, diag, null)
    expect(res.synthese).toContain(`${diag.indiceGlobal}/100`)
    expect(res.synthese).toContain(`${diag.confianceGlobale}%`)
    expect(res.fallbackIA).toBe(true)
  })

  it('explique pourquoi les modèles absents ne tournent pas (RF non entraîné)', async () => {
    const profil = { score_global: 55, niveau: 'moyen', c1: 60, c2: 55, c3: 50, c4: 45, c5: 40, tendance: 'stable', computed_at: '2026-01-01T00:00:00Z' } as ProfilRisque
    const diag = synthetiserModeles(profil)
    const res = await expliquerStatutModeles(profil, diag, null)
    expect(res.inactifs).toContain('Random Forest')
    expect(res.inactifs).toContain('non entraîné')
  })

  it('adapte la lecture de la confiance selon son niveau', async () => {
    const res = await expliquerStatutModeles(profilComplet(), synthetiserModeles(profilComplet()), null)
    expect(res.confiance).toMatch(/accord (fort|modéré)|divergence/)
  })
})
