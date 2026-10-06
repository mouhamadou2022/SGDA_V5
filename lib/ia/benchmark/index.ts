// lib/ia/benchmark/index.ts
// Point d'entrée du module benchmark : comparaison RF / XGBoost / LightGBM /
// CatBoost / MLP sur accuracy, precision, recall, F1, ROC-AUC et temps,
// avec sélection persistée du modèle qui pilote les prédictions.

export * from './types'
export * from './metrics'
export * from './config'
export * from './adapters'
export * from './models/lightgbm'
export * from './models/catboost'
export * from './models/mlp'
export {
  creerModelesBenchmark,
  runBenchmark,
  persisterSelection,
  lireSelection,
  lireDernierOutcome,
  toBenchmarkSamples,
  MODELE_LABELS,
  MIN_BENCHMARK_SAMPLES,
  MIN_AUTO_SELECT_SAMPLES,
  MIN_TEST_SIZE_FOR_AUTO_SELECT,
  isSelectionReliable,
  selectionBlockedMessage,
} from './benchmarkEngine'
