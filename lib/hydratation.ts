// lib/hydratation.ts — Fusions local-prime au chargement initial.
// Extraites de app/page.tsx (comportement identique) : le local (IndexedDB,
// créé hors-ligne) prime, Supabase complète. Testé :
// lib/__tests__/hydratation.test.ts.

import { dedupeHierarchyItems } from './checklistNormalize';
import { flattenHierarchyItems } from './store/checklistSlice';
import type {
  Surveillance, ChecklistItem, DomaineChecklist, Utilisateur, Inspecteur,
} from './store';

/** Fusion local-prime par id (dossiers, registre, exemptions, délégations, enquêtes, réponses). */
export function fusionnerParId<T extends { id: string }>(
  locaux: T[] | undefined,
  distants: T[] | undefined,
): T[] {
  const existants = locaux || []
  const ids = new Set(existants.map(e => e.id))
  return [...existants, ...(distants || []).filter(e => !ids.has(e.id))]
}

/** Fusion utilisateurs : déduplique par id + email. */
export function fusionnerUtilisateurs(
  locaux: Utilisateur[] | undefined,
  distants: Utilisateur[] | undefined,
): Utilisateur[] {
  const existants = locaux || []
  const ids = new Set(existants.map(u => u.id))
  const emails = new Set(existants.map(u => u.email).filter(Boolean))
  return [
    ...existants,
    ...(distants || []).filter(u =>
      !ids.has(u.id) && !(u.email && emails.has(u.email))
    ),
  ]
}

/** Fusion inspecteurs : déduplique par id + email + matricule. */
export function fusionnerInspecteurs(
  locaux: Inspecteur[] | undefined,
  distants: Inspecteur[] | undefined,
): Inspecteur[] {
  const existants = locaux || []
  const ids = new Set(existants.map(i => i.id))
  const emails = new Set(existants.map(i => i.email).filter(Boolean))
  const matricules = new Set(existants.map(i => i.matricule).filter(Boolean))
  const supabaseInspecteurs = distants || []
  return [
    ...existants,
    ...supabaseInspecteurs.filter(i =>
      !ids.has(i.id) &&
      !(i.email && emails.has(i.email)) &&
      !(i.matricule && matricules.has(i.matricule))
    ),
  ]
}

export interface ChecklistsRehydratees {
  hierarchyFromDb: Record<string, DomaineChecklist[]>;
  itemsFromDb: Record<string, ChecklistItem[]>;
}

/**
 * Réhydrate les checklists depuis la colonne persistée
 * checklist_hierarchy : sans ça, la rédaction des écarts et le rapport
 * repartent de zéro après un rechargement. Normalisation à l'hydratation :
 * les hiérarchies legacy peuvent contenir des items au même id en double
 * (artefact d'import de template) → on déduplique avant injection.
 */
export function rehydraterChecklists(
  surveillances: Surveillance[] | undefined,
): ChecklistsRehydratees {
  const hierarchyFromDb: Record<string, DomaineChecklist[]> = {}
  const itemsFromDb: Record<string, ChecklistItem[]> = {}
  for (const sv of (surveillances || []) as Surveillance[]) {
    if (Array.isArray(sv.checklist_hierarchy) && sv.checklist_hierarchy.length > 0) {
      const normalized = dedupeHierarchyItems(sv.checklist_hierarchy as never)
      hierarchyFromDb[sv.id] = (normalized as unknown as DomaineChecklist[]) ?? sv.checklist_hierarchy
      itemsFromDb[sv.id] = flattenHierarchyItems(hierarchyFromDb[sv.id])
    }
  }
  return { hierarchyFromDb, itemsFromDb }
}
