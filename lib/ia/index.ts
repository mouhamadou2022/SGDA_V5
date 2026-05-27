// lib/ia/index.ts
// Point d'entrée unique pour tous les agents IA
// Export orchestrateurs, agents, modèles et utilitaires
// 0 API externe, 0 coût, 100% local
// Toutes les données passent par le store

// ============================================================
// ORCHESTRATEUR
// ============================================================
export { AgentOrchestrator, orchestrator } from './orchestrator'

// ============================================================
// AGENTS
// ============================================================
export { RiskAgent, riskAgent } from './agents/riskAgent'
export { ChecklistAgent, checklistAgent } from './agents/checklistAgent'
export { EcartAgent, ecartAgent } from './agents/ecartAgent'
export { ReportAgent, reportAgent } from './agents/reportAgent'
export { CertificationAgent, certificationAgent } from './agents/certificationAgent'
export { AssistantAgent, assistantAgent } from './agents/assistantAgent'
export { LearningAgent, learningAgent } from './agents/learningAgent'

// ============================================================
// MODÈLES MATHÉMATIQUES AVANCÉS
// ============================================================
export { HawkesModel, hawkesModel } from './models/hawkes'
export { CUSUMModel, cusumModel } from './models/cusum'
export { BayesianDynamicModel, bayesianDynamicModel } from './models/bayesianDynamic'
export { QuantileModel, quantileModel } from './models/quantile'
export { LSTMModel, lstmModel } from './models/lstm'
export { XGBoostModel, RiskLevelClassifier, PACEvaluator, riskClassifier, pacEvaluator } from './models/xgboost'
export { RandomForestModel, ChecklistResultPredictor, AnomalyDetector, checklistPredictor, anomalyDetector } from './models/randomForest'
export { BowTieModel, bowTieModel } from './models/bowtie'
export { ConformalModel, conformalModel } from './models/conformal'
export { TemporalModel, temporalModel } from './models/temporal'
export { GARCHModel, garchModel } from './models/garch'
export { EnsembleModel, ensembleModel } from './models/ensemble'

// ============================================================
// ENTRAÎNEMENT ET FEEDBACK
// ============================================================
export { ModelCalibrator, calibrator } from './training/calibrator'
export { FeedbackManager, feedbackManager } from './training/feedback'

// ============================================================
// TYPES PARTAGÉS
// ============================================================
// Types depuis les modules sources
export type { Task, TaskResult, TaskType, AgentId } from './orchestrator'
export type { ModelMetrics, TrainingReport, Feedback, CalibrationRequest, CalibrationParams } from './agents/learningAgent'

// ============================================================
// CONSTANTES
// ============================================================
export const IA_VERSION = '1.0.0'
export const IA_MODELS_VERSION = '1.0.0'

// ============================================================
// FONCTIONS DE REQUÊTE (NOUVEAU)
// ============================================================
import { useAppStore } from '../store'

/**
 * Pose une question à l'agent de risque
 */
export async function askRiskAgent(question: string, aerodromeId?: string): Promise<string> {
  const store = useAppStore.getState()
  const profil = aerodromeId ? store.profilsRisque[aerodromeId] : null
  
  if (!profil) return "Aucun profil de risque trouvé pour cet aérodrome."
  
  // Simuler une analyse
  const score = profil.c1 || 50
  const niveau = score >= 80 ? 'critique' : score >= 60 ? 'élevé' : score >= 30 ? 'moyen' : 'faible'
  
  return `Analyse de risque (Score: ${score}/100, Niveau: ${niveau}). ${question}`
}

/**
 * Pose une question à l'agent de checklist
 */
export async function askChecklistAgent(question: string, surveillanceId?: string): Promise<string> {
  const store = useAppStore.getState()
  const surveillance = store.surveillances.find(s => s.id === surveillanceId)
  
  if (!surveillance) return "Surveillance non trouvée."
  
  return `Analyse de checklist pour la surveillance ${surveillance.id}. ${question}`
}

/**
 * Pose une question à l'agent d'écarts
 */
export async function askEcartAgent(question: string, ecartId?: string): Promise<string> {
  const store = useAppStore.getState()
  const ecart = store.ecarts.find(e => e.id === ecartId)
  
  if (!ecart) return "Écart non trouvé."
  
  return `Analyse d'écart ${ecart.reference}. ${question}`
}

// ============================================================
// INITIALISATION (utilise le store)
// ============================================================
import { orchestrator } from './orchestrator'
import { riskAgent } from './agents/riskAgent'
import { checklistAgent } from './agents/checklistAgent'
import { ecartAgent } from './agents/ecartAgent'
import { reportAgent } from './agents/reportAgent'
import { certificationAgent } from './agents/certificationAgent'
import { assistantAgent } from './agents/assistantAgent'
import { learningAgent } from './agents/learningAgent'

export async function initIA(): Promise<void> {
  console.log('[IA] Initialisation des agents...')
  
  // Récupérer les données du store
  const store = useAppStore.getState()
  const aerodromes = store.aerodromes
  const profilsRisque = store.profilsRisque
  const ecarts = store.ecarts
  const surveillances = store.surveillances
  const checklistMemoryRecords = store.checklistMemoryRecords
  
  // Initialiser l'orchestrateur
  await orchestrator.init()
  
  // Initialiser tous les agents
  await Promise.all([
    riskAgent.init({ profilsRisque, ecarts, surveillances }),
    checklistAgent.init({ checklistMemoryRecords, surveillances }),
    ecartAgent.init({ ecarts, surveillances }),
    reportAgent.init({ surveillances, ecarts }),
    certificationAgent.init({}),
    assistantAgent.init({}),
    learningAgent.init({}),
  ])
  
  console.log('[IA] Tous les agents sont prêts')
}

export async function shutdownIA(): Promise<void> {
  console.log('[IA] Arrêt des agents...')
  await orchestrator.shutdown()
}