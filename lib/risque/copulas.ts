// lib/risque/copulas.ts
// Copulas — modélise les dépendances entre C1-C5
// « Si C1 (SGS) chute de 30%, C5 (incidents) monte presque toujours »

export interface CopulaPrediction {
  correlationMatrix: number[][]   // matrice de corrélation 5×5
  rankCorrelations: number[][]    // τ de Kendall entre chaque paire
  tailDependence: {               // dépendance de queue (extrême)
    upper: number[][]             // probabilité jointe de scores élevés
    lower: number[][]             // probabilité jointe de scores bas
  }
  conditionalExpected: (component: number, value: number) => number[]  // E[C_j | C_i = v]
  worstCaseScenario: {            // pire scénario combiné
    components: number[]          // scores C1-C5 projetés
    probability: number           // probabilité jointe
    description: string
  }
  clusters: {                     // groupes de composantes corrélées
    group1: number[]
    group2: number[]
  }
}

/**
 * Calcule la matrice de corrélation de Pearson 5×5
 * entre les scores C1-C5 sur l'historique
 */
function computeCorrelationMatrix(
  history: { c1: number; c2: number; c3: number; c4: number; c5: number }[]
): number[][] {
  const n = history.length
  if (n < 2) return Array.from({ length: 5 }, () => new Array(5).fill(0))

  const components = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
  const corr: number[][] = Array.from({ length: 5 }, () => new Array(5).fill(0))

  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i === j) { corr[i][j] = 1; continue }

      const xi = history.map(h => (h as any)[components[i]] as number)
      const xj = history.map(h => (h as any)[components[j]] as number)
      const meanI = xi.reduce((a, b) => a + b, 0) / n
      const meanJ = xj.reduce((a, b) => a + b, 0) / n

      let cov = 0, varI = 0, varJ = 0
      for (let k = 0; k < n; k++) {
        cov += (xi[k] - meanI) * (xj[k] - meanJ)
        varI += (xi[k] - meanI) ** 2
        varJ += (xj[k] - meanJ) ** 2
      }

      const denom = Math.sqrt(varI * varJ)
      corr[i][j] = denom > 0 ? cov / denom : 0
    }
  }

  return corr
}

/**
 * τ de Kendall — mesure de dépendance non paramétrique
 */
function computeKendallTau(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0

  let concordant = 0, discordant = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j]
      const dy = y[i] - y[j]
      if (dx * dy > 0) concordant++
      else if (dx * dy < 0) discordant++
    }
  }

  const total = concordant + discordant
  return total > 0 ? (concordant - discordant) / total : 0
}

/**
 * Dépendance de queue (tail dependence)
 * λ_upper = P(X > q | Y > q) pour q → 1
 * λ_lower = P(X < q | Y < q) pour q → 0
 */
function computeTailDependence(
  x: number[], y: number[], quantile: number = 0.9
): { upper: number; lower: number } {
  const n = x.length
  if (n < 10) return { upper: 0, lower: 0 }

  const sortedX = [...x].sort((a, b) => a - b)
  const sortedY = [...y].sort((a, b) => a - b)
  const upperIdx = Math.floor(n * (1 - quantile))
  const lowerIdx = Math.floor(n * quantile)

  const upperThresholdX = sortedX[n - upperIdx - 1]
  const upperThresholdY = sortedY[n - upperIdx - 1]
  const lowerThresholdX = sortedX[lowerIdx]
  const lowerThresholdY = sortedY[lowerIdx]

  let upperCount = 0, upperBoth = 0
  let lowerCount = 0, lowerBoth = 0

  for (let i = 0; i < n; i++) {
    if (x[i] > upperThresholdX) {
      upperCount++
      if (y[i] > upperThresholdY) upperBoth++
    }
    if (x[i] < lowerThresholdX) {
      lowerCount++
      if (y[i] < lowerThresholdY) lowerBoth++
    }
  }

  return {
    upper: upperCount > 0 ? upperBoth / upperCount : 0,
    lower: lowerCount > 0 ? lowerBoth / lowerCount : 0,
  }
}

