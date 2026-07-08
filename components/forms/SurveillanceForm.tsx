// components/forms/SurveillanceForm.tsx
'use client'

import React, { useState, useEffect, useMemo, useRef, memo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, X, Calendar, Users, FileText, AlertCircle, TrendingUp, TrendingDown, Shield, Zap, Target } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { SPECIALITES_INSPECTEUR } from '@/lib/domaines'
import { SURVEILLANCE_TYPES, SURVEILLANCE_DOMAINS } from '@/lib/config'
import { getRiskLevel, suggestMissionType } from '@/lib/risque'
import { useFormProgress } from '@/hooks/useFormProgress'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

const surveillanceSchema = z.object({
  aerodrome_id: z.string().min(1, "L'aérodrome est requis"),
  type: z.enum([
    'programmee', 'inopinee', 'speciale', 'suivi_ecarts',
    'mise_oeuvre_pac', 'certification', 'homologation',
    'audit_complet', 'urgence', 'periodique', 'inopine', 'maintien'
  ]),
  portee: z.array(z.string()).min(1, 'Au moins un domaine doit être sélectionné'),
  equipe_ids: z.array(z.string()).min(1, 'Au moins un inspecteur doit être sélectionné'),
  chef_id: z.string().min(1, "Le chef d'équipe est requis"),
  date_debut: z.string().min(1, 'La date de début est requise'),
  date_fin: z.string().min(1, 'La date de fin est requise'),
  observations: z.string().optional(),
  objectifs: z.string().min(10, 'Les objectifs doivent faire au moins 10 caractères'),
})

// Seul un inspecteur titulaire ou principal peut être chef d'équipe
const TYPES_CHEF_AUTORISES = ['inspecteur_titulaire', 'inspecteur_principal']
function peutEtreChef(insp: any): boolean {
  if (!insp) return false
  const type = insp?.type_inspecteur || insp?._insp?.type
  return TYPES_CHEF_AUTORISES.includes(type)
}
function equipeContientChefEligible(membres: any[]): boolean {
  return membres.some(m => peutEtreChef(m))
}

type SurveillanceFormValues = z.infer<typeof surveillanceSchema>

interface SurveillanceFormProps {
  surveillance?: any | null
  onClose: () => void
  onSuccess: () => void
  userRole?: string
  onProgressChange?: (n: number) => void
}

// Obtenir le badge de risque
const getRiskBadgeClass = (score: number): string => {
  if (score >= 80) return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success'
  if (score >= 60) return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary'
  if (score >= 30) return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning'
  return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-danger animate-pulse'
}

const getRiskLabel = (score: number): string => {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Bon'
  if (score >= 30) return 'Modéré'
  return 'Critique'
}

// Récupérer les domaines prioritaires basés sur le profil
const getDomainesPrioritaires = (profil: any): string[] => {
  if (!profil) return []
  
  const domaines: string[] = []
  
  if (profil.c1 < 60) domaines.push('SGS')
  if (profil.c2 < 60) domaines.push('PAC')
  if (profil.c3 < 60) {
    domaines.push('PHY')
    domaines.push('OPS')
  }
  if (profil.c4 < 60) domaines.push('Écarts')
  if (profil.c5 < 60) domaines.push('SLI')
  
  return [...new Set(domaines)]
}

// Suggérer la priorité basée sur le profil
const getPrioriteSuggerer = (profil: any): 'basse' | 'moyenne' | 'haute' | 'critique' => {
  if (!profil) return 'moyenne'
  if (profil.score_global < 30) return 'critique'
  if (profil.score_global < 50) return 'haute'
  if (profil.score_global < 70) return 'moyenne'
  return 'basse'
}

