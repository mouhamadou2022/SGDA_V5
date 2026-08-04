// lib/__tests__/anticipationIA.test.ts
// Vérifie que les explications des cartes « Prédictions temporelles » et
// « Risques incidents & extrêmes » retombent bien sur le fallback déterministe
// (construit à partir des valeurs réelles normalisées) quand l'API IA n'est
// pas disponible, et que les deux échelles (0-1 et 0-100) sont normalisées.

import {
  expliquerPredictionsEnClair,
  expliquerRisquesIncidentsEnClair,
  contextePredictions,
  contexteIncidents,
} from '@/lib/ia/anticipationIA'
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
    prediction_interval_3m: { lower: 45, upper: 60 },
    prediction_interval_6m: { lower: 0.40, upper: 0.56 },
    incident_prediction_3m: 0.30,
    incident_prediction_6m: 0.45,
    incident_prediction_12m: 60,
    tendance: 'baisse',
    computed_at: '2026-01-01T00:00:00Z',
    extreme_risk: { tailRisk: 8, isHeavyTailed: true, maxExpected12m: 90 },
    days_since_last_event: 12,
    ensemble_confidence: 30,
  }
}

describe('contextePredictions', () => {
  it('normalise les deux échelles (0-1 et 0-100)', () => {
    const c = contextePredictions(makeProfil())
    expect(c.prediction_3m).toBe(52)
    expect(c.prediction_6m).toBe(48)
    expect(c.intervalle_3m).toEqual({ lower: 45, upper: 60 })
    expect(c.intervalle_6m).toEqual({ lower: 40, upper: 56 })
    expect(c.confiance_ensemble).toBe(30)
  })
})

describe('contexteIncidents', () => {
  it('normalise les probabilités et le risque extrême', () => {
    const c = contexteIncidents(makeProfil())
    expect(c.incident_3m).toBe(30)
    expect(c.incident_6m).toBe(45)
    expect(c.incident_12m).toBe(60)
    expect(c.risque_extreme).toBe(8)
    expect(c.queue_lourde).toBe(true)
    expect(c.max_attendu_12m).toBe(90)
    expect(c.jours_depuis_dernier_evenement).toBe(12)
  })
})

describe('expliquerPredictionsEnClair', () => {
  it('retombe sur le fallback déterministe avec les valeurs réelles', async () => {
    const res = await expliquerPredictionsEnClair(makeProfil())
    expect(res.fallbackIA).toBe(true)
    expect(res.texte).toContain('52/100')
    expect(res.texte).toContain('48/100')
    expect(res.texte).toContain('45–60')
    expect(res.texte).toContain('30 %')
  })
})

describe('expliquerRisquesIncidentsEnClair', () => {
  it('retombe sur le fallback déterministe avec les valeurs réelles', async () => {
    const res = await expliquerRisquesIncidentsEnClair(makeProfil())
    expect(res.fallbackIA).toBe(true)
    expect(res.texte).toContain('30 % sur 3 mois')
    expect(res.texte).toContain('45 % sur 6 mois')
    expect(res.texte).toContain('60 % sur 12 mois')
    expect(res.texte).toContain('8 %')
    expect(res.texte).toContain('queue lourde')
    expect(res.texte).toContain('90 incidents')
    expect(res.texte).toContain('12 jour')
  })
})
