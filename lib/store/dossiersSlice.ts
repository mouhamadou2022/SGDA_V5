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
import { dossierUtils } from '../dossierUtils'

// ─────────────────────────────────────────────────────────────
// Sync périodique dossiers (démarrée à la connexion — voir authSlice).
// Import dynamique du store : pas de cycle statique dossiersSlice ↔ store.
// ─────────────────────────────────────────────────────────────

let _syncInterval: ReturnType<typeof setInterval> | null = null
let _lastSyncAt: string | null = null

const DOSSIERS_SYNC_OVERLAP_MS = 60_000

async function synchroniserDossiers() {
  const since = new Date(
    new Date(_lastSyncAt || Date.now() - 24 * 60 * 60 * 1000).getTime() - DOSSIERS_SYNC_OVERLAP_MS,
  ).toISOString()

  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(1000)

  if (error || !data?.length) return

  const plusRecent = data.reduce(
    (max, d) => (String(d.updated_at || '') > max ? String(d.updated_at || '') : max),
    _lastSyncAt || '',
  )
  if (plusRecent) _lastSyncAt = plusRecent

  const { useAppStore } = await import('../store')
  const map = new Map(useAppStore.getState().dossiers.map((d) => [d.id, d]))
  for (const distant of data as unknown as Array<Record<string, unknown>>) {
    const id = String(distant.id || '')
    if (!id) continue
    // Les archives ne sont pas chargées au démarrage : une archive distante
    // signifie qu'il faut la retirer de la liste de travail locale.
    if (distant.statut === 'archive') {
      map.delete(id)
      continue
    }
    const local = map.get(id)
    const tDistant = new Date(String(distant.updated_at || distant.created_at || 0)).getTime()
    const tLocal = new Date(local?.updated_at || local?.created_at || 0).getTime()
    if (!local || !Number.isFinite(tLocal) || tDistant >= tLocal) {
      map.set(id, distant as unknown as Dossier)
    }
  }
  useAppStore.setState({ dossiers: [...map.values()] })
}

export function startDossiersSync(_userId?: string) {
  if (_syncInterval) return
  _lastSyncAt = null
  _syncInterval = setInterval(() => {
    synchroniserDossiers().catch((err) => console.error('[store] Sync dossiers:', err))
  }, 15_000)
  synchroniserDossiers().catch((err) => console.error('[store] Sync dossiers:', err))
}

export function stopDossiersSync() {
  if (_syncInterval) {
    clearInterval(_syncInterval)
    _syncInterval = null
  }
  _lastSyncAt = null
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

    const { created_at: __, updated_at: ___, ...payload } = newDossier
    const construirePayload = (reference: string) => ({
      ...payload,
      reference,
      id,
      created_at: now,
      updated_at: now,
      assignments: newDossier.assignments || [],
    })

    // Persister dans Supabase. En cas de collision de référence (deux
    // créations concurrentes), recalculer la référence depuis la base.
    let reference = dossier.reference
    let result = await datastore.createDossier(construirePayload(reference))
    if (result.error && /duplicate key|unique constraint|idx_dossiers_reference_unique/i.test(result.error)) {
      const { data: references } = await datastore.listDossierReferences()
      if (references?.length) {
        reference = dossierUtils.prochaineReference(references)
        result = await datastore.createDossier(construirePayload(reference))
      }
    }

    if (result.error) {
      console.error('[store] Erreur création dossier Supabase:', result.error)
      throw new Error(result.error)
    }
    if (!result.data) {
      const message = 'Création du dossier refusée par le serveur'
      console.error('[store]', message)
      throw new Error(message)
    }

    const created = {
      ...newDossier,
      ...result.data,
      id,
      reference,
      historique: result.data.historique?.length ? result.data.historique : newDossier.historique,
    } as Dossier

    set((state) => ({
      dossiers: [...state.dossiers, created]
    }))
    return created
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
    // Source unique : le local ne reflète que ce qui est persisté (sinon
    // « terminé ici, en cours ailleurs »). Rollback si Supabase refuse.
    const snapshot = get().dossiers
    set((state) => ({
      dossiers: state.dossiers.map(d => d.id === id ? { ...d, ...data, updated_at: new Date().toISOString() } : d)
    }))
    const result = await datastore.updateDossier(id, data)
    if (result.error) {
      console.error('[store] Erreur mise à jour dossier Supabase, rollback:', result.error)
      set({ dossiers: snapshot })
    }
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
    // Alignement unification : notifier l'assigné (comme les autres processus).
    storeEvents.emit('notification:envoyer', {
      user_id: assignment.inspecteur_id,
      type: 'info',
      title: `Dossier assigné — ${updatedDossier?.reference || ''}`,
      message: `« ${updatedDossier?.titre || ''} » vous est attribué. Accusez réception puis traitez.`,
      canal: 'in_app',
    })
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
