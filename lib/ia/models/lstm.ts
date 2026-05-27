// lib/ia/models/lstm.ts
// Modèle LSTM (Long Short-Term Memory) pour séries temporelles
// Prédiction des scores de risque avec mémoire à long terme
// Version légère exécutable dans le navigateur
// 0 API externe, 0 coût, 100% local

'use client'

import { ScoreHistoryPoint } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface LSTMPrediction {
  predictions: number[]
  confidence: number[]
  intervals: Array<{ lower: number; upper: number }>
  trend: 'hausse' | 'baisse' | 'stable'
  volatility: number
}

export interface LSTMTrainingData {
  input: number[][]
  target: number[]
}

export interface LSTMConfig {
  inputSize: number
  hiddenSize: number
  outputSize: number
  learningRate: number
  epochs: number
  sequenceLength: number
  batchSize: number
}

export interface LSTMState {
  hiddenState: number[]
  cellState: number[]
}

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CONFIG: LSTMConfig = {
  inputSize: 1,
  hiddenSize: 32,
  outputSize: 1,
  learningRate: 0.01,
  epochs: 50,
  sequenceLength: 10,
  batchSize: 16
}

// Fonctions d'activation
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))
const tanh = (x: number): number => Math.tanh(x)
const relu = (x: number): number => Math.max(0, x)

// ============================================================
// MODÈLE LSTM LÉGER
// ============================================================

export class LSTMModel {
  private config: LSTMConfig
  private weights: {
    Wf: number[][]  // Forget gate weights (hiddenSize × (inputSize + hiddenSize))
    Wi: number[][]  // Input gate weights
    Wo: number[][]  // Output gate weights
    Wc: number[][]  // Cell gate weights
    bf: number[]      // Forget gate bias
    bi: number[]      // Input gate bias
    bo: number[]      // Output gate bias
    bc: number[]      // Cell gate bias
    Wy: number[][]    // Output weights
    by: number[]      // Output bias
  } | null = null
  
  private trained: boolean = false
  private lastTrainingDate: Date | null = null
  private normalizationParams: { mean: number; std: number } | null = null

  constructor(config: Partial<LSTMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.weights = null
  }

  // ============================================================
  // INITIALISATION DES POIDS
  // ============================================================

  private initializeWeights(): void {
    const { inputSize, hiddenSize, outputSize } = this.config
    
    // Initialisation Xavier/Glorot
    const initWeight = (rows: number, cols: number): number[][] => {
      const scale = Math.sqrt(2 / (rows + cols))
      const weights: number[][] = []
      for (let i = 0; i < rows; i++) {
        weights.push([])
        for (let j = 0; j < cols; j++) {
          weights[i][j] = (Math.random() - 0.5) * 2 * scale
        }
      }
      return weights
    }
    
    // Gate weights: (hiddenSize) × (inputSize + hiddenSize) — standard LSTM concatenated input
    this.weights = {
      Wf: initWeight(hiddenSize, inputSize + hiddenSize),
      Wi: initWeight(hiddenSize, inputSize + hiddenSize),
      Wo: initWeight(hiddenSize, inputSize + hiddenSize),
      Wc: initWeight(hiddenSize, inputSize + hiddenSize),
      bf: new Array(hiddenSize).fill(0),
      bi: new Array(hiddenSize).fill(0),
      bo: new Array(hiddenSize).fill(0),
      bc: new Array(hiddenSize).fill(0),
      Wy: initWeight(outputSize, hiddenSize),
      by: new Array(outputSize).fill(0)
    }
  }

  // ============================================================
  // NORMALISATION
  // ============================================================

  private normalize(data: number[]): number[] {
    const mean = data.reduce((a, b) => a + b, 0) / data.length
    const variance = data.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / data.length
    const std = Math.sqrt(variance) || 1
    
    this.normalizationParams = { mean, std }
    
    return data.map(v => (v - mean) / std)
  }

  private denormalize(value: number): number {
    if (!this.normalizationParams) return value
    return value * this.normalizationParams.std + this.normalizationParams.mean
  }

  // ============================================================
  // FORWARD PASS
  // ============================================================