// Générer les objectifs suggérés
const genererObjectifsSuggeres = (profil: any, domaines: string[]): string => {
  if (!profil) return ''
  
  const parties: string[] = []
  
  parties.push(`Dans le cadre du suivi du profil de risque (score ${profil.score_global}/100, tendance ${profil.tendance}),`)
  
  if (profil.score_global < 30) {
    parties.push(`cette surveillance a pour objectif de vérifier les mesures d'urgence suite au passage en zone critique.`)
  } else if (profil.tendance === 'baisse') {
    parties.push(`cette surveillance vise à analyser les causes de la dégradation et vérifier l'efficacité des actions correctives.`)
  } else {
    parties.push(`cette surveillance programmée vise à maintenir le niveau de conformité et identifier les axes d'amélioration.`)
  }
  
  if (domaines.includes('SGS')) {
    parties.push(`Vérifier la mise en œuvre du Système de Gestion de la Sécurité (SGS) et son efficacité.`)
  }
  if (domaines.includes('PAC')) {
    parties.push(`Évaluer les délais de traitement des Plans d'Actions Correctives et identifier les retards.`)
  }
  if (domaines.includes('PHY')) {
    parties.push(`Contrôler l'état des infrastructures physiques (pistes, balisage, aires de trafic).`)
  }
  if (domaines.includes('OPS')) {
    parties.push(`Vérifier le respect des procédures opérationnelles et la conformité réglementaire.`)
  }
  if (domaines.includes('SLI')) {
    parties.push(`Évaluer les capacités d'intervention du Service de Lutte contre l'Incendie.`)
  }
  if (domaines.includes('Écarts')) {
    parties.push(`Suivre l'avancement des écarts critiques et vérifier la clôture des actions.`)
  }
  
  return parties.join(' ')
}

