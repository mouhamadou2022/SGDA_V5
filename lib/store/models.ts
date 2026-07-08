/**
 * Extension du store pour les modèles avancés (Random Forest, Graph Network)
 * avec persistance IndexedDB et entraînement automatique
 */

import { trainRandomForest, predictRandomForest, profilToFeatures, RandomForestModel, TrainingSample, scoreToLabel } from '../risque/randomForest'
import { createRiskGraph, RiskGraph, calculateRiskPropagation, recommendActionsFromGraph } from '../risque/graphNetwork'
import type { ProfilRisque, Ecart, Aerodrome } from '../store'
import { DOMAINES_SURVEILLANCE } from '../domaines'
import { idbStorage } from '../persistence/idbStorage'

// ============================================================
// TYPES POUR LES MODÈLES AVANCÉS
// ============================================================

export interface RandomForestModelStored {
  version: number
  trained_at: string
  accuracy: number
  training_samples: number
  feature_importance: Record<string, number>
  // On ne stocke pas les arbres (trop lourd), on les reconstruit si besoin
}

export interface RiskGraphStored {
  version: number
  computed_at: string
  nodes_count: number
  edges_count: number
  critical_paths_count: number
  top_central_nodes: Array<{ id: string; centrality: number }>
}

export interface TrainingHistoryEntry {
  date: string
  duration_ms: number
  accuracy: number
  dataset_size: number
  n_trees: number
  max_depth: number
  feature_importance: Record<string, number>
}

export interface TrainingStats {
  total_trainings: number
  last_accuracy: number
  best_accuracy: number
  avg_accuracy: number
  total_samples_trained: number
  last_training_date: string | null
  accuracy_trend: 'up' | 'down' | 'stable'
}

export interface ModelTrainingConfig {
  auto_train_enabled: boolean
  train_interval_hours: number
  min_samples_for_training: number
  last_auto_train: string | null
  next_auto_train: string | null
}

export interface ModelPerformanceMetrics {
  random_forest: {
    accuracy: number
    precision_by_class: Record<string, number>
    confusion_matrix: Record<string, Record<string, number>>
    last_evaluated: string | null
  }
  graph_network: {
    propagation_accuracy: number
    last_evaluated: string | null
  }
}

// ============================================================
// GESTIONNAIRE DE MODÈLES (sans dépendance React/Zustand)
// ============================================================

const KEYS = {
  RF_MODEL: 'sgda_rf_model',
  RF_SAMPLES: 'sgda_rf_samples',
  GRAPH_MODEL: 'sgda_graph_model',
  TRAINING_CONFIG: 'sgda_training_config',
  PERFORMANCE_METRICS: 'sgda_model_metrics',
  TRAINING_HISTORY: 'sgda_training_history'
}

class AdvancedModelsManager {
  private rfModel: RandomForestModel | null = null
  private rfSamples: TrainingSample[] = []
  private riskGraph: RiskGraph | null = null
  private config: ModelTrainingConfig = {
    auto_train_enabled: true,
    train_interval_hours: 24,
    min_samples_for_training: 20,
    last_auto_train: null,
    next_auto_train: null
  }
  private metrics: ModelPerformanceMetrics = {
    random_forest: {
      accuracy: 0,
      precision_by_class: {},
      confusion_matrix: {},
      last_evaluated: null
    },
    graph_network: {
      propagation_accuracy: 0,
      last_evaluated: null
    }
  }

