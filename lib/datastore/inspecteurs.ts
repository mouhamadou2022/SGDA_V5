// lib/datastore/inspecteurs.ts — Domaine inspecteurs (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { Inspecteur } from '../store';
import { DatastoreResult, normalizeInspecteurCompetences } from './_shared';

// ─────────────────────────────────────────────────────────────
// INSPECTEURS
// ─────────────────────────────────────────────────────────────

export async function fetchInspecteurs(): Promise<DatastoreResult<Inspecteur[]>> {
  const { data, error } = await supabase.from('inspecteurs').select('*').order('nom')
  return { data: (data as any[])?.map(normalizeInspecteurCompetences) ?? null, error: error?.message ?? null }
}

export async function checkMatriculeExists(matricule: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inspecteurs')
    .select('id')
    .eq('matricule', matricule.trim())
    .is('deleted_at', null)
    .maybeSingle()
  return !error && data !== null
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inspecteurs')
    .select('id')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()
  return !error && data !== null
}

export async function createInspecteur(payload: any): Promise<DatastoreResult<Inspecteur>> {
  const now = new Date().toISOString()
  
  // Nettoyer le payload pour n'envoyer que les colonnes valides
  const validColumns = [
    'id', 'matricule', 'prenom', 'nom', 'email', 'telephone',
    'type', 'service', 'domaine_principal', 'photo', 
    'statut', 'competences', 'created_at', 'deleted_at', 'deleted_by'
  ]
  
  const cleanPayload: any = { created_at: now }
  
  for (const key of validColumns) {
    if (payload[key] !== undefined) {
      // competences : colonne jsonb → stocker les objets complets
      if (key === 'competences') {
        cleanPayload[key] = Array.isArray(payload[key]) ? payload[key] : []
      } else {
        cleanPayload[key] = payload[key]
      }
    }
  }
  
  
  const { data, error } = await supabase
    .from('inspecteurs')
    .insert(cleanPayload)
    .select()
    .single()
    
  return { data: data as Inspecteur | null, error: error?.message ?? null }
}

export async function updateInspecteur(id: string, payload: Partial<Inspecteur>): Promise<DatastoreResult<Inspecteur>> {
  const { data, error } = await supabase
    .from('inspecteurs')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Inspecteur | null, error: error?.message ?? null }
}

export async function deleteInspecteur(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('inspecteurs').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
