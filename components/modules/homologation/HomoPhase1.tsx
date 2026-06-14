// components/modules/homologation/HomoPhase1.tsx
'use client'

import { useState, useMemo } from 'react'
import { Save, Lock, FileText, Calendar, Users, AlertCircle } from 'lucide-react'
import { useAppStore, Homologation } from '@/lib/store'
import { Card } from '@/components/ui/card'

const DOCS_REQUIS_HOMO = [
  'Formulaire de demande d\'homologation',
  'Plan de situation de l\'aérodrome',
  'Plan de masse coté',
  'Description des installations et équipements',
  'Manuel d\'exploitation de l\'aérodrome',
  'Résultats des mesures de résistance des chaussées (PCR)',
  'Rapport de balisage lumineux',
  'Attestation de bornage',
]

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

interface HomoPhase1Props {
  homoId: string
  phaseData?: Homologation['phases_data']['phase1']
  estActive: boolean
  onUpdate: (data: Record<string, unknown>) => void
  userRole?: string
}

export function HomoPhase1({ homoId, phaseData, estActive, onUpdate, userRole = 'inspector' }: HomoPhase1Props) {
  const utilisateurs = useAppStore(s => s.utilisateurs)

  const [form, setForm] = useState({
    date_reception: phaseData?.date_reception ?? '',
    responsable_id: phaseData?.responsable_id ?? '',
    documents: phaseData?.documents ?? {} as Record<string, boolean>,
    observations: phaseData?.observations ?? '',
    rapport_evaluation_url: phaseData?.rapport_evaluation_url ?? '',
    lettre_transmission_url: phaseData?.lettre_transmission_url ?? '',
  })

  const readOnly = !estActive

  const setValue = (key: string, val: unknown) => {
    if (readOnly) return
    setForm(f => ({ ...f, [key]: val }))
  }

  const toggleDoc = (doc: string) => {
    if (readOnly) return
    setForm(f => ({
      ...f,
      documents: { ...f.documents, [doc]: !f.documents[doc] },
    }))
  }

  const completude = useMemo(() => {
    const coches = DOCS_REQUIS_HOMO.filter(d => form.documents[d]).length
    return Math.round((coches / DOCS_REQUIS_HOMO.length) * 100)
  }, [form.documents])

  const inspecteurs = utilisateurs.filter(u =>
    ['inspecteur', 'chef_inspecteur', 'admin'].includes(u.role)
  )

  const handleSubmit = () => {
    onUpdate({ ...form, completude, cloture_le: new Date().toISOString() })
  }

  const inputClass = readOnly ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''

  return (
    <div className="space-y-4 animate-fade-in" data-role={userRole}>
      <Card
        variant="role"
        icon={readOnly ? <Lock className="h-4 w-4 text-muted-foreground" /> : undefined}
        heading="Phase 1 — Instruction du dossier"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date de réception
              </label>
              <input
                type="date"
                value={form.date_reception}
                onChange={e => setValue('date_reception', e.target.value)}
                readOnly={readOnly}
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <Users className="h-3 w-3" />
                Responsable
              </label>
              {readOnly ? (
                <input
                  value={
                    utilisateurs.find(u => u.id === form.responsable_id)
                      ? `${utilisateurs.find(u => u.id === form.responsable_id)!.prenom} ${utilisateurs.find(u => u.id === form.responsable_id)!.nom}`
                      : form.responsable_id
                  }
                  readOnly
                  className={`form-input w-full bg-muted text-muted-foreground py-3 px-4 rounded-xl cursor-not-allowed`}
                />
              ) : (
                <select 
                  value={form.responsable_id} 
                  onChange={e => setValue('responsable_id', e.target.value)}
                  className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl appearance-none ${focusClass}`}
                  style={selectStyle}
                >
                  <option value="">Sélectionner</option>
                  {inspecteurs.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Checklist documents */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-2">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Documents requis
              </label>
              <span className="text-xs text-muted-foreground">{completude}% complet</span>
            </div>
            <div className="progress h-2 mb-3">
              <div className="progress-bar" style={{ width: `${completude}%` }} />
            </div>
            <div className="space-y-2">
              {DOCS_REQUIS_HOMO.map(doc => (
                <label
                  key={doc}
                  className={`flex items-center gap-2.5 text-small cursor-pointer select-none rounded-lg px-3 py-2 transition-colors ${
                    form.documents[doc] ? 'bg-success-soft text-success' : 'hover:bg-role-primary-soft'
                  } ${!readOnly ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={!!form.documents[doc]}
                    onChange={() => toggleDoc(doc)}
                    disabled={readOnly}
                    className="form-checkbox"
                  />
                  {doc}
                </label>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Observations
            </label>
            <textarea
              value={form.observations}
              onChange={e => setValue('observations', e.target.value)}
              readOnly={readOnly}
              className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${inputClass}`}
              rows={3}
              placeholder="Observations sur l'instruction du dossier…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Rapport d'évaluation
              </label>
              {readOnly && form.rapport_evaluation_url ? (
                <a href={form.rapport_evaluation_url} target="_blank" rel="noreferrer" className="text-small text-role-primary hover:underline">
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
                Lettre de transmission
              </label>
              {readOnly && form.lettre_transmission_url ? (
                <a href={form.lettre_transmission_url} target="_blank" rel="noreferrer" className="text-small text-role-primary hover:underline">
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
              Clôturer Phase 1
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default HomoPhase1