'use client'
// ZÉRO @/components/ui/ import

import { useState } from 'react'
import { X } from 'lucide-react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

interface Props {
  onSubmit: (msg: any) => void
  onCancel: () => void
  defaultDestinataires?: string[]
}

export function MessageForm({ onSubmit, onCancel, defaultDestinataires = [] }: Props) {
  const [destinataires, setDestinataires] = useState<string[]>(defaultDestinataires)
  const [inputDest, setInputDest] = useState('')
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [priorite, setPriorite] = useState('normale')
  const [erreurs, setErreurs] = useState<string[]>([])

  const ajouterDestinataire = () => {
    const val = inputDest.trim()
    if (val && !destinataires.includes(val)) {
      setDestinataires(prev => [...prev, val])
      setInputDest('')
    }
  }

  const supprimerDestinataire = (d: string) => {
    setDestinataires(prev => prev.filter(x => x !== d))
  }

  const valider = () => {
    const errs: string[] = []
    if (!objet.trim()) errs.push('objet')
    if (!corps.trim()) errs.push('corps')
    setErreurs(errs)
    return errs.length === 0
  }

  const handleSubmit = () => {
    if (!valider()) return
    onSubmit({ destinataires, objet, corps, priorite })
  }

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ajouterDestinataire()
    }
  }

  const hasErr = (field: string) => erreurs.includes(field)

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Destinataires */}
      <div className="form-field">
        <label className={labelClass}>Destinataires</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nom ou email + Entrée"
            value={inputDest}
            onChange={e => setInputDest(e.target.value)}
            onKeyDown={keyDown}
            className={`form-input flex-1 ${focusClass}`}
          />
          <button
            type="button"
            onClick={ajouterDestinataire}
            className="btn btn-secondary px-3"
          >
            +
          </button>
        </div>
        {destinataires.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {destinataires.map(d => (
              <span
                key={d}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-slate-200 text-slate-700 cursor-pointer hover:bg-slate-300 transition-colors"
                onClick={() => supprimerDestinataire(d)}
                title="Cliquer pour supprimer"
              >
                {d}
                <X className="w-3 h-3 ml-1" />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Objet */}
      <div className="form-field">
        <label className={labelClass}>Objet *</label>
        <input
          type="text"
          placeholder="Objet du message"
          value={objet}
          onChange={e => setObjet(e.target.value)}
          className={`form-input ${focusClass}${hasErr('objet') ? ' border-danger' : ''}`}
        />
        {hasErr('objet') && <p className="field-error">L'objet est requis</p>}
      </div>

      {/* Corps */}
      <div className="form-field">
        <label className={labelClass}>Message *</label>
        <textarea
          placeholder="Rédigez votre message..."
          rows={5}
          value={corps}
          onChange={e => setCorps(e.target.value)}
          className={`form-textarea ${focusClass}${hasErr('corps') ? ' border-danger' : ''}`}
        />
        {hasErr('corps') && <p className="field-error">Le corps du message est requis</p>}
      </div>

      {/* Priorité */}
      <div className="form-field">
        <label className={labelClass}>Priorité</label>
        <select
          value={priorite}
          onChange={e => setPriorite(e.target.value)}
          className={`form-select ${focusClass}`}
          style={selectStyle}
        >
          <option value="normale">Normale</option>
          <option value="haute">Haute</option>
          <option value="urgente">Urgente</option>
        </select>
      </div>

      {/* PJ */}
      <div className="form-field">
        <label className={labelClass}>Pièce jointe (optionnel)</label>
        <input
          type="file"
          className="form-input py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs cursor-pointer"
        />
      </div>

      {/* Actions */}
      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
        <button type="button" onClick={handleSubmit} className="btn btn-primary">Envoyer</button>
      </div>
    </div>
  )
}

export default MessageForm
