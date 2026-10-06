// lib/store/certificationsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Certifications extraite du store monolithique, comportement identique.
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

export interface Certification {
  id: string
  aerodrome_id: string
  reference: string
  phase_active: 1 | 2 | 3 | 4 | 5
  phases_data: {
      phase1?: {
        date_reception: string
        coordonnees: { nom: string; poste: string; email: string; telephone: string }
        nature_demande: string
        description: string
        lettre_intent_url?: string
        lettre_intent_name?: string
        rapport_preliminaire_url?: string
        lettre_transmission_url?: string
        cloture_le?: string
        // Workflow exploitant → inspecteur
        statut?: 'en_attente' | 'accuse' | 'en_cours' | 'favorable' | 'a_reviser' | 'defavorable'
        inspecteur_commentaires?: string
        inspecteur_fichiers?: { nom: string; url: string }[]
        date_accuse_reception?: string
        date_decision?: string
        // Instruction assignée (Étape 1 unification workflow) : qui instruit.
        // Lecture seule hors équipe (miroir canEditSurveillanceContent).
        responsable_id?: string
        equipe_ids?: string[]
        chef_id?: string
        assigne_le?: string
        assigne_par?: string
      }
      phase2?: {
        date_reception: string
        numero_dossier: string
        // Optionnel : renseigné à l'assignation (Étape 1), plus à la soumission.
        responsable_id?: string
        documents: Record<string, string | boolean>
        completude: number
        rapport_evaluation_url?: string
        lettre_transmission_url?: string
        avis: 'favorable' | 'favorable_reserves' | 'defavorable'
        details_reserves?: string
        cloture_le?: string
        // Workflow exploitant → inspecteur
        statut?: 'en_attente' | 'accuse' | 'en_cours' | 'favorable' | 'a_reviser' | 'defavorable'
        inspecteur_commentaires?: string
        inspecteur_fichiers?: { nom: string; url: string }[]
        date_accuse_reception?: string
        date_decision?: string
        // Instruction assignée (Étape 1 unification workflow).
        equipe_ids?: string[]
        chef_id?: string
        assigne_le?: string
        assigne_par?: string
      }
    phase3?: {
      planning_id?: string
      surveillance_id: string
      date_verification: string
      date_debut?: string
      date_fin?: string
      equipe_ids: string[]
      chef_id: string
      score_conformite: number
      nc_relevees: number
      rapport_verification_url?: string
      conditions?: string
      delai_conditions?: string
      plan_action_valide?: boolean
      rapport_evaluation_pac_url?: string
      conclusion: 'favorable' | 'favorable_conditions' | 'defavorable'
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
    phase4?: {
      numero_certificat: string
      date_delivrance: string
      date_expiration: string
      conditions_exploitation?: string
      limitations?: string
      signataire_id: string
      certificat_url?: string
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
    phase5?: {
      statut_officiel: 'certifie' | 'certifie_restrictions' | 'non_certifie'
      date_publication_aip: string
      reference_aip?: string
      notam?: string
      notification_envoyee: boolean
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
  }
  statut_global: 'en_cours' | 'certifie' | 'suspendu' | 'expire' | 'archive'
  numero_cert?: string
  date_delivrance?: string
  date_expiration?: string
  lettre_signee_url?: string
  type_certification?: 'initiale' | 'renouvellement'
  archived_at?: string | null
  exemptions_ids?: string[]
  created_at: string
  updated_at: string
}

export type CertificationPhaseData =
  Partial<NonNullable<Certification['phases_data']['phase1']>> &
  Partial<NonNullable<Certification['phases_data']['phase2']>> &
  Partial<NonNullable<Certification['phases_data']['phase3']>> &
  Partial<NonNullable<Certification['phases_data']['phase4']>> &
  Partial<NonNullable<Certification['phases_data']['phase5']>> &
  Record<string, unknown>

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface CertificationSlice {
  certifications: Certification[]
  currentCertification: Certification | null
  setCertifications: (certifications: Certification[]) => void
  setCurrentCertification: (certification: Certification | null) => void
  addCertification: (certification: Certification) => void
  updateCertification: (id: string, data: Partial<Certification>) => void
  deleteCertification: (id: string) => void
  archiverCertification: (id: string) => void
  restaurerCertification: (id: string) => void
  /**
   * Nettoie le lien vers une surveillance supprimée (phase 3).
   * Déclenché par l'événement 'certification:nettoyer-lien-surveillance'.
   * (Nom distinct de l'homologation : deux tranches, pas de collision.)
   */
  nettoyerLienSurveillanceCertification: (aerodrome_id: string, surveillance_id: string) => void
  /**
   * Nettoie le lien vers un planning supprimé (phase 3).
   * Déclenché par l'événement 'certification:nettoyer-lien-planning'.
   */
  nettoyerLienPlanningCertification: (aerodrome_id: string, planning_id: string) => void
  /**
   * Assigne l'instruction d'une phase 1 ou 2 (Étape 1 unification workflow) :
   * responsable + équipe + chef, tracés (assigne_le/par), notifiés.
   * Écriture réservée à l'admin côté UI ; lecture seule hors équipe.
   */
  assignerInstructionCertification: (
    certId: string,
    phase: 1 | 2,
    assignation: {
      responsable_id?: string
      equipe_ids?: string[]
      chef_id?: string
      externes?: Array<{ id: string; nom: string; specialite?: string; organisme?: string }>
    },
  ) => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createCertificationsSlice)
// ─────────────────────────────────────────────────────────────

export const createCertificationsSlice: StateCreator<AppStore, [], [], CertificationSlice> = (set, get) => ({
  certifications: [],
  currentCertification: null,

  setCertifications: (certifications) => set({ certifications }),

  setCurrentCertification: (certification) => set({ currentCertification: certification }),

  addCertification: (certification) => {
    // Renouvellement : Phase 1 sautée (dossier déjà constitué)
    const phase = certification.type_certification === 'renouvellement' && certification.phase_active === 1
      ? 2 : certification.phase_active
    const toAdd = { ...certification, phase_active: phase }
    set((state) => ({
      certifications: [...state.certifications, toAdd],
    }))
    // Persister dans Supabase via API (service_role, contourne RLS)
    import('@/lib/api/certifications').then(({ createCertification }) => {
      createCertification(toAdd).then(res => {
        if (res.error) console.error('[store] addCertification error:', res.error)
      }).catch(() => {})
    }).catch(err => console.error('[store] addCertification import error:', err))
  },

  updateCertification: (id, data) => {
    const oldCert = get().certifications.find(c => c.id === id)
    set((state) => ({
      certifications: state.certifications.map((c) => c.id === id ? { ...c, ...data } : c),
      currentCertification: state.currentCertification?.id === id
        ? { ...state.currentCertification, ...data }
        : state.currentCertification,
    }))
    // Persister dans Supabase via API (service_role, contourne RLS)
    import('@/lib/api/certifications').then(({ updateCertification }) => {
      updateCertification(id, data).then(res => {
        if (res.error) console.error('[store] updateCertification error:', res.error)
      }).catch(() => {})
    }).catch(err => console.error('[store] updateCertification import error:', err))
    // Recalculer le profil de risque quand la certification change de statut (surtout certifie)
    if (data.statut_global && data.statut_global !== oldCert?.statut_global && oldCert?.aerodrome_id) {
      storeEvents.emit('risque:recalcul-demande', { aerodrome_id: oldCert.aerodrome_id })
    }
  },

  deleteCertification: (id) => {
    set((state) => ({
      certifications: state.certifications.filter((c) => c.id !== id),
      currentCertification: state.currentCertification?.id === id ? null : state.currentCertification,
    }))
    // Pas de sync Supabase pour la suppression (l'admin peut le faire via le store local)
  },

  archiverCertification: (id) => {
    const cert = get().certifications.find(c => c.id === id);
    if (!cert) return;
    const now = new Date().toISOString();
    set((state) => ({
      certifications: state.certifications.map((c) =>
        c.id === id ? { ...c, statut_global: 'archive' as const, archived_at: now } : c
      ),
      currentCertification: state.currentCertification?.id === id ? null : state.currentCertification,
    }));
    // Persistance réelle (sinon l'archive disparaît au rechargement côté
    // exploitant) — même canal service_role que updateCertification.
    import('@/lib/api/certifications').then(({ updateCertification }) => {
      updateCertification(id, { statut_global: 'archive', archived_at: now } as never).then(res => {
        if (res.error) console.error('[store] archiverCertification error:', res.error)
      }).catch(() => {})
    }).catch(err => console.error('[store] archiverCertification import error:', err));
    const aerodrome = get().aerodromes.find(a => a.id === cert.aerodrome_id);
    const entry = registreUtils.toRegistreEntryFromCertification(cert, aerodrome);
    // Journal via événement (tranche registres propriétaire).
    storeEvents.emit('registre:ajouter', {
      id: crypto.randomUUID(),
      ...entry,
      timeline: [{ id: crypto.randomUUID(), etape: 'Archivage automatique', date: now, acteur: get().user?.prenom + ' ' + get().user?.nom || 'Système', acteur_role: 'systeme' }],
      created_at: now,
    });
  },

  restaurerCertification: (id) => {
    set((state) => ({
      certifications: state.certifications.map((c) =>
        c.id === id ? { ...c, statut_global: 'en_cours' as const, archived_at: null } : c
      ),
    }));
    import('@/lib/api/certifications').then(({ updateCertification }) => {
      updateCertification(id, { statut_global: 'en_cours', archived_at: null } as never).then(res => {
        if (res.error) console.error('[store] restaurerCertification error:', res.error)
      }).catch(() => {})
    }).catch(err => console.error('[store] restaurerCertification import error:', err));
  },

  nettoyerLienSurveillanceCertification: (aerodrome_id, surveillance_id) => {
    const cert = get().certifications.find(c =>
      c.aerodrome_id === aerodrome_id && (c.phases_data as any)?.phase3?.surveillance_id === surveillance_id
    )
    if (!cert) return
    const phase3 = { ...(cert.phases_data as any).phase3, surveillance_id: '' }
    get().updateCertification(cert.id, { phases_data: { ...cert.phases_data, phase3 } } as any)
  },

  nettoyerLienPlanningCertification: (aerodrome_id, planning_id) => {
    const cert = get().certifications.find(c =>
      c.aerodrome_id === aerodrome_id && (c.phases_data as any)?.phase3?.planning_id === planning_id
    )
    if (!cert) return
    const phase3 = { ...(cert.phases_data as any).phase3, planning_id: '' }
    get().updateCertification(cert.id, { phases_data: { ...cert.phases_data, phase3 } } as any)
  },

  assignerInstructionCertification: (certId, phase, assignation) => {
    const cert = get().certifications.find(c => c.id === certId)
    if (!cert || (phase !== 1 && phase !== 2)) return
    const auteur = get().user
    const auteurNom = auteur ? `${auteur.prenom || ''} ${auteur.nom || ''}`.trim() || 'Admin' : 'Admin'
    const now = new Date().toISOString()
    // Équipe désignée UNE FOIS par dossier (clé partagée), avec miroirs
    // par-phase pour compatibilité (canAdvance lit phase2.responsable_id).
    const partagee = {
      responsable_id: assignation.responsable_id,
      equipe_ids: assignation.equipe_ids ?? [],
      chef_id: assignation.chef_id,
      externes: assignation.externes ?? [],
      assigne_le: now,
      assigne_par: auteurNom,
    }
    const miroir = (ancienne: unknown) => ({
      ...(ancienne as Record<string, unknown> | undefined),
      responsable_id: partagee.responsable_id,
      equipe_ids: partagee.equipe_ids,
      chef_id: partagee.chef_id,
    })
    const phasesData = {
      ...cert.phases_data,
      instruction: partagee,
      phase1: miroir((cert.phases_data as any)?.phase1),
      phase2: miroir((cert.phases_data as any)?.phase2),
    }
    get().updateCertification(cert.id, { phases_data: phasesData } as any)
    // Notifier les désignés internes (responsable + équipe + chef, dédupliqués).
    const aero = get().aerodromes.find(a => a.id === cert.aerodrome_id)
    const dests = [...new Set([
      partagee.responsable_id, ...(partagee.equipe_ids || []), partagee.chef_id,
    ].filter(Boolean))] as string[]
    for (const userId of dests) {
      get().addNotification({
        user_id: userId,
        type: 'info',
        title: `Instruction certification ${cert.reference}`,
        message: `${aero?.code_oaci || ''} — équipe désignée par ${auteurNom}.`,
        canal: 'in_app',
      })
    }
  },
})
