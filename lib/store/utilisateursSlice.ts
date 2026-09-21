// lib/store/utilisateursSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Utilisateurs extraite du store monolithique, comportement identique.
// Lectures inter-slices via get() : inspecteurs, formations,
// surveillances, ecarts. Notifications via ÉVÉNEMENT. Miroir inspecteur
// via ÉVÉNEMENT 'inspecteur:synchroniser' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { storeEvents } from './eventBus'
import type { CompetenceDeclarative } from './formationsSlice'
import { declarativesVersCompetences } from './formationsSlice'
import type { Inspecteur } from './formationsSlice'
import * as datastore from '../datastore'
import { supabase } from '../supabase'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Utilisateur {
  id: string
  auth_id?: string
  email: string
  identifiant?: string
  nom: string
  prenom: string
  role: string
  statut: string
  force_pwd_change?: boolean
  aerodrome_id?: string
  telephone?: string
  poste?: string
  superieur_id?: string
  type_inspecteur?: string
  fonction?: string
  service?: string
  service_rattache?: string
  // Compétences déclaratives (spécialités métier).
  // Distinct de Inspecteur.competences (table Competence, niveau numérique) :
  // convertir via declarativesVersCompetences() avant toute affectation.
  competences?: CompetenceDeclarative[]
  specialites?: string[]
  matricule?: string
  inspecteur_id?: string
  last_login?: string
  password_temporaire?: boolean
  notifications_email?: boolean
  notifications_sms?: boolean
  notification_email?: string
  bio?: string
  photo_url?: string
  date_embauche?: string
  deleted_at?: string
  created_at?: string
  updated_at?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface UtilisateurSlice {
  utilisateurs: Utilisateur[]
  setUtilisateurs: (utilisateurs: Utilisateur[]) => void
  getUtilisateur: (id: string) => Utilisateur | undefined
  addUtilisateur: (u: Utilisateur) => Promise<void>
  updateUtilisateur: (id: string, data: Partial<Utilisateur>) => Promise<void>
  deleteUtilisateur: (id: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createUtilisateursSlice)
// ─────────────────────────────────────────────────────────────

export const createUtilisateursSlice: StateCreator<AppStore, [], [], UtilisateurSlice> = (set, get) => ({
  utilisateurs: [],

  setUtilisateurs: (utilisateurs) => set({ utilisateurs }),

  getUtilisateur: (id) => get().utilisateurs.find(u => u.id === id),

  addUtilisateur: async (u) => {
    set((state) => ({ utilisateurs: [...state.utilisateurs, u] }))

    // Sauvegarder l'utilisateur dans Supabase (upsert par email pour
    // réutiliser la ligne éventuellement créée par le trigger handle_new_user)
    const { error: userErr } = await supabase
      .from('utilisateurs')
      .upsert(u, { onConflict: 'email', ignoreDuplicates: false })
      .select()
      .single()
    if (userErr) console.error('[addUtilisateur] Erreur création utilisateur Supabase:', userErr)

    // Si le rôle est inspector, créer aussi un inspecteur correspondant
    if (u.role === 'inspector') {
      const inspecteurId = crypto.randomUUID()
      const inspecteur: Inspecteur = {
        id: inspecteurId,
        matricule: u.matricule || '',
        prenom: u.prenom || '',
        nom: u.nom || '',
        email: u.email || '',
        telephone: u.telephone || '',
        type: (u.type_inspecteur || 'inspecteur_titulaire') as Inspecteur['type'],
        service: (u.service || 'normes_aerodromes') as Inspecteur['service'],
        poste: (u.poste || undefined) as Inspecteur['poste'],
        superieur_id: u.superieur_id || undefined,
        domaine_principal: 'exploitation',
        photo: u.photo_url || undefined,
        statut: 'en_service',
        competences: declarativesVersCompetences(inspecteurId, u.competences),
        formations: [],
        user_id: u.id,
        created_at: new Date().toISOString(),
      }
      set((state) => ({ inspecteurs: [...state.inspecteurs, inspecteur] }))
      // Mise à jour du lien inverse sur l'utilisateur
      set((state) => ({
        utilisateurs: state.utilisateurs.map(us => us.id === u.id ? { ...us, inspecteur_id: inspecteurId } : us)
      }))
      await datastore.createInspecteur(inspecteur).catch(err =>
        console.error('[addUtilisateur] Erreur création inspecteur Supabase:', err)
      )
    }
  },

  updateUtilisateur: async (id, data) => {
    set((state) => ({ utilisateurs: state.utilisateurs.map(u => u.id === id ? { ...u, ...data } : u) }))
    datastore.updateUtilisateur(id, data).then(r => { if (r.error) console.error('Erreur update utilisateur Supabase:', r.error) }).catch(() => {})
    // Sync vers Inspecteur (sans boucle : on vérifie que la valeur a changé).
    // Sac hétérogène volontaire : inclut `specialites` (hors colonnes DB,
    // filtré dans updateInspecteur) — d'où Record<string, any>.
    const user = get().utilisateurs.find(u => u.id === id)
    if (user?.inspecteur_id) {
      const insp = get().inspecteurs.find(i => i.id === user.inspecteur_id)
      const syncToInsp: Record<string, any> = {}
      if (data.poste !== undefined) syncToInsp.poste = data.poste
      if (data.superieur_id !== undefined) syncToInsp.superieur_id = data.superieur_id
      if (data.type_inspecteur !== undefined && data.type_inspecteur !== insp?.type) syncToInsp.type = data.type_inspecteur
      if (data.service !== undefined && data.service !== insp?.service) syncToInsp.service = data.service
      if (data.competences !== undefined) syncToInsp.competences = declarativesVersCompetences(user.inspecteur_id, data.competences)
      if (data.specialites !== undefined) syncToInsp.specialites = data.specialites
      if (Object.keys(syncToInsp).length) {
        // Miroir vers la fiche inspecteur via événement (tranche
        // formations propriétaire — filtre DB inclus).
        storeEvents.emit('inspecteur:synchroniser', {
          inspecteur_id: user.inspecteur_id,
          patch: syncToInsp,
        })
      }
    }
  },

  deleteUtilisateur: async (id: string) => {
    const state = get()
    const user = state.utilisateurs.find(u => u.id === id)
    if (!user) return
    const userId = get().user?.id || ''
    const deletedBy = state.user ? `${state.user.prenom} ${state.user.nom}` : 'Administrateur'

    // Trouver l'inspecteur lié
    const linkedInspecteur = state.inspecteurs.find(i => i.id === user.inspecteur_id)

    // Supprimer le compte Supabase Auth
    let routeOk = false
    if (user.auth_id) {
      try {
        const res = await fetch('/api/auth/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_id: user.auth_id, id }),
        })
        const body = await res.json().catch(() => ({}))
        routeOk = res.ok && body?.success !== false
        if (!routeOk) console.error('[deleteUtilisateur] Route delete-user a échoué:', body?.error || res.status)
      } catch (error) {
        console.error('Erreur API delete-user:', error)
      }
    }

    // Supprimer l'utilisateur de Supabase DB
    // (si la route a déjà supprimé la ligne, ce delete est idempotent)
    const delResult = routeOk ? { error: null } : await datastore.deleteUtilisateur(id)
    if (delResult.error) {
      console.error('[deleteUtilisateur] Échec suppression Supabase (ligne conservée):', delResult.error)
    }

    // Supprimer l'utilisateur du store local
    set((state) => ({
      utilisateurs: state.utilisateurs.filter(u => u.id !== id)
    }))

    // Si un inspecteur est lié, le supprimer aussi avec cascade
    if (linkedInspecteur) {
      // Supprimer l'inspecteur dans Supabase
      await datastore.deleteInspecteur(linkedInspecteur.id)

      set((state) => ({
        inspecteurs: state.inspecteurs.filter(i => i.id !== linkedInspecteur.id),
        formations: state.formations.map(f =>
          f.participants?.includes(linkedInspecteur.id) && f.statut !== 'terminee'
            ? { ...f, participants: f.participants.filter((p: string) => p !== linkedInspecteur.id) }
            : f
        ),
        surveillances: state.surveillances.map(s =>
          s.equipe_ids?.includes(linkedInspecteur.id) && !['archivee', 'terminee'].includes(s.statut)
            ? { ...s, equipe_ids: s.equipe_ids.filter((eId: string) => eId !== linkedInspecteur.id) }
            : s
        ),
        ecarts: state.ecarts.map(e =>
          e.responsable_id === linkedInspecteur.id && !['resolu', 'archive'].includes(e.statut)
            ? { ...e, responsable_id: undefined }
            : e
        ),
      }))

      // Notification email à l'inspecteur
      if (linkedInspecteur.email) {
          const { notifyInspecteurDeleted } = await import('../notifications')
        notifyInspecteurDeleted(linkedInspecteur.prenom, linkedInspecteur.nom, linkedInspecteur.email, deletedBy)
      }
    }

    // Notification in-app + email aux admins
    const cascadeResults = linkedInspecteur ? [
      { type: 'formations', count: state.formations.filter(f => f.participants?.includes(linkedInspecteur.id) && f.statut !== 'terminee').length },
      { type: 'surveillances', count: state.surveillances.filter(s => s.equipe_ids?.includes(linkedInspecteur.id) && !['archivee', 'terminee'].includes(s.statut)).length },
    ] : []
    const { notifyDeletionCascade } = await import('../notifications')
    notifyDeletionCascade('inspecteur', `${user.prenom} ${user.nom}`, cascadeResults, deletedBy)

    storeEvents.emit('notification:envoyer', {
      user_id: userId,
      type: 'warning',
      message: `L'utilisateur ${user.prenom} ${user.nom} a été supprimé${linkedInspecteur ? ' (inspecteur lié supprimé également)' : ''}`,
      canal: 'in_app'
    })
  },
})
