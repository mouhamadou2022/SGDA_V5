// components/forms/EcartForm.tsx
'use client'

import React, { useState, useEffect, useMemo, useRef, memo } from 'react'
import {
  AlertTriangle, FileText, Calendar, User, Tag,
  Save, AlertCircle, Flame, AlertOctagon, Info, DollarSign, X,
  Sparkles, TrendingUp, TrendingDown, Target
} from 'lucide-react'
import { useAppStore, Ecart } from '@/lib/store'
import type { PredictionResult } from '@/lib/checklistMemory'
import type { RiskIndex } from '@/lib/riskIndex'
import { plansActionsUtils } from '@/lib/plansActionsUtils'
import { DOMAINES_SURVEILLANCE } from '@/lib/domaines'
import { getRiskLevelBgColor, getRiskLevelColor } from '@/lib/risque'
import { useFormProgress } from '@/hooks/useFormProgress'
import { NiveauRisqueMatrix, CRITERES_NIVEAU_RISQUE } from '@/components/modules/plans-actions/NiveauRisqueMatrix'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}

const badgeVariants: Record<string, string> = {
  danger: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-danger",
  warning: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning",
  primary: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary",
  success: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success",
}
const monoBadge = "inline-flex items-center px-2 py-0.5 rounded-md bg-role-primary-soft text-role-primary text-xs font-mono font-semibold"
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

interface EcartFormProps {
  mode: 'creation' | 'modification'
  ecartId?: string
  surveillanceId?: string
  evenementId?: string
  aerodromeId: string
  onSuccess?: () => void
  onCancel?: () => void
  userRole: string
  userId: string
  onProgressChange?: (n: number) => void
}

const NIVEAUX_RISQUE = [
  { id: 'critique', label: 'Critique', icon: Flame, variant: 'danger', delais: { pac: 3, regularisation: 7 } },
  { id: 'eleve', label: 'Élevé', icon: AlertOctagon, variant: 'warning', delais: { pac: 7, regularisation: 30 } },
  { id: 'moyen', label: 'Moyen', icon: AlertCircle, variant: 'primary', delais: { pac: 15, regularisation: 90 } },
  { id: 'faible', label: 'Faible', icon: Info, variant: 'success', delais: { pac: 30, regularisation: 180 } },
]

const STATUTS_ECART = [
  { id: 'ouvert', label: 'Ouvert' },
  { id: 'pac_attendu', label: 'PAC attendu' },
  { id: 'pac_soumis', label: 'PAC soumis' },
  { id: 'pac_refuse', label: 'PAC refusé' },
  { id: 'pac_accepte', label: 'PAC accepté' },
  { id: 'preuves_soumises', label: 'Preuves soumises' },
  { id: 'preuves_evaluees', label: 'Preuves évaluées' },
  { id: 'en_retard', label: 'En retard' },
  { id: 'cloture', label: 'Clôturé' },
]

