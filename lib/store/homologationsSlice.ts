// lib/store/homologationsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Homologations extraite du store monolithique, comportement identique.
// Appels inter-slices via get() (store composé) :
// addRegistreEntry, lecture aerodromes/user.
// Recalcul risque via ÉVÉNEMENT 'risque:recalcul-demande' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { registreUtils } from '../registreUtils'
import { storeEvents } from './eventBus'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Homologation {
  id: string
  aerodrome_id: string
  reference: string
  phase_active: 1 | 2 | 3
  phases_data: {
    phase1?: {
      date_reception: string
      responsable_id: string
      documents: Record<string, string | boolean>
      completude: number
      observations?: string
      rapport_evaluation_url?: string
      lettre_transmission_url?: string
      cloture_le?: string
      // Workflow exploitant → inspecteur
      coordonnees?: { nom: string; poste: string; email: string; telephone: string }
      description?: string
      lettre_intent_url?: string
      statut?: 'en_attente' | 'accuse' | 'en_cours' | 'favorable' | 'a_reviser' | 'defavorable'
      inspecteur_commentaires?: string
      inspecteur_fichiers?: { nom: string; url: string }[]
      date_accuse_reception?: string
      date_decision?: string
    }
    phase2?: {
      surveillance_id: string
      date_verification: string
      date_debut?: string
      date_fin?: string
      equipe_ids: string[]
      chef_id: string
      rapport_verification_url?: string
      score_conformite: number
      nc_relevees: number
      conditions?: string
      delai_conditions?: string
      plan_action_valide?: boolean
      rapport_evaluation_pac_url?: string
      lettre_acceptation_pac_url?: string
      lettre_acceptation_manuel_url?: string
      conclusion: 'favorable' | 'favorable_conditions' | 'defavorable'
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
    phase3?: {
      numero_decision: string
      date_delivrance: string
      date_expiration: string
      nature_decision: 'accordee' | 'conditions' | 'refusee'
      duree_validite: number
      conditions_exploitation?: string
      signataire_id: string
      decision_url?: string
      inspecteur_fichiers?: { nom: string; url: string }[]
      notification_envoyee: boolean
      cloture_le?: string
    }
  }
  statut_global: 'en_cours' | 'homologue' | 'suspendu' | 'expire' | 'archive'
  numero_decision?: string
  date_delivrance?: string
  date_expiration?: string
  decision_signee_url?: string
  type_homologation?: 'initiale' | 'renouvellement'
  archived_at?: string | null
  exemptions_ids?: string[]
  created_at: string
  updated_at: string
}

export type HomologationPhaseData =
  Partial<NonNullable<Homologation['phases_data']['phase1']>> &
  Partial<NonNullable<Homologation['phases_data']['phase2']>> &
  Partial<NonNullable<Homologation['phases_data']['phase3']>> &
  Record<string, unknown>

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface HomologationSlice {
  homologations: Homologation[]
  currentHomologation: Homologation | null
  setHomologations: (homologations: Homologation[]) => void
  setCurrentHomologation: (homologation: Homologation | null) => void
  addHomologation: (homologation: Homologation) => void
  updateHomologation: (id: string, data: Partial<Homologation>) => void
  deleteHomologation: (id: string) => void
  archiverHomologation: (id: string) => void
  restaurerHomologation: (id: string) => void
  /**
   * Nettoie le lien vers une surveillance supprimée (phase 2).
   * Déclenché par l'événement 'homologation:nettoyer-lien-surveillance'.
   * (Nom distinct de la certification : deux tranches, pas de collision.)
   */
  nettoyerLienSurveillanceHomologation: (aerodrome_id: string, surveillance_id: string) => void
  /**
   * Nettoie le lien vers un planning supprimé (phase 2).
   * Déclenché par l'événement 'homologation:nettoyer-lien-planning'.
   */
  nettoyerLienPlanningHomologation: (aerodrome_id: string, planning_id: string) => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createHomologationsSlice)
// ─────────────────────────────────────────────────────────────

export const createHomologationsSlice: StateCreator<AppStore, [], [], HomologationSlice> = (set, get) => ({
  homologations: [],
  currentHomologation: null,

  setHomologations: (homologations) => set({ homologations }),

  setCurrentHomologation: (homologation) => set({ currentHomologation: homologation }),

  addHomologation: (homologation) => set((state) => ({
    homologations: [...state.homologations, homologation],
  })),

  updateHomologation: (id, data) => {
    const oldHomo = get().homologations.find(h => h.id === id)
    set((state) => ({
      homologations: state.homologations.map((h) => h.id === id ? { ...h, ...data } : h),
      currentHomologation: state.currentHomologation?.id === id
        ? { ...state.currentHomologation, ...data }
        : state.currentHomologation,
    }))
    if (data.statut_global && data.statut_global !== oldHomo?.statut_global && oldHomo?.aerodrome_id) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: oldHomo.aerodrome_id })
    }
  },

  deleteHomologation: (id) => set((state) => ({
    homologations: state.homologations.filter((h) => h.id !== id),
    currentHomologation: state.currentHomologation?.id === id ? null : state.currentHomologation,
  })),

  archiverHomologation: (id) => {
    const homo = get().homologations.find(h => h.id === id);
    if (!homo) return;
    const now = new Date().toISOString();
    set((state) => ({
      homologations: state.homologations.map((h) =>
        h.id === id ? { ...h, statut_global: 'archive' as const, archived_at: now } : h
      ),
      currentHomologation: state.currentHomologation?.id === id ? null : state.currentHomologation,
    }));
    const aerodrome = get().aerodromes.find(a => a.id === homo.aerodrome_id);
    const entry = registreUtils.toRegistreEntryFromHomologation(homo, aerodrome);
    // Journal via événement (tranche registres propriétaire).
    storeEvents.emit('registre:ajouter', {
      id: crypto.randomUUID(),
      ...entry,
      timeline: [{ id: crypto.randomUUID(), etape: 'Archivage automatique', date: now, acteur: get().user?.prenom + ' ' + get().user?.nom || 'Système', acteur_role: 'systeme' }],
      created_at: now,
    });
  },

  restaurerHomologation: (id) => set((state) => ({
    homologations: state.homologations.map((h) =>
      h.id === id ? { ...h, statut_global: 'en_cours' as const, archived_at: null } : h
    ),
  })),

  nettoyerLienSurveillanceHomologation: (aerodrome_id, surveillance_id) => {
    const homo = get().homologations.find((h: any) =>
      h.aerodrome_id === aerodrome_id && (h.phases_data as any)?.phase2?.surveillance_id === surveillance_id
    )
    if (!homo) return
    const phase2 = { ...(homo.phases_data as any).phase2, surveillance_id: '' }
    get().updateHomologation(homo.id, { phases_data: { ...homo.phases_data, phase2 } } as any)
  },

  nettoyerLienPlanningHomologation: (aerodrome_id, planning_id) => {
    const homo = get().homologations.find((h: any) =>
      h.aerodrome_id === aerodrome_id && (h.phases_data as any)?.phase2?.planning_id === planning_id
    )
    if (!homo) return
    const phase2 = { ...(homo.phases_data as any).phase2, planning_id: '' }
    get().updateHomologation(homo.id, { phases_data: { ...homo.phases_data, phase2 } } as any)
  },
})
