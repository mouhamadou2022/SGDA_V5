/**
 * Random Forest pour la prédiction de risque
 * Implémentation simplifiée d'une forêt aléatoire pour la classification
 */

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

/**
 * Crée un arbre de décision simple
 */
function createDecisionTree(
  samples: TrainingSample[],
  features: string[],
  maxDepth: number = 3
): DecisionTree | number {
  // Cas de base: tous les échantillons ont la même étiquette
  const labels = samples.map(s => s.label)
  const uniqueLabels = [...new Set(labels)]
  
  if (uniqueLabels.length === 1 || samples.length < 2 || maxDepth === 0) {
    // Retourner l'étiquette majoritaire
    const labelCounts = new Map<string, number>()
    labels.forEach(l => labelCounts.set(l, (labelCounts.get(l) || 0) + 1))
    const majority = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return majority === 'critique' ? 0 : majority === 'eleve' ? 1 : majority === 'moyen' ? 2 : 3
  }
  
  // Trouver la meilleure caractéristique et le meilleur seuil
  let bestFeature = features[0]
  let bestThreshold = 0
  let bestGini = 1
  
  for (const feature of features) {
    const values = samples.map(s => s.features[feature])
    const thresholds = [...new Set(values)].sort((a, b) => a - b)
    
    for (let i = 0; i < thresholds.length - 1; i++) {
      const threshold = (thresholds[i] + thresholds[i + 1]) / 2
      
      const left = samples.filter(s => s.features[feature] <= threshold)
      const right = samples.filter(s => s.features[feature] > threshold)
      
      if (left.length === 0 || right.length === 0) continue
      
      const gini = calculateGini(left) * (left.length / samples.length) + 
                   calculateGini(right) * (right.length / samples.length)
      
      if (gini < bestGini) {
        bestGini = gini
        bestFeature = feature
        bestThreshold = threshold
      }
    }
  }
  
  // Aucun split trouvé (features aléatoires ne séparent pas les données)
  if (bestGini === 1) {
    const labelCounts = new Map<string, number>()
    labels.forEach(l => labelCounts.set(l, (labelCounts.get(l) || 0) + 1))
    const majority = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return majority === 'critique' ? 0 : majority === 'eleve' ? 1 : majority === 'moyen' ? 2 : 3
  }
  
  const leftSamples = samples.filter(s => s.features[bestFeature] <= bestThreshold)
  const rightSamples = samples.filter(s => s.features[bestFeature] > bestThreshold)
  
  return {
    feature: bestFeature,
    threshold: bestThreshold,
    left: createDecisionTree(leftSamples, features, maxDepth - 1),
    right: createDecisionTree(rightSamples, features, maxDepth - 1)
  }
}

function calculateGini(samples: TrainingSample[]): number {
  if (samples.length === 0) return 0
  
  const labelCounts = new Map<string, number>()
  samples.forEach(s => labelCounts.set(s.label, (labelCounts.get(s.label) || 0) + 1))
  
  let gini = 1
  labelCounts.forEach((count) => {
    const prob = count / samples.length
    gini -= prob * prob
  })
  
  return gini
}

function predictTree(tree: DecisionTree | number, features: { [key: string]: number }): number {
  if (typeof tree === 'number') return tree
  
  const value = features[tree.feature] || 0
  if (value <= tree.threshold) {
    return predictTree(tree.left as DecisionTree | number, features)
  } else {
    return predictTree(tree.right as DecisionTree | number, features)
  }
}

/**
 * Entraîne une forêt aléatoire
 */
export function trainRandomForest(
  samples: TrainingSample[],
  nTrees: number = 10,
  maxDepth: number = 4,
  featureSubsetSize: number = 3
): RandomForestModel {
  const features = Object.keys(samples[0]?.features || {})
  const trees: DecisionTree[] = []
  const featureImportance = new Map<string, number>()
  
  // Initialiser l'importance des caractéristiques
  features.forEach(f => featureImportance.set(f, 0))
  
  for (let i = 0; i < nTrees; i++) {
    // Échantillonnage bootstrap
    const bootstrapSamples = []
    for (let j = 0; j < samples.length; j++) {
      const idx = Math.floor(Math.random() * samples.length)
      bootstrapSamples.push(samples[idx])
    }
    
    // Sélection aléatoire des caractéristiques
    const shuffledFeatures = [...features].sort(() => Math.random() - 0.5)
    const selectedFeatures = shuffledFeatures.slice(0, Math.min(featureSubsetSize, features.length))
    
    const tree = createDecisionTree(bootstrapSamples, selectedFeatures, maxDepth)
    if (typeof tree !== 'number') {
      trees.push(tree)
      
      // Mettre à jour l'importance des caractéristiques
      updateFeatureImportance(tree, featureImportance)
    }
  }
  
  // Calculer la précision sur l'ensemble d'entraînement
  let correct = 0
  samples.forEach(sample => {
    const prediction = predictRandomForest({ trees, featureImportance, accuracy: 0, trainingSamples: samples.length }, sample.features)
    if (prediction === sample.label) correct++
  })
  
  const accuracy = correct / samples.length
  
  return {
    trees,
    featureImportance,
    accuracy,
    trainingSamples: samples.length
  }
}

function updateFeatureImportance(tree: DecisionTree | number, importance: Map<string, number>) {
  if (typeof tree === 'number') return
  
  const current = importance.get(tree.feature) || 0
  importance.set(tree.feature, current + 1)
  
  updateFeatureImportance(tree.left as DecisionTree | number, importance)
  updateFeatureImportance(tree.right as DecisionTree | number, importance)
}

/**
 * Prédit l'étiquette de risque
 */
export function predictRandomForest(
  model: RandomForestModel,
  features: { [key: string]: number }
): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (model.trees.length === 0) return 'moyen'
  
  const votes = new Map<string, number>()
  votes.set('critique', 0)
  votes.set('eleve', 0)
  votes.set('moyen', 0)
  votes.set('faible', 0)
  
  model.trees.forEach(tree => {
    const predictionIndex = predictTree(tree, features)
    const labels: string[] = ['critique', 'eleve', 'moyen', 'faible']
    const label = labels[predictionIndex] || 'moyen'
    votes.set(label, (votes.get(label) || 0) + 1)
  })
  
  // Retourner l'étiquette avec le plus de votes
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] as 'critique' | 'eleve' | 'moyen' | 'faible'
}

/**
 * Convertit un ProfilRisque en features pour le Random Forest
 */
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
    min_critere: Math.min(profil.c1, profil.c2, profil.c3, profil.c4, profil.c5)
  }
}

/**
 * Détermine l'étiquette de risque à partir d'un score global
 */
export function scoreToLabel(score: number): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (score < 30) return 'critique'
  if (score < 60) return 'eleve'
  if (score < 80) return 'moyen'
  return 'faible'
}