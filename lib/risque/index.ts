// lib/risque/index.ts
// Point d'entrée unique pour tous les modules risque
// Exporte toutes les fonctions utilitaires
// 0 style inline, 0 fetch direct

// Types
export * from './types'

// Matrice OACI 5×5
export {
  computeProbabilityLevel,
  computeGravityLevel,
  getMatrixCell,
  getRiskLevelFromCell,
  computeConfidenceInterval,
  computeDomainRisk,
  computeFullMatrix,
  getRiskLevelClass,
  getRiskLevelColor,
  getRiskLevelFromCell5,
} from './matrix'

// Modèle bayésien
export {
  computePriorProbability,
  computeMarginalProbability,
  computePosteriorProbability,
  computeCombinedPosterior,
  computeCredibleInterval,
  detectBlackSwan,
  computeBayesianPrediction,
  updatePriorAfterIncident,
  computeConfidenceLevel,
  getConfidenceClass,
} from './bayesian'

// Facteurs déclencheurs
export {
  detectEcartCritiqueTrigger,
  detectDelaiExpireTrigger,
  detectIncidentTrigger,
  detectChangementExploitantTrigger,
  detectSaisonPluiesTrigger,
  detectPostInspectionTrigger,
  detectAllTriggers,
  computeTriggersImpact,
  getActiveTriggersDescription,
  getTriggersImpactClass,
} from './triggers'

// Facteurs aggravants
export {
  detectNcRecurrente,
  detectAbsenceBarriere,
  detectSurcharge,
  detectC1Bas,
  detectRotationPersonnel,
  detectAbsenceFormation,
  detectHistoriqueIncidents,
  detectAllAggravators,
  computeAggravatorsMultiplier,
  getActiveAggravatorsDescription,
  getAggravatorsMultiplierClass,
} from './aggravators'

// Volatilité
export {
  computeMean,
  computeStandardDeviation,
  computeRelativeVolatility,
  getStabilityLevel,
  computeDeviationFromNational,
  computeVolatilityIndicators,
  computeRollingVolatility,
  isVolatilityAbnormal,
  getStabilityClass,
  getStabilityIcon,
} from './volatility'
export type { StabiliteNiveau } from './volatility'

// Tendances
export {
  linearRegression,
  getTrendFromSlope,
  computeTrend,
  computeLongTermTrend,
  computeShortTermTrend,
  detectInflexions,
  computeMovingAverage,
  compareTrends,
  getTrendClass,
  getTrendIcon,
  getTrendDescription,
} from './trends'
export type { TrendAnalysis, InflexionPoint } from './trends'

// Scénarios
export {
  buildRealisticScenario,
  buildOptimisticScenario,
  buildPessimisticScenario,
  buildCatastrophicScenario,
  generateAllScenarios,
  getScenarioClass,
  getScenarioIcon,
} from './scenarios'

// Calibration
export {
  computeMAE,
  computeBias,
  computeCoverage,
  computeModelPerformance,
  isCorrectionNeeded,
  computeBiasCorrection,
  generateCorrection,
  computeLearningFactor,
  adjustWeights,
  getPerformanceClass,
} from './calibration'

// Naive Bayes C5 (explicabilité causale)
export {
  discretizeC5,
  discretizeCritere,
  learnNaiveBayesC5,
  inferNaiveBayesC5,
  getC5Label,
  getC5Color,
} from './naiveBayesC5'
export type {
  NiveauC5,
  NiveauCritere,
  NaiveBayesC5Model,
  BayesExplainResult,
} from './naiveBayesC5'

// Fréquence
export {
  computeBaseFrequency,
  applyMultipliers,
  computeMultipliers,
  computeFinalFrequency,
  suggestMissionType,
  getFrequencyClass,
  getFrequencyLabel,
} from './frequency'

// Prévisions saisonnières (Prophet-like)
export {
  fitSeasonalModel,
  predict,
  evaluateModel,
} from './seasonalForecast'
export type {
  ForecastPoint,
  SeasonalModel,
} from './seasonalForecast'

// Matrice risque ICAO dynamique (Doc 9859)
export {
  computeICaoMatrix,
  computeGlobalICaoRisk,
  getICaoLabels,
} from './icaoMatrix'
export type {
  ICaoCell,
  NiveauRisqueICAO,
  ProbabiliteCategorie,
  SeveriteCategorie,
  EvenementPourMatrice,
} from './icaoMatrix'

// Fonctions C1–C5 du moteur principal (réexport depuis lib/risque.ts)
export { calculateC1, calculateGlobalScore } from '../risque'

// Classificateur texte pour écarts
export { classifyEcartTexte, suggestGraviteFromTexte, classifySousTypeCOP } from './ecartClassifier'
export type { SousTypeCOP } from './ecartClassifier'

// Réseau bayésien causal (bow-tie + organisationnel)
export {
  construireReseauDepuisBowTie,
  inferer,
  computeBayesianNetworkRisk,
  smoothCPT,
  discretiserChargeTravail,
  discretiserFormationAdequation,
  discretiserSupervisionQuality,
  calculerEvidencesOrganisationnelles,
  buildEvidencesFromProfil,
  computeBarrierEfficacite,
  getConfianceLabel,
  getConfianceDot,
} from './bayesianNetwork'
export type {
  BayesNode,
  CPT,
  BayesianNetworkResult,
  TypeNoeud,
  EvidOrgParams,
} from './bayesianNetwork'

// Évaluateur de modèles (accuracy réelle)
export {
  evaluateModel as evaluateClassifier,
  trainAndEvaluate, saveEvaluationHistory, getEvaluationHistory, getAccuracyTrend, getConfidenceLevel,
} from './modelEvaluator'
export type { ModelEvaluation, EvaluationHistoryPoint } from './modelEvaluator'