export const EcartForm = memo(function EcartForm({
  mode, ecartId, surveillanceId, evenementId, aerodromeId,
  onSuccess, onCancel, userRole, userId, onProgressChange
}: EcartFormProps) {
  const ecarts = useAppStore(s => s.ecarts)
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const user = useAppStore(s => s.user)
  const addEcart = useAppStore(s => s.addEcart)
  const updateEcart = useAppStore(s => s.updateEcart)
  const getPredictionForItem = useAppStore(s => s.getPredictionForItem)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const addNotification = useAppStore(s => s.addNotification)
  
  const aerodrome = aerodromes.find(a => a.id === aerodromeId)
  const profilAerodrome = profilsRisque?.[aerodromeId]

  const [formData, setFormData] = useState<Partial<Ecart>>({
    reference: '',
    ref_reglementaire: '',
    libelle: '',
    domaine: '',
    niveau_risque: 'moyen' as 'critique' | 'eleve' | 'moyen' | 'faible',
    statut: 'ouvert' as Ecart['statut'],
    delai_pac: '',
    delai_regularisation: '',
    inspecteur_ref_id: userId,
    cout_estime: 0,
  })

  const [activeTab, setActiveTab] = useState('informations')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [recurrencePrediction, setRecurrencePrediction] = useState<PredictionResult | null>(null)
  const [showAiInsight, setShowAiInsight] = useState(true)
  const [showRiskMatrix, setShowRiskMatrix] = useState(false)
  const [riskMatrixNotes, setRiskMatrixNotes] = useState<Record<string, number>>({})
  const [riskMatrixScore, setRiskMatrixScore] = useState(0)

   // Prédiction IA de récurrence
   useEffect(() => {
     if (mode === 'creation' && formData.ref_reglementaire && formData.libelle) {
       const prediction = getPredictionForItem?.(
         aerodromeId,
         'ecart',
         '',
         '',
         '',
         {
           id: 'temp',
           numero: formData.ref_reglementaire,
           point_verification: formData.libelle
         },
         profilAerodrome
       )
       setRecurrencePrediction(prediction)
     }
   }, [mode, aerodromeId, formData.ref_reglementaire, formData.libelle, profilAerodrome])

  // Calcul de l'indice de risque (1A, 2B, etc.)
  const [riskIndex, setRiskIndex] = useState<RiskIndex | null>(null)
  
  useEffect(() => {
    if (profilAerodrome && formData.domaine) {
      // Importer computeRiskIndex dynamiquement
      import('@/lib/riskIndex').then(module => {
        const { computeRiskIndex } = module
        const index = computeRiskIndex(profilAerodrome, {
          nbEcartsCritiques: formData.niveau_risque === 'critique' ? 1 : 0,
          nbEcartsEleves: formData.niveau_risque === 'eleve' ? 1 : 0,
          nbNS: 0,
          nbNV: 0,
        })
        setRiskIndex(index)
        
        // Suggérer automatiquement le niveau de risque basé sur l'indice
        if (index && mode === 'creation') {
          const niveauMap: Record<string, string> = {
            'critique': 'critique',
            'eleve': 'eleve',
            'moyen': 'moyen',
            'faible': 'faible',
          }
          const suggestedNiveau = niveauMap[index.niveau] || 'moyen'
          setFormData((prev: any) => ({ ...prev, niveau_risque: suggestedNiveau as any }))
        }
      })
    }
  }, [profilAerodrome, formData.domaine, mode])

  const handleRiskMatrixChange = (niveau: 'critique' | 'eleve' | 'moyen' | 'faible', score: number, notes: Record<string, number>) => {
    setRiskMatrixNotes(notes);
    setRiskMatrixScore(score);
    setFormData((prev: any) => ({ ...prev, niveau_risque: niveau }));
  };

  useEffect(() => {
    if (mode === 'modification' && ecartId) {
      const e = ecarts?.find(e => e.id === ecartId)
      if (e) {
        setFormData({
          reference: e.reference || '',
          ref_reglementaire: e.ref_reglementaire || '',
          libelle: e.libelle || '',
          domaine: e.domaine || '',
          niveau_risque: e.niveau_risque || 'moyen',
          statut: e.statut || 'ouvert',
          delai_pac: e.delai_pac?.split('T')[0] || '',
          delai_regularisation: e.delai_regularisation?.split('T')[0] || '',
          inspecteur_ref_id: e.inspecteur_ref_id || userId,
          cout_estime: e.cout_estime || 0,
        })
      }
    } else if (mode === 'creation') {
      const niveau = NIVEAUX_RISQUE.find(n => n.id === formData.niveau_risque)
      const today = new Date()
      const pac = new Date(today)
      pac.setDate(today.getDate() + (niveau?.delais.pac || 15))
      const reg = new Date(today)
      reg.setDate(today.getDate() + (niveau?.delais.regularisation || 90))
      setFormData((prev: any) => ({
        ...prev,
        delai_pac: pac.toISOString().split('T')[0],
        delai_regularisation: reg.toISOString().split('T')[0],
      }))
    }
  }, [mode, ecartId, ecarts, userId, formData.niveau_risque])

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.ref_reglementaire?.trim()) newErrors.ref_reglementaire = "La référence réglementaire est requise"
    if (!formData.libelle?.trim()) newErrors.libelle = "Le libellé de l'écart est requis"
    if ((formData.libelle?.trim().length ?? 0) < 10) newErrors.libelle = "Le libellé doit contenir au moins 10 caractères"
    if (!formData.domaine) newErrors.domaine = "Le domaine est requis"
    if (!formData.delai_pac) newErrors.delai_pac = "Le délai PAC est requis"
    if (!formData.delai_regularisation) newErrors.delai_regularisation = "Le délai de régularisation est requis"
    if (formData.delai_pac && formData.delai_regularisation) {
      if (new Date(formData.delai_pac) > new Date(formData.delai_regularisation))
        newErrors.delai_pac = "Le délai PAC doit être antérieur au délai de régularisation"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const progress = useFormProgress(formData as Record<string, unknown>, [
    'ref_reglementaire', 'libelle', 'domaine', 'delai_pac', 'delai_regularisation',
  ])

  const onProgressRef = useRef(onProgressChange)
  onProgressRef.current = onProgressChange
  useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  const currentNiveau = NIVEAUX_RISQUE.find(n => n.id === formData.niveau_risque)
  const NiveauIcon = currentNiveau?.icon

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validerFormulaire()) { setActiveTab('informations'); return }
    setIsSubmitting(true)
    try {
      const reference = formData.reference || plansActionsUtils.genererReference(new Date().getFullYear(), (ecarts?.length || 0) + 1)
      const data = {
        aerodrome_id: aerodromeId,
        surveillance_id: surveillanceId,
        evenement_id: evenementId,
        reference,
        ref_reglementaire: formData.ref_reglementaire,
        libelle: formData.libelle,
        domaine: formData.domaine,
        niveau_risque: formData.niveau_risque,
        statut: formData.statut,
        delai_pac: formData.delai_pac,
        delai_regularisation: formData.delai_regularisation,
        inspecteur_ref_id: formData.inspecteur_ref_id,
        cout_estime: formData.cout_estime || undefined,
      }
      if (mode === 'creation') {
        await addEcart(data as any)
        addNotification({
          user_id: userId,
          type: 'warning',
          title: 'Nouvel écart créé',
          message: `Écart ${reference} - ${formData.libelle?.substring(0, 50)}`,
          canal: 'in_app'
        })
      } else {
        await updateEcart(ecartId!, data as any)
        addNotification({
          user_id: userId,
          type: 'info',
          title: 'Écart modifié',
          message: `Écart ${formData.reference} mis à jour`,
          canal: 'in_app'
        })
      }
      onSuccess?.()
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'écart:", error)
      addNotification({
        user_id: userId,
        type: 'danger',
        title: 'Erreur',
        message: "Une erreur est survenue lors de la sauvegarde",
        canal: 'in_app'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="form-container animate-fade-up" data-role={userRole}>
      <form onSubmit={handleSubmit}>
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-role-primary/5 to-transparent rounded-lg border-l-4 border-l-role-primary">
          <div className="p-2 bg-role-gradient rounded-lg">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">
              {mode === 'creation' ? 'Nouvel écart' : "Modifier l'écart"}
            </h2>
            <p className="text-sm text-muted-foreground">{aerodrome?.code_oaci} - {aerodrome?.nom}</p>
          </div>
          {currentNiveau && NiveauIcon && (
            <span className={badgeVariants[currentNiveau.variant]}>
              <NiveauIcon className="w-3.5 h-3.5 mr-1" />
              <span className="capitalize">{currentNiveau.label}</span>
            </span>
          )}
        </div>

        {/* Insight IA - Prédiction de récurrence et Indice de risque */}
        {showAiInsight && recurrencePrediction && recurrencePrediction.prediction === 'NS' && (
          <div className="alert alert-warning mb-6 animate-fade-in">
            <Sparkles className="alert-icon w-4 h-4" />
            <div className="alert-content flex-1">
              <div className="alert-title">🤖 Prédiction IA</div>
              <div className="alert-description">
                Cet écart présente un risque de récurrence élevé ({recurrencePrediction.confiance}% de confiance).
                {recurrencePrediction.justification && ` ${recurrencePrediction.justification}`}
              </div>
            </div>
            <button type="button" onClick={() => setShowAiInsight(false)} className="btn btn-ghost btn-sm">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Indice de risque (1A, 2B, etc.) */}
        {riskIndex && (
          <div className="alert alert-info mb-6 animate-fade-up">
            <AlertTriangle className="alert-icon" />
            <div className="alert-content flex-1">
              <div className="alert-title">📊 Indice de Risque OACI</div>
              <div className="alert-description">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold">{riskIndex.cellule}</span>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getRiskLevelBgColor(riskIndex.niveau)}`}>
                    {riskIndex.niveau.toUpperCase()}
                  </span>
                  <span className="text-sm">Score: {riskIndex.score}/100</span>
                  <span className="text-sm">Confiance: {riskIndex.confidence}%</span>
                </div>
                {riskIndex.tendance === 'baisse' && (
                  <p className="text-xs mt-1 text-danger">⚠️ Tendance à la baisse détectée</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bouton Matrice d'évaluation */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowRiskMatrix(!showRiskMatrix)}
            className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
              showRiskMatrix
                ? 'border-role-primary bg-role-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-5 h-5 ${showRiskMatrix ? 'text-role-primary' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className="text-sm font-semibold">Matrice d'évaluation du niveau de risque</p>
                <p className="text-[10px] text-muted-foreground">5 critères objectifs pour déterminer le niveau de risque</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {riskMatrixScore > 0 && (
                <span className={`text-sm font-bold ${getRiskLevelColor(formData.niveau_risque || '')}`}>
                  {riskMatrixScore}/20 — {formData.niveau_risque?.toUpperCase()}
                </span>
              )}
              <svg className={`w-4 h-4 transition-transform ${showRiskMatrix ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
        </div>

        {/* Matrice d'évaluation */}
        {showRiskMatrix && (
          <div className="mb-6 animate-fade-in">
            <NiveauRisqueMatrix
              onNiveauChange={handleRiskMatrixChange}
              initialNotes={Object.keys(riskMatrixNotes).length > 0 ? riskMatrixNotes : undefined}
              userRole={userRole}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="tabs mb-6">
          {[
            { id: 'informations', label: 'Informations', icon: FileText },
            { id: 'delais', label: 'Délais & coûts', icon: Calendar },
            { id: 'evaluation', label: 'Évaluation risque', icon: AlertTriangle },
          ].map(tab => {
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

        {/* Onglet Informations */}
        <div className={activeTab === 'informations' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Détails de l'écart</p>
              {mode === 'modification' && (
                <div className="form-field">
                  <label htmlFor="reference" className={labelClass}><Tag className="w-4 h-4" />Référence</label>
                  <input id="reference" value={formData.reference} disabled
                    className="form-input bg-role-primary-soft opacity-70"
                  />
                  <p className="field-description">La référence est générée automatiquement</p>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="ref_reglementaire" className={labelClass}>
                  <Tag className="w-4 h-4" />
                  Référence réglementaire <span className="text-danger">*</span>
                </label>
                <input id="ref_reglementaire" value={formData.ref_reglementaire}
                  onChange={e => setFormData({ ...formData, ref_reglementaire: e.target.value })}
                  placeholder="Ex: RAS 14 - Section 9.2"
                  className={`form-input ${focusClass}${errors.ref_reglementaire ? ' border-danger' : ''}`}
                />
                {errors.ref_reglementaire && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.ref_reglementaire}</p>}
                <p className="field-description">Référence à la réglementation (RAS 14, etc.)</p>
              </div>

              <div className="form-field">
                <label htmlFor="domaine" className={labelClass}>
                  <Target className="w-4 h-4" />
                  Domaine <span className="text-danger">*</span>
                </label>
                <select 
                  id="domaine"
                  value={formData.domaine}
                  onChange={e => setFormData({ ...formData, domaine: e.target.value })}
                  className={`form-select ${focusClass}`}
                  style={selectStyle}
                >
                  <option value="">Sélectionner un domaine</option>
                  {DOMAINES_SURVEILLANCE.map(d => (
                    <option key={d.code} value={d.code}>{d.label}</option>
                  ))}
                </select>
                {errors.domaine && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.domaine}</p>}
                <p className="field-description">Domaine technique concerné par l'écart</p>
              </div>

              <div className="form-field">
                <label htmlFor="libelle" className={labelClass}>
                  <FileText className="w-4 h-4" />
                  Libellé de la constatation <span className="text-danger">*</span>
                </label>
                <textarea id="libelle" value={formData.libelle}
                  onChange={e => setFormData({ ...formData, libelle: e.target.value })}
                  placeholder="Décrivez l'écart observé..."
                  rows={4}
                  className={`form-textarea ${focusClass}${errors.libelle ? ' border-danger' : ''}`}
                />
                {errors.libelle && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.libelle}</p>}
                <p className="field-description">Minimum 10 caractères. Soyez précis et factuel.</p>
              </div>

              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label htmlFor="niveau_risque" className={labelClass}>
                    <AlertTriangle className="w-4 h-4" />Niveau de risque <span className="text-danger">*</span>
                  </label>
                  <select id="niveau_risque" value={formData.niveau_risque}
                    onChange={e => setFormData({ ...formData, niveau_risque: e.target.value as any })}
                    className={`form-select ${focusClass}`} style={selectStyle}
                  >
                    {NIVEAUX_RISQUE.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="statut" className={labelClass}>
                    <Tag className="w-4 h-4" />Statut
                  </label>
                  <select id="statut" value={formData.statut}
                    onChange={e => setFormData({ ...formData, statut: e.target.value as Ecart['statut'] })}
                    className={`form-select ${focusClass}`} style={selectStyle}
                  >
                    {STATUTS_ECART.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="inspecteur" className={labelClass}>
                  <User className="w-4 h-4" />Inspecteur référent
                </label>
                <select id="inspecteur" value={formData.inspecteur_ref_id}
                  onChange={e => setFormData({ ...formData, inspecteur_ref_id: e.target.value })}
                  className={`form-select ${focusClass}`} style={selectStyle}
                >
                  {utilisateurs?.filter(u => ['inspector', 'admin'].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                  ))}
                </select>
              </div>

              {/* Score de risque C4 */}
              {profilAerodrome && profilAerodrome.c4 < 50 && (
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-warning" />
                    <span>⚠️ Charge critique élevée (C4={profilAerodrome.c4}/100) - Traitement prioritaire recommandé</span>
                  </div>
                </div>
              )}

              {(surveillanceId || evenementId) && (
                <div className={`p-3 rounded-lg ${surveillanceId ? 'bg-role-primary-soft' : 'bg-warning/10'}`}>
                  <div className="flex items-center gap-2 text-sm">
                    {surveillanceId
                      ? <><AlertCircle className="w-4 h-4 text-role-primary" /><span>Écart lié à la surveillance</span></>
                      : <><AlertTriangle className="w-4 h-4 text-warning" /><span>Écart lié à l'événement de sécurité</span></>
                    }
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Onglet Délais & coûts */}
        <div className={activeTab === 'delais' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Délais et coûts</p>
              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label htmlFor="delai_pac" className={labelClass}>
                    <Calendar className="w-4 h-4" />Délai PAC <span className="text-danger">*</span>
                  </label>
                  <input id="delai_pac" type="date" value={formData.delai_pac}
                    onChange={e => setFormData({ ...formData, delai_pac: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className={`form-input ${focusClass}${errors.delai_pac ? ' border-danger' : ''}`}
                  />
                  {errors.delai_pac && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.delai_pac}</p>}
                  <p className="field-description">Date limite de soumission du PAC</p>
                </div>
                <div className="form-field">
                  <label htmlFor="delai_regularisation" className={labelClass}>
                    <Calendar className="w-4 h-4" />Délai régularisation <span className="text-danger">*</span>
                  </label>
                  <input id="delai_regularisation" type="date" value={formData.delai_regularisation}
                    onChange={e => setFormData({ ...formData, delai_regularisation: e.target.value })}
                    min={formData.delai_pac}
                    className={`form-input ${focusClass}${errors.delai_regularisation ? ' border-danger' : ''}`}
                  />
                  {errors.delai_regularisation && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />{errors.delai_regularisation}</p>}
                  <p className="field-description">Date limite de régularisation complète</p>
                </div>
              </div>

              <div className="p-3 bg-role-primary-soft rounded-lg space-y-4">
                <h4 className="text-sm font-medium mb-2">Délais recommandés par niveau de risque</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {NIVEAUX_RISQUE.map(niveau => (
                    <div key={niveau.id}>
                      <p className={`${niveau.id === formData.niveau_risque ? 'font-bold text-role-primary' : 'text-muted-foreground'}`}>
                        {niveau.label}:
                      </p>
                      <p className={monoBadge}>PAC: {niveau.delais.pac}j • Régul: {niveau.delais.regularisation}j</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="cout_estime" className={labelClass}>
                  <DollarSign className="w-4 h-4" />Coût estimé (FCFA)
                </label>
                <input id="cout_estime" type="number" min="0" value={formData.cout_estime}
                  onChange={e => setFormData({ ...formData, cout_estime: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  className={`form-input ${focusClass}`}
                />
                <p className="field-description">Estimation du coût de régularisation (optionnel)</p>
              </div>

              {formData.delai_pac && formData.delai_regularisation && (
                <div className="p-4 bg-role-primary-soft rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Récapitulatif des délais</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PAC à soumettre avant:</span>
                      <span className={monoBadge}>{new Date(formData.delai_pac).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Régularisation avant:</span>
                      <span className={monoBadge}>{new Date(formData.delai_regularisation).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Délai total:</span>
                      <span className={monoBadge}>
                        {Math.ceil((new Date(formData.delai_regularisation).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} jours restants
                      </span>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Onglet Évaluation risque */}
        <div className={activeTab === 'evaluation' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <NiveauRisqueMatrix
            onNiveauChange={handleRiskMatrixChange}
            initialNotes={Object.keys(riskMatrixNotes).length > 0 ? riskMatrixNotes : undefined}
            userRole={userRole}
          />

          {riskMatrixScore > 0 && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <h4 className="text-sm font-semibold">Récapitulatif de l'évaluation</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(riskMatrixNotes).map(([key, value]) => {
                  const critere = CRITERES_NIVEAU_RISQUE.find(c => c.id === key);
                  if (!critere) return null;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">{critere.label}</span>
                      <span className={`font-bold ${
                        value >= 4 ? 'text-danger' : value >= 3 ? 'text-warning' : value >= 2 ? 'text-primary' : 'text-success'
                      }`}>
                        {value}/4
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="font-semibold">Score total</span>
                <span className={`text-lg font-bold ${getRiskLevelColor(formData.niveau_risque || '')}`}>
                  {riskMatrixScore}/20 — {formData.niveau_risque?.toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">
            <X className="w-4 h-4 mr-2 inline" />Annuler
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary min-w-[140px]">
            {isSubmitting
              ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
              : <><Save className="w-4 h-4 mr-2 inline" />{mode === 'creation' ? "Créer l'écart" : 'Enregistrer'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
})