// components/forms/DossierForm.tsx
'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback, useReducer, memo } from 'react'
import {
  FolderOpen, FileText, Upload, X, Calendar,
  User, Briefcase, AlertCircle, Save, Trash2, Clock, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { useAppStore, type Dossier, type Aerodrome, type Utilisateur } from '@/lib/store'
import { dossierUtils } from '@/lib/dossierUtils'

type DossierFile = NonNullable<Dossier['fichiers']>[number]

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

interface DossierFormProps {
  mode: 'creation' | 'modification'
  dossierId?: string
  aerodromeId?: string
  onSuccess?: () => void
  onCancel?: () => void
  userRole: string
  onProgressChange?: (n: number) => void
}

const CATEGORIES = [
  { id: 'reglementaire', label: 'Réglementaire' },
  { id: 'technique', label: 'Technique' },
  { id: 'operationnel', label: 'Opérationnel' },
  { id: 'surveillance', label: 'Surveillance' },
  { id: 'formation', label: 'Formation' },
  { id: 'financier', label: 'Financier' },
]

const SERVICES = [
  { id: 'securite_aerodromes', label: 'Sécurité des Aérodromes' },
  { id: 'normes_aerodromes', label: 'Normes des Aérodromes' },
]

const URGENCE = [
  { id: 'basse', label: 'Basse', color: 'text-success', bg: 'bg-success/10', icon: Clock },
  { id: 'normale', label: 'Normale', color: 'text-info', bg: 'bg-info/10', icon: Clock },
  { id: 'haute', label: 'Haute', color: 'text-warning', bg: 'bg-warning/10', icon: AlertCircle },
  { id: 'critique', label: 'Critique', color: 'text-danger', bg: 'bg-danger/10', icon: AlertTriangle },
]

const PROGRESSION_STEPS = [0, 25, 50, 75, 100] as const

interface FormState {
  titre: string
  categorie: string
  aerodrome_id: string
  demandeur_nom: string
  demandeur_organisation: string
  demandeur_contact: string
  service_assigne: string
  inspecteur_id: string
  instructions: string
  date_limite: string
  urgence: string
  fichiers: File[]
  preuves: File[]
  existingFichiers: Dossier['fichiers']
  existingPreuves: Dossier['fichiers']
  progression: 0 | 25 | 50 | 75 | 100
  statut: 'en_attente' | 'en_cours' | 'termine' | 'archive'
}

const EMPTY_STATE: FormState = {
  titre: '',
  categorie: 'reglementaire',
  aerodrome_id: '',
  demandeur_nom: '',
  demandeur_organisation: '',
  demandeur_contact: '',
  service_assigne: 'securite_aerodromes',
  inspecteur_id: '',
  instructions: '',
  date_limite: '',
  urgence: 'normale',
  fichiers: [],
  preuves: [],
  existingFichiers: [],
  existingPreuves: [],
  progression: 0,
  statut: 'en_attente',
}

type FormAction =
  | { type: 'SET'; field: keyof FormState; value: unknown }
  | { type: 'SET_MANY'; payload: Partial<FormState> }
  | { type: 'ADD_FICHIERS'; files: File[] }
  | { type: 'REMOVE_FICHIER'; idx: number }
  | { type: 'ADD_PREUVES'; files: File[] }
  | { type: 'REMEMBER_PREUVE'; idx: number }
  | { type: 'REMOVE_EXISTING_FICHIER'; idx: number }
  | { type: 'REMOVE_EXISTING_PREUVE'; idx: number }
  | { type: 'SET_PROGRESSION'; value: 0 | 25 | 50 | 75 | 100 }
  | { type: 'RESET' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.field]: action.value }
    case 'SET_MANY':
      return { ...state, ...action.payload }
    case 'ADD_FICHIERS':
      return { ...state, fichiers: [...state.fichiers, ...action.files] }
    case 'REMOVE_FICHIER':
      return { ...state, fichiers: state.fichiers.filter((_, i) => i !== action.idx) }
    case 'ADD_PREUVES':
      return { ...state, preuves: [...state.preuves, ...action.files] }
    case 'REMEMBER_PREUVE':
      return { ...state, preuves: state.preuves.filter((_, i) => i !== action.idx) }
    case 'REMOVE_EXISTING_FICHIER':
      return { ...state, existingFichiers: state.existingFichiers.filter((_, i) => i !== action.idx) }
    case 'REMOVE_EXISTING_PREUVE':
      return { ...state, existingPreuves: state.existingPreuves.filter((_, i) => i !== action.idx) }
    case 'SET_PROGRESSION': {
      const p = action.value
      const s = p === 100 ? 'termine' as const : (p > 0 ? 'en_cours' as const : state.statut)
      return { ...state, progression: p, statut: s }
    }
    case 'RESET':
      return { ...EMPTY_STATE, aerodrome_id: state.aerodrome_id }
    default:
      return state
  }
}

