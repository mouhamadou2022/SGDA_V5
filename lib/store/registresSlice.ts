// lib/store/registresSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Registres extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import * as datastore from '../datastore'
import { toast } from '../toast'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface CertificationMetadata {
  numero_certificat?: string
  date_delivrance?: string
  duree?: number
  statut_officiel?: 'en_cours' | 'revoque' | 'suspendu' | 'annule'
  exemption?: { date?: string; type?: string; numero?: string }
  reference_aip?: string
  restriction?: string
}

export interface HomologationMetadata {
  numero_decision?: string
  date_delivrance?: string
  statut_officiel?: 'en_cours' | 'revoque' | 'suspendu' | 'annule'
  exemption?: { date?: string; type?: string; numero?: string }
  restriction?: string
}

export interface RegistreEntry {
  id: string;
  type: 'certification' | 'homologation' | 'surveillance' | 'evenement' | 'ecart' | 'dossier' | 'document' | 'formation';
  reference: string;
  titre: string;
  description: string;
  date_entree: string;
  aerodrome_id?: string;
  fichiers: { nom: string; url: string }[];
  timeline: {
    id: string;
    etape: string;
    date: string;
    acteur: string;
    acteur_role: string;
    details?: string;
    fichiers?: { nom: string; url: string }[];
  }[];
  statut: 'valide' | 'archive';
  auto_generated: boolean;
  source_id?: string;
  source_type?: string;
  metadata?: CertificationMetadata | HomologationMetadata;
  ia_analysis?: {
    summary: string;
    keywords: string[];
    entities: { type: string; value: string }[];
    analyzed_at: string;
  };
  created_at: string;
  created_by: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface RegistreSlice {
  registreEntries: RegistreEntry[];
  setRegistreEntries: (entries: RegistreEntry[]) => void;
  addRegistreEntry: (entry: RegistreEntry) => void;
  updateRegistreEntry: (id: string, data: Partial<RegistreEntry>) => void;
  deleteRegistreEntry: (id: string) => void;
  getRegistreByType: (type: string) => RegistreEntry[];
  getRegistreByAerodrome: (aerodromeId: string) => RegistreEntry[];
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createRegistresSlice)
// ─────────────────────────────────────────────────────────────

export const createRegistresSlice: StateCreator<AppStore, [], [], RegistreSlice> = (set, get) => ({
  registreEntries: [],

  setRegistreEntries: (entries) => set({ registreEntries: entries }),

  addRegistreEntry: async (entry) => {
    const result = await datastore.saveRegistreEntry(entry)
    if (result.error) {
      console.error('[store] Erreur sauvegarde registre Supabase:', result.error)
      toast('error', 'Erreur archivage', result.error)
      return
    }
    const saved = result.data as RegistreEntry
    set((state) => ({ registreEntries: [...state.registreEntries, saved] }))
  },

  updateRegistreEntry: async (id, data) => {
    const existing = get().registreEntries.find(e => e.id === id)
    if (!existing) return
    const updated = { ...existing, ...data }
    const result = await datastore.saveRegistreEntry(updated as RegistreEntry)
    if (result.error) {
      console.error('[store] Erreur mise à jour registre Supabase:', result.error)
      toast('error', 'Erreur mise à jour', result.error)
      return
    }
    set((state) => ({
      registreEntries: state.registreEntries.map(e => e.id === id ? result.data as RegistreEntry : e)
    }))
  },

  deleteRegistreEntry: async (id) => {
    const result = await datastore.deleteRegistreEntryFromDB(id)
    if (result.error) {
      console.error('[store] Erreur suppression registre Supabase:', result.error)
      toast('error', 'Erreur suppression', result.error)
      return
    }
    set((state) => ({
      registreEntries: state.registreEntries.filter(e => e.id !== id)
    }))
  },

  getRegistreByType: (type) => get().registreEntries.filter(e => e.type === type),

  getRegistreByAerodrome: (aerodromeId) => get().registreEntries.filter(e => e.aerodrome_id === aerodromeId),
})
