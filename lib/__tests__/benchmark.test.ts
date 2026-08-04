// lib/__tests__/benchmark.test.ts
// Tests du protocole de benchmark ML (RF / XGBoost / LightGBM / CatBoost / MLP)
// et des métriques (accuracy, precision, recall, F1, ROC-AUC).

import { auc, rocAucOvR, accuracy, precisionMacro, recallMacro, f1Macro } from '../ia/benchmark/metrics'
import { buildConfusionMatrix } from '../ia/benchmark/types'
import { benchmarkSplit, runBenchmark, creerModelesBenchmark } from '../ia/benchmark/benchmarkEngine'
import {
  DEFAULT_BENCHMARK_CONFIG,
  MODEL_HYPERPARAMS,
  validerBenchmarkConfig,
  configEstPersonnalisee,
} from '../ia/benchmark/config'
import { LightGBMModel } from '../ia/benchmark/models/lightgbm'
import { CatBoostModel } from '../ia/benchmark/models/catboost'
import { MLPModel } from '../ia/benchmark/models/mlp'

function makeSample(features: number[], label: string) {
  return { features, label }
}

// Jeu de données linéairement séparable : classe 'faible' si x1+x2 > 0, sinon 'eleve'
function syntheticDataset(n = 60): Array<{ features: number[]; label: string }> {
  const out: Array<{ features: number[]; label: string }> = []
  for (let i = 0; i < n; i++) {
    const x1 = (i % 7) / 3 - 1
    const x2 = ((i * 3) % 11) / 5 - 1
    const x3 = (i % 5) / 2
    const label = x1 + x2 + x3 / 6 > 0.1 ? 'faible' : 'eleve'
    out.push(makeSample([x1, x2, x3], label))
  }
  return out
}

describe('metrics', () => {
  test('auc parfait = 1', () => {
    expect(auc([0.1, 0.2, 0.9, 0.95], [0, 0, 1, 1])).toBe(1)
  })

  test('auc inversé = 0', () => {
    expect(auc([0.9, 0.95, 0.1, 0.2], [0, 0, 1, 1])).toBe(0)
  })

  test('auc aléatoire ≈ 0.5', () => {
    // Positifs aux rangs 2 et 3 → somme des rangs = 5 → AUC = (5-3)/4 = 0.5
    const a = auc([1, 2, 3, 4], [0, 1, 1, 0])
    expect(a).toBe(0.5)
  })

  test('rocAucOvR parfait sur classes séparées', () => {
    const yTrue = [0, 0, 1, 1]
    const proba = [
      [0.9, 0.1],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.1, 0.9],
    ]
    expect(rocAucOvR(yTrue, proba)).toBe(1)
  })

  test('matrice de confusion + métriques dérivées', () => {
    const matrix = buildConfusionMatrix([0, 0, 1, 1, 0], [0, 1, 1, 1, 0], 2)
    // [[2,1],[0,2]]
    expect(accuracy(matrix)).toBeCloseTo(4 / 5, 5)
    expect(precisionMacro(matrix)).toBeCloseTo((2 / 3 + 1) / 2, 5)
    expect(recallMacro(matrix)).toBeCloseTo((2 / 3 + 1) / 2, 5)
    expect(f1Macro(matrix)).toBeGreaterThan(0)
  })
})

describe('benchmarkSplit', () => {
  test('stratifie par classe et conserve les proportions', () => {
    const data = syntheticDataset(60)
    const { train, test } = benchmarkSplit(data, 0.25, 42)
    expect(train.length + test.length).toBe(60)
    expect(test.length).toBeGreaterThan(0)
    // Les deux classes présentes dans train et test
    const testLabels = new Set(test.map(t => t.label))
    expect(testLabels.has('faible')).toBe(true)
    expect(testLabels.has('eleve')).toBe(true)
  })
})

describe('nouveaux modèles', () => {
  test('LightGBM apprend un dataset séparable', async () => {
    const data = syntheticDataset(60)
    const model = new LightGBMModel()
    await model.train(data)
    let correct = 0
    for (const s of data) {
      if (model.predict(s.features).prediction === s.label) correct++
    }
    expect(correct / data.length).toBeGreaterThan(0.75)
  })

  test('CatBoost apprend un dataset séparable', async () => {
    const data = syntheticDataset(60)
    const model = new CatBoostModel()
    await model.train(data)
    let correct = 0
    for (const s of data) {
      if (model.predict(s.features).prediction === s.label) correct++
    }
    expect(correct / data.length).toBeGreaterThan(0.75)
  })

  test('MLP apprend un dataset séparable', async () => {
    const data = syntheticDataset(60)
    const model = new MLPModel()
    await model.train(data)
    let correct = 0
    for (const s of data) {
      if (model.predict(s.features).prediction === s.label) correct++
    }
    expect(correct / data.length).toBeGreaterThan(0.75)
  })

  test('chaque modèle retourne des probabilités normalisées', async () => {
    const data = syntheticDataset(30)
    for (const Model of [LightGBMModel, CatBoostModel, MLPModel]) {
      const m = new Model()
      await m.train(data)
      const res = m.predict([0, 0, 1])
      const sum = Object.values(res.probabilities).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 3)
      expect(res.confidence).toBeGreaterThan(0)
      expect(res.confidence).toBeLessThanOrEqual(100)
    }
  })
})

