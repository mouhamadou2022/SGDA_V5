// components/modules/homologation/HomoPhase2.tsx
'use client'

import { useState } from 'react'
import { Save, Lock, Link as LinkIcon, Calendar, Users, FileText, AlertCircle } from 'lucide-react'
import { useAppStore, Homologation } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

interface HomoPhase2Props {
  homoId: string
  phaseData?: Homologation['phases_data']['phase2']
  estActive: boolean
  onUpdate: (data: Record<string, unknown>) => void
  userRole?: string
}

export function HomoPhase2({ homoId, phaseData, estActive, onUpdate, userRole = 'inspector' }: HomoPhase2Props) {
  const surveillances = useAppStore(s => s.surveillances);
  const utilisateurs = useAppStore(s => s.utilisateurs);

  const [form, setForm] = useState({
    surveillance_id: phaseData?.surveillance_id ?? '',
    date_verification: phaseData?.date_verification ?? '',
    equipe_ids: phaseData?.equipe_ids ?? [] as string[],
    chef_id: phaseData?.chef_id ?? '',
    score_conformite: phaseData?.score_conformite ?? 0,
    nc_relevees: phaseData?.nc_relevees ?? 0,
    conclusion: phaseData?.conclusion ?? '',
    conditions: phaseData?.conditions ?? '',
    plan_action_valide: phaseData?.plan_action_valide ?? false,
    rapport_verification_url: phaseData?.rapport_verification_url ?? '',
    rapport_evaluation_pac_url: phaseData?.rapport_evaluation_pac_url ?? '',
  })

  const readOnly = !estActive

  const setValue = (key: string, val: unknown) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const toggleEquipe = (id: string) => {
    if (readOnly) return
    const ids = form.equipe_ids.includes(id)
      ? form.equipe_ids.filter((i: string) => i !== id)
      : [...form.equipe_ids, id]
    setValue('equipe_ids', ids)
  }

  const inspecteurs = utilisateurs.filter(u =>
    ['inspecteur', 'chef_inspecteur', 'admin'].includes(u.role)
  )
  const surveilRef = surveillances.find(s => s.id === form.surveillance_id)

  const handleSubmit = () => {
    onUpdate({ ...form, cloture_le: new Date().toISOString() })
  }

  const inputClass = readOnly ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''

  return (
    <div className="space-y-4 animate-fade-in" data-role={userRole}>
      <div className="card border-border border-l-4 border-l-role-primary">
        <div className="card-header pb-3 bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-title text-small font-semibold flex items-center gap-2">
            {readOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
            Phase 2 — Vérification Terrain
          </div>
        </div>
        <div className="card-content space-y-4">
          {/* Surveillance liée */}
          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <LinkIcon className="h-3 w-3" />
              Surveillance liée
            </label>
            {readOnly ? (
              <div className="flex items-center gap-2 p-3 bg-role-primary-soft rounded-xl">
                {surveilRef ? (
                  <>
                    <LinkIcon className="h-4 w-4 text-role-primary" />
                    <span className="text-small text-foreground">
                      {new Date(surveilRef.date_debut).toLocaleDateString('fr-FR')} — {surveilRef.statut}
                    </span>
                  </>
                ) : (
                  <span className="text-small text-muted-foreground italic">Aucune surveillance liée</span>
                )}
              </div>
            ) : (
              <select 
                value={form.surveillance_id} 
                onChange={e => setValue('surveillance_id', e.target.value)}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="">Sélectionner une surveillance</option>
                {surveillances.map(s => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.date_debut).toLocaleDateString('fr-FR')} — {s.type} ({s.statut})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date de vérification
              </label>
              <input
                type="date"
                value={form.date_verification}
                onChange={e => setValue('date_verification', e.target.value)}
                readOnly={readOnly}
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Users className="h-3 w-3" />
                Chef d'équipe
              </label>
              {readOnly ? (
                <input
                  value={
                    utilisateurs.find(u => u.id === form.chef_id)
                      ? `${utilisateurs.find(u => u.id === form.chef_id)!.prenom} ${utilisateurs.find(u => u.id === form.chef_id)!.nom}`
                      : form.chef_id
                  }
                  readOnly
                  className={`form-input w-full bg-muted text-muted-foreground py-3 px-4 rounded-xl cursor-not-allowed`}
                />
              ) : (
                <select 
                  value={form.chef_id} 
                  onChange={e => setValue('chef_id', e.target.value)}
                  className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl appearance-none ${focusClass}`}
                  style={selectStyle}
                >
                  <option value="">Chef d'équipe</option>
                  {inspecteurs.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Équipe */}
          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <Users className="h-3 w-3" />
              Membres de l'équipe
            </label>
            {!readOnly ? (
              <div className="space-y-2 max-h-36 overflow-y-auto border border-border rounded-xl p-3 bg-gradient-to-r from-background to-role-primary/5">
                {inspecteurs.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-small cursor-pointer hover:bg-role-primary-soft p-1 rounded-lg">
                    <input
                      type="checkbox"
                      checked={form.equipe_ids.includes(u.id)}
                      onChange={() => toggleEquipe(u.id)}
                      className="form-checkbox"
                    />
                    {u.prenom} {u.nom}
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {form.equipe_ids.map((id: string) => {
                  const user = utilisateurs.find(u => u.id === id)
                  return user ? (
                    <span key={id} className="badge outline text-xs">
                      {user.prenom} {user.nom}
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>

          {/* Score conformité */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-1">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Score de conformité
              </label>
              <span className="text-sm font-bold text-role-primary">{form.score_conformite}/100</span>
            </div>
            <div className="progress h-2 mb-2">
              <div className="progress-bar" style={{ width: `${form.score_conformite}%` }} />
            </div>
            {!readOnly && (
              <input
                type="range"
                min={0}
                max={100}
                value={form.score_conformite}
                onChange={e => setValue('score_conformite', Number(e.target.value))}
                className="w-full accent-role-primary"
              />
            )}
          </div>

          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Non-conformités relevées
            </label>
            <input
              type="number"
              min={0}
              value={form.nc_relevees}
              onChange={e => setValue('nc_relevees', Number(e.target.value))}
              readOnly={readOnly}
              className={`form-input w-32 bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
            />
          </div>

          {/* Conclusion */}
          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1 mb-2">
              <FileText className="h-3 w-3" />
              Conclusion
            </label>
            <div className="space-y-2">
              {(['favorable', 'favorable_conditions', 'defavorable'] as const).map(val => (
                <label key={val} className="flex items-center gap-2 text-small cursor-pointer p-2 rounded-lg hover:bg-role-primary-soft">
                  <input
                    type="radio"
                    name="conclusion_homo2"
                    value={val}
                    checked={form.conclusion === val}
                    onChange={() => !readOnly && setValue('conclusion', val)}
                    disabled={readOnly}
                    className="form-radio"
                  />
                  <span className={form.conclusion === val ? 'font-semibold text-role-primary' : 'text-foreground'}>
                    {val === 'favorable' && 'Favorable'}
                    {val === 'favorable_conditions' && 'Favorable sous conditions'}
                    {val === 'defavorable' && 'Défavorable'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {form.conclusion === 'favorable_conditions' && (
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Conditions imposées
              </label>
              <textarea
                value={form.conditions}
                onChange={e => setValue('conditions', e.target.value)}
                readOnly={readOnly}
                className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
                rows={3}
                placeholder="Conditions imposées avant homologation…"
              />
            </div>
          )}

          {/* PAC validé */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-gradient-to-r from-background to-role-primary/5">
            <div>
              <p className="text-small font-medium text-foreground">Plan d'action validé</p>
              <p className="text-xs text-muted-foreground">Le PAC remis par l'exploitant a été validé</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && setValue('plan_action_valide', !form.plan_action_valide)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                form.plan_action_valide ? 'bg-success' : 'bg-muted'
              } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                  form.plan_action_valide ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Documents Phase 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Rapport de vérification
              </label>
              {readOnly && form.rapport_verification_url ? (
                <a href={form.rapport_verification_url} target="_blank" rel="noreferrer" className="text-small text-role-primary hover:underline">
                  Voir le document
                </a>
              ) : !readOnly ? (
                <input
                  type="file"
                  className="block w-full text-small text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-role-primary-soft file:text-role-primary hover:file:bg-role-primary-light"
                />
              ) : (
                <p className="text-small text-muted-foreground italic">Aucun document</p>
              )}
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Rapport évaluation PAC
              </label>
              {readOnly && form.rapport_evaluation_pac_url ? (
                <a href={form.rapport_evaluation_pac_url} target="_blank" rel="noreferrer" className="text-small text-role-primary hover:underline">
                  Voir le document
                </a>
              ) : !readOnly ? (
                <input
                  type="file"
                  className="block w-full text-small text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-role-primary-soft file:text-role-primary hover:file:bg-role-primary-light"
                />
              ) : (
                <p className="text-small text-muted-foreground italic">Aucun document</p>
              )}
            </div>
          </div>

          {estActive && (
            <button onClick={handleSubmit} className="btn btn-primary w-full gap-2">
              <Save className="h-4 w-4" />
              Clôturer Phase 2
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default HomoPhase2