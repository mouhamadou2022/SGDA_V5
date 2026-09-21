// lib/store/ecartsRedactionSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Brouillons d'écarts extraite du store monolithique, comportement identique.
// Lit get().ecarts (store composé) pour la normalisation et les effectifs.

import type { StateCreator } from 'zustand'
import type { AppStore, Ecart } from '../store'
import { computeInitialCell } from '../risque/bowTieEngine'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface EcartRedaction {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible' | 'tres_faible';
  item_ids: string[];
  surveillance_id: string;
  aerodrome_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  /** Domaine réglementaire (SGS, PHY, OLS…) — propagé lors de la transmission */
  domaine?: string;
  // Champs de risque (matrice OACI)
  cellule_risque_oaci?: string;
  probabilite_risque?: 1 | 2 | 3 | 4 | 5;
  gravite_risque?: 'A' | 'B' | 'C' | 'D' | 'E';
  justification_risque_ia?: string;
  cellule_ia_suggeree?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface EcartsRedactionSlice {
  ecartsRedaction: EcartRedaction[]
  setEcartsRedaction: (ecarts: EcartRedaction[]) => void
  addEcartRedaction: (ecart: Omit<EcartRedaction, 'id' | 'created_at' | 'updated_at'>) => void
  updateEcartRedaction: (id: string, data: Partial<EcartRedaction>) => void
  deleteEcartRedaction: (id: string) => void
  getEcartsBySurveillance: (surveillanceId: string) => EcartRedaction[]
  /** Écarts « effectifs » du rapport : brouillons (ecartsRedaction) en priorité, sinon écarts officiels */
  getEcartsEffectifsSurveillance: (surveillanceId: string) => Ecart[]
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createEcartsRedactionSlice)
// ─────────────────────────────────────────────────────────────

export const createEcartsRedactionSlice: StateCreator<AppStore, [], [], EcartsRedactionSlice> = (set, get) => ({
  ecartsRedaction: [],

  setEcartsRedaction: (ecarts) => set({ ecartsRedaction: ecarts }),

  addEcartRedaction: (ecartData) => {
    const now = new Date().toISOString()
    // Data-driven OACI cell via Bow-Tie Engine
    let celluleRisque: string | undefined
    let probabiliteRisque: 1|2|3|4|5 | undefined
    let graviteRisque: 'A'|'B'|'C'|'D'|'E' | undefined
    let justificationRisque: string | undefined
    try {
      const ecartsSimilaires = get().ecarts.filter(e => e.domaine === ecartData.domaine && e.statut !== 'cloture')
      const assessment = computeInitialCell({ niveau_risque: ecartData.niveau || 'moyen', domaine: ecartData.domaine }, ecartsSimilaires)
      celluleRisque = assessment.celluleInitiale.cellule
      probabiliteRisque = assessment.celluleInitiale.probabilite
      graviteRisque = assessment.celluleInitiale.gravite
      justificationRisque = assessment.justificationInitiale
    } catch { console.warn('[addEcartRedaction] computeInitialCell échoué, cellule OACI non définie') }
    const newEcart: EcartRedaction = {
      id: crypto.randomUUID(),
      reference: ecartData.reference || `${new Date().getFullYear()}-BRDN-${String(get().ecartsRedaction.length + 1).padStart(2, '0')}`,
      ref_reglementaire: ecartData.ref_reglementaire || '',
      libelle: ecartData.libelle || '',
      niveau: ecartData.niveau || 'moyen',
      item_ids: ecartData.item_ids || [],
      surveillance_id: ecartData.surveillance_id || '',
      aerodrome_id: ecartData.aerodrome_id || '',
      created_at: now,
      updated_at: now,
      created_by: get().user?.id || '',
      updated_by: get().user?.id || '',
      cellule_risque_oaci: celluleRisque,
      probabilite_risque: probabiliteRisque,
      gravite_risque: graviteRisque,
      justification_risque_ia: justificationRisque,
    }
    set((state) => ({
      ecartsRedaction: [...state.ecartsRedaction, newEcart]
    }))
  },

  updateEcartRedaction: (id, data) => set((state) => ({
    ecartsRedaction: state.ecartsRedaction.map(e =>
      e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e
    )
  })),

  deleteEcartRedaction: (id) => set((state) => ({
    ecartsRedaction: state.ecartsRedaction.filter(e => e.id !== id)
  })),

  getEcartsBySurveillance: (surveillanceId) => {
    return get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
  },

  // Écarts « effectifs » pour le rapport (annexe A-2, contexte IA, DOCX).
  // Pendant la phase de rédaction les écarts vivent dans `ecartsRedaction`
  // (brouillons) et ne sont convertis en `ecarts` officiels qu'à la
  // transmission. Le rapport doit donc lire les brouillons en priorité
  // (normalisés en Ecart[]), avec repli sur les écarts officiels.
  getEcartsEffectifsSurveillance: (surveillanceId): Ecart[] => {
    const officiels = get().ecarts.filter(e => e.surveillance_id === surveillanceId)
    const brouillons = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
    if (brouillons.length === 0) return officiels
    const byId = new Map(officiels.map(e => [e.id, e]))
    return brouillons.map(b => {
      if (byId.has(b.id)) return byId.get(b.id) as Ecart
      return {
        id: b.id,
        aerodrome_id: b.aerodrome_id || '',
        surveillance_id: b.surveillance_id,
        domaine: b.domaine || 'SGS',
        reference: b.reference,
        ref_reglementaire: b.ref_reglementaire || '',
        libelle: b.libelle || '',
        niveau_risque: (b.niveau || 'moyen') as Ecart['niveau_risque'],
        cellule_risque_oaci: b.cellule_risque_oaci,
        probabilite_risque: b.probabilite_risque,
        gravite_risque: b.gravite_risque,
        justification_risque_ia: b.justification_risque_ia,
        cellule_ia_suggeree: b.cellule_ia_suggeree,
        statut: 'ouvert',
        delai_pac: '',
        delai_regularisation: '',
        inspecteur_ref_id: b.created_by || '',
        date_detection: b.created_at,
        created_at: b.created_at,
        updated_at: b.updated_at,
      } as Ecart
    })
  },
})
