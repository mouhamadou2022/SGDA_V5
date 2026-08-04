// components/modules/ml-monitoring/DigitalTwinCard.tsx
// Carte 8 — Jumeau numérique interactif : levier par levier, l'utilisateur
// modifie les critères et les actions correctives, le moteur recalcule en
// temps réel l'état projeté (score, niveaux, maturité, scénarios, trajectoire)
// et la propagation des écarts dans le graphe de risque.
// Strictement additif : n'écrit aucune donnée, lit uniquement les moteurs
// existants (calculateGlobalScore, generateAllScenarios, createRiskGraph).

'use client'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import {
  Boxes, RotateCcw, AlertTriangle, TrendingUp, TrendingDown, Minus, Network, Zap, Shield, Sparkles,
} from 'lucide-react'
import { useAppStore, type Ecart, type ProfilRisque, type Surveillance } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { RISK_LEVELS } from '@/lib/risque'
import {
  leviersParDefaut, simulerJumeauNumerique, construireProjection,
  compterEcartsOuverts, type LeviersJumeau,
} from '@/lib/ia/digitalTwin'
import { createRiskGraph, calculateRiskPropagation } from '@/lib/risque/graphNetwork'

interface Props {
  profil: ProfilRisque | null
  ecarts: Ecart[]
  surveillances: Surveillance[]
  aerodromeNom?: string
}

const CRITERE_LABELS: Array<{ key: keyof LeviersJumeau; label: string }> = [
  { key: 'c1', label: 'C1 — Maturité & culture SGS' },
  { key: 'c2', label: 'C2 — Efficacité PAC' },
  { key: 'c3', label: 'C3 — Conformité technique' },
  { key: 'c4', label: 'C4 — Charge critique' },
  { key: 'c5', label: 'C5 — Résilience' },
]

const NIVEAU_COLOR: Record<string, string> = {
  FAIBLE: 'text-success', MOYEN: 'text-primary', ELEVE: 'text-warning', CRITIQUE: 'text-danger',
}

const SCENARIO_META: Record<string, { label: string; badge: string; icon: string; cls: string }> = {
  optimiste: { label: 'Optimiste', badge: 'success', icon: '🌟', cls: 'border-green-200 bg-green-50' },
  realiste: { label: 'Réaliste', badge: 'primary', icon: '📊', cls: 'border-blue-200 bg-blue-50' },
  pessimiste: { label: 'Pessimiste', badge: 'warning', icon: '⚠️', cls: 'border-orange-200 bg-orange-50' },
  catastrophe: { label: 'Catastrophe', badge: 'danger', icon: '🔴', cls: 'border-red-200 bg-red-50' },
}

