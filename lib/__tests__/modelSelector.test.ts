// lib/__tests__/modelSelector.test.ts
import {
  recommanderModeleAnalyse,
  recommanderParmi,
  getModelesDisponibles,
  MODELE_LABELS,
} from '../ia/modelSelector'
import type { ModeleAnalyseInput } from '../ia/modelSelector'

function baseInput(overrides: Partial<ModeleAnalyseInput> = {}): ModeleAnalyseInput {
  return {
    profil: null,
    evenement: null,
    ecarts: [],
    surveillances: [],
    amdecAnalyses: [],
    ftaAnalyses: [],
    ...overrides,
  }
}

describe('modelSelector', () => {
  it('recommande BowTie par défaut quand les données sont insuffisantes (fallback)', () => {
    const rec = recommanderModeleAnalyse(baseInput())
    expect(rec.fallbackDeterministe).toBe(true)
    expect(rec.recommande).toBe('bowtie')
    expect(rec.scores).toHaveLength(10)
    expect(rec.justification.length).toBeGreaterThan(0)
  })

  it('recommande FTA quand un événement grave et détaillé est fourni', () => {
    const rec = recommanderModeleAnalyse(baseInput({
      evenement: {
        id: 'e1',
        aerodrome_id: 'GOBD',
        reference: 'EVT-1',
        type: 'Incursion sur piste',
        gravite: 'critique' as const,
        date: '2026-01-01',
        heure: '10:00',
        localisation: 'Piste',
        description: 'Incursion de piste lors d\'un roulage par vent traversier fort avec visibilité réduite.',
        actions_immediates: '',
        services_alertes: [],
        statut: 'recu' as const,
        causes: ['clairance', 'signalisation effacée'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: '',
      } as any,
    }))
    expect(rec.recommande).toBe('fta')
    const fta = rec.scores.find(s => s.modele === 'fta')!
    expect(fta.score).toBeGreaterThan(50)
    expect(fta.confiance).toBeGreaterThan(0)
    expect(fta.intervalle[0]).toBeLessThanOrEqual(fta.score)
    expect(fta.intervalle[1]).toBeGreaterThanOrEqual(fta.score)
  })

  it('recommande AMDEC quand des analyses existent avec modes critiques non corrigés', () => {
    const rec = recommanderModeleAnalyse(baseInput({
      profil: { aerodrome_id: 'GOBD', score_global: 55, c3: 45 } as any,
      amdecAnalyses: [
        { id: 'a1', aerodrome_id: 'GOBD', niveau: 'critique', statut: 'a_analyser' } as any,
        { id: 'a2', aerodrome_id: 'GOBD', niveau: 'eleve', statut: 'surveille' } as any,
      ],
    }))
    expect(rec.recommande).toBe('amdec')
    const amdec = rec.scores.find(s => s.modele === 'amdec')!
    expect(amdec.score).toBeGreaterThan(60)
    expect(amdec.raisons.some(r => r.includes('malus C3'))).toBe(true)
  })

  it('recommande BowTie quand le profil est riche en métriques avancées', () => {
    const rec = recommanderModeleAnalyse(baseInput({
      profil: {
        aerodrome_id: 'GOBD',
        score_global: 70,
        copula_metrics: { maxTailDependence: 0.6 },
        bayesian_posterior: 30,
        bowtie_metrics: [{}],
        qualityScore: 80,
      } as any,
      ecarts: [{}] as any,
      surveillances: [{}] as any,
    }))
    expect(rec.recommande).toBe('bowtie')
  })

  it('recommanderParmi filtre les modèles non disponibles', () => {
    const rec = recommanderParmi(baseInput({
      evenement: {
        id: 'e1',
        aerodrome_id: 'GOBD',
        reference: 'EVT-1',
        type: 'Incursion sur piste',
        gravite: 'critique' as const,
        date: '2026-01-01',
        heure: '10:00',
        localisation: 'Piste',
        description: 'Incursion de piste lors d\'un roulage par vent traversier fort avec visibilité réduite.',
        actions_immediates: '',
        services_alertes: [],
        statut: 'recu' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: '',
      } as any,
    }), ['bowtie', 'amdec'])
    expect(rec.scores.every(s => s.modele !== 'fta')).toBe(true)
    expect(['bowtie', 'amdec']).toContain(rec.recommande)
  })

  it('expose des libellés pour chaque modèle', () => {
    expect(MODELE_LABELS.bowtie).toBe('Bow-Tie')
    expect(MODELE_LABELS.fta).toContain('FTA')
    expect(MODELE_LABELS.amdec).toBe('AMDEC')
    expect(MODELE_LABELS.hmm).toContain('HMM')
    expect(MODELE_LABELS.survie).toContain('survie')
    expect(MODELE_LABELS.evt).toContain('EVT')
    expect(MODELE_LABELS.copula).toContain('Copulas')
    expect(MODELE_LABELS.thompson).toContain('Thompson')
    expect(MODELE_LABELS.bayes).toContain('bayésienne')
    expect(MODELE_LABELS.rf).toContain('Random Forest')
  })

  it('recommande HMM quand une transition silencieuse est détectée', () => {
    const rec = recommanderModeleAnalyse(baseInput({
      profil: {
        aerodrome_id: 'GOBD',
        score_global: 62,
        hmm_state: { currentStateName: 'dégradation', isTransitioning: true, transitionRisk: 72, daysToCritical: 21 },
      } as any,
    }))
    expect(rec.recommande).toBe('hmm')
    const hmm = rec.scores.find(s => s.modele === 'hmm')!
    expect(hmm.score).toBeGreaterThan(80)
    expect(hmm.raisons.some(r => r.includes('Transition'))).toBe(true)
  })

  it('recommande le Random Forest quand le modèle est entraîné', () => {
    const rec = recommanderModeleAnalyse(baseInput({
      rfModelInfo: {
        version: 3,
        trained_at: '2026-07-01T00:00:00Z',
        accuracy: 0.82,
        training_samples: 24,
        feature_importance: { c3: 0.4, c4: 0.3 },
      } as any,
    }))
    expect(rec.recommande).toBe('rf')
    const rf = rec.scores.find(s => s.modele === 'rf')!
    expect(rf.score).toBeGreaterThan(70)
    expect(rf.raisons.some(r => r.includes('Random Forest'))).toBe(true)
  })

  it('expose les modèles ML disponibles dans getModelesDisponibles quand les métriques existent', () => {
    const dispo = getModelesDisponibles(baseInput({
      profil: {
        aerodrome_id: 'GOBD',
        hmm_state: { isTransitioning: false } as any,
        survival_metrics: { hazard90d: 0.2, hazard180d: 0.3, medianDays: 200 } as any,
        extreme_risk: { tailRisk: 0.1, isHeavyTailed: false, maxExpected12m: 5 } as any,
        copula_metrics: { maxTailDependence: 0.4 } as any,
        ts_metrics: { recommendedAction: 'audit_complet', bestProbability: 70 } as any,
        bayesian_posterior: 42,
      } as any,
      rfModelInfo: { accuracy: 0.8, training_samples: 12 } as any,
    }))
    expect(dispo).toContain('hmm')
    expect(dispo).toContain('survie')
    expect(dispo).toContain('evt')
    expect(dispo).toContain('copula')
    expect(dispo).toContain('thompson')
    expect(dispo).toContain('bayes')
    expect(dispo).toContain('rf')
  })

  it('n\'expose pas les modèles ML quand les métriques sont absentes', () => {
    const dispo = getModelesDisponibles(baseInput({
      profil: { aerodrome_id: 'GOBD' } as any,
    }))
    expect(dispo).not.toContain('hmm')
    expect(dispo).not.toContain('survie')
    expect(dispo).not.toContain('evt')
    expect(dispo).not.toContain('copula')
    expect(dispo).not.toContain('thompson')
    expect(dispo).not.toContain('bayes')
    expect(dispo).not.toContain('rf')
  })

  it('calcule un intervalle de confiance symétrique autour du score', () => {
    const rec = recommanderModeleAnalyse(baseInput({
      profil: { aerodrome_id: 'GOBD', score_global: 70, copula_metrics: { maxTailDependence: 0.6 } } as any,
    }))
    for (const s of rec.scores) {
      expect(s.intervalle[0]).toBeGreaterThanOrEqual(0)
      expect(s.intervalle[1]).toBeLessThanOrEqual(100)
      expect(s.intervalle[0]).toBeLessThanOrEqual(s.score)
      expect(s.intervalle[1]).toBeGreaterThanOrEqual(s.score)
    }
  })

  it('getModelesDisponibles exclut FTA sans événement ciblé', () => {
    const dispo = getModelesDisponibles(baseInput({
      profil: { aerodrome_id: 'GOBD', infrastructure: {} } as any,
      ftaAnalyses: [{}] as any,
    }))
    expect(dispo).not.toContain('fta')
    expect(dispo).toContain('bowtie')
    expect(dispo).toContain('amdec')
  })

  it('getModelesDisponibles inclut FTA quand un événement est ciblé', () => {
    const dispo = getModelesDisponibles(baseInput({
      evenement: {} as any,
    }))
    expect(dispo).toContain('fta')
  })

  it('getModelesDisponibles ne force pas amdec sans analyses ni infrastructure', () => {
    const dispo = getModelesDisponibles(baseInput({
      profil: { aerodrome_id: 'GOBD' } as any,
    }))
    expect(dispo).toContain('bowtie')
    expect(dispo).not.toContain('amdec')
  })
})
