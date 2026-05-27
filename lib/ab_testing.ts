// lib/ab_testing.ts
// A/B testing entre neural_net (serveur) et formules déterministes (client)
// Compare les prédictions des deux méthodes et tracke la précision de chacune

export type ABTestVariant = 'neural_net' | 'formulas'

export interface ABTestRecord {
  id: string
  aerodrome_id: string
  code_oaci: string
  date: string
  features: number[]
  score_neural_net: number
  score_formulas: number
  winner: ABTestVariant | 'tie' | 'pending'
  actual_score?: number // Score réel observé après un certain délai
  drift: number // Écart entre prédiction et score réel (une fois connu)
}

const STORAGE_KEY = 'sgda_ab_testing'
const MAX_RECORDS = 500

function getRecords(): ABTestRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecords(records: ABTestRecord[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)))
  } catch {
    // localStorage plein — on nettoie
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function recordABTest(data: Omit<ABTestRecord, 'id' | 'date' | 'drift' | 'winner'> & { winner?: ABTestVariant | 'tie' }): ABTestRecord {
  const record: ABTestRecord = {
    ...data,
    id: generateId(),
    date: new Date().toISOString(),
    drift: 0,
    winner: data.winner ?? (data.score_neural_net === data.score_formulas ? 'tie' : Math.abs(data.score_neural_net - 50) < Math.abs(data.score_formulas - 50) ? 'neural_net' : 'formulas'),
  }
  const records = getRecords()
  records.push(record)
  saveRecords(records)
  return record
}

export function getABStats() {
  const records = getRecords()
  const total = records.length
  if (total === 0) return null

  const withActual = records.filter(r => r.actual_score != null)
  const neuralWins = records.filter(r => r.winner === 'neural_net').length
  const formulasWins = records.filter(r => r.winner === 'formulas').length
  const ties = records.filter(r => r.winner === 'tie').length
  const pending = records.filter(r => r.winner === 'pending').length

  let neuralMAE = 0
  let formulasMAE = 0
  if (withActual.length > 0) {
    neuralMAE = withActual.reduce((s, r) => s + Math.abs((r.actual_score ?? 0) - r.score_neural_net), 0) / withActual.length
    formulasMAE = withActual.reduce((s, r) => s + Math.abs((r.actual_score ?? 0) - r.score_formulas), 0) / withActual.length
  }

  return {
    total,
    neuralWins,
    formulasWins,
    ties,
    pending,
    neuralWinRate: total > 0 ? neuralWins / total : 0,
    formulasWinRate: total > 0 ? formulasWins / total : 0,
    withActual,
    neuralMAE: Math.round(neuralMAE * 100) / 100,
    formulasMAE: Math.round(formulasMAE * 100) / 100,
    bestProvider: neuralMAE < formulasMAE ? 'neural_net' : neuralMAE > formulasMAE ? 'formulas' : 'tie',
  }
}

export function getABHistory(days: number = 30): ABTestRecord[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return getRecords().filter(r => new Date(r.date).getTime() > cutoff)
}

export function updateActualScore(id: string, actualScore: number): void {
  const records = getRecords()
  const idx = records.findIndex(r => r.id === id)
  if (idx === -1) return
  records[idx].actual_score = actualScore
  records[idx].drift = actualScore - (Math.abs(records[idx].score_neural_net - 50) < Math.abs(records[idx].score_formulas - 50) ? records[idx].score_neural_net : records[idx].score_formulas)
  records[idx].winner = Math.abs(records[idx].score_neural_net - actualScore) < Math.abs(records[idx].score_formulas - actualScore)
    ? 'neural_net'
    : Math.abs(records[idx].score_neural_net - actualScore) > Math.abs(records[idx].score_formulas - actualScore)
      ? 'formulas'
      : 'tie'
  saveRecords(records)
}

export function clearABHistory(): void {
  saveRecords([])
}
