// components/modules/profil-risque/OACIMatrixSection.tsx
// OACI 5×5 risk matrix — maps ecarts to cells, shows counts, lists per cell, summary stats

'use client'

import { ProfilRisque, Ecart } from '@/lib/store'
import { Target } from 'lucide-react'

interface OACIMatrixSectionProps {
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: any[]
}

const PROBABILITIES = [5, 4, 3, 2, 1] as const
const GRAVITIES = ['A', 'B', 'C', 'D', 'E'] as const

type Gravite = typeof GRAVITIES[number]
type CellKey = `${number}${Gravite}`

interface CellMeta {
  key: CellKey
  prob: number
  grav: Gravite
  label: string
  color: string
  bgClass: string
  textClass: string
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible' | 'tres_faible'
}

function getCellMeta(prob: number, grav: Gravite): CellMeta {
  const key = `${prob}${grav}` as CellKey
  const label = `${prob}${grav}`

  // Matrice OACI 5×5 standard
  // Rouge: 5A, 5B, 4A, 3A
  if ((prob === 5 && (grav === 'A' || grav === 'B')) || (prob === 4 && grav === 'A') || (prob === 3 && grav === 'A')) {
    return { key, prob, grav, label, color: 'var(--color-danger)', bgClass: 'bg-danger', textClass: 'text-white', niveau: 'critique' }
  }
  // Orange: 4B, 3B, 5C, 2A
  if ((prob === 4 && grav === 'B') || (prob === 3 && grav === 'B') || (prob === 5 && grav === 'C') || (prob === 2 && grav === 'A')) {
    return { key, prob, grav, label, color: 'var(--color-warning)', bgClass: 'bg-warning', textClass: 'text-white', niveau: 'eleve' }
  }
  // Jaune: 5D, 4C, 3C, 2B, 1A
  if ((prob === 5 && grav === 'D') || (prob === 4 && grav === 'C') || (prob === 3 && grav === 'C') || (prob === 2 && grav === 'B') || (prob === 1 && grav === 'A')) {
    return { key, prob, grav, label, color: 'var(--color-neutral)', bgClass: 'bg-muted', textClass: 'text-foreground', niveau: 'moyen' }
  }
  // Vert: 5E, 4D, 3D, 2C, 1B
  if ((prob === 5 && grav === 'E') || (prob === 4 && grav === 'D') || (prob === 3 && grav === 'D') || (prob === 2 && grav === 'C') || (prob === 1 && grav === 'B')) {
    return { key, prob, grav, label, color: 'var(--color-success)', bgClass: 'bg-success', textClass: 'text-white', niveau: 'faible' }
  }
  // Bleu: 4E, 3E, 2D, 2E, 1C, 1D, 1E
  return { key, prob, grav, label, color: 'var(--color-primary)', bgClass: 'bg-primary', textClass: 'text-white', niveau: 'tres_faible' }
}

function resolveCellKey(ecart: Ecart): CellKey | null {
  if (ecart.cellule_risque_oaci && /^[1-5][A-E]$/.test(ecart.cellule_risque_oaci)) {
    return ecart.cellule_risque_oaci as CellKey
  }
  if (ecart.probabilite_risque && ecart.gravite_risque) {
    return `${ecart.probabilite_risque}${ecart.gravite_risque}` as CellKey
  }
  return null
}

function deriveCellKeyFromProfil(profil: ProfilRisque): CellKey | null {
  const prob = Math.max(1, Math.min(5, 5 - Math.floor(profil.score_global / 20)))
  // Map C5 (0-25) to gravity A (0-5) to E (20-25)
  let grav: Gravite = 'C'
  const c5 = profil.c5 ?? 0
  if (c5 <= 5) grav = 'E'
  else if (c5 <= 10) grav = 'D'
  else if (c5 <= 15) grav = 'C'
  else if (c5 <= 20) grav = 'B'
  else grav = 'A'
  return `${prob}${grav}` as CellKey
}

function getNiveauLabel(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'Critique'
    case 'eleve': return 'Élevé'
    case 'moyen': return 'Moyen'
    case 'faible': return 'Faible'
    case 'tres_faible': return 'Très faible'
    default: return niveau
  }
}

function getNiveauBadgeClass(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'risk-badge critique'
    case 'eleve': return 'risk-badge eleve'
    case 'moyen': return 'risk-badge moyen'
    case 'faible': return 'risk-badge faible'
    case 'tres_faible': return 'badge neutral'
    default: return 'badge neutral'
  }
}

