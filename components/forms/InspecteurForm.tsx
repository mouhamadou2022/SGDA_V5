'use client'

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { AlertCircle } from 'lucide-react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

const TYPES = [
  { id: 'cadre_technique', label: 'Cadre Technique' },
  { id: 'inspecteur_titulaire', label: 'Inspecteur Titulaire' },
  { id: 'inspecteur_principal', label: 'Inspecteur Principal' },
]
const SERVICES = [
  { id: 'normes_aerodromes', label: 'Normes des Aérodromes' },
  { id: 'securite_aerodromes', label: 'Sécurité des Aérodromes' },
]
const DOMAINES_AGA = ['AGA/EXPLOIT', 'AGA/GENIE_CIV', 'AGA/GENIE_ELEC', 'AGA/SLI_RA']
const POSTES = [
  { id: 'inspecteur', label: 'Inspecteur' },
  { id: 'chef_ssa', label: 'Chef de Service SSA' },
  { id: 'chef_sna', label: 'Chef de Service SNA' },
  { id: 'chef_dnsa', label: 'Chef du DNSA' },
]
const STATUTS = [
  { id: 'en_service', label: 'En service' },
  { id: 'en_conge', label: 'En congé' },
  { id: 'en_mission', label: 'En mission' },
  { id: 'absent', label: 'Absent' },
]
const NIVEAUX = [
  { value: '1', label: 'Niveau 1 — Novice' },
  { value: '2', label: 'Niveau 2 — Débutant' },
  { value: '3', label: 'Niveau 3 — Intermédiaire' },
  { value: '4', label: 'Niveau 4 — Avancé' },
  { value: '5', label: 'Niveau 5 — Expert' },
]

const AGA_DOMAINS: Record<string, string[]> = {
  'AGA/EXPLOIT': ['SGS', 'COP', 'OPS'],
  'AGA/GENIE_CIV': ['PHY', 'OLS'],
  'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
  'AGA/SLI_RA': ['SLI', 'RA'],
}

interface Props {
  inspecteurId?: string
  initial?: any
  onSubmit: (data: any) => void
  onCancel: () => void
}

export function InspecteurForm({ inspecteurId, initial, onSubmit, onCancel }: Props) {
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const chefs = useMemo(() => utilisateurs.filter(u => ['chef_ssa', 'chef_sna', 'chef_dnsa', 'admin'].includes(u.poste || '')), [utilisateurs])

  const [form, setForm] = useState({
    matricule: initial?.matricule || '',
    prenom: initial?.prenom || '',
    nom: initial?.nom || '',
    email: initial?.email || '',
    telephone: initial?.telephone || '',
    type: initial?.type || 'cadre_technique',
    service: initial?.service || 'normes_aerodromes',
    poste: initial?.poste || '',
    superieur_id: initial?.superieur_id || '',
    domaine_principal: initial?.domaine_principal || 'exploitation',
    statut: initial?.statut || 'en_service',
    disponibilite: initial?.disponibilite?.toString() || '18',
  })

  const [domaines, setDomaines] = useState<Record<string, { coche: boolean; niveau: string }>>(
    Object.fromEntries(DOMAINES_AGA.map(d => [d, { coche: false, niveau: '1' }]))
  )

  const toggleDomaine = (d: string) => setDomaines(prev => ({ ...prev, [d]: { ...prev[d], coche: !prev[d].coche } }))
  const setNiveau = (d: string, niveau: string) => setDomaines(prev => ({ ...prev, [d]: { ...prev[d], niveau } }))

  const handleSubmit = () => {
    const competences = DOMAINES_AGA
      .filter(d => domaines[d].coche)
      .flatMap(d => (AGA_DOMAINS[d] || [d]).map(domaine => ({ domaine, niveau: parseInt(domaines[d].niveau) })))

    onSubmit({
      inspecteurId,
      ...form,
      competences,
      disponibilite_jours_mois: parseInt(form.disponibilite),
    })
  }

  const dispNum = parseInt(form.disponibilite)
  const invalide = isNaN(dispNum) || dispNum < 1 || dispNum > 22

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-field">
          <label className={labelClass}>Matricule *</label>
          <input className={`form-input ${focusClass}`} value={form.matricule} onChange={e => setForm({ ...form, matricule: e.target.value })} placeholder="AGAx/2025/001" />
        </div>
        <div className="form-field">
          <label className={labelClass}>Type *</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className={labelClass}>Prénom *</label>
          <input className={`form-input ${focusClass}`} value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
        </div>
        <div className="form-field">
          <label className={labelClass}>Nom *</label>
          <input className={`form-input ${focusClass}`} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
        </div>
        <div className="form-field">
          <label className={labelClass}>Email *</label>
          <input className={`form-input ${focusClass}`} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="form-field">
          <label className={labelClass}>Téléphone</label>
          <input className={`form-input ${focusClass}`} value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="form-field">
          <label className={labelClass}>Service *</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>
            {SERVICES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className={labelClass}>Poste hiérarchique</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.poste} onChange={e => setForm({ ...form, poste: e.target.value })}>
            <option value="">Sans poste</option>
            {POSTES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className={labelClass}>Supérieur hiérarchique</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.superieur_id} onChange={e => setForm({ ...form, superieur_id: e.target.value })}>
            <option value="">Aucun</option>
            {chefs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom} ({c.poste})</option>)}
          </select>
        </div>
        <div className="form-field">
          <label className={labelClass}>Statut *</label>
          <select className={`form-select ${focusClass}`} style={selectStyle} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}>
            {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-field">
        <p className={labelClass}>Domaines de compétence</p>
        <div className="space-y-3">
          {DOMAINES_AGA.map(d => (
            <div key={d} className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer min-w-20">
                <input type="checkbox" checked={domaines[d].coche} onChange={() => toggleDomaine(d)} className="form-checkbox" />
                <span className="text-sm font-medium">{d}</span>
              </label>
              {domaines[d].coche && (
                <select value={domaines[d].niveau} onChange={e => setNiveau(d, e.target.value)} className={`form-select text-sm w-44 ${focusClass}`} style={selectStyle}>
                  {NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="form-field">
        <label className={labelClass}>Disponibilité (jours/mois)</label>
        <input type="number" min={1} max={22} value={form.disponibilite} onChange={e => setForm({ ...form, disponibilite: e.target.value })} className={`form-input ${focusClass}${invalide ? ' border-danger' : ''}`} />
        {invalide && <p className="field-error"><AlertCircle className="w-3 h-3 inline mr-1" />Valeur entre 1 et 22 jours</p>}
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
        <button type="button" onClick={handleSubmit} disabled={invalide || !form.matricule || !form.prenom || !form.nom || !form.email} className="btn btn-primary">Sauvegarder</button>
      </div>
    </div>
  )
}

export default InspecteurForm