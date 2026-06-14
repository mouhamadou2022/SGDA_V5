// components/modules/certification/Phase3.tsx
'use client'

import { useState, useMemo } from 'react'
import { Save, Lock, CheckCircle2, AlertCircle, Users, Calendar, Eye, Link as LinkIcon, AlertTriangle } from 'lucide-react'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

interface Phase3Props {
  certifId: string
  phaseData: any
  estActive: boolean
  onUpdate: (data: any) => void
}

export function Phase3({ certifId, phaseData, estActive, onUpdate }: Phase3Props) {
  const surveillances = useOptimizedStore(s => s.surveillances);
  const utilisateurs = useOptimizedStore(s => s.utilisateurs);
  const [form, setForm] = useState({
    surveillance_id: phaseData?.surveillance_id ?? '',
    date_verification: phaseData?.date_verification ?? '',
    equipe_ids: phaseData?.equipe_ids ?? [] as string[],
    chef_id: phaseData?.chef_id ?? '',
    score_conformite: phaseData?.score_conformite ?? 0,
    nc_relevees: phaseData?.nc_relevees ?? 0,
    nc_critiques: phaseData?.nc_critiques ?? 0,
    conclusion: phaseData?.conclusion ?? '',
    conditions: phaseData?.conditions ?? '',
    delai_conditions: phaseData?.delai_conditions ?? '',
    rapport_url: phaseData?.rapport_url ?? '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const readOnly = !estActive

  const set = (key: string, val: any) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const surveilRef = surveillances?.find(s => s.id === form.surveillance_id)
  const inspecteurs = utilisateurs?.filter(u =>
    ['inspecteur', 'chef_inspecteur', 'admin'].includes(u.role)
  ) || []

  const isComplete = useMemo(() => {
    return form.date_verification && form.chef_id && form.conclusion &&
      (form.score_conformite !== undefined || form.score_conformite !== null)
  }, [form])

  const getScoreColor = () => {
    const score = form.score_conformite || 0
    if (score >= 80) return 'text-success'
    if (score >= 60) return 'text-warning'
    return 'text-danger'
  }

  const getScoreClass = () => {
    const score = form.score_conformite || 0
    if (score >= 80) return 'progress-moyen'
    if (score >= 60) return 'progress-eleve'
    return 'progress-critique'
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      onUpdate({ ...form, cloture_le: new Date().toISOString() })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleEquipe = (userId: string) => {
    if (readOnly) return
    const ids = form.equipe_ids.includes(userId)
      ? form.equipe_ids.filter((id: string) => id !== userId)
      : [...form.equipe_ids, userId]
    set('equipe_ids', ids)
  }

  const inputClass = readOnly ? `form-input bg-muted/30 cursor-not-allowed ${focusClass}` : `form-input ${focusClass}`

  const phaseBadge = !readOnly && isComplete ? <span className="badge success pulse">Prêt à clôturer</span> :
    !readOnly && !isComplete ? <span className="badge warning">Informations manquantes</span> :
    <span className="badge neutral">Lecture seule</span>

  return (
    <div className="space-y-5 animate-fade-in">
      <Card
        icon={readOnly ? <Lock className="h-4 w-4 text-muted" /> : undefined}
        heading="Phase 3 — Vérification sur Site"
        badge={phaseBadge}
      >
        <div className="space-y-5">

          {/* Surveillance liée */}
          <div className="form-field">
            <label className="filter-label"><LinkIcon className="h-3 w-3 mr-1 inline" />Surveillance liée</label>
            {readOnly ? (
              <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl">
                {surveilRef ? (
                  <>
                    <div className={`w-2 h-2 rounded-full ${surveilRef.statut === 'transmise' ? 'bg-success' : 'bg-primary animate-pulse'}`} />
                    <span className="text-small text-foreground">Surveillance du {new Date(surveilRef.date_debut).toLocaleDateString('fr-FR')}</span>
                    <span className={`badge ${surveilRef.statut === 'transmise' ? 'success' : 'primary'}`}>{surveilRef.statut}</span>
                  </>
                ) : <span className="text-muted text-small">Aucune surveillance liée</span>}
              </div>
            ) : (
              <select className={`form-select ${focusClass}`} style={selectStyle} value={form.surveillance_id} onChange={e => set('surveillance_id', e.target.value)}>
                <option value="">Sélectionner une surveillance</option>
                {surveillances?.map(s => (
                  <option key={s.id} value={s.id}>{new Date(s.date_debut).toLocaleDateString('fr-FR')} — {s.type} ({s.statut})</option>
                ))}
              </select>
            )}
          </div>

          {/* Date vérification */}
          <div className="form-field">
            <label className="filter-label"><Calendar className="h-3 w-3 mr-1 inline" />Date de vérification *</label>
            <input type="date" value={form.date_verification} onChange={e => set('date_verification', e.target.value)} readOnly={readOnly} className={inputClass} />
          </div>

          {/* Chef d'équipe */}
          <div className="form-field">
            <label className="filter-label"><Users className="h-3 w-3 mr-1 inline" />Chef d'équipe *</label>
            {readOnly ? (
              <input value={inspecteurs.find(u => u.id === form.chef_id)?.nom || form.chef_id} readOnly className={inputClass} />
            ) : (
              <select className={`form-select ${focusClass}`} style={selectStyle} value={form.chef_id} onChange={e => set('chef_id', e.target.value)}>
                <option value="">Chef d'équipe</option>
                {inspecteurs.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            )}
          </div>

          {/* Membres de l'équipe */}
          {!readOnly && (
            <div className="form-field">
              <label className="filter-label">Membres de l'équipe</label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-muted/10 rounded-xl border border-border">
                {inspecteurs.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-small cursor-pointer">
                    <input type="checkbox" checked={form.equipe_ids.includes(u.id)} onChange={() => toggleEquipe(u.id)} className="form-checkbox-input" />
                    <span className="text-foreground">{u.prenom} {u.nom}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Score conformité */}
          <div className="form-field">
            <label className="filter-label">Score de conformité *</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold tracking-tight">
                  <span className={getScoreColor()}>{form.score_conformite || 0}</span>
                  <span className="text-muted text-lg">/100</span>
                </span>
                <span className={`badge ${form.score_conformite >= 80 ? 'success' : form.score_conformite >= 60 ? 'warning' : 'danger'}`}>
                  {form.score_conformite >= 80 ? 'Excellent' : form.score_conformite >= 60 ? 'Bon' : 'Insuffisant'}
                </span>
              </div>
              {!readOnly && (
                <input type="range" min="0" max="100" step="5" value={form.score_conformite} onChange={e => set('score_conformite', parseInt(e.target.value))} className="w-full accent-role-primary" />
              )}
              <div className="progress h-2">
                <div className={`progress-bar ${getScoreClass()}`} style={{ width: `${form.score_conformite || 0}%` }} />
              </div>
            </div>
          </div>

          {/* Non-conformités */}
          <div className="form-grid">
            <div className="form-field">
              <label className="filter-label">Non-conformités relevées</label>
              <input type="number" min="0" value={form.nc_relevees} onChange={e => set('nc_relevees', parseInt(e.target.value))} readOnly={readOnly} className={inputClass} />
            </div>
            <div className="form-field">
              <label className="filter-label">Dont critiques</label>
              <input type="number" min="0" value={form.nc_critiques} onChange={e => set('nc_critiques', parseInt(e.target.value))} readOnly={readOnly} className={inputClass} />
              {form.nc_critiques > 0 && (
                <p className="field-error flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />{form.nc_critiques} non-conformité(s) critique(s) à traiter
                </p>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div className="form-field">
            <label className="filter-label">Conditions imposées</label>
            <textarea value={form.conditions} onChange={e => set('conditions', e.target.value)} readOnly={readOnly} className={`form-textarea min-h-20 ${focusClass}`} rows={3} placeholder="Décrire les conditions à respecter..." />
          </div>

          <div className="form-field">
            <label className="filter-label">Délai de levée des conditions</label>
            <input type="date" value={form.delai_conditions} onChange={e => set('delai_conditions', e.target.value)} readOnly={readOnly} className={inputClass} />
          </div>

          {/* Conclusion */}
          <div className="form-field">
            <label className="filter-label">Conclusion *</label>
            <div className="flex gap-4 flex-wrap">
              {[
                { value: 'favorable', label: 'Favorable', variant: 'success', icon: CheckCircle2 },
                { value: 'favorable_conditions', label: 'Favorable sous conditions', variant: 'warning', icon: AlertCircle },
                { value: 'defavorable', label: 'Défavorable', variant: 'danger', icon: AlertTriangle },
              ].map((option) => (
                <label key={option.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${form.conclusion === option.value ? `border-${option.variant}/50 bg-${option.variant}/5` : 'border-border hover:border-muted-foreground/30'} ${readOnly ? 'opacity-70 cursor-default' : ''}`}>
                  <input type="radio" name="conclusion" value={option.value} checked={form.conclusion === option.value} onChange={() => !readOnly && set('conclusion', option.value)} disabled={readOnly} className="form-radio-input" />
                  <option.icon className={`h-4 w-4 text-${option.variant}`} />
                  <span className={`text-small ${form.conclusion === option.value ? `text-${option.variant} font-semibold` : 'text-foreground'}`}>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {form.rapport_url && (
            <div className="form-field">
              <label className="filter-label">Rapport de vérification</label>
              <button className="btn btn-secondary gap-2" onClick={() => window.open(form.rapport_url, '_blank')}>
                <Eye className="h-4 w-4" />Voir le rapport
              </button>
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
              {isSubmitting ? <><div className="spinner-sm" />Enregistrement...</> : <><Save className="h-4 w-4" />Clôturer Phase 3</>}
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default Phase3
