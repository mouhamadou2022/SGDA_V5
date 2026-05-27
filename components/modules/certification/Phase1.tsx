// components/modules/certification/Phase1.tsx
'use client'

import { useState } from 'react'
import { Save, Lock, Upload, Eye, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface Phase1Props {
  certifId: string
  phaseData: any
  estActive: boolean
  onUpdate: (data: any) => void
}

export function Phase1({ certifId, phaseData, estActive, onUpdate }: Phase1Props) {
  const [form, setForm] = useState({
    date_reception: phaseData?.date_reception ?? '',
    coordonnees_nom: phaseData?.coordonnees?.nom ?? '',
    coordonnees_poste: phaseData?.coordonnees?.poste ?? '',
    coordonnees_email: phaseData?.coordonnees?.email ?? '',
    coordonnees_tel: phaseData?.coordonnees?.telephone ?? '',
    nature_demande: phaseData?.nature_demande ?? '',
    description: phaseData?.description ?? '',
    lettre_intent_url: phaseData?.lettre_intent_url ?? '',
    lettre_intent_name: phaseData?.lettre_intent_name ?? '',
    rapport_preliminaire_url: phaseData?.rapport_preliminaire_url ?? '',
    rapport_preliminaire_name: phaseData?.rapport_preliminaire_name ?? '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)

  const readOnly = !estActive
  const isComplete = form.date_reception && form.coordonnees_nom && form.coordonnees_email && form.description && form.lettre_intent_url

  const set = (key: string, val: string) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const handleFileUpload = async (docKey: 'lettre_intent' | 'rapport_preliminaire', file: File) => {
    setUploadingDoc(docKey)
    await new Promise(resolve => setTimeout(resolve, 1500))
    const url = URL.createObjectURL(file)
    const name = file.name
    if (docKey === 'lettre_intent') {
      setForm(f => ({ ...f, lettre_intent_url: url, lettre_intent_name: name }))
    } else {
      setForm(f => ({ ...f, rapport_preliminaire_url: url, rapport_preliminaire_name: name }))
    }
    setUploadingDoc(null)
  }

  const handleRemoveFile = (docKey: 'lettre_intent' | 'rapport_preliminaire') => {
    if (docKey === 'lettre_intent') {
      setForm(f => ({ ...f, lettre_intent_url: '', lettre_intent_name: '' }))
    } else {
      setForm(f => ({ ...f, rapport_preliminaire_url: '', rapport_preliminaire_name: '' }))
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      onUpdate({
        date_reception: form.date_reception,
        coordonnees: {
          nom: form.coordonnees_nom,
          poste: form.coordonnees_poste,
          email: form.coordonnees_email,
          telephone: form.coordonnees_tel,
        },
        nature_demande: form.nature_demande,
        description: form.description,
        lettre_intent_url: form.lettre_intent_url,
        lettre_intent_name: form.lettre_intent_name,
        rapport_preliminaire_url: form.rapport_preliminaire_url,
        rapport_preliminaire_name: form.rapport_preliminaire_name,
        cloture_le: new Date().toISOString(),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = readOnly
    ? `form-input bg-muted/30 cursor-not-allowed ${focusClass}`
    : `form-input ${focusClass}`

  const completudeScore = Object.values({
    date: !!form.date_reception,
    coordonnees: !!(form.coordonnees_nom && form.coordonnees_email),
    description: !!form.description,
    lettre: !!form.lettre_intent_url,
  }).filter(Boolean).length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card">
        <div className="card-header pb-3">
          <h3 className="card-title flex items-center justify-between">
            <div className="flex items-center gap-2">
              {readOnly && <Lock className="h-4 w-4 text-muted" />}
              <span>Phase 1 — Expression d'Intérêt</span>
              {!readOnly && isComplete && <span className="badge success">Prêt à clôturer</span>}
              {!readOnly && !isComplete && <span className="badge warning">Informations manquantes</span>}
              {readOnly && <span className="badge neutral">Lecture seule</span>}
            </div>
          </h3>
        </div>
        <div className="card-content space-y-5">

          {/* Barre de progression */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Complétude du dossier</span>
              <span className="text-foreground">{completudeScore}/4</span>
            </div>
            <div className="progress h-1.5">
              <div className="progress-bar" style={{ width: `${completudeScore * 25}%` }} />
            </div>
          </div>

          {/* Date réception */}
          <div className="form-field">
            <label className="filter-label">Date de réception du courrier *</label>
            <input
              type="date"
              value={form.date_reception}
              onChange={e => set('date_reception', e.target.value)}
              readOnly={readOnly}
              className={inputClass}
            />
          </div>

          {/* Coordonnées demandeur */}
          <div className="space-y-3">
            <label className="filter-label">Coordonnées du demandeur *</label>
            <div className="form-grid">
              <div className="form-field">
                <input value={form.coordonnees_nom} onChange={e => set('coordonnees_nom', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="Nom complet" />
              </div>
              <div className="form-field">
                <input value={form.coordonnees_poste} onChange={e => set('coordonnees_poste', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="Poste / Fonction" />
              </div>
              <div className="form-field">
                <input type="email" value={form.coordonnees_email} onChange={e => set('coordonnees_email', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="Email" />
              </div>
              <div className="form-field">
                <input type="tel" value={form.coordonnees_tel} onChange={e => set('coordonnees_tel', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="Téléphone" />
              </div>
            </div>
          </div>

          {/* Nature demande */}
          <div className="form-field">
            <label className="filter-label">Nature de la demande</label>
            <input value={form.nature_demande} onChange={e => set('nature_demande', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="Première certification / Renouvellement / Extension..." />
          </div>

          {/* Description */}
          <div className="form-field">
            <label className="filter-label">Description sommaire *</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              readOnly={readOnly}
              className={`form-textarea min-h-24 ${focusClass} ${readOnly ? 'bg-muted/30' : ''}`}
              placeholder="Description détaillée de la demande..."
            />
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <label className="filter-label">Documents requis *</label>

            {/* Lettre d'intention */}
            <div className={`p-3 rounded-xl border transition-all ${form.lettre_intent_url ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${form.lettre_intent_url ? 'bg-success/20' : 'bg-warning/20'}`}>
                    {form.lettre_intent_url ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-warning" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-medium text-foreground">Lettre d'intention *</p>
                    {form.lettre_intent_name && <p className="text-xs text-success truncate">{form.lettre_intent_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {uploadingDoc === 'lettre_intent' ? (
                    <div className="flex items-center gap-2">
                      <div className="progress w-20 h-1"><div className="progress-bar" style={{ width: '60%' }} /></div>
                      <span className="text-xs text-muted">Upload...</span>
                    </div>
                  ) : form.lettre_intent_url ? (
                    <div className="flex items-center gap-1">
                      <button className="action-button" title="Aperçu" onClick={() => window.open(form.lettre_intent_url, '_blank')}><Eye className="h-4 w-4" /></button>
                      {!readOnly && <button className="action-button hover:text-danger" title="Supprimer" onClick={() => handleRemoveFile('lettre_intent')}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  ) : !readOnly && (
                    <button type="button" className="btn btn-secondary gap-1.5 text-xs" onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,.doc,.docx'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload('lettre_intent', f); }; i.click(); }}>
                      <Upload className="h-3.5 w-3.5" />Uploader
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Rapport préliminaire */}
            <div className={`p-3 rounded-xl border transition-all ${form.rapport_preliminaire_url ? 'border-success/30 bg-success/5' : 'border-border bg-muted/10'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${form.rapport_preliminaire_url ? 'bg-success/20' : 'bg-muted/30'}`}>
                    {form.rapport_preliminaire_url ? <CheckCircle2 className="h-4 w-4 text-success" /> : <div className="w-4 h-4 rounded-full bg-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-medium text-foreground">Rapport préliminaire</p>
                    {form.rapport_preliminaire_name && <p className="text-xs text-success truncate">{form.rapport_preliminaire_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {uploadingDoc === 'rapport_preliminaire' ? (
                    <div className="flex items-center gap-2">
                      <div className="progress w-20 h-1"><div className="progress-bar" style={{ width: '60%' }} /></div>
                      <span className="text-xs text-muted">Upload...</span>
                    </div>
                  ) : form.rapport_preliminaire_url ? (
                    <div className="flex items-center gap-1">
                      <button className="action-button" title="Aperçu" onClick={() => window.open(form.rapport_preliminaire_url, '_blank')}><Eye className="h-4 w-4" /></button>
                      {!readOnly && <button className="action-button hover:text-danger" title="Supprimer" onClick={() => handleRemoveFile('rapport_preliminaire')}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  ) : !readOnly && (
                    <button type="button" className="btn btn-secondary gap-1.5 text-xs" onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,.doc,.docx'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload('rapport_preliminaire', f); }; i.click(); }}>
                      <Upload className="h-3.5 w-3.5" />Uploader
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!readOnly && !isComplete && (
            <div className="alert alert-warning animate-fade-up">
              <AlertCircle className="alert-icon" />
              <div className="alert-content">Des informations obligatoires sont manquantes. Veuillez compléter tous les champs marqués d'un *.</div>
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
              {isSubmitting ? <><div className="spinner-sm" />Enregistrement...</> : <><Save className="h-4 w-4" />Clôturer Phase 1</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Phase1
