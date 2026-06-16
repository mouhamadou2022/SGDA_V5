'use client'

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  FolderOpen, FileText, Upload, X, Calendar,
  User, AlertCircle, Save, Clock, AlertTriangle, Plus, Trash2, CheckCircle2,
} from 'lucide-react'
import { useAppStore, type Aerodrome, type Utilisateur, type DossierAssignment } from '@/lib/store'
import { dossierUtils } from '@/lib/dossierUtils'

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

export const DossierForm = memo(function DossierForm({
  mode, dossierId, aerodromeId, onSuccess, onCancel, userRole
}: DossierFormProps) {
  const addDossier = useAppStore(s => s.addDossier)
  const updateDossier = useAppStore(s => s.updateDossier)
  const addAssignment = useAppStore(s => s.addAssignment)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user)

  const [titre, setTitre] = useState('')
  const [categorie, setCategorie] = useState('reglementaire')
  const [aerodromeIdState, setAerodromeIdState] = useState(aerodromeId || '')
  const [demandeurNom, setDemandeurNom] = useState('')
  const [demandeurOrg, setDemandeurOrg] = useState('')
  const [demandeurContact, setDemandeurContact] = useState('')
  const [serviceAssigne, setServiceAssigne] = useState('securite_aerodromes')
  const [instructions, setInstructions] = useState('')
  const [dateLimite, setDateLimite] = useState('')
  const [urgence, setUrgence] = useState('normale')
  const [fichiers, setFichiers] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Assignation multiple
  const [selectedInspecteurs, setSelectedInspecteurs] = useState<{ id: string; nom: string }[]>([])
  const [pendingInspecteurId, setPendingInspecteurId] = useState('')

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

  // Chargement en modification
  useEffect(() => {
    if (mode !== 'modification' || !dossierId) return
    const d = useAppStore.getState().dossiers?.find(d => d.id === dossierId)
    if (!d) return
    setTitre(d.titre || '')
    setCategorie(d.categorie || 'reglementaire')
    setAerodromeIdState(d.aerodrome_id || '')
    setDemandeurNom(d.demandeur?.nom || '')
    setDemandeurOrg(d.demandeur?.organisation || '')
    setDemandeurContact(d.demandeur?.contact || '')
    setServiceAssigne(d.service_assigne || 'securite_aerodromes')
    setInstructions(d.instructions || '')
    setDateLimite(d.date_limite?.split('T')[0] || '')
    setUrgence((d as any).urgence || 'normale')
    if (d.assignments?.length) {
      setSelectedInspecteurs(d.assignments.map((a: DossierAssignment) => ({ id: a.inspecteur_id, nom: a.inspecteur_nom })))
    }
  }, [mode, dossierId])

  const inspecteursDisponibles = utilisateurs?.filter((u: Utilisateur) =>
    ['inspector', 'admin'].includes(u.role) &&
    !selectedInspecteurs.some(s => s.id === u.id)
  ) || []
  const inspecteursDejaAssignes = utilisateurs?.filter((u: Utilisateur) =>
    selectedInspecteurs.some(s => s.id === u.id)
  ) || []

  const handleAjouterInspecteur = () => {
    if (!pendingInspecteurId) return
    const u = utilisateurs.find(u => u.id === pendingInspecteurId)
    if (!u) return
    setSelectedInspecteurs(prev => [...prev, { id: u.id, nom: `${u.prenom} ${u.nom}` }])
    setPendingInspecteurId('')
  }

  const handleRetirerInspecteur = (id: string) => {
    setSelectedInspecteurs(prev => prev.filter(s => s.id !== id))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const all = Array.from(e.target.files)
    const valid = all.filter(f => f.size <= 10 * 1024 * 1024)
    setFichiers(prev => [...prev, ...valid])
  }

  const handleRemoveFile = (idx: number) => {
    setFichiers(prev => prev.filter((_, i) => i !== idx))
  }

  const getDelaiSuggere = useMemo(() => {
    const base: Record<string, number> = {
      reglementaire: 30, technique: 45, operationnel: 30,
      surveillance: 60, formation: 90, financier: 45,
    }
    let d = base[categorie] || 45
    if (urgence === 'critique') d = Math.floor(d * 0.3)
    else if (urgence === 'haute') d = Math.floor(d * 0.5)
    else if (urgence === 'basse') d = Math.floor(d * 1.3)
    return d
  }, [categorie, urgence])

  useEffect(() => {
    if (mode === 'creation' && getDelaiSuggere && !dateLimite) {
      const date = new Date()
      date.setDate(date.getDate() + getDelaiSuggere)
      setDateLimite(date.toISOString().split('T')[0])
    }
  }, [mode, getDelaiSuggere]) // eslint-disable-line react-hooks/exhaustive-deps

  const validerFormulaire = (): boolean => {
    const e: Record<string, string> = {}
    if (!titre.trim()) e.titre = 'Le titre est requis'
    if (!dateLimite) e.dateLimite = 'La date limite est requise'
    if (selectedInspecteurs.length === 0) e.inspecteurs = 'Ajoutez au moins un inspecteur'
    if (dateLimite) {
      const d = new Date(dateLimite)
      const t = new Date(); t.setHours(0, 0, 0, 0)
      if (d < t) e.dateLimite = 'La date limite doit être future'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validerFormulaire()) return
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

      const newFichiers = await uploadFiles(fichiers)
      const urgenceMeta = URGENCE.find(u => u.id === urgence) || URGENCE[1]

      if (mode === 'creation') {
        const newId = crypto.randomUUID()
        const now = new Date().toISOString()

        addDossier({
          titre,
          reference: dossierUtils.genererReference(new Date().getFullYear(), Math.floor(Math.random() * 9999)),
          categorie: categorie as any,
          aerodrome_id: aerodromeIdState || undefined,
          demandeur: demandeurNom ? { nom: demandeurNom, organisation: demandeurOrg, contact: demandeurContact } : undefined,
          service_assigne: serviceAssigne as any,
          inspecteur_id: selectedInspecteurs[0]?.id,
          instructions,
          date_instruction: now,
          date_limite: dateLimite,
          fichiers: newFichiers,
          progression: 0,
          statut: 'en_attente',
          urgence,
          preuve_traitement: undefined,
          extensions: [],
          assignments: [],
          archived_at: null,
          created_by: user?.id || '',
          updated_at: now,
          created_at: now,
        } as any)

        // Créer les assignments pour chaque inspecteur sélectionné
        const store = useAppStore.getState()
        const newDossier = store.dossiers?.find(d => d.reference && d.created_by === user?.id)
        const dossierArr = store.dossiers || []
        const createdDossier = dossierArr[dossierArr.length - 1]
        if (createdDossier) {
          selectedInspecteurs.forEach(ins => {
            store.addAssignment(createdDossier.id, {
              inspecteur_id: ins.id,
              inspecteur_nom: ins.nom,
              statut: 'attribue',
              progression: 0,
            })
            store.addNotification({
              user_id: ins.id, type: 'info', title: 'Nouveau dossier assigné',
              message: `Dossier "${titre}" vous a été assigné (${createdDossier.reference})`,
              canal: 'in_app',
            })
          })
        }

        addNotification({
          user_id: user?.id || '', type: 'success', title: 'Dossier créé',
          message: `Dossier ${titre} créé avec ${selectedInspecteurs.length} assignation(s)`, canal: 'in_app',
        })
      } else if (dossierId) {
        updateDossier(dossierId, {
          titre,
          categorie: categorie as any,
          aerodrome_id: aerodromeIdState || undefined,
          demandeur: demandeurNom ? { nom: demandeurNom, organisation: demandeurOrg, contact: demandeurContact } : undefined,
          service_assigne: serviceAssigne as any,
          instructions,
          date_limite: dateLimite,
          fichiers: newFichiers,
          urgence,
        } as any)

        addNotification({
          user_id: user?.id || '', type: 'info', title: 'Dossier modifié',
          message: `Dossier ${titre} mis à jour`, canal: 'in_app',
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
  }

  const urgenceMeta = URGENCE.find(u => u.id === urgence) || URGENCE[1]
  const UrgenceIcon = urgenceMeta.icon

  return (
    <div className="form-container" data-role={userRole}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Barre d'urgence */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${urgenceMeta.bg}`}>
          <UrgenceIcon className={`w-4 h-4 ${urgenceMeta.color}`} />
          <span className={`text-xs font-semibold ${urgenceMeta.color}`}>
            Urgence {urgenceMeta.label}
          </span>
          {dateLimite && (
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {new Date(dateLimite).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>

        {/* Informations générales */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">
            Informations générales
          </p>

          <div className="form-field">
            <label className={labelClass}>Titre du dossier *</label>
            <input value={titre}
              onChange={e => setTitre(e.target.value)}
              placeholder="Ex: Demande d'avis technique - GOBD"
              className={`form-input ${focusClass}${errors.titre ? ' border-danger' : ''}`}
            />
            {errors.titre && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.titre}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-field">
              <label className={labelClass}>Catégorie</label>
              <select value={categorie}
                onChange={e => setCategorie(e.target.value)}
                className={`form-select ${focusClass}`} style={selectStyle}
              >
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className={labelClass}>Urgence</label>
              <select value={urgence}
                onChange={e => setUrgence(e.target.value)}
                className={`form-select ${focusClass}`} style={selectStyle}
              >
                {URGENCE.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-field">
              <label className={labelClass}>Aérodrome concerné</label>
              <select value={aerodromeIdState}
                onChange={e => setAerodromeIdState(e.target.value)}
                className={`form-select ${focusClass}`} style={selectStyle}
              >
                <option value="">N/A - Dossier général</option>
                {aerodromes?.map((a: Aerodrome) => (
                  <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className={labelClass}>Service assigné</label>
              <select value={serviceAssigne}
                onChange={e => setServiceAssigne(e.target.value)}
                className={`form-select ${focusClass}`} style={selectStyle}
              >
                {SERVICES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Demandeur (optionnel) */}
          <div className="p-3 bg-role-primary-soft rounded-lg space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide">
              Demandeur (si avis technique)
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="form-field">
                <label className={labelClass}>Nom</label>
                <input value={demandeurNom}
                  onChange={e => setDemandeurNom(e.target.value)}
                  placeholder="Nom du demandeur"
                  className={`form-input ${focusClass}`}
                />
              </div>
              <div className="form-field">
                <label className={labelClass}>Organisation</label>
                <input value={demandeurOrg}
                  onChange={e => setDemandeurOrg(e.target.value)}
                  placeholder="Organisation"
                  className={`form-input ${focusClass}`}
                />
              </div>
              <div className="form-field">
                <label className={labelClass}>Contact</label>
                <input value={demandeurContact}
                  onChange={e => setDemandeurContact(e.target.value)}
                  placeholder="Email/Téléphone"
                  className={`form-input ${focusClass}`}
                />
              </div>
            </div>
          </div>

          <div className="form-field">
            <label className={labelClass}>Instructions particulières</label>
            <textarea value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Directives de traitement, priorités..." rows={3}
              className={`form-textarea ${focusClass}`}
            />
          </div>

          <div className="form-field">
            <label className={labelClass}>
              <Calendar className="w-4 h-4 inline mr-1" />Date limite de traitement *
            </label>
            <input type="date" value={dateLimite}
              onChange={e => setDateLimite(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className={`form-input ${focusClass}${errors.dateLimite ? ' border-danger' : ''}`}
            />
            {errors.dateLimite && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.dateLimite}</p>}
            {getDelaiSuggere && !dateLimite && (
              <p className="field-description text-info">Délai suggéré: {getDelaiSuggere} jours</p>
            )}
          </div>
        </div>

        {/* Assignation des inspecteurs */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">
            <User className="w-3 h-3 inline mr-1" />Assignation des inspecteurs
          </p>

          {/* Sélecteur */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 form-field">
              <label className={labelClass}>Ajouter un inspecteur</label>
              <select value={pendingInspecteurId}
                onChange={e => setPendingInspecteurId(e.target.value)}
                className={`form-select ${focusClass}`} style={selectStyle}
              >
                <option value="">Sélectionner...</option>
                {inspecteursDisponibles.map((u: Utilisateur) => (
                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleAjouterInspecteur}
              disabled={!pendingInspecteurId}
              className="btn btn-primary btn-sm h-10 gap-1"
            >
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
          {errors.inspecteurs && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.inspecteurs}</p>}

          {/* Liste des assignés */}
          {selectedInspecteurs.length > 0 && (
            <div className="space-y-2">
              <label className={labelClass}>Inspecteurs assignés ({selectedInspecteurs.length})</label>
              {selectedInspecteurs.map(ins => (
                <div key={ins.id} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-role-primary text-white flex items-center justify-center text-xs font-bold">
                      {ins.nom.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{ins.nom}</p>
                      <p className="text-xs text-muted-foreground">En attente d&apos;accusé réception</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleRetirerInspecteur(ins.id)}
                    className="btn btn-ghost btn-sm text-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fichiers */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">
            <FileText className="w-3 h-3 inline mr-1" />Documents du dossier
          </p>

          <div className="form-field">
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

          {fichiers.length > 0 && (
            <div className="space-y-2">
              {fichiers.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-role-primary" />
                    <span className="font-medium text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} Ko)</span>
                  </div>
                  <button type="button" onClick={() => handleRemoveFile(idx)}
                    className="btn btn-ghost btn-sm text-danger">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-border">
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
