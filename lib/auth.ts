import { supabase } from './supabase'
import { Role } from './config'

export type PosteANACIM = 'chef_dnsa' | 'chef_ssa' | 'chef_sna' | 'inspecteur'

export interface AuthUser {
  id: string
  email: string
  nom: string
  prenom: string
  role: Role
  aerodrome_id?: string
  type_inspecteur?: string
  service_rattache?: string
  poste?: PosteANACIM
  superieur_id?: string
  domaine?: string
  must_change_password?: boolean
  last_login?: string
  readOnly?: boolean
}

export type LoginType = 'email' | 'code_acces'

export function detectLoginType(identifiant: string): LoginType {
  return identifiant.includes('@') ? 'email' : 'code_acces'
}

export function buildIdentifiant(prenom: string, nom: string): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '.')
  const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'
  return `${normalize(prenom)}.${normalize(nom)}@${domain}`
}

export const authService = {
  async login(identifiant: string, motDePasse: string): Promise<AuthUser> {
    const type = detectLoginType(identifiant)
    if (type === 'code_acces') return authService.loginWithCode(identifiant)
    return authService.loginWithEmail(identifiant, motDePasse)
  },

  async loginWithEmail(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Authentification échouée')

    const { data: userData, error: userError } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('auth_id', data.user.id)
      .single()

    if (userError) throw userError

    await supabase
      .from('utilisateurs')
      .update({ last_login: new Date().toISOString() })
      .eq('auth_id', data.user.id)

    return {
      id: data.user.id,
      email: data.user.email!,
      ...userData,
      must_change_password: userData?.force_pwd_change === true,
    } as AuthUser
  },

  async loginWithCode(code: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/login-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    const data = await res.json().catch(() => ({ error: 'Erreur serveur' }))

    if (!res.ok) {
      throw new Error(data.error || "Code d'accès invalide")
    }

    // Créer une session Supabase Auth réelle avec le mot de passe par défaut
    const email = data.user.email || ''
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: 'AnacimDNS@2026',
      })
      if (signInError) {
        console.warn('[auth] Échec signInWithPassword:', signInError.message)
        throw signInError
      }
    } catch (e) {
      console.error('[auth] Session auth non disponible:', e)
      throw new Error("Session d'accès non disponible. Contactez l'administrateur.")
    }

    return data.user as AuthUser
  },

  async forcePasswordChange(userId: string, newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error

    // Le clear du flag force_pwd_change passe par le serveur : côté client,
    // la policy RLS sur `utilisateurs` peut bloquer l'UPDATE et l'erreur
    // serait avalée silencieusement (changement demandé à chaque connexion).
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const res = await fetch('/api/auth/complete-password-change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Impossible de finaliser le changement de mot de passe')
    }
  },

  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`,
    })
    if (error) throw error
  },
}
