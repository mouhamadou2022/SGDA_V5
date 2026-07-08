// lib/risque/randomForest.ts
// Délègue à lib/ia/models/randomForest.ts pour l'implémentation réelle.
// Ce fichier conserve l'API fonctionnelle originale pour backward compatibility.
// Les fonctions uniques au domaine risque (profilToFeatures, scoreToLabel) sont ici.

import {
  RandomForestModel as ClassRF,
  TrainingSample as BTrainingSample,
} from '@/lib/ia/models/randomForest'

// ============================================================
// TYPES (backward compat — mêmes noms qu'avant)
// ============================================================

export interface DecisionTree {
  feature: string
  threshold: number
  left: DecisionTree | number
  right: DecisionTree | number
}

export interface RandomForestModel {
  trees: DecisionTree[]
  featureImportance: Map<string, number>
  accuracy: number
  trainingSamples: number
}

export interface TrainingSample {
  features: { [key: string]: number }
  label: 'critique' | 'eleve' | 'moyen' | 'faible'
}

// ============================================================
// CONSTANTES DE CONVERSION
// ============================================================

const LABEL_TO_IDX: Record<string, number> = { critique: 0, eleve: 1, moyen: 2, faible: 3, tres_faible: 3 }
const IDX_TO_LABEL: Record<number, string> = { 0: 'critique', 1: 'eleve', 2: 'moyen', 3: 'faible' }

// FEATURES_ORDER est dérivé de profilToFeatures() pour garantir la synchronisation.
// Si une feature est ajoutée/retirée de profilToFeatures, la déduction est automatique.
let FEATURES_ORDER: string[] = []
function ensureFeaturesOrder() {
  if (FEATURES_ORDER.length > 0) return
  // Appel initial avec des valeurs factices pour extraire les clés
  const keys = Object.keys(profilToFeatures({
    score_global: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0,
    tendance: 'stable', prediction_3m: 0, prediction_6m: 0,
  }))
  FEATURES_ORDER = keys
  if (process.env.NODE_ENV === 'development') {
    console.log(`[randomForest] ${FEATURES_ORDER.length} features détectées:`, FEATURES_ORDER.join(', '))
  }
}

function featuresToArray(f: Record<string, number>): number[] {
  ensureFeaturesOrder()
  return FEATURES_ORDER.map(k => f[k] ?? 0)
}

function toClassSamples(samples: TrainingSample[]): BTrainingSample[] {
  return samples.map(s => ({ features: featuresToArray(s.features), label: String(LABEL_TO_IDX[s.label] ?? 2) }))
}

// Vérification à l'init : planter proprement plutôt que de diverger silencieusement
ensureFeaturesOrder()

// Cache WeakMap pour lier un modèle d'API A à son instance ClassRF (version B)
const classRFMap = new WeakMap<RandomForestModel, ClassRF>()

// ============================================================
// CŒUR : DÉLÉGATION VERS LA VERSION B (lib/ia/models/)
// ============================================================

export async function trainRandomForest(
  samples: TrainingSample[],
  nTrees: number = 10,
  maxDepth: number = 4,
  featureSubsetSize: number = 3,
): Promise<RandomForestModel> {
  if (samples.length === 0) {
    return { trees: [], featureImportance: new Map(), accuracy: 0, trainingSamples: 0 }
  }

  const classSamples = toClassSamples(samples)
  const rf = new ClassRF({
    nTrees: Math.max(1, nTrees),
    maxDepth: Math.max(1, maxDepth),
    minSamplesSplit: 2,
    minSamplesLeaf: 1,
    maxFeatures: Math.max(1, featureSubsetSize),
    bootstrap: true,
    sampleSize: 1.0,
  })

  const result = await rf.train(classSamples, { verbose: false })

  // Reconstruire la feature importance au format Map<string, number>
  const fiArray = (rf as any)['featureImportance'] as number[] | undefined
  const featureImportance = new Map<string, number>()
  if (fiArray) {
    FEATURES_ORDER.forEach((name, i) => {
      if (i < fiArray.length) featureImportance.set(name, fiArray[i])
    })
  }

  const model: RandomForestModel = {
    trees: [],
    featureImportance,
    accuracy: result.accuracy,
    trainingSamples: samples.length,
  }

  // Conserver la référence ClassRF pour les prédictions futures
  classRFMap.set(model, rf)

  return model
}

