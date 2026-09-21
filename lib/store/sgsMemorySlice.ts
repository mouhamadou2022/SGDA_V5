// lib/store/sgsMemorySlice.ts — Phase 2 (monolithe modulaire)
// Tranche Mémoire SGS extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { SGSLevelCorrection } from '../sgsMemory'

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface SgsMemorySlice {
  sgsMemoryRecords: SGSLevelCorrection[];
  setSgsMemoryRecords: (records: SGSLevelCorrection[]) => void;
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createSgsMemorySlice)
// ─────────────────────────────────────────────────────────────

export const createSgsMemorySlice: StateCreator<AppStore, [], [], SgsMemorySlice> = (set) => ({
  sgsMemoryRecords: [],

  setSgsMemoryRecords: (records) => set({ sgsMemoryRecords: records }),
})
