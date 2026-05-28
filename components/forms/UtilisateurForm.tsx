// components/forms/UtilisateurForm.tsx
'use client'
// ZÉRO @/components/ui/ import

import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Mail, Phone, Save, X,
  AlertCircle, CheckCircle2,
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
    mot_de_passe: 'AnacimDNS@2026',
    confirmer_mot_de_passe: 'AnacimDNS@2026',
    aerodrome_id: '',
    statut: 'actif',
    type_inspecteur: '',
    service: '',
    poste: '',
    superieur_id: '',
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
            poste: (u as any).poste || '',
            superieur_id: (u as any).superieur_id || '',
            statut: (u as any).statut || 'actif',
           notifications_email: u.notifications_email ?? true,
           notifications_sms: u.notifications_sms ?? false,
         })
       }
     }
   }, [mode, utilisateurId, utilisateursMap])

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.prenom.trim()) newErrors.prenom = "Le prénom est requis"
    if (!formData.nom.trim())    newErrors.nom    = "Le nom est requis"
    if (!formData.email.trim())  newErrors.email  = "L'email est requis"
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "L'email n'est pas valide"
    if (formData.role === 'inspector') {
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validerFormulaire()) return
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
            poste: formData.poste || undefined,
            superieur_id: formData.superieur_id || undefined,
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

  const emailAuto = (formData.role !== 'guest' && formData.prenom && formData.nom)
    ? `${formData.prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')}.${formData.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')}@anacim.sn`
    : ''

  useEffect(() => {
    if (emailAuto && !formData.email) setFormData(prev => ({ ...prev, email: emailAuto }))
  }, [emailAuto])

  return (
    <div className="form-container animate-fade-up" data-role={userRole} data-module="utilisateur-form">
      <form onSubmit={handleSubmit}>

        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Identité</p>
          <div className="form-grid grid-cols-2 gap-4">
            {[
              { id: 'prenom', label: 'Prénom', placeholder: 'Jean',   key: 'prenom' },
              { id: 'nom',    label: 'Nom',    placeholder: 'Dupont', key: 'nom' },
            ].map(f => (
              <div className="form-field" key={f.id}>
                <label htmlFor={f.id} className={labelClass}>{f.label} <span className="text-danger">*</span></label>
                <input id={f.id} value={(formData as any)[f.key]} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                  placeholder={f.placeholder} className={`form-input ${focusClass}${errors[f.key] ? ' border-danger' : ''}`} />
                {errors[f.key] && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors[f.key]}</p>}
              </div>
            ))}
          </div>

          <div className="form-field">
            <label className={labelClass}><Mail className="w-4 h-4 inline mr-1 text-role-primary" />Email</label>
            <input type="email" value={formData.email} readOnly
              className={`form-input ${focusClass} bg-role-primary-soft cursor-not-allowed`} />
            {formData.role !== 'guest' && <p className="field-description">Email auto-généré d'après le prénom et le nom</p>}
            {formData.role === 'guest' && (
              <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemple.com" className={`form-input ${focusClass} mt-2${errors.email ? ' border-danger' : ''}`} />
            )}
            {errors.email && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.email}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="telephone" className={labelClass}><Phone className="w-4 h-4 inline mr-1 text-role-primary" />Téléphone</label>
            <input id="telephone" value={formData.telephone} onChange={e => setFormData({ ...formData, telephone: e.target.value })} placeholder="+221 77 123 45 67" className={`form-input ${focusClass}`} />
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Rôle et affectation</p>

          <div className="form-field">
            <label htmlFor="role" className={labelClass}>Rôle <span className="text-danger">*</span></label>
            <select id="role" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}
              className={`form-select ${focusClass}`} style={selectStyle}>
              {ROLES_ANACIM.map(role => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}
            </select>
          </div>

          {formData.role === 'inspector' && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-role-primary-soft rounded-lg">
              <div className="form-field">
                <label className={labelClass}>Type d'inspecteur</label>
                <select value={formData.type_inspecteur || ''} onChange={e => setFormData({ ...formData, type_inspecteur: e.target.value })}
                  className={`form-select ${focusClass}${errors.type_inspecteur ? ' border-danger' : ''}`} style={selectStyle}>
                  <option value="">Sélectionner</option>
                  <option value="cadre_technique">Cadre Technique</option>
                  <option value="inspecteur_stagiaire">Inspecteur Stagiaire</option>
                  <option value="inspecteur_titulaire">Inspecteur Titulaire</option>
                  <option value="inspecteur_principal">Inspecteur Principal</option>
                </select>
              </div>
              <div className="form-field">
                <label className={labelClass}>Service</label>
                <select value={formData.service || ''} onChange={e => setFormData({ ...formData, service: e.target.value })}
                  className={`form-select ${focusClass}`} style={selectStyle}>
                  <option value="">Sélectionner</option>
                  <option value="normes_aerodromes">Normes des Aérodromes</option>
                  <option value="securite_aerodromes">Sécurité des Aérodromes</option>
                </select>
              </div>
              <div className="form-field">
                <label className={labelClass}>Poste hiérarchique</label>
                <select value={formData.poste || ''} onChange={e => setFormData({ ...formData, poste: e.target.value })}
                  className={`form-select ${focusClass}`} style={selectStyle}>
                  <option value="">Sans poste</option>
                  {['inspecteur','chef_ssa','chef_sna','chef_dnsa'].map(p => (
                    <option key={p} value={p}>{p.replace('_',' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className={labelClass}>Supérieur hiérarchique</label>
                <select value={formData.superieur_id || ''} onChange={e => setFormData({ ...formData, superieur_id: e.target.value })}
                  className={`form-select ${focusClass}`} style={selectStyle}>
                  <option value="">Aucun</option>
                  {utilisateurs.filter(u => ['chef_ssa','chef_sna','chef_dnsa','admin'].includes(u.poste || '')).map(c => (
                    <option key={c.id} value={c.id}>{c.prenom} {c.nom} ({c.poste})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="statut" className={labelClass}>Statut</label>
            <select id="statut" value={formData.statut} onChange={e => setFormData({ ...formData, statut: e.target.value })}
              className={`form-select ${focusClass}`} style={selectStyle}>
              {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Mot de passe par défaut */}
        <div className="space-y-4 mt-6">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Mot de passe</p>
          <div className="p-4 bg-role-primary-soft rounded-xl">
            <p className="text-sm">Le mot de passe par défaut est : <strong>AnacimDNS@2026</strong></p>
            <p className="text-xs text-muted-foreground mt-1">L'utilisateur devra le changer à sa première connexion.</p>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Notifications</p>
          {[
            { icon: Mail, key: 'notifications_email', title: 'Notifications par email', desc: 'Recevoir les alertes par email' },
            { icon: Phone, key: 'notifications_sms', title: 'Notifications par SMS', desc: 'Recevoir les alertes urgentes par SMS' },
          ].map(item => {
            const ItemIcon = item.icon
            return (
              <div key={item.key} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                <div className="flex items-center gap-2">
                  <ItemIcon className="w-4 h-4 text-role-primary" />
                  <div><p className="font-medium text-sm">{item.title}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={(formData as any)[item.key]} onChange={e => setFormData({ ...formData, [item.key]: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-role-primary" />
                </label>
              </div>
            )
          })}
          {formData.notifications_sms && !formData.telephone && (
            <div className="p-2 bg-warning/10 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-warning" /><span className="text-sm text-warning">Ajoutez un numéro de téléphone pour recevoir les SMS</span>
            </div>
          )}
        </div>

        {/* Boutons d'action */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary"><X className="w-4 h-4 mr-2 inline" />Annuler</button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary min-w-[140px]">
            {isSubmitting ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
            : <><Save className="w-4 h-4 mr-2 inline" />{mode === 'creation' ? "Créer l'utilisateur" : 'Enregistrer'}</>}
          </button>
        </div>
      </form>
    </div>
  )
}


