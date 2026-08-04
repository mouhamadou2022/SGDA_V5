// lib/__tests__/facteursExplicationIA.test.ts
// Vérifie que l'explication des facteurs déclencheurs et des risques saisonniers
// retombe bien sur le fallback déterministe (textes contextuels) quand l'API
// IA n'est pas disponible, et conserve des textes différents par déclencheur.

import { expliquerTriggersEnClair, expliquerRisquesSaisoniersEnClair, LEAD_LAG_INSIGHTS, RISQUES_SAISONNIERS } from '@/lib/ia/facteursExplicationIA'
import { detectAllTriggers } from '@/lib/risque/triggers'
import type { ProfilRisque } from '@/lib/store'

function makeProfil(): ProfilRisque {
  return {
    aerodrome_id: 'aero-1',
    score_global: 55,
    niveau: 'moyen',
    c1: 60, c2: 55, c3: 50, c4: 45, c5: 40,
    prediction_3m: 55,
    prediction_6m: 50,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
  }
}

describe('expliquerTriggersEnClair', () => {
  it('retombe sur les insights contextuels par type de trigger', async () => {
    const triggers = detectAllTriggers({
      nbEcartsCritiques: 2,
      nbDelaisDepasses: 0,
      nbIncidentsRecents: 0,
      moisDepuisChangement: null,
      joursDepuisDerniereInspection: null,
    })
    const res = await expliquerTriggersEnClair(triggers, makeProfil())

    const actifs = triggers.filter(t => t.actif)
    expect(actifs.length).toBeGreaterThan(0)
    for (const t of actifs) {
      expect(res.insights[t.type]).toBeDefined()
      expect(res.insights[t.type].length).toBeGreaterThan(10)
      expect(res.insights[t.type]).toBe(LEAD_LAG_INSIGHTS[t.type])
    }
    expect(res.fallbackIA).toBe(true)
  })

  it('gère le cas sans trigger actif (retourne les textes par défaut)', async () => {
    const triggers = detectAllTriggers({
      nbEcartsCritiques: 0,
      nbDelaisDepasses: 0,
      nbIncidentsRecents: 0,
      moisDepuisChangement: null,
      joursDepuisDerniereInspection: null,
      dateActuelle: new Date('2026-01-15T00:00:00Z'),
    })
    const res = await expliquerTriggersEnClair(triggers, makeProfil())
    expect(triggers.filter(t => t.actif)).toHaveLength(0)
    expect(res.insights).toBeDefined()
  })
})

describe('expliquerRisquesSaisoniersEnClair', () => {
  it('retombe sur les risques saisonniers du mois courant', async () => {
    const mois = 6 // juillet
    const res = await expliquerRisquesSaisoniersEnClair(mois, makeProfil())
    expect(Array.isArray(res.risques)).toBe(true)
    expect(res.risques.length).toBeGreaterThan(0)
    expect(res.risques).toEqual(RISQUES_SAISONNIERS[mois])
    expect(res.fallbackIA).toBe(true)
  })
})
