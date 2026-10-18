// lib/ia/index.ts

// ============================================================
// MODÈLES MATHÉMATIQUES AVANCÉS
// ============================================================
export { BayesianDynamicModel, bayesianDynamicModel } from './models/bayesianDynamic'
export { LSTMModel, lstmModel } from './models/lstm'
export { XGBoostModel, RiskLevelClassifier, PACEvaluator, riskClassifier, pacEvaluator } from './models/xgboost'
export { RandomForestModel, ChecklistResultPredictor, AnomalyDetector, checklistPredictor, anomalyDetector } from './models/randomForest'
export { EnsembleModel, ensembleModel } from './models/ensemble'

// ============================================================
// BENCHMARK ML — RF / XGBoost / LightGBM / CatBoost / MLP
// ============================================================
export * from './benchmark/index'

// ============================================================
// ORCHESTRATEUR MULTI-AGENTS AERORISQ
// ============================================================
export * from './orchestrateur/index'

// ============================================================
// JUMEAU NUMÉRIQUE INTERACTIF
// ============================================================
export * from './digitalTwin'

// ============================================================
// EXPLICABILITÉ SHAP-LIKE
// ============================================================
export * from './shapExplainer'

// ============================================================
// GRAPHE UNIFIÉ OACI → RISQUES → ÉCARTS
// ============================================================
export * from './oaciGraph'

// ============================================================
// SIMULATION DE SURVEILLANCE
// ============================================================
export * from './simulationSurveillance'

// ============================================================
// ENTRAÎNEMENT ET FEEDBACK
// ============================================================
export { ModelCalibrator, calibrator } from './training/calibrator'
export { FeedbackManager, feedbackManager } from './training/feedback'

// ============================================================
// ÉVALUATION PROBABILISTE (Brier, log-loss, ECE, couverture, température)
// ============================================================
export * from './models/evaluation'

// ============================================================
// PROVENANCE (learned / heuristic / fallback / insufficient_data)
// ============================================================
export * from './models/provenance'

// ============================================================
// CONSTANTES
// ============================================================
export const IA_VERSION = '2.0.0'
export const IA_MODELS_VERSION = '2.0.0'