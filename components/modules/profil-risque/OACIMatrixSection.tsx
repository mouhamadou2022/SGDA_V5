// components/modules/profil-risque/OACIMatrixSection.tsx
// OACI 5×5 risk matrix — maps ecarts to cells, shows counts, lists per cell, summary stats

'use client'

import { useMemo } from 'react'
import { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { getRiskLevelFromCell5, computeICaoMatrix, getICaoLabels } from '@/lib/risque'
import { Target, Sparkles } from 'lucide-react'

interface OACIMatrixSectionProps {
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: any[]
  evenements?: EvenementSecurite[]
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

const NIVEAU_CONFIG: Record<string, { color: string; bgClass: string; textClass: string }> = {
  critique: { color: 'var(--color-danger)', bgClass: 'bg-danger', textClass: 'text-white' },
  eleve: { color: 'var(--color-warning)', bgClass: 'bg-warning', textClass: 'text-white' },
  moyen: { color: 'var(--color-neutral)', bgClass: 'bg-muted', textClass: 'text-foreground' },
  faible: { color: 'var(--color-success)', bgClass: 'bg-success', textClass: 'text-white' },
  tres_faible: { color: 'var(--color-primary)', bgClass: 'bg-primary', textClass: 'text-white' },
}

function getCellMeta(prob: number, grav: Gravite): CellMeta {
  const key = `${prob}${grav}` as CellKey
  const label = `${prob}${grav}`
  const niveau = getRiskLevelFromCell5(key)
  const cfg = NIVEAU_CONFIG[niveau] || NIVEAU_CONFIG.tres_faible
  return { key, prob, grav, label, ...cfg, niveau: niveau as CellMeta['niveau'] }
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
  const labels: Record<string, string> = {
    critique: 'Critique', eleve: 'Élevé', moyen: 'Moyen',
    faible: 'Faible', tres_faible: 'Très faible',
  }
  return labels[niveau] || niveau
}

function getNiveauBadgeClass(niveau: string): string {
  const classes: Record<string, string> = {
    critique: 'risk-badge critique', eleve: 'risk-badge eleve',
    moyen: 'risk-badge moyen', faible: 'risk-badge faible',
    tres_faible: 'badge neutral',
  }
  return classes[niveau] || 'badge neutral'
}

function getNiveauColor(n: string): string {
  switch (n) {
    case 'critique': return 'var(--color-danger)'
    case 'eleve': return 'var(--color-warning)'
    case 'moyen': return 'var(--color-primary)'
    case 'faible': return 'var(--color-success)'
    default: return 'var(--color-neutral)'
  }
}

const NIVEAU_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  critique: { label: 'Critique', color: 'danger', bg: 'bg-danger' },
  eleve: { label: 'Élevé', color: 'warning', bg: 'bg-warning' },
  moyen: { label: 'Moyen', color: 'primary', bg: 'bg-primary' },
  faible: { label: 'Faible', color: 'success', bg: 'bg-success' },
}

const PROBA_LABELS: Record<string, string> = {
  frequente: 'Fréquente', probable: 'Probable', occasionnelle: 'Occasionnelle',
  improbable: 'Improbable', tres_improbable: 'Très improbable',
}

const SEV_LABELS: Record<string, string> = {
  catastrophique: 'Catastrophique', critique: 'Critique', majeur: 'Majeur',
  mineur: 'Mineur', negligeable: 'Négligeable',
}

export function OACIMatrixSection({ profil, ecarts, surveillances, evenements }: OACIMatrixSectionProps) {
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

  // ICAO dynamic matrix from evenements
  const icaoMatrix = useMemo(() => {
    if (!evenements || evenements.length === 0) return null
    return computeICaoMatrix(evenements)
  }, [evenements])
  const icaoLabels = useMemo(() => getICaoLabels(), [])

  return (
    <div className="space-y-5">
      {/* ICAO dynamic matrix card */}
      {icaoMatrix && icaoMatrix.size > 0 && (
        <Card variant="role" title="Matrice risque ICAO dynamique (Doc 9859)" icon={<Sparkles className="w-4 h-4" />}>
          <p className="text-xs text-foreground mb-3">Calculée automatiquement à partir de la fréquence et gravité observées des événements de sécurité.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-foreground font-medium text-left">Type d'événement</th>
                  <th className="p-2 text-foreground font-medium">Fréq./an</th>
                  <th className="p-2 text-foreground font-medium">Probabilité</th>
                  <th className="p-2 text-foreground font-medium">Grav. moy.</th>
                  <th className="p-2 text-foreground font-medium">Sévérité</th>
                  <th className="p-2 text-foreground font-medium">Niveau risque</th>
                  <th className="p-2 text-foreground font-medium">Nb</th>
                </tr>
              </thead>
              <tbody>
                {[...icaoMatrix.entries()].map(([type, cell]) => {
                  const nivCfg = NIVEAU_LABELS[cell.niveau] || NIVEAU_LABELS.faible
                  return (
                    <tr key={type} className="border-b border-border/50">
                      <td className="p-2 text-left text-foreground font-medium">{type.replace(/_/g, ' ')}</td>
                      <td className="p-2 text-foreground">{cell.freqObservee}</td>
                      <td className="p-2 text-foreground">{PROBA_LABELS[cell.probabilite] || cell.probabilite}</td>
                      <td className="p-2 text-foreground">{cell.graviteMoyenne}</td>
                      <td className="p-2 text-foreground">{SEV_LABELS[cell.severite] || cell.severite}</td>
                      <td className="p-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white ${nivCfg.bg}`}>{nivCfg.label}</span>
                      </td>
                      <td className="p-2 text-foreground">{cell.nbEvenements}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Légende */}
          <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-border">
            {icaoLabels.niveaux.map((n: { value: string; label: string; color: string }) => (
              <div key={n.value} className="flex items-center gap-1.5 text-xs text-foreground">
                <div className={`w-3 h-3 rounded ${n.color === 'danger' ? 'bg-danger' : n.color === 'warning' ? 'bg-warning' : n.color === 'primary' ? 'bg-primary' : 'bg-success'}`} />
                {n.label}
              </div>
            ))}
          </div>
        </Card>
      )}

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
              <span className="text-xs font-medium text-foreground">
                {getNiveauLabel(niveau)}
              </span>
              <span className="text-sm font-bold text-foreground">
                {levelCounts[niveau]}
              </span>
            </div>
          )
        })}
        {!hasAnyOaciData && (
          <div className="flex items-center gap-1 px-3 py-2 text-xs text-foreground">
            <Target className="w-3 h-3" />
            Données OACI non renseignées — position estimée depuis le score global (C1-C5)
          </div>
        )}
      </div>

      {/* OACI 5×5 Grid */}
      <Card variant="role" title="Matrice OACI 5×5" icon={<Target className="w-4 h-4" />}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="p-2 text-foreground font-medium w-16">Prob. ↓ / Grav. →</th>
                {GRAVITIES.map((g) => (
                  <th key={g} className="p-2 text-foreground font-bold text-sm">
                    {g}
                    <div className="text-[10px] font-normal text-foreground">
                      {g === 'A' ? 'Catastrophique' : g === 'B' ? 'Dangereux' : g === 'C' ? 'Majeur' : g === 'D' ? 'Mineur' : 'Négligeable'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROBABILITIES.map((prob) => (
                <tr key={prob}>
                  <td className="p-2 text-foreground font-bold text-sm">
                    {prob}
                    <div className="text-[10px] font-normal text-foreground">
                      {prob === 5 ? 'Fréquent' : prob === 4 ? 'Occasionnel' : prob === 3 ? 'Faible' : prob === 2 ? 'Improbable' : 'Extrêmement improbable'}
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
                <div key={niveau} className="flex items-center gap-1.5 text-xs text-foreground">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: sampleMeta.color }} />
                  {getNiveauLabel(niveau)}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Ecarts grouped by OACI cell */}
      {hasAnyOaciData && cellMap.size > 0 && (
        <div className="space-y-4">
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
                <Card key={cellKey} heading={<div className="flex items-center gap-2"><div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: meta.color }}>{cellKey}</div><span className={`${getNiveauBadgeClass(meta.niveau)} text-xs`}>{getNiveauLabel(meta.niveau)}</span><span className="text-xs text-foreground">{ecs.length} écart{ecs.length > 1 ? 's' : ''}</span></div>}>
                  <ul className="space-y-1.5">
                    {ecs.map((ecart) => (
                      <li key={ecart.id} className="text-xs">
                        <span className="font-mono text-foreground">{ecart.reference}</span>
                        <span className="mx-1.5 text-foreground">—</span>
                        <span className="text-foreground">{ecart.libelle}</span>
                        {ecart.domaine && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-muted/30 text-foreground text-[10px]">
                            {ecart.domaine}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
        </div>
      )}

      {/* Fallback: show profil-derived OACI cell when no ecart data */}
      {!hasAnyOaciData && derivedCell && (
        <Card heading="Position OACI estimée">
          <p className="text-sm text-foreground">
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
            <span className="text-xs text-foreground">
              (P={derivedCell[0]} = {getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 5 ? 'Fréquent' : getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 4 ? 'Occasionnel' : getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 3 ? 'Faible' : getCellMeta(parseInt(derivedCell[0]), derivedCell[1] as Gravite).prob === 2 ? 'Improbable' : 'Extrêmement improbable'}, G={derivedCell[1]})
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