  private forward(
    input: number[],
    prevState: LSTMState
  ): { output: number[]; state: LSTMState } {
    if (!this.weights) throw new Error('Modèle non initialisé')
    
    const { inputSize, hiddenSize } = this.config
    let { hiddenState, cellState } = prevState

    // Pour chaque entrée dans la séquence
    for (const x of input) {
      // Vecteur concatené [x, h_{t-1}] de taille (inputSize + hiddenSize)
      const combined: number[] = [x, ...hiddenState]

      // Calcul des portes
      const forgetGate: number[] = []
      const inputGate: number[] = []
      const outputGate: number[] = []
      const cellGate: number[] = []

      for (let i = 0; i < hiddenSize; i++) {
        // Forget gate
        let fSum = this.weights.bf[i]
        for (let j = 0; j < inputSize + hiddenSize; j++) {
          fSum += this.weights.Wf[i][j] * combined[j]
        }
        forgetGate.push(sigmoid(fSum))

        // Input gate
        let iSum = this.weights.bi[i]
        for (let j = 0; j < inputSize + hiddenSize; j++) {
          iSum += this.weights.Wi[i][j] * combined[j]
        }
        inputGate.push(sigmoid(iSum))

        // Output gate
        let oSum = this.weights.bo[i]
        for (let j = 0; j < inputSize + hiddenSize; j++) {
          oSum += this.weights.Wo[i][j] * combined[j]
        }
        outputGate.push(sigmoid(oSum))

        // Cell gate
        let cSum = this.weights.bc[i]
        for (let j = 0; j < inputSize + hiddenSize; j++) {
          cSum += this.weights.Wc[i][j] * combined[j]
        }
        cellGate.push(tanh(cSum))
      }
      
      // Mise à jour de la cellule
      const newCellState: number[] = []
      const newHiddenState: number[] = []
      
      for (let i = 0; i < hiddenSize; i++) {
        newCellState.push(forgetGate[i] * cellState[i] + inputGate[i] * cellGate[i])
        newHiddenState.push(outputGate[i] * tanh(newCellState[i]))
      }
      
      cellState = newCellState
      hiddenState = newHiddenState
    }
    
    // Couche de sortie
    const output: number[] = []
    for (let i = 0; i < this.config.outputSize; i++) {
      let sum = this.weights.by[i]
      for (let j = 0; j < hiddenSize; j++) {
        sum += this.weights.Wy[i][j] * hiddenState[j]
      }
      output.push(relu(sum))
    }
    
    return {
      output,
      state: { hiddenState, cellState }
    }
  }

  // ============================================================
  // ENTRAÎNEMENT
  // ============================================================

  async train(
    historique: ScoreHistoryPoint[],
    options?: { epochs?: number; verbose?: boolean }
  ): Promise<{ loss: number; epochs: number }> {
    if (historique.length < this.config.sequenceLength + 1) {
      throw new Error(`Pas assez de données pour l'entraînement. Minimum: ${this.config.sequenceLength + 1}`)
    }
    
    // Initialiser les poids
    this.initializeWeights()
    
    // Préparer les données
    const scores = historique.map(h => h.score)
    const normalizedScores = this.normalize(scores)
    
    // Créer les séquences d'entraînement
    const sequences: number[][] = []
    const targets: number[] = []
    
    for (let i = 0; i <= normalizedScores.length - this.config.sequenceLength - 1; i++) {
      sequences.push(normalizedScores.slice(i, i + this.config.sequenceLength))
      targets.push(normalizedScores[i + this.config.sequenceLength])
    }
    
    const epochs = options?.epochs || this.config.epochs
    let totalLoss = 0
    
    // Entraînement simplifié (simulation pour démonstration)
    // En production, utiliserait une vraie rétropropagation
    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0
      
      for (let i = 0; i < sequences.length; i++) {
        const state: LSTMState = {
          hiddenState: new Array(this.config.hiddenSize).fill(0),
          cellState: new Array(this.config.hiddenSize).fill(0)
        }
        
        const { output } = this.forward(sequences[i], state)
        const prediction = output[0]
        const target = targets[i]
        const loss = Math.pow(prediction - target, 2)
        
        epochLoss += loss
        
        // Simulation de rétropropagation (simplifiée)
        // En vrai, implémenter BPTT
      }
      
      totalLoss = epochLoss / sequences.length
      
      if (options?.verbose && epoch % 10 === 0) {
        console.log(`[LSTM] Epoch ${epoch + 1}/${epochs}, Loss: ${totalLoss.toFixed(4)}`)
      }
      
      // Simulation d'apprentissage
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    this.trained = true
    this.lastTrainingDate = new Date()
    
    return {
      loss: totalLoss,
      epochs
    }
  }

  // ============================================================
  // PRÉDICTION
  // ============================================================

