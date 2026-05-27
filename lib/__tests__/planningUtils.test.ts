// lib/__tests__/planningUtils.test.ts
import {
  calculatePlanningStats,
  filterPlannings,
  isPlanningEnRetard,
  getPlanningDuration,
} from '../planningUtils'
import type { Planning } from '../store'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PLANNING: Planning = {
  id: 'p1',
  aerodrome_id: 'a1',
  type: 'programmee',
  statut: 'planifiee',
  priorite: 'moyenne',
  date_debut: '2026-01-01T00:00:00.000Z',
  date_fin: '2026-01-05T00:00:00.000Z',
  objectifs: '',
  portee: [],
  equipe_ids: [],
  chef_id: '',
  est_proposition: false,
  annee_cible: 2026,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

// ─── calculatePlanningStats ───────────────────────────────────────────────────

describe('calculatePlanningStats', () => {
  it('retourne tous les compteurs à 0 pour une liste vide', () => {
    const stats = calculatePlanningStats([])
    expect(stats.total).toBe(0)
    expect(stats.planifiees).toBe(0)
    expect(stats.enCours).toBe(0)
    expect(stats.realisees).toBe(0)
    expect(stats.annulees).toBe(0)
    expect(stats.enRetard).toBe(0)
    expect(stats.tauxRealisation).toBe(0)
  })

  it('compte correctement par statut', () => {
    const plannings: Planning[] = [
      { ...BASE_PLANNING, id: 'p1', statut: 'planifiee' },
      { ...BASE_PLANNING, id: 'p2', statut: 'planifiee' },
      { ...BASE_PLANNING, id: 'p3', statut: 'en_cours' },
      { ...BASE_PLANNING, id: 'p4', statut: 'realisee' },
      { ...BASE_PLANNING, id: 'p5', statut: 'annulee' },
      { ...BASE_PLANNING, id: 'p6', statut: 'en_retard' },
    ]
    const stats = calculatePlanningStats(plannings)
    expect(stats.total).toBe(6)
    expect(stats.planifiees).toBe(2)
    expect(stats.enCours).toBe(1)
    expect(stats.realisees).toBe(1)
    expect(stats.annulees).toBe(1)
    expect(stats.enRetard).toBe(1)
  })

  it('calcule le taux de réalisation correctement', () => {
    const plannings: Planning[] = [
      { ...BASE_PLANNING, id: 'p1', statut: 'realisee' },
      { ...BASE_PLANNING, id: 'p2', statut: 'realisee' },
      { ...BASE_PLANNING, id: 'p3', statut: 'planifiee' },
      { ...BASE_PLANNING, id: 'p4', statut: 'annulee' },
    ]
    const stats = calculatePlanningStats(plannings)
    expect(stats.tauxRealisation).toBe(50) // 2/4 = 50 %
  })
})

// ─── filterPlannings ─────────────────────────────────────────────────────────

describe('filterPlannings', () => {
  const plannings: Planning[] = [
    { ...BASE_PLANNING, id: 'p1', aerodrome_id: 'a1', type: 'programmee', statut: 'planifiee', priorite: 'haute', equipe_ids: ['u1', 'u2'] },
    { ...BASE_PLANNING, id: 'p2', aerodrome_id: 'a2', type: 'audit_complet', statut: 'realisee', priorite: 'moyenne', equipe_ids: ['u3'] },
    { ...BASE_PLANNING, id: 'p3', aerodrome_id: 'a1', type: 'suivi_ecarts', statut: 'en_cours', priorite: 'haute', equipe_ids: ['u1'] },
  ]

  it('retourne tout si aucun filtre', () => {
    expect(filterPlannings(plannings, {})).toHaveLength(3)
  })

  it('filtre par aérodrome', () => {
    const result = filterPlannings(plannings, { aerodromeId: 'a1' })
    expect(result).toHaveLength(2)
    expect(result.every(p => p.aerodrome_id === 'a1')).toBe(true)
  })

  it('filtre par type', () => {
    const result = filterPlannings(plannings, { type: 'audit_complet' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p2')
  })

  it('filtre par statut', () => {
    const result = filterPlannings(plannings, { statut: 'en_cours' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p3')
  })

  it('filtre par priorité', () => {
    const result = filterPlannings(plannings, { priorite: 'haute' })
    expect(result).toHaveLength(2)
  })

  it('filtre par inspecteur (equipe_ids)', () => {
    const result = filterPlannings(plannings, { inspecteurId: 'u1' })
    expect(result).toHaveLength(2)
    expect(result.every(p => p.equipe_ids.includes('u1'))).toBe(true)
  })

  it('combine plusieurs filtres', () => {
    const result = filterPlannings(plannings, { aerodromeId: 'a1', priorite: 'haute', statut: 'planifiee' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('p1')
  })

  it('filtre par année', () => {
    const result = filterPlannings(plannings, { annee: 2026 })
    expect(result).toHaveLength(3) // tous en 2026
    const result2025 = filterPlannings(plannings, { annee: 2025 })
    expect(result2025).toHaveLength(0)
  })
})

// ─── isPlanningEnRetard ───────────────────────────────────────────────────────

describe('isPlanningEnRetard', () => {
  const pastDate = new Date(Date.now() - 86_400_000).toISOString() // hier
  const futureDate = new Date(Date.now() + 86_400_000).toISOString() // demain

  it('retourne true si la date de fin est passée et statut actif', () => {
    const planning: Planning = { ...BASE_PLANNING, statut: 'planifiee', date_fin: pastDate }
    expect(isPlanningEnRetard(planning)).toBe(true)
  })

  it('retourne false si la date de fin est dans le futur', () => {
    const planning: Planning = { ...BASE_PLANNING, statut: 'planifiee', date_fin: futureDate }
    expect(isPlanningEnRetard(planning)).toBe(false)
  })

  it('retourne false si le planning est réalisé (même si date passée)', () => {
    const planning: Planning = { ...BASE_PLANNING, statut: 'realisee', date_fin: pastDate }
    expect(isPlanningEnRetard(planning)).toBe(false)
  })

  it('retourne false si le planning est annulé', () => {
    const planning: Planning = { ...BASE_PLANNING, statut: 'annulee', date_fin: pastDate }
    expect(isPlanningEnRetard(planning)).toBe(false)
  })
})

// ─── getPlanningDuration ─────────────────────────────────────────────────────

describe('getPlanningDuration', () => {
  it('retourne 1 jour si début = fin', () => {
    const planning: Planning = {
      ...BASE_PLANNING,
      date_debut: '2026-03-10T00:00:00.000Z',
      date_fin: '2026-03-10T00:00:00.000Z',
    }
    expect(getPlanningDuration(planning)).toBe(1)
  })

  it('calcule la durée correctement en jours', () => {
    const planning: Planning = {
      ...BASE_PLANNING,
      date_debut: '2026-03-01T00:00:00.000Z',
      date_fin: '2026-03-05T00:00:00.000Z',
    }
    // 5 - 1 + 1 = 5 jours
    expect(getPlanningDuration(planning)).toBe(5)
  })

  it('fonctionne sur plusieurs mois', () => {
    const planning: Planning = {
      ...BASE_PLANNING,
      date_debut: '2026-01-25T00:00:00.000Z',
      date_fin: '2026-02-03T00:00:00.000Z',
    }
    // 9 jours de janvier + 3 de février + 1 (inclusif) = 10
    expect(getPlanningDuration(planning)).toBe(10)
  })
})
