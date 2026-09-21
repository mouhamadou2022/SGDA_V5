// lib/store/formationsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Formations/Inspecteurs/Compétences extraite du store monolithique,
// comportement identique. Appels inter-slices via get() (store composé) :
// utilisateurs, surveillances, ecarts, addNotification.

import type { StateCreator } from 'zustand'
import type { AppStore, Utilisateur } from '../store'
import { storeEvents } from './eventBus'
import type { PosteANACIM } from '../auth'
import { buildIdentifiant } from '../auth'
import * as datastore from '../datastore'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Formation {
  id: string
  reference: string
  titre: string
  type: 'initiale' | 'continue' | 'specialisee' | 'recyclage' | 'certification'
  domaines: string[]
  date: string
  duree_heures: number
  lieu: string
  formateur: string
  formateur_externe?: boolean
  participants: string[]
  objectifs: string
  programme?: string
  documents?: {
    nom: string
    url: string
  }[]
  budget?: number
  certificat?: boolean
  certificat_nom?: string
  date_debut_reelle?: string
  statut: 'planifiee' | 'en_cours' | 'terminee' | 'annulee'
  presence?: Record<string, 'present' | 'absent' | 'excusé'>
  evaluation?: Record<string, number>
  created_at: string
  created_by: string
  deleted_at?: string
  deleted_by?: string
}

export interface Competence {
  id: string
  inspecteur_id: string
  domaine: string
  niveau: number
  date_obtention: string
  source: 'formation' | 'certification' | 'evaluation' | 'auto' | 'manuel'
  source_id?: string
  expire_le?: string
}

/**
 * Compétence déclarative d'un Utilisateur (formulaire / profil).
 * Échelle mixte historique : niveau textuel ('expert', 'confirme', …) ou
 * numérique (1-3, dérivé des spécialités). Voir declarativeNiveauVersNombre()
 * pour la conversion vers l'échelle numérique des entités Competence.
 */
export interface CompetenceDeclarative {
  domaine: string
  niveau: string | number
}

/** Convertit un niveau déclaratif vers l'échelle numérique 1-3. */
export function declarativeNiveauVersNombre(niveau: string | number): number {
  if (typeof niveau === 'number') return Math.min(3, Math.max(1, Math.round(niveau)))
  const n = niveau.trim().toLowerCase()
  if (n === 'expert' || n === '3') return 3
  if (n === 'confirme' || n === 'confirmé' || n === '2') return 2
  return 1
}

/**
 * Convertit des compétences déclaratives (Utilisateur) en entités Competence
 * (Inspecteur). Remplace l'affectation directe qui mélangeait les deux
 * échelles — un niveau 'expert' textuel était ensuite comparé
 * numériquement et silencieusement ignoré.
 */
export function declarativesVersCompetences(
  inspecteurId: string,
  declaratives: CompetenceDeclarative[] | undefined | null,
): Competence[] {
  if (!declaratives || declaratives.length === 0) return []
  const now = new Date().toISOString()
  return declaratives.map(d => ({
    id: crypto.randomUUID(),
    inspecteur_id: inspecteurId,
    domaine: d.domaine,
    niveau: declarativeNiveauVersNombre(d.niveau),
    date_obtention: now,
    source: 'auto' as const,
  }))
}

