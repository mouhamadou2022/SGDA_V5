// lib/persistence/syncBayesCPTs.ts
// Pont entre IndexedDB (cache local) et Supabase (autorité unique)
// pour les CPT du réseau bayésien causal.

import { iaStorage } from './iaStorage'

const API_BASE = '/api/bayes-cpts'

export interface BayesCPTData {
  aerodrome_id: string
  bow_tie_domaine: string
  noeuds: any[]
  nb_observations_total: number
  derniere_maj: string
}

export async function pullCPTsFromSupabase(aerodromeId: string, domaine: string): Promise<Record<string, { observations: Record<string, number[]> }> | null> {
  try {
    const res = await fetch(`${API_BASE}?aerodrome_id=${aerodromeId}&domaine=${encodeURIComponent(domaine)}`)
    if (!res.ok) return null
    const json = await res.json()
    const row = json.data?.[0]
    if (!row?.noeuds) return null

    const result: Record<string, { observations: Record<string, number[]> }> = {}
    for (const n of row.noeuds) {
      result[n.id] = { observations: n.cpt?.observations || {} }
    }
    return result
  } catch {
    return null
  }
}

export async function pushCPTsToSupabase(
  aerodromeId: string,
  domaine: string,
  noeuds: any[]
): Promise<boolean> {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aerodrome_id: aerodromeId, bow_tie_domaine: domaine, noeuds }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function syncIndexedDBFromSupabase(aerodromeId: string, domaine: string): Promise<void> {
  const supabaseData = await pullCPTsFromSupabase(aerodromeId, domaine)
  if (!supabaseData) return

  const storeKey = `cpts_bt-${domaine}`
  const localData = await iaStorage.get<Record<string, { observations: Record<string, number[]> }>>('bayes_cpts', storeKey)
  if (!localData) {
    await iaStorage.set('bayes_cpts', storeKey, supabaseData)
    return
  }

  for (const [nodeId, nodeData] of Object.entries(supabaseData)) {
    if (!localData[nodeId]) {
      localData[nodeId] = nodeData
    }
  }
  await iaStorage.set('bayes_cpts', storeKey, localData)
}

export async function syncSupabaseFromIndexedDB(
  aerodromeId: string,
  domaine: string,
  noeuds: any[]
): Promise<boolean> {
  return pushCPTsToSupabase(aerodromeId, domaine, noeuds)
}
