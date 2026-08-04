// lib/ia/syncInspecteurMonitoring.ts
// Synchronise les retours de l'Inspecteur Virtuel (capacité/action) entre IndexedDB et Supabase.
// Appelé au montage de l'app et après chaque enregistrement (onSync).

import { inspecteurMonitoring } from './engines/inspecteurMonitoring'
import { fetchInspecteurFeedbacks, createInspecteurFeedback } from '@/lib/datastore'
import type { InspecteurFeedbackRecord } from './engines/inspecteurMonitoring'

let synced = false

export async function chargerInspecteurFeedbacksDepuisSupabase(): Promise<void> {
  if (synced || typeof window === 'undefined') return
  try {
    const result = await fetchInspecteurFeedbacks()
    if (result.data && result.data.length > 0) {
      inspecteurMonitoring.initFromSupabase(result.data.map(rowVersRecord))
    }
    synced = true
  } catch (err) {
    console.warn('[syncInspecteurMonitoring] Échec chargement depuis Supabase:', err)
  }
}

export async function synchroniserInspecteurFeedback(record: InspecteurFeedbackRecord): Promise<void> {
  try {
    await createInspecteurFeedback({
      capacite: record.capacite,
      action: record.action,
      aerodrome_id: record.aerodromeId ?? null,
      surveillance_id: record.surveillanceId ?? null,
      user_id: null,
      confiance: record.confiance ?? null,
    })
  } catch (err) {
    console.warn('[syncInspecteurMonitoring] Échec sync Supabase:', err)
  }
}

function rowVersRecord(row: {
  id: string
  created_at: string
  capacite: InspecteurFeedbackRecord['capacite']
  action: InspecteurFeedbackRecord['action']
  aerodrome_id: string | null
  surveillance_id: string | null
  confiance: number | null
}): InspecteurFeedbackRecord {
  return {
    id: row.id,
    date: row.created_at,
    capacite: row.capacite,
    action: row.action,
    aerodromeId: row.aerodrome_id ?? undefined,
    surveillanceId: row.surveillance_id ?? undefined,
    confiance: row.confiance ?? undefined,
  }
}
