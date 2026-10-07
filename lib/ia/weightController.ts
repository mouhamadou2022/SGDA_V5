// lib/ia/weightController.ts
// Gestion dynamique des poids C1-C5 en fonction des outcomes des décisions
// Boucle d'apprentissage : si les décisions sont inefficaces → recalibrer les poids

import type { DecisionOutcome } from './evaluateOutcomes'
import { iaStorage, mergeArrayById } from '@/lib/persistence/iaStorage'
import { fetchThresholds } from '@/lib/datastore'

export const DEFAULT_WEIGHTS = { c1: 20, c2: 25, c3: 20, c4: 20, c5: 15 } as const

// Cache TTL pour les poids appris (évite une requête ia_thresholds à chaque recalcul)
let cachedLearnedWeights: WeightMap | null = null
let learnedWeightsAt = 0
const WEIGHTS_TTL_MS = 5 * 60 * 1000

/**
 * Charge les poids C1-C5 appris depuis ia_thresholds (weight_*), avec repli
 * sur DEFAULT_WEIGHTS. Partagé par le store (client) et le moteur de score
 * pour garantir la convergence store/cron.
 */
export async function fetchLearnedWeights(force = false): Promise<WeightMap> {
  if (!force && cachedLearnedWeights && Date.now() - learnedWeightsAt < WEIGHTS_TTL_MS) {
    return { ...cachedLearnedWeights }
  }
  let weights: WeightMap = { ...DEFAULT_WEIGHTS }
  try {
    const res = await fetchThresholds()
    if (res.data && res.data.length > 0) {
      weights = extrairePoidsLus(res.data).poids
    }
  } catch { /* ia_thresholds indisponible → poids par défaut */ }
  cachedLearnedWeights = weights
  learnedWeightsAt = Date.now()
  return { ...weights }
}

/**
 * Ramène une carte de poids à une somme exacte (plus grands restes) :
 * évite les sommes 99/101 du Math.round pur. Pur et testé.
 */
export function normaliserPoidsSomme100(poids: WeightMap, cible = 100): WeightMap {
  const cles = Object.keys(poids)
  const somme = cles.reduce((s, k) => s + (Number(poids[k]) || 0), 0)
  if (somme <= 0 || cles.length === 0) return { ...poids }
  const exacts = cles.map(k => (Number(poids[k]) || 0) * cible / somme)
  const arrondis = exacts.map(v => Math.floor(v))
  let reste = cible - arrondis.reduce((s, v) => s + v, 0)
  const ordre = exacts
    .map((v, i) => i)
    .sort((a, b) => (exacts[b] - Math.floor(exacts[b])) - (exacts[a] - Math.floor(exacts[a])))
  let i = 0
  while (reste > 0) {
    arrondis[ordre[i % ordre.length]]++
    reste--
    i++
  }
  const resultat: WeightMap = {}
  cles.forEach((k, idx) => { resultat[k] = arrondis[idx] })
  return resultat
}

/** Valide et normalise une carte de poids C1-C5 : seules les clés c1..c5 sont
 *  conservées, les valeurs manquantes (null/undefined/NaN) tombent sur les
 *  poids par défaut, les valeurs hors [0,100] sont clippées, et la somme est
 *  ramenée exactement à 100 (plus grands restes). */
export function qualifierPoids(poids: WeightMap): WeightMap {
  const cles = Object.keys(DEFAULT_WEIGHTS)
  const valeurs: number[] = cles.map((cle) => {
    const raw = poids[cle]
    // null, undefined et NaN (ou non numériques) → valeur par défaut
    if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) {
      return DEFAULT_WEIGHTS[cle as keyof typeof DEFAULT_WEIGHTS]
    }
    return Math.max(0, Math.min(100, Math.round(raw)))
  })
  return normaliserPoidsSomme100(
    Object.fromEntries(cles.map((cle, i) => [cle, valeurs[i]])) as WeightMap
  )
}