export default function DigitalTwinCard({ profil, ecarts, surveillances, aerodromeNom }: Props) {
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome)
  const [leviers, setLeviers] = useState<LeviersJumeau | null>(() => (profil ? leviersParDefaut(profil) : null))
  const [selectedEcartId, setSelectedEcartId] = useState<string | null>(null)

  const historique = useMemo(
    () => (profil ? getHistoricalScoresForAerodrome(profil.aerodrome_id) : []),
    [profil, getHistoricalScoresForAerodrome],
  )

  const etat = useMemo(
    () => (profil && leviers ? simulerJumeauNumerique({ profil, ecarts, historique, leviers }) : null),
    [profil, ecarts, historique, leviers],
  )

  const projection = useMemo(
    () => (etat ? construireProjection({ historique, etat, horizon: leviers?.horizon ?? 6 }) : []),
    [historique, etat, leviers?.horizon],
  )

  const { critiques: nbCritiques } = useMemo(() => compterEcartsOuverts(ecarts), [ecarts])

  const graph = useMemo(() => {
    if (!profil) return null
    const domaineMap = new Map<string, number>()
    ecarts.forEach(e => {
      if (!e.domaine) return
      domaineMap.set(e.domaine, (domaineMap.get(e.domaine) ?? 0) + 1)
    })
    const domaines = Array.from(domaineMap.entries()).map(([code, count]) => ({
      code, score: Math.max(40, 100 - count * 12),
    }))
    return createRiskGraph({
      aerodromes: [{ id: profil.aerodrome_id, score_risque: profil.score_global, type: 'aerodrome' }],
      domaines,
      ecarts: ecarts.map(e => ({ id: e.id, niveau_risque: e.niveau_risque, domaine: e.domaine, aerodrome_id: e.aerodrome_id })),
      surveillances: surveillances.map(s => ({ id: s.id, aerodrome_id: s.aerodrome_id, domaines: s.portee })),
    })
  }, [profil, ecarts, surveillances])

  const propagation = useMemo(() => {
    if (!graph || !selectedEcartId) return null
    return calculateRiskPropagation(graph, `ecart_${selectedEcartId}`, 3)
  }, [graph, selectedEcartId])

  const setLevier = (patch: Partial<LeviersJumeau>) => setLeviers(l => (l ? { ...l, ...patch } : l))
  const reset = () => setLeviers(profil ? leviersParDefaut(profil) : null)

  if (!profil || !leviers || !etat) {
    return (
      <Card icon={<Boxes className="h-4 w-4 text-role-primary" />} title="8. Jumeau numérique interactif">
        <p className="text-sm text-muted text-center py-8">Complétez un profil de risque pour activer le jumeau numérique de l&apos;aérodrome.</p>
      </Card>
    )
  }

  const delta = etat.delta
  const scenarioCards = etat.scenarios.map(s => ({
    ...s,
    meta: SCENARIO_META[s.nom] ?? { label: s.nom, badge: 'neutral', short: s.nom },
  }))

  return (
    <Card icon={<Boxes className="h-4 w-4 text-role-primary" />} title="8. Jumeau numérique interactif — AERORISQ" badge={
      <span className={`badge text-xs ${delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral'}`}>
        Physique {etat.scorePhysique} → Jumeau {etat.scoreJumeau} ({delta > 0 ? '+' : ''}{delta})
      </span>
    }>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm text-muted-foreground">
          {aerodromeNom ?? profil.aerodrome_id} — miroir interactif du système de risque : chaque levier recalcule instantanément le score projeté, les 4 scénarios et la trajectoire. Lecture seule, aucune donnée modifiée.
        </p>
        <button onClick={reset} className="btn btn-sm btn-secondary gap-1.5"><RotateCcw className="h-3.5 w-3.5" />Réinitialiser</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── LEVIERS ── */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-role-primary" />Leviers du jumeau</h4>

          <div className="space-y-2">
            {CRITERE_LABELS.map(({ key, label }) => {
              const base = leviers[key] as number
              const twin = etat.criteres[key as 'c1']
              const bonus = etat.bonus[key as 'c1']
              return (
                <div key={key} className="p-2.5 rounded-lg border border-border/60">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{profil[key as 'c1']}</span>
                      <span className="text-sm font-bold text-foreground w-6 text-right">{twin}</span>
                      {bonus > 0 && <span className="badge success text-[10px]">+{bonus}</span>}
                    </div>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={base}
                    onChange={e => setLevier({ [key]: Number(e.target.value) } as Partial<LeviersJumeau>)}
                    className="w-full h-1.5 cursor-pointer accent-role-primary"
                  />
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Horizon</label>
              <select value={leviers.horizon} onChange={e => setLevier({ horizon: Number(e.target.value) })} className="form-select text-sm w-full mt-1">
                <option value={3}>3 mois</option><option value={6}>6 mois</option><option value={12}>12 mois</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Facteurs aggravants</label>
              <select value={leviers.aggravators} onChange={e => setLevier({ aggravators: Number(e.target.value) })} className="form-select text-sm w-full mt-1">
                <option value={0}>Aucun</option><option value={1}>Normal</option><option value={2}>Élevés</option><option value={3}>Sévères</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
            <span className="text-xs text-foreground flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warning" />Cygne noir</span>
            <label className="form-toggle"><input type="checkbox" checked={leviers.blackSwan} onChange={e => setLevier({ blackSwan: e.target.checked })} /><span className="form-toggle-slider" /></label>
          </label>

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-role-primary" />Actions correctives simulées</p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">Traiter les écarts critiques ({nbCritiques})</span>
              <label className="form-toggle"><input type="checkbox" disabled={nbCritiques === 0} checked={leviers.fermerEcartsCritiques} onChange={e => setLevier({ fermerEcartsCritiques: e.target.checked })} /><span className="form-toggle-slider" /></label>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">Renforcer la surveillance</span>
              <label className="form-toggle"><input type="checkbox" checked={leviers.renforcerSurveillance} onChange={e => setLevier({ renforcerSurveillance: e.target.checked })} /><span className="form-toggle-slider" /></label>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground">Renforcer la formation (SGS)</span>
              <label className="form-toggle"><input type="checkbox" checked={leviers.renforcerFormation} onChange={e => setLevier({ renforcerFormation: e.target.checked })} /><span className="form-toggle-slider" /></label>
            </label>
          </div>
        </div>

        {/* ── RÉSULTATS ── */}
        <div className="lg:col-span-3 space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-role-primary" />État projeté du jumeau</h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Score physique</p>
              <p className={`text-xl font-bold ${NIVEAU_COLOR[etat.niveauPhysique]}`}>{etat.scorePhysique}</p>
              <p className="text-[10px] text-muted-foreground">{RISK_LEVELS[etat.niveauPhysique].label}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Score jumeau</p>
              <p className={`text-xl font-bold ${NIVEAU_COLOR[etat.niveauJumeau]}`}>{etat.scoreJumeau}</p>
              <p className="text-[10px] text-muted-foreground">{RISK_LEVELS[etat.niveauJumeau].label}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Écart projeté</p>
              <p className={`text-xl font-bold ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-foreground'}`}>
                {delta > 0 ? '+' : ''}{delta}
              </p>
              <p className="text-[10px] text-muted-foreground">{delta === 0 ? 'stable' : delta > 0 ? 'amélioration' : 'dégradation'}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Maturité SGS (C1)</p>
              <p className="text-lg font-bold text-role-primary">{etat.maturiteC1Jumeau}</p>
              <p className="text-[10px] text-muted-foreground">physique {etat.maturiteC1Physique}</p>
            </div>
          </div>

          {/* Trajectoire */}
          <div className="rounded-lg border border-border p-3">
            <h5 className="text-xs uppercase text-muted-foreground mb-2">Trajectoire — historique & projection {leviers.horizon} mois</h5>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={projection} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={etat.scorePhysique} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="historique" name="Historique" stroke="var(--muted-foreground)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="jumeau" name="Jumeau" stroke="var(--role-primary)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="optimiste" name="Optimiste" stroke="var(--success)" strokeDasharray="5 3" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="realiste" name="Réaliste" stroke="var(--primary)" strokeDasharray="5 3" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="pessimiste" name="Pessimiste" stroke="var(--warning)" strokeDasharray="5 3" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="catastrophe" name="Catastrophe" stroke="var(--danger)" strokeDasharray="5 3" strokeWidth={1.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Scénarios */}
          <div>
            <h5 className="text-xs uppercase text-muted-foreground mb-2">Scénarios what-if — {etat.scenarios.length} projections</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {scenarioCards.map(s => (
                <div key={s.nom} className={`rounded-lg border p-3 ${s.meta.cls}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{s.meta.icon} {s.meta.label}</span>
                    <span className={`badge text-xs ${s.meta.badge}`}>{s.probabilite}%</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{s.scoreProjecte}<span className="text-xs text-muted-foreground font-normal">/100</span></p>
                  <p className="text-[10px] text-muted-foreground">IC [{s.intervalleConfiance[0]} — {s.intervalleConfiance[1]}]</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── PROPAGATION DANS LE GRAPHE ── */}
      <div className="mt-6 pt-5 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm mb-2 flex items-center gap-1.5"><Network className="w-3.5 h-3.5 text-role-primary" />Propagation des écarts — {graph?.edges.length ?? 0} liens</h4>
          {ecarts.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Aucun écart pour explorer la propagation.</p>
          ) : (
            <>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {ecarts.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEcartId(e.id)}
                    className={`w-full text-left p-2 rounded-lg border text-xs ${selectedEcartId === e.id ? 'border-role-primary bg-role-primary-soft' : 'border-border hover:border-role-primary/40'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`badge text-[10px] ${e.niveau_risque === 'critique' ? 'danger' : e.niveau_risque === 'eleve' ? 'warning' : e.niveau_risque === 'moyen' ? 'primary' : 'neutral'}`}>{e.niveau_risque}</span>
                      <span className="text-foreground truncate">{e.domaine ?? 'aérodrome'} — {e.id}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Cliquez sur un écart pour tracer sa propagation dans le graphe.</p>
            </>
          )}
        </div>

        <div>
          <h4 className="text-sm mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-role-primary" />Impact de propagation</h4>
          {!propagation ? (
            <p className="text-sm text-muted text-center py-6">Sélectionnez un écart à gauche pour afficher son impact sur les domaines et l&apos;aérodrome.</p>
          ) : propagation.affectedNodes.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Cet écart n&apos;atteint aucun nœud — risque isolé.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {propagation.affectedNodes.map(n => (
                <div key={n.id} className="p-2 rounded-lg bg-muted/20 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground capitalize">{n.id.replace(/^ecart_|^dom_|^aero_/, '').replace(/_/g, ' ')}</span>
                    <span className={`font-bold ${n.impact >= 0.5 ? 'text-danger' : n.impact >= 0.3 ? 'text-warning' : 'text-primary'}`}>{Math.round(n.impact * 100)}%</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate">chemin : {n.path.map(p => p.split('_').slice(-1)[0]).join(' → ')}</p>
                </div>
              ))}
              {propagation.criticalPaths.length > 0 && (
                <p className="text-[10px] text-warning flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{propagation.criticalPaths.length} chemin(s) critique(s) détecté(s)</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interprétation */}
      <div className={`mt-5 rounded-lg p-3 text-sm ${delta > 0 ? 'bg-success-soft' : delta < 0 ? 'bg-danger-soft' : 'bg-muted/20'}`}>
        <div className="flex items-center gap-2 mb-1">
          {delta > 0 ? <TrendingUp className="w-4 h-4 text-success" /> : delta < 0 ? <TrendingDown className="w-4 h-4 text-danger" /> : <Minus className="w-4 h-4 text-foreground" />}
          <p className="font-medium text-foreground">Interprétation du jumeau</p>
        </div>
        <p className="text-foreground">
          {delta === 0
            ? 'Le jumeau reproduit l\'état actuel : aucun écart entre les leviers et la réalité.'
            : delta > 0
              ? `Le plan de levier simulé améliorerait le profil de ${etat.scorePhysique} à ${etat.scoreJumeau} (+${delta} pts) — niveau « ${RISK_LEVELS[etat.niveauJumeau].label} ».`
              : `Les leviers choisis dégraderaient le profil de ${etat.scorePhysique} à ${etat.scoreJumeau} (${delta} pts) — niveau « ${RISK_LEVELS[etat.niveauJumeau].label} ».`}{' '}
          Scénario catastrophe à {etat.scenarios[3].probabilite}% ({etat.scenarios[3].scoreProjecte}/100) en horizon {leviers.horizon} mois.
        </p>
      </div>
    </Card>
  )
}