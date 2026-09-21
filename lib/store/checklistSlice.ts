// lib/store/checklistSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Checklist extraite du store monolithique, comportement identique.
// Lit get().surveillances et get().calculerProgression (store composé) ;
// flattenHierarchyItems déménagé ici (usage exclusif du slice).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { dedupeHierarchyItems } from '../checklistNormalize'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  surveillance_id: string;
  type_checklist: 'standard' | 'suivi_ecarts' | 'pac';
  categorie: string;
  reference_ras14: string;
  description: string;
  directive_preuve: string;
  domaine: string;
  ordre: number;
  resultat?: 'SA' | 'NS' | 'NA' | 'NV';
  observation?: string;
  fichiers?: {
    nom: string;
    url: string;
    dateUpload: string;
  }[];
  last_modified: string;
  modified_by: string;
  // Champs enrichis Kit / éditeur (optionnels, rétrocompatibles)
  numero?: string;
  reference_reglementaire?: string;
  point_verification?: string;
  prediction?: 'SA' | 'NS' | 'NA' | 'NV';
  confiance?: number;
  justification?: string;
  alerte?: boolean;
  prefilled?: boolean;
  /** Item ajouté/modifié par le Chat IA — en attente de validation par l'inspecteur */
  aiPropose?: boolean;
  observation_stylus_data?: string;
  // ── Directives d'évaluation (critères par état) ────────────────────────────
  directive_sa?: string;
  directive_ns?: string;
  directive_nv?: string;
  directive_na?: string;
  mode_saisie_obs?: 'clavier' | 'stylet' | 'mixte';
}

export interface SousSousDomaine {
  id: string;
  nom: string;
  items: ChecklistItem[];
  isExpanded: boolean;
  ordre: number;
}

export interface SousDomaine {
  id: string;
  nom: string;
  items?: ChecklistItem[];
  sousSousDomaines: SousSousDomaine[];
  isExpanded: boolean;
  ordre: number;
}

