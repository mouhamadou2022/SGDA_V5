// lib/store/riskAnalyticsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Analytics risque (historiques, prédictions, Hawkes, bandit)
// extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore, Ecart } from '../store'
import type { ScoreHistoryPoint } from '../risque/types'
import { toFiniteNumber } from '../utils'
import { risqueUtils } from '../risque'
import { toast } from '../toast'

export interface PredictionHistoryRecord {
  id: string
  aerodrome_id: string
  predicted_at: string
  predicted_score_3m: number
  predicted_score_6m: number
  actual_score_3m: number | null
  actual_score_6m: number | null
  error_3m: number | null
  error_6m: number | null
}

export interface ActionOutcomeRecord {
  id: string
  aerodrome_id: string
  action_type: 'surveillance' | 'recommandation' | 'ecart_treatment' | 'formation'
  action_detail: string
  recommended_at: string
  chosen_at: string
  score_before: number
  score_after: number
  effectiveness: number
  cost_days: number
  was_followed: boolean
}

export interface ChangePointRecord {
  id: string
  aerodrome_id: string
  detected_at: string
  date_changement: string
  score_before: number
  score_after: number
  magnitude: number
  direction: 'amelioration' | 'degradation'
  probable_cause: string | null
  confirmed: boolean
}

export interface VelocitySnapshotRecord {
  aerodrome_id: string
  captured_at: string
  vitesse: number
  acceleration: number
  volatilite: number
  temps_avant_seuil_critique: number | null
  niveau_vigilance: string
}

export interface StressHistoryRecord {
  aerodrome_id: string
  captured_at: string
  stress_score: number
  niveau_stress: string
  facteurs: string[]
}

export interface ProactiveAlertRecord {
  id: string
  aerodrome_id: string
  created_at: string
  niveau_urgence: 'info' | 'vigilance' | 'alerte' | 'critique'
  probabilite_degradation_3m: number
  probabilite_seuil30_3m: number
  message_court: string
  message_long: string
  action_suggerer: string
  acknowledged_at: string | null
  resolved_at: string | null
}

export interface ModelPerformanceRecord {
  model_name: string
  last_calibrated: string
  mae_3m: number | null
  mae_6m: number | null
  bias_3m: number | null
  bias_6m: number | null
  coverage_95: number | null
  observations_count: number
}

export interface RiskAnalyticsSlice {
  historiqueScores: Record<string, ScoreHistoryPoint[]>
  predictionHistorique: PredictionHistoryRecord[]
  actionOutcomes: ActionOutcomeRecord[]
  changePoints: ChangePointRecord[]
  velocitySnapshots: VelocitySnapshotRecord[]
  stressHistory: StressHistoryRecord[]
  proactiveAlerts: ProactiveAlertRecord[]
  modelPerformances: ModelPerformanceRecord[]
  
  addScoreHistoryPoint: (aerodromeId: string, point: ScoreHistoryPoint) => void
  addPredictionHistory: (prediction: PredictionHistoryRecord) => void
  addActionOutcome: (outcome: ActionOutcomeRecord) => void
  addChangePoint: (changePoint: ChangePointRecord) => void
  addVelocitySnapshot: (snapshot: VelocitySnapshotRecord) => void
  addStressHistoryPoint: (point: StressHistoryRecord) => void
  addProactiveAlert: (alert: ProactiveAlertRecord) => void
  acknowledgeProactiveAlert: (alertId: string) => void
  resolveAlert: (alertId: string) => void
  updateModelPerformance: (performance: ModelPerformanceRecord) => void
  getHistoricalScoresForAerodrome: (aerodromeId: string) => ScoreHistoryPoint[]
  getPredictionsForAerodrome: (aerodromeId: string) => PredictionHistoryRecord[]
  getActionsForAerodrome: (aerodromeId: string) => ActionOutcomeRecord[]
  computeEffectivenessScore: (aerodromeId: string) => number
  computeFullRiskProfile: (aerodromeId: string) => Promise<void>
   getHawkesRiskForAerodrome: (aerodromeId: string) => { riskNext30Days: number; currentIntensity: number }
    getRecurrentPatterns: (aerodromeId: string) => import('../risque').ChangePoint[]
   getBanditRecommendation: (context: Record<string, unknown>) => unknown
   updateBanditReward: (context: Record<string, unknown>, actionId: string, reward: number) => void
   getTransferPredictions: (aerodromeId: string) => Map<string, unknown>
}

