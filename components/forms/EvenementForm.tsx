// components/forms/EvenementForm.tsx
'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  AlertTriangle, FileText, Calendar, Clock, MapPin,
  Plane, Users, Save, X, Upload, AlertCircle,
  Flame, AlertOctagon, Info, Sparkles, TrendingUp, TrendingDown, Wand2,
  CheckCircle2
} from 'lucide-react'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import { TYPES_EVENEMENT } from '@/lib/config'
import { evenementUtils } from '@/lib/evenementUtils'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent'
import { useFormProgress } from '@/hooks/useFormProgress'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const monoBadge = "inline-flex items-center px-2 py-0.5 rounded-md bg-role-primary-soft text-role-primary text-xs font-mono font-semibold"
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

const GRAVITE_BADGES: Record<string, string> = {
  CRITIQUE: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-danger animate-pulse',
  ORANGE:   'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning',
  JAUNE:    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning',
  GRIS:     'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-slate-400',
  BLEU:     'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary',
}

const GRAVITE_WEIGHTS = {
  CRITIQUE: { valeur: 5, delaiNotification: 24, niveau: 'critique' },
  ORANGE: { valeur: 4, delaiNotification: 48, niveau: 'eleve' },
  JAUNE: { valeur: 3, delaiNotification: 72, niveau: 'moyen' },
  GRIS: { valeur: 2, delaiNotification: 96, niveau: 'faible' },
  BLEU: { valeur: 1, delaiNotification: 120, niveau: 'faible' },
}

interface EvenementFormProps {
  mode: 'declaration' | 'modification' | 'instruction'
  evenementId?: string
  aerodromeId: string
  onSuccess?: () => void
  onCancel?: () => void
  userRole: string
  userId: string
  onProgressChange?: (n: number) => void
}

const SERVICES_URGENCE = ['Pompiers', 'Gendarmerie', 'SAMU', 'ANACIM', 'BEA', 'Météo', 'Aéroport']

