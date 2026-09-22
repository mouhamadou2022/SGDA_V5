// lib/datastore/checklist.ts — Domaine checklist (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { ChecklistItem } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// CHECKLIST ITEMS
// ─────────────────────────────────────────────────────────────

export async function fetchChecklistItems(surveillanceId: string): Promise<DatastoreResult<ChecklistItem[]>> {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('surveillance_id', surveillanceId)
    .order('ordre')
  return { data: data as ChecklistItem[] | null, error: error?.message ?? null }
}

export async function upsertChecklistItem(item: ChecklistItem): Promise<DatastoreResult<ChecklistItem>> {
  const { data, error } = await supabase
    .from('checklist_items')
    .upsert({ ...item, last_modified: new Date().toISOString() })
    .select()
    .single()
  return { data: data as ChecklistItem | null, error: error?.message ?? null }
}

export async function batchUpsertChecklistItems(items: ChecklistItem[]): Promise<DatastoreResult<ChecklistItem[]>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('checklist_items')
    .upsert(items.map((i) => ({ ...i, last_modified: now })))
    .select()
  return { data: data as ChecklistItem[] | null, error: error?.message ?? null }
}
