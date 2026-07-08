// lib/ia/syncEngineFeedback.ts
// Synchronise les feedbacks des engines entre sessionStorage et Supabase
// Appelé au montage de l'app et après chaque enregistrement

import { engineFeedback } from './engines/engineFeedback'
import { fetchIAFeedbacks, createIAFeedback } from '@/lib/datastore'
import type { EngineFeedbackRecord } from './engines/engineFeedback'

let synced = false

export async function chargerFeedbacksDepuisSupabase(): Promise<void> {
  if (synced || typeof window === 'undefined') return
  try {
    const result = await fetchIAFeedbacks()
    if (result.data && result.data.length > 0) {
      engineFeedback.initFromSupabase(result.data as EngineFeedbackRecord[])
    }
    synced = true
  } catch (err) {
    console.warn('[syncEngineFeedback] Échec chargement depuis Supabase:', err)
  }
}

export async function synchroniserFeedback(
  record: EngineFeedbackRecord,
): Promise<void> {
  try {
    await createIAFeedback({
      engineType: record.engineType as any,
      aerodromeId: record.aerodromeId,
      contexte: record.contexte,
      decision: record.decision,
      vote: record.vote as any,
      commentaire: record.commentaire,
      correctionUtilisateur: record.correctionUtilisateur,
    })
  } catch (err) {
    console.warn('[syncEngineFeedback] Échec sync Supabase:', err)
  }
}
