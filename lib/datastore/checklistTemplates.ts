// lib/datastore/checklistTemplates.ts — Domaine checklistTemplates (extrait de lib/datastore.ts, zero changement).
// Point d'entree public : lib/datastore.ts (hub, re-export).

import { supabase } from '../supabase';
import type { ChecklistTemplate, DomaineChecklist } from '../store';
import { DatastoreResult } from './_shared';

// ─────────────────────────────────────────────────────────────
// CHECKLIST TEMPLATES
// ─────────────────────────────────────────────────────────────

export async function listChecklistTemplates(actifOnly = true): Promise<DatastoreResult<ChecklistTemplate[]>> {
  let query = supabase.from('checklist_templates').select('*').order('created_at', { ascending: false })
  if (actifOnly) query = query.eq('actif', true)
  const { data, error } = await query
  return { data: data as ChecklistTemplate[] | null, error: error?.message ?? null }
}

export async function getChecklistTemplate(id: string): Promise<DatastoreResult<ChecklistTemplate>> {
  const { data, error } = await supabase.from('checklist_templates').select('*').eq('id', id).single()
  return { data: data as ChecklistTemplate | null, error: error?.message ?? null }
}

export async function createChecklistTemplate(payload: Partial<ChecklistTemplate> & { type: string; code: string; nom: string; hierarchie: DomaineChecklist[] }): Promise<DatastoreResult<ChecklistTemplate>> {
  const now = new Date().toISOString()
  // Ne pas écraser la version existante avec une chaîne vide (ex: autosave de l'éditeur)
  const clean = { ...payload }
  if (!clean.version) delete clean.version
  // Upsert : si un template actif existe déjà pour (type, code), on le met à jour
  // (évite les doublons créés à chaque autosave par l'éditeur)
  const existing = await supabase
    .from('checklist_templates')
    .select('id')
    .eq('type', payload.type)
    .eq('code', payload.code)
    .eq('actif', true)
    .limit(1)
    .maybeSingle()
  if (existing.data?.id) {
    const { data, error } = await supabase
      .from('checklist_templates')
      .update({ ...clean, updated_at: now, updated_by: payload.created_by })
      .eq('id', existing.data.id)
      .select()
      .single()
    return { data: data as ChecklistTemplate | null, error: error?.message ?? null }
  }
  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ ...clean, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as ChecklistTemplate | null, error: error?.message ?? null }
}

/**
 * Toutes les versions (actives et archivées) d'un même thème (type + code),
 * pour la détection de doublons et l'historique.
 */
export async function findChecklistTemplatesByTheme(type: string, code: string): Promise<DatastoreResult<ChecklistTemplate[]>> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('type', type)
    .eq('code', code)
    .order('created_at', { ascending: false })
  return { data: data as ChecklistTemplate[] | null, error: error?.message ?? null }
}

/**
 * Import guidé : archive l'éventuel template actif de même (type, code),
 * puis insère la nouvelle version comme active.
 */
export async function importChecklistTemplate(
  payload: { type: string; code: string; nom: string; version: string; portee: string[]; hierarchie: DomaineChecklist[] } & Partial<ChecklistTemplate>,
  opts?: { archivePrevious?: boolean },
): Promise<DatastoreResult<ChecklistTemplate> & { existing?: ChecklistTemplate | null }> {
  const now = new Date().toISOString()
  const versions = await findChecklistTemplatesByTheme(payload.type, payload.code)
  const active = (versions.data || []).find(t => t.actif)
  if (opts?.archivePrevious !== false && active) {
    await supabase
      .from('checklist_templates')
      .update({ actif: false, etat: 'archive', updated_at: now, updated_by: payload.updated_by })
      .eq('id', active.id)
  }
  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as ChecklistTemplate | null, error: error?.message ?? null, existing: active || null }
}

export async function updateChecklistTemplate(id: string, payload: Partial<ChecklistTemplate>): Promise<DatastoreResult<ChecklistTemplate>> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as ChecklistTemplate | null, error: error?.message ?? null }
}

export async function deleteChecklistTemplate(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('checklist_templates').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
