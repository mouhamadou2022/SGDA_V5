// lib/ia/engines/engineFeedback.ts
// Système de feedback pour apprendre des décisions des engines spécialisés
// Les engines deviennent plus précis à chaque feedback utilisateur

import { iaStorage, mergeArrayById } from '@/lib/persistence/iaStorage'

export type EngineType = 'riskProfile' | 'compliance' | 'recommendation' | 'certificate' | 'team'
export type FeedbackVote = 'pertinent' | 'non_pertinent' | 'partiellement'

export interface EngineFeedbackRecord {
  id: string
  engineType: EngineType
  aerodromeId: string
  date: string
  contexte: {
    planningId?: string
    surveillanceId?: string
  }
  decision: {
    type: string
    donnees: Record<string, unknown>
  }
  vote: FeedbackVote
  commentaire?: string
  correctionUtilisateur?: string
}

export interface EngineLearningStats {
  totalFeedbacks: number
  pertinenceRate: number
  parEngine: Record<EngineType, { total: number; pertinents: number; taux: number }>
  dernieresSuggestions: EngineFeedbackRecord[]
}

type SyncCallback = (record: EngineFeedbackRecord) => void

class EngineFeedbackStore {
  private feedbacks: EngineFeedbackRecord[] = []
  private storageKey = 'engine_feedback'
  private syncCallback: SyncCallback | null = null
  private ready: boolean = false
  private pendingQueue: Array<() => void> = []

  constructor() {}

  async initFromIDB(): Promise<void> {
    const stored = await iaStorage.get<EngineFeedbackRecord[]>('feedbacks', this.storageKey)
    if (stored) {
      // Fusion au lieu de remplacement — dédoublonnage par id
      this.feedbacks = mergeArrayById(this.feedbacks, stored)
    }
    this.ready = true
    const queue = this.pendingQueue
    this.pendingQueue = []
    queue.forEach(fn => fn())
  }

  private executerOuFile(fn: () => void) {
    if (this.ready) { fn() } else { this.pendingQueue.push(fn) }
  }

  onSync(callback: SyncCallback) {
    this.syncCallback = callback
  }

  private persist(): void {
    iaStorage.set('feedbacks', this.storageKey, this.feedbacks.slice(-200))
  }

  /** Charge les feedbacks depuis Supabase (appelé au démarrage) */
  initFromSupabase(records: EngineFeedbackRecord[]) {
    if (records.length === 0) return
    this.feedbacks = mergeArrayById(this.feedbacks, records)
    this.persist()
  }

  /** Retourne tous les feedbacks pour sync Supabase */
  getAllFeedbacks(): EngineFeedbackRecord[] {
    return [...this.feedbacks]
  }

  enregistrer(record: Omit<EngineFeedbackRecord, 'id' | 'date'>): EngineFeedbackRecord | null {
    const entry: EngineFeedbackRecord = {
      ...record,
      id: `ef-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date().toISOString(),
    }
    this.executerOuFile(() => {
      this.feedbacks.push(entry)
      this.persist()
      this.syncCallback?.(entry)
    })
    return entry
  }

  getStats(): EngineLearningStats {
    const total = this.feedbacks.length
    const pertinents = this.feedbacks.filter(f => f.vote === 'pertinent').length
    const parEngine: EngineLearningStats['parEngine'] = {
      riskProfile: { total: 0, pertinents: 0, taux: 0 },
      compliance: { total: 0, pertinents: 0, taux: 0 },
      recommendation: { total: 0, pertinents: 0, taux: 0 },
      certificate: { total: 0, pertinents: 0, taux: 0 },
      team: { total: 0, pertinents: 0, taux: 0 },
    }
    for (const f of this.feedbacks) {
      const e = parEngine[f.engineType]
      if (e) {
        e.total++
        if (f.vote === 'pertinent') e.pertinents++
        e.taux = e.total > 0 ? Math.round((e.pertinents / e.total) * 100) : 0
      }
    }

    return {
      totalFeedbacks: total,
      pertinenceRate: total > 0 ? Math.round((pertinents / total) * 100) : 0,
      parEngine,
      dernieresSuggestions: this.feedbacks.slice(-10).reverse(),
    }
  }

  /**
   * Calcule un score de confiance pour un type d'engine basé sur l'historique
   * Plus le taux de pertinence est élevé, plus la confiance est haute
   */
  getConfiance(engineType: EngineType): number {
    const stats = this.getStats()
    const engine = stats.parEngine[engineType]
    if (!engine || engine.total < 3) return 50
    return engine.taux
  }

  /**
   * Ajuste les seuils/scores basés sur le feedback
   * Retourne des recommandations d'ajustement
   */
  analyserTendances(): Array<{ engine: EngineType; probleme: string; suggestion: string }> {
    const tendances: Array<{ engine: EngineType; probleme: string; suggestion: string }> = []

    for (const [engine, stats] of Object.entries(this.getStats().parEngine)) {
      const e = engine as EngineType
      if (stats.total >= 5 && stats.taux < 50) {
        tendances.push({
          engine: e,
          probleme: `Taux de pertinence faible: ${stats.taux}% (${stats.total} feedbacks)`,
          suggestion: `Revoir les regles de l engine ${e}`,
        })
      }
    }

    const recentsNonPertinents = this.feedbacks
      .filter(f => f.vote !== 'pertinent')
      .slice(-20)

    const parType: Record<string, number> = {}
    for (const f of recentsNonPertinents) {
      const k = `${f.engineType}:${f.decision.type}`
      parType[k] = (parType[k] || 0) + 1
    }

    for (const [key, count] of Object.entries(parType)) {
      if (count >= 3) {
        const [engine, type] = key.split(':')
        tendances.push({
          engine: engine as EngineType,
          probleme: `Decision "${type}" rejetee ${count} fois recemment`,
          suggestion: `Revoir la logique de decision "${type}"`,
        })
      }
    }

    return tendances
  }
}

export const engineFeedback = new EngineFeedbackStore()
