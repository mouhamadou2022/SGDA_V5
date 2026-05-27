// components/modules/audit/AuditFilters.tsx
// ✅ Filtres avancés avec design system premium

'use client'

import { useState } from 'react'
import { Filter, X } from 'lucide-react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

const MODULES = [
  { value: 'tous', label: 'Tous les modules' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'aerodromes', label: 'Aérodromes' },
  { value: 'certification', label: 'Certification' },
  { value: 'homologation', label: 'Homologation' },
  { value: 'planning', label: 'Planning' },
  { value: 'surveillance', label: 'Surveillance' },
  { value: 'plans-actions', label: "Plans d'action" },
  { value: 'registres', label: 'Registres' },
  { value: 'dossiers', label: 'Dossiers' },
  { value: 'formation', label: 'Formation' },
  { value: 'kit', label: 'Kit Inspecteur' },
  { value: 'evenements', label: 'Évènements' },
  { value: 'enquetes', label: 'Enquêtes' },
  { value: 'messagerie', label: 'Messagerie' },
  { value: 'risque', label: 'Profil Risque' },
  { value: 'signatures', label: 'Signatures' },
  { value: 'charge', label: 'Charge travail' },
  { value: 'utilisateurs', label: 'Utilisateurs' },
  { value: 'codes', label: "Codes d'accès" },
  { value: 'audit', label: 'Audit' },
]

const ACTIONS = [
  { value: 'tous', label: 'Toutes les actions' },
  { value: 'creation', label: 'Création' },
  { value: 'modification', label: 'Modification' },
  { value: 'suppression', label: 'Suppression' },
  { value: 'connexion', label: 'Connexion' },
  { value: 'deconnexion', label: 'Déconnexion' },
  { value: 'export', label: 'Export' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'signature', label: 'Signature' },
  { value: 'transmission', label: 'Transmission' },
  { value: 'revocation', label: 'Révocation' },
]

const ROLES = [
  { value: 'tous', label: 'Tous les rôles' },
  { value: 'admin', label: 'Administrateur' },
  { value: 'inspector', label: 'Inspecteur' },
  { value: 'dg_anacim', label: 'DG ANACIM' },
  { value: 'dg_operator', label: 'DG Opérateur' },
  { value: 'focal_operator', label: 'Focal Opérateur' },
  { value: 'staff_operator', label: 'Staff Opérateur' },
  { value: 'guest', label: 'Invité' },
]

interface Props {
  onFilter: (f: Record<string, string>) => void
}

const INITIAL: Record<string, string> = {
  module: 'tous',
  action: 'tous',
  utilisateur: '',
  role: 'tous',
  date_de: '',
  date_a: '',
}

export function AuditFilters({ onFilter }: Props) {
  const [form, setForm] = useState<Record<string, string>>(INITIAL)

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const appliquer = () => {
    onFilter({ ...form })
  }

  const reinitialiser = () => {
    setForm(INITIAL)
    onFilter(INITIAL)
  }

  const hasActiveFilters = () => {
    return Object.values(form).some(v => v !== '' && v !== 'tous')
  }

  return (
    <div className="space-y-4">
      {/* En-tête des filtres */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-role-primary" />
          <h3 className="text-small font-semibold text-foreground">Filtres avancés</h3>
          {hasActiveFilters() && (
            <span className="badge danger pulse text-[10px]">Actifs</span>
          )}
        </div>
        <button
          onClick={reinitialiser}
          className="text-muted hover:text-role-primary transition-colors text-xs flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Réinitialiser
        </button>
      </div>

      {/* Grille des filtres avec classes premium */}
      <div className="form-grid">
        <div className="form-field">
          <label className="filter-label">Module</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.module} onChange={e => set('module', e.target.value)}>
            {MODULES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="filter-label">Action</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.action} onChange={e => set('action', e.target.value)}>
            {ACTIONS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="filter-label">Utilisateur</label>
          <input
            className={`form-input ${focusClass}`}
            placeholder="Nom ou identifiant..."
            value={form.utilisateur}
            onChange={e => set('utilisateur', e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="filter-label">Rôle</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.role} onChange={e => set('role', e.target.value)}>
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="filter-label">Date de</label>
          <input
            type="date"
            className={`form-input ${focusClass}`}
            value={form.date_de}
            onChange={e => set('date_de', e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="filter-label">Date à</label>
          <input
            type="date"
            className={`form-input ${focusClass}`}
            value={form.date_a}
            onChange={e => set('date_a', e.target.value)}
          />
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="form-actions pt-2">
        <button onClick={appliquer} className="btn btn-primary gap-2">
          <Filter className="w-4 h-4" />
          Appliquer les filtres
        </button>
        <button onClick={reinitialiser} className="btn btn-secondary">
          Réinitialiser
        </button>
      </div>
    </div>
  )
}

export default AuditFilters
