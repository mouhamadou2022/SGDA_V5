// lib/store/advancedModelsSlice.ts
// Zustand slice for AdvancedModelsManager (Random Forest + Graph Network)

import { advancedModels } from './models'
import type { ModelTrainingConfig, ModelPerformanceMetrics, RandomForestModelStored, RiskGraphStored, TrainingHistoryEntry, TrainingStats } from './models'
import type { AppStore, ProfilRisque } from '../store'
import type { PropagationResult, recommendActionsFromGraph } from '../risque/graphNetwork'

type RiskPropagationResult = {
  propagation: PropagationResult;
  recommendations: ReturnType<typeof recommendActionsFromGraph>;
} | null

// ============================================================
// Type pour les données de corrélation ML ↔ Profil de Risque
// ============================================================

export interface MLRiskCorrelationData {
  rfAccuracy: number
  avgRiskScore: number
  riskLevelDistribution: Record<string, number>
  aerodromeCount: number
  alignmentScore: number
  featureAlignment: Array<{ feature: string; importance: number; critere: string }>
  topFeatures: Array<{ name: string; importance: number }>
  convergenceScore: number
  latestTrainingDate: string | null
}

// ============================================================
// Slice
// ============================================================

export interface AdvancedModelsSlice {
  // State
  rfModelInfo: RandomForestModelStored | null
  graphModelInfo: RiskGraphStored | null
  modelTrainingConfig: ModelTrainingConfig
  modelMetrics: ModelPerformanceMetrics
  rfSamplesCount: number
  isTraining: boolean

  // Actions - Random Forest
  trainRandomForestModel: (nTrees?: number, maxDepth?: number) => void
  predictRisk: (profil: ProfilRisque) => { prediction: string; confidence: number } | null
  addTrainingSample: (profil: ProfilRisque, actualLevel?: 'critique' | 'eleve' | 'moyen' | 'faible') => void

  // Actions - Graph Network
  updateRiskGraph: (params: {
    aerodromes: Array<{ id: string; score_risque: number; type: string }>
    domaines: Array<{ code: string; score: number }>
    ecarts: Array<{ id: string; niveau_risque: string; domaine?: string; aerodrome_id: string }>
  }) => void
  getRiskPropagation: (aerodromeId: string) => RiskPropagationResult

  // Actions - Configuration
  setAutoTrainEnabled: (enabled: boolean) => void
  setTrainInterval: (hours: number) => void
  resetAdvancedModels: () => void
  refreshModelInfo: () => void

  // Training History
  getTrainingHistory: () => Promise<TrainingHistoryEntry[]>
  getTrainingStats: () => Promise<TrainingStats>
  exportTrainingHistoryCSV: () => Promise<string>

  // Nouveau : Corrélation ML ↔ Profil de Risque
  getMLRiskCorrelation: () => MLRiskCorrelationData

  // Cache interne pour getMLRiskCorrelation (évite infinite loop React)
  _mlCorrelationCache: MLRiskCorrelationData | null
  _mlCorrelationCacheKey: Record<string, ProfilRisque> | null
  _clearMLCorrelationCache: () => void
}

// C1-C5 labels for alignment mapping
const CRITERE_FEATURE_MAP: Record<string, string> = {
  score_global: 'Score Global',
  c1: 'C1 — Maturité SGS',
  c2: 'C2 — Réactivité PAC',
  c3: 'C3 — Conformité Technique',
  c4: 'C4 — Charge Critique',
  c5: 'C5 — Résilience',
  prediction_3m: 'Prédiction 3m',
  prediction_6m: 'Prédiction 6m',
}

