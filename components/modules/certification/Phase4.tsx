// components/modules/certification/Phase4.tsx
'use client'

import { useState, useEffect } from 'react'
import { Save, Lock, CheckCircle2, AlertCircle, Calendar, FileText, User, Award, Clock, Eye, Upload, Trash2 } from 'lucide-react'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

interface Phase4Props {
  certifId: string
  phaseData: any
  estActive: boolean
  onUpdate: (data: any) => void
}

export function Phase4({ certifId, phaseData, estActive, onUpdate }: Phase4Props) {
  const utilisateurs = useOptimizedStore(s => s.utilisateurs)
  const [form, setForm] = useState({
    numero_certificat: phaseData?.numero_certificat ?? '',
    date_delivrance: phaseData?.date_delivrance ?? '',
    date_expiration: phaseData?.date_expiration ?? '',
    conditions_exploitation: phaseData?.conditions_exploitation ?? '',
    limitations: phaseData?.limitations ?? '',
    signataire_id: phaseData?.signataire_id ?? '',
    certificat_url: phaseData?.certificat_url ?? '',
    certificat_name: phaseData?.certificat_name ?? '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const readOnly = !estActive

  const set = (key: string, val: string) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  useEffect(() => {
    if (!form.date_delivrance || readOnly) return
    const d = new Date(form.date_delivrance)
    d.setFullYear(d.getFullYear() + 5)
    const expirationDate = d.toISOString().slice(0, 10)
    if (expirationDate !== form.date_expiration) {
      setForm(f => ({ ...f, date_expiration: expirationDate }))
    }
  }, [form.date_delivrance, readOnly])

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    const url = URL.createObjectURL(file)
    setForm(f => ({ ...f, certificat_url: url, certificat_name: file.name }))
    setUploading(false)
  }

  const handleRemoveFile = () => {
    setForm(f => ({ ...f, certificat_url: '', certificat_name: '' }))
  }

  const signataires = utilisateurs?.filter(u => ['admin', 'dg'].includes(u.role)) || []
  const isComplete = form.numero_certificat && form.date_delivrance && form.date_expiration && form.signataire_id && form.certificat_url

  const inputClass = readOnly ? `form-input bg-muted/30 cursor-not-allowed ${focusClass}` : `form-input ${focusClass}`

  const getDaysRemaining = () => {
    if (!form.date_expiration) return null
    return Math.ceil((new Date(form.date_expiration).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  }

  const daysRemaining = getDaysRemaining()

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      onUpdate({ ...form, cloture_le: new Date().toISOString() })
    } finally {
      setIsSubmitting(false)
    }
  }

  const completudeScore = Object.values({
    numero: !!form.numero_certificat,
    dates: !!(form.date_delivrance && form.date_expiration),
    signature: !!form.signataire_id,
    fichier: !!form.certificat_url,
  }).filter(Boolean).length

  const phaseBadge = !readOnly && isComplete ? <span className="badge success pulse">Prêt à clôturer</span> :
    !readOnly && !isComplete ? <span className="badge warning">Informations manquantes</span> :
    <span className="badge neutral">Lecture seule</span>

  return (
    <div className="space-y-5 animate-fade-in">
      <Card
        icon={readOnly ? <Lock className="h-4 w-4 text-muted" /> : undefined}
        heading="Phase 4 — Délivrance du certificat"
        badge={phaseBadge}
      >
        <div className="space-y-5">

          {/* Barre de progression */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Complétude du certificat</span>
              <span className="text-foreground">{completudeScore}/4</span>
            </div>
            <div className="progress h-1.5">
              <div className="progress-bar" style={{ width: `${completudeScore * 25}%` }} />
            </div>
          </div>

          {/* Alerte expiration */}
          {daysRemaining !== null && daysRemaining >= 0 && (
            <div className={`alert ${daysRemaining < 30 ? 'alert-error' : daysRemaining < 90 ? 'alert-warning' : 'alert-info'}`}>
              {daysRemaining < 30 ? <AlertCircle className="alert-icon" /> : daysRemaining < 90 ? <Clock className="alert-icon" /> : <Award className="alert-icon" />}
              <div className="alert-content">
                {daysRemaining < 30 ? (
                  <span className="font-semibold text-danger">Expiration critique dans {daysRemaining} jour{daysRemaining !== 1 ? 's' : ''} !</span>
                ) : daysRemaining < 90 ? (
                  <span className="text-warning">Expiration dans {daysRemaining} jours. Préparez le renouvellement.</span>
                ) : (
                  <span className="text-muted">Validité jusqu'au {new Date(form.date_expiration).toLocaleDateString('fr-FR')}</span>
                )}
              </div>
            </div>
          )}

          {/* Numéro certificat */}
          <div className="form-field">
            <label className="filter-label"><Award className="h-3 w-3 mr-1 inline" />N° certificat *</label>
            <input value={form.numero_certificat} onChange={e => set('numero_certificat', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="ANACIM/CERT/OACI/2025/001" />
            <p className="field-description">Format: ANACIM/CERT/OACI/AAAA/NNN</p>
          </div>

          {/* Dates */}
          <div className="form-grid">
            <div className="form-field">
              <label className="filter-label"><Calendar className="h-3 w-3 mr-1 inline" />Date de délivrance *</label>
              <input type="date" value={form.date_delivrance} onChange={e => set('date_delivrance', e.target.value)} readOnly={readOnly} className={inputClass} />
            </div>
            <div className="form-field">
              <label className="filter-label"><Clock className="h-3 w-3 mr-1 inline" />Date d'expiration *</label>
              <input type="date" value={form.date_expiration} onChange={e => set('date_expiration', e.target.value)} readOnly={readOnly} className={inputClass} />
              <p className="field-description">Généralement 5 ans après la délivrance (auto-calculé)</p>
            </div>
          </div>

          {/* Signataire */}
          <div className="form-field">
            <label className="filter-label"><User className="h-3 w-3 mr-1 inline" />Signataire *</label>
            {readOnly ? (
              <input value={signataires.find(u => u.id === form.signataire_id)?.nom || form.signataire_id} readOnly className={inputClass} />
            ) : (
              <select className={`form-select ${focusClass}`} style={selectStyle} value={form.signataire_id} onChange={e => set('signataire_id', e.target.value)}>
                <option value="">Sélectionner le signataire</option>
                {signataires.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom} ({u.role === 'admin' ? 'Administrateur' : 'DG ANACIM'})</option>)}
              </select>
            )}
          </div>

          {/* Conditions exploitation */}
          <div className="form-field">
            <label className="filter-label">Conditions d'exploitation</label>
            <textarea value={form.conditions_exploitation} onChange={e => set('conditions_exploitation', e.target.value)} readOnly={readOnly} className={`form-textarea min-h-20 ${focusClass}`} rows={3} placeholder="Conditions particulières d'exploitation..." />
          </div>

          {/* Limitations opérationnelles */}
          <div className="form-field">
            <label className="filter-label">Limitations opérationnelles</label>
            <textarea value={form.limitations} onChange={e => set('limitations', e.target.value)} readOnly={readOnly} className={`form-textarea min-h-20 ${focusClass}`} rows={3} placeholder="Limitations opérationnelles..." />
          </div>

          {/* Certificat PDF */}
          <div className="form-field">
            <label className="filter-label"><FileText className="h-3 w-3 mr-1 inline" />Certificat signé (PDF) *</label>
            <div className={`p-4 rounded-xl border-2 border-dashed transition-all ${form.certificat_url ? 'border-success/50 bg-success/5' : 'border-border bg-muted/10 hover:border-role-primary/30'}`}>
              {form.certificat_url ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-small font-medium text-foreground">{form.certificat_name}</p>
                      <p className="text-xs text-success">Certificat uploadé avec succès</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="action-button" title="Aperçu" onClick={() => window.open(form.certificat_url, '_blank')}><Eye className="h-4 w-4" /></button>
                    {!readOnly && <button className="action-button hover:text-danger" title="Supprimer" onClick={handleRemoveFile}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
              ) : !readOnly && (
                <div className="cursor-pointer text-center" onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(f); }; i.click(); }}>
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2 py-4"><div className="spinner-sm" /><p className="text-small text-muted">Upload en cours...</p></div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Upload className="h-8 w-8 text-muted" />
                      <p className="text-small text-muted">Cliquez pour uploader le certificat PDF signé</p>
                      <p className="text-xs text-muted">PDF uniquement, max 10 Mo</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

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
              {isSubmitting ? <><div className="spinner-sm" />Enregistrement...</> : <><Save className="h-4 w-4" />Clôturer Phase 4</>}
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default Phase4