'use client'

import { useAppStore } from '@/lib/store'
import { aiClient } from '@/lib/ia/aiClient'
import type { ChecklistTemplate, DomaineChecklist, ChecklistTemplateType, ChecklistTemplateCategorie, ChecklistTemplateRegime } from '@/lib/store'

export interface TemplateImportMeta {
  categorie?: ChecklistTemplateCategorie
  regime?: ChecklistTemplateRegime
  type_entite_cible?: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
  version?: string
  edition_date?: string
  source_fichier?: string
  etat?: 'brouillon' | 'publie' | 'archive'
  actif?: boolean
  description?: string
  // false = garder l'existant (ne rien écrire) ; true = archiver l'actif et insérer la nouvelle version
  archivePrevious?: boolean
}

export async function saveTemplateToSupabase(
  templateId: string,
  type: ChecklistTemplateType,
  code: string,
  nom: string,
  version: string,
  portee: string[],
  hierarchie: DomaineChecklist[],
  meta?: TemplateImportMeta,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { createChecklistTemplate } = await import('@/lib/datastore')
    const store = useAppStore.getState()
    const user = store.user
    const authorName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : ''

    const result = await createChecklistTemplate({
      type,
      code,
      nom,
      version: version || meta?.version || '',
      portee,
      type_entite_cible: meta?.type_entite_cible || (type === 'VALIDATION_SITE' ? 'tous' : 'aerodrome'),
      categorie: meta?.categorie,
      regime: meta?.regime,
      etat: meta?.etat || 'brouillon',
      hierarchie,
      actif: meta?.actif !== false,
      created_by: user?.id,
      updated_by: user?.id,
      edition_date: meta?.edition_date,
      source_fichier: meta?.source_fichier,
      description: meta?.description,
      metadonnees: { created_by_name: authorName, updated_by_name: authorName },
    })

    if (result.error) return { ok: false, error: result.error }

    store.addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Template sauvegardé',
      message: `${nom} (${code}) enregistré en base`,
      canal: 'in_app',
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Erreur lors de la sauvegarde' }
  }
}

/**
 * Import guidé (wizard) : détecte un doublon de thème (type+code),
 * archive l'ancienne version si demandé et insère la nouvelle.
 */
export async function importTemplateToSupabase(
  type: ChecklistTemplateType,
  code: string,
  nom: string,
  portee: string[],
  hierarchie: DomaineChecklist[],
  meta?: TemplateImportMeta,
): Promise<{ ok: boolean; error?: string; existing?: ChecklistTemplate | null }> {
  try {
    const { importChecklistTemplate } = await import('@/lib/datastore')
    const store = useAppStore.getState()
    const user = store.user
    const authorName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : ''

    const result = await importChecklistTemplate({
      type,
      code,
      nom,
      version: meta?.version || '1.0',
      portee,
      type_entite_cible: meta?.type_entite_cible || (type === 'VALIDATION_SITE' ? 'tous' : 'aerodrome'),
      categorie: meta?.categorie,
      regime: meta?.regime,
      etat: meta?.etat || 'brouillon',
      hierarchie,
      actif: meta?.actif !== false,
      created_by: user?.id,
      updated_by: user?.id,
      edition_date: meta?.edition_date,
      source_fichier: meta?.source_fichier,
      description: meta?.description,
      metadonnees: { created_by_name: authorName, updated_by_name: authorName },
    }, { archivePrevious: meta?.archivePrevious })

    if (result.error) return { ok: false, error: result.error, existing: result.existing }

    store.addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Template importé',
      message: `${nom} (${code}) enregistré en base${result.existing ? ' — ancienne version archivée' : ''}`,
      canal: 'in_app',
    })

    return { ok: true, existing: result.existing }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Erreur lors de l\'import' }
  }
}

/** Versions (actives + archivées) d'un thème, pour la détection de doublon et l'historique */
export async function fetchTemplateVersions(type: string, code: string): Promise<ChecklistTemplate[]> {
  try {
    const { findChecklistTemplatesByTheme } = await import('@/lib/datastore')
    const result = await findChecklistTemplatesByTheme(type, code)
    return result.data || []
  } catch {
    return []
  }
}

// ─── Comparaison client (diff rapide) ────────────────────────────────────────

export interface TemplateDiffItem { numero: string; question: string; domaine: string }
export interface TemplateDiff {
  existingNom: string
  existingVersion: string
  existingItems: number
  incomingItems: number
  added: TemplateDiffItem[]
  removed: TemplateDiffItem[]
  modified: { numero: string; question: string; before: string; after: string }[]
  unchangedCount: number
}

function flattenItems(hierarchie: DomaineChecklist[]): { numero: string; question: string; domaine: string }[] {
  const out: { numero: string; question: string; domaine: string }[] = []
  const walk = (items: any[], domaine: string) => {
    ;(items || []).forEach((i: any) => {
      out.push({ numero: i.numero || i.reference_ras14 || '', question: i.point_verification || i.description || '', domaine })
    })
  }
  ;(hierarchie || []).forEach((d: any) => {
    walk(d.items || [], d.nom)
    ;(d.sousDomaines || []).forEach((sd: any) => {
      walk(sd.items || [], d.nom)
      ;(sd.sousSousDomaines || []).forEach((ssd: any) => walk(ssd.items || [], d.nom))
    })
  })
  return out
}

