// lib/datastore/kitDocuments.ts — Domaine kitDocuments (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { KitDocument } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// KIT DOCUMENTS
// ─────────────────────────────────────────────────────────────

export async function createKitDocument(doc: Omit<KitDocument, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }): Promise<DatastoreResult<KitDocument>> {
  const now = new Date().toISOString()
  const payload = { ...doc, created_at: doc.created_at || now, updated_at: doc.updated_at || now }
  const { data, error } = await supabase
    .from('kit_documents')
    .insert(payload)
    .select()
    .single()
  return { data: data as KitDocument | null, error: error?.message ?? null }
}

export async function updateKitDocument(id: string, data: Partial<KitDocument>): Promise<DatastoreResult<KitDocument>> {
  const payload = { ...data, updated_at: new Date().toISOString() }
  const { data: result, error } = await supabase
    .from('kit_documents')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: result as KitDocument | null, error: error?.message ?? null }
}

export async function deleteKitDocument(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('kit_documents')
    .delete()
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}
