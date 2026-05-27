// components/modules/formation/CompetenceMatrix.tsx
'use client'

import { useState } from 'react'

const DOMAINES = ['SGS', 'SLI', 'PHY', 'OPS', 'ANI', 'MET', 'AIS', 'COM']

const INSPECTEURS = [
  { id: 'insp-1', nom: 'Moussa Diallo', niveaux: [5, 4, 3, 5, 4, 3, 2, 3] },
  { id: 'insp-2', nom: 'Fatou Ndiaye', niveaux: [3, 5, 4, 3, 5, 2, 4, 3] },
  { id: 'insp-3', nom: 'Ibrahima Sow', niveaux: [4, 3, 5, 4, 3, 5, 3, 4] },
  { id: 'insp-4', nom: 'Aminata Balde', niveaux: [2, 4, 3, 5, 4, 3, 5, 2] },
  { id: 'insp-5', nom: 'Oumar Thiam', niveaux: [5, 3, 4, 2, 5, 4, 3, 5] },
  { id: 'insp-6', nom: 'Khady Diouf', niveaux: [3, 2, 5, 4, 2, 5, 4, 3] },
  { id: 'insp-7', nom: 'Mamadou Cissé', niveaux: [4, 5, 2, 3, 4, 3, 5, 4] },
]

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

function cellColor(niveau: number): string {
  if (niveau === 5) return 'bg-success text-white'
  if (niveau === 4) return 'bg-primary text-white'
  if (niveau === 3) return 'bg-warning text-white'
  if (niveau === 2) return 'bg-warning/70 text-foreground'
  return 'bg-muted text-muted-foreground'
}

function moyenne(arr: number[]): number {
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

interface Props {
  userRole: string
}

export function CompetenceMatrix({ userRole }: Props) {
  const [filtre, setFiltre] = useState('tous')

  const lignes = filtre === 'tous'
    ? INSPECTEURS
    : INSPECTEURS.filter(i => i.id === filtre)

  const moyennesEquipe = DOMAINES.map((_, di) =>
    moyenne(INSPECTEURS.map(i => i.niveaux[di]))
  )

  return (
    <div className="space-y-4 animate-fade-up" data-role={userRole}>
      <div className="flex flex-wrap items-center gap-3">
        <select 
          value={filtre} 
          onChange={(e) => setFiltre(e.target.value)}
          className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
          style={selectStyle}
        >
          <option value="tous">Tous les inspecteurs</option>
          {INSPECTEURS.map(i => (
            <option key={i.id} value={i.id}>{i.nom}</option>
          ))}
        </select>

        <div className="flex items-center gap-3 text-xs ml-auto flex-wrap">
          {[
            { niveau: 5, label: 'Expert', color: 'bg-success' },
            { niveau: 4, label: 'Avancé', color: 'bg-primary' },
            { niveau: 3, label: 'Intermédiaire', color: 'bg-warning' },
            { niveau: 2, label: 'Débutant', color: 'bg-warning/70' },
            { niveau: 1, label: 'Novice', color: 'bg-muted' },
          ].map(l => (
            <span key={l.niveau} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded-full ${l.color} inline-block`} />
              {l.niveau} — {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="table-container overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr className="bg-role-primary-soft">
              <th className="text-left px-3 py-2 border border-border min-w-36">Inspecteur</th>
              {DOMAINES.map(d => (
                <th key={d} className="px-3 py-2 border border-border text-center w-16">{d}</th>
              ))}
             </tr>
          </thead>
          <tbody>
            {lignes.map(insp => (
              <tr key={insp.id} className="hover:bg-role-primary-soft transition-colors">
                <td className="px-3 py-2 border border-border font-medium whitespace-nowrap">{insp.nom}</td>
                {insp.niveaux.map((n, di) => (
                  <td key={di} className="border border-border p-1 text-center">
                    <span className={`inline-flex w-8 h-8 rounded-full items-center justify-center text-xs font-bold ${cellColor(n)}`}>
                      {n}
                    </span>
                  </td>
                ))}
              </tr>
            ))}

            {filtre === 'tous' && (
              <tr className="bg-role-primary-soft/50 font-semibold">
                <td className="px-3 py-2 border border-border text-muted-foreground">Équipe (moy.)</td>
                {moyennesEquipe.map((m, di) => (
                  <td key={di} className="border border-border p-1 text-center">
                    <span className={`inline-flex w-8 h-8 rounded-full items-center justify-center text-xs font-bold ${cellColor(m)}`}>
                      {m}
                    </span>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default CompetenceMatrix