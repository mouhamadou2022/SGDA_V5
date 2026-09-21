// lib/store/masterChecklistsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Checklists maîtres (Kit Inspecteur) extraite du store monolithique,
// comportement identique. Utilise DomaineChecklist du slice checklist.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { DomaineChecklist } from './checklistSlice'
import type { HelistationData } from '../types/helistation'
import { mapTypeInstallationToSousType } from '../types/helistation'

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
    entityContext?: { type_entite?: string; helistation?: HelistationData },
  ) => { id: string; checklist: DomaineChecklist[] } | null
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createMasterChecklistsSlice)
// ─────────────────────────────────────────────────────────────

export const createMasterChecklistsSlice: StateCreator<AppStore, [], [], MasterChecklistSlice> = (set, get) => ({
  masterChecklists: {},
  archivedMasterChecklists: {},
  templateVersions: {},

  setMasterChecklist: (id, checklist) => set((state) => ({
    masterChecklists: { ...state.masterChecklists, [id]: checklist }
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

    // Contexte hélistation : sous-type d'entité dérivé du type d'installation,
    // pour privilégier le template de checklist correspondant (HELI_SURFACE / HELI_MER / HELI_PLATEFORME).
    const sousTypeEntite = entityContext?.type_entite === 'helistation'
      ? mapTypeInstallationToSousType(entityContext?.helistation?.type_installation)
      : undefined
    const suffixe = sousTypeEntite
      ? ({ helistation_surface: 'HELI_SURFACE', helistation_mer: 'HELI_MER', heliplateforme: 'HELI_PLATEFORME' } as const)[sousTypeEntite]
      : undefined

    for (const [id, checklist] of entries) {
      const domainesCodes = checklist.map(d => d.nom.toUpperCase())
      // Matching strict : tous les domaines demandés (hors SGS) doivent correspondre exactement
      const couvre = porteeSansSGS.every(p => domainesCodes.includes(p.toUpperCase()))
      if (couvre && (!suffixe || id.includes(suffixe))) {
        // Retourner la checklist sans les domaines SGS
        const filtered = checklist.filter(d => d.nom.toUpperCase() !== 'SGS')
        return { id, checklist: filtered }
      }
    }

    // Repli : si un suffixe hélistation était demandé mais qu'aucun template
    // dédié n'existe, accepter le template générique couvrant la portée.
    if (suffixe) {
      for (const [id, checklist] of entries) {
        const domainesCodes = checklist.map(d => d.nom.toUpperCase())
        const couvre = porteeSansSGS.every(p => domainesCodes.includes(p.toUpperCase()))
        if (couvre) {
          const filtered = checklist.filter(d => d.nom.toUpperCase() !== 'SGS')
          return { id, checklist: filtered }
        }
      }
    }
    return null
  },
})