/**
 * Espérance conditionnelle simplifiée
 * E[C_j | C_i = value] ≈ mean_j + corr(i,j) × (value - mean_i) × (σ_j / σ_i)
 */
function conditionalExpected(
  history: { c1: number; c2: number; c3: number; c4: number; c5: number }[],
  corr: number[][],
  componentI: number,
  value: number
): number[] {
  const n = history.length
  if (n === 0) return [50, 50, 50, 50, 50]

  const components = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
  const means = components.map(c => history.reduce((s, h) => s + (h as any)[c], 0) / n)
  const stds = components.map(c => {
    const m = means[components.indexOf(c)]
    return Math.sqrt(history.reduce((s, h) => s + ((h as any)[c] - m) ** 2, 0) / n)
  })

  return components.map((_, j) => {
    if (j === componentI) return value
    const predicted = means[j] + corr[componentI][j] * (value - means[componentI]) * (stds[j] / Math.max(stds[componentI], 1))
    return Math.round(Math.min(100, Math.max(0, predicted)))
  })
}

/**
 * Analyse Copula complète
 */
export function predictCopula(
  history: { c1: number; c2: number; c3: number; c4: number; c5: number }[]
): CopulaPrediction {
  const corr = computeCorrelationMatrix(history)
  const n = history.length

  // τ de Kendall
  const components = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
  const tau: number[][] = Array.from({ length: 5 }, () => new Array(5).fill(0))
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      const xi = history.map(h => (h as any)[components[i]])
      const xj = history.map(h => (h as any)[components[j]])
      tau[i][j] = tau[j][i] = computeKendallTau(xi, xj)
    }
  }

  // Tail dependence
  const tailUpper: number[][] = Array.from({ length: 5 }, () => new Array(5).fill(0))
  const tailLower: number[][] = Array.from({ length: 5 }, () => new Array(5).fill(0))
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      const xi = history.map(h => (h as any)[components[i]])
      const xj = history.map(h => (h as any)[components[j]])
      const td = computeTailDependence(xi, xj)
      tailUpper[i][j] = tailUpper[j][i] = td.upper
      tailLower[i][j] = tailLower[j][i] = td.lower
    }
  }

  // Clusters : trouver les 2 groupes les plus corrélés
  const pairs: { i: number; j: number; val: number }[] = []
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++)
      pairs.push({ i, j, val: Math.abs(corr[i][j]) })

  pairs.sort((a, b) => b.val - a.val)
  const cluster1 = pairs.length > 0 ? [pairs[0].i + 1, pairs[0].j + 1] : [1, 2]
  const cluster2 = pairs.length > 1 ? [pairs[1].i + 1, pairs[1].j + 1] : [3, 4]

  // Pire scénario combiné
  const worstCase = {
    components: [20, 25, 30, 15, 10],
    probability: 5,
    description: 'Si C1-C2-C3 chutent simultanément (scénario catastrophe)',
  }
  if (n > 0) {
    worstCase.components = components.map((c, i) => {
      const vals = history.map(h => (h as any)[c])
      return Math.round(Math.min(...vals))
    })
    const jointProb = tailLower.flat().filter(v => v > 0.3).length / 10
    worstCase.probability = Math.round(jointProb * 100)
    worstCase.description = `Scénario combiné bas : probabilité jointe ~${worstCase.probability}% de chute simultanée`
  }

  return {
    correlationMatrix: corr.map(row => row.map(v => Math.round(v * 100) / 100)),
    rankCorrelations: tau.map(row => row.map(v => Math.round(v * 100) / 100)),
    tailDependence: { upper: tailUpper, lower: tailLower },
    conditionalExpected: (comp: number, val: number) => conditionalExpected(history, corr, comp, val),
    worstCaseScenario: worstCase,
    clusters: { group1: cluster1, group2: cluster2 },
  }
}
