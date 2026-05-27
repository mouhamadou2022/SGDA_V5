// lib/__tests__/frequency.test.ts
import {
  computeBaseFrequency,
  applyMultipliers,
  computeMultipliers,
  computeFinalFrequency,
  suggestMissionType,
  getFrequencyClass,
  getFrequencyLabel,
} from '../risque/frequency'

// ─── computeBaseFrequency ────────────────────────────────────────────────────

describe('computeBaseFrequency', () => {
  it('retourne 12 pour le niveau critique', () => {
    expect(computeBaseFrequency('critique')).toBe(12)
  })

  it('retourne 4 pour le niveau élevé', () => {
    expect(computeBaseFrequency('eleve')).toBe(4)
  })

  it('retourne 2 pour le niveau moyen', () => {
    expect(computeBaseFrequency('moyen')).toBe(2)
  })

  it('retourne 1 pour le niveau faible', () => {
    expect(computeBaseFrequency('faible')).toBe(1)
  })
})

// ─── applyMultipliers ────────────────────────────────────────────────────────

describe('applyMultipliers', () => {
  it('retourne la fréquence de base sans multiplicateurs', () => {
    expect(applyMultipliers(4, [])).toBe(4)
  })

  it('multiplie correctement', () => {
    // 4 × 1.5 = 6
    expect(applyMultipliers(4, [1.5])).toBe(6)
  })

  it('est limité à 12 (plafond)', () => {
    expect(applyMultipliers(12, [2.0])).toBe(12)
  })

  it('est au minimum à 1 (plancher)', () => {
    expect(applyMultipliers(1, [0.1])).toBe(1)
  })

  it('applique plusieurs multiplicateurs successivement', () => {
    // 2 × 1.2 × 1.3 = 3.12 → arrondi à 3
    expect(applyMultipliers(2, [1.2, 1.3])).toBe(3)
  })
})

// ─── computeMultipliers ──────────────────────────────────────────────────────

describe('computeMultipliers', () => {
  it('retourne un tableau vide sans paramètres', () => {
    expect(computeMultipliers({})).toEqual([])
  })

  it('ajoute le facteur international (×1.2)', () => {
    const mults = computeMultipliers({ typeAeroport: 'international' })
    expect(mults).toContain(1.2)
  })

  it('ajoute le facteur national (×1.0)', () => {
    const mults = computeMultipliers({ typeAeroport: 'national' })
    expect(mults).toContain(1.0)
  })

  it('ajoute le facteur type mission audit_complet (×0.8)', () => {
    const mults = computeMultipliers({ typeMission: 'audit_complet' })
    expect(mults).toContain(0.8)
  })

  it('ajoute ×1.5 pour les écarts critiques', () => {
    const mults = computeMultipliers({ hasCriticalEcarts: true })
    expect(mults).toContain(1.5)
  })

  it('ajoute ×1.3 pour une tendance baissière', () => {
    const mults = computeMultipliers({ tendance: 'baisse' })
    expect(mults).toContain(1.3)
  })

  it('ne modifie pas pour une tendance en hausse', () => {
    const mults = computeMultipliers({ tendance: 'hausse' })
    expect(mults).not.toContain(1.3)
  })

  it('ajoute ×1.2 pour des triggers', () => {
    const mults = computeMultipliers({ hasTriggers: true })
    expect(mults).toContain(1.2)
  })

  it('ajoute ×1.3 pour des aggravators', () => {
    const mults = computeMultipliers({ hasAggravators: true })
    expect(mults).toContain(1.3)
  })

  it('cumule plusieurs facteurs', () => {
    const mults = computeMultipliers({
      typeAeroport: 'international',
      hasCriticalEcarts: true,
      tendance: 'baisse',
    })
    expect(mults.length).toBe(3)
  })
})

// ─── computeFinalFrequency ───────────────────────────────────────────────────

describe('computeFinalFrequency', () => {
  it('retourne les bonnes propriétés', () => {
    const result = computeFinalFrequency({ riskLevel: 'moyen' })
    expect(result).toHaveProperty('frequencyPerYear')
    expect(result).toHaveProperty('monthsInterval')
    expect(result).toHaveProperty('recommendations')
    expect(Array.isArray(result.recommendations)).toBe(true)
  })

  it('fréquence annuelle pour un risque faible', () => {
    const result = computeFinalFrequency({ riskLevel: 'faible' })
    expect(result.frequencyPerYear).toBe(1)
    expect(result.monthsInterval).toBe(12)
    expect(result.recommendations.some(r => r.includes('annuelle'))).toBe(true)
  })

  it('fréquence mensuelle pour un risque critique', () => {
    const result = computeFinalFrequency({ riskLevel: 'critique' })
    expect(result.frequencyPerYear).toBe(12)
    expect(result.monthsInterval).toBe(1)
    expect(result.recommendations.some(r => r.includes('mensuelle'))).toBe(true)
  })

  it('recommande priorité aux domaines avec écarts critiques', () => {
    const result = computeFinalFrequency({ riskLevel: 'eleve', hasCriticalEcarts: true })
    expect(result.recommendations.some(r => r.includes('critiques'))).toBe(true)
  })

  it('recommande une surveillance renforcée pour une tendance baissière', () => {
    const result = computeFinalFrequency({ riskLevel: 'moyen', tendance: 'baisse' })
    expect(result.recommendations.some(r => r.includes('baissière') || r.includes('Tendance'))).toBe(true)
  })

  it('fréquence au minimum 1, au maximum 12', () => {
    const resultMin = computeFinalFrequency({ riskLevel: 'faible' })
    const resultMax = computeFinalFrequency({
      riskLevel: 'critique',
      typeAeroport: 'international',
      hasCriticalEcarts: true,
      tendance: 'baisse',
      hasTriggers: true,
      hasAggravators: true,
    })
    expect(resultMin.frequencyPerYear).toBeGreaterThanOrEqual(1)
    expect(resultMax.frequencyPerYear).toBeLessThanOrEqual(12)
  })
})