export const createRiskAnalyticsSlice: StateCreator<AppStore, [], [], RiskAnalyticsSlice> = (set, get) => ({
      // ============================================================
      historiqueScores: {},
      predictionHistorique: [],
      actionOutcomes: [],
      changePoints: [],
      velocitySnapshots: [],
      stressHistory: [],
      proactiveAlerts: [],
      modelPerformances: [],

      addScoreHistoryPoint: (aerodromeId, point) => set((state) => {
        const existing = state.historiqueScores?.[aerodromeId] || []
        const exists = existing.some(p => p.date === point.date)
        if (exists) return state
        const pointSain: ScoreHistoryPoint = {
          ...point,
          score: toFiniteNumber(point.score, 50, 0, 100),
          c1: point.c1 != null ? toFiniteNumber(point.c1, 50, 0, 100) : undefined,
          c2: point.c2 != null ? toFiniteNumber(point.c2, 50, 0, 100) : undefined,
          c3: point.c3 != null ? toFiniteNumber(point.c3, 50, 0, 100) : undefined,
          c4: point.c4 != null ? toFiniteNumber(point.c4, 50, 0, 100) : undefined,
          c5: point.c5 != null ? toFiniteNumber(point.c5, 50, 0, 100) : undefined,
        }
        return {
          historiqueScores: {
            ...state.historiqueScores,
            [aerodromeId]: [...existing, pointSain].sort((a, b) => 
              new Date(a.date).getTime() - new Date(b.date).getTime()
            )
          }
        }
      }),

      addPredictionHistory: (prediction) => set((state) => ({
        predictionHistorique: [...state.predictionHistorique, prediction]
      })),

      addActionOutcome: (outcome) => set((state) => ({
        actionOutcomes: [...state.actionOutcomes, outcome]
      })),

      addChangePoint: (changePoint) => set((state) => ({
        changePoints: [...state.changePoints, changePoint]
      })),

      addVelocitySnapshot: (snapshot) => set((state) => ({
        velocitySnapshots: [...state.velocitySnapshots, snapshot]
      })),

      addStressHistoryPoint: (point) => set((state) => ({
        stressHistory: [...state.stressHistory, point]
      })),

      addProactiveAlert: (alert) => set((state) => ({
        proactiveAlerts: [...state.proactiveAlerts, alert]
      })),

      acknowledgeProactiveAlert: (alertId) => set((state) => ({
        proactiveAlerts: state.proactiveAlerts.map(a => 
          a.id === alertId ? { ...a, acknowledged_at: new Date().toISOString() } : a
        )
      })),

      resolveAlert: (alertId) => set((state) => ({
        proactiveAlerts: state.proactiveAlerts.map(a => 
          a.id === alertId ? { ...a, resolved_at: new Date().toISOString() } : a
        )
      })),

      updateModelPerformance: (performance) => set((state) => {
        const existingIndex = state.modelPerformances.findIndex(m => m.model_name === performance.model_name)
        if (existingIndex >= 0) {
          const updated = [...state.modelPerformances]
          updated[existingIndex] = performance
          return { modelPerformances: updated }
        }
        return { modelPerformances: [...state.modelPerformances, performance] }
      }),

      getHistoricalScoresForAerodrome: (aerodromeId) => {
        return get().historiqueScores?.[aerodromeId] || []
      },

      getPredictionsForAerodrome: (aerodromeId) => {
        return get().predictionHistorique.filter(p => p.aerodrome_id === aerodromeId)
      },

      getActionsForAerodrome: (aerodromeId) => {
        return get().actionOutcomes.filter(a => a.aerodrome_id === aerodromeId)
      },

      computeEffectivenessScore: (aerodromeId) => {
        const actions = get().actionOutcomes.filter(a => a.aerodrome_id === aerodromeId && a.was_followed)
        if (actions.length === 0) return 50
        const avgEffectiveness = actions.reduce((sum, a) => sum + a.effectiveness, 0) / actions.length
        return Math.round(avgEffectiveness)
      },

      computeFullRiskProfile: async (aerodromeId) => {
        try {
          const state = get()
          const profil = state.profilsRisque?.[aerodromeId]
          if (!profil) return

          const historique = state.historiqueScores?.[aerodromeId] || []
          const ecartsAerodrome = state.ecarts.filter(e => e.aerodrome_id === aerodromeId)
          
          // Importer les modèles avancés
          const {
            computeVelocityMetrics,
            computeHawkesContagion,
            computeSystemStress,
            computeProactiveAlert,
            detectChangePoints
          } = await import('../risque')
          
          // Calculer les métriques avancées
          const velocityMetrics = computeVelocityMetrics(historique.map(h => ({ date: h.date, score: h.score })))
          const hawkes = computeHawkesContagion(ecartsAerodrome.map(e => ({ createdAt: e.created_at, niveau: e.niveau_risque })))
          const stress = computeSystemStress(profil, ecartsAerodrome, velocityMetrics)
          const proactiveAlert = computeProactiveAlert(profil, historique.map(h => ({ date: h.date, score: h.score })), hawkes)
          const changePoints = detectChangePoints(historique.map(h => ({ date: h.date, score: h.score })))
        
        // Stocker les snapshots
        state.addVelocitySnapshot({
          aerodrome_id: aerodromeId,
          captured_at: new Date().toISOString(),
          vitesse: velocityMetrics.vitesse,
          acceleration: velocityMetrics.acceleration,
          volatilite: velocityMetrics.volatilite,
          temps_avant_seuil_critique: velocityMetrics.tempsAvantSeuilCritique,
          niveau_vigilance: velocityMetrics.niveauVigilance
        })
        
        state.addStressHistoryPoint({
          aerodrome_id: aerodromeId,
          captured_at: new Date().toISOString(),
          stress_score: stress.score,
          niveau_stress: stress.niveauStress,
          facteurs: stress.facteursContributeurs
        })
        
        // Créer alerte proactive si nécessaire
        if (proactiveAlert.niveauUrgence !== 'info') {
          state.addProactiveAlert({
            id: crypto.randomUUID(),
            aerodrome_id: aerodromeId,
            created_at: new Date().toISOString(),
            niveau_urgence: proactiveAlert.niveauUrgence,
            probabilite_degradation_3m: proactiveAlert.probabiliteDegradation3m,
            probabilite_seuil30_3m: proactiveAlert.probabiliteSeuil30_3m,
            message_court: proactiveAlert.messageCourt,
            message_long: proactiveAlert.messageLong,
            action_suggerer: proactiveAlert.actionSuggerer,
            acknowledged_at: null,
            resolved_at: null
          })
        }
        
        // Ajouter les points de changement
        for (const cp of changePoints) {
          state.addChangePoint({
            id: crypto.randomUUID(),
            aerodrome_id: aerodromeId,
            detected_at: new Date().toISOString(),
            date_changement: cp.date,
            score_before: cp.scoreBefore,
            score_after: cp.scoreAfter,
            magnitude: cp.magnitude,
            direction: cp.direction,
            probable_cause: cp.probableCause || null,
            confirmed: false
          })
        }
        
        // Mettre à jour le profil avec les métriques avancées
        const profilAvance = {
          ...profil,
          velocity_metrics: {
            vitesse: velocityMetrics.vitesse,
            acceleration: velocityMetrics.acceleration,
            volatilite: velocityMetrics.volatilite,
            temps_avant_seuil_critique: velocityMetrics.tempsAvantSeuilCritique,
            niveau_vigilance: velocityMetrics.niveauVigilance
          },
          system_stress: {
            score: stress.score,
            niveau_stress: stress.niveauStress,
            facteurs_contributeurs: stress.facteursContributeurs,
            recommandation: stress.recommandationAction,
            stressIndicators: stress.stressIndicators
          },
          proactive_alert: {
            niveau_urgence: proactiveAlert.niveauUrgence,
            probabilite_degradation_3m: proactiveAlert.probabiliteDegradation3m,
            probabilite_seuil30_3m: proactiveAlert.probabiliteSeuil30_3m,
            probabilite_seuil30_6m: proactiveAlert.probabiliteSeuil30_6m,
            message_court: proactiveAlert.messageCourt,
            message_long: proactiveAlert.messageLong,
            action_suggerer: proactiveAlert.actionSuggerer,
            delai_estime_jours: proactiveAlert.delaiEstimeJours
          },
          hawkes_intensity: hawkes.currentIntensity,
          effectiveness_score: state.computeEffectivenessScore(aerodromeId),
          last_change_point: changePoints.length > 0 ? changePoints[0].date : profil.last_change_point
        }
        
        state.setProfilRisque(aerodromeId, profilAvance)
      } catch (error) {
        console.error('Erreur computeFullRiskProfile:', error)
        toast('error', 'Erreur calcul profil risque', `Aérodrome ${aerodromeId}`)
      }
      },

      getHawkesRiskForAerodrome: (aerodromeId) => {
        try {
          const ecartsAero = get().ecarts.filter((e: Ecart) => e.aerodrome_id === aerodromeId);
          const hawkesInput = ecartsAero.map((e: Ecart) => ({ createdAt: e.created_at, niveau: e.niveau_risque }));
          return risqueUtils.computeHawkesContagion(hawkesInput);
        }
        catch (e) { return { riskNext30Days: 50, currentIntensity: 0.5 }; }
      },
      getRecurrentPatterns: (aerodromeId) => {
        try {
          const ecartsAero = get().ecarts.filter(e => e.aerodrome_id === aerodromeId);
          return risqueUtils.detectChangePoints(ecartsAero.map(e => ({ date: e.date_detection || e.created_at, score: e.niveau_risque === 'critique' ? 90 : e.niveau_risque === 'eleve' ? 70 : e.niveau_risque === 'moyen' ? 50 : 30 })));
        } catch (e) { return []; }
      },
      getBanditRecommendation: (context) => {
        try { return risqueUtils.computeActionEffectiveness(context as unknown as { type: string; improvement: number; costDays: number }[]); }
        catch (e) { return null; }
      },
      updateBanditReward: (_context, _actionId, _reward) => {},
      getTransferPredictions: (_aerodromeId) => new Map(),
})
