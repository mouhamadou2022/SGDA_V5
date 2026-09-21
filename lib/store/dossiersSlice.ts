// lib/store/dossiersSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Dossiers extraite du store monolithique, comportement identique.
// Implémentation historiquement scindée en deux blocs : réunifiée ici.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import type { ResultatChecklist } from '@/types/checklist'
import type { RegistreEntry } from './registresSlice'
import * as datastore from '../datastore'
import { registreUtils } from '../registreUtils'
import { supabase } from '../supabase'
import { storeEvents } from './eventBus'
import { evaluerRappelsDossier } from '../vigie'

// ─────────────────────────────────────────────────────────────
// Sync périodique dossiers (démarrée à la connexion — voir authSlice).
// Import dynamique du store : pas de cycle statique dossiersSlice ↔ store.
// ─────────────────────────────────────────────────────────────

let _syncInterval: ReturnType<typeof setInterval> | null = null

export function startDossiersSync(userId?: string) {
  if (_syncInterval) return
  _syncInterval = setInterval(async () => {
    const { data } = await supabase
      .from('dossiers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!data) return
    const { useAppStore } = await import('../store')
    const existing = useAppStore.getState().dossiers
    const merged = data.reduce((acc: any[], sup: any) => {
      const local = acc.find((d: any) => d.id === sup.id)
      if (local) {
        // Garder la version la plus récente
        if (new Date(sup.updated_at || sup.created_at) > new Date(local.updated_at || local.created_at)) {
          Object.assign(local, sup)
        }
      } else {
        acc.push(sup)
      }
      return acc
    }, [...existing])
    // Ajouter les dossiers locaux qui manquent dans Supabase
    for (const local of existing) {
      if (!merged.find((d: any) => d.id === local.id)) {
        merged.push(local)
      }
    }
    useAppStore.setState({ dossiers: merged as any })
  }, 10000)
}

export function stopDossiersSync() {
  if (_syncInterval) {
    clearInterval(_syncInterval)
    _syncInterval = null
  }
}

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface DossierExtension {
  date: string
  jours: 3 | 7 | 10
  motif: string
  statut: 'en_attente' | 'approuve' | 'refuse'
  superieur_approbation?: string
  superieur_nom?: string
}

export interface DossierFeedback {
  id: string
  auteur_id: string
  auteur_nom: string
  role: 'chef' | 'inspecteur'
  type: 'accuse' | 'info' | 'demande_modification' | 'validation' | 'retour_travail'
  message: string
  date: string
}

export interface DossierCollaborateur {
  inspecteur_id: string
  inspecteur_nom: string
  motif: string
  date: string
}

export interface DossierAssignment {
  id: string
  inspecteur_id: string
  inspecteur_nom: string
  statut: 'attribue' | 'accuse' | 'en_cours' | 'en_validation' | 'valide' | 'termine'
  progression: 0 | 25 | 50 | 75 | 100
  date_attribution: string
  accuse_reception?: {
    date: string
    commentaire: string
  }
  feedbacks: DossierFeedback[]
  collaborateurs: DossierCollaborateur[]
  reassigne_de?: {
    from_inspecteur_id: string
    from_inspecteur_nom: string
    date: string
    motif: string
  }
  preuves: {
    nom: string
    url: string
    taille: number
    type: string
    date_upload: string
  }[]
  historique: {
    date: string
    action: string
    details?: string
  }[]
}

export interface Dossier {
  id: string
  aerodrome_id?: string
  titre: string
  reference: string
  categorie: 'reglementaire' | 'technique' | 'operationnel' | 'surveillance' | 'formation' | 'financier'
  demandeur?: {
    nom: string
    organisation: string
    contact: string
  }
  service_assigne: 'securite_aerodromes' | 'normes_aerodromes'
  inspecteur_id?: string
  instructions?: string
  date_instruction: string
  date_limite: string
  date_limite_initiale?: string
  fichiers: {
    nom: string
    url: string
    taille: number
    type: string
    date_upload: string
    ocr_extracted?: boolean
  }[]
  progression: number
  preuve_traitement?: string
  extensions?: DossierExtension[]
  statut: 'en_attente' | 'en_cours' | 'termine' | 'archive'
  historique: {
    date: string
    action: string
    utilisateur: string
    commentaire?: string
  }[]
  assignments: DossierAssignment[]
  archived_at?: string | null
  checklist_traitement?: DossierChecklistItem[]
  checklist_generee_le?: string
  analyses_ia?: Record<string, DossierAnalyseResult>
  formulaires?: DossierFormulaire[]
  created_at: string
  updated_at: string
  created_by: string
}

export interface DossierChecklistItem {
  id: string
  numero: string
  reference_reglementaire: string
  point_verification: string
  directive_sa?: string
  directive_ns?: string
  directive_nv?: string
  directive_na?: string
  prediction: ResultatChecklist
  confiance: number
  domaine?: string
  resultat?: ResultatChecklist
  commentaire?: string
}

export interface DossierAnalyseCritere {
  nom: string
  score: number
  satisfait: boolean
  commentaire: string
}

export interface DossierAnalyseResult {
  nom_fichier: string
  score_global: number
  criteres: DossierAnalyseCritere[]
  references_reglementaires: string[]
  reserves: string[]
  recommandations: string[]
  confiance: number
  analyse_le: string
}

export interface DossierFormulaire {
  id: string
  nom: string
  url: string
  taille: number
  type: string
  date_upload: string
  reference?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface DossierSlice {
  dossiers: Dossier[]
  currentDossier: Dossier | null
  setDossiers: (dossiers: Dossier[]) => void
  setCurrentDossier: (dossier: Dossier | null) => void
  addDossier: (dossier: Omit<Dossier, 'id' | 'created_at' | 'updated_at' | 'historique'>) => Promise<Dossier | undefined>
  updateDossier: (id: string, data: Partial<Dossier>) => Promise<void>
  extendreDossier: (id: string, extension: DossierExtension, superieurNom?: string) => Promise<void>
  traiterExtension: (dossierId: string, extensionIndex: number, statut: 'approuve' | 'refuse', superieurNom?: string) => Promise<void>
  deleteDossier: (id: string) => Promise<void>
  getDossiersByInspecteur: (inspecteurId: string) => Dossier[]
  getDossiersUrgents: () => Dossier[]
  archiverDossierAutomatique: (dossierId: string) => void
  restaurerDossier: (dossierId: string) => void
  addAssignment: (dossierId: string, assignment: Omit<DossierAssignment, 'id' | 'date_attribution' | 'feedbacks' | 'collaborateurs' | 'preuves' | 'historique'>) => Promise<void>
  updateAssignment: (dossierId: string, assignmentId: string, data: Partial<DossierAssignment>) => void
  reassignAssignment: (dossierId: string, assignmentId: string, newInspecteurId: string, newInspecteurNom: string, motif: string) => void
  addAssignmentFeedback: (dossierId: string, assignmentId: string, feedback: Omit<DossierFeedback, 'id' | 'date'>) => void
  addAssignmentCollaborateur: (dossierId: string, assignmentId: string, collaborateur: Omit<DossierCollaborateur, 'date'>) => void
  accuserReceptionAssignment: (dossierId: string, assignmentId: string, commentaire: string) => void
  enregistrerAnalyseIA: (dossierId: string, nomFichier: string, analyse: DossierAnalyseResult) => Promise<void>
  setChecklistTraitement: (dossierId: string, items: DossierChecklistItem[]) => Promise<void>
  mettreAJourItemChecklist: (dossierId: string, itemId: string, resultat: ResultatChecklist, commentaire?: string) => Promise<void>
  ajouterFormulaireDossier: (dossierId: string, formulaire: Omit<DossierFormulaire, 'id' | 'date_upload'>) => Promise<void>
  retirerFormulaireDossier: (dossierId: string, formulaireId: string) => Promise<void>
  evaluerTravailInspecteur: (dossierId: string, assignmentId: string, decision: 'valide' | 'retour', commentaire: string) => Promise<void>
  /**
   * Vigie périodique des dossiers (retard + échéances J-15/J-7/J-3).
   * Déménagé de ecartsSlice.verifierRappelsAutomatiques : chaque tranche
   * est propriétaire de sa vigie. Décisions pures dans lib/vigie.ts.
   */
  verifierRappelsDossiers: () => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createDossiersSlice)
// ─────────────────────────────────────────────────────────────

export const createDossiersSlice: StateCreator<AppStore, [], [], DossierSlice> = (set, get) => ({
  dossiers: [],
  currentDossier: null,

  setDossiers: (dossiers) => set({ dossiers }),

  setCurrentDossier: (dossier) => set({ currentDossier: dossier }),

  addDossier: async (dossier) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newDossier = {
      ...dossier,
      id,
      created_at: now,
      updated_at: now,
      historique: [{
        date: now,
        action: 'Création du dossier',
        utilisateur: get().user?.id || 'system',
        commentaire: 'Dossier créé'
      }],
      assignments: dossier.assignments || []
    } as Dossier

    // Persister dans Supabase (avec l'id explicite pour cohérence avec les assignments)
    const { created_at: __, updated_at: ___, historique: ____, ...payload } = newDossier
        const result = await datastore.createDossier({
          ...payload,
          id,
          created_at: now,
          updated_at: now,
          assignments: newDossier.assignments || [],
        })
    if (result.error) {
      console.error('[store] Erreur création dossier Supabase:', result.error)
    }

    set((state) => ({
      dossiers: [...state.dossiers, newDossier]
    }))
    return newDossier
  },

  extendreDossier: async (id, extension, superieurNom) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === id)
    if (!dossier) return
    const estApprouve = extension.statut === 'approuve'
    const newDateLimite = estApprouve
      ? new Date(new Date(dossier.date_limite).getTime() + extension.jours * 86400000).toISOString()
      : dossier.date_limite

    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === id
          ? {
              ...d,
              date_limite: newDateLimite,
              extensions: [...(d.extensions || []), { ...extension, superieur_approbation: estApprouve ? (superieurNom || 'chef') : undefined, date: now }],
              historique: [...d.historique, { date: now, action: `${estApprouve ? 'Extension' : 'Demande d\'extension'} de délai de ${extension.jours} jour(s) : ${extension.motif}`, utilisateur: state.user?.nom || 'Système' }],
              updated_at: now,
            }
          : d
      ),
    }))

    // Persister dans Supabase
    const updated = get().dossiers.find(d => d.id === id)
    if (updated) {
      const result = await datastore.updateDossier(id, {
        date_limite: newDateLimite,
        extensions: updated.extensions,
        updated_at: now,
      })
      if (result.error) {
        console.error('[store] Erreur persistance extension Supabase:', result.error)
      }
    }
  },

  traiterExtension: async (dossierId, extensionIndex, statut, superieurNom) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === dossierId)
    if (!dossier || !dossier.extensions?.[extensionIndex]) return
    const ext = dossier.extensions[extensionIndex]
    if (ext.statut !== 'en_attente') return

    const estApprouve = statut === 'approuve'
    const newDateLimite = estApprouve
      ? new Date(new Date(dossier.date_limite).getTime() + ext.jours * 86400000).toISOString()
      : dossier.date_limite

    const updatedExtensions = dossier.extensions.map((e, i) =>
      i === extensionIndex
        ? { ...e, statut, superieur_approbation: superieurNom || 'chef' }
        : e
    )

    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId
          ? {
              ...d,
              date_limite: newDateLimite,
              extensions: updatedExtensions,
              historique: [...d.historique, { date: now, action: `Extension ${statut === 'approuve' ? 'approuvée' : 'refusée'} (${ext.jours}j) : ${ext.motif}`, utilisateur: state.user?.nom || 'Système' }],
              updated_at: now,
            }
          : d
      ),
    }))

    const updatedDossier = get().dossiers.find(d => d.id === dossierId)
    if (updatedDossier) {
      await datastore.updateDossier(dossierId, {
        date_limite: newDateLimite,
        extensions: updatedExtensions,
        updated_at: now,
      })
    }
  },

  updateDossier: async (id, data) => {
    const result = await datastore.updateDossier(id, data)
    if (result.error) {
      console.error('[store] Erreur mise à jour dossier Supabase:', result.error)
    }
    set((state) => ({
      dossiers: state.dossiers.map(d => d.id === id ? { ...d, ...data, updated_at: new Date().toISOString() } : d)
    }))
  },

  deleteDossier: async (id) => {
    const dossier = get().dossiers.find(d => d.id === id)
    if (!dossier) return
    // Archiver au lieu de supprimer si terminé ou déjà archivé
    if (dossier.statut === 'termine' || dossier.statut === 'archive') {
      return get().archiverDossierAutomatique(id)
    }
    const result = await datastore.deleteDossier(id)
    if (result.error) {
      console.error('[store] Erreur suppression dossier Supabase:', result.error)
    }
    set((state) => ({
      dossiers: state.dossiers.filter(d => d.id !== id),
      currentDossier: state.currentDossier?.id === id ? null : state.currentDossier,
    }))
  },

  getDossiersByInspecteur: (inspecteurId) => get().dossiers.filter(d =>
    d.inspecteur_id === inspecteurId ||
    d.assignments?.some(a => a.inspecteur_id === inspecteurId)
  ),

  getDossiersUrgents: () => get().dossiers.filter(d => d.statut === 'en_cours' || d.statut === 'en_attente'),

  archiverDossierAutomatique: async (dossierId) => {
    const state = get()
    const dossier = state.dossiers.find((d) => d.id === dossierId)
    if (!dossier || dossier.statut !== 'termine') return
    const now = new Date().toISOString()
    const entry = registreUtils.toRegistreEntryFromDossier({ ...dossier, archived_at: now }, state.aerodromes.find(a => a.id === dossier.aerodrome_id))

    await datastore.updateDossier(dossierId, { statut: 'archive', archived_at: now, updated_at: now })

    set((state) => ({
      dossiers: state.dossiers.map((d) =>
        d.id === dossierId ? { ...d, statut: 'archive', archived_at: now } : d
      ),
      registreEntries: [...(state.registreEntries || []), { ...entry, id: crypto.randomUUID(), created_at: now, timeline: entry.timeline || [] } as RegistreEntry],
    }))
  },

  restaurerDossier: async (dossierId) => {
    await datastore.updateDossier(dossierId, { statut: 'termine', archived_at: undefined, updated_at: new Date().toISOString() })
    set((state) => ({
      dossiers: state.dossiers.map((d) =>
        d.id === dossierId && d.statut === 'archive'
          ? { ...d, statut: 'termine', archived_at: undefined }
          : d
      ),
    }))
  },

  addAssignment: async (dossierId, assignment) => {
    const now = new Date().toISOString()
    const newAssignment: DossierAssignment = {
      id: crypto.randomUUID(),
      ...assignment,
      statut: 'attribue',
      progression: 0,
      date_attribution: now,
      feedbacks: [],
      collaborateurs: [],
      preuves: [],
      historique: [{ date: now, action: `Attribué à ${assignment.inspecteur_nom}`, details: '' }],
    }
    const auteur = get().user?.nom || 'Système'

    set((state) => {
      const dossier = state.dossiers.find(d => d.id === dossierId)
      if (!dossier) return state
      return {
        dossiers: state.dossiers.map(d =>
          d.id === dossierId
            ? {
                ...d,
                assignments: [...(d.assignments || []), newAssignment],
                historique: [...d.historique, { date: now, action: `Attribution à ${assignment.inspecteur_nom}`, utilisateur: auteur }],
                updated_at: now,
              }
            : d
        ),
      }
    })

    // Persister les assignments dans Supabase
    const updatedDossier = get().dossiers.find(d => d.id === dossierId)
    if (updatedDossier) {
      const result = await datastore.updateDossier(dossierId, {
        assignments: updatedDossier.assignments,
        updated_at: now,
      })
      if (result.error) {
        console.error('[store] Erreur persistance assignment Supabase:', result.error)
      }
    }
  },

  updateAssignment: async (dossierId, assignmentId, data) => {
    const state = get()
    const now = new Date().toISOString()
    const updatedAssignments = state.dossiers.find(d => d.id === dossierId)?.assignments.map(a =>
      a.id === assignmentId ? { ...a, ...data, historique: [...a.historique, ...(data.historique || [])] } : a
    ) || []
    const total = updatedAssignments.reduce((s, a) => s + a.progression, 0)
    const dossierProgression = Math.round(total / Math.max(updatedAssignments.length, 1))
    const result = await datastore.updateDossier(dossierId, { assignments: updatedAssignments, progression: dossierProgression, updated_at: now })
    if (result.error) console.error('[store] Erreur persistance updateAssignment:', result.error)
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, assignments: updatedAssignments, progression: dossierProgression, updated_at: now } : d
      ),
    }))
  },

  reassignAssignment: async (dossierId, assignmentId, newInspecteurId, newInspecteurNom, motif) => {
    const state = get()
    const now = new Date().toISOString()
    const auteur = state.user?.nom || 'Système'
    const updatedAssignments: DossierAssignment[] = (state.dossiers.find(d => d.id === dossierId)?.assignments.map(a =>
      a.id === assignmentId
        ? {
            ...a,
            inspecteur_id: newInspecteurId,
            inspecteur_nom: newInspecteurNom,
            statut: 'attribue' as const,
            progression: a.progression,
            reassigne_de: {
              from_inspecteur_id: a.inspecteur_id,
              from_inspecteur_nom: a.inspecteur_nom,
              date: now,
              motif,
            },
            historique: [...a.historique, { date: now, action: `Réassigné à ${newInspecteurNom}`, details: motif }],
            feedbacks: [...a.feedbacks, {
              id: crypto.randomUUID(),
              auteur_id: auteur,
              auteur_nom: auteur,
              role: 'chef',
              type: 'info',
              message: `Réassignation: ${motif}`,
              date: now,
            }],
          }
        : a
    ) || []) as DossierAssignment[]
    const total = updatedAssignments.reduce((s, a) => s + a.progression, 0)
    const dossierProgression = Math.round(total / Math.max(updatedAssignments.length, 1))
    const result = await datastore.updateDossier(dossierId, { assignments: updatedAssignments, progression: dossierProgression, updated_at: now })
    if (result.error) console.error('[store] Erreur persistance reassignAssignment:', result.error)
    set((state) => {
      const dossier = state.dossiers.find(d => d.id === dossierId)
      if (!dossier) return state
      return {
        dossiers: state.dossiers.map(d =>
          d.id === dossierId
            ? {
                ...d,
                assignments: updatedAssignments,
                progression: dossierProgression,
                historique: [...d.historique, { date: now, action: `Réassignation du dossier à ${newInspecteurNom}`, utilisateur: auteur, commentaire: motif }],
                updated_at: now,
              }
            : d
        ),
      }
    })
  },

  addAssignmentFeedback: async (dossierId, assignmentId, feedback) => {
    const state = get()
    const now = new Date().toISOString()
    const newFeedback: DossierFeedback = { id: crypto.randomUUID(), date: now, ...feedback }
    const updatedAssignments = state.dossiers.find(d => d.id === dossierId)?.assignments.map(a =>
      a.id === assignmentId
        ? { ...a, feedbacks: [...a.feedbacks, newFeedback], historique: [...a.historique, { date: now, action: `Feedback: ${feedback.type}`, details: feedback.message }] }
        : a
    ) || []
    const result = await datastore.updateDossier(dossierId, { assignments: updatedAssignments, updated_at: now })
    if (result.error) console.error('[store] Erreur persistance addAssignmentFeedback:', result.error)
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, assignments: updatedAssignments, updated_at: now } : d
      ),
    }))
  },

  addAssignmentCollaborateur: (dossierId, assignmentId, collaborateur) => set((state) => {
    const now = new Date().toISOString()
    const newCollab: DossierCollaborateur = { date: now, ...collaborateur }
    return {
      dossiers: state.dossiers.map(d =>
        d.id === dossierId
          ? {
              ...d,
              assignments: d.assignments.map(a =>
                a.id === assignmentId
                  ? { ...a, collaborateurs: [...a.collaborateurs, newCollab], historique: [...a.historique, { date: now, action: `Collaboration: ${collaborateur.inspecteur_nom} sollicité`, details: collaborateur.motif }] }
                  : a
              ),
              updated_at: now,
            }
          : d
      ),
    }
  }),

  accuserReceptionAssignment: async (dossierId, assignmentId, commentaire) => {
    const state = get()
    const now = new Date().toISOString()
    const updatedAssignments = state.dossiers.find(d => d.id === dossierId)?.assignments.map(a =>
      a.id === assignmentId
        ? { ...a, statut: 'accuse' as const, accuse_reception: { date: now, commentaire }, historique: [...a.historique, { date: now, action: 'Accusé réception', details: commentaire }] }
        : a
    ) || []
    await datastore.updateDossier(dossierId, { assignments: updatedAssignments, updated_at: now })
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId
          ? { ...d, assignments: updatedAssignments, updated_at: now }
          : d
      ),
    }))
  },

  enregistrerAnalyseIA: async (dossierId, nomFichier, analyse) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const analyses = { ...(dossier.analyses_ia || {}), [nomFichier]: analyse }
    await datastore.updateDossier(dossierId, { analyses_ia: analyses, updated_at: now })
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, analyses_ia: analyses, updated_at: now } : d
      ),
    }))
  },

  setChecklistTraitement: async (dossierId, items) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    await datastore.updateDossier(dossierId, { checklist_traitement: items, checklist_generee_le: now, updated_at: now })
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, checklist_traitement: items, checklist_generee_le: now, updated_at: now } : d
      ),
    }))
  },

  mettreAJourItemChecklist: async (dossierId, itemId, resultat, commentaire) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const items = (dossier.checklist_traitement || []).map(i =>
      i.id === itemId ? { ...i, resultat, commentaire } : i
    )
    await datastore.updateDossier(dossierId, { checklist_traitement: items, updated_at: now })
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, checklist_traitement: items, updated_at: now } : d
      ),
    }))
  },

  ajouterFormulaireDossier: async (dossierId, formulaire) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const newFormulaire: DossierFormulaire = { id: crypto.randomUUID(), date_upload: now, ...formulaire }
    const formulaires = [...(dossier.formulaires || []), newFormulaire]
    await datastore.updateDossier(dossierId, { formulaires, updated_at: now })
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, formulaires, updated_at: now } : d
      ),
    }))
  },

  retirerFormulaireDossier: async (dossierId, formulaireId) => {
    const now = new Date().toISOString()
    const dossier = get().dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const formulaires = (dossier.formulaires || []).filter(f => f.id !== formulaireId)
    await datastore.updateDossier(dossierId, { formulaires, updated_at: now })
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId ? { ...d, formulaires, updated_at: now } : d
      ),
    }))
  },

  evaluerTravailInspecteur: async (dossierId, assignmentId, decision, commentaire) => {
    const state = get()
    const now = new Date().toISOString()
    const auteur = state.user?.nom || 'Chef'
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return

    const updatedAssignments = dossier.assignments.map(a => {
      if (a.id !== assignmentId) return a
      if (decision === 'valide') {
        return {
          ...a,
          statut: 'valide' as const,
          historique: [...a.historique, { date: now, action: 'Travail validé par le chef', details: commentaire }],
          feedbacks: [...a.feedbacks, { id: crypto.randomUUID(), date: now, auteur_id: state.user?.id || '', auteur_nom: auteur, role: 'chef' as const, type: 'validation' as const, message: commentaire || 'Travail validé' }],
        }
      }
      return {
        ...a,
        statut: 'en_cours' as const,
        historique: [...a.historique, { date: now, action: 'Travail retourné pour corrections', details: commentaire }],
        feedbacks: [...a.feedbacks, { id: crypto.randomUUID(), date: now, auteur_id: state.user?.id || '', auteur_nom: auteur, role: 'chef' as const, type: 'retour_travail' as const, message: commentaire || 'Corrections demandées' }],
      }
    })

    const allValides = updatedAssignments.length > 0 && updatedAssignments.every(a => a.statut === 'valide' || a.statut === 'termine')
    const nouveauStatut = allValides ? ('termine' as const) : dossier.statut

    const result = await datastore.updateDossier(dossierId, {
      assignments: updatedAssignments,
      statut: nouveauStatut,
      updated_at: now,
      historique: [...dossier.historique, { date: now, action: decision === 'valide' ? `Travail de ${auteur} validé` : `Travail retourné pour corrections`, utilisateur: auteur, commentaire }],
    })
    if (result.error) console.error('[store] Erreur persistance evaluerTravailInspecteur:', result.error)
    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === dossierId
          ? { ...d, assignments: updatedAssignments, statut: nouveauStatut, updated_at: now, historique: [...d.historique, { date: now, action: decision === 'valide' ? `Travail de ${auteur} validé` : `Travail retourné pour corrections`, utilisateur: auteur, commentaire }] }
          : d
      ),
    }))
  },

  verifierRappelsDossiers: () => {
    const state = get()
    const maintenant = new Date()
    const dossiersActifs = state.dossiers.filter(d => d.statut === 'en_cours' || d.statut === 'en_attente')
    dossiersActifs.forEach(dossier => {
      // Décision pure (lib/vigie) — la tranche applique.
      const decision = evaluerRappelsDossier(dossier, maintenant)
      if (decision.notifierRetard) {
        const assignes = dossier.assignments?.filter(a => a.statut !== 'termine' && a.statut !== 'valide') || []
        assignes.forEach(a => {
          storeEvents.emit('notification:envoyer', {
            user_id: a.inspecteur_id, type: 'danger', title: 'Dossier en retard',
            message: `Dossier ${dossier.reference} — ${dossier.titre} : délai dépassé`,
            canal: 'in_app',
          })
        })
        if (dossier.created_by) {
          storeEvents.emit('notification:envoyer', {
            user_id: dossier.created_by, type: 'danger', title: 'Dossier en retard',
            message: `Dossier ${dossier.reference} — ${dossier.titre} : délai dépassé`,
            canal: 'in_app',
          })
        }
        set((s) => ({ dossiers: s.dossiers.map(d => d.id === dossier.id ? { ...d, _retard_notifie: true } : d) }))
      }
      decision.seuils.forEach(seuil => {
        const key = `_rappel_j${seuil}`
        const assignes = dossier.assignments?.filter(a => a.statut !== 'termine' && a.statut !== 'valide') || []
        assignes.forEach(a => {
          storeEvents.emit('notification:envoyer', {
            user_id: a.inspecteur_id, type: 'warning', title: `Échéance J-${seuil}`,
            message: `Dossier ${dossier.reference} — ${dossier.titre} : échéance dans ${seuil} jours`,
            canal: 'in_app',
          })
        })
        set((s) => ({ dossiers: s.dossiers.map(d => d.id === dossier.id ? { ...d, [key]: true } : d) }))
      })
    })
  },
})
