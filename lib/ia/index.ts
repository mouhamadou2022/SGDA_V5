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
// ENTRAÎNEMENT ET FEEDBACK
// ============================================================
export { ModelCalibrator, calibrator } from './training/calibrator'
export { FeedbackManager, feedbackManager } from './training/feedback'

// ============================================================
// CONSTANTES
// ============================================================
export const IA_VERSION = '2.0.0'
export const IA_MODELS_VERSION = '2.0.0'