export const SurveillanceForm = memo(function SurveillanceForm({
  surveillance, onClose, onSuccess, userRole = 'inspector', onProgressChange,
}: SurveillanceFormProps) {
  const user = useAppStore(s => s.user)
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const addSurveillance = useAppStore(s => s.addSurveillance)
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const getProfilRisque = useAppStore(s => s.getProfilRisque)
  const addNotification = useAppStore(s => s.addNotification)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [suggestedDomains, setSuggestedDomains] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)

  // Inspecteurs réels depuis le store
  const inspecteursReels = useMemo(() => {
    return utilisateurs
      .filter(u => u.role === 'inspector' && u.statut !== 'inactif')
      .map(u => {
        const linkedInsp = u.inspecteur_id
          ? inspecteurs.find(i => i.id === u.inspecteur_id)
          : inspecteurs.find(i => i.email === u.email || (i.prenom === u.prenom && i.nom === u.nom))
        return { ...u, _insp: linkedInsp }
      })
  }, [utilisateurs, inspecteurs])

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<SurveillanceFormValues>({
    resolver: zodResolver(surveillanceSchema),
    defaultValues: surveillance ? {
      aerodrome_id: surveillance.aerodrome_id,
      type: surveillance.type,
      portee: surveillance.portee,
      equipe_ids: surveillance.equipe_ids,
      chef_id: surveillance.chef_id,
      date_debut: surveillance.date_debut?.split('T')[0] || '',
      date_fin: surveillance.date_fin?.split('T')[0] || '',
      observations: surveillance.observations || '',
      objectifs: surveillance.objectifs || '',
    } : {
      aerodrome_id: '',
      type: 'programmee',
      portee: [],
      equipe_ids: [],
      chef_id: '',
      date_debut: new Date().toISOString().split('T')[0],
      date_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      observations: '',
      objectifs: '',
    },
  })

  const watchAerodrome = watch('aerodrome_id')
  const watchEquipe = watch('equipe_ids') || []
  const watchPortee = watch('portee') || []
  const watchChef = watch('chef_id')
  const watchType = watch('type')

  const profilAerodrome = watchAerodrome ? getProfilRisque(watchAerodrome) : null
  const aerodrome = watchAerodrome ? aerodromes.find(a => a.id === watchAerodrome) : null

   // Mettre à jour les suggestions quand l'aérodrome change
   useEffect(() => {
     if (profilAerodrome) {
       const domaines = getDomainesPrioritaires(profilAerodrome)
       setSuggestedDomains(domaines)
       
       // Suggérer le type de mission
       if (watchType === 'programmee' && profilAerodrome.score_global < 50) {
         if (profilAerodrome.score_global < 30) setValue('type', 'audit_complet')
         else if (profilAerodrome.c4 < 40) setValue('type', 'suivi_ecarts')
         else if (profilAerodrome.c2 < 50) setValue('type', 'mise_oeuvre_pac')
       }
       
       // Suggérer les domaines si non déjà sélectionnés
       if (domaines.length > 0 && watchPortee.length === 0) {
         setValue('portee', domaines.slice(0, 4))
       }
       
       // Suggérer les objectifs
       if (!watch('objectifs')) {
         setValue('objectifs', genererObjectifsSuggeres(profilAerodrome, domaines))
       }
     }
   }, [profilAerodrome, setValue, watchType, watchPortee.length])

// Vérifier que le chef est dans l'équipe
   useEffect(() => {
     if (watchChef && !watchEquipe.includes(watchChef)) {
       setValue('chef_id', '')
     }
   }, [watchEquipe, watchChef])

  const handleAppliquerSuggestions = () => {
    if (profilAerodrome) {
      const domaines = getDomainesPrioritaires(profilAerodrome)
      setValue('portee', domaines.slice(0, 4))
      setValue('objectifs', genererObjectifsSuggeres(profilAerodrome, domaines))
      
      if (profilAerodrome.score_global < 30) setValue('type', 'audit_complet')
      else if (profilAerodrome.c4 < 40) setValue('type', 'suivi_ecarts')
      else if (profilAerodrome.c2 < 50) setValue('type', 'mise_oeuvre_pac')
      
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Suggestions appliquées',
        message: 'Les domaines prioritaires et les objectifs ont été mis à jour selon le profil de risque',
        canal: 'in_app'
      })
    }
  }

  const onSubmit = async (data: SurveillanceFormValues) => {
    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()

      // Vérifier que le chef est titulaire/principal
      const chefUser = inspecteursReels.find(i => i.id === data.chef_id)
      if (!chefUser || !peutEtreChef(chefUser)) {
        addNotification({
          user_id: user?.id || '',
          type: 'danger',
          title: 'Chef non valide',
          message: 'Le chef d\'équipe doit être un inspecteur titulaire ou principal.',
          canal: 'in_app'
        })
        setIsSubmitting(false)
        return
      }
      // Vérifier que l'équipe contient au moins un titulaire/principal
      const equipe = inspecteursReels.filter(i => data.equipe_ids.includes(i.id))
      if (!equipeContientChefEligible(equipe)) {
        addNotification({
          user_id: user?.id || '',
          type: 'danger',
          title: 'Équipe non valide',
          message: 'L\'équipe doit contenir au moins un inspecteur titulaire ou principal.',
          canal: 'in_app'
        })
        setIsSubmitting(false)
        return
      }

      if (surveillance) {
        await updateSurveillance(surveillance.id, { 
          ...data, 
          updated_at: now, 
          updated_by: user?.id 
        })
        addNotification({
          user_id: user?.id || '',
          type: 'success',
          title: 'Surveillance modifiée',
          message: `La surveillance pour ${aerodrome?.code_oaci} a été modifiée`,
          canal: 'in_app'
        })
      } else {
        await addSurveillance({ 
          ...data, 
          statut: 'planifiee', 
          progression: 0, 
          created_by: user?.id, 
          updated_by: user?.id,
        })
        addNotification({
          user_id: user?.id || '',
          type: 'success',
          title: 'Surveillance créée',
          message: `La surveillance pour ${aerodrome?.code_oaci} a été créée`,
          canal: 'in_app'
        })
      }
      onSuccess()
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Une erreur est survenue lors de la sauvegarde',
        canal: 'in_app'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

   // Memoize risk calculations based on profilAerodrome.score_global
   const riskLevel = useMemo(() => {
     return profilAerodrome?.score_global ? getRiskLabel(profilAerodrome.score_global) : null
   }, [profilAerodrome?.score_global])

   const riskClass = useMemo(() => {
     return profilAerodrome?.score_global ? getRiskBadgeClass(profilAerodrome.score_global) : ''
   }, [profilAerodrome?.score_global])

   const suggestedObjectifs = useMemo(() => {
     return profilAerodrome ? genererObjectifsSuggeres(profilAerodrome, suggestedDomains) : ''
   }, [profilAerodrome, suggestedDomains])

   // Optimize progress calculation - only recompute when watched values actually change
   const allValues = useMemo(() => {
     return watch(['aerodrome_id', 'type', 'portee', 'equipe_ids', 'chef_id', 'objectifs']) as unknown as Record<string, unknown>
   }, [watch]) // Note: watch is a stable reference from useForm

   const progress = useMemo(() => {
     return useFormProgress(allValues as Record<string, unknown>, [
       'aerodrome_id', 'type', 'portee', 'equipe_ids', 'chef_id', 'objectifs',
     ])
   }, [allValues])

   const onProgressRef = useRef(onProgressChange)
   onProgressRef.current = onProgressChange
   // Only run when progress actually changes
   useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-container animate-fade-up" data-role={userRole} data-module="surveillance-form">
      {/* Banner suggestion si profil disponible */}
      {profilAerodrome && showSuggestions && (
        <div className="alert alert-info mb-6">
          <span className="alert-icon">💡</span>
          <div className="alert-content flex-1">
            <div className="alert-title">Suggestions basées sur le profil de risque</div>
            <div className="alert-description">
              {suggestedDomains.length > 0 && (
                <span>Domaines prioritaires suggérés: <strong>{suggestedDomains.join(', ')}</strong></span>
              )}
              {profilAerodrome.tendance === 'baisse' && (
                <span className="ml-2">⚠️ Tendance à la dégradation détectée</span>
              )}
            </div>
          </div>
          <button type="button" onClick={handleAppliquerSuggestions} className="btn btn-primary btn-sm">
            Appliquer les suggestions
          </button>
          <button type="button" onClick={() => setShowSuggestions(false)} className="btn btn-ghost btn-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

   {/* Aérodrome avec affichage du risque */}
   <div className="form-field">
     <label className={`${labelClass} flex items-center gap-2`}>
       <Shield className="w-4 h-4" />
       Aérodrome *
     </label>
     <select
       {...register('aerodrome_id')}
       className={`form-select ${focusClass}${errors.aerodrome_id ? ' border-danger' : ''}`}
       style={selectStyle}
     >
        <option value="">Sélectionner un aérodrome</option>
        {aerodromes.map(a => {
          const profil = getProfilRisque(a.id)
          const score = profil?.score_global || 0
          const niveau = getRiskLabel(score)
          return (
            <option key={a.id} value={a.id}>
              {a.code_oaci} — {a.nom} [{niveau} {score}/100]
            </option>
          )
        })}
     </select>
     {errors.aerodrome_id && <p className="field-error">{errors.aerodrome_id.message}</p>}
   </div>

      {/* Affichage profil risque si sélectionné */}
      {profilAerodrome && (
        <div className="p-3 bg-role-primary-soft rounded-lg">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Niveau de risque :</span>
              <span className={riskClass}>{riskLevel} ({profilAerodrome.score_global}/100)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tendance :</span>
              {profilAerodrome.tendance === 'hausse' && (
                <span className="flex items-center gap-1 text-success"><TrendingUp className="w-4 h-4" /> Hausse</span>
              )}
              {profilAerodrome.tendance === 'baisse' && (
                <span className="flex items-center gap-1 text-danger"><TrendingDown className="w-4 h-4 animate-pulse" /> Baisse</span>
              )}
              {profilAerodrome.tendance === 'stable' && (
                <span className="flex items-center gap-1 text-muted-foreground">Stable</span>
              )}
            </div>
          </div>
          {profilAerodrome.c4 < 40 && (
            <div className="mt-2 text-xs text-warning flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Charge critique élevée (C4={profilAerodrome.c4}/100) - priorité haute recommandée
            </div>
          )}
        </div>
      )}

       {/* Type et dates */}
       <div className="form-grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="form-field">
           <label className={`${labelClass} flex items-center gap-2`}>
             <Target className="w-4 h-4" />
             Type de surveillance *
           </label>
           <select
             {...register('type')}
             className={`form-select ${focusClass}${errors.type ? ' border-danger' : ''}`}
             style={selectStyle}
            >
              {(SURVEILLANCE_TYPES as unknown as string[]).map(type => (
                <option key={type} value={type}>
                  {type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </option>
              ))}
           </select>
           {watchType === 'audit_complet' && (
             <p className="text-xs text-info mt-1">🔍 Audit complet recommandé pour les situations critiques</p>
           )}
           {watchType === 'suivi_ecarts' && (
             <p className="text-xs text-info mt-1">📋 Suivi des écarts - priorité aux non-conformités ouvertes</p>
           )}
           {errors.type && <p className="field-error">{errors.type.message}</p>}
         </div>

        <div className="form-field">
          <label className={labelClass}>
            <Calendar className="w-4 h-4" />Date début *
          </label>
          <input
            type="date"
            {...register('date_debut')}
            className={`form-input ${focusClass}${errors.date_debut ? ' border-danger' : ''}`}
          />
          {errors.date_debut && <p className="field-error">{errors.date_debut.message}</p>}
        </div>

        <div className="form-field">
          <label className={labelClass}>
            <Calendar className="w-4 h-4" />Date fin *
          </label>
          <input
            type="date"
            {...register('date_fin')}
            className={`form-input ${focusClass}${errors.date_fin ? ' border-danger' : ''}`}
          />
          {errors.date_fin && <p className="field-error">{errors.date_fin.message}</p>}
        </div>
      </div>

       {/* Domaines concernés */}
       <div className="form-field">
         <label className={`${labelClass} flex items-center gap-2`}>
           <Target className="w-4 h-4" />
           Domaines concernés *
         </label>
          <div className="border border-border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
            {(SURVEILLANCE_DOMAINS as unknown as { code: string; label: string }[]).map(d => {
              const isSuggested = suggestedDomains.includes(d.code)
              return (
                <label key={d.code} className={`flex items-center gap-2 cursor-pointer text-sm p-1 rounded ${isSuggested ? 'bg-role-primary-soft' : ''}`}>
                   <input
                     type="checkbox"
                     checked={watchPortee.includes(d.code)}
                     onChange={(e) => {
                       const newPortee = e.target.checked
                         ? [...watchPortee, d.code]
                         : watchPortee.filter(p => p !== d.code)
                       setValue('portee', newPortee)
                     }}
                  className="form-checkbox"
                />
                <span className="flex-1">{d.label}</span>
                {isSuggested && <span className="text-xs text-role-primary font-semibold">⭐ Prioritaire</span>}
              </label>
              )
            })}
          </div>
         {suggestedDomains.length > 0 && (
           <p className="field-description text-info mt-2">
             ⭐ Domaines prioritaires suggérés: {suggestedDomains.join(', ')} (basés sur le profil de risque)
           </p>
         )}
         {errors.portee && <p className="field-error">{errors.portee.message}</p>}
       </div>

      {/* Équipe d'inspecteurs */}
      <div className="form-field">
        <label className={labelClass}>
          <Users className="w-4 h-4" />Équipe d'inspecteurs *
        </label>
        <div className="border border-border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
          {inspecteursReels.map(insp => (
            <label key={insp.id} className="flex items-center gap-2 cursor-pointer text-sm p-1 rounded hover:bg-role-primary-soft">
              <input
                type="checkbox"
                checked={watchEquipe.includes(insp.id)}
                onChange={(e) => {
                  const newEquipe = e.target.checked
                    ? [...watchEquipe, insp.id]
                    : watchEquipe.filter(id => id !== insp.id)
                  setValue('equipe_ids', newEquipe)
                  if (watchChef && !newEquipe.includes(watchChef)) {
                    setValue('chef_id', '')
                  }
                }}
                className="form-checkbox"
              />
              <span>{insp.prenom} {insp.nom}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-role-primary-soft text-role-primary text-xs font-mono font-semibold">
                {(insp.specialites || []).map((s: string) => SPECIALITES_INSPECTEUR.find(sp => sp.code === s)?.label || s).join(', ')
                || ((insp as any)._insp ? `${(insp as any)._insp.type?.replace(/_/g, ' ')} · ${(insp as any)._insp.domaine_principal?.toUpperCase()}` : undefined)
                || insp.service || 'Service général'}
              </span>
              {(insp as any).competences?.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  [{ (insp as any).competences.map((c: any) => c.domaine).join(', ') }]
                </span>
              )}
            </label>
          ))}
        </div>
        {errors.equipe_ids && <p className="field-error">{errors.equipe_ids.message}</p>}
      </div>

       {/* Chef d'équipe */}
       {watchEquipe.length > 0 && (
         <div className="form-field">
           <label className={labelClass}>
             <Users className="w-4 h-4" />Chef d'équipe *
           </label>
           <select
             {...register('chef_id')}
             className={`form-select ${focusClass}${errors.chef_id ? ' border-danger' : ''}`}
             style={selectStyle}
           >
               <option value="">Sélectionner le chef d'équipe</option>
               {watchEquipe
                 .filter(id => peutEtreChef(inspecteursReels.find(i => i.id === id)))
                 .map(id => {
                 const insp = inspecteursReels.find(i => i.id === id)
                 return insp ? (
                   <option key={id} value={id}>
                     {insp.prenom} {insp.nom} {(insp as any).competences?.some((c: any) => c.niveau === 5) ? '⭐ Expert' : ''}
                   </option>
                 ) : null
               })}
               {!equipeContientChefEligible(watchEquipe.map(id => inspecteursReels.find(i => i.id === id)).filter(Boolean)) && (
                 <option value="" disabled>Aucun inspecteur éligible (titulaire/principal requis)</option>
               )}
           </select>
           {errors.chef_id && <p className="field-error">{errors.chef_id.message}</p>}
         </div>
       )}

       {/* Objectifs */}
       <div className="form-field">
         <label className={`${labelClass} flex items-center gap-2`}>
           <FileText className="w-4 h-4" />
           Objectifs *
         </label>
         <textarea
           {...register('objectifs')}
           placeholder="Décrivez les objectifs de cette surveillance..."
           rows={4}
           className={`form-textarea ${focusClass}${errors.objectifs ? ' border-danger' : ''}`}
         />
          {profilAerodrome && (
            <div className="mt-2 p-2 bg-info-soft rounded-lg text-xs">
              <p className="font-semibold text-info">💡 Suggestion basée sur le profil de risque :</p>
              <p className="text-muted-foreground">{suggestedObjectifs}</p>
              <button
               type="button" 
               onClick={() => {
                 const suggested = genererObjectifsSuggeres(profilAerodrome, suggestedDomains);
                 setValue('objectifs', suggested);
               }}
               className="btn btn-ghost btn-sm text-xs mt-1"
             >
               Utiliser cette suggestion
             </button>
           </div>
         )}
         <p className="field-description">Minimum 10 caractères. Soyez précis sur les points à vérifier.</p>
         {errors.objectifs && <p className="field-error">{errors.objectifs.message}</p>}
       </div>

      {/* Observations */}
      <div className="form-field">
        <label className={labelClass}>
          <Zap className="w-4 h-4" />Observations générales
        </label>
        <textarea
          {...register('observations')}
          placeholder="Observations complémentaires, contraintes particulières..."
          rows={3}
          className={`form-textarea ${focusClass}`}
        />
      </div>

      {/* Récapitulatif équipe sélectionnée */}
      {watchEquipe.length > 0 && (
        <div className="card bg-role-primary-soft">
          <div className="card-content p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-role-primary" />
              <span className="text-sm font-medium">Équipe sélectionnée</span>
              <span className="text-xs text-muted-foreground">({watchEquipe.length} inspecteur(s))</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {watchEquipe.map(id => {
                const insp = inspecteursReels.find(i => i.id === id)
                return insp ? (
                  <span key={id} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${id === watchChef ? 'bg-primary' : 'bg-slate-400'}`}>
                    {insp.prenom} {insp.nom}{id === watchChef && ' (Chef)'}
                  </span>
                ) : null
              })}
            </div>
          </div>
        </div>
      )}

      {/* Récapitulatif des décisions automatiques */}
      {profilAerodrome && (
        <div className="p-3 bg-muted/20 rounded-lg text-[10px] text-muted-foreground border border-border">
          <p className="font-semibold mb-1">📊 Décisions automatiques basées sur le profil de risque :</p>
          <ul className="space-y-0.5">
            <li>• Score {profilAerodrome.score_global}/100 → {getRiskLabel(profilAerodrome.score_global)}</li>
            <li>• Tendance {profilAerodrome.tendance} → {profilAerodrome.tendance === 'baisse' ? 'Surveillance renforcée recommandée' : 'Maintien du rythme'}</li>
            {suggestedDomains.length > 0 && <li>• Domaines prioritaires : {suggestedDomains.join(', ')}</li>}
          </ul>
        </div>
      )}

      <hr className="border-border my-4" />

      <div className="form-actions">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary gap-2">
          <X className="h-4 w-4" />Annuler
        </button>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary gap-2">
          {isSubmitting
            ? <><div className="spinner spinner-sm mr-2 inline-block" />Enregistrement...</>
            : <><Save className="h-4 w-4 inline mr-1" />{surveillance ? 'Modifier' : 'Créer'}</>
          }
        </button>
      </div>
    </form>
  )
})