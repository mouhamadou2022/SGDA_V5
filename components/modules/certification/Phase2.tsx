// components/modules/certification/Phase2.tsx
'use client'

import { useState, useMemo } from 'react'
import { Save, Lock, CheckCircle2, AlertCircle, Users, Calendar, FileText, AlertTriangle } from 'lucide-react'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

const DOCS_REQUIS = [
  { key: 'statuts_societe', label: "Statuts de la société exploitante", required: true },
  { key: 'manuel_exploitation', label: "Manuel d'exploitation aérodrome", required: true },
  { key: 'plan_masse', label: "Plan de masse de l'aérodrome", required: true },
  { key: 'rapport_obstacles', label: "Rapport d'inspection des obstacles", required: true },
  { key: 'plan_sslia', label: "Plan de sauvetage et lutte contre incendie", required: true },
  { key: 'evaluation_faunique', label: "Évaluation des risques fauniques", required: false },
  { key: 'procedures_sop', label: "Procédures opérationnelles standard", required: false },
  { key: 'registre_maintenance', label: "Registre de maintenance des équipements", required: false },
]

interface Phase2Props {
  certifId: string
  phaseData: any
  estActive: boolean
  onUpdate: (data: any) => void
}

export function Phase2({ certifId, phaseData, estActive, onUpdate }: Phase2Props) {
  const utilisateurs = useOptimizedStore(s => s.utilisateurs)
  const [form, setForm] = useState({
    numero_dossier: phaseData?.numero_dossier ?? '',
    date_reception: phaseData?.date_reception ?? '',
    responsable_id: phaseData?.responsable_id ?? '',
    documents: phaseData?.documents ?? {} as Record<string, boolean>,
    documents_urls: phaseData?.documents_urls ?? {} as Record<string, string>,
    avis: phaseData?.avis ?? '',
    details_reserves: phaseData?.details_reserves ?? '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const readOnly = !estActive

  const set = (key: string, val: any) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const toggleDoc = (docKey: string) => {
    if (readOnly) return
    setForm(f => ({
      ...f,
      documents: { ...f.documents, [docKey]: !f.documents[docKey] }
    }))
  }

  const completude = useMemo(() => {
    const requiredDocs = DOCS_REQUIS.filter(d => d.required).length
    const uploadedRequired = DOCS_REQUIS.filter(d => d.required && form.documents[d.key]).length
    return Math.round((uploadedRequired / requiredDocs) * 100)
  }, [form.documents])

  const isComplete = useMemo(() => {
    const requiredDocsFilled = DOCS_REQUIS.filter(d => d.required).every(d => form.documents[d.key])
    return form.numero_dossier && form.date_reception && form.responsable_id && form.avis && requiredDocsFilled
  }, [form])

  const inspecteurs = utilisateurs?.filter(u =>
    ['inspecteur', 'chef_inspecteur', 'admin'].includes(u.role)
  ) || []

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      onUpdate({ ...form, completude, cloture_le: new Date().toISOString() })
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = readOnly ? `form-input bg-muted/30 cursor-not-allowed ${focusClass}` : `form-input ${focusClass}`

  const phaseBadge = !readOnly && isComplete ? <span className="badge success pulse">Prêt à clôturer</span> :
    !readOnly && !isComplete ? <span className="badge warning">Informations manquantes</span> :
    <span className="badge neutral">Lecture seule</span>

  return (
    <div className="space-y-5 animate-fade-in">
      <Card
        icon={readOnly ? <Lock className="h-4 w-4 text-muted" /> : undefined}
        heading="Phase 2 — Instruction du dossier"
        badge={phaseBadge}
      >
        <div className="space-y-5">

          {/* Barre de progression */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Complétude du dossier</span>
              <span className={`font-semibold ${completude >= 80 ? 'text-success' : completude >= 50 ? 'text-warning' : 'text-muted'}`}>{completude}%</span>
            </div>
            <div className="progress h-1.5">
              <div className={`progress-bar ${completude >= 80 ? 'progress-moyen' : completude >= 50 ? 'progress-eleve' : 'progress-critique'}`} style={{ width: `${completude}%` }} />
            </div>
          </div>

          {/* Informations générales */}
          <div className="form-grid">
            <div className="form-field">
              <label className="filter-label"><Calendar className="h-3 w-3 mr-1 inline" />Date réception dossier *</label>
              <input type="date" value={form.date_reception} onChange={e => set('date_reception', e.target.value)} readOnly={readOnly} className={inputClass} />
            </div>
            <div className="form-field">
              <label className="filter-label"><FileText className="h-3 w-3 mr-1 inline" />N° dossier *</label>
              <input value={form.numero_dossier} onChange={e => set('numero_dossier', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="CERT-2024-XXX" />
            </div>
          </div>

          {/* Responsable instruction */}
          <div className="form-field">
            <label className="filter-label"><Users className="h-3 w-3 mr-1 inline" />Responsable instruction *</label>
            {readOnly ? (
              <input value={inspecteurs.find(u => u.id === form.responsable_id)?.nom || form.responsable_id} readOnly className={inputClass} />
            ) : (
              <select className={`form-select ${focusClass}`} style={selectStyle} value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)}>
                <option value="">Sélectionner un responsable</option>
                {inspecteurs.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            )}
          </div>

          {/* Checklist documents */}
          <div className="form-field">
            <label className="filter-label"><FileText className="h-3 w-3 mr-1 inline" />Documents requis *</label>
            <div className="space-y-2">
              {DOCS_REQUIS.map(doc => (
                <div key={doc.key} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${form.documents[doc.key] ? 'border-success/30 bg-success/5' : doc.required ? 'border-warning/30 bg-warning/5' : 'border-border bg-muted/10'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${form.documents[doc.key] ? 'bg-success/20' : doc.required ? 'bg-warning/20' : 'bg-muted/30'}`}>
                      {form.documents[doc.key] ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className={`h-4 w-4 ${doc.required ? 'text-warning' : 'text-muted'}`} />}
                    </div>
                    <div>
                      <p className="text-small text-foreground">{doc.label}{doc.required && <span className="text-danger ml-1">*</span>}</p>
                      {form.documents_urls[doc.key] && (
                        <button className="text-xs text-role-primary hover:underline mt-0.5" onClick={() => window.open(form.documents_urls[doc.key], '_blank')}>Voir le document</button>
                      )}
                    </div>
                  </div>
                  <label className="form-checkbox cursor-pointer">
                    <input type="checkbox" checked={!!form.documents[doc.key]} onChange={() => toggleDoc(doc.key)} disabled={readOnly} className="form-checkbox-input" />
                    <span className="text-small text-muted">Reçu</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Avis */}
          <div className="form-field">
            <label className="filter-label">Avis de l'instruction *</label>
            <div className="flex gap-4 flex-wrap">
              {[
                { value: 'favorable', label: 'Favorable', variant: 'success', icon: CheckCircle2 },
                { value: 'favorable_reserves', label: 'Favorable avec réserves', variant: 'warning', icon: AlertCircle },
                { value: 'defavorable', label: 'Défavorable', variant: 'danger', icon: AlertTriangle },
              ].map((option) => (
                <label key={option.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${form.avis === option.value ? `border-${option.variant}/50 bg-${option.variant}/5` : 'border-border hover:border-muted-foreground/30'} ${readOnly ? 'opacity-70 cursor-default' : ''}`}>
                  <input type="radio" name="avis" value={option.value} checked={form.avis === option.value} onChange={() => !readOnly && set('avis', option.value)} disabled={readOnly} className="form-radio-input" />
                  <option.icon className={`h-4 w-4 text-${option.variant}`} />
                  <span className={`text-small ${form.avis === option.value ? `text-${option.variant} font-semibold` : 'text-foreground'}`}>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {(form.avis === 'favorable_reserves' || form.avis === 'defavorable') && (
            <div className="form-field animate-fade-up">
              <label className="filter-label">{form.avis === 'favorable_reserves' ? 'Détail des réserves' : 'Motif du refus'} *</label>
              <textarea value={form.details_reserves} onChange={e => set('details_reserves', e.target.value)} readOnly={readOnly} className={`form-textarea min-h-24 ${focusClass}`} rows={4} placeholder={form.avis === 'favorable_reserves' ? "Préciser les réserves..." : "Expliquer les motifs du refus..."} />
            </div>
          )}

          {!readOnly && !isComplete && (
            <div className="alert alert-warning animate-fade-up">
              <AlertCircle className="alert-icon" />
              <div className="alert-content">Des informations obligatoires sont manquantes. Veuillez compléter tous les champs requis.</div>
            </div>
          )}

          {!readOnly && isComplete && (
            <div className="alert alert-success animate-fade-up">
              <CheckCircle2 className="alert-icon" />
              <div className="alert-content">Tous les champs obligatoires sont remplis. Vous pouvez clôturer cette phase.</div>
            </div>
          )}

          {estActive && (
            <button onClick={handleSubmit} disabled={!isComplete || isSubmitting} className={`btn btn-primary w-full gap-2 ${!isComplete ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isSubmitting ? <><div className="spinner-sm" />Enregistrement...</> : <><Save className="h-4 w-4" />Clôturer Phase 2</>}
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default Phase2
