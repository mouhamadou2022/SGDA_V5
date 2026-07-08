import { engineFeedback, type EngineType } from './engines/engineFeedback'
import { iaStorage, mergeArrayById } from '@/lib/persistence/iaStorage'

type SyncAjustementCallback = (engine: string, parametre: string, valeur: number, raison: string) => void

export interface ThresholdConfig {
  cSeuils: { C1: number; C2: number; C3: number; C4: number; C5: number }
  scoreAlerteImmediate: number
  scoreAlerteCorrectif: number
  rejetSeuil: number
  ajustementPas: number
  historique: Array<{
    id: string
    date: string
    engine: EngineType
    parametre: string
    ancienneValeur: number
    nouvelleValeur: number
    raison: string
  }>
}

const STORAGE_KEY = 'sgda_threshold_config'

function defaults(): ThresholdConfig {
  return {
    cSeuils: { C1: 60, C2: 60, C3: 60, C4: 50, C5: 60 },
    scoreAlerteImmediate: 30,
    scoreAlerteCorrectif: 50,
    rejetSeuil: 3,
    ajustementPas: 5,
    historique: [],
  }
}

export class ThresholdController {
  private config: ThresholdConfig = defaults()
  private syncCallback: SyncAjustementCallback | null = null
  private ready: boolean = false
  private pendingQueue: Array<() => void> = []

  constructor() {}

  async initFromIDB(): Promise<void> {
    const stored = await iaStorage.get<ThresholdConfig>('thresholds', STORAGE_KEY)
    if (stored) {
      const existingHistorique = this.config.historique
      this.config = { ...defaults(), ...stored }
      this.config.historique = mergeArrayById(existingHistorique, stored.historique ?? [])
    }
    this.ready = true
    const queue = this.pendingQueue
    this.pendingQueue = []
    queue.forEach(fn => fn())
  }

  private executerOuFile(fn: () => void) {
    if (this.ready) { fn() } else { this.pendingQueue.push(fn) }
  }

  onSync(callback: SyncAjustementCallback) {
    this.syncCallback = callback
  }

  initFromSupabase(rows: Array<{ parametre: string; valeur: number }>) {
    if (rows.length === 0) return
    for (const r of rows) {
      if (r.parametre.startsWith('cSeuils.')) {
        const key = r.parametre.replace('cSeuils.', '') as keyof ThresholdConfig['cSeuils']
        if (key in this.config.cSeuils) this.config.cSeuils[key] = r.valeur
      } else if (r.parametre === 'scoreAlerteImmediate') {
        this.config.scoreAlerteImmediate = r.valeur
      } else if (r.parametre === 'scoreAlerteCorrectif') {
        this.config.scoreAlerteCorrectif = r.valeur
      }
    }
    this.persist()
  }

  private persist(): void {
    iaStorage.set('thresholds', STORAGE_KEY, this.config)
  }

  get cSeuils() { return { ...this.config.cSeuils } }
  get scoreAlerteImmediate() { return this.config.scoreAlerteImmediate }
  get scoreAlerteCorrectif() { return this.config.scoreAlerteCorrectif }

  private enregistrerAjustement(engine: EngineType, parametre: string, ancienne: number, nouvelle: number, raison: string) {
    this.config.historique.push({
      id: `hst-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date().toISOString(),
      engine,
      parametre,
      ancienneValeur: ancienne,
      nouvelleValeur: nouvelle,
      raison,
    })
    if (parametre === 'scoreAlerteImmediate') this.config.scoreAlerteImmediate = nouvelle
    else if (parametre === 'scoreAlerteCorrectif') this.config.scoreAlerteCorrectif = nouvelle
    else if (parametre.startsWith('cSeuils.')) {
      const key = parametre.replace('cSeuils.', '') as keyof ThresholdConfig['cSeuils']
      if (key in this.config.cSeuils) this.config.cSeuils[key] = nouvelle
    }
    this.persist()
    this.syncCallback?.(engine, parametre, nouvelle, raison)
  }

  /** Méthode publique pour les ajustements venant de l'évaluation de décisions (decisionTracker)
   *  Évite les mutations directes par crochets qui contournent l'audit trail */
  enregistrerAjustementDepuisDecision(engine: EngineType, parametre: string, ancienne: number, nouvelle: number, raison: string) {
    this.executerOuFile(() => this.enregistrerAjustement(engine, parametre, ancienne, nouvelle, raison))
  }

  autoAjuster(): Array<{ engine: EngineType; parametre: string; ancien: number; nouveau: number; raison: string }> {
    if (!this.ready) {
      this.executerOuFile(() => { this.autoAjuster() })
      return []
    }
    const ajustements: Array<{ engine: EngineType; parametre: string; ancien: number; nouveau: number; raison: string }> = []
    const stats = engineFeedback.getStats()
    const tendances = engineFeedback.analyserTendances()

    const rejetsRecommandations = stats.parEngine.recommendation
    if (rejetsRecommandations.total >= this.config.rejetSeuil && rejetsRecommandations.taux < 50) {
      const pas = this.config.ajustementPas
      if (this.config.scoreAlerteImmediate < 50) {
        const ancien = this.config.scoreAlerteImmediate
        this.config.scoreAlerteImmediate = Math.min(50, ancien + pas)
        ajustements.push({ engine: 'recommendation', parametre: 'scoreAlerteImmediate', ancien, nouveau: this.config.scoreAlerteImmediate, raison: `Taux pertinence recommendation ${rejetsRecommandations.taux}% < 50% — relâchement du seuil` })
      }
      if (this.config.scoreAlerteCorrectif < 70) {
        const ancien = this.config.scoreAlerteCorrectif
        this.config.scoreAlerteCorrectif = Math.min(70, ancien + pas)
        ajustements.push({ engine: 'recommendation', parametre: 'scoreAlerteCorrectif', ancien, nouveau: this.config.scoreAlerteCorrectif, raison: `Taux pertinence recommendation faible — relâchement du seuil correctif` })
      }
    }

    const rejetsRiskProfile = stats.parEngine.riskProfile
    if (rejetsRiskProfile.total >= this.config.rejetSeuil && rejetsRiskProfile.taux < 50) {
      const pas = this.config.ajustementPas
      for (const c of ['C1', 'C2', 'C3', 'C4', 'C5'] as const) {
        if (this.config.cSeuils[c] > 40) {
          const ancien = this.config.cSeuils[c]
          this.config.cSeuils[c] = Math.max(40, ancien - pas)
          ajustements.push({ engine: 'riskProfile', parametre: `cSeuils.${c}`, ancien, nouveau: this.config.cSeuils[c], raison: `Taux pertinence riskProfile ${rejetsRiskProfile.taux}% — baisse du seuil ${c}` })
        }
      }
    }

    for (const t of tendances) {
      if (t.probleme.includes('rejetee')) {
        const pas = this.config.ajustementPas
        const ancien = this.config.scoreAlerteImmediate
        this.config.scoreAlerteImmediate = Math.min(60, ancien + pas)
        ajustements.push({ engine: t.engine, parametre: 'scoreAlerteImmediate', ancien, nouveau: this.config.scoreAlerteImmediate, raison: t.probleme })
      }
    }

    for (const a of ajustements) {
      this.enregistrerAjustement(a.engine, a.parametre, a.ancien, a.nouveau, a.raison)
    }

    this.persist()
    return ajustements
  }

  getHistorique() {
    return [...this.config.historique]
  }

  reset() {
    this.config = defaults()
    this.persist()
  }
}

export const thresholdController = new ThresholdController()