/** Décalage adaptatif du poids d'une dimension.
 *  ratio 0.5 → 0 (aucun décalage), >0.5 renforce, <0.5 affaiblit, avec une
 *  pente douce (ADAPTIVE_GAIN) ; le déplacement réel est borné à ±3
 *  (gain 6 sur un ratio dans [0,1]), le clamp ±WEIGHT_MAX ne mord jamais. */
export function computeAdaptiveWeightDelta(ratioEfficacite: number): number {
  const brut = (ratioEfficacite - 0.5) * ADAPTIVE_GAIN
  return Math.max(-WEIGHT_MAX, Math.min(WEIGHT_MAX, Math.round(brut)))
}

/** Ligne ia_thresholds lue depuis Supabase (engine présent côté cron quand
 *  le select l'inclut, absent côté certaines requêtes historiques). */
export interface LignePoidsLue {
  parametre: string
  valeur: number
  engine?: string | null
}

/**
 * Extrait les poids C1-C5 depuis des lignes ia_thresholds (client ou cron).
 * Préfère les lignes engine='recommendation' quand il y en a, avec repli sur
 * n'importe quel weight_* (compatibilité historique) ; le résultat est
 * toujours qualifié (clés c1..c5, défauts, clip [0,100], somme 100).
 * `trouves` = nombre de dimensions renseignées (0 → rien en base).
 */
export function extrairePoidsLus(
  rows: Array<LignePoidsLue> | null | undefined,
): { poids: WeightMap; trouves: number } {
  const lignes = (rows || []).filter(r => typeof r?.parametre === 'string' && r.parametre.startsWith('weight_'))
  const reco = lignes.filter(r => r.engine === 'recommendation')
  const retenues = reco.length > 0 ? reco : lignes
  const partiels: WeightMap = {}
  for (const r of retenues) {
    const dim = r.parametre.replace('weight_', '')
    if (dim in DEFAULT_WEIGHTS) partiels[dim] = r.valeur
  }
  return { poids: qualifierPoids(partiels), trouves: Object.keys(partiels).length }
}

export interface WeightAdjustment {
  id: string
  dim: string
  delta: number
  raison: string
  appliedAt: string
}

export type WeightMap = Record<string, number>

type SyncWeightCallback = (dim: string, weight: number, raison: string) => void

// Bornes de sécurité des poids (min/max après ajustement)
const WEIGHT_MIN = 10
const WEIGHT_MAX = 40
// Nombre minimum d'outcomes par dimension avant calibration
const MIN_SAMPLES_PER_DIM = 8
// Gain en points de poids maximum par décision (ratio - 0.5) * gain
const ADAPTIVE_GAIN = 6.0

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
      this.weights = qualifierPoids({ ...DEFAULT_WEIGHTS, ...stored.weights })
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

  initFromSupabase(rows: Array<{ parametre: string; valeur: number; engine?: string | null }>) {
    const { poids, trouves } = extrairePoidsLus(rows)
    if (trouves === 0) return
    this.weights = qualifierPoids({ ...this.weights, ...poids })
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
      if (stats.total < MIN_SAMPLES_PER_DIM) continue // Pas assez de données

      const ratioEfficacite = stats.efficace / stats.total
      // Règle continue : un ratio de 0.5 ne change rien, >0.5 renforce, <0.5 affaiblit
      // (déplacement réel borné à ±3, pas de seuil brut)
      const delta = computeAdaptiveWeightDelta(ratioEfficacite)

      if (delta !== 0) {
        const oldWeight = this.weights[dim] ?? DEFAULT_WEIGHTS[dim as keyof typeof DEFAULT_WEIGHTS] ?? 20
        const newWeight = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, oldWeight + delta))
        const actualDelta = newWeight - oldWeight

        if (actualDelta !== 0) {
          this.weights[dim] = newWeight
          const adj: WeightAdjustment = {
            id: `wadj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    const targetSum = Object.values(DEFAULT_WEIGHTS).reduce((s, v) => s + v, 0)
    this.weights = normaliserPoidsSomme100(this.weights, targetSum)
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
