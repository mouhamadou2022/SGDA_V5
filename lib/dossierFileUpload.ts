'use client';

import { supabase } from './supabase';
import { uploadFile, deleteFile } from './datastore';

const BUCKET = 'documents';

export async function uploadDossierFile(
  file: File,
  dossierId: string,
): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `dossiers/${dossierId}/${timestamp}_${safeName}`;

  const result = await uploadFile(BUCKET, storagePath, file);
  if (result.error || !result.data) {
    throw new Error(result.error || 'Échec upload');
  }
  return result.data.url;
}

export async function uploadPreuveFile(
  file: File,
  dossierId: string,
  assignmentId: string,
): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `dossiers/${dossierId}/preuves/${assignmentId}/${timestamp}_${safeName}`;

  const result = await uploadFile(BUCKET, storagePath, file);
  if (result.error || !result.data) {
    throw new Error(result.error || 'Échec upload');
  }
  return result.data.url;
}

export async function deleteDossierFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error('[dossierFileUpload] Erreur suppression:', error.message);
}

export function extractStoragePath(publicUrl: string): string | null {
  const prefix = `${supabase.storage.from(BUCKET).getPublicUrl('').data.publicUrl}`;
  if (publicUrl.startsWith(prefix)) {
    return publicUrl.slice(prefix.length);
  }
  return null;
}
