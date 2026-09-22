// lib/datastore/surveillances.ts — Domaine surveillances (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Surveillance } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// SURVEILLANCES
// ─────────────────────────────────────────────────────────────

export async function fetchSurveillances(): Promise<DatastoreResult<Surveillance[]>> {
  const { data, error } = await supabase
    .from('surveillances')
    .select('*')
    .order('date_debut', { ascending: false })
  return { data: data as Surveillance[] | null, error: error?.message ?? null }
}

export async function fetchSurveillanceById(id: string): Promise<DatastoreResult<Surveillance>> {
  const { data, error } = await supabase
    .from('surveillances')
    .select('*')
    .eq('id', id)
    .single()
  return { data: data as Surveillance | null, error: error?.message ?? null }
}

// ── Auto-réparation des écritures surveillances ──────────────────────────────
// PostgREST rejette toute écriture mentionnant une colonne absente du schéma
// (ex : migration pas encore exécutée). On extrait le nom de la colonne fautive
// du message d'erreur et on réessaie sans elle — le reste de la sauvegarde
// passe au lieu d'échouer entièrement.
function extraireColonneInconnue(message: string): string | null {
  const pgrst204 = message.match(/Could not find the '([^']+)' column/)
  if (pgrst204) return pgrst204[1]
  const pg42703 = message.match(/column\s+\S+\.([A-Za-z0-9_]+)\s+does not exist/i)
  if (pg42703) return pg42703[1]
  return null
}

async function ecrireAvecReparation<T>(
  ecrire: (payload: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
  payloadInitial: Record<string, unknown>
): Promise<DatastoreResult<T>> {
  const payload = { ...payloadInitial }
  for (let tentative = 0; tentative < 10; tentative++) {
    const { data, error } = await ecrire(payload)
    if (!error) return { data, error: null }
    const colonne = extraireColonneInconnue(error.message ?? '')
    if (!colonne || !(colonne in payload)) {
      return { data: null, error: error.message ?? 'Erreur inconnue' }
    }
    console.warn(`[datastore] Colonne absente en base : "${colonne}" — nouvelle tentative sans elle`)
    delete payload[colonne]
  }
  return { data: null, error: 'Trop de colonnes inconnues, écriture abandonnée' }
}

export async function createSurveillance(payload: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Surveillance>> {
  const now = new Date().toISOString()

  // equipe_ids est géré via la table junction surveillance_equipe
  const { equipe_ids, ...payloadClean } = payload as any

  let result = await ecrireAvecReparation<Surveillance>(
    (p) => supabase.from('surveillances').insert({ ...p, created_at: now, updated_at: now }).select().single(),
    payloadClean
  )
  let data = result.data
  let error = result.error

  // Sécurité : si le planning_id référence un planning inexistant en Supabase
  // (possible avec des bundles JS obsolètes), on réessaie sans planning_id.
  const isPlanningFkError = (err: string | null) =>
    !!err && err.toLowerCase().includes('surveillances_planning_id_fkey')
  if (error && isPlanningFkError(error) && 'planning_id' in payloadClean) {
    const { planning_id: _, ...payloadSansPlanning } = payloadClean
    result = await ecrireAvecReparation<Surveillance>(
      (p) => supabase.from('surveillances').insert({ ...p, created_at: now, updated_at: now }).select().single(),
      payloadSansPlanning
    )
    data = result.data
    error = result.error
  }

  if (data && equipe_ids && equipe_ids.length > 0) {
    for (const userId of equipe_ids) {
      try {
        await supabase.from('surveillance_equipe').insert({
          surveillance_id: data.id,
          utilisateur_id: userId,
        })
      } catch { /* ignore */ }
    }
  }

  return { data: data as Surveillance | null, error }
}

export async function updateSurveillance(id: string, payload: Partial<Surveillance>): Promise<DatastoreResult<Surveillance>> {
  // equipe_ids est géré via la table junction surveillance_equipe ;
  // tout le reste (dont les champs SGS) est persisté tel quel — et si une
  // colonne manque encore en base, ecrireAvecReparation dégrade proprement.
  const { equipe_ids, ...payloadClean } = payload as any

  const { data, error } = await ecrireAvecReparation<Surveillance>(
    (p) => supabase.from('surveillances').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single(),
    payloadClean
  )
  
  // Mettre à jour les membres d'équipe dans la table junction
  if (data && equipe_ids !== undefined) {
    // Supprimer les anciens membres
    try { await supabase.from('surveillance_equipe').delete().eq('surveillance_id', id) } catch { /* ignore */ }
    // Insérer les nouveaux
    for (const userId of equipe_ids) {
      try {
        await supabase.from('surveillance_equipe').insert({
          surveillance_id: id,
          utilisateur_id: userId,
        })
      } catch { /* ignore */ }
    }
  }

  return { data: data as Surveillance | null, error }
}

export async function deleteSurveillance(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('surveillances').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// sanitizeEcart : voir ./_shared.ts (partage hub + domaine ecarts).
