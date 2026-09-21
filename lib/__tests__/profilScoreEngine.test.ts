// lib/__tests__/profilScoreEngine.test.ts
// Contrat de convergence store/cron : le moteur applique lui-même les
// ajustements C3 (exemptions, AMDEC) et retourne score/niveau finaux.
// Les seuils niveau/tendance vivent dans lib/config.ts (source unique).

import { computeProfilScore } from '../risque/profilScoreEngine'
import { getNiveauFromScore, deriverTendance } from '../config'

const base = {
  ecarts: [],
  surveillances: [],
  evenements: [],
}

describe('computeProfilScore — ajustements C3 centralisés', () => {
  test('sans exemptions ni AMDEC : c3 === c3Base, c3Ajuste faux', () => {
    const r = computeProfilScore({
      ...base,
      aerodrome: { type: 'national', maturite_sgs: 50 },
    })
    expect(r.c3).toBe(r.c3Base)
    expect(r.c3Ajuste).toBe(false)
  })

  test('exemptions actives : bonus domaines appliqué, c3Ajuste vrai', () => {
    const sans = computeProfilScore({
      ...base,
      aerodrome: { type: 'national', maturite_sgs: 50 },
    })
    const avec = computeProfilScore({
      ...base,
      aerodrome: { type: 'national', maturite_sgs: 50 },
      exemptionsActives: [
        { id: 'ex-1', domaines_concerne: ['SGS', 'PHY'], mesures: [] },
      ],
    })
    // Bonus +10 (2 domaines × 5) plafonné à 100
    expect(avec.c3).toBe(Math.min(100, sans.c3 + 10))
    expect(avec.c3Ajuste).toBe(true)
    expect(avec.c3Base).toBe(sans.c3)
  })

  test('mesures en retard : malus appliqué', () => {
    const avec = computeProfilScore({
      ...base,
      aerodrome: { type: 'national', maturite_sgs: 50 },
      exemptionsActives: [
        {
          id: 'ex-1',
          domaines_concerne: ['SGS'],
          mesures: [{ statut: 'en_retard' }, { statut: 'en_retard' }],
        },
      ],
    })
    // Bonus +5 (1 domaine), malus -10 (2 mesures) → net -5
    expect(avec.c3).toBe(avec.c3Base - 5)
    expect(avec.c3Ajuste).toBe(true)
  })

  test('scoreGlobal cohérent avec le C3 final (pas le brut)', () => {
    const r = computeProfilScore({
      ...base,
      aerodrome: { type: 'national', maturite_sgs: 50 },
      exemptionsActives: [
        { id: 'ex-1', domaines_concerne: ['SGS', 'PHY', 'OLS', 'ELEC'], mesures: [] },
      ],
    })
    // Bonus +20 plafonné : le score global doit refléter le C3 ajusté
    expect(r.c3).toBeGreaterThan(r.c3Base)
    expect(r.scoreGlobal).toBeGreaterThanOrEqual(0)
    expect(r.scoreGlobal).toBeLessThanOrEqual(100)
    expect(r.niveau).toBe(getNiveauFromScore(r.scoreGlobal))
  })
})

describe('getNiveauFromScore — seuils uniques', () => {
  test.each([
    [100, 'faible'],
    [80, 'faible'],
    [79, 'moyen'],
    [60, 'moyen'],
    [59, 'eleve'],
    [30, 'eleve'],
    [29, 'critique'],
    [0, 'critique'],
  ] as Array<[number, string]>)('score %i → %s', (score, niveau) => {
    expect(getNiveauFromScore(score)).toBe(niveau)
  })
})

describe('deriverTendance — règle unique store/cron', () => {
  test('sans historique → stable', () => {
    expect(deriverTendance(70, null)).toBe('stable')
    expect(deriverTendance(70, undefined)).toBe('stable')
  })
  test('seuil ±2 : +3 hausse, -3 baisse, ±2 stable', () => {
    expect(deriverTendance(73, 70)).toBe('hausse')
    expect(deriverTendance(67, 70)).toBe('baisse')
    expect(deriverTendance(72, 70)).toBe('stable')
    expect(deriverTendance(68, 70)).toBe('stable')
  })
})
