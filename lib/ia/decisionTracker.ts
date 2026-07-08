import type { Recommendation } from './engines/recommendationEngine'
import { thresholdController } from './thresholdController'
import { iaStorage, mergeArrayById } from '@/lib/persistence/iaStorage'

export type DecisionStatus = 'pending' | 'applied' | 'dismissed' | 'expired'

import type { EffectivenessRating } from './types'
export type { EffectivenessRating }

export interface DecisionRecord {
  id: string
  aerodromeId: string
  date: string
  type: 'recommendation' | 'certificat' | 'declencheur' | 'type_suggestion'
  recommendation?: Recommendation
  certificatAction?: string
  declencheurType?: string
  suggestionType?: string
  suggestionConfiance?: number
  status: DecisionStatus
  effectiveness: EffectivenessRating
  autoEvaluated?: boolean
  effectivenessAuto?: EffectivenessRating
  appliedAt?: string
  commentaire?: string
}

interface DecisionStoreData {
  decisions: DecisionRecord[]
}

const STORAGE_KEY = 'sgda_decision_tracker'
const IDB_STORE = 'decisions' as const

type SyncDecisionCallback = (record: DecisionRecord) => void

export class DecisionTracker {
  private data: DecisionStoreData = { decisions: [] }
  private syncCallback: SyncDecisionCallback | null = null
  private ready: boolean = false
  private pendingQueue: Array<() => void> = []

  constructor() {}

  async initFromIDB(): Promise<void> {
    const stored = await iaStorage.get<DecisionStoreData>(IDB_STORE, STORAGE_KEY)
    if (stored) {
      this.data.decisions = mergeArrayById(this.data.decisions, stored.decisions)
    }
    this.ready = true
    const queue = this.pendingQueue
    this.pendingQueue = []
    queue.forEach(fn => fn())
  }

  private executerOuFile(fn: () => void) {
    if (this.ready) {
      fn()
    } else {
      this.pendingQueue.push(fn)
    }
  }

  onSync(callback: SyncDecisionCallback) {
    this.syncCallback = callback
  }

  initFromSupabase(records: DecisionRecord[]) {
    if (records.length === 0) return
    const ids = new Set(this.data.decisions.map(d => d.id))
    for (const r of records) {
      if (!ids.has(r.id)) {
        this.data.decisions.push(r)
        ids.add(r.id)
      } else {
        // Réconciliation auto vs manuel : ne pas écraser une évaluation manuelle
        const existing = this.data.decisions.find(d => d.id === r.id)
        if (existing && existing.effectiveness === 'non_evalue' && r.autoEvaluated) {
          existing.effectiveness = r.effectiveness
          existing.effectivenessAuto = r.effectiveness
          existing.autoEvaluated = true
        } else if (existing && r.autoEvaluated && existing.effectiveness !== r.effectiveness) {
          // L'auto-évaluation arrive après une évaluation manuelle différente
          // On garde la manuelle mais on stocke l'auto pour détection de conflit
          existing.effectivenessAuto = r.effectiveness
        } else if (existing && !r.autoEvaluated && existing.effectiveness !== 'non_evalue' && existing.effectiveness !== r.effectiveness) {
          // Deux évaluations manuelles divergentes — on ne les écrase pas
          // On conserve la divergence dans effectivenessAuto pour getEvalConflicts()
          existing.effectivenessAuto = r.effectiveness
        }
      }
    }
    this.persist()
  }

  private persist(): void {
    iaStorage.set(IDB_STORE, STORAGE_KEY, this.data)
  }

  enregistrerDecision(
    aerodromeId: string,
    type: DecisionRecord['type'],
    payload: {
      recommendation?: Recommendation
      certificatAction?: string
      declencheurType?: string
      suggestionType?: string
      suggestionConfiance?: number
    },
  ): DecisionRecord {
    const record: DecisionRecord = {
      id: `dec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      aerodromeId,
      date: new Date().toISOString(),
      type,
      status: 'pending',
      effectiveness: 'non_evalue',
      ...payload,
    }
    this.executerOuFile(() => {
      this.data.decisions.push(record)
      this.persist()
      this.syncCallback?.(record)
    })
    return record
  }

  appliquer(id: string): void {
    this.executerOuFile(() => {
      const d = this.data.decisions.find(x => x.id === id)
      if (d) {
        d.status = 'applied'
        d.appliedAt = new Date().toISOString()
        this.persist()
        this.syncCallback?.(d)
      }
    })
  }

  dismiss(id: string): void {
    this.executerOuFile(() => {
      const d = this.data.decisions.find(x => x.id === id)
      if (d) {
        d.status = 'dismissed'
        this.persist()
        this.syncCallback?.(d)
      }
    })
  }

  evaluer(id: string, rating: EffectivenessRating, commentaire?: string): void {
    this.executerOuFile(() => {
      const d = this.data.decisions.find(x => x.id === id)
      if (d) {
        d.effectiveness = rating
        if (commentaire) d.commentaire = commentaire
        this.persist()
        this.syncCallback?.(d)
        if (rating === 'inefficace') {
          const ancien = thresholdController.scoreAlerteImmediate
          if (ancien < 50) {
            thresholdController.enregistrerAjustementDepuisDecision('recommendation', 'scoreAlerteImmediate', ancien, Math.min(50, ancien + 5), 'Décision évaluée inefficace — remontée du seuil d\'alerte')
          }
        }
        const efficacesRecents = this.data.decisions
          .filter(x => x.effectiveness === 'efficace' && x.status === 'applied')
          .slice(-5)
        if (efficacesRecents.length >= 5) {
          const ancien = thresholdController.scoreAlerteImmediate
          if (ancien > 20) {
            thresholdController.enregistrerAjustementDepuisDecision('recommendation', 'scoreAlerteImmediate', ancien, Math.max(20, ancien - 2), '5 décisions efficaces consécutives — baisse progressive du seuil d\'alerte')
          }
        }
      }
    })
  }

  getDecisionsByAerodrome(aerodromeId: string): DecisionRecord[] {
    return this.data.decisions
      .filter(d => d.aerodromeId === aerodromeId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  getEvalConflicts(aerodromeId: string): DecisionRecord[] {
    return this.data.decisions.filter(d =>
      d.aerodromeId === aerodromeId &&
      d.effectiveness !== 'non_evalue' &&
      d.effectivenessAuto !== undefined &&
      d.effectivenessAuto !== d.effectiveness
    )
  }

  getStats(aerodromeId: string): {
    total: number
    appliquees: number
    efficaces: number
    tauxApplication: number
    tauxEfficacite: number
    parType: Record<string, number>
  } {
    const decisions = this.getDecisionsByAerodrome(aerodromeId)
    const total = decisions.length
    const appliquees = decisions.filter(d => d.status === 'applied').length
    const efficaces = decisions.filter(d => d.effectiveness === 'efficace').length
    const parType: Record<string, number> = {}
    for (const d of decisions) {
      parType[d.type] = (parType[d.type] || 0) + 1
    }
    return {
      total,
      appliquees,
      efficaces,
      tauxApplication: total > 0 ? Math.round((appliquees / total) * 100) : 0,
      tauxEfficacite: appliquees > 0 ? Math.round((efficaces / appliquees) * 100) : 0,
      parType,
    }
  }

  clear(aerodromeId?: string): void {
    if (aerodromeId) {
      this.data.decisions = this.data.decisions.filter(d => d.aerodromeId !== aerodromeId)
    } else {
      this.data.decisions = []
    }
    this.persist()
  }
}

export const decisionTracker = new DecisionTracker()
