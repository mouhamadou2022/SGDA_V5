// components/forms/UtilisateurForm.tsx
'use client'
// ZÉRO @/components/ui/ import

import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Mail, Phone, Key, Save, X,
  AlertCircle, CheckCircle2, Eye, EyeOff,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { useFormProgress } from '@/hooks/useFormProgress'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

interface UtilisateurFormProps {
  mode: 'creation' | 'modification'
  utilisateurId?: string
  onSuccess?: () => void
  onCancel?: () => void
  userRole: string
  activeTab?: string
  onTabChange?: (id: string) => void
  onProgressChange?: (n: number) => void
}

const TYPES_INSPECTEUR = [
  { id: 'cadre_technique',      label: 'Cadre Technique' },
  { id: 'inspecteur_titulaire', label: 'Inspecteur Titulaire' },
  { id: 'inspecteur_principal', label: 'Inspecteur Principal' },
]

const SERVICES = [
  { id: 'normes_aerodromes',   label: 'Normes des Aérodromes' },
  { id: 'securite_aerodromes', label: 'Sécurité des Aérodromes' },
]

const DOMAINES = [
  { id: 'exploitation',    label: 'Exploitation' },
  { id: 'sli',             label: 'SLI-RA' },
  { id: 'genie_civil',     label: 'Génie civil' },
  { id: 'genie_electrique', label: 'Génie électrique' },
]

const STATUTS = [
  { id: 'actif',    label: 'Actif' },
  { id: 'inactif',  label: 'Inactif' },
  { id: 'suspendu', label: 'Suspendu' },
]

const ROLES_ANACIM = ['admin', 'inspector', 'dg_anacim', 'guest']

const ROLE_LABELS: Record<string, string> = {
  admin:          'Administrateur',
  inspector:      'Inspecteur',
  dg_anacim:      'DG ANACIM',
  guest:          'Invité',
}

