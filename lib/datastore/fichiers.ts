// lib/datastore/fichiers.ts — Domaine fichiers (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import { DatastoreResult } from './_shared';
import { retirerDiacritiques } from '../domaines';

// ─────────────────────────────────────────────────────────────
// UPLOAD FICHIERS (Storage Supabase)
// ─────────────────────────────────────────────────────────────

/**
 * Chemin Storage assaini : Supabase rejette (« Invalid key ») les segments
 * avec accents/espaces (ex. « mis_à_jour.pdf »). Le NOM affiché (fichier_nom)
 * reste intact — seul le chemin objet est normalisé. Pur et testé.
 */
export function cheminStockageSain(path: string): string {
  const segments = (path || '').split('/').map(seg =>
    retirerDiacritiques(seg)
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, ''),
  ).filter(seg => seg && seg !== '.' && seg !== '..');
  return (segments.join('/') || 'fichier').substring(0, 200);
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
): Promise<DatastoreResult<{ url: string }>> {
  // Le nom d'origine (accents/espaces) reste dans fichier_nom ; seul le
  // chemin objet est assaini — sinon « Invalid key » côté Storage.
  path = cheminStockageSain(path);
  // Voie serveur d'abord (clé service : insensible au RLS — corrige les
  // uploads anon rejetés « row-level security policy » sans session Auth).
  try {
    const buf = await file.arrayBuffer()
    let binaire = ''
    const octets = new Uint8Array(buf)
    const PAQUET = 0x8000
    for (let i = 0; i < octets.length; i += PAQUET) {
      binaire += String.fromCharCode.apply(null, octets.subarray(i, i + PAQUET) as unknown as number[])
    }
    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket,
        path,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contentBase64: (globalThis as any).btoa ? (globalThis as any).btoa(binaire) : Buffer.from(buf).toString('base64'),
        contentType: (file as File).type || 'application/octet-stream',
      }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.url) return { data: { url: data.url }, error: null }
    console.warn('[uploadFile] voie serveur échouée, repli direct:', data?.error || res.status)
  } catch (err) {
    console.warn('[uploadFile] voie serveur indisponible, repli direct:', (err as Error)?.message)
  }

  // Repli historique : upload direct (échoue sans session Auth — RLS).
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return { data: null, error: error.message }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { data: { url: data.publicUrl }, error: null }
}

export async function deleteFile(bucket: string, path: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  return { data: null, error: error?.message ?? null }
}
