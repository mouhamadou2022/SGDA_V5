// lib/__tests__/inspecteurMonitoring.test.ts
// Tests du suivi ML de l'Inspecteur Virtuel — stats par capacité + maturité temporelle

import { inspecteurMonitoring, type InspecteurFeedbackRecord, type CapaciteInspecteur, CAPACITES_INSPECTEUR } from '../ia/engines/inspecteurMonitoring'

function makeRetour(overrides: Partial<InspecteurFeedbackRecord>): InspecteurFeedbackRecord {
  return {
    id: `iv-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    capacite: 'checklist',
    action: 'acceptee',
    ...overrides,
  }
}

describe('inspecteurMonitoring', () => {
  beforeEach(async () => {
    inspecteurMonitoring.reset()
    await inspecteurMonitoring.initFromIDB()
  })

  test('enregistre un retour et le récupère dans les derniers retours', () => {
    const entry = inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'ecart', action: 'corrigee', aerodromeId: 'GOOY', confiance: 80 }))
    expect(entry).not.toBeNull()
    const stats = inspecteurMonitoring.getStats()
    expect(stats.totalFeedbacks).toBeGreaterThanOrEqual(1)
    expect(stats.derniersRetours[0].capacite).toBe('ecart')
    expect(stats.derniersRetours[0].action).toBe('corrigee')
  })

  test('calcule les taux par capacité', () => {
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'checklist', action: 'acceptee' }))
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'checklist', action: 'acceptee' }))
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'checklist', action: 'corrigee' }))
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'checklist', action: 'rejetee' }))

    const stats = inspecteurMonitoring.getStats()
    const checklist = stats.parCapacite.checklist
    expect(checklist.total).toBe(4)
    expect(checklist.tauxAcceptation).toBe(50)
    expect(checklist.tauxCorrection).toBe(25)
    expect(checklist.tauxRejet).toBe(25)
  })

  test("la maturité composite croît avec le volume et l'acceptation", () => {
    for (let i = 0; i < 12; i++) {
      inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'ecart', action: 'acceptee', confiance: 90 }))
    }
    const stats = inspecteurMonitoring.getStats()
    expect(stats.parCapacite.ecart.maturite).toBeGreaterThanOrEqual(60)
    expect(stats.maturiteGlobale).toBeGreaterThanOrEqual(60)
  })

  test("une capacité sans feedback a des stats vides et n'impacte pas la maturité", () => {
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'checklist', action: 'acceptee' }))
    const stats = inspecteurMonitoring.getStats()
    expect(stats.parCapacite.rapport.total).toBe(0)
    expect(stats.parCapacite.rapport.tauxAcceptation).toBe(0)
    expect(stats.maturiteGlobale).toBe(stats.parCapacite.checklist.maturite)
  })

  test('toutes les capacités sont présentes dans les stats', () => {
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'evenement', action: 'rejetee' }))
    const stats = inspecteurMonitoring.getStats()
    for (const c of CAPACITES_INSPECTEUR) {
      expect(stats.parCapacite[c]).toBeDefined()
      expect(typeof (stats.parCapacite[c as CapaciteInspecteur].total)).toBe('number')
    }
  })

  test('produit une série temporelle par mois, triée', () => {
    const dates = ['2026-01-15T10:00:00Z', '2026-02-15T10:00:00Z', '2026-03-15T10:00:00Z']
    for (const d of dates) {
      inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'rapport', action: 'acceptee', date: d }))
    }
    const stats = inspecteurMonitoring.getStats()
    expect(stats.serieTemporelle.map(m => m.mois)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(stats.serieTemporelle[0].volume).toBe(1)
    expect(stats.serieTemporelle[0].label).toBeDefined()
  })

  test('aucune donnée → stats vides', () => {
    const stats = inspecteurMonitoring.getStats()
    expect(stats.totalFeedbacks).toBe(0)
    expect(stats.serieTemporelle).toEqual([])
  })

  test('confiance moyenne par capacité', () => {
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'certification', action: 'acceptee', confiance: 70 }))
    inspecteurMonitoring.enregistrer(makeRetour({ capacite: 'certification', action: 'acceptee', confiance: 90 }))
    const stats = inspecteurMonitoring.getStats()
    expect(stats.parCapacite.certification.confianceMoyenne).toBe(80)
  })
})