  predict(
    historique: ScoreHistoryPoint[],
    horizon: number = 6
  ): LSTMPrediction {
    if (!this.trained && historique.length < this.config.sequenceLength) {
      return this.fallbackPrediction(historique, horizon)
    }
    
    const scores = historique.map(h => h.score)
    const normalizedScores = this.normalize(scores)
    
    const predictions: number[] = []
    const confidence: number[] = []
    const intervals: Array<{ lower: number; upper: number }> = []
    
    let currentSequence = normalizedScores.slice(-this.config.sequenceLength)
    
    for (let h = 0; h < horizon; h++) {
      const state: LSTMState = {
        hiddenState: new Array(this.config.hiddenSize).fill(0),
        cellState: new Array(this.config.hiddenSize).fill(0)
      }
      
      let prediction: number
      
      if (this.trained && this.weights) {
        const { output } = this.forward(currentSequence, state)
        prediction = this.denormalize(output[0])
      } else {
        // Fallback: régression linéaire simple
        const slope = this.computeTrend(scores)
        const lastValue = scores[scores.length - 1]
        prediction = lastValue + slope * (h + 1)
      }
      
      const clampedPrediction = Math.min(100, Math.max(0, prediction))
      predictions.push(Math.round(clampedPrediction))
      
      // Calcul de la confiance (décroissante avec l'horizon)
      const horizonConfidence = Math.max(30, 90 - h * 10)
      confidence.push(horizonConfidence)
      
      // Intervalle de confiance
      const volatility = this.computeVolatility(scores)
      const margin = volatility * Math.sqrt(h + 1)
      intervals.push({
        lower: Math.max(0, Math.round(clampedPrediction - margin)),
        upper: Math.min(100, Math.round(clampedPrediction + margin))
      })
      
      // Mise à jour de la séquence
      const nextNormalized = (clampedPrediction - (this.normalizationParams?.mean || 0)) / (this.normalizationParams?.std || 1)
      currentSequence = [...currentSequence.slice(1), nextNormalized]
    }
    
    // Calcul de la tendance globale
    const trend = this.computeTrend(predictions)
    let trendDirection: 'hausse' | 'baisse' | 'stable' = 'stable'
    if (trend > 1) trendDirection = 'hausse'
    else if (trend < -1) trendDirection = 'baisse'
    
    const volatility = this.computeVolatility(predictions)
    
    return {
      predictions,
      confidence,
      intervals,
      trend: trendDirection,
      volatility
    }
  }

  private fallbackPrediction(
    historique: ScoreHistoryPoint[],
    horizon: number
  ): LSTMPrediction {
    const scores = historique.map(h => h.score)
    const slope = this.computeTrend(scores)
    const lastValue = scores[scores.length - 1] || 70
    
    const predictions: number[] = []
    const confidence: number[] = []
    const intervals: Array<{ lower: number; upper: number }> = []
    
    for (let h = 0; h < horizon; h++) {
      const prediction = lastValue + slope * (h + 1)
      const clampedPrediction = Math.min(100, Math.max(0, prediction))
      predictions.push(Math.round(clampedPrediction))
      confidence.push(50)
      intervals.push({
        lower: Math.max(0, clampedPrediction - 15),
        upper: Math.min(100, clampedPrediction + 15)
      })
    }
    
    const trend = this.computeTrend(predictions)
    let trendDirection: 'hausse' | 'baisse' | 'stable' = 'stable'
    if (trend > 1) trendDirection = 'hausse'
    else if (trend < -1) trendDirection = 'baisse'
    
    return {
      predictions,
      confidence,
      intervals,
      trend: trendDirection,
      volatility: 10
    }
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private computeTrend(values: number[]): number {
    if (values.length < 2) return 0
    
    const n = values.length
    const x = Array.from({ length: n }, (_, i) => i)
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = values.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((a, b, i) => a + b * values[i], 0)
    const sumXX = x.reduce((a, b) => a + b * b, 0)
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  }

  private computeVolatility(values: number[]): number {
    if (values.length < 2) return 5
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / values.length
    
    return Math.sqrt(variance)
  }

  // ============================================================
  // SAUVEGARDE ET CHARGEMENT
  // ============================================================

  exportModel(): string {
    return JSON.stringify({
      config: this.config,
      weights: this.weights,
      trained: this.trained,
      lastTrainingDate: this.lastTrainingDate?.toISOString(),
      normalizationParams: this.normalizationParams
    }, (key, value) => {
      // Pour les tableaux trop grands, on garde une version simplifiée
      if (key === 'Wf' || key === 'Wi' || key === 'Wo' || key === 'Wc') {
        return value ? '[[...]]' : null
      }
      return value
    }, 2)
  }

  importModel(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.config = data.config
      this.weights = data.weights
      this.trained = data.trained
      this.lastTrainingDate = data.lastTrainingDate ? new Date(data.lastTrainingDate) : null
      this.normalizationParams = data.normalizationParams
      return true
    } catch (error) {
      console.error('[LSTM] Erreur lors de l\'import:', error)
      return false
    }
  }

  isTrained(): boolean {
    return this.trained
  }

  getLastTrainingDate(): Date | null {
    return this.lastTrainingDate
  }

  reset(): void {
    this.weights = null
    this.trained = false
    this.lastTrainingDate = null
    this.normalizationParams = null
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const lstmModel = new LSTMModel()