export interface Inspecteur {
  id: string
  matricule: string
  prenom: string
  nom: string
  email: string
  telephone?: string
  type: 'cadre_technique' | 'inspecteur_stagiaire' | 'inspecteur_titulaire' | 'inspecteur_principal'
  service: 'normes_aerodromes' | 'securite_aerodromes'
  poste?: PosteANACIM
  superieur_id?: string
  domaine_principal: 'exploitation' | 'sli' | 'genie_civil' | 'genie_electrique'
  photo?: string
  statut: 'en_service' | 'en_conge' | 'en_mission' | 'absent'
  competences: Competence[]
  formations: string[]
  user_id?: string
  created_at: string
  deleted_at?: string
  deleted_by?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface FormationSlice {
  formations: Formation[]
  inspecteurs: Inspecteur[]
  competences: Competence[]
  competencesVersion: number
  setFormations: (formations: Formation[]) => void
  setInspecteurs: (inspecteurs: Inspecteur[]) => void
  addFormation: (formation: Omit<Formation, 'id' | 'created_at'>) => Promise<void>
  updateFormation: (id: string, data: Partial<Formation>) => Promise<void>
  deleteFormation: (id: string) => Promise<void>
  addInspecteur: (inspecteur: Omit<Inspecteur, 'id' | 'created_at'>) => Promise<void>
  updateInspecteur: (id: string, data: Partial<Inspecteur>) => Promise<void>
  deleteInspecteur: (id: string) => Promise<void>
  getCompetencesByInspecteur: (inspecteurId: string) => Competence[]
  getFormationsByInspecteur: (inspecteurId: string) => Formation[]
  mettreAJourCompetences: (inspecteurId: string, formationId: string) => void
  incrementerVersion: () => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createFormationsSlice)
// ─────────────────────────────────────────────────────────────

export const createFormationsSlice: StateCreator<AppStore, [], [], FormationSlice> = (set, get) => ({
  formations: [],
  inspecteurs: [],
  competences: [],
  competencesVersion: 0,

  setFormations: (formations) => set({ formations }),

  setInspecteurs: (inspecteurs) => set({ inspecteurs }),

  addFormation: async (formation) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newFormation: Formation = { ...formation, id, created_at: now }
    const { id: _, created_at: __, ...payload } = newFormation
    const result = await datastore.createFormation(payload as any)
    if (result.error) {
      console.error('Erreur création formation Supabase:', result.error)
      return
    }
    set((state) => ({ formations: [...state.formations, result.data as Formation] }))
    get().incrementerVersion()
  },

  updateFormation: async (id, data) => {
    const snapshot = get().formations
    set((state) => ({ formations: state.formations.map(f => f.id === id ? { ...f, ...data } : f) }))
    const result = await datastore.updateFormation(id, data)
    if (result.error) {
      console.error('Erreur update formation Supabase, rollback:', result.error)
      set({ formations: snapshot })
      return
    }
    if (data.statut === 'terminee') {
      const formation = get().formations.find(f => f.id === id)
      if (formation?.participants) {
        formation.participants.forEach(pid => get().mettreAJourCompetences(pid, id))
      }
    }
    get().incrementerVersion()
  },

  deleteFormation: async (id) => {
    const snapshot = get().formations
    set((state) => ({ formations: state.formations.filter(f => f.id !== id) }))
    const result = await datastore.deleteFormation(id)
    if (result.error) {
      console.error('Erreur delete formation Supabase, rollback:', result.error)
      set({ formations: snapshot })
    } else {
      get().incrementerVersion()
    }
  },

  addInspecteur: async (inspecteur) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'
    const emailBase = buildIdentifiant(inspecteur.prenom, inspecteur.nom).replace(`@${domain}`, '')
    let emailANACIM = `${emailBase}@${domain}`

    const roleMap: Record<string, string> = {
      'inspecteur_principal': 'inspector',
      'inspecteur_titulaire': 'inspector',
      'cadre_technique': 'inspector',
    }

    const { competences, ...inspecteurSansCompetences } = inspecteur

    // Vérifier matricule (rapide)
    const matriculeExiste = await datastore.checkMatriculeExists(inspecteur.matricule);
    if (matriculeExiste) {
      throw new Error(`Le matricule "${inspecteur.matricule}" existe déjà dans la base de données`);
    }

    const inspecteurPourSupabase = {
      ...inspecteurSansCompetences,
      id,
      email: emailANACIM,
      created_at: now,
      competences: [],
    }

    // Créer dans Supabase avec retry si email dupliqué
    let result = await datastore.createInspecteur(inspecteurPourSupabase as any)

    if (result.error && result.error.includes('inspecteurs_email_key')) {
      let suffix = 2
      while (suffix <= 100) {
        const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'
        const nouvelEmail = `${emailBase}${suffix}@${domain}`
        inspecteurPourSupabase.email = nouvelEmail
        emailANACIM = nouvelEmail
        result = await datastore.createInspecteur(inspecteurPourSupabase as any)
        if (!result.error || !result.error.includes('inspecteurs_email_key')) {
          break
        }
        suffix++
      }
    }

    if (result.error) {
      throw new Error(result.error)
    }

    // Créer les compétences en parallèle
    if (competences && Array.isArray(competences) && competences.length > 0) {
      Promise.all(competences.map(comp =>
        datastore.createCompetence({
          inspecteur_id: id,
          domaine: comp.domaine,
          niveau: comp.niveau || 3,
          date_obtention: comp.date_obtention || now.split('T')[0],
          source: comp.source || 'formation',
          source_id: comp.source_id,
          expire_le: comp.expire_le || undefined,
        }).catch(err => console.error('Erreur création compétence:', err))
      ))
    }

    // Ajouter au store immédiatement
    const inspecteurComplet: Inspecteur = {
      ...inspecteurSansCompetences,
      id,
      email: emailANACIM,
      created_at: now,
      competences: competences || [],
      formations: [],
    }

    set((state) => ({
      inspecteurs: [...state.inspecteurs, inspecteurComplet],
    }))

    // Créer le compte Supabase Auth (synchrone pour garantir la connexion)
    const userId = crypto.randomUUID()
    const newUser: Utilisateur = {
      id: userId,
      email: emailANACIM,
      prenom: inspecteur.prenom,
      nom: inspecteur.nom,
      role: roleMap[inspecteur.type] || 'inspector',
      inspecteur_id: id,
      password_temporaire: true,
      notifications_email: true,
      notifications_sms: false,
      statut: 'actif',
      matricule: inspecteur.matricule,
      service: inspecteur.service,
      type_inspecteur: inspecteur.type,
      specialites: [],
    }

    try {
      console.log('[addInspecteur] Création compte Auth pour:', emailANACIM)
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailANACIM,
          password: 'AnacimDNS@2026',
          prenom: inspecteur.prenom,
          nom: inspecteur.nom,
          role: newUser.role,
          inspecteur_id: id,
          matricule: inspecteur.matricule,
          service: inspecteur.service,
          must_change_password: true,
        }),
      })
      const data = await res.json()
      console.log('[addInspecteur] Réponse API:', res.status, data)
      if (!res.ok) {
        console.error('Erreur création compte auth:', data.error)
        throw new Error(`Compte Auth non créé: ${data.error}`)
      }

      set((state) => ({
        utilisateurs: [...state.utilisateurs, { ...newUser, auth_id: data.auth_id }]
      }))
      storeEvents.emit('notification:envoyer', {
        user_id: get().user?.id || '',
        type: 'success',
        message: `Inspecteur ${inspecteur.prenom} ${inspecteur.nom} créé. Email: ${emailANACIM} / Mot de passe: AnacimDNS@2026`,
        canal: 'in_app'
      })
    } catch (error: any) {
      console.error('Erreur API create-user:', error)
      throw new Error(`Inspecteur créé mais erreur Auth: ${error.message}`)
    }

    storeEvents.emit('notification:envoyer', {
      user_id: get().user?.id || '',
      type: 'success',
      message: `Inspecteur ${inspecteur.prenom} ${inspecteur.nom} créé`,
      canal: 'in_app'
    })
    get().incrementerVersion()
  },

  updateInspecteur: async (id, data) => {
    set((state) => ({
      inspecteurs: state.inspecteurs.map(i => i.id === id ? { ...i, ...data } : i)
    }))
    // Sync vers Utilisateur (sans boucle : on vérifie que la valeur a changé)
    const inspecteur = get().inspecteurs.find(i => i.id === id)
    const user = inspecteur?.user_id ? get().utilisateurs.find(u => u.id === inspecteur.user_id) : undefined
    const syncToUser: Record<string, any> = {}
    if (data.poste !== undefined) syncToUser.poste = data.poste
    if (data.superieur_id !== undefined) syncToUser.superieur_id = data.superieur_id
    if (data.type !== undefined && data.type !== user?.type_inspecteur) syncToUser.type_inspecteur = data.type
    if (data.service !== undefined && data.service !== user?.service) syncToUser.service = data.service
    if (Object.keys(syncToUser).length && inspecteur?.user_id) {
      set((state) => ({ utilisateurs: state.utilisateurs.map(u => u.id === inspecteur.user_id ? { ...u, ...syncToUser } : u) }))
    }
    try {
      const datastore = await import('../datastore')
      // specialites n'est pas une colonne de la table inspecteurs
      const { specialites: _sp, ...dbData } = data as any
      await datastore.updateInspecteur(id, Object.keys(dbData).length ? dbData : data)
    } catch (err) {
      console.error('[store] Erreur update inspecteur:', err)
    }
    get().incrementerVersion()
  },

  deleteInspecteur: async (id: string) => {
    const state = get()
    const inspecteur = state.inspecteurs.find(i => i.id === id)
    if (!inspecteur) return

    const now = new Date().toISOString()
    const userId = get().user?.id || ''
    const deletedBy = state.user ? `${state.user.prenom} ${state.user.nom}` : 'Administrateur'

    // Trouver l'utilisateur lié
    const linkedUser = state.utilisateurs.find(u => u.inspecteur_id === id)

    // 1. Hard delete de l'inspecteur dans Supabase
    await datastore.deleteInspecteur(id)

    // 2. Hard delete de l'inspecteur du store local
    set((state) => ({
      inspecteurs: state.inspecteurs.filter(i => i.id !== id)
    }))

    // 3. Supprimer l'utilisateur lié s'il existe
    if (linkedUser) {
      set((state) => ({
        utilisateurs: state.utilisateurs.filter(u => u.id !== linkedUser.id)
      }))

      // Supprimer l'utilisateur dans Supabase
      await datastore.deleteUtilisateur(linkedUser.id)

      // Supprimer le compte Supabase Auth
      if (linkedUser.auth_id) {
        try {
          await fetch('/api/auth/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auth_id: linkedUser.auth_id }),
          })
        } catch (error) {
          console.error('Erreur API delete-user:', error)
        }
      }
    }

    // 4. Cascade sur formations: retirer des participants (sauf terminées)
    set((state) => ({
      formations: state.formations.map(f =>
        f.participants?.includes(id) && f.statut !== 'terminee'
          ? { ...f, participants: f.participants.filter((p: string) => p !== id) }
          : f
      )
    }))

    // 5. Cascade sur surveillances: retirer de l'équipe (sauf archivé/terminé)
    set((state) => ({
      surveillances: state.surveillances.map(s =>
        s.equipe_ids?.includes(id) && !['archivee', 'terminee'].includes(s.statut)
          ? { ...s, equipe_ids: s.equipe_ids.filter((eId: string) => eId !== id) }
          : s
      )
    }))

    // 6. Cascade sur écarts: retirer le responsable (sauf résolus/archivés)
    set((state) => ({
      ecarts: state.ecarts.map(e =>
        e.responsable_id === id && !['resolu', 'archive'].includes(e.statut)
          ? { ...e, responsable_id: undefined }
          : e
      )
    }))

    // 7. Notification email à l'inspecteur supprimé
    if (inspecteur.email) {
      const { notifyInspecteurDeleted } = await import('../notifications')
      notifyInspecteurDeleted(inspecteur.prenom, inspecteur.nom, inspecteur.email, deletedBy)
    }

    // 8. Notification in-app + email aux admins
    const cascadeResults = [
      { type: 'formations', count: state.formations.filter(f => f.participants?.includes(id) && f.statut !== 'terminee').length },
      { type: 'surveillances', count: state.surveillances.filter(s => s.equipe_ids?.includes(id) && !['archivee', 'terminee'].includes(s.statut)).length },
    ]
    const { notifyDeletionCascade } = await import('../notifications')
    notifyDeletionCascade('inspecteur', `${inspecteur.prenom} ${inspecteur.nom}`, cascadeResults, deletedBy)

    storeEvents.emit('notification:envoyer', {
      user_id: userId,
      type: 'warning',
      message: `L'inspecteur ${inspecteur.prenom} ${inspecteur.nom} et son compte utilisateur ont été supprimés`,
      canal: 'in_app'
    })
  },

  getCompetencesByInspecteur: (inspecteurId) => get().competences.filter(c => c.inspecteur_id === inspecteurId),

  getFormationsByInspecteur: (inspecteurId) => get().formations.filter(f => f.participants?.includes(inspecteurId)),

  mettreAJourCompetences: (inspecteurId, formationId) => {
    const formation = get().formations.find(f => f.id === formationId)
    if (!formation) return
    const newCompetences = (formation.domaines || []).map((domaine: string) => ({
      id: crypto.randomUUID(),
      inspecteur_id: inspecteurId,
      domaine: domaine,
      niveau: 3,
      source: 'formation' as const,
      source_id: formationId,
      date_obtention: new Date().toISOString(),
      expire_le: new Date(Date.now() + 365 * 86400000 * 2).toISOString(),
    } as Competence))
    set((state) => ({ competences: [...state.competences.filter(c => !(c.inspecteur_id === inspecteurId && newCompetences.some(n => n.domaine === c.domaine))), ...newCompetences] }))
  },

  incrementerVersion: () => set((s) => ({ competencesVersion: s.competencesVersion + 1 })),
})
