// components/modules/homologation/HomoPhase3.tsx
'use client'

import { useState, useEffect } from 'react'
import { Save, Lock, CheckCircle2, FileText, Calendar, Users, AlertCircle, Clock } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import type { Homologation } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

interface HomoPhase3Props {
  homoId: string
  phaseData?: Homologation['phases_data']['phase3']
  estActive: boolean
  onUpdate: (data: Record<string, unknown>) => void
  homologation?: Homologation
  userRole?: string
}

export function HomoPhase3({ homoId, phaseData, estActive, onUpdate, homologation, userRole = 'inspector' }: HomoPhase3Props) {
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const aerodromes = useAppStore(s => s.aerodromes);

  const [form, setForm] = useState({
    numero_decision: phaseData?.numero_decision ?? '',
    date_delivrance: phaseData?.date_delivrance ?? '',
    date_expiration: phaseData?.date_expiration ?? '',
    nature_decision: phaseData?.nature_decision ?? '',
    duree_validite: phaseData?.duree_validite ?? 24,
    conditions_exploitation: phaseData?.conditions_exploitation ?? '',
    signataire_id: phaseData?.signataire_id ?? '',
    notification_envoyee: phaseData?.notification_envoyee ?? false,
    decision_url: phaseData?.decision_url ?? '',
  })

  const readOnly = !estActive

  const setValue = (key: string, val: unknown) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  // Auto-calcul date expiration selon durée validité en mois
  useEffect(() => {
    if (!form.date_delivrance || readOnly) return
    const d = new Date(form.date_delivrance)
    d.setMonth(d.getMonth() + Number(form.duree_validite))
    setForm(f => ({
      ...f,
      date_expiration: d.toISOString().slice(0, 10),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date_delivrance, form.duree_validite])

  const signataires = utilisateurs.filter(u => ['admin', 'dg'].includes(u.role))
  const aero = homologation ? aerodromes.find(a => a.id === homologation.aerodrome_id) : null

  const handleSubmit = () => {
    onUpdate({ ...form, cloture_le: new Date().toISOString() })
  }

  const inputClass = readOnly ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''

  const natureBadge = {
    accordee: { label: 'Accordée', cls: 'badge success' },
    conditions: { label: 'Accordée sous conditions', cls: 'badge warning' },
    refusee: { label: 'Refusée', cls: 'badge danger' },
  }

  return (
    <div className="space-y-4 animate-fade-in" data-role={userRole}>
      <Card
        variant="role"
        icon={readOnly ? <Lock className="h-4 w-4 text-muted-foreground" /> : undefined}
        heading="Phase 3 — Décision d'Homologation"
      >
        <div className="space-y-4">
          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <FileText className="h-3 w-3" />
              N° de décision
            </label>
            <input
              value={form.numero_decision}
              onChange={e => setValue('numero_decision', e.target.value)}
              readOnly={readOnly}
              className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              placeholder="ANACIM-HOMO-2024-XXX"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date de délivrance
              </label>
              <input
                type="date"
                value={form.date_delivrance}
                onChange={e => setValue('date_delivrance', e.target.value)}
                readOnly={readOnly}
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Durée validité (mois)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={form.duree_validite}
                onChange={e => setValue('duree_validite', Number(e.target.value))}
                readOnly={readOnly}
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date d'expiration
              </label>
              <input
                type="date"
                value={form.date_expiration}
                onChange={e => setValue('date_expiration', e.target.value)}
                readOnly={readOnly}
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              />
              <p className="field-description">Calculée automatiquement</p>
            </div>
          </div>

          {/* Nature de la décision */}
          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1 mb-2">
              <FileText className="h-3 w-3" />
              Nature de la décision
            </label>
            <div className="space-y-2">
              {(['accordee', 'conditions', 'refusee'] as const).map(val => (
                <label key={val} className="flex items-center gap-2 text-small cursor-pointer p-2 rounded-lg hover:bg-role-primary-soft">
                  <input
                    type="radio"
                    name="nature_decision"
                    value={val}
                    checked={form.nature_decision === val}
                    onChange={() => !readOnly && setValue('nature_decision', val)}
                    disabled={readOnly}
                    className="form-radio"
                  />
                  <span className={form.nature_decision === val ? 'font-semibold text-role-primary' : 'text-foreground'}>
                    {val === 'accordee' && "Homologation accordée"}
                    {val === 'conditions' && "Accordée sous conditions"}
                    {val === 'refusee' && "Refusée"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Conditions d'exploitation
            </label>
            <textarea
              value={form.conditions_exploitation}
              onChange={e => setValue('conditions_exploitation', e.target.value)}
              readOnly={readOnly}
              className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              rows={3}
              placeholder="Conditions particulières d'exploitation liées à l'homologation…"
            />
          </div>

          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <Users className="h-3 w-3" />
              Signataire
            </label>
            {readOnly ? (
              <input
                value={
                  utilisateurs.find(u => u.id === form.signataire_id)
                    ? `${utilisateurs.find(u => u.id === form.signataire_id)!.prenom} ${utilisateurs.find(u => u.id === form.signataire_id)!.nom}`
                    : form.signataire_id
                }
                readOnly
                className={`form-input w-full bg-muted text-muted-foreground py-3 px-4 rounded-xl cursor-not-allowed`}
              />
            ) : (
              <select 
                value={form.signataire_id} 
                onChange={e => setValue('signataire_id', e.target.value)}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="">Sélectionner le signataire</option>
                {signataires.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.prenom} {u.nom} ({u.role.toUpperCase()})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Document décision */}
          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Décision (PDF)
            </label>
            {readOnly && form.decision_url ? (
              <a href={form.decision_url} target="_blank" rel="noreferrer" className="text-small text-role-primary hover:underline">
                Télécharger la décision
              </a>
            ) : !readOnly ? (
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="block w-full text-small text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-role-primary-soft file:text-role-primary hover:file:bg-role-primary-light"
              />
            ) : (
              <p className="text-small text-muted-foreground italic">Aucune décision jointe</p>
            )}
          </div>

          {/* Toggle notification */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-gradient-to-r from-background to-role-primary/5">
            <div>
              <p className="text-small font-medium text-foreground">Notification envoyée</p>
              <p className="text-xs text-muted-foreground">L'exploitant et les parties prenantes ont été notifiés</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && setValue('notification_envoyee', !form.notification_envoyee)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                form.notification_envoyee ? 'bg-success' : 'bg-muted'
              } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                  form.notification_envoyee ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Résumé dossier */}
          {homologation && (
            <div className="rounded-xl border border-primary bg-primary-soft p-4 space-y-3">
              <p className="text-xs font-bold text-role-primary flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Résumé du dossier d'homologation
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <span className="text-muted-foreground">Aérodrome</span>
                <span className="font-semibold text-foreground">{aero?.nom ?? homologation.aerodrome_id}</span>

                <span className="text-muted-foreground">Référence</span>
                <span className="code-oaci-badge">{homologation.reference}</span>

                {form.numero_decision && (
                  <>
                    <span className="text-muted-foreground">N° décision</span>
                    <span className="font-mono text-foreground">{form.numero_decision}</span>
                  </>
                )}

                {form.date_delivrance && (
                  <>
                    <span className="text-muted-foreground">Date délivrance</span>
                    <span className="text-foreground">{new Date(form.date_delivrance).toLocaleDateString('fr-FR')}</span>
                  </>
                )}

                {form.date_expiration && (
                  <>
                    <span className="text-muted-foreground">Expiration</span>
                    <span className="text-foreground">{new Date(form.date_expiration).toLocaleDateString('fr-FR')}</span>
                  </>
                )}

                {form.nature_decision && (
                  <>
                    <span className="text-muted-foreground">Décision</span>
                    <span className={natureBadge[form.nature_decision as keyof typeof natureBadge]?.cls ?? 'badge neutral'}>
                      {natureBadge[form.nature_decision as keyof typeof natureBadge]?.label ?? form.nature_decision}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {estActive && (
            <button onClick={handleSubmit} className="btn btn-primary w-full gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Finaliser l'homologation
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default HomoPhase3