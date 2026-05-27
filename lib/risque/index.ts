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

// Fonctions C1–C5 du moteur principal (réexport depuis lib/risque.ts)
export { calculateC1, calculateGlobalScore } from '../risque'