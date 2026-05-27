// components/modules/formation/EcheanceAlert.tsx
'use client'

import { useState } from 'react'
import { X, Calendar, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Alerte {
  id: string
  inspecteur: string
  typeFormation: string
  dateExpiration: string
  joursRestants: number
}

const ALERTES_INITIALES: Alerte[] = [
  { id: 'al-1', inspecteur: 'Ibrahima Sow', typeFormation: 'PHY Génie Civil RAS-14', dateExpiration: '2026-04-30', joursRestants: 5 },
  { id: 'al-2', inspecteur: 'Fatou Ndiaye', typeFormation: 'Certification SSLIA Cat 9', dateExpiration: '2026-05-10', joursRestants: 15 },
  { id: 'al-3', inspecteur: 'Rokhaya Fall', typeFormation: 'SGS Sécurité aéroportuaire', dateExpiration: '2026-05-20', joursRestants: 25 },
  { id: 'al-4', inspecteur: 'Birame Gueye', typeFormation: 'AIS Procédures navigation', dateExpiration: '2026-06-05', joursRestants: 41 },
  { id: 'al-5', inspecteur: 'Penda Mbaye', typeFormation: 'MET Météorologie opérationnelle', dateExpiration: '2026-06-18', joursRestants: 54 },
  { id: 'al-6', inspecteur: 'Seydou Kouyaté', typeFormation: 'OPS Opérations piste', dateExpiration: '2026-07-02', joursRestants: 68 },
  { id: 'al-7', inspecteur: 'Ndéye Sarr', typeFormation: 'COM Communication aéronautique', dateExpiration: '2026-07-15', joursRestants: 81 },
]

interface PlanifierState {
  alerte: Alerte
  datePrevue: string
  organisme: string
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

interface Props {
  userRole: string
}

function groupColor(jours: number): string {
  if (jours < 30) return 'bg-danger-soft border-danger'
  if (jours < 60) return 'bg-warning-soft border-warning'
  return 'bg-role-primary-soft border-role-primary'
}

export function EcheanceAlert({ userRole }: Props) {
  const [alertes, setAlertes] = useState<Alerte[]>(ALERTES_INITIALES)
  const [planifier, setPlanifier] = useState<PlanifierState | null>(null)

  const rouge = alertes.filter(a => a.joursRestants < 30)
  const orange = alertes.filter(a => a.joursRestants >= 30 && a.joursRestants < 60)
  const jaune = alertes.filter(a => a.joursRestants >= 60 && a.joursRestants <= 90)

  const confirmer = () => {
    if (!planifier) return
    setAlertes(prev => prev.filter(a => a.id !== planifier.alerte.id))
    setPlanifier(null)
  }

  if (alertes.length === 0) {
    return (
      <div className="card p-6 border-success bg-success-soft animate-fade-in">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <div>
            <p className="font-semibold text-success">Toutes les formations sont à jour</p>
            <p className="text-small text-muted-foreground">Aucune échéance dans les 90 prochains jours.</p>
          </div>
        </div>
      </div>
    )
  }

  const renderGroupe = (liste: Alerte[], titre: string, icon?: React.ReactNode) => {
    if (liste.length === 0) return null
    return (
      <div className="space-y-2">
        <p className="font-semibold text-small flex items-center gap-2">
          {icon}
          {titre}
        </p>
        {liste.map(a => (
          <div key={a.id} className={`card p-3 border-l-4 ${groupColor(a.joursRestants)}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${a.joursRestants < 30 ? 'danger' : a.joursRestants < 60 ? 'warning' : 'neutral'}`}>
                    {a.joursRestants}j
                  </span>
                  <span className="font-medium text-small">{a.inspecteur}</span>
                </div>
                <p className="text-xs text-muted-foreground">{a.typeFormation}</p>
                <p className="text-xs text-muted-foreground">Expiration: {a.dateExpiration}</p>
              </div>
              <button
                className="btn btn-secondary btn-sm shrink-0"
                onClick={() => setPlanifier({ alerte: a, datePrevue: '', organisme: '' })}
              >
                Planifier
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        {renderGroupe(rouge, 'Urgent — moins de 30 jours', <AlertTriangle className="h-4 w-4 text-danger" />)}
        {renderGroupe(orange, 'Prioritaire — 30 à 60 jours', <AlertTriangle className="h-4 w-4 text-warning" />)}
        {renderGroupe(jaune, 'À surveiller — 60 à 90 jours', <Calendar className="h-4 w-4 text-role-primary" />)}
      </div>

      {/* Modal de planification */}
      {planifier && (
        <div className="modal-overlay" data-role={userRole} onClick={() => setPlanifier(null)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Calendar className="w-5 h-5 text-role-primary" />
                Planifier la formation
              </div>
              <button className="modal-close" onClick={() => setPlanifier(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <p className="text-small">
                <span className="font-medium">{planifier.alerte.inspecteur}</span> — {planifier.alerte.typeFormation}
              </p>
              <div className="form-field">
                <label className="filter-label">Date prévue</label>
                <input
                  type="date"
                  value={planifier.datePrevue}
                  onChange={e => setPlanifier(p => p ? { ...p, datePrevue: e.target.value } : p)}
                  className={`form-input w-full ${focusClass}`}
                />
              </div>
              <div className="form-field">
                <label className="filter-label">Organisme de formation</label>
                <input
                  type="text"
                  placeholder="Ex: ASECNA, CEAC, organisme agréé..."
                  value={planifier.organisme}
                  onChange={e => setPlanifier(p => p ? { ...p, organisme: e.target.value } : p)}
                  className={`form-input w-full ${focusClass}`}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPlanifier(null)}>Annuler</button>
              <button
                className="btn btn-primary"
                onClick={confirmer}
                disabled={!planifier.datePrevue || !planifier.organisme}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default EcheanceAlert