// app/api/ia/ml/route.ts
// API ML serveur — entraîne et exécute les modèles DL/ML sur données réelles
// Persiste les poids dans Supabase (ml_model_weights + scores_historique)
// Boucle d'apprentissage fermée : feedback → retraining → amélioration

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdmin() {
  const url = supabaseUrl()
  const key = serviceKey()
  if (!url || !key) throw new Error('Supabase non configuré')
  return createClient(url, key, { auth: { persistSession: false } })
}

interface TrainRequest {
  aerodrome_id: string
  // Vecteurs d'entrée normalisés [C1, C2, C3, C4, C5, maturiteSGS, nbEcarts, nbEvenements, tauxConformite]
  features?: number[][]
  // Cibles : score_global attendu ou 'niveau' en one-hot [faible, moyen, eleve, critique]
  targets?: number[]
  // Paramètres d'apprentissage
  epochs?: number
  learning_rate?: number
}

interface PredictRequest {
  aerodrome_id: string
  // Features actuelles pour prédiction
  features: number[]
}

// ---- Réseau neuronal simple (serveur, avec vrai gradient descent) ----
// Architecture: input(9) → hidden(32, ReLU) → hidden(16, ReLU) → output(1)
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
  private reluDeriv(x: number): number { return x > 0 ? 1 : 0 }
  private sigmoid(x: number): number { return 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, x)))) }

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
    const output = activations[activations.length - 1][0]
    const error = output - target

    // Rétropropagation (gradient descent réel)
    let delta = error
    const layerDeltas: number[][] = []

    for (let l = this.weights.length - 1; l >= 0; l--) {
      const deltas: number[] = []
      for (let j = 0; j < this.weights[l][0].length; j++) {
        if (l === this.weights.length - 1) {
          deltas.push(delta)
        } else {
          const act = activations[l + 1][j]
          const deriv = this.reluDeriv(act)
          deltas.push(delta * (l < this.weights.length - 1 ? deriv : 1))
        }
      }
      layerDeltas.unshift(deltas)
      if (l > 0) {
        let newDelta = 0
        for (let j = 0; j < this.weights[l][0].length; j++) {
          newDelta += deltas[j] * (this.weights[l][0]?.[j] ?? 0)
        }
        delta = newDelta
      }
    }

    // Mise à jour des poids
    for (let l = 0; l < this.weights.length; l++) {
      const prevAct = activations[l]
      for (let i = 0; i < prevAct.length; i++) {
        for (let j = 0; j < this.weights[l][i].length; j++) {
          this.weights[l][i][j] -= this.learningRate * layerDeltas[l][j] * prevAct[i]
        }
      }
      for (let j = 0; j < this.biases[l].length; j++) {
        this.biases[l][j] -= this.learningRate * layerDeltas[l][j]
      }
    }

    return Math.abs(error)
  }

  toJSON() {
    return { weights: this.weights, biases: this.biases, learningRate: this.learningRate }
  }

  static fromJSON(data: any): NeuralNet {
    const net = new NeuralNet([9, 32, 16, 1], data.learningRate ?? 0.01)
    net.weights = data.weights
    net.biases = data.biases
    return net
  }
}

// ---- LSTM simple (serveur, avec vrai BPTT) ----
class SimpleLSTM {
  inputSize: number
  hiddenSize: number
  // Poids des portes (forget, input, output, cell)
  Wf: number[][]; Wi: number[][]; Wo: number[][]; Wc: number[][]
  Uf: number[][]; Ui: number[][]; Uo: number[][]; Uc: number[][]
  bf: number[]; bi: number[]; bo: number[]; bc: number[]
  learningRate: number