export function predictRandomForest(
  model: RandomForestModel,
  features: { [key: string]: number },
): 'critique' | 'eleve' | 'moyen' | 'faible' {
  // Priorité : utiliser l'instance ClassRF si disponible
  const rf = classRFMap.get(model)
  if (rf) {
    try {
      const arr = featuresToArray(features)
      const pred = rf.predict(arr)
      // pred.prediction est déjà le label final traité par la version B
      // (classMapping interne de la classe a déjà fait l'aller-retour index ↔ label)
      const labelStr = pred.prediction as string
      return (labelStr as 'critique' | 'eleve' | 'moyen' | 'faible') || 'moyen'
    } catch {
      return scoreToLabel(features.score_global ?? 50)
    }
  }

  // Fallback déterministe
  if (model.trees.length === 0 && model.trainingSamples === 0) {
    return 'moyen'
  }
  const score = features.score_global ?? 50
  return scoreToLabel(score)
}

// ============================================================
// FONCTIONS UNIQUES AU DOMAINE RISQUE
// ============================================================

export function profilToFeatures(profil: {
  score_global: number
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  tendance?: string
  prediction_3m?: number
  prediction_6m?: number
}): { [key: string]: number } {
  return {
    score_global: profil.score_global,
    c1: profil.c1,
    c2: profil.c2,
    c3: profil.c3,
    c4: profil.c4,
    c5: profil.c5,
    tendance_baisse: profil.tendance === 'baisse' ? 1 : 0,
    tendance_hausse: profil.tendance === 'hausse' ? 1 : 0,
    prediction_3m: profil.prediction_3m || profil.score_global,
    prediction_6m: profil.prediction_6m || profil.score_global,
    ecart_c1_c2: Math.abs(profil.c1 - profil.c2),
    ecart_c3_c4: Math.abs(profil.c3 - profil.c4),
    min_critere: Math.min(profil.c1, profil.c2, profil.c3, profil.c4, profil.c5),
  }
}

export function scoreToLabel(score: number): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (score < 30) return 'critique'
  if (score < 60) return 'eleve'
  if (score < 80) return 'moyen'
  return 'faible'
}

// ============================================================
// UTILITAIRE : SPLIT TRAIN / TEST POUR VALIDATION
// ============================================================

export interface TrainTestSplit {
  train: TrainingSample[]
  test: TrainingSample[]
}

/**
 * Sépare un jeu de données en ensemble d'entraînement et de test.
 * Garantit la stratification (même proportion de classes dans les deux splits).
 * @param samples Tous les échantillons
 * @param testRatio Proportion pour le test (défaut: 0.2)
 * @param seed Graine aléatoire pour reproductibilité (défaut: Date.now())
 */
export function trainTestSplit(
  samples: TrainingSample[],
  testRatio: number = 0.2,
  seed?: number,
): TrainTestSplit {
  if (samples.length < 2) return { train: [...samples], test: [] }
  if (testRatio <= 0 || testRatio >= 1) return { train: [...samples], test: [] }

  const rng = seed ? seededRandom(seed) : Math.random

  // Stratification par classe
  const byClass = new Map<string, TrainingSample[]>()
  samples.forEach(s => {
    const list = byClass.get(s.label) || []
    list.push(s)
    byClass.set(s.label, list)
  })

  const train: TrainingSample[] = []
  const test: TrainingSample[] = []

  for (const [, group] of byClass) {
    const shuffled = [...group].sort(() => rng() - 0.5)
    const splitIdx = Math.max(1, Math.floor(shuffled.length * (1 - testRatio)))
    train.push(...shuffled.slice(0, splitIdx))
    test.push(...shuffled.slice(splitIdx))
  }

  return { train, test }
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) */
function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