  private _trainingHistory: TrainingHistoryEntry[] | null = null
  private _trainingHistoryLoaded = false
  private _autoTrainIntervalId: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.loadFromStorage()
    this.scheduleAutoTrain()
  }

  // ============================================================
  // TRAINING HISTORY
  // ============================================================

  private async loadTrainingHistory(): Promise<TrainingHistoryEntry[]> {
    if (this._trainingHistoryLoaded && this._trainingHistory) return this._trainingHistory
    if (typeof window === 'undefined') return []
    try {
      const data = await idbStorage.get<TrainingHistoryEntry[]>(KEYS.TRAINING_HISTORY)
      this._trainingHistory = data || []
    } catch {
      this._trainingHistory = []
    }
    this._trainingHistoryLoaded = true
    return this._trainingHistory
  }

  private async saveTrainingHistory() {
    if (typeof window === 'undefined') return
    if (this._trainingHistory) {
      await idbStorage.set(KEYS.TRAINING_HISTORY, this._trainingHistory.slice(-200))
    }
  }

  async getTrainingHistory(): Promise<TrainingHistoryEntry[]> {
    return this.loadTrainingHistory()
  }

  async getTrainingStats(): Promise<TrainingStats> {
    const history = await this.loadTrainingHistory()
    if (history.length === 0) {
      return {
        total_trainings: 0,
        last_accuracy: 0,
        best_accuracy: 0,
        avg_accuracy: 0,
        total_samples_trained: 0,
        last_training_date: null,
        accuracy_trend: 'stable',
      }
    }
    const accuracies = history.map(h => h.accuracy)
    const lastAcc = accuracies[accuracies.length - 1]
    const bestAcc = Math.max(...accuracies)
    const avgAcc = accuracies.reduce((a, b) => a + b, 0) / accuracies.length
    const totalSamples = history.reduce((s, h) => s + h.dataset_size, 0)
    const lastDate = history[history.length - 1].date
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (history.length >= 3) {
      const recent = accuracies.slice(-3)
      if (recent[2] > recent[0]) trend = 'up'
      else if (recent[2] < recent[0]) trend = 'down'
    }
    return {
      total_trainings: history.length,
      last_accuracy: lastAcc,
      best_accuracy: bestAcc,
      avg_accuracy: Math.round(avgAcc * 1000) / 1000,
      total_samples_trained: totalSamples,
      last_training_date: lastDate,
      accuracy_trend: trend,
    }
  }

  async exportTrainingHistoryCSV(): Promise<string> {
    const history = await this.loadTrainingHistory()
    const header = 'Date,Durée (ms),Précision,Tailles dataset,Arbres,Profondeur'
    const rows = history.map(h =>
      `${h.date},${h.duration_ms},${(h.accuracy * 100).toFixed(1)}%,${h.dataset_size},${h.n_trees},${h.max_depth}`
    )
    return [header, ...rows].join('\n')
  }

  // ============================================================
  // PERSISTENCE (IndexedDB avec fallback localStorage)
  // ============================================================

  private async loadFromStorage() {
    if (typeof window === 'undefined') return
    try {
      // Charger config
      const configData = await idbStorage.get<ModelTrainingConfig>(KEYS.TRAINING_CONFIG)
      if (configData) this.config = { ...this.config, ...configData }

      // Charger métriques
      const metricsData = await idbStorage.get<ModelPerformanceMetrics>(KEYS.PERFORMANCE_METRICS)
      if (metricsData) this.metrics = metricsData

      // Charger échantillons RF
      const samplesData = await idbStorage.get<TrainingSample[]>(KEYS.RF_SAMPLES)
      if (samplesData) this.rfSamples = samplesData

      // Charger métadonnées RF
      const rfMeta = await idbStorage.get<RandomForestModelStored>(KEYS.RF_MODEL)
      if (rfMeta) {
        this._cachedRFModelInfo = rfMeta
        console.log(`[Models] RF model v${rfMeta.version} trouvé, réentraînement nécessaire`)
      }

      // Charger métadonnées graphe
      const graphMeta = await idbStorage.get<RiskGraphStored>(KEYS.GRAPH_MODEL)
      if (graphMeta) {
        this._cachedGraphModelInfo = graphMeta
        console.log(`[Models] Graph model v${graphMeta.version} trouvé, recalcul nécessaire`)
      }
    } catch (error) {
      console.error('[Models] Erreur chargement IndexedDB:', error)
    }
  }

  private async saveConfig() {
    if (typeof window === 'undefined') return
    await idbStorage.set(KEYS.TRAINING_CONFIG, this.config)
  }

  private async saveMetrics() {
    if (typeof window === 'undefined') return
    await idbStorage.set(KEYS.PERFORMANCE_METRICS, this.metrics)
  }

  private async saveRFSamples() {
    if (typeof window === 'undefined') return
    // Limiter à 2000 échantillons (IndexedDB supporte bien plus que localStorage)
    const samplesToSave = this.rfSamples.slice(-2000)
    await idbStorage.set(KEYS.RF_SAMPLES, samplesToSave)
  }

  // ============================================================
  // RANDOM FOREST
  // ============================================================

  addTrainingSample(profil: ProfilRisque, actualLevel?: 'critique' | 'eleve' | 'moyen' | 'faible') {
    const features = profilToFeatures(profil)
    const label = actualLevel || scoreToLabel(profil.score_global)
    
    const sample: TrainingSample = { features, label }
    this.rfSamples.push(sample)
    this.saveRFSamples()

    // Déclencher entraînement si assez d'échantillons
    if (this.rfSamples.length >= this.config.min_samples_for_training) {
      this.trainRandomForestIfNeeded()
    }
  }

  async trainRandomForest(nTrees: number = 10, maxDepth: number = 4): Promise<RandomForestModel | null> {
    if (this.rfSamples.length < 10) {
      console.warn('[Models] Pas assez d\'échantillons pour entraîner RF')
      return null
    }

    const startTime = performance.now()
    console.log(`[Models] Entraînement Random Forest avec ${this.rfSamples.length} échantillons...`)
    const model = await trainRandomForest(this.rfSamples, nTrees, maxDepth, 3)
    const durationMs = Math.round(performance.now() - startTime)
    this.rfModel = model

    // Mettre à jour les métriques
    this.metrics.random_forest.accuracy = model.accuracy
    this.metrics.random_forest.last_evaluated = new Date().toISOString()
    
    // Calculer feature importance
    const featureImportance: Record<string, number> = {}
    model.featureImportance.forEach((value, key) => {
      featureImportance[key] = value
    })

    // Sauvegarder métadonnées
    const stored: RandomForestModelStored = {
      version: Date.now(),
      trained_at: new Date().toISOString(),
      accuracy: model.accuracy,
      training_samples: model.trainingSamples,
      feature_importance: featureImportance
    }

    this._cachedRFModelInfo = stored
    await idbStorage.set(KEYS.RF_MODEL, stored)
    await this.saveMetrics()
    console.log(`[Models] Random Forest entraîné - Précision: ${(model.accuracy * 100).toFixed(1)}% (${durationMs}ms)`)

    // Enregistrer l'entrée d'historique
    const entry: TrainingHistoryEntry = {
      date: new Date().toISOString(),
      duration_ms: durationMs,
      accuracy: model.accuracy,
      dataset_size: model.trainingSamples,
      n_trees: nTrees,
      max_depth: maxDepth,
      feature_importance: featureImportance,
    }
    const history = await this.loadTrainingHistory()
    history.push(entry)
    this._trainingHistory = history
    await this.saveTrainingHistory()

    return model
  }

  predict(profil: ProfilRisque): { prediction: string; confidence: number } | null {
    if (!this.rfModel) {
      // Fallback: utiliser scoreToLabel
      return {
        prediction: scoreToLabel(profil.score_global),
        confidence: 0.5
      }
    }

    const features = profilToFeatures(profil)
    const prediction = predictRandomForest(this.rfModel, features)
    
    // Estimer confiance basée sur accuracy du modèle
    const confidence = this.rfModel.accuracy

    return { prediction, confidence }
  }

  private trainRandomForestIfNeeded() {
    const now = new Date()
    const lastTrain = this.config.last_auto_train ? new Date(this.config.last_auto_train) : null
    const hoursSinceLastTrain = lastTrain ? (now.getTime() - lastTrain.getTime()) / (1000 * 60 * 60) : Infinity

    if (this.config.auto_train_enabled && hoursSinceLastTrain >= this.config.train_interval_hours) {
      this.trainRandomForest()
      this.config.last_auto_train = now.toISOString()
      this.config.next_auto_train = new Date(now.getTime() + this.config.train_interval_hours * 60 * 60 * 1000).toISOString()
      this.saveConfig()
    }
  }

  // ============================================================
  // GRAPH NETWORK
  // ============================================================

  updateRiskGraph(params: {
    aerodromes: Array<{ id: string; score_risque: number; type: string }>
    domaines: Array<{ code: string; score: number }>
    ecarts: Array<{ id: string; niveau_risque: string; domaine?: string; aerodrome_id: string }>
  }) {
    const domainesAvecScores = DOMAINES_SURVEILLANCE.map(d => ({
      code: d.code,
      score: 70 // Valeur par défaut, à remplacer par calcul réel
    }))

    const graph = createRiskGraph({
      aerodromes: params.aerodromes,
      domaines: domainesAvecScores,
      ecarts: params.ecarts,
      surveillances: []
    })

    this.riskGraph = graph

    // Calculer centralité
    const { calculateCentrality } = require('../risque/graphNetwork')
    const centrality = calculateCentrality(graph)
    
    const topCentralNodes = [...centrality.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, centrality]) => ({ id, centrality }))

    // Sauvegarder métadonnées
    const stored: RiskGraphStored = {
      version: Date.now(),
      computed_at: new Date().toISOString(),
      nodes_count: graph.nodes.size,
      edges_count: graph.edges.length,
      critical_paths_count: 0,
      top_central_nodes: topCentralNodes
    }

    this._cachedGraphModelInfo = stored
    idbStorage.set(KEYS.GRAPH_MODEL, stored)

    console.log(`[Models] Graph Network mis à jour - ${graph.nodes.size} noeuds, ${graph.edges.length} arêtes`)

    return graph
  }

  getRiskPropagation(aerodromeId: string) {
    if (!this.riskGraph) return null

    const { calculateRiskPropagation, recommendActionsFromGraph } = require('../risque/graphNetwork')
    
    const propagation = calculateRiskPropagation(this.riskGraph, `aero_${aerodromeId}`)
    const recommendations = recommendActionsFromGraph(this.riskGraph, aerodromeId)

    return { propagation, recommendations }
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================

  setAutoTrainEnabled(enabled: boolean) {
    this.config.auto_train_enabled = enabled
    this.saveConfig()
  }

  setTrainInterval(hours: number) {
    this.config.train_interval_hours = hours
    this.saveConfig()
  }

  getConfig(): ModelTrainingConfig {
    return { ...this.config }
  }

  getMetrics(): ModelPerformanceMetrics {
    return { ...this.metrics }
  }

  // Les getters sont synchrones — ils lisent depuis l'état mémoire,
  // pas depuis IndexedDB (qui sert uniquement à la persistance)
  getRFModelInfo(): RandomForestModelStored | null {
    return this._cachedRFModelInfo ?? null
  }

  getGraphModelInfo(): RiskGraphStored | null {
    return this._cachedGraphModelInfo ?? null
  }

  // Cache mémoire pour les métadonnées (synchrones pour le store)
  private _cachedRFModelInfo: RandomForestModelStored | null = null
  private _cachedGraphModelInfo: RiskGraphStored | null = null

  getSamplesCount(): number {
    return this.rfSamples.length
  }

  // ============================================================
  // AUTO TRAIN SCHEDULING
  // ============================================================

  private scheduleAutoTrain() {
    if (!this.config.auto_train_enabled) return

    if (this._autoTrainIntervalId !== null) return

    this._autoTrainIntervalId = setInterval(() => {
      this.trainRandomForestIfNeeded()
    }, 60 * 60 * 1000)

    console.log('[Models] Auto-train scheduled (check every hour)')
  }

  stopAutoTrain() {
    if (this._autoTrainIntervalId !== null) {
      clearInterval(this._autoTrainIntervalId)
      this._autoTrainIntervalId = null
    }
  }

  // ============================================================
  // EXPORT/IMPORT
  // ============================================================

  exportModelsData(): string {
    return JSON.stringify({
      config: this.config,
      metrics: this.metrics,
      samples: this.rfSamples.slice(-100), // 100 derniers échantillons
      exported_at: new Date().toISOString()
    }, null, 2)
  }

  importModelsData(json: string) {
    try {
      const data = JSON.parse(json)
      if (data.config) this.config = { ...this.config, ...data.config }
      if (data.metrics) this.metrics = { ...this.metrics, ...data.metrics }
      if (data.samples) {
        this.rfSamples = [...this.rfSamples, ...data.samples]
        this.saveRFSamples()
      }
      this.saveConfig()
      this.saveMetrics()
      console.log('[Models] Données importées avec succès')
    } catch (error) {
      console.error('[Models] Erreur import:', error)
    }
  }

  resetModels() {
    this.rfModel = null
    this.rfSamples = []
    this.riskGraph = null
    this.metrics = {
      random_forest: { accuracy: 0, precision_by_class: {}, confusion_matrix: {}, last_evaluated: null },
      graph_network: { propagation_accuracy: 0, last_evaluated: null }
    }

    this._cachedRFModelInfo = null
    this._cachedGraphModelInfo = null
    idbStorage.remove(KEYS.RF_MODEL)
    idbStorage.remove(KEYS.RF_SAMPLES)
    idbStorage.remove(KEYS.GRAPH_MODEL)
    idbStorage.remove(KEYS.PERFORMANCE_METRICS)

    console.log('[Models] Modèles réinitialisés')
  }
}

// Singleton export
export const advancedModels = new AdvancedModelsManager()