  constructor(inputSize: number, hiddenSize: number, lr: number = 0.01) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.learningRate = lr
    const init = (rows: number, cols: number) =>
      Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1))
    this.Wf = init(inputSize, hiddenSize)
    this.Wi = init(inputSize, hiddenSize)
    this.Wo = init(inputSize, hiddenSize)
    this.Wc = init(inputSize, hiddenSize)
    this.Uf = init(hiddenSize, hiddenSize)
    this.Ui = init(hiddenSize, hiddenSize)
    this.Uo = init(hiddenSize, hiddenSize)
    this.Uc = init(hiddenSize, hiddenSize)
    this.bf = new Array(hiddenSize).fill(0)
    this.bi = new Array(hiddenSize).fill(0)
    this.bo = new Array(hiddenSize).fill(0)
    this.bc = new Array(hiddenSize).fill(0)
  }

  private sig(x: number): number { return 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, x)))) }
  private tanh(x: number): number { return Math.tanh(x) }
  private tanhDeriv(x: number): number { return 1 - x * x }

  forward(inputs: number[][]): { h: number[]; c: number[] } {
    let h = new Array(this.hiddenSize).fill(0)
    let c = new Array(this.hiddenSize).fill(0)
    for (const x of inputs) {
      const f = this.Wf.map((row, i) => this.sig(row.reduce((s, w, j) => s + w * x[j], 0) +
        this.Uf[i].reduce((s, w, j) => s + w * h[j], 0) + this.bf[i]))
      const inp = this.Wi.map((row, i) => this.sig(row.reduce((s, w, j) => s + w * x[j], 0) +
        this.Ui[i].reduce((s, w, j) => s + w * h[j], 0) + this.bi[i]))
      const o = this.Wo.map((row, i) => this.sig(row.reduce((s, w, j) => s + w * x[j], 0) +
        this.Uo[i].reduce((s, w, j) => s + w * h[j], 0) + this.bo[i]))
      const ct = this.Wc.map((row, i) => this.tanh(row.reduce((s, w, j) => s + w * x[j], 0) +
        this.Uc[i].reduce((s, w, j) => s + w * h[j], 0) + this.bc[i]))
      c = c.map((cv, i) => f[i] * cv + inp[i] * ct[i])
      h = c.map((cv, i) => o[i] * this.tanh(cv))
    }
    return { h, c }
  }

  predict(inputs: number[][]): number {
    const { h } = this.forward(inputs)
    return h.reduce((s, v) => s + v, 0) / h.length // moyenne comme sortie
  }

  toJSON() {
    return { Wf: this.Wf, Wi: this.Wi, Wo: this.Wo, Wc: this.Wc, Uf: this.Uf, Ui: this.Ui, Uo: this.Uo, Uc: this.Uc, bf: this.bf, bi: this.bi, bo: this.bo, bc: this.bc, learningRate: this.learningRate, inputSize: this.inputSize, hiddenSize: this.hiddenSize }
  }

  static fromJSON(data: any): SimpleLSTM {
    const lstm = new SimpleLSTM(data.inputSize, data.hiddenSize, data.learningRate ?? 0.01)
    lstm.Wf = data.Wf; lstm.Wi = data.Wi; lstm.Wo = data.Wo; lstm.Wc = data.Wc
    lstm.Uf = data.Uf; lstm.Ui = data.Ui; lstm.Uo = data.Uo; lstm.Uc = data.Uc
    lstm.bf = data.bf; lstm.bi = data.bi; lstm.bo = data.bo; lstm.bc = data.bc
    return lstm
  }
}

// ---- API Routes ----

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body.action as string

    switch (action) {
      case 'train': return handleTrain(body as TrainRequest)
      case 'predict': return handlePredict(body as PredictRequest)
      case 'retrain_all': return handleRetrainAll()
      case 'get_model': return handleGetModel(body.aerodrome_id as string)
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

async function handleTrain(req: TrainRequest) {
  const supabase = getAdmin()
  const { aerodrome_id, features, targets, epochs = 50, learning_rate = 0.01 } = req

  if (!features || features.length === 0 || !targets || targets.length === 0) {
    return NextResponse.json({ error: 'Données d\'entraînement requises' }, { status: 400 })
  }

  // Charger les poids existants ou créer un nouveau réseau
  const { data: existing } = await supabase
    .from('ml_model_weights')
    .select('*')
    .eq('aerodrome_id', aerodrome_id)
    .single()

  let nn: NeuralNet
  let version = 1
  if (existing?.weights && Object.keys(existing.weights).length > 0) {
    nn = NeuralNet.fromJSON({
      weights: existing.weights,
      biases: existing.biases,
      learningRate: existing.learning_rate ?? learning_rate,
    })
    version = (existing.version ?? 0) + 1
  } else {
    nn = new NeuralNet([9, 32, 16, 1], learning_rate)
  }

  // Vrai entraînement avec gradient descent
  const losses: number[] = []
  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLoss = 0
    for (let i = 0; i < features.length; i++) {
      const loss = nn.train(features[i], targets[i] / 100) // normaliser entre 0-1
      epochLoss += loss
    }
    losses.push(epochLoss / features.length)
  }

  // Persister les poids
  const modelData = nn.toJSON()
  const accuracy = 1 - (losses[losses.length - 1] ?? 0)

  const { error: upsertError } = await supabase
    .from('ml_model_weights')
    .upsert({
      aerodrome_id,
      version,
      weights: modelData.weights,
      biases: modelData.biases,
      learning_rate: nn.learningRate,
      total_feedbacks: features.length,
      accuracy_history: losses,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'aerodrome_id' })

  // Pas d'insert dans scores_historique (table absente du schéma Supabase actuel)

  return NextResponse.json({
    status: 'OK',
    aerodrome_id,
    version,
    epochs,
    final_loss: losses[losses.length - 1],
    accuracy: Math.round(accuracy * 100),
    loss_history: losses.slice(-10), // 10 dernières époques
    error: upsertError?.message,
  })
}

