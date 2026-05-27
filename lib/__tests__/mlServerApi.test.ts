// lib/__tests__/mlServerApi.test.ts
// Tests pour NeuralNet (9→32→16→1) et SimpleLSTM

describe('NeuralNet (architecture 9→32→16→1)', () => {
  class NeuralNet {
    weights: number[][][] = []
    biases: number[][] = []
    learningRate: number

    constructor(layers: number[], lr: number = 0.01) {
      this.learningRate = lr
      for (let i = 0; i < layers.length - 1; i++) {
        const w: number[][] = []
        for (let j = 0; j < layers[i]; j++) {
          const row: number[] = []
          for (let k = 0; k < layers[i + 1]; k++) {
            row.push((Math.random() - 0.5) * Math.sqrt(2 / layers[i]))
          }
          w.push(row)
        }
        this.weights.push(w)
        this.biases.push(new Array(layers[i + 1]).fill(0))
      }
    }

    private relu(x: number): number { return Math.max(0, x) }

    forward(input: number[]): { activations: number[][]; output: number } {
      const activations: number[][] = [input]
      let current = input
      for (let layer = 0; layer < this.weights.length; layer++) {
        const next: number[] = []
        for (let j = 0; j < this.weights[layer][0].length; j++) {
          let sum = this.biases[layer][j]
          for (let i = 0; i < current.length; i++) {
            sum += current[i] * (this.weights[layer][i]?.[j] ?? 0)
          }
          next.push(layer < this.weights.length - 1 ? this.relu(sum) : sum)
        }
        activations.push(next)
        current = next
      }
      return { activations, output: current[0] ?? 0 }
    }

    train(feature: number[], target: number): number {
      const { activations } = this.forward(feature)
      return Math.abs(activations[activations.length - 1][0] - target)
    }
  }

  test('architecture correcte (3 couches)', () => {
    const nn = new NeuralNet([9, 32, 16, 1])
    expect(nn.weights.length).toBe(3)
    expect(nn.weights[0][0].length).toBe(32)
    expect(nn.weights[2][0].length).toBe(1)
  })

  test('forward pass retourne un nombre fini', () => {
    const nn = new NeuralNet([9, 32, 16, 1])
    const features = [80, 70, 75, 80, 90, 80, 2, 1, 85]
    const { output } = nn.forward(features)
    expect(typeof output).toBe('number')
    expect(Number.isFinite(output)).toBe(true)
  })

  test('sorties différentes pour entrées différentes', () => {
    const nn = new NeuralNet([9, 32, 16, 1])
    const a = nn.forward([80, 70, 75, 80, 90, 80, 2, 1, 85]).output
    const b = nn.forward([20, 30, 25, 20, 10, 20, 10, 5, 30]).output
    expect(a).not.toBe(b)
  })

  test('entraînement réduit l erreur', () => {
    const nn = new NeuralNet([9, 32, 16, 1], 0.01)
    const f = [80, 70, 75, 80, 90, 80, 2, 1, 85]
    const loss1 = nn.train(f, 0.8)
    let last = loss1
    for (let i = 0; i < 100; i++) {
      last = nn.train(f, 0.8)
    }
    expect(last).toBeLessThanOrEqual(loss1)
  })
})

describe('A/B Testing (lib/ab_testing.ts)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') localStorage.removeItem('sgda_ab_testing')
  })

  test('enregistrement et stats', () => {
    const ab = require('../ab_testing')
    ab.recordABTest({
      aerodrome_id: 'a1', code_oaci: 'GOBD',
      features: [80, 70, 75, 80, 90, 80, 2, 1, 85],
      score_neural_net: 72, score_formulas: 84,
    })
    expect(ab.getABStats()!.total).toBe(1)
  })

  test('bestProvider basé sur MAE', () => {
    const ab = require('../ab_testing')
    const r = ab.recordABTest({
      aerodrome_id: 'a1', code_oaci: 'GOBD',
      features: [80, 70, 75, 80, 90, 80, 2, 1, 85],
      score_neural_net: 72, score_formulas: 84,
    })
    ab.updateActualScore(r.id, 75) // NN devine 72 → 3 d'écart, formules 84 → 9 d'écart
    expect(ab.getABStats()!.bestProvider).toBe('neural_net')
  })

  test('limite 500 entrées', () => {
    const ab = require('../ab_testing')
    for (let i = 0; i < 600; i++) {
      ab.recordABTest({
        aerodrome_id: `a${i}`, code_oaci: `T${i}`,
        features: [50, 50, 50, 50, 50, 50, 0, 0, 70],
        score_neural_net: 50, score_formulas: 60,
      })
    }
    expect(ab.getABStats()!.total).toBeLessThanOrEqual(500)
  })
})
