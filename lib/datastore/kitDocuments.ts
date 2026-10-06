// lib/datastore/kitDocuments.ts — Domaine kitDocuments (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { KitDocument } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// KIT DOCUMENTS
// ─────────────────────────────────────────────────────────────

/**
 * Les textes extraits (PDF natif, vision OCR) contiennent parfois des
 * caracteres que Postgres refuse en JSON (« unsupported Unicode escape
 * sequence » : surrogates isoles U+D800-DFFF, octet nul) — ce qui faisait
 * echouer la persistance APRES extraction reussie. On assainit centralement
 * ici : tous les ecrivains (import, extraction, OCR) passent par ces deux
 * fonctions. Pur et teste.
 */
export function assainirTexteStockage(texte: string): string {
  const OCTET_NUL = String.fromCharCode(0);
  return (texte || '')
    .replace(new RegExp(OCTET_NUL, 'g'), '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/** Applique l'assainissement aux champs texte d'un payload Kit. */
export function assainirPayloadKit<T extends Record<string, unknown>>(payload: T): T {
  const clone: Record<string, unknown> = { ...payload };
  for (const cle of ['contenu_complet', 'resume', 'nom', 'fichier_nom']) {
    if (typeof clone[cle] === 'string') clone[cle] = assainirTexteStockage(clone[cle] as string);
  }
  if (Array.isArray(clone.extraits)) {
    clone.extraits = (clone.extraits as Array<Record<string, unknown>>).map(e => {
      const copie = { ...e };
      for (const cle of ['contenu_resume', 'titre', 'reference']) {
        if (typeof copie[cle] === 'string') copie[cle] = assainirTexteStockage(copie[cle] as string);
      }
      return copie;
    });
  }
  return clone as T;
}

export async function createKitDocument(doc: Omit<KitDocument, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }): Promise<DatastoreResult<KitDocument>> {
  const now = new Date().toISOString()
  const payload = assainirPayloadKit({ ...doc, created_at: doc.created_at || now, updated_at: doc.updated_at || now })
  const { data, error } = await supabase
    .from('kit_documents')
    .insert(payload)
    .select()
    .single()
  return { data: data as KitDocument | null, error: error?.message ?? null }
}

export async function updateKitDocument(id: string, data: Partial<KitDocument>): Promise<DatastoreResult<KitDocument>> {
  const payload = assainirPayloadKit({ ...data, updated_at: new Date().toISOString() })
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
