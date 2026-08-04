// components/modules/formation/CompetenceMatrix.tsx
'use client'

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { DataTable } from '@/components/ui/DataTable'

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat'
}
const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

function cellColor(niveau: number): string {
  if (niveau >= 5) return 'bg-success text-white'
  if (niveau >= 4) return 'bg-primary text-white'
  if (niveau >= 3) return 'bg-warning text-white'
  if (niveau >= 2) return 'bg-warning/70 text-foreground'
  return 'bg-muted text-muted-foreground'
}

function moyenne(arr: number[]): number {
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

interface Props { userRole: string }

export function CompetenceMatrix({ userRole }: Props) {
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const [filtre, setFiltre] = useState('tous')

  const { domaines, niveauxParInsp } = useMemo(() => {
    const domainesSet = new Set<string>()
    const map: Record<string, Record<string, number>> = {}
    inspecteurs.filter(i => !i.deleted_at).forEach(ins => {
      map[ins.id] = {}
      ;(ins.competences || []).forEach(c => {
        domainesSet.add(c.domaine)
        map[ins.id][c.domaine] = typeof c.niveau === 'number' ? c.niveau : parseInt(c.niveau as any) || 1
      })
    })
    return { domaines: Array.from(domainesSet).sort(), niveauxParInsp: map }
  }, [inspecteurs])

  const actifs = inspecteurs.filter(i => !i.deleted_at)
  const lignes = filtre === 'tous' ? actifs : actifs.filter(i => i.id === filtre)
  const moyennesEquipe = domaines.map(d => moyenne(actifs.map(i => niveauxParInsp[i.id]?.[d] || 0)))

  return (
    <div className="space-y-4 animate-fade-up" data-role={userRole}>
      <div className="flex flex-wrap items-center gap-3">
        <select value={filtre} onChange={e => setFiltre(e.target.value)}
          className={`form-select ${focusClass}`} style={selectStyle}>
          <option value="tous">Tous les inspecteurs</option>
          {actifs.map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
        </select>
        <div className="flex items-center gap-2 text-xs ml-auto flex-wrap">
          {[{ n: 5, label: 'Expert', c: 'bg-success' }, { n: 4, label: 'Avancé', c: 'bg-primary' }, { n: 3, label: 'Intermédiaire', c: 'bg-warning' }, { n: 2, label: 'Débutant', c: 'bg-warning/70' }, { n: 1, label: 'Novice', c: 'bg-muted' }].map(l => (
            <span key={l.n} className="flex items-center gap-1"><span className={`w-3 h-3 rounded-full ${l.c} inline-block`} />{l.n} — {l.label}</span>
          ))}
        </div>
      </div>
      <DataTable
        data={filtre === 'tous' ? [...lignes, { _isAverage: true, _nom: 'Équipe (moy.)', _scores: Object.fromEntries(domaines.map((d, di) => [d, moyennesEquipe[di]])), id: '__average__' }] : lignes}
        columns={[
          { key: 'inspecteur', header: 'Inspecteur', headerClassName: 'min-w-36', render: (item: any) => (
            <span className={item._isAverage ? 'text-muted-foreground font-semibold' : 'font-medium whitespace-nowrap'}>
              {item._isAverage ? item._nom : `${item.prenom} ${item.nom}`}
            </span>
          )},
          ...domaines.map(d => ({
            key: d,
            header: d,
            headerClassName: 'text-center',
            className: 'text-center',
            render: (item: any) => {
              const n = item._isAverage ? item._scores[d] : (niveauxParInsp[item.id]?.[d] || 0)
              return <span className={`inline-flex w-8 h-8 rounded-full items-center justify-center text-xs font-bold ${cellColor(n)}`}>{n}</span>
            },
          })),
        ]}
        keyExtractor={(item) => item.id}
        headerClassName="bg-role-primary-soft"
      />
    </div>
  )
}

export default CompetenceMatrix