export const createAdvancedModelsSlice = (
  set: (partial: AppStore | Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void,
  get: () => AppStore
): AdvancedModelsSlice => ({
  rfModelInfo: advancedModels.getRFModelInfo(),
  graphModelInfo: advancedModels.getGraphModelInfo(),
  modelTrainingConfig: advancedModels.getConfig(),
  modelMetrics: advancedModels.getMetrics(),
  rfSamplesCount: advancedModels.getSamplesCount(),
  isTraining: false,
  _mlCorrelationCache: null,
  _mlCorrelationCacheKey: null,
  _clearMLCorrelationCache: () => set({ _mlCorrelationCache: null, _mlCorrelationCacheKey: null }),

  trainRandomForestModel: async (nTrees = 10, maxDepth = 4) => {
    set({ isTraining: true })
    try {
      await advancedModels.trainRandomForest(nTrees, maxDepth)
      const info = advancedModels.getRFModelInfo()
      set({
        rfModelInfo: info,
        modelMetrics: advancedModels.getMetrics(),
        rfSamplesCount: advancedModels.getSamplesCount(),
        isTraining: false,
      })
    } catch (error) {
      console.error('[AdvancedModels] Training error:', error)
      set({ isTraining: false })
    }
  },

  predictRisk: (profil) => {
    return advancedModels.predict(profil)
  },

  addTrainingSample: (profil, actualLevel) => {
    advancedModels.addTrainingSample(profil, actualLevel)
    set({ rfSamplesCount: advancedModels.getSamplesCount() })
  },

  updateRiskGraph: (params) => {
    advancedModels.updateRiskGraph(params)
    const info = advancedModels.getGraphModelInfo()
    set({ graphModelInfo: info })
  },

  getRiskPropagation: (aerodromeId) => {
    return advancedModels.getRiskPropagation(aerodromeId)
  },

  setAutoTrainEnabled: (enabled) => {
    advancedModels.setAutoTrainEnabled(enabled)
    set({ modelTrainingConfig: advancedModels.getConfig() })
  },

  setTrainInterval: (hours) => {
    advancedModels.setTrainInterval(hours)
    set({ modelTrainingConfig: advancedModels.getConfig() })
  },

  resetAdvancedModels: () => {
    advancedModels.resetModels()
    set({
      rfModelInfo: null,
      graphModelInfo: null,
      modelMetrics: advancedModels.getMetrics(),
      rfSamplesCount: 0,
    })
  },

  refreshModelInfo: () => {
    set({
      rfModelInfo: advancedModels.getRFModelInfo(),
      graphModelInfo: advancedModels.getGraphModelInfo(),
      modelTrainingConfig: advancedModels.getConfig(),
      modelMetrics: advancedModels.getMetrics(),
      rfSamplesCount: advancedModels.getSamplesCount(),
    })
  },

  getTrainingHistory: async () => {
    return advancedModels.getTrainingHistory()
  },

  getTrainingStats: async () => {
    return advancedModels.getTrainingStats()
  },

  exportTrainingHistoryCSV: async () => {
    return advancedModels.exportTrainingHistoryCSV()
  },

  getMLRiskCorrelation: () => {
    const state = get()
    const profils = state.profilsRisque as Record<string, ProfilRisque> | undefined
    // Retourner le cache si les entrées n'ont pas changé (même référence profilsRisque)
    if (profils === get()._mlCorrelationCacheKey && get()._mlCorrelationCache) {
      return get()._mlCorrelationCache!
    }
    const rfInfo = advancedModels.getRFModelInfo()
    const metrics = advancedModels.getMetrics()
    const samplesCount = advancedModels.getSamplesCount()

    const rfAccuracy = metrics?.random_forest?.accuracy ?? (rfInfo?.accuracy ?? 0)
    const aerodromeCount = profils ? Object.keys(profils).length : 0

    // Niveau de risque moyen
    const scores = profils ? Object.values(profils).map(p => p.score_global) : []
    const avgRiskScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0

    // Distribution par niveau
    const riskLevelDistribution: Record<string, number> = { critique: 0, eleve: 0, moyen: 0, faible: 0 }
    if (profils) {
      Object.values(profils).forEach(p => {
        if (p.niveau in riskLevelDistribution) riskLevelDistribution[p.niveau]++
      })
    }

    // Alignment entre feature importance et C1-C5
    const featureImportance = rfInfo?.feature_importance ?? {}
    const featureAlignment: Array<{ feature: string; importance: number; critere: string }> = []
    let alignmentSum = 0
    let alignmentCount = 0

    Object.entries(featureImportance).forEach(([feature, importance]) => {
      const critere = CRITERE_FEATURE_MAP[feature] || feature.replace(/_/g, ' ')
      if (feature in CRITERE_FEATURE_MAP && ['c1','c2','c3','c4','c5'].includes(feature)) {
        // Higher alignment when feature importance matches actual risk contribution
        const riskValue = profils
          ? Object.values(profils).reduce((sum, p) => sum + ((p as unknown as Record<string, number>)[feature] ?? 0), 0) /
            Math.max(1, Object.keys(profils).length)
          : 50
        alignmentSum += importance * (riskValue / 100)
        alignmentCount++
      }
      featureAlignment.push({ feature, importance, critere })
    })

    const alignmentScore = alignmentCount > 0
      ? Math.round(alignmentSum / alignmentCount * 100)
      : 0

    // Convergence score: correlation entre confiance ML et niveau de risque
    const convergenceScore = (rfAccuracy > 0 && scores.length > 0)
      ? Math.round((rfAccuracy * 100 + (scores.length > 0 ? 100 - Math.abs(avgRiskScore - 50) / 50 * 100 : 0)) / 2)
      : 0

    // Top features
    const topFeatures = Object.entries(featureImportance)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, importance]) => ({ name, importance }))

    const result: MLRiskCorrelationData = {
      rfAccuracy: rfInfo ? rfInfo.accuracy : 0,
      avgRiskScore,
      riskLevelDistribution,
      aerodromeCount,
      alignmentScore,
      featureAlignment,
      topFeatures,
      convergenceScore,
      latestTrainingDate: rfInfo?.trained_at ?? null,
    }
    // Mettre en cache
    get()._mlCorrelationCache = result
    get()._mlCorrelationCacheKey = profils ?? null
    return result
  },
})