export function OACIMatrixSection({ profil, ecarts, surveillances }: OACIMatrixSectionProps) {
  // Build lookup: cellKey → Ecart[]
  const cellMap = new Map<CellKey, Ecart[]>()
  for (const ecart of ecarts) {
    const key = resolveCellKey(ecart)
    if (key) {
      const existing = cellMap.get(key) || []
      existing.push(ecart)
      cellMap.set(key, existing)
    }
  }

  // If no ecarts have OACI data, derive a single cell from profil
  const hasAnyOaciData = cellMap.size > 0
  const derivedCell = !hasAnyOaciData ? deriveCellKeyFromProfil(profil) : null

  // Count per level
  const levelCounts: Record<string, number> = { critique: 0, eleve: 0, moyen: 0, faible: 0, tres_faible: 0 }
  if (hasAnyOaciData) {
    for (const [key, ecs] of cellMap.entries()) {
      const prob = parseInt(key[0])
      const grav = key[1] as Gravite
      const meta = getCellMeta(prob, grav)
      levelCounts[meta.niveau] += ecs.length
    }
  } else if (derivedCell) {
    const prob = parseInt(derivedCell[0])
    const grav = derivedCell[1] as Gravite
    const meta = getCellMeta(prob, grav)
    levelCounts[meta.niveau] += 1
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-3">
        {(['critique', 'eleve', 'moyen', 'faible', 'tres_faible'] as const).map((niveau) => {
          let color = 'var(--color-primary)'
          if (niveau === 'critique') color = 'var(--color-danger)'
          else if (niveau === 'eleve') color = 'var(--color-warning)'
          else if (niveau === 'moyen') color = 'var(--color-neutral)'
          else if (niveau === 'faible') color = 'var(--color-success)'
          return (
            <div
              key={niveau}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card shadow-sm"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-medium text-muted-foreground">
                {getNiveauLabel(niveau)}
              </span>
              <span className="text-sm font-bold text-foreground">
                {levelCounts[niveau]}
              </span>
            </div>
          )
        })}
        {!hasAnyOaciData && (
          <div className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground">
            <Target className="w-3 h-3" />
            Données OACI non renseignées — position estimée depuis le score global (C1-C5)
          </div>
        )}
      </div>

      {/* OACI 5×5 Grid */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Target className="w-4 h-4 text-danger" />
            Matrice OACI 5×5
          </h3>
        </div>
        <div className="card-content overflow-x-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="p-2 text-muted-foreground font-medium w-16">Prob. ↓ / Grav. →</th>
                {GRAVITIES.map((g) => (
                  <th key={g} className="p-2 text-muted-foreground font-bold text-sm">
                    {g}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {g === 'A' ? 'Catastrophique' : g === 'B' ? 'Dangereux' : g === 'C' ? 'Majeur' : g === 'D' ? 'Significatif' : 'Négligeable'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROBABILITIES.map((prob) => (
                <tr key={prob}>
                  <td className="p-2 text-muted-foreground font-bold text-sm">
                    {prob}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {prob === 5 ? 'Fréquent' : prob === 4 ? 'Occasionnel' : prob === 3 ? 'Rare' : prob === 2 ? 'Très rare' : 'Exceptionnel'}
                    </div>
                  </td>
                  {GRAVITIES.map((grav) => {
                    const cellMeta = getCellMeta(prob, grav)
                    const ecs = cellMap.get(cellMeta.key) || []
                    const count = ecs.length
                    const isDerived = !hasAnyOaciData && derivedCell === cellMeta.key

                    return (
                      <td key={grav} className="p-0 align-middle">
                        <div
                          className="relative m-1 min-w-[60px] min-h-[60px] rounded-md flex flex-col items-center justify-center"
                          style={{ backgroundColor: cellMeta.color }}
                        >
                          <span className="text-[10px] font-bold text-white/80">{cellMeta.label}</span>
                          {count > 0 && (
                            <span className="text-lg font-bold text-white">{count}</span>
                          )}
                          {count === 0 && !isDerived && (
                            <span className="text-sm text-white/50">-</span>
                          )}
                          {isDerived && derivedCell === cellMeta.key && (
                            <div className="flex flex-col items-center">
                              <span className="text-lg font-bold text-white">★</span>
                              <span className="text-[9px] text-white/80">estimé</span>
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border px-2">
            {(['critique', 'eleve', 'moyen', 'faible', 'tres_faible'] as const).map((niveau) => {
              const sampleMeta = getCellMeta(
                niveau === 'critique' ? 5 : niveau === 'eleve' ? 4 : niveau === 'moyen' ? 5 : niveau === 'faible' ? 4 : 4,
                niveau === 'critique' ? 'A' : niveau === 'eleve' ? 'B' : niveau === 'moyen' ? 'D' : niveau === 'faible' ? 'D' : 'E'
              )
              return (
                <div key={niveau} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: sampleMeta.color }} />
                  {getNiveauLabel(niveau)}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Ecarts grouped by OACI cell */}
      {hasAnyOaciData && cellMap.size > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4" />
            Écarts par cellule OACI
          </h4>
          {[...cellMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cellKey, ecs]) => {
              const prob = parseInt(cellKey[0])
              const grav = cellKey[1] as Gravite
              const meta = getCellMeta(prob, grav)
              return (
                <div key={cellKey} className="card">
                  <div className="card-header py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        {cellKey}
                      </div>
                      <span className={`${getNiveauBadgeClass(meta.niveau)} text-xs`}>
                        {getNiveauLabel(meta.niveau)}
                      </span>
                      <span className="text-xs text-muted-foreground">{ecs.length} écart{ecs.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="card-content py-2">
                    <ul className="space-y-1.5">
                      {ecs.map((ecart) => (
                        <li key={ecart.id} className="text-xs">
                          <span className="font-mono text-muted-foreground">{ecart.reference}</span>
                          <span className="mx-1.5 text-muted-foreground">—</span>
                          <span className="text-muted-foreground">{ecart.libelle}</span>
                          {ecart.domaine && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground text-[10px]">
                              {ecart.domaine}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* Fallback: show profil-derived OACI cell when no ecart data */}
      {!hasAnyOaciData && derivedCell && (
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">Position OACI estimée</h4>
          </div>
          <div className="card-content">
            <p className="text-sm text-muted-foreground">
              Aucun écart ne renseigne sa cellule OACI. La position ci-dessous est estimée depuis le score global (C1-C5) du profil.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).color }}
              >
                {derivedCell}
              </div>
              <span className={getNiveauBadgeClass(getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).niveau)}>
                {getNiveauLabel(getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).niveau)}
              </span>
              <span className="text-xs text-muted-foreground">
                (P={derivedCell[0]} = {getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 5 ? 'Fréquent' : getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 4 ? 'Occasionnel' : getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 3 ? 'Rare' : getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 2 ? 'Très rare' : 'Exceptionnel'}, G={derivedCell[1]})
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
