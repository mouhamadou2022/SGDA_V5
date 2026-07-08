// lib/risque/thompsonSampling.ts
// Thompson Sampling — meilleur que ε-greedy pour le choix d'action
// Converge plus vite, moins d'exploration aléatoire
// Utilise des distributions Beta pour modéliser l'incertitude

export interface TSAction {
  id: string
  name: string
  alpha: number    // succès (paramètre Beta)
  beta: number     // échecs (paramètre Beta)
  samples: number  // nombre total de tirages
}

export interface TSPrediction {
  actions: TSAction[]
  bestAction: string          // meilleure action actuelle
  bestProbability: number     // probabilité que ce soit vraiment la meilleure
  recommend: (contextKey?: string) => TSAction  // recommande une action (ctx ignoré, TS non contextuel)
  update: (actionId: string, reward: number) => void  // met à jour avec le résultat
  expectedRewards: Record<string, number>  // récompense espérée par action
}

/**
 * Échantillonne depuis Beta(α, β)
 * Approximation normale pour grands paramètres, rejet pour petits
 */
function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0) alpha = 0.1
  if (beta <= 0) beta = 0.1

  // Méthode de rejet pour petits paramètres
  if (alpha <= 1 || beta <= 1) {
    let x: number, y: number
    do {
      x = Math.random() ** (1 / alpha)
      y = Math.random() ** (1 / beta)
    } while (x + y > 1)
    return x / (x + y)
  }

  // Approximation normale pour grands paramètres
  const mean = alpha / (alpha + beta)
  const std = Math.sqrt(alpha * beta / ((alpha + beta) ** 2 * (alpha + beta + 1)))
  const sample = mean + std * (Math.random() + Math.random() + Math.random() - 1.5) * (2 / Math.sqrt(3))
  return Math.max(1e-6, Math.min(0.9999, sample))
}

/**
 * Probabilité qu'une distribution Beta(α₁,β₁) > Beta(α₂,β₂)
 * Approximation par Monte Carlo
 */
function probabilityAGreaterThanB(a: TSAction, b: TSAction, samples: number = 200): number {
  let count = 0
  for (let i = 0; i < samples; i++) {
    if (sampleBeta(a.alpha, a.beta) > sampleBeta(b.alpha, b.beta)) count++
  }
  return count / samples
}

/**
 * Initialise un agent Thompson Sampling avec des actions prédéfinies
 */
export function createThompsonSampling(
  actionDefs: { id: string; name: string; alpha?: number; beta?: number }[]
): TSPrediction {
  const actions: TSAction[] = actionDefs.map(a => ({
    id: a.id,
    name: a.name,
    alpha: a.alpha || 1,   // prior non informatif Beta(1,1) = Uniform(0,1)
    beta: a.beta || 1,
    samples: 0,
  }))

  let bestActionId = actions[0]?.id || ''

  const recommend = (_contextKey?: string): TSAction => {
    let bestSample = -1
    let bestAction = actions[0]

    for (const action of actions) {
      const sample = sampleBeta(action.alpha, action.beta)
      if (sample > bestSample) {
        bestSample = sample
        bestAction = action
      }
    }

    bestActionId = bestAction?.id || bestActionId
    return bestAction!
  }

  const update = (actionId: string, reward: number) => {
    const action = actions.find(a => a.id === actionId)
    if (!action) return

    // Récompense bornée [0, 1]
    const clampedReward = Math.max(0.01, Math.min(0.99, reward))

    // Mise à jour bayésienne de Beta
    action.alpha += clampedReward
    action.beta += (1 - clampedReward)
    action.samples++

    // Recalculer la meilleure action
    let bestProb = 0
    let bestId = actions[0].id
    for (const a of actions) {
      if (a.samples === 0) continue
      const prob = a.alpha / (a.alpha + a.beta)
      if (prob > bestProb) { bestProb = prob; bestId = a.id }
    }
    bestActionId = bestId
  }

  const expectedRewards: Record<string, number> = {}
  for (const a of actions) {
    expectedRewards[a.id] = a.samples > 0 ? Math.round(a.alpha / (a.alpha + a.beta) * 100) / 100 : 0.5
  }

  // Probabilité que la meilleure action soit vraiment la meilleure
  const bestAction = actions.find(a => a.id === bestActionId)
  let bestProbability = 50
  if (bestAction && actions.length > 1) {
    const others = actions.filter(a => a.id !== bestActionId)
    let probSum = 0
    for (const other of others) {
      probSum += probabilityAGreaterThanB(bestAction, other)
    }
    bestProbability = Math.round(probSum / Math.max(others.length, 1) * 100)
  }

  return { actions, bestAction: bestActionId, bestProbability, recommend, update, expectedRewards }
}
