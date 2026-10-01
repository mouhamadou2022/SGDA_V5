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
  // Équipe d'instruction désignée une fois (chef pilote + externes).
  responsable_id?: string;
  equipe_ids?: string[];
  chef_id?: string;
  externes?: Array<{ id: string; nom: string; specialite?: string; organisme?: string }>;
  assigne_le?: string;
  assigne_par?: string;
  valide_par?: string;
  transmis_exploitant_le?: string;
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
  /**
   * Assigne l'équipe d'instruction (une fois, modifiable) : responsable +
   * équipe + chef (+ experts externes), tracés et notifiés. Réservé à
   * l'admin côté UI.
   */
  assignerEquipeExemption: (
    exemptionId: string,
    assignation: {
      responsable_id?: string
      equipe_ids?: string[]
      chef_id?: string
      externes?: Array<{ id: string; nom: string; specialite?: string; organisme?: string }>
    },
  ) => void;
  /**
   * Décision finale (chef ou admin) : avis + statuts + valide_par +
   * retransmission exploitant (notif + email best-effort).
   */
  deciderExemption: (
    exemptionId: string,
    avis: 'favorable' | 'a_reviser' | 'defavorable',
    details?: { commentaires?: string; fichiers?: { nom: string; url: string }[] },
  ) => void;
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

  assignerEquipeExemption: (exemptionId, assignation) => {
    const ex = get().exemptions.find(e => e.id === exemptionId)
    if (!ex) return
    const auteur = get().user
    const auteurNom = auteur ? `${auteur.prenom || ''} ${auteur.nom || ''}`.trim() || 'Admin' : 'Admin'
    const now = new Date().toISOString()
    get().updateExemption(exemptionId, {
      responsable_id: assignation.responsable_id,
      equipe_ids: assignation.equipe_ids ?? [],
      chef_id: assignation.chef_id,
      externes: assignation.externes ?? [],
      assigne_le: now,
      assigne_par: auteurNom,
    } as Partial<Exemption>)
    const dests = [...new Set([
      assignation.responsable_id, ...(assignation.equipe_ids || []), assignation.chef_id,
    ].filter(Boolean))] as string[]
    for (const userId of dests) {
      get().addNotification({
        user_id: userId,
        type: 'info',
        title: `Instruction exemption ${ex.reference}`,
        message: 'Vous faites partie de l’équipe d’instruction.',
        canal: 'in_app',
      })
    }
  },

  deciderExemption: (exemptionId, avis, details) => {
    const ex = get().exemptions.find(e => e.id === exemptionId)
    if (!ex) return
    const now = new Date().toISOString()
    const validePar = get().user?.id
    const patch = construireDecisionExemption(avis, details, now, validePar)
    get().updateExemption(exemptionId, patch as Partial<Exemption>)
    // Retransmission : exploitants rattachés au site (notif + email best-effort).
    const aero = get().aerodromes.find(a => a.id === ex.aerodrome_id)
    const ops = get().utilisateurs.filter(u =>
      u.aerodrome_id === ex.aerodrome_id &&
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? ''),
    )
    const titre = `Exemption ${avis === 'favorable' ? 'acceptée' : avis === 'a_reviser' ? 'à réviser' : 'refusée'} — ${ex.reference}`
    const message = `${aero?.code_oaci || ''} : ${details?.commentaires || 'voir les commentaires d’instruction dans votre portail.'}`
    for (const op of ops) {
      get().addNotification({ user_id: op.id, type: avis === 'defavorable' ? 'danger' : avis === 'a_reviser' ? 'warning' : 'success', title: titre, message, canal: 'in_app' })
      const emailTo = op.notification_email || op.email
      if (emailTo && op.notifications_email !== false) {
        fetch('/api/notifications/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emailTo,
            subject: `SGDA - ${titre}`,
            message: `Bonjour ${op.prenom || 'Exploitant'},\n\n${message}\n\nCordialement,\nANACIM - SGDA`,
          }),
        }).catch(() => {})
      }
    }
  },
});

/**
 * Construit le patch de décision (pur, testé) : mêmes règles que l'UI
 * historique (favorable→active/acceptee, a_reviser→sans statut, defavorable→
 * cloturee/refusee) + traçabilité valide_par + retransmission.
 */
export function construireDecisionExemption(
  avis: 'favorable' | 'a_reviser' | 'defavorable',
  details: { commentaires?: string; fichiers?: { nom: string; url: string }[] } | undefined,
  now: string,
  validePar: string | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    avis_final: avis,
    inspecteur_commentaires: details?.commentaires,
    inspecteur_fichiers: details?.fichiers || [],
    date_decision: now,
    valide_par: validePar,
    transmis_exploitant_le: now,
  }
  if (avis === 'favorable') {
    return { ...base, workflow_statut: 'favorable', statut: 'active', decision: 'acceptee' }
  }
  if (avis === 'a_reviser') {
    return { ...base, workflow_statut: 'a_reviser' }
  }
  return { ...base, workflow_statut: 'defavorable', statut: 'cloturee', decision: 'refusee' }
}
