// lib/store/registreIASlice.ts — Phase 2 (monolithe modulaire)
// Tranche Registre IA (analyses réglementaires, suggestions formation)
// extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface RegulationAnalysis {
  id: string
  documentId: string
  documentTitre: string
  documentType: string
  version: string
  date_analyse: string
  impact: 'majeur' | 'modere' | 'mineur' | 'aucun'
  impact_description: string
  chapitres_modifies: string[]
  formations_suggerees: FormationSuggestion[]
  inspecteurs_concernes: string[]
  delai_mise_conformite: number
  status: 'pending' | 'notified' | 'resolved'
  confidence: number
}

export interface FormationSuggestion {
  id: string
  titre: string
  description: string
  duree_heures: number
  priorite: 'critique' | 'haute' | 'moyenne' | 'basse'
  justification: string
  public_cible: ('tous' | 'expert' | 'debutant')[]
  domaines: string[]
  source_document_id: string
  source_document_titre: string
  status: 'suggested' | 'planned' | 'scheduled' | 'done' | 'ignored'
  created_at: string
  planifiee_le?: string
  planifiee_par?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface RegistreIASlice {
  regulationAnalyses: RegulationAnalysis[];
  formationSuggestions: FormationSuggestion[];
  addRegulationAnalysis: (analysis: RegulationAnalysis) => void;
  updateRegulationAnalysis: (id: string, data: Partial<RegulationAnalysis>) => void;
  addFormationSuggestion: (suggestion: FormationSuggestion) => void;
  updateFormationSuggestion: (id: string, data: Partial<FormationSuggestion>) => void;
  getPendingRegulationAlerts: () => RegulationAnalysis[];
  getFormationSuggestionsByInspector: (inspecteurId: string) => FormationSuggestion[];
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createRegistreIASlice)
// ─────────────────────────────────────────────────────────────

export const createRegistreIASlice: StateCreator<AppStore, [], [], RegistreIASlice> = (set, get) => ({
  regulationAnalyses: [],
  formationSuggestions: [],

  addRegulationAnalysis: (analysis) => set((state) => ({
    regulationAnalyses: [...state.regulationAnalyses, analysis]
  })),

  updateRegulationAnalysis: (id, data) => set((state) => ({
    regulationAnalyses: state.regulationAnalyses.map(a => a.id === id ? { ...a, ...data } : a)
  })),

  addFormationSuggestion: (suggestion) => set((state) => ({
    formationSuggestions: [...state.formationSuggestions, suggestion]
  })),

  updateFormationSuggestion: (id, data) => set((state) => ({
    formationSuggestions: state.formationSuggestions.map(s => s.id === id ? { ...s, ...data } : s)
  })),

  getPendingRegulationAlerts: () => {
    const state = get()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    return state.regulationAnalyses.filter(a =>
      new Date(a.date_analyse) > thirtyDaysAgo &&
      a.impact !== 'aucun' &&
      a.status !== 'resolved'
    )
  },

  getFormationSuggestionsByInspector: (inspecteurId) => {
    const state = get()
    return state.formationSuggestions.filter(s =>
      s.status === 'suggested' &&
      (s.public_cible.includes('tous') || s.public_cible.includes('expert'))
    )
  },
})
