// lib/datastore/ecarts.ts — Domaine ecarts (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Ecart } from '../store';
import { DatastoreResult, sanitizeEcart } from './_shared';

// ─────────────────────────────────────────────────────────────
// ÉCARTS
// ─────────────────────────────────────────────────────────────

export async function fetchEcarts(surveillanceId?: string): Promise<DatastoreResult<Ecart[]>> {
  let query = supabase.from('ecarts').select('*').order('created_at', { ascending: false })
  if (surveillanceId) query = query.eq('surveillance_id', surveillanceId)
  const { data, error } = await query
  return { data: ((data ?? []) as Ecart[]).map(sanitizeEcart) as Ecart[] | null, error: error?.message ?? null }
}

export async function createEcart(payload: Omit<Ecart, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Ecart>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('ecarts')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as Ecart | null, error: error?.message ?? null }
}

export async function updateEcart(id: string, payload: Partial<Ecart>): Promise<DatastoreResult<Ecart>> {
  const { data, error } = await supabase
    .from('ecarts')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('[datastore/updateEcart] Supabase error:', error)
  }
  return { data: data as Ecart | null, error: error?.message ?? null }
}

export async function upsertEcart(payload: Ecart): Promise<DatastoreResult<Ecart>> {
  const { data, error } = await supabase
    .from('ecarts')
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  if (error) {
    console.error('[datastore/upsertEcart] Supabase error message:', error.message)
    console.error('[datastore/upsertEcart] Supabase error details:', (error as any).details)
    console.error('[datastore/upsertEcart] Supabase error hint:', (error as any).hint)
    console.error('[datastore/upsertEcart] Supabase error code:', (error as any).code)
  }
  return { data: data as Ecart | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// ÉCARTS RÉDACTION (brouillons — persistance entre sessions)
// ─────────────────────────────────────────────────────────────

// Colonnes réelles de la table Supabase `ecarts_redaction` (doit rester aligné
// avec l'interface EcartRedaction dans store.ts). Tout champ hors de cette liste
// est rejeté par Supabase ("Could not find the 'X' column ... in the schema cache")
// car ces brouillons ne portent pas les champs propres à l'écart final (ex: delai_pac).
const ECARTS_REDACTION_COLUMNS = [
  'id', 'reference', 'ref_reglementaire', 'libelle', 'niveau', 'item_ids',
  'surveillance_id', 'aerodrome_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
  'domaine', 'cellule_risque_oaci', 'probabilite_risque', 'gravite_risque',
  'justification_risque_ia', 'cellule_ia_suggeree',
] as const

// Colonnes de type uuid dans `ecarts_redaction` : Postgres rejette les chaînes
// vides ("invalid input syntax for type uuid: \"\"") pour ces champs.
const ECARTS_REDACTION_UUID_COLUMNS = new Set(['id', 'surveillance_id', 'created_by', 'updated_by'])

function toEcartRedactionRow(e: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {}
  for (const col of ECARTS_REDACTION_COLUMNS) {
    if (e[col] === undefined) continue
    // On omet toute valeur vide (ex: user non authentifié) pour les colonnes uuid,
    // sinon Supabase renvoie une erreur de syntaxe.
    if (ECARTS_REDACTION_UUID_COLUMNS.has(col) && String(e[col]).trim() === '') continue
    // `item_ids` est un tableau d'identifiants : on force chaque élément en
    // string et on écarte tout objet non-primitif (garde-fou anti-fuite d'un
    // objet circulaire/Event dans la persistance).
    if (col === 'item_ids') {
      row[col] = (Array.isArray(e[col]) ? e[col] : []).map((id: unknown) =>
        (typeof id === 'string' || typeof id === 'number') ? String(id) : undefined
      ).filter((v: unknown): v is string => typeof v === 'string')
      continue
    }
    // Les autres colonnes sont des primitives ; tout objet non-primitif est
    // converti en chaîne sécurisée pour éviter un JSON.stringify circulaire.
    const v = e[col]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      row[col] = v
    } else {
      row[col] = String(v)
    }
  }
  return row
}

/**
 * Sauvegarde (upsert) les écarts rédaction d'une surveillance dans Supabase.
 * Appelé depuis les pages /ecarts et /ecarts/sgs après chaque modification.
 */
export async function upsertEcartsRedaction(ecarts: any[]): Promise<void> {
  if (!ecarts.length) return
  const { error } = await supabase
    .from('ecarts_redaction')
    .upsert(
      ecarts.map(e => toEcartRedactionRow({ ...e, updated_at: new Date().toISOString() })),
      { onConflict: 'id', ignoreDuplicates: false }
    )
  if (error) console.error('[datastore] upsertEcartsRedaction error:', error.message)
  await purgeEcartsRedaction(ecarts)
}

/**
 * Purge Supabase des écarts rédaction supprimés localement.
 *
 * Le fallback (fetch au rechargement) réinjectait les écarts supprimés car
 * l'upsert seul n'efface jamais les lignes absentes de la liste client → ils
 * « revenaient » après rechargement de la page.
 *
 * On ne purge que la famille de domaine portée par L'APPEL (SGS vs non-SGS),
 * pour que la page standard ne supprime pas les écarts SGS de la page dédiée
 * (et inversement) sur une surveillance mixte.
 */
async function purgeEcartsRedaction(ecarts: any[]): Promise<void> {
  const surv = String(ecarts[0]?.surveillance_id || '')
  if (!surv) return
  const keepIds = new Set(ecarts.map(e => String(e.id)).filter(Boolean))
  // Famille de domaine de cet appel : SGS si TOUS les écarts sont SGS, sinon standard
  const isSgsCall = ecarts.every(e => (e as any).domaine === 'SGS')
  const eq = isSgsCall ? 'SGS' : { neq: 'SGS' }

  // Récupère d'abord les ids réellement présents en base pour la surveillance +
  // famille de domaine, puis supprime par chunks la différence avec keepIds.
  //
  // On évite le filtre `.not('id', 'in', [...])` : avec un grand nombre d'ids
  // gardés (chaque UUI fait 36 caractères), la clause `in()` dépasse la limite
  // du proxy PostgREST et l'URL est refusée au parsing ("failed to parse filter").
  // Charger + différencier + supprimer par petits `.in()` est robuste quel que
  // soit le volume de la surveillance.
  let existing = null as any
  try {
    const { data, error } = await supabase
      .from('ecarts_redaction')
      .select('id')
      .eq('surveillance_id', surv)
      .eq('domaine', eq)
    existing = data
    if (error) {
      console.error('[datastore] purgeEcartsRedaction select error:', error.message)
      return
    }
  } catch (e) {
    console.error('[datastore] purgeEcartsRedaction select error:', (e as Error).message)
    return
  }

  const toDelete = (existing || [])
    .map((r: { id?: unknown }) => String(r?.id ?? ''))
    .filter((id: string) => id !== '' && !keepIds.has(id))

  const CHUNK = 50
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('ecarts_redaction')
      .delete()
      .eq('surveillance_id', surv)
      .in('id', chunk)
    if (error) console.error('[datastore] purgeEcartsRedaction error:', error.message)
  }
}

/**
 * Charge les écarts rédaction d'une surveillance depuis Supabase.
 * Utilisé comme fallback dans passerEtapeSuivante si le store Zustand est vide.
 */
export async function fetchEcartsRedactionBySurveillance(surveillanceId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('ecarts_redaction')
    .select('*')
    .eq('surveillance_id', surveillanceId)
  if (error) console.error('[datastore] fetchEcartsRedactionBySurveillance error:', error.message)
  return data ?? []
}