export function compareChecklists(existing: DomaineChecklist[], incoming: DomaineChecklist[]): TemplateDiff {
  const ex = flattenItems(existing)
  const inc = flattenItems(incoming)
  const byNumero = (list: TemplateDiffItem[]) => {
    const m = new Map<string, TemplateDiffItem>()
    list.forEach(i => { const k = i.numero || i.question; if (k) m.set(k, i) })
    return m
  }
  const exMap = byNumero(ex)
  const incMap = byNumero(inc)

  const added: TemplateDiffItem[] = []
  const removed: TemplateDiffItem[] = []
  const modified: TemplateDiff['modified'] = []
  let unchangedCount = 0

  for (const [k, v] of incMap) {
    const before = exMap.get(k)
    if (!before) { added.push(v); continue }
    if (before.question !== v.question) {
      modified.push({ numero: v.numero, question: v.question, before: before.question, after: v.question })
    } else {
      unchangedCount++
    }
  }
  for (const [k, v] of exMap) {
    if (!incMap.has(k)) removed.push(v)
  }

  return {
    existingNom: (existing[0] as any)?.nom || '',
    existingVersion: (existing as any)?.version || '',
    existingItems: ex.length,
    incomingItems: inc.length,
    added,
    removed,
    modified,
    unchangedCount,
  }
}

/**
 * Comparaison détaillée par l'IA (à la demande) : synthèse lisible des différences
 * entre le template existant et le fichier importé.
 */
export async function compareChecklistsWithIA(existing: DomaineChecklist[], incoming: DomaineChecklist[]): Promise<string> {
  const summary = (h: DomaineChecklist[]) => (h || []).map(d => ({
    domaine: d.nom,
    nbItems: (d.items?.length || 0) + (d.sousDomaines || []).reduce((acc, sd) => acc + (sd.items?.length || 0) + (sd.sousSousDomaines || []).reduce((a, ssd) => a + (ssd.items?.length || 0), 0), 0),
  }))

  const systemPrompt = `Tu es un expert en réglementation aéronautique (OACI, Annexe 14, RAS 14). 
Deux versions d'une checklist de surveillance d'aérodrome te sont fournies : EXISTANT (déjà en base) et IMPORTE (nouveau fichier).
Compare-les et rédige une synthèse concise (5-8 lignes) :
- les domaines concernés et leurs tailles,
- les différences principales (questions ajoutées, supprimées, reformulées),
- si la version importée semble plus à jour / plus complète ou au contraire moins détaillée.
Ne donne PAS de code JSON, réponds en français simple.`

  const userMessage = `EXISTANT:\n${JSON.stringify(summary(existing))}\nIMPORTE:\n${JSON.stringify(summary(incoming))}\n\nCompare et résume les différences utiles pour un inspecteur qui doit décider s'il remplace la version existante.`

  try {
    const result = await aiClient.callJSON<{ analyse: string }>(
      { systemPrompt, userMessage, temperature: 0.3, maxTokens: 800, responseFormat: 'json_object' },
      { analyse: "L'IA n'a pas pu analyser la comparaison pour le moment." },
    )
    return result.analyse || "L'IA n'a pas pu analyser la comparaison pour le moment."
  } catch {
    return "L'IA n'a pas pu analyser la comparaison pour le moment."
  }
}

export async function loadTemplatesFromSupabase(): Promise<ChecklistTemplate[]> {
  try {
    const { listChecklistTemplates } = await import('@/lib/datastore')
    const store = useAppStore.getState()
    const result = await listChecklistTemplates(true)
    if (result.error) throw new Error(result.error)
    const templates = result.data || []

    // Remplir masterChecklists dans le store
    for (const t of templates) {
      const storeId = `${t.type}_${t.code}`
      store.setMasterChecklist(storeId, t.hierarchie)
    }

    return templates
  } catch {
    return []
  }
}

export async function deleteTemplateFromSupabase(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { deleteChecklistTemplate } = await import('@/lib/datastore')
    const result = await deleteChecklistTemplate(id)
    if (result.error) return { ok: false, error: result.error }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Erreur lors de la suppression' }
  }
}

// Enregistrer une correction manuelle du type détecté pour apprentissage
export async function recordTypeCorrection(
  filename: string,
  detectedType: string,
  correctedType: string,
  userId: string,
): Promise<void> {
  try {
    // Stocker en localStorage comme fallback
    const key = 'template_type_corrections'
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    existing.push({
      filename,
      detected_type: detectedType,
      corrected_type: correctedType,
      user_id: userId,
      date: new Date().toISOString(),
    })
    // Garder les 200 dernières corrections
    if (existing.length > 200) existing.splice(0, existing.length - 200)
    localStorage.setItem(key, JSON.stringify(existing))

  } catch { /* ignore */ }
}
