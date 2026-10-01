// lib/hydratation.ts — Fusions au chargement initial.
// Le PLUS RÉCENT gagne (updated_at) : l'ancien « local-prime » masquait les
// modifications d'un autre poste/utilisateur (« terminé ici, en cours
// ailleurs »). Sans updated_at des deux côtés, le local est conservé
// (brouillons hors-ligne jamais synchronisés). Testé :
// lib/__tests__/hydratation.test.ts.

import { dedupeHierarchyItems } from './checklistNormalize';
import { flattenHierarchyItems } from './store/checklistSlice';
import type {
  Surveillance, ChecklistItem, DomaineChecklist, Utilisateur, Inspecteur,
} from './store';

function dateDe(e: unknown): number {
  const t = (e as Record<string, unknown>)?.updated_at
  const n = typeof t === 'string' || typeof t === 'number' ? new Date(t).getTime() : NaN
  return Number.isFinite(n) ? n : NaN
}

/** Fusion par id : le plus récent (updated_at) gagne, sinon local conservé. */
export function fusionnerParId<T extends { id: string }>(
  locaux: T[] | undefined,
  distants: T[] | undefined,
): T[] {
  const parId = new Map<string, T>()
  for (const l of locaux || []) parId.set(l.id, l)
  for (const d of distants || []) {
    const actuel = parId.get(d.id)
    if (!actuel) {
      parId.set(d.id, d)
      continue
    }
    const tLocal = dateDe(actuel)
    const tDistant = dateDe(d)
    // Les deux datés : le plus récent gagne. Sinon : local conservé.
    if (Number.isFinite(tLocal) && Number.isFinite(tDistant) && tDistant > tLocal) {
      parId.set(d.id, d)
    }
  }
  return [...parId.values()]
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
