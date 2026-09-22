// lib/datastore/fichiers.ts — Domaine fichiers (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// UPLOAD FICHIERS (Storage Supabase)
// ─────────────────────────────────────────────────────────────

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
): Promise<DatastoreResult<{ url: string }>> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return { data: null, error: error.message }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { data: { url: data.publicUrl }, error: null }
}

export async function deleteFile(bucket: string, path: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  return { data: null, error: error?.message ?? null }
}