// ─── suggestMissionType ──────────────────────────────────────────────────────

describe('suggestMissionType', () => {
  it('retourne "audit_complet" pour un risque critique', () => {
    expect(
      suggestMissionType({ riskLevel: 'critique', hasCriticalEcarts: false, hasPacInProgress: false, isCertificationPhase: false })
    ).toBe('audit_complet')
  })

  it('retourne "suivi_ecarts" si des écarts critiques existent (hors critique)', () => {
    expect(
      suggestMissionType({ riskLevel: 'eleve', hasCriticalEcarts: true, hasPacInProgress: false, isCertificationPhase: false })
    ).toBe('suivi_ecarts')
  })

  it('retourne "mise_oeuvre_pac" si un PAC est en cours', () => {
    expect(
      suggestMissionType({ riskLevel: 'moyen', hasCriticalEcarts: false, hasPacInProgress: true, isCertificationPhase: false })
    ).toBe('mise_oeuvre_pac')
  })

  it('retourne "certification" en phase de certification', () => {
    expect(
      suggestMissionType({ riskLevel: 'moyen', hasCriticalEcarts: false, hasPacInProgress: false, isCertificationPhase: true })
    ).toBe('certification')
  })

  it('retourne "programmee" par défaut', () => {
    expect(
      suggestMissionType({ riskLevel: 'faible', hasCriticalEcarts: false, hasPacInProgress: false, isCertificationPhase: false })
    ).toBe('programmee')
  })

  it('priorité : critique > écarts critiques > PAC > certification', () => {
    // Tous à true — le niveau critique doit l'emporter
    expect(
      suggestMissionType({ riskLevel: 'critique', hasCriticalEcarts: true, hasPacInProgress: true, isCertificationPhase: true })
    ).toBe('audit_complet')
  })
})

// ─── getFrequencyClass ───────────────────────────────────────────────────────

describe('getFrequencyClass', () => {
  it('retourne "badge danger" pour fréquence ≥ 12', () => {
    expect(getFrequencyClass(12)).toBe('badge danger')
    expect(getFrequencyClass(15)).toBe('badge danger')
  })

  it('retourne "badge warning" pour fréquence ≥ 4', () => {
    expect(getFrequencyClass(4)).toBe('badge warning')
    expect(getFrequencyClass(11)).toBe('badge warning')
  })

  it('retourne "badge primary" pour fréquence ≥ 2', () => {
    expect(getFrequencyClass(2)).toBe('badge primary')
    expect(getFrequencyClass(3)).toBe('badge primary')
  })

  it('retourne "badge success" pour fréquence < 2', () => {
    expect(getFrequencyClass(1)).toBe('badge success')
    expect(getFrequencyClass(0)).toBe('badge success')
  })
})

// ─── getFrequencyLabel ───────────────────────────────────────────────────────

describe('getFrequencyLabel', () => {
  it('retourne "Mensuelle" pour ≥ 12', () => {
    expect(getFrequencyLabel(12)).toBe('Mensuelle')
  })

  it('retourne "Bimensuelle" pour ≥ 6', () => {
    expect(getFrequencyLabel(6)).toBe('Bimensuelle')
    expect(getFrequencyLabel(11)).toBe('Bimensuelle')
  })

  it('retourne "Trimestrielle" pour ≥ 4', () => {
    expect(getFrequencyLabel(4)).toBe('Trimestrielle')
    expect(getFrequencyLabel(5)).toBe('Trimestrielle')
  })

  it('retourne "Semestrielle" pour ≥ 2', () => {
    expect(getFrequencyLabel(2)).toBe('Semestrielle')
    expect(getFrequencyLabel(3)).toBe('Semestrielle')
  })

  it('retourne "Annuelle" pour < 2', () => {
    expect(getFrequencyLabel(1)).toBe('Annuelle')
    expect(getFrequencyLabel(0)).toBe('Annuelle')
  })
})
