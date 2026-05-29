// lib/risque/hmm.ts
// Hidden Markov Models — détection précoce de changement de régime
// « L'aérodrome semble stable mais est en transition silencieuse vers un état dégradé »

export interface HMMState {
  name: string          // 'stable', 'degrading', 'critical'
  mean: number          // score moyen dans cet état
  variance: number      // variance du score
  stationaryProb: number // probabilité stationnaire π
}

export interface HMMTransition {
  from: number
  to: number
  probability: number
}

export interface HMMPrediction {
  currentState: number         // état actuel le plus probable (0=stable, 1=degrading, 2=critical)
  currentStateName: string     
  stateProbabilities: number[] // P(état=k | observations)
  nextStateProbabilities: number[] // P(état=k | t+1)
  isTransitioning: boolean     // en transition silencieuse ?
  transitionRisk: number       // 0-100, risque de passer en critique
  daysToCritical: number       // estimation jours avant état critique si tendance continue
  viterbiPath: number[]        // séquence d'états la plus probable
  forwardProbs: number[][]     // probabilités forward (diagnostic)
}

const DEFAULT_STATES: HMMState[] = [
  { name: 'stable', mean: 75, variance: 100, stationaryProb: 0.7 },
  { name: 'degrading', mean: 45, variance: 225, stationaryProb: 0.2 },
  { name: 'critical', mean: 20, variance: 400, stationaryProb: 0.1 },
]

const DEFAULT_TRANSITIONS: number[][] = [
  [0.85, 0.12, 0.03],  // stable → stable, degrading, critical
  [0.10, 0.75, 0.15],  // degrading → stable, degrading, critical
  [0.05, 0.20, 0.75],  // critical → stable, degrading, critical
]

/**
 * Algorithme Forward — P(O₁...Oₜ, qₜ = i | λ)
 */
function forward(
  observations: number[],
  states: HMMState[],
  transitions: number[][]
): number[][] {
  const T = observations.length
  const N = states.length
  const alpha: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))

  // Initialisation
  for (let i = 0; i < N; i++) {
    const diff = observations[0] - states[i].mean
    const emission = Math.exp(-diff * diff / (2 * states[i].variance)) / Math.sqrt(2 * Math.PI * states[i].variance)
    alpha[0][i] = states[i].stationaryProb * emission
  }

  // Récursion
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let sum = 0
      for (let i = 0; i < N; i++) {
        sum += alpha[t - 1][i] * transitions[i][j]
      }
      const diff = observations[t] - states[j].mean
      const emission = Math.exp(-diff * diff / (2 * states[j].variance)) / Math.sqrt(2 * Math.PI * states[j].variance)
      alpha[t][j] = sum * emission
    }
  }

  return alpha
}

/**
 * Algorithme de Viterbi — séquence d'états la plus probable
 */
function viterbi(
  observations: number[],
  states: HMMState[],
  transitions: number[][]
): number[] {
  const T = observations.length
  const N = states.length
  const delta: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))
  const psi: number[][] = Array.from({ length: T }, () => new Array(N).fill(0))

  for (let i = 0; i < N; i++) {
    const diff = observations[0] - states[i].mean
    delta[0][i] = states[i].stationaryProb * Math.exp(-diff * diff / (2 * states[i].variance))
    psi[0][i] = 0
  }

  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let maxVal = -Infinity, maxIdx = 0
      for (let i = 0; i < N; i++) {
        const val = delta[t - 1][i] * transitions[i][j]
        if (val > maxVal) { maxVal = val; maxIdx = i }
      }
      const diff = observations[t] - states[j].mean
      delta[t][j] = maxVal * Math.exp(-diff * diff / (2 * states[j].variance))
      psi[t][j] = maxIdx
    }
  }

  const path = new Array(T).fill(0)
  path[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]))
  for (let t = T - 2; t >= 0; t--) {
    path[t] = psi[t + 1][path[t + 1]]
  }
  return path
}

/**
 * Prédiction HMM complète
 */
export function predictHMM(
  observations: number[],
  customStates?: HMMState[],
  customTransitions?: number[][]
): HMMPrediction {
  const states = customStates || DEFAULT_STATES
  const transitions = customTransitions || DEFAULT_TRANSITIONS
  const N = states.length

  if (observations.length < 2) {
    return {
      currentState: 0,
      currentStateName: 'stable',
      stateProbabilities: [1, 0, 0],
      nextStateProbabilities: [0.85, 0.12, 0.03],
      isTransitioning: false,
      transitionRisk: 12,
      daysToCritical: 999,
      viterbiPath: [],
      forwardProbs: [],
    }
  }

  const alpha = forward(observations, states, transitions)
  const path = viterbi(observations, states, transitions)

  // Probabilités d'état au dernier temps
  const lastAlpha = alpha[alpha.length - 1]
  const sum = lastAlpha.reduce((a, b) => a + b, 1e-8)
  const stateProbs = lastAlpha.map(a => a / sum)

  const currentState = stateProbs.indexOf(Math.max(...stateProbs))

  // Prochain état
  const nextProbs = new Array(N).fill(0)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      nextProbs[j] += stateProbs[i] * transitions[i][j]
    }
  }

  // Détection de transition silencieuse
  const isTransitioning = currentState === 0 && stateProbs[1] > 0.3 && path[path.length - 1] !== path[path.length - 2]
  const transitionRisk = Math.round(stateProbs[2] * 100)

  // Estimation jours avant critique
  let daysToCritical = 999
  if (currentState === 0 && stateProbs[1] > 0.2) {
    const degradingProb = transitions[0][1]
    if (degradingProb > 0) daysToCritical = Math.round(180 / degradingProb)
  } else if (currentState === 1) {
    const criticalProb = transitions[1][2]
    if (criticalProb > 0) daysToCritical = Math.round(90 / criticalProb)
  } else if (currentState === 2) {
    daysToCritical = 0
  }

  return {
    currentState,
    currentStateName: states[currentState].name,
    stateProbabilities: stateProbs.map(p => Math.round(p * 1000) / 10),
    nextStateProbabilities: nextProbs.map(p => Math.round(p * 1000) / 10),
    isTransitioning,
    transitionRisk,
    daysToCritical,
    viterbiPath: path,
    forwardProbs: alpha,
  }
}
