// lib/datastore/certifications.ts — Domaine certifications (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Certification } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// CERTIFICATIONS & HOMOLOGATIONS
// ─────────────────────────────────────────────────────────────

export async function fetchCertifications(): Promise<DatastoreResult<Certification[]>> {
  const { data, error } = await supabase.from('certifications').select('*')
  return { data: data as Certification[] | null, error: error?.message ?? null }
}

export async function createCertification(payload: Certification): Promise<DatastoreResult<Certification>> {
  try {
    const allowedCols = [
      'id', 'aerodrome_id', 'reference', 'phase_active', 'phases_data',
      'statut_global', 'numero_cert', 'date_delivrance', 'date_expiration',
      'lettre_signee_url', 'type_certification', 'archived_at', 'exemptions_ids',
      'created_at',
    ]
    const clean: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowedCols) {
      if ((payload as unknown as Record<string, unknown>)[key] !== undefined) {
        clean[key] = (payload as unknown as Record<string, unknown>)[key]
      }
    }
    if (!clean.created_at) clean.created_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('certifications')
      .insert(clean)
      .select()
      .single()
    if (error) {
      console.error('[datastore/createCertification] Supabase error:', JSON.stringify(error))
      if (error.details) console.error('[datastore/createCertification] details:', error.details)
      if (error.code) console.error('[datastore/createCertification] code:', error.code)
    }
    return { data: data as Certification | null, error: error?.message ?? JSON.stringify(error) ?? null }
  } catch (err) {
    console.error('[datastore/createCertification] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function updateCertification(id: string, payload: Partial<Certification>): Promise<DatastoreResult<Certification>> {
  try {
    // Ne transmettre que les colonnes connues de la table certifications
    const allowedCols = [
      'id', 'aerodrome_id', 'reference', 'phase_active', 'phases_data',
      'statut_global', 'numero_cert', 'date_delivrance', 'date_expiration',
      'lettre_signee_url', 'type_certification', 'archived_at', 'exemptions_ids',
    ]
    // Éviter d'écraser created_at
    const clean: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowedCols) {
      if ((payload as unknown as Record<string, unknown>)[key] !== undefined) {
        clean[key] = (payload as unknown as Record<string, unknown>)[key]
      }
    }

    const { data, error } = await supabase
      .from('certifications')
      .update(clean)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.error('[datastore/updateCertification] Supabase error:', JSON.stringify(error))
      if (error.details) console.error('[datastore/updateCertification] details:', error.details)
      if (error.hint) console.error('[datastore/updateCertification] hint:', error.hint)
      if (error.code) console.error('[datastore/updateCertification] code:', error.code)
    }
    return { data: data as Certification | null, error: error?.message ?? JSON.stringify(error) ?? null }
  } catch (err) {
    console.error('[datastore/updateCertification] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function deleteCertification(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('certifications').delete().eq('id', id)
  if (error) console.error('[datastore/deleteCertification] Supabase error:', error)
  return { data: null, error: error?.message ?? null }
}