export interface DomaineChecklist {
  id: string;
  nom: string;
  description: string;
  items?: ChecklistItem[];
  sousDomaines: SousDomaine[];
  isExpanded: boolean;
  assigne_a?: string;
  assigne_nom?: string;
  progression: number;
  ordre: number;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface ChecklistSlice {
  checklistHierarchy: Record<string, DomaineChecklist[]>;
  checklistItems: Record<string, ChecklistItem[]>
  setChecklistHierarchy: (surveillanceId: string, hierarchy: DomaineChecklist[]) => void
  setChecklistItems: (surveillanceId: string, items: ChecklistItem[]) => void
  updateChecklistItem: (surveillanceId: string, itemId: string, data: Partial<ChecklistItem>) => void
  getItemsNSNV: (surveillanceId: string) => ChecklistItem[]
  getItemsNSNVFromHierarchy: (surveillanceId: string) => ChecklistItem[]
  /** Renvoie TOUS les items de la hiérarchie (SA/NS/NA/NV) avec le domaine, pour les KPIs de conformité */
  getChecklistItemsFromHierarchy: (surveillanceId: string) => ChecklistItem[]
  calculerProgression: (surveillanceId: string) => number
}

// ─────────────────────────────────────────────────────────────
// Helpers (usage exclusif du slice)
// ─────────────────────────────────────────────────────────────

export function flattenHierarchyItems(hierarchy: DomaineChecklist[] | undefined | null): ChecklistItem[] {
  if (!hierarchy || hierarchy.length === 0) return []
  const flat: ChecklistItem[] = []
  const pushItems = (items?: ChecklistItem[]) => { if (items) for (const i of items) flat.push(i) }
  for (const d of hierarchy) {
    pushItems(d.items)
    for (const sd of d.sousDomaines || []) {
      pushItems(sd.items)
      for (const ssd of sd.sousSousDomaines || []) pushItems(ssd.items)
    }
  }
  return flat
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createChecklistSlice)
// ─────────────────────────────────────────────────────────────

export const createChecklistSlice: StateCreator<AppStore, [], [], ChecklistSlice> = (set, get) => ({
  checklistItems: {},
  checklistHierarchy: {},

  setChecklistHierarchy: (surveillanceId, hierarchy) => {
    // Normalisation au point de convergence unique : toute hiérarchie qui
    // entre dans le store est dédupliquée par item id. Évite les clés React
    // dupliquées et les incohérences de comptage (items NS/NV, écarts traités)
    // causées par des templates importés avec le même id en plusieurs endroits.
    const normalized = dedupeHierarchyItems(hierarchy)
    set((state) => ({
      checklistHierarchy: { ...state.checklistHierarchy, [surveillanceId]: normalized ?? [] }
    }))
  },

  setChecklistItems: (surveillanceId, items) => set((state) => ({
    checklistItems: { ...state.checklistItems, [surveillanceId]: items }
  })),

  updateChecklistItem: (surveillanceId, itemId, data) =>
    set((state) => {
      const items = state.checklistItems?.[surveillanceId] || []
      const updatedItems = items.map(item =>
        item.id === itemId
          ? { ...item, ...data, last_modified: new Date().toISOString() }
          : item
      )
      const progression = get().calculerProgression(surveillanceId)
      const surveillances = state.surveillances.map(s =>
        s.id === surveillanceId ? { ...s, progression } : s
      )
      return {
        checklistItems: { ...state.checklistItems, [surveillanceId]: updatedItems },
        surveillances
      }
    }),

  getItemsNSNV: (surveillanceId) => {
    const surv = get().surveillances.find(s => s.id === surveillanceId)
    // Source de vérité : hiérarchie persistée sur la surveillance (survit au rechargement)
    const itemsPersistes = flattenHierarchyItems(surv?.checklist_hierarchy)
    const items = itemsPersistes.length > 0
      ? itemsPersistes
      : (get().checklistItems?.[surveillanceId] || [])
    // Déduplication par id : les templates importés avant normalizeChecklistIds
    // peuvent contenir des items en double (même id) → éviter les clés React
    // dupliquées et les écarts générés deux fois à partir du même item.
    const seen = new Set<string>()
    return items.filter(i => {
      if (i.resultat !== 'NS' && i.resultat !== 'NV') return false
      if (seen.has(i.id)) return false
      seen.add(i.id)
      return true
    })
  },

  getItemsNSNVFromHierarchy: (surveillanceId) => {
    // Source de vérité : hiérarchie persistée sur la surveillance (survit
    // au rechargement) ; la map volatile sert de repli pendant l'édition.
    const surv = get().surveillances.find(s => s.id === surveillanceId)
    const hierarchyMap = get().checklistHierarchy?.[surveillanceId] || []
    const hierarchy = hierarchyMap.length > 0 ? hierarchyMap : (surv?.checklist_hierarchy || [])
    const itemsNSNV: (ChecklistItem & { domaine: string; sousDomaine: string; sousSousDomaine: string })[] = []
    // Les templates importés avant la correction normalizeChecklistIds peuvent
    // contenir des items en double (même id/référence). On déduplique par id pour
    // garantir des clés React uniques et ne pas générer deux fois le même écart.
    const seenIds = new Set<string>()
    const pushUnique = (item: ChecklistItem, domaine: string, sousDomaine: string, sousSousDomaine: string) => {
      if (item.resultat !== 'NS' && item.resultat !== 'NV') return
      if (seenIds.has(item.id)) return
      seenIds.add(item.id)
      itemsNSNV.push({ ...item, domaine, sousDomaine, sousSousDomaine })
    }

    const parcourir = (domaines: DomaineChecklist[]) => {
      for (const domaine of domaines) {
        for (const item of (domaine.items || [])) {
          pushUnique(item, domaine.nom, '', '')
        }
        for (const sousDomaine of domaine.sousDomaines) {
          for (const item of (sousDomaine.items || [])) {
            pushUnique(item, domaine.nom, sousDomaine.nom, '')
          }
          for (const sousSousDomaine of sousDomaine.sousSousDomaines) {
            for (const item of sousSousDomaine.items) {
              pushUnique(item, domaine.nom, sousDomaine.nom, sousSousDomaine.nom)
            }
          }
        }
      }
    }

    parcourir(hierarchy)
    return itemsNSNV
  },

  getChecklistItemsFromHierarchy: (surveillanceId) => {
    const surv = get().surveillances.find(s => s.id === surveillanceId)
    const hierarchyMap = get().checklistHierarchy?.[surveillanceId] || []
    const hierarchy = hierarchyMap.length > 0 ? hierarchyMap : (surv?.checklist_hierarchy || [])
    const items: (ChecklistItem & { domaine: string; sousDomaine: string; sousSousDomaine: string })[] = []

    const parcourir = (domaines: DomaineChecklist[]) => {
      for (const domaine of domaines) {
        for (const item of (domaine.items || [])) {
          items.push({ ...item, domaine: domaine.nom, sousDomaine: '', sousSousDomaine: '' })
        }
        for (const sousDomaine of domaine.sousDomaines) {
          for (const item of (sousDomaine.items || [])) {
            items.push({ ...item, domaine: domaine.nom, sousDomaine: sousDomaine.nom, sousSousDomaine: '' })
          }
          for (const sousSousDomaine of sousDomaine.sousSousDomaines) {
            for (const item of sousSousDomaine.items) {
              items.push({ ...item, domaine: domaine.nom, sousDomaine: sousDomaine.nom, sousSousDomaine: sousSousDomaine.nom })
            }
          }
        }
      }
    }

    parcourir(hierarchy)
    return items
  },

  calculerProgression: (surveillanceId) => {
    const surv = get().surveillances.find(s => s.id === surveillanceId)
    // Source de vérité : hiérarchie persistée sur la surveillance (survit au rechargement)
    const itemsPersistes = flattenHierarchyItems(surv?.checklist_hierarchy)
    const items = itemsPersistes.length > 0
      ? itemsPersistes
      : (get().checklistItems?.[surveillanceId] || [])
    if (items.length === 0) return 0
    const renseignes = items.filter(i => i.resultat).length
    return Math.round((renseignes / items.length) * 100)
  },
})
