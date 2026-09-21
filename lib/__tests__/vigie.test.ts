// lib/__tests__/vigie.test.ts — Décisions pures de la vigie (lib/vigie.ts).
// Dossiers (retard + seuils) et plannings dépassés. Dates figées.

import type { Planning } from '../store/planningsSlice';
import { evaluerRappelsDossier, evaluerDepassementPlanning } from '../vigie'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const iso = (daysFromNow: number) =>
  new Date(NOW.getTime() + daysFromNow * 86400000).toISOString()

describe('evaluerRappelsDossier', () => {
  test('retard non notifié → notifier, déjà notifié → rien', () => {
    expect(evaluerRappelsDossier({ date_limite: iso(-1) }, NOW).notifierRetard).toBe(true)
    expect(evaluerRappelsDossier(
      { date_limite: iso(-1), _retard_notifie: true } as never, NOW).notifierRetard).toBe(false)
  })
  test('seuils 15/7/3, déjà envoyé ignoré, hors fenêtre → vide', () => {
    expect(evaluerRappelsDossier({ date_limite: iso(7) }, NOW).seuils).toEqual([7])
    expect(evaluerRappelsDossier(
      { date_limite: iso(7), _rappel_j7: true } as never, NOW).seuils).toEqual([])
    expect(evaluerRappelsDossier({ date_limite: iso(5) }, NOW).seuils).toEqual([])
    expect(evaluerRappelsDossier({ date_limite: iso(20) }, NOW))
      .toEqual({ notifierRetard: false, seuils: [] })
  })
})

describe('evaluerDepassementPlanning', () => {
  const planning = {
    id: 'p1', deleted_at: null, est_proposition: false,
    statut: 'planifiee', date_debut: iso(-10), date_fin: iso(-2),
    rappels_envoyes: {},
  } as unknown as Planning
  test('dépassé → jours de retard (min 1)', () => {
    const d = evaluerDepassementPlanning(planning, [], NOW.getTime())
    expect(d.depasse).toBe(true)
    expect(d.joursRetard).toBe(2)
  })
  test('gardes : proposition, overdue déjà posé, date future', () => {
    expect(evaluerDepassementPlanning(
      { ...planning, est_proposition: true } as never, [], NOW.getTime()).depasse).toBe(false)
    expect(evaluerDepassementPlanning(
      { ...planning, rappels_envoyes: { overdue: true } } as never, [], NOW.getTime()).depasse).toBe(false)
    expect(evaluerDepassementPlanning(
      { ...planning, date_fin: iso(5) } as never, [], NOW.getTime()).depasse).toBe(false)
  })
})
