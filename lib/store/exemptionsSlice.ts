// lib/store/exemptionsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Exemptions extraite du store monolithique, comportement identique.
// Règles : ce slice ne lit/écrit que ses propres clés (exemptions).
// Les consommateurs inter-slices (ex. recalcul risque) appellent ses
// sélecteurs publics (getExemptionsActives) — jamais son état brut.
// Les hooks React (useExemptionsBy*) restent dans lib/store.ts car ils
// dépendent de useAppStore (cycle d'import interdit ici).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface MesureAtténuation {
  id: string;
  description: string;
  responsable: string;
  date_debut: string;
  date_fin_prevue: string;
  date_fin_reelle?: string;
  statut: 'a_venir' | 'en_cours' | 'realisee' | 'en_retard' | 'abandonnee';
  preuves?: { id: string; nom: string; url: string; date: string }[];
  commentaire_suivi?: string;
  declencher_inspection_si_retard: boolean;
  inspection_declenchee?: boolean;
  inspection_id?: string;

  // Pour apprentissage
  efficacite_suggeree?: number;
  efficacite_validee?: number;
  dernier_evenement_surveillance_id?: string;
  dernier_resultat_mise_oeuvre?: 'SA' | 'NS' | 'NV';
}

export interface Exemption {
  id: string;
  reference: string;
  parent_id?: string;
  parent_type?: 'certification' | 'homologation';
  certification_id?: string;
  homologation_id?: string;
  aerodrome_id: string;
  date_demande?: string;
  domaines_concerne?: string[];
  description: string;
  etude_securite_url?: string;
  formulaire_dg_url?: string;
  decision: 'acceptee' | 'refusee' | 'acceptee_partiellement';
  numero_arrete?: string;
  date_arrete?: string;
  date_debut: string;
  date_fin?: string;
  date_fin_prevue?: string;
  duree_mois: number;
  statut: 'active' | 'expiree' | 'cloturee' | 'revoquee' | 'renouvelee';
  mesures: MesureAtténuation[];
  // Workflow instructeur (exploitant → ANACIM)
  workflow_statut?: 'en_attente' | 'accuse' | 'en_cours';
  avis_final?: 'favorable' | 'a_reviser' | 'defavorable';
  inspecteur_commentaires?: string;
  inspecteur_fichiers?: { nom: string; url: string }[];
  date_accuse_reception?: string;
  date_decision?: string;
  dernier_recalcul_risque?: string;
  dernier_score_c3_ajuste?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface ExemptionSlice {
  exemptions: Exemption[];
  setExemptions: (exemptions: Exemption[]) => void;
  addExemption: (exemption: Omit<Exemption, 'id' | 'created_at' | 'updated_at'>) => void;
  updateExemption: (id: string, data: Partial<Exemption>) => void;
  deleteExemption: (id: string) => void;
  getExemptionsByParent: (parentId: string) => Exemption[];
  getExemptionsByAerodrome: (aerodromeId: string) => Exemption[];
  getExemptionsActives: (aerodromeId: string) => Exemption[];
  getMesuresByExemption: (exemptionId: string) => MesureAtténuation[];
  updateMesureAtténuation: (exemptionId: string, mesureId: string, data: Partial<MesureAtténuation>) => void;
  ajouterMesureAtténuation: (exemptionId: string, mesure: Omit<MesureAtténuation, 'id'>) => void;
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createExemptionsSlice)
// ─────────────────────────────────────────────────────────────

export const createExemptionsSlice: StateCreator<AppStore, [], [], ExemptionSlice> = (set, get) => ({
  exemptions: [],

  setExemptions: (exemptions) => set({ exemptions }),

  addExemption: (exemption) => {
    const nouvelle: Exemption = {
      ...exemption,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Exemption
    set((state) => ({ exemptions: [...state.exemptions, nouvelle] }))
    // Sync serveur best-effort (Phase 3) : le local reste la source de
    // vérité immédiate — un échec réseau ne bloque jamais l'UI.
    import('../datastore').then(({ createExemption }) => {
      createExemption(nouvelle).then(r => {
        if (r.error) console.error('[exemptions] Sync création échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  updateExemption: (id, data) => {
    set((state) => ({
      exemptions: state.exemptions.map(e => e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e)
    }))
    import('../datastore').then(({ updateExemption }) => {
      updateExemption(id, data).then(r => {
        if (r.error) console.error('[exemptions] Sync mise à jour échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  deleteExemption: (id) => {
    set((state) => ({
      exemptions: state.exemptions.filter(e => e.id !== id)
    }))
    import('../datastore').then(({ deleteExemption }) => {
      deleteExemption(id).then(r => {
        if (r.error) console.error('[exemptions] Sync suppression échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  getExemptionsByAerodrome: (aerodromeId) => {
    return get().exemptions.filter(e => e.aerodrome_id === aerodromeId);
  },

  getExemptionsByParent: (parentId) => {
    return get().exemptions.filter(e => e.parent_id === parentId);
  },

  getExemptionsActives: (aerodromeId) => {
    const now = new Date();
    return get().exemptions.filter(e =>
      e.aerodrome_id === aerodromeId &&
      e.statut === 'active' &&
      e.date_fin_prevue &&
      new Date(e.date_fin_prevue) >= now
    );
  },

  getMesuresByExemption: (exemptionId) => {
    const exemption = get().exemptions.find(e => e.id === exemptionId);
    return exemption?.mesures || [];
  },

  updateMesureAtténuation: (exemptionId, mesureId, data) => set((state) => ({
    exemptions: state.exemptions.map(e =>
      e.id === exemptionId
        ? {
            ...e,
            mesures: e.mesures.map(m => m.id === mesureId ? { ...m, ...data } : m),
            updated_at: new Date().toISOString()
          }
        : e
    )
  })),

  ajouterMesureAtténuation: (exemptionId, mesure) => set((state) => ({
    exemptions: state.exemptions.map(e =>
      e.id === exemptionId
        ? {
            ...e,
            mesures: [...e.mesures, { ...mesure, id: crypto.randomUUID() }],
            updated_at: new Date().toISOString()
          }
        : e
    )
  })),
});
