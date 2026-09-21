// lib/store/alertesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Alertes sécurité extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface AlerteSecuriteFull {
  id: string;
  surveillance_id: string;
  delegation_id?: string;
  item_id: string;
  item_numero: string;
  item_description: string;
  domaine: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  message: string;
  declenchee_par: string;
  declencheur_nom: string;
  declenchee_le: string;
  statut: 'active' | 'traitee' | 'cloturee';
  preuves: { id: string; nom: string; url: string; dateUpload: string }[];
  commentaire_traitement?: string;
  traitee_par?: string;
  traitee_le?: string;
  notifie_chef: boolean;
  notifie_chef_le?: string;
  notifie_dg: boolean;
  notifie_dg_le?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface AlerteSlice {
  alertesSecurite: AlerteSecuriteFull[];
  setAlertesSecurite: (alertes: AlerteSecuriteFull[]) => void;
  addAlerteSecurite: (alerte: Omit<AlerteSecuriteFull, 'id'>) => void;
  updateAlerteSecurite: (id: string, data: Partial<AlerteSecuriteFull>) => void;
  deleteAlerteSecurite: (id: string) => void;
  getAlertesBySurveillance: (surveillanceId: string) => AlerteSecuriteFull[];
  getAlertesActivesBySurveillance: (surveillanceId: string) => AlerteSecuriteFull[];
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createAlertesSlice)
// ─────────────────────────────────────────────────────────────

export const createAlertesSlice: StateCreator<AppStore, [], [], AlerteSlice> = (set, get) => ({
  alertesSecurite: [],

  setAlertesSecurite: (alertes) => set({ alertesSecurite: alertes }),

  addAlerteSecurite: (alerte) => {
    const newAlerte: AlerteSecuriteFull = {
      id: crypto.randomUUID(),
      ...alerte,
    };
    set((state) => ({
      alertesSecurite: [...state.alertesSecurite, newAlerte]
    }));
  },

  updateAlerteSecurite: (id, data) => set((state) => ({
    alertesSecurite: state.alertesSecurite.map(a => a.id === id ? { ...a, ...data } : a)
  })),

  deleteAlerteSecurite: (id) => set((state) => ({
    alertesSecurite: state.alertesSecurite.filter(a => a.id !== id)
  })),

  getAlertesBySurveillance: (surveillanceId) => {
    return get().alertesSecurite.filter(a => a.surveillance_id === surveillanceId);
  },

  getAlertesActivesBySurveillance: (surveillanceId) => {
    return get().alertesSecurite.filter(a => a.surveillance_id === surveillanceId && a.statut === 'active');
  },
})