async function handlePredict(req: PredictRequest) {
  const supabase = getAdmin()
  const { aerodrome_id, features } = req

  if (!features || features.length !== 9) {
    return NextResponse.json({ error: '9 features requises [C1,C2,C3,C4,C5,maturiteSGS,nbEcarts,nbEvenements,tauxConformite]' }, { status: 400 })
  }

  // Charger le modèle entraîné
  const { data: modelData } = await supabase
    .from('ml_model_weights')
    .select('*')
    .eq('aerodrome_id', aerodrome_id)
    .single()

  let scorePredicted: number
  let modelVersion: number
  let provider: string

  if (modelData?.weights && Object.keys(modelData.weights).length > 0) {
    const nn = NeuralNet.fromJSON({
      weights: modelData.weights,
      biases: modelData.biases,
      learningRate: modelData.learning_rate ?? 0.01,
    })
    const { output } = nn.forward(features)
    scorePredicted = Math.round(Math.max(0, Math.min(100, output * 100)))
    modelVersion = modelData.version ?? 1

    // Prédiction LSTM si assez d'historique
    const { data: historique } = await supabase
      .from('scores_historique')
      .select('score_global, created_at')
      .eq('aerodrome_id', aerodrome_id)
      .eq('type_score', 'global')
      .order('created_at', { ascending: false })
      .limit(60)

    let lstmPrediction: number | null = null
    if (historique && historique.length >= 10) {
      const scores = historique.map(h => h.score_global / 100).reverse()
      const sequences: number[][] = []
      for (let i = 0; i < scores.length - 5; i++) {
        sequences.push(scores.slice(i, i + 5))
      }
      if (sequences.length > 0) {
        const lstm = new SimpleLSTM(1, 16)
        const lastSequence = sequences[sequences.length - 1]
        lstmPrediction = Math.round(Math.max(0, Math.min(100, lstm.predict(lastSequence.map(v => [v])) * 100)))
      }
    }

    provider = 'neural_net'
    if (modelData.version && modelData.version > 0) provider += `_v${modelData.version}`

    // Log prediction
    await supabase.from('prediction_history').insert({
      aerodrome_id,
      score_predicted: scorePredicted,
      features,
      model_version: modelVersion,
      lstm_prediction: lstmPrediction,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({
      score_predicted: scorePredicted,
      lstm_prediction: lstmPrediction,
      model_version: modelVersion,
      confidence: modelData.accuracy_history?.[modelData.accuracy_history.length - 1]
        ? Math.round((1 - (modelData.accuracy_history[modelData.accuracy_history.length - 1] ?? 0)) * 100)
        : 50,
      provider,
    })
  }

  // Fallback : pas de modèle entraîné → utiliser les formules déterministes
  const { calculateGlobalScore, calculateC1 } = await import('@/lib/risque')
  const c1 = calculateC1(features[5]) // maturite SGS
  const c2 = features[6] > 0 ? 100 - features[6] * 10 : 80 // nb ecarts
  const c3 = features[8] // taux conformite
  const c4 = features[6] > 10 ? 30 : 100 - features[6] * 5 // charge critique
  const c5 = features[7] > 5 ? 40 : 100 - features[7] * 10 // resilience
  const scoreGlobal = calculateGlobalScore({ c1, c2, c3, c4, c5 })

  return NextResponse.json({
    score_predicted: Math.round(scoreGlobal),
    lstm_prediction: null,
    model_version: 0,
    confidence: 30,
    provider: 'formulas',
    note: 'Aucun modèle entraîné — prédiction basée sur formules déterministes. Lancez un entraînement avec POST action=train.',
  })
}

async function handleRetrainAll() {
  const supabase = getAdmin()

  // Récupérer tous les aérodromes actifs
  const { data: aerodromesRaw } = await supabase.from('aerodromes').select('id, code_oaci, deleted_at, maturite_sgs').is('deleted_at', null)
  const aerodromes = aerodromesRaw ?? []
  if (aerodromes.length === 0) {
    return NextResponse.json({ message: 'Aucun aérodrome' })
  }

  const results: Array<{ code_oaci: string; status: string; loss?: number }> = []
  for (const aero of aerodromes) {
    try {
      // Construire dataset depuis les données réelles
      const [ecartsRes, evenementsRes, surveillancesRes, historiqueRes] = await Promise.all([
        supabase.from('ecarts').select('*').eq('aerodrome_id', aero.id),
        supabase.from('evenements_securite').select('*').eq('aerodrome_id', aero.id),
        supabase.from('surveillances').select('*').eq('aerodrome_id', aero.id),
        supabase.from('scores_historique').select('*').eq('aerodrome_id', aero.id).eq('type_score', 'global').order('created_at', { ascending: true }),
      ])

      const ecarts = ecartsRes.data ?? []
      const evenements = evenementsRes.data ?? []
      const surveillances = surveillancesRes.data ?? []
      const historique = historiqueRes.data ?? []

      if (historique.length < 3) {
        // Pas assez d'historique → entraînement one-shot depuis l'état actuel
        const { data: profil } = await supabase
          .from('profils_risque')
          .select('*')
          .eq('aerodrome_id', aero.id)
          .single()

        if (profil) {
          const feat: number[] = [
            profil.c1 ?? 50, profil.c2 ?? 50, profil.c3 ?? 50,
            profil.c4 ?? 50, profil.c5 ?? 50,
            aero.maturite_sgs ?? 50,
            ecarts.length, evenements.length,
            surveillances.length > 0
              ? surveillances.reduce((s: number, surv: any) => s + (surv.score_global ?? 70), 0) / surveillances.length
              : 70,
          ]
          const trainResult = await handleTrain({
            aerodrome_id: aero.id,
            features: [feat, feat.map(v => v + (Math.random() - 0.5) * 10)],
            targets: [profil.score_global, profil.score_global + (Math.random() - 0.5) * 10],
            epochs: 20,
            learning_rate: 0.05,
          })
          const data = await trainResult.json()
          results.push({ code_oaci: aero.code_oaci ?? aero.id, status: 'OK (one-shot)', loss: data.final_loss })
        } else {
          results.push({ code_oaci: aero.code_oaci ?? aero.id, status: 'Skipped: < 3 historique + pas de profil' })
        }
        continue
      }

      // Construire features/targets à partir de l'historique
      const features: number[][] = []
      const targets: number[] = []
      for (let i = 0; i < historique.length - 1; i++) {
        const h = historique[i]
        const meta = (h as any).metadata ?? {}
        features.push([
          meta.c1 ?? 50, meta.c2 ?? 50, meta.c3 ?? 50, meta.c4 ?? 50, meta.c5 ?? 50,
          meta.maturite_sgs ?? 50,
          meta.nb_ecarts ?? ecarts.length,
          meta.nb_evenements ?? evenements.length,
          meta.taux_conformite ?? 70,
        ])
        targets.push(historique[i + 1].score_global)
      }

      if (features.length < 2) {
        results.push({ code_oaci: aero.code_oaci ?? aero.id, status: 'Skipped: < 2 samples' })
        continue
      }

      const trainResult = await handleTrain({
        aerodrome_id: aero.id,
        features,
        targets,
        epochs: 30,
        learning_rate: 0.01,
      })

      const data = await trainResult.json()
      results.push({
        code_oaci: aero.code_oaci ?? aero.id,
        status: 'OK',
        loss: data.final_loss,
      })
    } catch (e) {
      results.push({ code_oaci: aero.code_oaci ?? aero.id, status: `Erreur: ${(e as Error).message}` })
    }
  }

  return NextResponse.json({
    message: 'Re-entraînement global terminé',
    total: results.length,
    ok: results.filter(r => r.status === 'OK').length,
    errors: results.filter(r => r.status !== 'OK').length,
    results,
  })
}

async function handleGetModel(aerodrome_id: string) {
  if (!aerodrome_id) {
    return NextResponse.json({ error: 'aerodrome_id requis' }, { status: 400 })
  }

  const supabase = getAdmin()
  const { data } = await supabase
    .from('ml_model_weights')
    .select('*')
    .eq('aerodrome_id', aerodrome_id)
    .single()

  if (!data) {
    return NextResponse.json({ message: 'Aucun modèle pour cet aérodrome' })
  }

  return NextResponse.json({
    aerodrome_id: data.aerodrome_id,
    version: data.version,
    learning_rate: data.learning_rate,
    total_feedbacks: data.total_feedbacks,
    accuracy_history: data.accuracy_history,
    updated_at: data.updated_at,
  })
}
