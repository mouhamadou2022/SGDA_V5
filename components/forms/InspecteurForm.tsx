'use client'
// ZÉRO @/components/ui/ import

import { useState } from 'react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

// Utiliser la nouvelle structure AGA/XXX
const DOMAINES = ['AGA/EXPLOIT', 'AGA/GENIE_CIV', 'AGA/GENIE_ELEC', 'AGA/SLI_RA']

interface DomainState {
  coche: boolean
  niveau: string
}

interface Props {
  inspecteurId?: string
  onSubmit: (data: any) => void
  onCancel: () => void
}

const defaultDomaines = (): Record<string, DomainState> => {
  return Object.fromEntries(DOMAINES.map(d => [d, { coche: false, niveau: '1' }]))
}

// Mapping AGA/XXX vers domaines individuels
const AGA_DOMAINS = {
  'AGA/EXPLOIT': ['SGS', 'COP', 'OPS'],
  'AGA/GENIE_CIV': ['PHY', 'OLS'],
  'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
  'AGA/SLI_RA': ['SLI', 'RA'],
} as const

export function InspecteurForm({ inspecteurId, onSubmit, onCancel }: Props) {
  const [domaines, setDomaines] = useState<Record<string, DomainState>>(defaultDomaines)
  const [disponibilite, setDisponibilite] = useState('18')

  const toggleDomaine = (d: string) => {
    setDomaines(prev => ({
      ...prev,
      [d]: { ...prev[d], coche: !prev[d].coche },
    }))
  }

  const setNiveau = (d: string, niveau: string) => {
    setDomaines(prev => ({
      ...prev,
      [d]: { ...prev[d], niveau },
    }))
  }

const handleSubmit = () => {
  const competences = DOMAINES
    .filter(d => domaines[d].coche)
    .flatMap(d => {
      // Si c'est un code AGA/XXX, expandre vers les domaines individuels
      const domainesIndividuels = AGA_DOMAINS[d as keyof typeof AGA_DOMAINS] || [d]
      return domainesIndividuels.map(domaine => ({ domaine, niveau: parseInt(domaines[d].niveau) }))
    })

  onSubmit({
    inspecteurId,
    competences,
    disponibilite_jours_mois: parseInt(disponibilite),
  })
}

  const dispNum = parseInt(disponibilite)
  const invalide = isNaN(dispNum) || dispNum < 1 || dispNum > 22

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Domaines + niveaux */}
      <div className="form-field">
        <p className={labelClass}>Domaines de compétence</p>
        <div className="space-y-3">
          {DOMAINES.map(d => (
            <div key={d} className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer min-w-20">
                <input
                  type="checkbox"
                  checked={domaines[d].coche}
                  onChange={() => toggleDomaine(d)}
                  className="form-checkbox"
                />
                <span className="text-sm font-medium">{d}</span>
              </label>

              {domaines[d].coche && (
                <select
                  value={domaines[d].niveau}
                  onChange={e => setNiveau(d, e.target.value)}
                  className={`form-select text-sm w-44 ${focusClass}`}
                  style={selectStyle}
                >
                  <option value="1">Niveau 1 — Novice</option>
                  <option value="2">Niveau 2 — Débutant</option>
                  <option value="3">Niveau 3 — Intermédiaire</option>
                  <option value="4">Niveau 4 — Avancé</option>
                  <option value="5">Niveau 5 — Expert</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Disponibilité */}
      <div className="form-field">
        <label className={labelClass}>Disponibilité (jours/mois)</label>
        <input
          type="number"
          min={1}
          max={22}
          value={disponibilite}
          onChange={e => setDisponibilite(e.target.value)}
          placeholder="1-22"
          className={`form-input ${focusClass}${invalide ? ' border-danger' : ''}`}
        />
        {invalide && <p className="field-error">Valeur entre 1 et 22 jours</p>}
        <p className="field-description">Maximum 22 jours ouvrés par mois</p>
      </div>

      {/* Actions */}
      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
        <button type="button" onClick={handleSubmit} disabled={invalide} className="btn btn-primary">Sauvegarder</button>
      </div>
    </div>
  )
}

export default InspecteurForm