export function EvenementForm({
  mode, evenementId, aerodromeId, onSuccess, onCancel, userRole, userId, onProgressChange
}: EvenementFormProps) {
  const evenements = useAppStore(s => s.evenements);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const addEvenement = useAppStore(s => s.addEvenement);
  const updateEvenement = useAppStore(s => s.updateEvenement);
  const addNotification = useAppStore(s => s.addNotification);
  const getProfilRisque = useAppStore(s => s.getProfilRisque);
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const aerodrome = aerodromes.find(a => a.id === aerodromeId)
  const profilAerodrome = getProfilRisque(aerodromeId)

  const [formData, setFormData] = useState({
    type: TYPES_EVENEMENT[0] as string,
    date: new Date().toISOString().split('T')[0],
    heure: new Date().toTimeString().slice(0, 5),
    localisation: '',
    description: '',
    actions_immediates: '',
    services_alertes: [] as string[],
    aeronef_immatriculation: '',
    aeronef_type: '',
    aeronef_exploitant: '',
    blesses_mortels: 0,
    blesses_graves: 0,
    blesses_legers: 0,
    blesses_indemnes: 0,
    dommages_desc: '',
    statut: 'recu' as string,
    inspecteur_id: '',
    rapport_final: null as File | null,
  })

  const [gravite, setGravite] = useState<EvenementSecurite['gravite']>('BLEU')
  const [activeTab, setActiveTab] = useState('informations')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [iaAnalysis, setIaAnalysis] = useState<RiskAnalysisResult | null>(null)
  const [isLoadingIA, setIsLoadingIA] = useState(false)
  const [showIaInsight, setShowIaInsight] = useState(true)
  const [iaSuggestion, setIaSuggestion] = useState<{
    type: string
    gravite: EvenementSecurite['gravite']
    classification: EvenementSecurite['classification']
    actions_immediates: string
    services_alertes: string[]
  } | null>(null)
  const [iaSuggestLoading, setIaSuggestLoading] = useState(false)
  const [showIaSuggestion, setShowIaSuggestion] = useState(true)

  // Charger l'analyse IA du profil de risque
  useEffect(() => {
    const loadIaAnalysis = async () => {
      if (profilAerodrome && mode === 'declaration') {
        setIsLoadingIA(true)
        try {
          const analysis = await riskAgent.analyzeRisk({
            aerodromeId: aerodromeId,
            includeSuggestions: true,
            includePredictions: false,
            includeBlackSwan: false
          }, {})
          setIaAnalysis(analysis)
        } catch (error) {
          console.error('Erreur chargement IA:', error)
        } finally {
          setIsLoadingIA(false)
        }
      }
    }
    loadIaAnalysis()
  }, [profilAerodrome, aerodromeId, mode])

  useEffect(() => {
    if ((mode === 'modification' || mode === 'instruction') && evenementId) {
      const ev = evenements?.find(e => e.id === evenementId)
      if (ev) {
        setFormData({
          type: ev.type || TYPES_EVENEMENT[0],
          date: ev.date?.split('T')[0] || new Date().toISOString().split('T')[0],
          heure: ev.heure || new Date().toTimeString().slice(0, 5),
          localisation: ev.localisation || '',
          description: ev.description || '',
          actions_immediates: ev.actions_immediates || '',
          services_alertes: ev.services_alertes || [],
          aeronef_immatriculation: ev.aeronef?.immatriculation || '',
          aeronef_type: ev.aeronef?.type || '',
          aeronef_exploitant: ev.aeronef?.exploitant || '',
          blesses_mortels: ev.blesses?.mortels || 0,
          blesses_graves: ev.blesses?.graves || 0,
          blesses_legers: ev.blesses?.legers || 0,
          blesses_indemnes: ev.blesses?.indemnes || 0,
          dommages_desc: ev.dommages_desc || '',
          statut: ev.statut || 'recu',
          inspecteur_id: ev.inspecteur_id || '',
          rapport_final: null,
        })
        setGravite(ev.gravite || 'BLEU')
      }
    }
  }, [mode, evenementId, evenements])

  useEffect(() => {
    setGravite(evenementUtils.determinerGravite(formData.type))
  }, [formData.type])

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.localisation.trim()) newErrors.localisation = "La localisation est requise"
    if (!formData.description.trim()) newErrors.description = "La description est requise"
    if (formData.description.trim().length < 20) newErrors.description = "La description doit contenir au moins 20 caractères"
    if (!formData.actions_immediates.trim()) newErrors.actions_immediates = "Les actions immédiates sont requises"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const getGraviteIcon = () => {
    switch (gravite) {
      case 'CRITIQUE': return <Flame className="w-5 h-5 text-danger" />
      case 'ORANGE':   return <AlertOctagon className="w-5 h-5 text-warning" />
      case 'JAUNE':    return <AlertCircle className="w-5 h-5 text-warning" />
      case 'GRIS':     return <Info className="w-5 h-5 text-muted-foreground" />
      default:         return <Info className="w-5 h-5 text-role-primary" />
    }
  }

  const getGraviteBadgeCls = (): string => GRAVITE_BADGES[gravite] || GRAVITE_BADGES.GRIS

  const toggleService = (service: string) => {
    setFormData(prev => ({
      ...prev,
      services_alertes: prev.services_alertes.includes(service)
        ? prev.services_alertes.filter(s => s !== service)
        : [...prev.services_alertes, service],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validerFormulaire()) { setActiveTab('informations'); return }
    setIsSubmitting(true)
    try {
      const baseData = {
        aerodrome_id: aerodromeId,
        type: formData.type as EvenementSecurite['type'],
        gravite,
        date: formData.date,
        heure: formData.heure,
        localisation: formData.localisation,
        description: formData.description,
        actions_immediates: formData.actions_immediates,
        services_alertes: formData.services_alertes,
        aeronef: formData.aeronef_immatriculation ? {
          immatriculation: formData.aeronef_immatriculation,
          type: formData.aeronef_type,
          exploitant: formData.aeronef_exploitant,
        } : undefined,
        blesses: {
          mortels: formData.blesses_mortels,
          graves: formData.blesses_graves,
          legers: formData.blesses_legers,
          indemnes: formData.blesses_indemnes,
        },
        dommages_desc: formData.dommages_desc,
        statut: (mode === 'instruction' ? formData.statut : 'recu') as EvenementSecurite['statut'],
        inspecteur_id: formData.inspecteur_id || undefined,
        created_by: userId,
      }
      if (mode === 'declaration') {
        const data: Omit<EvenementSecurite, 'id' | 'created_at' | 'updated_at'> = {
          ...baseData,
          reference: `EVT-${new Date().getFullYear()}-${String((evenements?.length || 0) + 1).padStart(3, '0')}`,
        }
        await addEvenement(data)
        addNotification({
          user_id: userId,
          type: gravite === 'CRITIQUE' ? 'danger' : 'warning',
          title: 'Événement déclaré',
          message: `${gravite} - ${formData.type} à ${aerodrome?.code_oaci}`,
          canal: 'in_app'
        })
      } else {
        const data: Partial<EvenementSecurite> = {
          ...baseData,
          updated_at: new Date().toISOString(),
        }
        await updateEvenement(evenementId!, data)
        addNotification({
          user_id: userId,
          type: 'info',
          title: 'Événement mis à jour',
          message: `Événement ${formData.type} modifié`,
          canal: 'in_app'
        })
      }
      onSuccess?.()
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      addNotification({
        user_id: userId,
        type: 'danger',
        title: 'Erreur',
        message: 'Une erreur est survenue lors de la sauvegarde',
        canal: 'in_app'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const progress = useFormProgress(formData as Record<string, unknown>, [
    'localisation', 'description', 'actions_immediates',
  ])

  const onProgressRef = useRef(onProgressChange)
  onProgressRef.current = onProgressChange
  useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  const getImpactRisqueMessage = () => {
    if (!profilAerodrome) return null
    if (gravite === 'CRITIQUE') {
      return "⚠️ Événement critique - Impact majeur sur le score de risque (C5) et déclenchement automatique d'une surveillance inopinée"
    }
    if (gravite === 'ORANGE') {
      return "⚠️ Événement grave - Risque de dégradation du score de résilience (C5)"
    }
    if (profilAerodrome.c5 < 50) {
      return "⚠️ C5 (Résilience) déjà faible - Cet événement pourrait aggraver la situation"
    }
    return null
  }

  const handleIaSuggestion = async () => {
    if (formData.description.trim().length < 20) return
    setIaSuggestLoading(true)
    setIaSuggestion(null)
    try {
      const res = await fetch('/api/ai/evenement-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: formData.description,
          localisation: formData.localisation,
          aerodrome_code: aerodrome?.code_oaci || aerodromeId,
        }),
      })
      const data = await res.json()
      if (data?.suggestion) {
        setIaSuggestion(data.suggestion)
        setShowIaSuggestion(true)
      }
    } catch (err) {
      console.error('Erreur suggestion IA:', err)
    } finally {
      setIaSuggestLoading(false)
    }
  }

  const appliquerSuggestionIA = () => {
    if (!iaSuggestion) return
    setFormData(prev => ({
      ...prev,
      type: iaSuggestion.type,
      actions_immediates: iaSuggestion.actions_immediates,
      services_alertes: iaSuggestion.services_alertes,
    }))
    setGravite(iaSuggestion.gravite)
    setShowIaSuggestion(false)
  }

  const TABS = mode === 'instruction'
    ? [{ id: 'informations', label: 'Informations', icon: AlertTriangle },
       { id: 'details', label: 'Détails', icon: Plane },
       { id: 'instruction', label: 'Instruction', icon: FileText }]
    : [{ id: 'informations', label: 'Informations', icon: AlertTriangle },
       { id: 'details', label: 'Détails', icon: Plane }]

  const graviteConfig = GRAVITE_WEIGHTS[gravite as keyof typeof GRAVITE_WEIGHTS]

  return (
    <div className="form-container animate-fade-up" data-role={userRole} data-module="evenement-form">
      <form onSubmit={handleSubmit}>
        {/* Insight IA - Profil de risque */}
        {showIaInsight && profilAerodrome && mode === 'declaration' && (
          <div className={`alert ${profilAerodrome.c5 < 50 ? 'alert-warning' : 'alert-info'} mb-6 animate-fade-in`}>
            <Sparkles className="alert-icon w-4 h-4" />
            <div className="alert-content flex-1">
              <div className="alert-title">🤖 Analyse IA du profil de risque</div>
              <div className="alert-description">
                Score actuel: {profilAerodrome.score_global}/100 • Résilience (C5): {profilAerodrome.c5}/100
                {profilAerodrome.c5 < 50 && (
                  <span className="block text-warning mt-1">
                    ⚠️ La résilience de l'aérodrome est faible - Cet événement aura un impact significatif
                  </span>
                )}
                {iaAnalysis?.suggestions?.[0] && (
                  <span className="block text-info mt-1">
                    Suggestion: {iaAnalysis.suggestions[0].description.substring(0, 100)}...
                  </span>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setShowIaInsight(false)} className="btn btn-ghost btn-sm">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {isLoadingIA && (
          <div className="text-center py-2 mb-4">
            <div className="spinner spinner-sm inline-block mr-2" />
            <span className="text-xs text-muted-foreground">Analyse IA du contexte...</span>
          </div>
        )}

        {/* Tabs natifs */}
        <div className="tabs mb-6">
          {TABS.map(tab => {
            const TabIcon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                className={`tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <TabIcon className="w-4 h-4 mr-2 inline" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Onglet Informations */}
        <div className={activeTab === 'informations' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Informations générales</p>
              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label htmlFor="type" className={labelClass}>
                    Type d'événement <span className="text-danger">*</span>
                  </label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    disabled={mode === 'instruction'}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {TYPES_EVENEMENT.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="date" className={labelClass}>
                    <Calendar className="w-4 h-4" />Date <span className="text-danger">*</span>
                  </label>
                  <input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    max={new Date().toISOString().split('T')[0]}
                    disabled={mode === 'instruction'}
                    className={`form-input ${focusClass}`}
                  />
                </div>
              </div>

              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label htmlFor="heure" className={labelClass}>
                    <Clock className="w-4 h-4" />Heure <span className="text-danger">*</span>
                  </label>
                  <input
                    id="heure"
                    type="time"
                    value={formData.heure}
                    onChange={e => setFormData({ ...formData, heure: e.target.value })}
                    disabled={mode === 'instruction'}
                    className={`form-input ${focusClass}`}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="localisation" className={labelClass}>
                    <MapPin className="w-4 h-4" />Localisation <span className="text-danger">*</span>
                  </label>
                  <input
                    id="localisation"
                    value={formData.localisation}
                    onChange={e => setFormData({ ...formData, localisation: e.target.value })}
                    placeholder="Piste, parking, zone technique..."
                    disabled={mode === 'instruction'}
                    className={`form-input ${focusClass}${errors.localisation ? ' border-danger' : ''}`}
                  />
                  {errors.localisation && (
                    <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.localisation}</p>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="description" className={labelClass}>
                  Description détaillée <span className="text-danger">*</span>
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez l'événement de manière précise..."
                  rows={4}
                  disabled={mode === 'instruction'}
                  className={`form-textarea ${focusClass}${errors.description ? ' border-danger' : ''}`}
                />
                {errors.description && (
                  <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.description}</p>
                )}
                <div className="flex items-center justify-between mt-1">
                  <p className="field-description">Minimum 20 caractères. Incluez les faits objectifs.</p>
                  {formData.description.trim().length >= 20 && mode === 'declaration' && (
                    <button
                      type="button"
                      onClick={handleIaSuggestion}
                      disabled={iaSuggestLoading}
                      className="btn btn-sm btn-ghost gap-1.5 text-xs"
                    >
                      {iaSuggestLoading ? (
                        <><div className="spinner spinner-xs inline-block mr-1" />Analyse...</>
                      ) : (
                        <><Wand2 className="w-3.5 h-3.5" />Suggestion IA</>
                      )}
                    </button>
                  )}
                </div>
                {showIaSuggestion && iaSuggestion && (
                  <div className="mt-3 p-3 rounded-xl border border-role-primary/30 bg-gradient-to-r from-role-primary/5 to-transparent animate-fade-in">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <p className="text-xs font-semibold text-role-primary uppercase tracking-wide flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />Suggestion IA — validez avant application
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div><span className="text-muted-foreground">Type :</span> <span className="font-medium">{iaSuggestion.type}</span></div>
                          <div><span className="text-muted-foreground">Gravité :</span> <span className={`font-medium ${iaSuggestion.gravite === 'CRITIQUE' ? 'text-danger' : iaSuggestion.gravite === 'ORANGE' ? 'text-warning' : ''}`}>{iaSuggestion.gravite}</span></div>
                          <div><span className="text-muted-foreground">Classification :</span> <span className="font-medium capitalize">{iaSuggestion.classification === 'incident_grave' ? 'incident grave' : iaSuggestion.classification}</span></div>
                          <div><span className="text-muted-foreground">Services :</span> <span className="font-medium">{iaSuggestion.services_alertes.join(', ') || '—'}</span></div>
                        </div>
                        {iaSuggestion.actions_immediates && (
                          <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Actions :</span> {iaSuggestion.actions_immediates}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button type="button" onClick={appliquerSuggestionIA} className="btn btn-sm btn-primary text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" />Appliquer
                        </button>
                        <button type="button" onClick={() => setShowIaSuggestion(false)} className="btn btn-sm btn-ghost text-xs">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="actions_immediates" className={labelClass}>
                  Actions immédiates <span className="text-danger">*</span>
                </label>
                <textarea
                  id="actions_immediates"
                  value={formData.actions_immediates}
                  onChange={e => setFormData({ ...formData, actions_immediates: e.target.value })}
                  placeholder="Actions prises immédiatement après l'événement..."
                  rows={3}
                  disabled={mode === 'instruction'}
                  className={`form-textarea ${focusClass}${errors.actions_immediates ? ' border-danger' : ''}`}
                />
                {errors.actions_immediates && (
                  <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.actions_immediates}</p>
                )}
              </div>

              <div className="form-field">
                <label className={labelClass}>Services alertés</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 border border-border rounded-lg">
                  {SERVICES_URGENCE.map(service => (
                    <label key={service} className="form-checkbox cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.services_alertes.includes(service)}
                        onChange={() => toggleService(service)}
                        disabled={mode === 'instruction'}
                      />
                      <span className="text-sm">{service}</span>
                    </label>
                  ))}
                </div>
              </div>
          </div>
        </div>

        {/* Onglet Détails */}
        <div className={activeTab === 'details' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Aéronef impliqué</p>
            <div className="form-grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: 'aeronef_immatriculation', label: 'Immatriculation', placeholder: 'F-XXXX', key: 'aeronef_immatriculation' },
                { id: 'aeronef_type', label: 'Type', placeholder: 'Boeing 737', key: 'aeronef_type' },
                { id: 'aeronef_exploitant', label: 'Exploitant', placeholder: 'Air Sénégal', key: 'aeronef_exploitant' },
              ].map(f => (
                <div className="form-field" key={f.id}>
                  <label htmlFor={f.id} className={labelClass}>{f.label}</label>
                  <input
                    id={f.id}
                    value={(formData as any)[f.key]}
                    onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    disabled={mode === 'instruction'}
                    className={`form-input ${focusClass}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4" />
              Blessés
            </p>
            <div className="form-grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Mortels', key: 'blesses_mortels' },
                { label: 'Graves', key: 'blesses_graves' },
                { label: 'Légers', key: 'blesses_legers' },
                { label: 'Indemnes', key: 'blesses_indemnes' },
              ].map(f => (
                <div className="form-field" key={f.key}>
                  <label className={labelClass}>{f.label}</label>
                  <input
                    type="number"
                    min="0"
                    value={(formData as any)[f.key]}
                    onChange={e => setFormData({ ...formData, [f.key]: parseInt(e.target.value) || 0 })}
                    disabled={mode === 'instruction'}
                    className={`form-input ${focusClass}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Dégâts matériels</p>
            <div className="form-field">
              <textarea
                value={formData.dommages_desc}
                onChange={e => setFormData({ ...formData, dommages_desc: e.target.value })}
                placeholder="Description des dégâts matériels..."
                rows={3}
                disabled={mode === 'instruction'}
                className={`form-textarea ${focusClass}`}
              />
            </div>
          </div>
        </div>

        {/* Onglet Instruction */}
        {mode === 'instruction' && (
          <div className={activeTab === 'instruction' ? 'space-y-4 animate-fade-in' : 'hidden'}>
            <div className="space-y-4">
              <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Instruction de l'événement</p>
                <div className="form-field">
                  <label htmlFor="statut" className={labelClass}>Statut</label>
                  <select
                    id="statut"
                    value={formData.statut}
                    onChange={e => setFormData({ ...formData, statut: e.target.value })}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    <option value="recu">Reçu</option>
                    <option value="en_cours">En cours</option>
                    <option value="analyse">Analyse</option>
                    <option value="ecart_cree">Écart créé</option>
                    <option value="rapport_redige">Rapport rédigé</option>
                    <option value="cloture">Clôturé</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="inspecteur_id" className={labelClass}>Inspecteur assigné</label>
                  <select
                    id="inspecteur_id"
                    value={formData.inspecteur_id}
                    onChange={e => setFormData({ ...formData, inspecteur_id: e.target.value })}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    <option value="">Assigner un inspecteur</option>
                    {utilisateurs?.filter(u => ['inspector', 'admin'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="rapport_final" className={labelClass}>Rapport final</label>
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <input
                      type="file"
                      onChange={e => { if (e.target.files?.[0]) setFormData({ ...formData, rapport_final: e.target.files[0] }) }}
                      className="hidden"
                      id="rapport_final"
                      accept=".pdf"
                    />
                    <label htmlFor="rapport_final" className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {formData.rapport_final ? formData.rapport_final.name : 'Ajouter le rapport final (PDF)'}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="p-4 bg-role-primary-soft rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Actions rapides</h4>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary">
                      <AlertCircle className="w-4 h-4 mr-2 inline" />
                      Créer un écart lié
                    </button>
                    <button type="button" className="btn btn-secondary">
                      <FileText className="w-4 h-4 mr-2 inline" />
                      Générer rapport préliminaire
                    </button>
                  </div>
                </div>
            </div>
          </div>
        )}

        {/* Impact sur le profil de risque */}
        {getImpactRisqueMessage() && (
          <div className={`p-3 rounded-lg mt-4 ${gravite === 'CRITIQUE' ? 'bg-danger/10 border border-danger/30' : 'bg-warning/10 border border-warning/30'}`}>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className={`w-4 h-4 ${gravite === 'CRITIQUE' ? 'text-danger' : 'text-warning'}`} />
              <span className={gravite === 'CRITIQUE' ? 'text-danger' : 'text-warning'}>{getImpactRisqueMessage()}</span>
            </div>
            {graviteConfig && (
              <p className="text-xs text-muted-foreground mt-2">
                Notification requise dans les {graviteConfig.delaiNotification}h • Niveau {graviteConfig.niveau}
              </p>
            )}
          </div>
        )}

        {/* Alerte critique */}
        {gravite === 'CRITIQUE' && (
          <div className="alert alert-error mt-4 flex items-center gap-2">
            <Flame className="w-4 h-4 animate-pulse flex-shrink-0" />
            <span>Événement critique - Notification requise dans les 24h</span>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn btn-secondary"
          >
            <X className="w-4 h-4 mr-2 inline" />
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary min-w-[140px]"
          >
            {isSubmitting ? (
              <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
            ) : (
              <><Save className="w-4 h-4 mr-2 inline" />{mode === 'declaration' ? "Déclarer l'événement" : 'Enregistrer'}</>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}