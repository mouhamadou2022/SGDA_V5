// lib/store/delegationsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Délégations extraite du store monolithique, comportement identique.
// cleanupDelegations lit get().surveillances (store composé).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Delegation {
  id: string;
  surveillance_id: string;
  aerodrome_id: string;
  chef_id: string;
  /** Code du domaine réglementaire (SGS, PHY, OLS…) */
  domaine: string;
  /** Nom d'affichage du domaine */
  domaine_nom?: string;
  /** Type de surveillance délégué */
  type_surveillance?: string;
  /** ID de l'inspecteur désigné */
  assigne_a: string;
  /** Nom d'affichage de l'inspecteur */
  assigne_nom?: string;
  assigne_par: string;
  items_ids: string[];
  items_count?: number;
  progression: number;
  /**
   * Cycle de vie d'une délégation :
   * assigne → checklist_en_cours → checklist_signee
   *         → ecarts_en_cours → ecarts_signes → transmis_chef
   * (valeurs legacy conservées pour compatibilité)
   */
  statut:
    | 'assigne'
    | 'checklist_en_cours'
    | 'checklist_signee'
    | 'ecarts_en_cours'
    | 'ecarts_signes'
    | 'transmis_chef'
    // legacy
    | 'en_cours'
    | 'termine'
    | 'bloque';
  /** URL de la signature de la checklist par l'inspecteur */
  checklist_signature_url?: string;
  /** Date de signature de la checklist */
  checklist_signe_le?: string;
  /** URL de la signature des écarts par l'inspecteur */
  ecarts_signature_url?: string;
  /** Date de signature des écarts */
  ecarts_signes_le?: string;
  /** Date de transmission au chef d'équipe */
  transmis_le?: string;
  assigne_le: string;
  derniere_activite: string;
  derniere_sync: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface DelegationSlice {
  delegations: Delegation[];
  setDelegations: (delegations: Delegation[]) => void;
  addDelegation: (delegation: Omit<Delegation, 'id'>) => void;
  updateDelegation: (id: string, data: Partial<Delegation>) => void;
  deleteDelegation: (id: string) => void;
  getDelegationsBySurveillance: (surveillanceId: string) => Delegation[];
  getDelegationsByInspecteur: (inspecteurId: string) => Delegation[];
  getDelegationsByDomaine: (surveillanceId: string, domaine: string) => Delegation | undefined;
  /** Nettoie les délégations orphelines (surveillance disparue, domaine/inspecteur vide) et les doublons par (surveillance, domaine). */
  cleanupDelegations: () => void;
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createDelegationsSlice)
// ─────────────────────────────────────────────────────────────

export const createDelegationsSlice: StateCreator<AppStore, [], [], DelegationSlice> = (set, get) => ({
  delegations: [],

  setDelegations: (delegations) => set({ delegations }),

  addDelegation: (delegation) => {
    const newDelegation: Delegation = {
      id: crypto.randomUUID(),
      ...delegation,
    };
    set((state) => ({
      delegations: [...state.delegations, newDelegation]
    }));
    // Sync serveur best-effort (Phase 3) : le local reste la source de
    // vérité immédiate — un échec réseau ne bloque jamais l'UI.
    import('../datastore').then(({ createDelegation }) => {
      createDelegation(newDelegation).then(r => {
        if (r.error) console.error('[delegations] Sync création échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  updateDelegation: (id, data) => {
    set((state) => ({
      delegations: state.delegations.map(d => d.id === id ? { ...d, ...data } : d)
    }))
    import('../datastore').then(({ updateDelegation }) => {
      updateDelegation(id, data).then(r => {
        if (r.error) console.error('[delegations] Sync mise à jour échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  deleteDelegation: (id) => {
    set((state) => ({
      delegations: state.delegations.filter(d => d.id !== id)
    }))
    import('../datastore').then(({ deleteDelegation }) => {
      deleteDelegation(id).then(r => {
        if (r.error) console.error('[delegations] Sync suppression échouée:', r.error)
      }).catch(() => {})
    }).catch(() => {})
  },

  getDelegationsBySurveillance: (surveillanceId) => {
    return get().delegations.filter(d => d.surveillance_id === surveillanceId);
  },

  getDelegationsByInspecteur: (inspecteurId) => {
    return get().delegations.filter(d => d.assigne_a === inspecteurId);
  },

  getDelegationsByDomaine: (surveillanceId, domaine) => {
    return get().delegations.find(d => d.surveillance_id === surveillanceId && d.domaine === domaine);
  },

  cleanupDelegations: () => {
    const surveillancesIds = new Set(get().surveillances.map(s => s.id));
    const vues = new Set<string>();
    const nettoyees = get().delegations.filter(d => {
      if (!d.surveillance_id || !surveillancesIds.has(d.surveillance_id)) return false;
      if (!d.domaine || !d.assigne_a) return false;
      const cle = `${d.surveillance_id}|${d.domaine.toUpperCase()}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
    if (nettoyees.length !== get().delegations.length) {
      set({ delegations: nettoyees });
    }
  },
})
