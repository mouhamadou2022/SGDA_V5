// lib/ia/benchmark/metrics.ts
// Calcul des métriques de classification : accuracy, precision, recall, F1,
// ROC-AUC (one-vs-rest, macro), pour un jeu de test réel.

export interface ClasseStats {
  tp: number
  fp: number
  fn: number
}

export function classeStats(matrix: number[][], cls: number): ClasseStats {
  const k = matrix.length
  let tp = 0
  let fp = 0
  let fn = 0
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if (i === cls && j === cls) tp += matrix[i][j]
      if (i !== cls && j === cls) fp += matrix[i][j]
      if (i === cls && j !== cls) fn += matrix[i][j]
    }
  }
  return { tp, fp, fn }
}

export function accuracy(matrix: number[][]): number {
  const total = matrix.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0)
  if (total === 0) return 0
  const correct = matrix.reduce((s, row, i) => s + (row[i] || 0), 0)
  return correct / total
}

export function precisionMacro(matrix: number[][]): number {
  const k = matrix.length
  if (k === 0) return 0
  let sum = 0
  for (let c = 0; c < k; c++) {
    const { tp, fp } = classeStats(matrix, c)
    sum += tp + fp > 0 ? tp / (tp + fp) : 0
  }
  return sum / k
}

export function recallMacro(matrix: number[][]): number {
  const k = matrix.length
  if (k === 0) return 0
  let sum = 0
  for (let c = 0; c < k; c++) {
    const { tp, fn } = classeStats(matrix, c)
    sum += tp + fn > 0 ? tp / (tp + fn) : 0
  }
  return sum / k
}

export function f1Macro(matrix: number[][]): number {
  const p = precisionMacro(matrix)
  const r = recallMacro(matrix)
  return p + r > 0 ? (2 * p * r) / (p + r) : 0
}

/**
 * AUC binaire par la méthode des rangs (equivalent au trapèze).
 * @param scores scores positifs attendus en ordre croissant (plus haut = plus positif)
 * @param labels 1 = positif, 0 = négatif (dans le même ordre que scores)
 */
export function auc(scores: number[], labels: number[]): number {
  const nPos = labels.filter(l => l === 1).length
  const nNeg = labels.length - nPos
  if (nPos === 0 || nNeg === 0) return 0.5

  const indexed = scores.map((s, i) => ({ s, l: labels[i] })).sort((a, b) => a.s - b.s)
  // Rang moyen pour les ex-aequo
  let sumRanksPos = 0
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j < indexed.length - 1 && indexed[j + 1].s === indexed[i].s) j++
    const avgRank = (i + j) / 2 + 1 // rangs 1-based
    for (let k = i; k <= j; k++) {
      if (indexed[k].l === 1) sumRanksPos += avgRank
    }
    i = j + 1
  }
  return (sumRanksPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

/**
 * ROC-AUC multiclasse one-vs-rest (macro moyenne).
 * @param yTrue vrai label (indice de classe) pour chaque échantillon
 * @param probaProba matrice [échantillon][classe] des probabilités prédites
 */
export function rocAucOvR(yTrue: number[], proba: number[][]): number {
  const k = proba[0]?.length || 0
  if (k === 0 || yTrue.length === 0) return 0.5
  let total = 0
  let count = 0
  for (let c = 0; c < k; c++) {
    const scores = proba.map(row => row[c] ?? 0)
    const labels = yTrue.map(y => (y === c ? 1 : 0))
    if (labels.some(l => l === 1) && labels.some(l => l === 0)) {
      total += auc(scores, labels)
      count++
    }
  }
  return count > 0 ? total / count : 0.5
}
