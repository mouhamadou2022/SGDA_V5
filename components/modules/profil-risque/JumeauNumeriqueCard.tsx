// components/modules/profil-risque/JumeauNumeriqueCard.tsx
// Jumeau numérique interactif AERORISQ dans la vue exploitant.
// Miroir du système de risque : l'utilisateur active des actions correctives
// et choisit un horizon, le moteur lib/ia/digitalTwin.ts recalcule le score
// projeté, la maturité SGS, les 4 scénarios what-if et la trajectoire.
// Lecture seule — aucun workflow modifié.

'use client'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { Boxes, RotateCcw, Zap, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAppStore, type Ecart, type ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { RISK_LEVELS } from '@/lib/risque'
import {
  leviersParDefaut, simulerJumeauNumerique, construireProjection,
  compterEcartsOuverts, type LeviersJumeau,
} from '@/lib/ia/digitalTwin'

interface Props {
  profil: ProfilRisque
  ecarts: Ecart[]
}

const NIVEAU_COLOR: Record<string, string> = {
  FAIBLE: 'text-success', MOYEN: 'text-primary', ELEVE: 'text-warning', CRITIQUE: 'text-danger',
}

const SCENARIO_META: Record<string, { label: string; badge: string; cls: string }> = {
  optimiste: { label: 'Optimiste', badge: 'success', cls: 'border-green-200 bg-green-50' },
  realiste: { label: 'Réaliste', badge: 'primary', cls: 'border-blue-200 bg-blue-50' },
  pessimiste: { label: 'Pessimiste', badge: 'warning', cls: 'border-orange-200 bg-orange-50' },
  catastrophe: { label: 'Catastrophe', badge: 'danger', cls: 'border-red-200 bg-red-50' },
}

export default function JumeauNumeriqueCard({ profil, ecarts }: Props) {
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome)
  const [leviers, setLeviers] = useState<LeviersJumeau>(() => leviersParDefaut(profil))

  const historique = useMemo(
    () => getHistoricalScoresForAerodrome(profil.aerodrome_id),
    [profil.aerodrome_id, getHistoricalScoresForAerodrome],
  )

  const etat = useMemo(
    () => simulerJumeauNumerique({ profil, ecarts, historique, leviers }),
    [profil, ecarts, historique, leviers],
  )

  const projection = useMemo(
    () => construireProjection({ historique, etat, horizon: leviers.horizon }),
    [historique, etat, leviers.horizon],
  )

  const { critiques: nbCritiques } = useMemo(() => compterEcartsOuverts(ecarts), [ecarts])

  const setLevier = (patch: Partial<LeviersJumeau>) => setLeviers(l => ({ ...l, ...patch }))
  const reset = () => setLeviers(leviersParDefaut(profil))

  const delta = etat.delta

  return (
    <Card icon={<Boxes className="h-4 w-4 text-role-primary" />} title="Jumeau numérique AERORISQ — projection what-if" badge={
      <span className={`badge text-xs ${delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral'}`}>
        Physique {etat.scorePhysique} → Jumeau {etat.scoreJumeau} ({delta > 0 ? '+' : ''}{delta})
      </span>
    }>
      <p className="text-sm text-muted-foreground mb-4">
        Miroir interactif du système de risque : activez des actions correctives et choisissez un horizon pour projeter le score, la maturité SGS et les 4 scénarios what-if. Lecture seule — aucune donnée modifiée.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── LEVIERS ── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-role-primary" />Leviers & actions</h4>
            <button type="button" onClick={reset} className="btn btn-sm btn-secondary gap-1.5"><RotateCcw className="h-3 w-3" />Réinitialiser</button>
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

          <div className="rounded-lg border border-border p-3">
            <h5 className="text-xs uppercase text-muted-foreground mb-2">Trajectoire — historique & projection {leviers.horizon} mois</h5>
            <ResponsiveContainer width="100%" height={170}>
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

          <div>
            <h5 className="text-xs uppercase text-muted-foreground mb-2">Scénarios what-if — {etat.scenarios.length} projections</h5>
            <div className="grid grid-cols-2 gap-2">
              {etat.scenarios.map(s => {
                const meta = SCENARIO_META[s.nom] ?? { label: s.nom, badge: 'neutral', cls: 'border-border' }
                return (
                  <div key={s.nom} className={`rounded-lg border p-3 ${meta.cls}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{meta.label}</span>
                      <span className={`badge text-xs ${meta.badge}`}>{s.probabilite}%</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{s.scoreProjecte}<span className="text-xs text-muted-foreground font-normal">/100</span></p>
                    <p className="text-[10px] text-muted-foreground">IC [{s.intervalleConfiance[0]} — {s.intervalleConfiance[1]}]</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`rounded-lg p-3 text-sm ${delta > 0 ? 'bg-success-soft' : delta < 0 ? 'bg-danger-soft' : 'bg-muted/20'}`}>
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
              Scénario catastrophe à {etat.scenarios[3]?.probabilite ?? 0}% ({etat.scenarios[3]?.scoreProjecte ?? 0}/100) en horizon {leviers.horizon} mois.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
