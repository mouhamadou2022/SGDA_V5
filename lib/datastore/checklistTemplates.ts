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

// Clés que l'autosave de contenu ne doit JAMAIS écraser sur une ligne
// existante (sinon ouvrir l'éditeur dépublie le template et renomme en
// générique). Métadonnées = import/génération/publication uniquement.
const CLES_PROTEGEES_AUTOSAVE = new Set([
  'nom', 'version', 'etat', 'actif', 'nature', 'categorie', 'regime',
  'type_entite_cible', 'sous_type_entite', 'edition_date', 'source_fichier',
  'description',
])

export async function createChecklistTemplate(payload: Partial<ChecklistTemplate> & { type: string; code: string; nom: string; hierarchie: DomaineChecklist[]; attenduUpdatedAt?: string }): Promise<DatastoreResult<ChecklistTemplate> & { conflit?: ConflitEcriture }> {
  const now = new Date().toISOString()
  // Champ technique du verrou optimiste — jamais persisté.
  const { attenduUpdatedAt, ...brut } = payload as Record<string, unknown> & { attenduUpdatedAt?: string }
  // Ne jamais écrire d'undefined (PostgREST les convertirait en NULL).
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(brut)) {
    if (v !== undefined) clean[k] = v
  }
  // Upsert : si un template actif existe déjà pour (type, code), on met à jour
  // le CONTENU uniquement (évite les doublons créés à chaque autosave).
  const existing = await supabase
    .from('checklist_templates')
    .select('id')
    .eq('type', payload.type)
    .eq('code', payload.code)
    .eq('actif', true)
    .limit(1)
    .maybeSingle()
  if (existing.data?.id) {
    const conflit = await detecterConflit(existing.data.id, attenduUpdatedAt)
    if (conflit) {
      return {
        data: null,
        error: `Modifié par ${conflit.par} le ${conflit.le} — rechargez avant d'écraser.`,
        conflit,
      }
    }
    const contenu: Record<string, unknown> = { updated_at: now, updated_by: payload.created_by }
    for (const [k, v] of Object.entries(clean)) {
      if (!CLES_PROTEGEES_AUTOSAVE.has(k)) contenu[k] = v
    }
    const { data, error } = await supabase
      .from('checklist_templates')
      .update(contenu)
      .eq('id', existing.data.id)
      .select()
      .single()
    return { data: data as ChecklistTemplate | null, error: error?.message ?? null }
  }
  if (!clean.version) delete clean.version
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

export interface ConflitEcriture {
  par: string
  le: string
}

/**
 * Verrou optimiste : si attenduUpdatedAt est fourni et que la ligne a changé
 * depuis (un autre admin a écrit entre-temps), on REFUSE d'écraser et on
 * renvoie le conflit (auteur + date) au lieu d'écrire en silence.
 */
async function detecterConflit(id: string, attenduUpdatedAt?: string): Promise<ConflitEcriture | null> {
  if (!attenduUpdatedAt) return null
  const { data } = await supabase
    .from('checklist_templates')
    .select('updated_at, updated_by, metadonnees')
    .eq('id', id)
    .maybeSingle()
  if (!data || data.updated_at === attenduUpdatedAt) return null
  const meta = (data.metadonnees || {}) as Record<string, unknown>
  const par = typeof meta.updated_by_name === 'string' && meta.updated_by_name
    ? meta.updated_by_name
    : (data.updated_by || 'un autre utilisateur')
  const le = data.updated_at ? new Date(data.updated_at).toLocaleString('fr-FR') : 'date inconnue'
  return { par, le }
}

export async function updateChecklistTemplate(
  id: string,
  payload: Partial<ChecklistTemplate>,
  attenduUpdatedAt?: string,
): Promise<DatastoreResult<ChecklistTemplate> & { conflit?: ConflitEcriture }> {
  const conflit = await detecterConflit(id, attenduUpdatedAt)
  if (conflit) {
    return {
      data: null,
      error: `Modifié par ${conflit.par} le ${conflit.le} — rechargez avant d'écraser.`,
      conflit,
    }
  }
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