describe('runBenchmark', () => {
  test('produit un classement avec les 5 modèles et un vainqueur', async () => {
    const data = syntheticDataset(80)
    const outcome = await runBenchmark(data, { seed: 7 })
    expect(outcome.ranked.length).toBe(5)
    expect(outcome.bestModelId).not.toBeNull()
    expect(outcome.datasetSize).toBe(80)
    const ids = outcome.ranked.map(r => r.modelId)
    expect(ids).toContain('random_forest')
    expect(ids).toContain('xgboost')
    expect(ids).toContain('lightgbm')
    expect(ids).toContain('catboost')
    expect(ids).toContain('mlp')
    // Chaque résultat a les métriques demandées
    for (const r of outcome.ranked) {
      expect(typeof r.accuracy).toBe('number')
      expect(typeof r.precision).toBe('number')
      expect(typeof r.recall).toBe('number')
      expect(typeof r.f1Score).toBe('number')
      expect(typeof r.rocAuc).toBe('number')
      expect(r.trainTimeMs).toBeGreaterThan(0)
      expect(r.predictTimeMs).toBeGreaterThan(0)
      expect(r.maturiteLabel).toMatch(/^N[1-5]/)
    }
    // Classement trié décroissant par score
    for (let i = 1; i < outcome.ranked.length; i++) {
      expect(outcome.ranked[i].score).toBeLessThanOrEqual(outcome.ranked[i - 1].score)
    }
  })

  test('échoue si moins de 10 échantillons', async () => {
    const data = syntheticDataset(5)
    await expect(runBenchmark(data)).rejects.toThrow(/minimum 10/)
  })
})

describe('configuration hyperparamètres', () => {
  test('validerBenchmarkConfig borne les valeurs hors limites', () => {
    const config = validerBenchmarkConfig({
      random_forest: { nTrees: 9999, maxDepth: 0 },
      mlp: { hiddenDim: 2, epochs: -5, learningRate: 3 },
    })
    expect(config.random_forest.nTrees).toBeLessThanOrEqual(100)
    expect(config.random_forest.maxDepth).toBeGreaterThanOrEqual(2)
    expect(config.mlp.hiddenDim).toBeGreaterThanOrEqual(4)
    expect(config.mlp.epochs).toBeGreaterThanOrEqual(20)
    expect(config.mlp.learningRate).toBeLessThanOrEqual(0.5)
    // Les valeurs absentes restent aux défauts
    expect(config.xgboost).toEqual(DEFAULT_BENCHMARK_CONFIG.xgboost)
  })

  test('configEstPersonnalisee détecte un écart aux défauts', () => {
    expect(configEstPersonnalisee(DEFAULT_BENCHMARK_CONFIG)).toBe(false)
    const modifiée = validerBenchmarkConfig({ xgboost: { nEstimators: 80 } })
    expect(configEstPersonnalisee(modifiée)).toBe(true)
  })

  test('chaque modèle expose des hyperparamètres bornés cohérents', () => {
    expect(MODEL_HYPERPARAMS.random_forest.map(p => p.key)).toEqual(['nTrees', 'maxDepth'])
    for (const defs of Object.values(MODEL_HYPERPARAMS)) {
      for (const def of defs) {
        expect(def.min).toBeLessThanOrEqual(def.max)
        expect(def.step).toBeGreaterThan(0)
        expect(typeof def.label).toBe('string')
      }
    }
  })

  test('creerModelesBenchmark applique la config fournie', async () => {
    const data = syntheticDataset(30)
    const config = validerBenchmarkConfig({ lightgbm: { nEstimators: 5 } })
    const models = creerModelesBenchmark(config)
    const lightgbm = models.find(m => m.info.id === 'lightgbm') as LightGBMModel
    // Apprentissage possible avec la config (nEstimators réduit)
    await expect(lightgbm.train(data)).resolves.toBeUndefined()
    expect(models).toHaveLength(5)
  })

  test('runBenchmark accepte une config personnalisée', async () => {
    const data = syntheticDataset(60)
    const config = validerBenchmarkConfig({
      random_forest: { nTrees: 30, maxDepth: 8 },
      mlp: { epochs: 60, hiddenDim: 8 },
    })
    const outcome = await runBenchmark(data, { seed: 3, config })
    expect(outcome.ranked).toHaveLength(5)
    expect(outcome.bestModelId).not.toBeNull()
  })
})
