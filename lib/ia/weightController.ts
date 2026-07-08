// lib/ia/weightController.ts
// Gestion dynamique des poids C1-C5 en fonction des outcomes des décisions
// Boucle d'apprentissage : si les décisions sont inefficaces → recalibrer les poids

import type { DecisionOutcome } from './evaluateOutcomes'
import { iaStorage, mergeArrayById } from '@/lib/persistence/iaStorage'

export const DEFAULT_WEIGHTS = { c1: 20, c2: 25, c3: 20, c4: 20, c5: 15 } as const

export interface WeightAdjustment {
  id: string
  dim: string
  delta: number
  raison: string
  appliedAt: string
}

export type WeightMap = Record<string, number>

type SyncWeightCallback = (dim: string, weight: number, raison: string) => void

const STORAGE_KEY = 'sgda_weight_controller'
const IDB_STORE = 'ml_weights' as const

export class WeightController {
  private weights: WeightMap = { ...DEFAULT_WEIGHTS }
  private adjustments: WeightAdjustment[] = []
  private syncCallback: SyncWeightCallback | null = null
  private ready: boolean = false
  private pendingQueue: Array<() => void> = []

  constructor() {}

  async initFromIDB(): Promise<void> {
    const stored = await iaStorage.get<{ weights: WeightMap; adjustments: WeightAdjustment[] }>(IDB_STORE, STORAGE_KEY)
    if (stored) {
      this.weights = { ...DEFAULT_WEIGHTS, ...stored.weights }
      this.adjustments = mergeArrayById(this.adjustments, stored.adjustments ?? [])
    }
    this.ready = true
    const queue = this.pendingQueue
    this.pendingQueue = []
    queue.forEach(fn => fn())
  }

  private executerOuFile(fn: () => void) {
    if (this.ready) { fn() } else { this.pendingQueue.push(fn) }
  }

  initFromSupabase(rows: Array<{ parametre: string; valeur: number }>) {
    if (rows.length === 0) return
    for (const r of rows) {
      if (r.parametre.startsWith('weight_')) {
        const dim = r.parametre.replace('weight_', '')
        if (dim in DEFAULT_WEIGHTS) this.weights[dim] = r.valeur
      }
    }
    this.persist()
  }

  onSync(callback: SyncWeightCallback) {
    this.syncCallback = callback
  }

  private persist(): void {
    iaStorage.set(IDB_STORE, STORAGE_KEY, this.toJSON())
  }

  getCurrentWeights(): WeightMap {
    return { ...this.weights }
  }

  getWeight(dim: string): number {
    return this.weights[dim] ?? DEFAULT_WEIGHTS[dim as keyof typeof DEFAULT_WEIGHTS] ?? 20
  }

  getAdjustments(): WeightAdjustment[] {
    return [...this.adjustments]
  }

  /**
   * Recalibrer les poids à partir des outcomes de décisions.
   * Conçue pour le contexte serveur (cron). En contexte client, la protection
   * typeof window évite les races si appelée avant initFromIDB().
   * @param outcomes - Liste des décisions évaluées
   * @param dimensionsByAerodrome - Map aerodrome_id → dimensions C1-C5 (résolution par aérodrome)
   */
  recalibrateFromOutcomes(outcomes: DecisionOutcome[], dimensionsByAerodrome: Map<string, Record<string, number>>): WeightAdjustment[] {
    if (typeof window !== 'undefined' && !this.ready) {
      this.executerOuFile(() => { this.recalibrateFromOutcomes(outcomes, dimensionsByAerodrome) })
      return []
    }
    const newAdjustments: WeightAdjustment[] = []

    // Grouper les outcomes par dimension associée
    const dimEffectiveness: Record<string, { efficace: number; inefficace: number; total: number }> = {}
    for (const dim of Object.keys(DEFAULT_WEIGHTS)) {
      dimEffectiveness[dim] = { efficace: 0, inefficace: 0, total: 0 }
    }

    // Répartir les outcomes entre les dimensions
    // Chaque décision est associée à la dimension la plus faible du profil
    // de son aérodrome au moment de l'évaluation
    for (const outcome of outcomes) {
      if (outcome.effectiveness === 'non_evalue') continue
      const aerodromeDims = dimensionsByAerodrome.get(outcome.aerodrome_id) ?? DEFAULT_WEIGHTS as unknown as Record<string, number>
      const dim = findWorstDimension(aerodromeDims)
      if (dim && dimEffectiveness[dim]) {
        dimEffectiveness[dim].total++
        if (outcome.effectiveness === 'efficace') dimEffectiveness[dim].efficace++
        else if (outcome.effectiveness === 'inefficace') dimEffectiveness[dim].inefficace++
      }
    }

    for (const [dim, stats] of Object.entries(dimEffectiveness)) {
      if (stats.total < 3) continue // Pas assez de données

      const ratioEfficacite = stats.efficace / stats.total
      let delta = 0

      if (ratioEfficacite < 0.3) {
        // Moins de 30% d'efficacité → le poids de cette dimension est trop fort
        delta = -3
      } else if (ratioEfficacite > 0.7) {
        // Plus de 70% d'efficacité → cette dimension est bien calibrée, on renforce
        delta = 2
      }

      if (delta !== 0) {
        const oldWeight = this.weights[dim] ?? DEFAULT_WEIGHTS[dim as keyof typeof DEFAULT_WEIGHTS] ?? 20
        const newWeight = Math.max(10, Math.min(40, oldWeight + delta))
        const actualDelta = newWeight - oldWeight

        if (actualDelta !== 0) {
          this.weights[dim] = newWeight
          const adj: WeightAdjustment = {
            id: `wadj-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            dim,
            delta: actualDelta,
            raison: `${stats.efficace}/${stats.total} efficaces (ratio ${(ratioEfficacite * 100).toFixed(0)}%) → ${actualDelta > 0 ? 'augmentation' : 'réduction'} de ${Math.abs(actualDelta)} pts`,
            appliedAt: new Date().toISOString(),
          }
          this.adjustments.push(adj)
          newAdjustments.push(adj)
          this.syncCallback?.(dim, newWeight, adj.raison)
        }
      }
    }

    // Normaliser pour que la somme reste 100
    this.normalize()
    this.persist()

    return newAdjustments
  }

  private normalize(): void {
    const currentSum = Object.values(this.weights).reduce((s, v) => s + v, 0)
    if (currentSum === 0) return
    const targetSum = Object.values(DEFAULT_WEIGHTS).reduce((s, v) => s + v, 0)
    const factor = targetSum / currentSum
    for (const key of Object.keys(this.weights)) {
      this.weights[key] = Math.round(this.weights[key] * factor)
    }
  }

  reset(): void {
    this.weights = { ...DEFAULT_WEIGHTS }
    this.adjustments = []
    this.persist()
  }

  toJSON(): { weights: WeightMap; adjustments: WeightAdjustment[] } {
    return { weights: { ...this.weights }, adjustments: [...this.adjustments] }
  }
}

function findWorstDimension(dimensions: Record<string, number>): string | null {
  const dims = Object.keys(DEFAULT_WEIGHTS)
  let worst = dims[0]
  let worstVal = Infinity
  for (const d of dims) {
    const v = dimensions[d] ?? 50
    if (v < worstVal) {
      worstVal = v
      worst = d
    }
  }
  return worstVal < Infinity ? worst : null
}

export const weightController = new WeightController()