export const DossierForm = memo(function DossierForm({
  mode, dossierId, aerodromeId, onSuccess, onCancel, userRole, onProgressChange
}: DossierFormProps) {
  const addDossier = useAppStore(s => s.addDossier)
  const updateDossier = useAppStore(s => s.updateDossier)
  const archiverDossierAutomatique = useAppStore(s => s.archiverDossierAutomatique)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user)

  const [state, dispatch] = useReducer(formReducer, EMPTY_STATE, () => ({
    ...EMPTY_STATE, aerodrome_id: aerodromeId || '',
  }))

  const [activeTab, setActiveTab] = useState('informations')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onProgressRef = useRef(onProgressChange)
  onProgressRef.current = onProgressChange

  // ── Store data via refs (pas de subscription → pas de cascade re-render) ──
  const [aerodromes, setAerodromes] = useState<Aerodrome[]>([])
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([])

  useEffect(() => {
    const store = useAppStore.getState()
    setAerodromes(store.aerodromes)
    setUtilisateurs(store.utilisateurs)
    const unsub = useAppStore.subscribe((s, prev) => {
      if (s.aerodromes !== prev.aerodromes) setAerodromes(s.aerodromes)
      if (s.utilisateurs !== prev.utilisateurs) setUtilisateurs(s.utilisateurs)
    })
    return unsub
  }, [])

  // ── Chargement du dossier en modification ──
  const formInitRef = useRef(false)
  useEffect(() => {
    if (mode !== 'modification' || !dossierId) { formInitRef.current = false; return }
    if (formInitRef.current) return
    const d = useAppStore.getState().dossiers?.find(d => d.id === dossierId)
    if (!d) return
    dispatch({ type: 'SET_MANY', payload: {
      titre: d.titre || '',
      categorie: d.categorie || 'reglementaire',
      aerodrome_id: d.aerodrome_id || '',
      demandeur_nom: d.demandeur?.nom || '',
      demandeur_organisation: d.demandeur?.organisation || '',
      demandeur_contact: d.demandeur?.contact || '',
      service_assigne: d.service_assigne || 'securite_aerodromes',
      inspecteur_id: d.inspecteur_id || '',
      instructions: d.instructions || '',
      date_limite: d.date_limite?.split('T')[0] || '',
      urgence: (d as any).urgence || 'normale',
      existingFichiers: d.fichiers || [],
      existingPreuves: (d as any).preuves || [],
      progression: d.progression || 0,
      statut: d.statut || 'en_attente',
    }})
    formInitRef.current = true
  }, [mode, dossierId])

  // ── Suggestion délai ──
  const getDelaiSuggere = useMemo(() => {
    const cat = CATEGORIES.find(c => c.id === state.categorie)
    if (!cat) return null
    const base: Record<string, number> = {
      reglementaire: 30, technique: 45, operationnel: 30,
      surveillance: 60, formation: 90, financier: 45,
    }
    let d = base[state.categorie] || 45
    if (state.urgence === 'critique') d = Math.floor(d * 0.3)
    else if (state.urgence === 'haute') d = Math.floor(d * 0.5)
    else if (state.urgence === 'basse') d = Math.floor(d * 1.3)
    return d
  }, [state.categorie, state.urgence])

  useEffect(() => {
    if (mode === 'creation' && getDelaiSuggere && !state.date_limite) {
      const date = new Date()
      date.setDate(date.getDate() + getDelaiSuggere)
      dispatch({ type: 'SET', field: 'date_limite', value: date.toISOString().split('T')[0] })
    }
  }, [mode, getDelaiSuggere]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style memoïsé (empêche les mises à jour DOM inutiles) ──
  const progressBarStyle = useMemo(() => ({ width: `${state.progression}%` }), [state.progression])
  const progress = useMemo(() => {
    const required = ['titre', 'date_limite', 'inspecteur_id']
    const filled = required.filter(k => {
      const v = (state as Record<string, unknown>)[k]
      return v !== null && v !== undefined && v !== ''
    })
    return Math.round((filled.length / required.length) * 100)
  }, [state.titre, state.date_limite, state.inspecteur_id])

  useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  // ── Indicateur délai ──
  const delai = useMemo(() => {
    if (!state.date_limite) return null
    const { jours, couleur } = dossierUtils.getDelaiRestant(state.date_limite)
    const variant = couleur === 'rouge' ? 'danger' : couleur === 'orange' ? 'warning' : 'success'
    return { jours, variant }
  }, [state.date_limite])

  // ── Callbacks stables ──
  const setField = useCallback((field: keyof FormState, value: unknown) => {
    dispatch({ type: 'SET', field, value })
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const all = Array.from(e.target.files)
    const valid = all.filter(f => f.size <= 10 * 1024 * 1024)
    const invalid = all.filter(f => f.size > 10 * 1024 * 1024)
    if (invalid.length) alert(`${invalid.length} fichier(s) dépassent 10 Mo`)
    dispatch({ type: 'ADD_FICHIERS', files: valid })
  }, [])

  const handlePreuvesUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const all = Array.from(e.target.files)
    const valid = all.filter(f => f.size <= 10 * 1024 * 1024)
    const invalid = all.filter(f => f.size > 10 * 1024 * 1024)
    if (invalid.length) alert(`${invalid.length} fichier(s) dépassent 10 Mo`)
    dispatch({ type: 'ADD_PREUVES', files: valid })
  }, [])

  const handleProgressionChange = useCallback((val: number) => {
    const p = Math.min(100, Math.max(0, val)) as 0 | 25 | 50 | 75 | 100
    dispatch({ type: 'SET_PROGRESSION', value: p })
  }, [])

  const validerFormulaire = useCallback((): boolean => {
    const e: Record<string, string> = {}
    if (!state.titre.trim()) e.titre = 'Le titre est requis'
    if (!state.date_limite) e.date_limite = 'La date limite est requise'
    if (!state.inspecteur_id) e.inspecteur_id = "L'inspecteur est requis"
    if (state.date_limite) {
      const d = new Date(state.date_limite)
      const t = new Date(); t.setHours(0, 0, 0, 0)
      if (d < t) e.date_limite = 'La date limite doit être future'
    }
    if (state.progression === 100 && state.preuves.length === 0 && state.existingPreuves.length === 0) {
      e.preuves = 'Ajoutez les preuves de traitement avant de finaliser'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }, [state])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validerFormulaire()) { setActiveTab('suivi'); return }
    setIsSubmitting(true)
    try {
      const uploadFiles = async (files: File[]) =>
        Promise.all(files.map(f => ({
          nom: f.name,
          url: URL.createObjectURL(f),
          taille: f.size,
          type: f.type,
          date_upload: new Date().toISOString(),
        })))

      const newFichiers = await uploadFiles(state.fichiers)
      const newPreuves = await uploadFiles(state.preuves)
      const tousFichiers = [...state.existingFichiers, ...newFichiers]
      const toutesPreuves = [...state.existingPreuves, ...newPreuves]

      const historiqueEntry = {
        date: new Date().toISOString(),
        action: mode === 'creation' ? 'Création du dossier' : 'Modification du dossier',
        utilisateur: user?.id || 'system',
      }

      if (mode === 'creation') {
        addDossier({
          titre: state.titre,
          reference: dossierUtils.genererReference(new Date().getFullYear(), Math.floor(Math.random() * 9999)),
          categorie: state.categorie as Dossier['categorie'],
          aerodrome_id: state.aerodrome_id || undefined,
          demandeur: state.demandeur_nom ? { nom: state.demandeur_nom, organisation: state.demandeur_organisation, contact: state.demandeur_contact } : undefined,
          service_assigne: state.service_assigne as Dossier['service_assigne'],
          inspecteur_id: state.inspecteur_id,
          instructions: state.instructions,
          date_instruction: new Date().toISOString(),
          date_limite: state.date_limite,
          fichiers: tousFichiers,
          preuves: toutesPreuves,
          progression: state.progression,
          statut: state.statut,
          urgence: state.urgence,
        } as any)

        addNotification({
          user_id: user?.id || '', type: 'success', title: 'Dossier créé',
          message: `Dossier ${state.titre} créé avec succès`, canal: 'in_app',
        })
      } else if (dossierId) {
        const store = useAppStore.getState()
        const dossier = store.dossiers?.find(d => d.id === dossierId)
        const historique = [...(dossier?.historique || []), { ...historiqueEntry }]
        updateDossier(dossierId, {
          ...state as any,
          fichiers: tousFichiers,
          preuves: toutesPreuves,
          historique,
          updated_at: new Date().toISOString(),
        })

        addNotification({
          user_id: user?.id || '', type: 'info', title: 'Dossier modifié',
          message: `Dossier ${state.titre} mis à jour`, canal: 'in_app',
        })
      }

      // Auto-archivage si 100% + preuves
      if (state.progression === 100 && (toutesPreuves.length > 0) && dossierId) {
        archiverDossierAutomatique(dossierId)
        addNotification({
          user_id: user?.id || '', type: 'success', title: 'Dossier archivé',
          message: `Dossier ${state.titre} terminé et archivé automatiquement`, canal: 'in_app',
        })
      }

      onSuccess?.()
    } catch (err) {
      console.error('Erreur sauvegarde dossier:', err)
      addNotification({
        user_id: user?.id || '', type: 'danger', title: 'Erreur',
        message: 'Une erreur est survenue lors de la sauvegarde', canal: 'in_app',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [state, mode, dossierId, user, addDossier, updateDossier, archiverDossierAutomatique, addNotification, validerFormulaire, onSuccess])

  // ── UI ──
  const TABS = [
    { id: 'informations', label: 'Informations', icon: FileText },
    { id: 'documents', label: 'Documents', icon: Upload },
    { id: 'suivi', label: 'Suivi', icon: AlertCircle },
  ]

  const urgenceMeta = URGENCE.find(u => u.id === state.urgence) || URGENCE[1]
  const UrgenceIcon = urgenceMeta.icon

  return (
    <div className="form-container" data-role={userRole}>
      <form onSubmit={handleSubmit}>
        {/* Barre d'urgence */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${urgenceMeta.bg}`}>
          <UrgenceIcon className={`w-4 h-4 ${urgenceMeta.color}`} />
          <span className={`text-xs font-semibold ${urgenceMeta.color}`}>
            Urgence {urgenceMeta.label}
          </span>
          {delai && (
            <span className={`ml-auto text-xs font-medium text-${delai.variant}`}>
              {delai.jours < 0 ? `Délai dépassé de ${Math.abs(delai.jours)}j` : `${delai.jours}j restants`}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs mb-6">
          {TABS.map(tab => {
            const TabIcon = tab.icon
            return (
              <button key={tab.id} type="button"
                className={`tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <TabIcon className="w-4 h-4 mr-2 inline" />{tab.label}
              </button>
            )
          })}
        </div>

        {/* ── INFORMATIONS ── */}
        <div className={activeTab === 'informations' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">
              Informations générales
            </p>

            <div className="form-field">
              <label className={labelClass}>Titre du dossier *</label>
              <input value={state.titre}
                onChange={e => setField('titre', e.target.value)}
                placeholder="Ex: Demande d'avis technique - GOBD"
                className={`form-input ${focusClass}${errors.titre ? ' border-danger' : ''}`}
              />
              {errors.titre && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.titre}</p>}
            </div>

            <div className="form-grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className={labelClass}>Catégorie</label>
                <select value={state.categorie}
                  onChange={e => setField('categorie', e.target.value)}
                  className={`form-select ${focusClass}`} style={selectStyle}
                >
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className={labelClass}>Urgence</label>
                <select value={state.urgence}
                  onChange={e => setField('urgence', e.target.value)}
                  className={`form-select ${focusClass}`} style={selectStyle}
                >
                  {URGENCE.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className={labelClass}>Aérodrome concerné</label>
                <select value={state.aerodrome_id}
                  onChange={e => setField('aerodrome_id', e.target.value)}
                  className={`form-select ${focusClass}`} style={selectStyle}
                >
                  <option value="">N/A - Dossier général</option>
                  {aerodromes?.map((a: Aerodrome) => (
                    <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className={labelClass}>
                  Service assigné *
                </label>
                <select value={state.service_assigne}
                  onChange={e => setField('service_assigne', e.target.value)}
                  className={`form-select ${focusClass}`} style={selectStyle}
                >
                  {SERVICES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="p-3 bg-role-primary-soft rounded-lg space-y-4">
              <p className="text-xs font-semibold text-role-primary uppercase tracking-wide">
                Demandeur (si avis technique)
              </p>
              <div className="form-grid grid-cols-3 gap-4">
                {[
                  { field: 'demandeur_nom' as const, label: 'Nom', placeholder: 'Nom du demandeur' },
                  { field: 'demandeur_organisation' as const, label: 'Organisation', placeholder: 'Organisation' },
                  { field: 'demandeur_contact' as const, label: 'Contact', placeholder: 'Email/Téléphone' },
                ].map(f => (
                  <div className="form-field" key={f.field}>
                    <label className={labelClass}>{f.label}</label>
                    <input value={state[f.field]}
                      onChange={e => setField(f.field, e.target.value)}
                      placeholder={f.placeholder}
                      className={`form-input ${focusClass}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label className={labelClass}>
                Inspecteur assigné *
              </label>
              <select value={state.inspecteur_id}
                onChange={e => setField('inspecteur_id', e.target.value)}
                className={`form-select ${focusClass}${errors.inspecteur_id ? ' border-danger' : ''}`}
                style={selectStyle}
              >
                <option value="">Sélectionner</option>
                {utilisateurs?.filter((u: Utilisateur) => ['inspector', 'admin'].includes(u.role)).map((u: Utilisateur) => (
                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                ))}
              </select>
              {errors.inspecteur_id && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.inspecteur_id}</p>}
            </div>

            <div className="form-field">
              <label className={labelClass}>Instructions particulières</label>
              <textarea value={state.instructions}
                onChange={e => setField('instructions', e.target.value)}
                placeholder="Directives de traitement, priorités..." rows={3}
                className={`form-textarea ${focusClass}`}
              />
              <p className="field-description">Précisez les instructions pour le traitement du dossier</p>
            </div>

            <div className="form-field">
              <label className={labelClass}>
                <Calendar className="w-4 h-4" />Date limite de traitement *
              </label>
              <input type="date" value={state.date_limite}
                onChange={e => setField('date_limite', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={`form-input ${focusClass}${errors.date_limite ? ' border-danger' : ''}`}
              />
              {errors.date_limite && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.date_limite}</p>}
              {getDelaiSuggere && !state.date_limite && (
                <p className="field-description text-info">💡 Délai suggéré: {getDelaiSuggere} jours</p>
              )}
            </div>
          </div>
        </div>

        {/* ── DOCUMENTS ── */}
        <div className={activeTab === 'documents' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">
              Documents du dossier
            </p>

            {state.existingFichiers.length > 0 && (
              <div className="space-y-2">
                <label className={labelClass}>Fichiers déjà joints</label>
                {state.existingFichiers.map((f: DossierFile, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-role-primary" />
                      <div>
                        <p className="font-medium text-sm">{f.nom}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(f.date_upload).toLocaleDateString('fr-FR')} • {Math.round(f.taille / 1024)} Ko
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => dispatch({ type: 'REMOVE_EXISTING_FICHIER', idx })}
                      className="btn btn-ghost btn-sm text-danger">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="form-field">
              <label className={labelClass}>Ajouter des fichiers</label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <input type="file" multiple onChange={handleFileUpload}
                  className="hidden" id="dossier-files"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                />
                <label htmlFor="dossier-files" className="cursor-pointer flex flex-col items-center gap-3">
                  <Upload className="w-10 h-10 text-muted-foreground" />
                  <span className="text-sm font-medium">Cliquez pour ajouter des fichiers</span>
                  <span className="text-xs text-muted-foreground">PDF, Word, Excel, images (max 10 Mo)</span>
                </label>
              </div>
            </div>

            {state.fichiers.length > 0 && (
              <div className="space-y-2">
                <label className={labelClass}>Nouveaux fichiers</label>
                {state.fichiers.map((file: File, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-role-primary" />
                      <div>
                        <p className="font-medium text-sm">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} Ko</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => dispatch({ type: 'REMOVE_FICHIER', idx })}
                      className="btn btn-ghost btn-sm text-danger">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── SUIVI ── */}
        <div className={activeTab === 'suivi' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-6">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">
              Suivi du dossier
            </p>

            {/* Barre de progression */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className={labelClass}>Progression</label>
                <span className="text-sm font-bold">{state.progression}%</span>
              </div>
              <div className="progress h-2">
                <div className="progress-bar" style={progressBarStyle} />
              </div>
              <div className="flex justify-between gap-2 mt-2">
                {PROGRESSION_STEPS.map(val => (
                  <button key={val} type="button"
                    onClick={() => handleProgressionChange(val)}
                    className={`flex-1 text-xs py-1.5 rounded font-medium transition-all ${
                      state.progression === val ? 'btn-primary shadow-md' : 'btn-secondary'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Preuves à 100% */}
            {state.progression === 100 && (
              <div className="p-4 rounded-lg border-2 border-success/30 bg-success/5 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <span className="text-sm font-semibold text-success">Dossier terminé — Preuves requises</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ajoutez les preuves de traitement (rapport d'évaluation, lettre de transmission, etc.)
                  pour finaliser et archiver automatiquement le dossier.
                </p>

                {state.existingPreuves.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Preuves déjà fournies</label>
                    {state.existingPreuves.map((f: DossierFile, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-success" />
                          <span className="text-sm">{f.nom}</span>
                        </div>
                        <button type="button" onClick={() => dispatch({ type: 'REMOVE_EXISTING_PREUVE', idx })}
                          className="btn btn-ghost btn-xs text-danger">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="form-field">
                  <label className="text-xs font-medium">Ajouter des preuves</label>
                  <input type="file" multiple onChange={handlePreuvesUpload}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-success file:text-white hover:file:bg-success/90 cursor-pointer"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  />
                </div>

                {state.preuves.map((f: File, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-success" />
                      <span className="text-sm">{f.name}</span>
                    </div>
                    <button type="button" onClick={() => dispatch({ type: 'REMEMBER_PREUVE', idx })}
                      className="btn btn-ghost btn-xs text-danger">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {errors.preuves && (
                  <p className="field-error text-xs"><AlertTriangle className="w-3 h-3 inline mr-1" />{errors.preuves}</p>
                )}
              </div>
            )}

            {/* Statut */}
            <div className="form-field">
              <label className={labelClass}>Statut</label>
              <select value={state.statut}
                onChange={e => setField('statut', e.target.value)}
                className={`form-select ${focusClass}`} style={selectStyle}
              >
                <option value="en_attente">En attente</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
                <option value="archive">Archivé</option>
              </select>
            </div>

            {/* Délai */}
            {delai && (
              <div className={`alert alert-${delai.variant} flex items-center gap-2`}>
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {delai.jours < 0
                      ? `Délai dépassé de ${Math.abs(delai.jours)} jour(s)`
                      : `Délai: ${delai.jours} jour(s) restant(s)`
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Échéance: {new Date(state.date_limite).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">
            <X className="w-4 h-4 mr-2 inline" />Annuler
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary min-w-[140px]">
            {isSubmitting
              ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
              : <><Save className="w-4 h-4 mr-2 inline" />{mode === 'creation' ? 'Créer le dossier' : 'Enregistrer'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
})
