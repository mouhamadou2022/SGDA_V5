// lib/store/presenceSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Fiches de présence extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import * as datastore from '../datastore'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface PresenceEntry {
  id: string;
  surveillance_id: string;
  prenom_nom: string;
  structure: 'ANACIM' | 'EXPLOITANT' | 'AUTRE';
  fonction: string;
  telephone: string;
  email: string;
  signature_url: string;
  signature_date: string;
  heure_arrivee?: string;
  heure_depart?: string;
  observations?: string;
  ordre: number;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface PresenceSlice {
  fichesPresence: PresenceEntry[];
  setFichesPresence: (fiches: PresenceEntry[]) => void;
  addFichePresence: (fiche: Omit<PresenceEntry, 'id'>) => void;
  updateFichePresence: (id: string, data: Partial<PresenceEntry>) => void;
  deleteFichePresence: (id: string) => void;
  getFichesBySurveillance: (surveillanceId: string) => PresenceEntry[];
  getFichesSigneesBySurveillance: (surveillanceId: string) => PresenceEntry[];
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createPresenceSlice)
// ─────────────────────────────────────────────────────────────

export const createPresenceSlice: StateCreator<AppStore, [], [], PresenceSlice> = (set, get) => ({
  fichesPresence: [],

  setFichesPresence: (fiches) => set({ fichesPresence: fiches }),

  addFichePresence: (fiche) => {
    const newFiche: PresenceEntry = {
      id: crypto.randomUUID(),
      ...fiche,
    };
    set((state) => ({
      fichesPresence: [...state.fichesPresence, newFiche]
    }));
    // Sync best-effort (ne bloque jamais la saisie terrain)
    datastore.createPresence(newFiche).catch(() => {});
  },

  updateFichePresence: (id, data) => {
    set((state) => ({
      fichesPresence: state.fichesPresence.map(f => f.id === id ? { ...f, ...data } : f)
    }));
    datastore.updatePresence(id, data).catch(() => {});
  },

  deleteFichePresence: (id) => {
    set((state) => ({
      fichesPresence: state.fichesPresence.filter(f => f.id !== id)
    }));
    datastore.deletePresence(id).catch(() => {});
  },

  getFichesBySurveillance: (surveillanceId) => {
    return get().fichesPresence.filter(f => f.surveillance_id === surveillanceId);
  },

  getFichesSigneesBySurveillance: (surveillanceId) => {
    return get().fichesPresence.filter(f => f.surveillance_id === surveillanceId && f.signature_url);
  },
})
