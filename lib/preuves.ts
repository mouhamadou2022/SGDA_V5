'use client';

import { supabase } from './supabase';
import { uploadFile } from './datastore';

const BUCKET = 'documents';

export async function uploadPreuveFile(
  file: File,
  surveillanceId: string,
  itemId: string,
): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `preuves/${surveillanceId}/${itemId}/${timestamp}_${safeName}`;

  const result = await uploadFile(BUCKET, storagePath, file);
  if (result.error || !result.data) {
    throw new Error(result.error || 'Échec upload');
  }
  return result.data.url;
}

export async function deletePreuveFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error('[preuves] Erreur suppression:', error.message);
}

export function extractStoragePath(publicUrl: string): string | null {
  const prefix = `${supabase.storage.from(BUCKET).getPublicUrl('').data.publicUrl}`;
  if (publicUrl.startsWith(prefix)) {
    return publicUrl.slice(prefix.length);
  }
  return null;
}
