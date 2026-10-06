// lib/ia/apprentissageStatus.ts
// Lecture du tableau de bord d'apprentissage AERORISQ : précision des
// prédictions (ia_thresholds), dataset (ia_training_dataset, ml_samples,
// prediction_suivi), derniers runs (ia_training_logs), modèle local (Ollama).
// RLS désactivée sur les tables ia_*/ml_samples : lecture anonyme OK.

import { supabase } from '../supabase'
import { PLAN_APPRENTISSAGE } from './predictionLearning'

export interface PrecisionPredictions {
  n3m: number | null
  mae3m: number | null
  biais3m: number | null
  n6m: number | null
  mae6m: number | null
  biais6m: number | null
}

export interface CompteursDataset {
  exemplesValides: number | null
  pairesEcarts: number | null
  preuvesTranscrites: number | null
  rapportsTransmis: number | null
  mlSamples: number | null
  predictionsSuivies: number | null
  predictionsVerifiees: number | null
}

export interface RunBoucle {
  job: string
  dernierRun: string | null
  resume: Record<string, unknown> | null
}

export interface StatutApprentissage {
  precision: PrecisionPredictions
  dataset: CompteursDataset
  runs: RunBoucle[]
  modelesLocaux: string[]
}

async function compter(table: string, filtre?: (q: any) => any): Promise<number | null> {
  try {
    let q: any = supabase.from(table).select('id', { count: 'exact', head: true })
    if (filtre) q = filtre(q)
    const { count, error } = await q
    if (error) return null
    return count ?? null
  } catch {
    return null
  }
}

export async function lirePrecisionPredictions(): Promise<PrecisionPredictions> {
  const vide: PrecisionPredictions = { n3m: null, mae3m: null, biais3m: null, n6m: null, mae6m: null, biais6m: null }
  try {
    const { data, error } = await supabase.from('ia_thresholds').select('parametre, valeur').like('parametre', 'pred\\_%')
    if (error || !data) return vide
    const map = new Map((data as Array<{ parametre: string; valeur: number }>).map(r => [r.parametre, Number(r.valeur)]))
    const v = (k: string) => (map.has(k) ? map.get(k)! : null)
    return {
      n3m: v('pred_3m_n'), mae3m: v('pred_3m_mae'), biais3m: v('pred_3m_biais'),
      n6m: v('pred_6m_n'), mae6m: v('pred_6m_mae'), biais6m: v('pred_6m_biais'),
    }
  } catch {
    return vide
  }
}

export async function lireCompteursDataset(): Promise<CompteursDataset> {
  const [exemples, paires, preuves, rapports, ml, suivies, verifiees] = await Promise.all([
    compter('ia_training_dataset'),
    compter('ia_training_dataset', q => q.eq('module', 'ecart-resolu')),
    compter('ia_training_dataset', q => q.eq('module', 'preuve-transcrite')),
    compter('ia_training_dataset', q => q.eq('module', 'rapport-transmis')),
    compter('ml_samples'),
    compter('prediction_suivi'),
    compter('prediction_suivi', q => q.or('verifie_3m.eq.true,verifie_6m.eq.true')),
  ])
  return {
    exemplesValides: exemples, pairesEcarts: paires, preuvesTranscrites: preuves,
    rapportsTransmis: rapports, mlSamples: ml, predictionsSuivies: suivies, predictionsVerifiees: verifiees,
  }
}

export async function lireDerniersRuns(): Promise<RunBoucle[]> {
  try {
    const { data, error } = await supabase
      .from('ia_training_logs')
      .select('type, run_at, resume')
      .order('run_at', { ascending: false })
      .limit(50)
    if (error || !data) return PLAN_APPRENTISSAGE.map(b => ({ job: b.job, dernierRun: null, resume: null }))
    const parType = new Map<string, { run_at: string; resume: Record<string, unknown> | null }>()
    for (const r of data as Array<{ type: string; run_at: string; resume: Record<string, unknown> | null }>) {
      if (!parType.has(r.type)) parType.set(r.type, { run_at: r.run_at, resume: r.resume })
    }
    return PLAN_APPRENTISSAGE.map(b => {
      const trouve = parType.get(b.job)
      return { job: b.job, dernierRun: trouve?.run_at || null, resume: trouve?.resume || null }
    })
  } catch {
    return PLAN_APPRENTISSAGE.map(b => ({ job: b.job, dernierRun: null, resume: null }))
  }
}

/** Modèles Ollama locaux (best-effort : injoignable hors poste local). */
export async function lireModelesLocaux(): Promise<string[]> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.models) ? data.models.map((m: { name?: string }) => m.name || '').filter(Boolean) : []
  } catch {
    return []
  }
}

export async function lireStatutApprentissage(): Promise<StatutApprentissage> {
  const [precision, dataset, runs, modelesLocaux] = await Promise.all([
    lirePrecisionPredictions(),
    lireCompteursDataset(),
    lireDerniersRuns(),
    lireModelesLocaux(),
  ])
  return { precision, dataset, runs, modelesLocaux }
}

/** Libellé humain du biais (signe) pour le DG. */
export function libelleBiais(biais: number | null): string {
  if (biais == null) return '—'
  if (biais > 1) return `pessimiste (+${biais})`
  if (biais < -1) return `optimiste (${biais})`
  return 'neutre'
}
