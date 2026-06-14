// components/modules/certification/Phase5.tsx
'use client'

import { useState } from 'react'
import { Save, Lock, CheckCircle2, AlertCircle, Calendar, FileText, Globe, Send, Mail, Phone, Check, X, AlertTriangle, Award } from 'lucide-react'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import type { Certification } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface Phase5Props {
  certifId: string
  phaseData: any
  estActive: boolean
  onUpdate: (data: any) => void
  certification?: Certification
}

export function Phase5({ certifId, phaseData, estActive, onUpdate, certification }: Phase5Props) {
  const aerodromes = useOptimizedStore(s => s.aerodromes);
  const utilisateurs = useOptimizedStore(s => s.utilisateurs);
  const [form, setForm] = useState({
    statut_officiel: phaseData?.statut_officiel ?? '',
    date_publication_aip: phaseData?.date_publication_aip ?? '',
    reference_aip: phaseData?.reference_aip ?? '',
    notam: phaseData?.notam ?? '',
    notification_envoyee: phaseData?.notification_envoyee ?? false,
    commentaires: phaseData?.commentaires ?? '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sendingNotification, setSendingNotification] = useState(false)
  const [notificationSent, setNotificationSent] = useState(false)

  const readOnly = !estActive

  const set = (key: string, val: any) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const aero = certification ? aerodromes?.find(a => a.id === certification.aerodrome_id) : null
  const exploitant = utilisateurs?.find(u => u.aerodrome_id === certification?.aerodrome_id && u.role === 'dg_operator')

  const isComplete = form.statut_officiel && form.date_publication_aip && form.reference_aip

  const getStatutBadge = () => {
    switch (form.statut_officiel) {
      case 'certifie': return { label: 'Certifié', variant: 'success', icon: Award }
      case 'certifie_restrictions': return { label: 'Certifié avec restrictions', variant: 'warning', icon: AlertCircle }
      case 'non_certifie': return { label: 'Non certifié', variant: 'danger', icon: X }
      default: return { label: 'Non défini', variant: 'neutral', icon: AlertCircle }
    }
  }

  const statutBadge = getStatutBadge()
  const StatutIcon = statutBadge.icon

  const handleSendNotification = async () => {
    if (!exploitant) return
    setSendingNotification(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    setNotificationSent(true)
    setTimeout(() => setNotificationSent(false), 3000)
    setSendingNotification(false)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      onUpdate({ ...form, cloture_le: new Date().toISOString() })
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = readOnly ? `form-input bg-muted/30 cursor-not-allowed ${focusClass}` : `form-input ${focusClass}`

  const completudeScore = Object.values({
    statut: !!form.statut_officiel,
    aip: !!(form.date_publication_aip && form.reference_aip),
    notification: form.notification_envoyee,
  }).filter(Boolean).length

  const phaseBadge = !readOnly && isComplete ? <span className="badge success pulse">Prêt à finaliser</span> :
    !readOnly && !isComplete ? <span className="badge warning">Informations manquantes</span> :
    <span className="badge neutral">Lecture seule</span>

  return (
    <div className="space-y-5 animate-fade-in">
      <Card
        icon={readOnly ? <Lock className="h-4 w-4 text-muted" /> : undefined}
        heading="Phase 5 — Publication AIP et notification"
        badge={phaseBadge}
      >
        <div className="space-y-5">

          {/* Barre de progression */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Progression finale</span>
              <span className="text-foreground">{completudeScore}/3</span>
            </div>
            <div className="progress h-1.5">
              <div className="progress-bar" style={{ width: `${completudeScore * 33.33}%` }} />
            </div>
          </div>

          {/* Résumé du dossier */}
          {certification && (
            <div className="p-4 rounded-xl bg-role-primary-soft border border-role-primary/20">
              <p className="text-xs font-bold text-role-primary flex items-center gap-2 mb-3">
                <FileText className="h-3.5 w-3.5" />
                Récapitulatif du dossier de certification
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <span className="text-muted">Aérodrome</span>
                <span className="font-semibold text-foreground">{aero?.nom ?? certification.aerodrome_id}</span>
                <span className="text-muted">Code OACI</span>
                <span className="code-oaci-badge text-xs">{aero?.code_oaci ?? 'N/A'}</span>
                <span className="text-muted">Référence certification</span>
                <span className="font-mono text-foreground">{certification.reference}</span>
                {certification.numero_cert && (<><span className="text-muted">N° certificat</span><span className="font-mono text-foreground">{certification.numero_cert}</span></>)}
                {certification.date_delivrance && (<><span className="text-muted">Date délivrance</span><span className="text-foreground">{new Date(certification.date_delivrance).toLocaleDateString('fr-FR')}</span></>)}
                {certification.date_expiration && (<><span className="text-muted">Date expiration</span><span className="text-foreground">{new Date(certification.date_expiration).toLocaleDateString('fr-FR')}</span></>)}
              </div>
            </div>
          )}

          {/* Statut officiel */}
          <div className="form-field">
            <label className="filter-label"><Globe className="h-3 w-3 mr-1 inline" />Statut officiel *</label>
            <div className="flex gap-4 flex-wrap">
              {[
                { value: 'certifie', label: 'Certifié', variant: 'success', icon: Award, description: 'Certification complète accordée' },
                { value: 'certifie_restrictions', label: 'Certifié avec restrictions', variant: 'warning', icon: AlertCircle, description: 'Certification accordée avec conditions' },
                { value: 'non_certifie', label: 'Non certifié', variant: 'danger', icon: X, description: 'Certification refusée' },
              ].map((option) => (
                <label key={option.value} className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${form.statut_officiel === option.value ? `border-${option.variant}/50 bg-${option.variant}/5` : 'border-border hover:border-muted-foreground/30'} ${readOnly ? 'opacity-70 cursor-default' : ''}`}>
                  <input type="radio" name="statut_officiel" value={option.value} checked={form.statut_officiel === option.value} onChange={() => !readOnly && set('statut_officiel', option.value)} disabled={readOnly} className="form-radio-input" />
                  <option.icon className={`h-5 w-5 text-${option.variant}`} />
                  <div className="flex-1">
                    <p className={`text-small font-semibold ${form.statut_officiel === option.value ? `text-${option.variant}` : 'text-foreground'}`}>{option.label}</p>
                    <p className="text-xs text-muted">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Publication AIP */}
          <div className="form-grid">
            <div className="form-field">
              <label className="filter-label"><Calendar className="h-3 w-3 mr-1 inline" />Date publication AIP *</label>
              <input type="date" value={form.date_publication_aip} onChange={e => set('date_publication_aip', e.target.value)} readOnly={readOnly} className={inputClass} />
            </div>
            <div className="form-field">
              <label className="filter-label"><FileText className="h-3 w-3 mr-1 inline" />Référence AIP *</label>
              <input value={form.reference_aip} onChange={e => set('reference_aip', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="AIP SNE AD 2.GOxx" />
              <p className="field-description">Référence dans la publication AIP du Sénégal</p>
            </div>
          </div>

          {/* NOTAM */}
          <div className="form-field">
            <label className="filter-label">NOTAM associé</label>
            <input value={form.notam} onChange={e => set('notam', e.target.value)} readOnly={readOnly} className={inputClass} placeholder="A0001/25 NOTAM..." />
            <p className="field-description">NOTAM publié pour informer les usagers</p>
          </div>

          {/* Notification exploitant */}
          <div className="form-field">
            <label className="filter-label">Notification de l'exploitant</label>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border">
                <div>
                  <p className="text-small font-medium text-foreground">Notification par email et SMS</p>
                  <p className="text-xs text-muted mt-0.5">
                    {exploitant
                      ? `Envoyé à ${exploitant.email}${exploitant.telephone ? ` et ${exploitant.telephone}` : ''}`
                      : 'Aucun contact exploitant trouvé'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!readOnly && (
                    <button disabled={sendingNotification || !exploitant} onClick={handleSendNotification} className="btn btn-secondary gap-2">
                      {sendingNotification ? <><div className="spinner-sm" />Envoi...</> : notificationSent ? <><Check className="h-4 w-4 text-success" />Envoyé</> : <><Send className="h-4 w-4" />Tester l'envoi</>}
                    </button>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.notification_envoyee} onChange={e => set('notification_envoyee', e.target.checked)} disabled={readOnly} className="form-checkbox-input" />
                    <span className="text-small text-foreground">Notification envoyée</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Commentaires finaux */}
          <div className="form-field">
            <label className="filter-label">Commentaires finaux</label>
            <textarea value={form.commentaires} onChange={e => set('commentaires', e.target.value)} readOnly={readOnly} className={`form-textarea min-h-20 ${focusClass}`} rows={3} placeholder="Observations ou remarques finales..." />
          </div>

          {/* Résumé statut */}
          {form.statut_officiel && (
            <div className={`flex items-center justify-between p-4 rounded-xl border-2 border-${statutBadge.variant}/30 bg-${statutBadge.variant}/5`}>
              <div className="flex items-center gap-3">
                <StatutIcon className={`h-6 w-6 text-${statutBadge.variant}`} />
                <div>
                  <p className="text-small font-semibold text-foreground">Statut final de la certification</p>
                  <p className="text-xs text-muted">
                    {statutBadge.label === 'Certifié' && "L'aérodrome est officiellement certifié."}
                    {statutBadge.label === 'Certifié avec restrictions' && 'La certification est accordée sous conditions.'}
                    {statutBadge.label === 'Non certifié' && 'La certification a été refusée.'}
                  </p>
                </div>
              </div>
              <span className={`badge ${statutBadge.variant} text-sm px-3 py-1`}>{statutBadge.label}</span>
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
              <div className="alert-content">Tous les champs obligatoires sont remplis. Vous pouvez finaliser la certification.</div>
            </div>
          )}

          {estActive && (
            <button onClick={handleSubmit} disabled={!isComplete || isSubmitting} className={`btn btn-primary w-full gap-2 ${!isComplete ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isSubmitting ? <><div className="spinner-sm" />Finalisation...</> : <><Award className="h-4 w-4" />Finaliser la certification</>}
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default Phase5
