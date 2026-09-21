// lib/store/codesAccesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Codes d'accès extraite du store monolithique, comportement identique.
// Lectures inter-slices via get() : utilisateurs.
// Mutations utilisateurs via ÉVÉNEMENTS (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import * as datastore from '../datastore'
import { codeAccesUtils } from '../codeAccesUtils'
import { storeEvents } from './eventBus'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface CodeAcces {
  id: string
  code: string
  code_partiel: string
  aerodrome_id: string
  created_by: string
  created_at: string
  expires_at?: string
  last_login?: string
  nb_connexions: number
  statut: 'actif' | 'expire' | 'revogue'
  code_type?: string
  description?: string
  dg_prenom?: string
  dg_nom?: string
  focal_prenom?: string
  focal_nom?: string
  staff_prenom?: string
  staff_nom?: string
  telephone?: string
  email?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface CodeAccesSlice {
  codesAcces: CodeAcces[]
  setCodesAcces: (codes: CodeAcces[]) => void
  genererCode: (aerodromeId: string, description?: string, expiresAt?: string, codeGenere?: string, codeType?: string, dgPrenom?: string, dgNom?: string, focalPrenom?: string, focalNom?: string, staffPrenom?: string, staffNom?: string, telephone?: string, email?: string) => CodeAcces
  revoquerCode: (id: string) => Promise<void>
  deleteCodeAcces: (id: string) => Promise<void>
  verifierCode: (code: string) => { valide: boolean; aerodromeId?: string }
  getCodesByAerodrome: (aerodromeId: string) => CodeAcces[]
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createCodesAccesSlice)
// ─────────────────────────────────────────────────────────────

export const createCodesAccesSlice: StateCreator<AppStore, [], [], CodeAccesSlice> = (set, get) => ({
  codesAcces: [],

  setCodesAcces: (codes) => set({ codesAcces: codes }),

  genererCode: (aerodromeId, description, expiresAt, codeGenere, codeType, dgPrenom, dgNom, focalPrenom, focalNom, staffPrenom, staffNom, telephone, email) => {
    const code = codeGenere || (() => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    })()
    const newCode: CodeAcces = {
      id: crypto.randomUUID(),
      aerodrome_id: aerodromeId,
      code,
      code_partiel: codeAccesUtils.masquerCode(code),
      description: description || '',
      expires_at: expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
      statut: 'actif',
      nb_connexions: 0,
      created_at: new Date().toISOString(),
      created_by: get().user?.id || '',
      code_type: codeType || 'FP',
      dg_prenom: dgPrenom || '',
      dg_nom: dgNom || '',
      focal_prenom: focalPrenom || '',
      focal_nom: focalNom || '',
      staff_prenom: staffPrenom || '',
      staff_nom: staffNom || '',
      telephone: telephone || '',
      email: email || '',
    }
    set((state) => ({ codesAcces: [...state.codesAcces, newCode] }))
    datastore.createCodeAcces(newCode).then(r => { if (r.error) console.error('Erreur création code acces Supabase:', r.error) }).catch(() => {})
    return newCode
  },

  revoquerCode: async (id) => {
    const code = get().codesAcces.find(c => c.id === id)
    set((state) => ({ codesAcces: state.codesAcces.map(c => c.id === id ? { ...c, statut: 'revogue' as const } : c) }))
    datastore.revokeCodeAcces(id).then(r => { if (r.error) console.error('Erreur révocation code acces Supabase:', r.error) }).catch(() => {})
    // Supprimer les utilisateurs liés à ce code d'accès
    if (code?.aerodrome_id) {
      const linkedUsers = get().utilisateurs.filter(u =>
        u.aerodrome_id === code.aerodrome_id &&
        ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role ?? '') &&
        u.password_temporaire === true
      )
      for (const user of linkedUsers) {
        // Suppression via événement (tranche utilisateurs propriétaire).
        storeEvents.emit('utilisateur:supprimer-lie', { user_id: user.id })
      }
    }
  },

  deleteCodeAcces: async (id) => {
    const code = get().codesAcces.find(c => c.id === id)
    set((state) => ({ codesAcces: state.codesAcces.filter(c => c.id !== id) }))
    datastore.deleteCodeAcces(id).then(r => { if (r.error) console.error('Erreur suppression code acces Supabase:', r.error) }).catch(() => {})
    // Supprimer les utilisateurs liés
    if (code?.aerodrome_id) {
      const linkedUsers = get().utilisateurs.filter(u =>
        u.aerodrome_id === code.aerodrome_id &&
        ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role ?? '') &&
        u.password_temporaire === true
      )
      for (const user of linkedUsers) {
        // Suppression via événement (tranche utilisateurs propriétaire,
        // repli désactivation centralisé dans l'abonnement).
        storeEvents.emit('utilisateur:supprimer-lie', { user_id: user.id })
      }
    }
  },

  verifierCode: (code) => {
    const found = get().codesAcces.find(c => c.code === code && c.statut === 'actif')
    if (!found) return { valide: false }
    if (found.expires_at && new Date(found.expires_at) < new Date()) {
      // Auto-révoquer le code expiré + supprimer les utilisateurs liés
      get().revoquerCode(found.id)
      return { valide: false }
    }
    return { valide: true, aerodromeId: found.aerodrome_id }
  },

  getCodesByAerodrome: (aerodromeId) => get().codesAcces.filter(c => c.aerodrome_id === aerodromeId),
})
