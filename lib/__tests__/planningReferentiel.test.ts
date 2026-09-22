// lib/__tests__/planningReferentiel.test.ts — Noyau partagé planning
// (lib/planning.ts) : normalisation des types, prédicats de statut,
// résolution des portées. Testé isolément (aucun store).

import {
  normalizePlanningType,
  isLegacyPlanningType,
  getPlanningTypeLabel,
  findLinkedSurveillance,
  isPlanningRealise,
  isPlanningTerminal,
  estPlanningEnRetard,
  resolvePorteeDomaines,
} from '../planning'

describe('types planning', () => {
  test('normalizePlanningType : legacy → canonique, vide → periodique', () => {
    expect(normalizePlanningType('programmee')).toBe('periodique')
    expect(normalizePlanningType('inopinee')).toBe('inopine')
    expect(normalizePlanningType(undefined)).toBe('periodique')
    expect(normalizePlanningType('certification')).toBe('certification')
  })
  test('isLegacyPlanningType', () => {
    expect(isLegacyPlanningType('programmee')).toBe(true)
    expect(isLegacyPlanningType('periodique')).toBe(false)
  })
  test('getPlanningTypeLabel', () => {
    expect(getPlanningTypeLabel('programmee')).toBe('Périodique')
    expect(getPlanningTypeLabel('certification')).toBe('Certification')
  })
})

describe('prédicats de statut', () => {
  const planning = { id: 'p1', statut: 'planifiee', date_fin: '2026-01-01' }
  const transmise = { id: 's1', planning_id: 'p1', statut: 'transmise' }
  const enCours = { id: 's2', planning_id: 'p1', statut: 'en_cours' }

  test('findLinkedSurveillance : direct puis inverse', () => {
    expect(findLinkedSurveillance({ ...planning, surveillance_id: 's1' }, [transmise])?.id).toBe('s1')
    expect(findLinkedSurveillance(planning, [transmise])?.id).toBe('s1')
    expect(findLinkedSurveillance(planning, [])).toBeUndefined()
  })
  test('isPlanningRealise : statut ou surveillance terminale', () => {
    expect(isPlanningRealise({ statut: 'realisee' }, [])).toBe(true)
    expect(isPlanningRealise(planning, [transmise])).toBe(true)
    expect(isPlanningRealise(planning, [enCours])).toBe(false)
  })
  test('isPlanningTerminal : annule/realise/terminal, sinon mission engagée', () => {
    expect(isPlanningTerminal({ statut: 'annulee' }, [])).toBe(true)
    expect(isPlanningTerminal(planning, [])).toBe(false)
    expect(isPlanningTerminal(planning, [{ ...transmise, statut: 'checklist_signee' }])).toBe(true)
  })
  test('estPlanningEnRetard : proposition jamais, terminal jamais', () => {
    const now = new Date('2026-06-01').getTime()
    expect(estPlanningEnRetard(planning, [], now)).toBe(true)
    expect(estPlanningEnRetard({ ...planning, est_proposition: true }, [], now)).toBe(false)
    expect(estPlanningEnRetard(planning, [transmise], now)).toBe(false)
    expect(estPlanningEnRetard({ ...planning, date_fin: '2027-01-01' }, [], now)).toBe(false)
  })
})

describe('resolvePorteeDomaines', () => {
  test('vide → vide, codes conservés, doublons gérés', () => {
    expect(resolvePorteeDomaines(undefined)).toEqual([])
    const res = resolvePorteeDomaines(['SGS', 'SGS'])
    expect(res.filter(c => c === 'SGS')).toHaveLength(1)
  })
})
