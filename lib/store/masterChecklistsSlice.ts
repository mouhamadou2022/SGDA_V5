// lib/store/masterChecklistsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Checklists maîtres (Kit Inspecteur) extraite du store monolithique,
// comportement identique. Utilise DomaineChecklist du slice checklist.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { DomaineChecklist } from './checklistSlice'
import type { HelistationData } from '../types/helistation'
import { inferTypeEntite, mapTypeInstallationToSousType } from '../types/helistation'
import { ensureUniqueHierarchyItemIds } from '../checklistNormalize'

/** Contexte d'entité pour choisir le template de checklist adapté. */
export interface EntityContextChecklist {
  type_entite?: string | null
  helistation?: HelistationData
  piste_principale?: unknown
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface MasterChecklistSlice {
  masterChecklists: Record<string, DomaineChecklist[]>
  archivedMasterChecklists: Record<string, DomaineChecklist[]>
  templateVersions: Record<string, { version: string; date: string; domaines: DomaineChecklist[] }[]>
  setMasterChecklist: (id: string, checklist: DomaineChecklist[]) => void
  deleteMasterChecklist: (id: string) => void
  archiveMasterChecklist: (id: string) => void
  unarchiveMasterChecklist: (id: string) => void
  addTemplateVersion: (id: string, domaines: DomaineChecklist[]) => void
  findMasterChecklistForPortee: (
    portee: string[],
    typeFilters?: string[],
    entityContext?: EntityContextChecklist,
  ) => { id: string; checklist: DomaineChecklist[] } | null
  /**
   * Résolution avec assemblage par domaine (données réelles uniquement,
   * jamais d'IA) : d'abord un template unique couvrant tout (strict),
   * sinon un template par domaine, fusionnés. `manquants` liste les
   * domaines sans aucun template (à importer dans le kit).
   */
  resoudreChecklist: (
    portee: string[],
    typeFilters?: string[],
    entityContext?: EntityContextChecklist,
  ) => { id: string; checklist: DomaineChecklist[]; manquants: string[]; assemble: boolean } | null
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createMasterChecklistsSlice)
// ─────────────────────────────────────────────────────────────

export const createMasterChecklistsSlice: StateCreator<AppStore, [], [], MasterChecklistSlice> = (set, get) => ({
  masterChecklists: {},
  archivedMasterChecklists: {},
  templateVersions: {},

  setMasterChecklist: (id, checklist) => set((state) => ({
    masterChecklists: {
      ...state.masterChecklists,
      [id]: ensureUniqueHierarchyItemIds(checklist) ?? [],
    }
  })),

  deleteMasterChecklist: (id) => set((state) => {
    const { [id]: _, ...rest } = state.masterChecklists
    return { masterChecklists: rest }
  }),

  archiveMasterChecklist: (id) => set((state) => {
    const checklist = state.masterChecklists[id]
    if (!checklist) return state
    const { [id]: _, ...rest } = state.masterChecklists
    return {
      masterChecklists: rest,
      archivedMasterChecklists: { ...state.archivedMasterChecklists, [id]: checklist }
    }
  }),

  unarchiveMasterChecklist: (id) => set((state) => {
    const checklist = state.archivedMasterChecklists[id]
    if (!checklist) return state
    const { [id]: _, ...rest } = state.archivedMasterChecklists
    return {
      archivedMasterChecklists: rest,
      masterChecklists: { ...state.masterChecklists, [id]: checklist }
    }
  }),

  addTemplateVersion: (id, domaines) => set((state) => {
    const existing = state.templateVersions[id] || []
    const version = String(existing.length + 1)
    return {
      templateVersions: {
        ...state.templateVersions,
        [id]: [...existing, { version, date: new Date().toISOString(), domaines }]
      }
    }
  }),

  findMasterChecklistForPortee: (portee, typeFilters, entityContext) => {
    const mcs = get().masterChecklists
    if (!portee || portee.length === 0) return null
    const porteeSansSGS = portee.filter(p => p.toUpperCase() !== 'SGS')
    if (porteeSansSGS.length === 0) return null
    const entries = typeFilters && typeFilters.length > 0
      ? Object.entries(mcs).filter(([id]) => typeFilters.some(t => id.startsWith(t + '_')))
      : Object.entries(mcs)

    // Contexte entité : `type_entite` peut être absent en base (colonne ajoutée
    // sans backfill) ou incohérent. On l'infère alors depuis les données
    // hélistation, sinon une hélistation retomberait sur le premier template
    // couvrant (souvent la checklist aérodrome).
    const typeEntite = entityContext ? inferTypeEntite(entityContext) : undefined
    const estHelistation = typeEntite === 'helistation'
    const estAerodrome = typeEntite === 'aerodrome'
    const sousTypeEntite = estHelistation
      ? mapTypeInstallationToSousType(entityContext?.helistation?.type_installation)
      : undefined
    const suffixe = sousTypeEntite
      ? ({ helistation_surface: 'HELI_SURFACE', helistation_mer: 'HELI_MER', heliplateforme: 'HELI_PLATEFORME' } as const)[sousTypeEntite]
      : undefined

    // Compatibilité entité : une hélistation ne doit jamais retenir un template
    // réservé aux aérodromes (et inversement) quand un template adapté existe.
    // Les templates hélistation portent le marqueur HELI_ dans leur id.
    const compatibleEntite = (id: string) =>
      estHelistation ? id.includes('HELI_')
      : estAerodrome ? !id.includes('HELI_')
      : true

    // Repli ultime : on n'accepte jamais un template explicitement réservé à
    // l'autre type d'entité (ex. QSC_CERT/QSC_HMG pour une hélistation).
    const compatibleRepli = (id: string) =>
      estHelistation ? !/(^|_)(CERT|HMG|AERO)(_|$)/i.test(id)
      : estAerodrome ? !id.includes('HELI_')
      : true

    for (const [id, checklist] of entries) {
      const domainesCodes = checklist.map(d => d.nom.toUpperCase())
      // Matching strict : tous les domaines demandés (hors SGS) doivent correspondre exactement
      const couvre = porteeSansSGS.every(p => domainesCodes.includes(p.toUpperCase()))
      if (couvre && compatibleEntite(id) && (!suffixe || id.includes(suffixe))) {
        // Retourner la checklist sans les domaines SGS
        const filtered = checklist.filter(d => d.nom.toUpperCase() !== 'SGS')
        return { id, checklist: filtered }
      }
    }

    // Repli 1 : sous-type hélistation demandé mais aucun template dédié →
    // accepter n'importe quel template hélistation couvrant la portée.
    if (suffixe) {
      for (const [id, checklist] of entries) {
        const domainesCodes = checklist.map(d => d.nom.toUpperCase())
        const couvre = porteeSansSGS.every(p => domainesCodes.includes(p.toUpperCase()))
        if (couvre && compatibleEntite(id)) {
          const filtered = checklist.filter(d => d.nom.toUpperCase() !== 'SGS')
          return { id, checklist: filtered }
        }
      }
    }

    // Repli 2 : entité typée mais aucun template de son type → accepter un
    // template générique couvrant la portée (jamais de blocage), sans jamais
    // franchir le type d'entité.
    if (estHelistation || estAerodrome) {
      for (const [id, checklist] of entries) {
        const domainesCodes = checklist.map(d => d.nom.toUpperCase())
        const couvre = porteeSansSGS.every(p => domainesCodes.includes(p.toUpperCase()))
        if (couvre && compatibleRepli(id)) {
          const filtered = checklist.filter(d => d.nom.toUpperCase() !== 'SGS')
          return { id, checklist: filtered }
        }
      }
    }
    return null
  },

  resoudreChecklist: (portee, typeFilters, entityContext) => {
    const strict = get().findMasterChecklistForPortee(portee, typeFilters, entityContext)
    if (strict) return { ...strict, manquants: [], assemble: false }
    // Assemblage par domaine : un template couvrant par domaine demandé.
    const demandes = (portee || [])
      .map(p => p.toUpperCase())
      .filter(p => p !== 'SGS')
    if (demandes.length === 0) return null
    const trouves: Array<{ id: string; checklist: DomaineChecklist[] }> = []
    const manquants: string[] = []
    for (const domaine of demandes) {
      const un = get().findMasterChecklistForPortee([domaine], typeFilters, entityContext)
      if (un) trouves.push(un)
      else manquants.push(domaine)
    }
    if (trouves.length === 0) return null
    return {
      id: trouves.map(t => t.id).join('+'),
      checklist: fusionnerDomaines(trouves.map(t => t.checklist)),
      manquants,
      assemble: true,
    }
  },
})

/** Fusionne des hiérarchies (déduplique domaines/items par id, premier vu gagne l'ordre). */
function fusionnerDomaines(listes: DomaineChecklist[][]): DomaineChecklist[] {
  const parNom = new Map<string, DomaineChecklist>()
  for (const liste of listes) {
    for (const domaine of liste || []) {
      const existant = parNom.get(domaine.nom)
      if (!existant) {
        parNom.set(domaine.nom, JSON.parse(JSON.stringify(domaine)))
        continue
      }
      const vus = new Set((existant.items || []).map(i => i.id))
      for (const item of domaine.items || []) {
        if (item.id && !vus.has(item.id)) {
          vus.add(item.id)
          existant.items = [...(existant.items || []), item]
        }
      }
    }
  }
  return [...parNom.values()]
}