export function UtilisateurForm({
  mode, utilisateurId, onSuccess, onCancel, userRole,
  activeTab: activeTabProp = 'informations', onTabChange, onProgressChange,
}: UtilisateurFormProps) {
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const aerodromes = useAppStore(s => s.aerodromes);
  const addUtilisateur = useAppStore(s => s.addUtilisateur);
  const updateUtilisateur = useAppStore(s => s.updateUtilisateur)

  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    role: 'guest' as string,
    mot_de_passe: '',
    confirmer_mot_de_passe: '',
    aerodrome_id: '',
    type_inspecteur: '',
    service: '',
    domaine_principal: '',
    statut: 'actif',
    notifications_email: true,
    notifications_sms: false,
  })

  const activeTab = activeTabProp
  const setActiveTab = (id: string) => onTabChange?.(id)

  const progress = useFormProgress(formData as Record<string, unknown>, [
    'prenom', 'nom', 'email', 'role',
    ...(mode === 'creation' ? ['mot_de_passe'] : []),
  ])

   const onProgressRef = useRef(onProgressChange)
   onProgressRef.current = onProgressChange
   // Only run when progress actually changes
   useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

   // Create utilisateur lookup map for O(1) access instead of O(n) find
   const utilisateursMap = useMemo(() => {
     const map = new Map<string, any>();
     utilisateurs?.forEach(u => {
       map.set(u.id, u);
     });
     return map;
   }, [utilisateurs])

   useEffect(() => {
     if (mode === 'modification' && utilisateurId) {
       const u = utilisateursMap.get(utilisateurId)
       if (u) {
         setFormData({
           prenom: u.prenom || '',
           nom: u.nom || '',
           email: u.email || '',
           telephone: u.telephone || '',
           role: u.role || 'guest',
           mot_de_passe: '',
           confirmer_mot_de_passe: '',
           aerodrome_id: u.aerodrome_id || '',
           type_inspecteur: (u as any).type_inspecteur || '',
           service: (u as any).service || '',
           domaine_principal: (u as any).domaine_principal || '',
           statut: (u as any).statut || 'actif',
           notifications_email: u.notifications_email ?? true,
           notifications_sms: u.notifications_sms ?? false,
         })
       }
     }
   }, [mode, utilisateurId, utilisateursMap])

  useEffect(() => {
    if (formData.mot_de_passe) {
      let s = 0
      const p = formData.mot_de_passe
      if (p.length >= 8)           s += 25
      if (/[A-Z]/.test(p))         s += 25
      if (/[0-9]/.test(p))         s += 25
      if (/[^A-Za-z0-9]/.test(p))  s += 25
      setPasswordStrength(s)
    } else {
      setPasswordStrength(0)
    }
  }, [formData.mot_de_passe])

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.prenom.trim()) newErrors.prenom = "Le prénom est requis"
    if (!formData.nom.trim())    newErrors.nom    = "Le nom est requis"
    if (!formData.email.trim())  newErrors.email  = "L'email est requis"
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "L'email n'est pas valide"
    if (mode === 'creation') {
      if (!formData.mot_de_passe)               newErrors.mot_de_passe = "Le mot de passe est requis"
      else if (formData.mot_de_passe.length < 8) newErrors.mot_de_passe = "Le mot de passe doit contenir au moins 8 caractères"
      else if (passwordStrength < 75)            newErrors.mot_de_passe = "Le mot de passe n'est pas assez fort"
      if (formData.mot_de_passe !== formData.confirmer_mot_de_passe)
        newErrors.confirmer_mot_de_passe = "Les mots de passe ne correspondent pas"
    }
    if (formData.role === 'inspector') {
      if (!formData.type_inspecteur)   newErrors.type_inspecteur   = "Le type d'inspecteur est requis"
      if (!formData.service)           newErrors.service           = "Le service est requis"
      if (!formData.domaine_principal) newErrors.domaine_principal = "Le domaine principal est requis"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const getPasswordStrengthColor = () => {
    if (passwordStrength < 25) return 'var(--color-danger)'
    if (passwordStrength < 75) return 'var(--color-warning)'
    return 'var(--color-success)'
  }

  const getPasswordStrengthText = () => {
    if (passwordStrength < 25) return 'Très faible'
    if (passwordStrength < 50) return 'Faible'
    if (passwordStrength < 75) return 'Moyen'
    return 'Fort'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validerFormulaire()) { setActiveTab('informations'); return }
    setIsSubmitting(true)
    try {
      const data = {
        prenom: formData.prenom,
        nom: formData.nom,
        email: formData.email,
        telephone: formData.telephone || undefined,
        role: formData.role,
          ...(formData.role === 'inspector' && {
          type_inspecteur: formData.type_inspecteur,
          service: formData.service,
          domaine_principal: formData.domaine_principal,
        }),
        statut: formData.statut,
        notifications_email: formData.notifications_email,
        notifications_sms: formData.notifications_sms,
        ...(mode === 'creation' && { mot_de_passe: formData.mot_de_passe }),
        updated_at: new Date().toISOString(),
      }
      if (mode === 'creation') {
        let authId: string | undefined
        try {
          // Utiliser l'API create-user pour confirmation automatique de l'email
          const res = await fetch('/api/auth/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: formData.email,
              password: formData.mot_de_passe,
              prenom: formData.prenom,
              nom: formData.nom,
              role: formData.role,
              must_change_password: true,
            }),
          })
          const apiData = await res.json()
          if (res.ok) {
            authId = apiData.auth_id
          } else {
            console.error('[UtilisateurForm] Erreur API create-user:', apiData.error)
            setErrors({ submit: apiData.error || 'Erreur création du compte' })
            setIsSubmitting(false)
            return
          }
        } catch (err) {
          console.error('[UtilisateurForm] Erreur création Auth:', err)
        }
        addUtilisateur({
          ...data,
          id: crypto.randomUUID(),
          auth_id: authId,
          created_at: new Date().toISOString(),
          force_pwd_change: true,
        } as any)
      } else {
        updateUtilisateur(utilisateurId!, data as any)
      }
      onSuccess?.()
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Une erreur est survenue lors de la sauvegarde')
    } finally {
      setIsSubmitting(false)
    }
  }

  const p = formData.mot_de_passe

  return (
    <div className="form-container animate-fade-up" data-role={userRole} data-module="utilisateur-form">
      <form onSubmit={handleSubmit}>

        {/* Onglet Informations */}
        <div className={activeTab === 'informations' ? 'space-y-4 animate-fade-in' : 'hidden'}>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Identité</p>
            <div className="form-grid grid-cols-2 gap-4">
              {[
                { id: 'prenom', label: 'Prénom', placeholder: 'Jean',   key: 'prenom' },
                { id: 'nom',    label: 'Nom',    placeholder: 'Dupont', key: 'nom' },
              ].map(f => (
                <div className="form-field" key={f.id}>
                  <label htmlFor={f.id} className={labelClass}>
                    {f.label} <span className="text-danger">*</span>
                  </label>
                  <input
                    id={f.id}
                    value={(formData as any)[f.key]}
                    onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className={`form-input ${focusClass}${errors[f.key] ? ' border-danger' : ''}`}
                  />
                  {errors[f.key] && (
                    <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors[f.key]}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="form-field">
              <label htmlFor="email" className={labelClass}>
                <Mail className="w-4 h-4 inline mr-1 text-role-primary" />
                Email <span className="text-danger">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="jean.dupont@anacim.sn"
                className={`form-input ${focusClass}${errors.email ? ' border-danger' : ''}`}
              />
              {errors.email && (
                <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.email}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="telephone" className={labelClass}>
                <Phone className="w-4 h-4 inline mr-1 text-role-primary" />
                Téléphone
              </label>
              <input
                id="telephone"
                value={formData.telephone}
                onChange={e => setFormData({ ...formData, telephone: e.target.value })}
                placeholder="+221 77 123 45 67"
                className={`form-input ${focusClass}`}
              />
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Rôle et affectation</p>

            <div className="form-field">
              <label htmlFor="role" className={labelClass}>
                Rôle <span className="text-danger">*</span>
              </label>
              <select
                id="role"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
                className={`form-select ${focusClass}`}
                style={selectStyle}
              >
                {ROLES_ANACIM.map(role => (
                  <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>
                ))}
              </select>
            </div>

            {formData.role === 'inspector' && (
              <>
                {[
                  { id: 'type_inspecteur',   label: "Type d'inspecteur",  opts: TYPES_INSPECTEUR, key: 'type_inspecteur' },
                  { id: 'service',           label: 'Service rattaché',    opts: SERVICES,         key: 'service' },
                  { id: 'domaine_principal', label: 'Domaine principal',   opts: DOMAINES,         key: 'domaine_principal' },
                ].map(f => (
                  <div className="form-field" key={f.id}>
                    <label htmlFor={f.id} className={labelClass}>
                      {f.label} <span className="text-danger">*</span>
                    </label>
                    <select
                      id={f.id}
                      value={(formData as any)[f.key]}
                      onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                      className={`form-select ${focusClass}${errors[f.key] ? ' border-danger' : ''}`}
                      style={selectStyle}
                    >
                      <option value="">Sélectionner</option>
                      {f.opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {errors[f.key] && (
                      <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors[f.key]}</p>
                    )}
                  </div>
                ))}
              </>
            )}

            <div className="form-field">
              <label htmlFor="statut" className={labelClass}>Statut</label>
              <select
                id="statut"
                value={formData.statut}
                onChange={e => setFormData({ ...formData, statut: e.target.value })}
                className={`form-select ${focusClass}`}
                style={selectStyle}
              >
                {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Onglet Sécurité */}
        <div className={activeTab === 'securite' ? 'space-y-4 animate-fade-in' : 'hidden'}>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Mot de passe</p>

            <div className="form-field">
              <label htmlFor="mot_de_passe" className={labelClass}>
                <Key className="w-4 h-4 inline mr-1 text-role-primary" />
                {mode === 'creation' ? 'Mot de passe *' : 'Nouveau mot de passe'}
              </label>
              <div className="relative">
                <input
                  id="mot_de_passe"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.mot_de_passe}
                  onChange={e => setFormData({ ...formData, mot_de_passe: e.target.value })}
                  className={`form-input ${focusClass} pr-10${errors.mot_de_passe ? ' border-danger' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4 text-muted-foreground" />
                    : <Eye className="w-4 h-4 text-muted-foreground" />
                  }
                </button>
              </div>
              {errors.mot_de_passe && (
                <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.mot_de_passe}</p>
              )}
            </div>

            {p && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span>Force du mot de passe</span>
                  <span className="font-medium">{getPasswordStrengthText()}</span>
                </div>
                <div className="progress h-2">
                  <div
                    className="progress-bar"
                    style={{ width: `${passwordStrength}%`, backgroundColor: getPasswordStrengthColor() }}
                  />
                </div>
                <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                  <li className={p.length >= 8           ? 'text-success' : ''}>✓ Au moins 8 caractères</li>
                  <li className={/[A-Z]/.test(p)         ? 'text-success' : ''}>✓ Au moins une majuscule</li>
                  <li className={/[0-9]/.test(p)         ? 'text-success' : ''}>✓ Au moins un chiffre</li>
                  <li className={/[^A-Za-z0-9]/.test(p)  ? 'text-success' : ''}>✓ Au moins un caractère spécial</li>
                </ul>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="confirmer_mot_de_passe" className={labelClass}>Confirmer le mot de passe</label>
              <input
                id="confirmer_mot_de_passe"
                type="password"
                value={formData.confirmer_mot_de_passe}
                onChange={e => setFormData({ ...formData, confirmer_mot_de_passe: e.target.value })}
                className={`form-input ${focusClass}${errors.confirmer_mot_de_passe ? ' border-danger' : ''}`}
              />
              {errors.confirmer_mot_de_passe && (
                <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.confirmer_mot_de_passe}</p>
              )}
            </div>

            {formData.mot_de_passe && formData.confirmer_mot_de_passe &&
             formData.mot_de_passe === formData.confirmer_mot_de_passe && (
              <div className="p-2 bg-success/10 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm text-success">Les mots de passe correspondent</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Notifications</p>
            {[
              {
                icon: Mail, key: 'notifications_email',
                title: 'Notifications par email',
                desc: 'Recevoir les alertes par email',
              },
              {
                icon: Phone, key: 'notifications_sms',
                title: 'Notifications par SMS',
                desc: 'Recevoir les alertes urgentes par SMS',
              },
            ].map(item => {
              const ItemIcon = item.icon
              return (
                <div key={item.key} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                  <div className="flex items-center gap-2">
                    <ItemIcon className="w-4 h-4 text-role-primary" />
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(formData as any)[item.key]}
                      onChange={e => setFormData({ ...formData, [item.key]: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-role-primary" />
                  </label>
                </div>
              )
            })}

            {formData.notifications_sms && !formData.telephone && (
              <div className="p-2 bg-warning/10 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="text-sm text-warning">
                  Ajoutez un numéro de téléphone pour recevoir les SMS
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">
            <X className="w-4 h-4 mr-2 inline" />Annuler
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary min-w-[140px]">
            {isSubmitting
              ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
              : <><Save className="w-4 h-4 mr-2 inline" />{mode === 'creation' ? "Créer l'utilisateur" : 'Enregistrer'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
