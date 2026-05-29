// components/modules/profil-risque/AdvancedModelsDashboard.tsx
// Dashboard consolidé des modèles mathématiques avancés
// Survival, EVT, HMM, Negative Binomial, Copulas, Thompson Sampling

'use client'

import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Brain, Activity, TrendingUp, Shield, AlertTriangle,
  Clock, Target, Zap, BarChart3, Layers, TrendingDown,
  CheckCircle2, Info, ArrowRight, Calendar
} from 'lucide-react'

interface Props {
  aerodromeId: string
  userRole?: string
}

export default function AdvancedModelsDashboard({ aerodromeId, userRole = 'inspector' }: Props) {
  const profil = useAppStore(s => s.profilsRisque?.[aerodromeId])
  const allHistorique = useAppStore(s => s.historiqueScores)
  const allEvenements = useAppStore(s => s.evenements)
  const historique = useMemo(() => allHistorique?.[aerodromeId] || [], [allHistorique, aerodromeId])
  const evenements = useMemo(() => allEvenements?.filter(e => e.aerodrome_id === aerodromeId) || [], [allEvenements, aerodromeId])
  const [results, setResults] = useState<any>({})

  useEffect(() => {
    (async () => {
      const r: any = {}
      try {
        const { predictSurvival } = await import('@/lib/risque/survival')
        const survEvents = historique.map((h: any, i: number) => ({
          time: i * 30 + 1,
          event: h.score < 30,
          covariates: [h.score, profil?.score_global || 70],
        }))
        r.survival = predictSurvival(survEvents)
      } catch { /* */ }

      try {
        const { predictEVT } = await import('@/lib/risque/extreme')
        r.evt = predictEVT(historique.map((h: any) => ({ value: 100 - h.score, date: h.date || '' })))
      } catch { /* */ }

      try {
        const { predictHMM } = await import('@/lib/risque/hmm')
        r.hmm = predictHMM(historique.map((h: any) => h.score))
      } catch { /* */ }

      try {
        const { predictNB } = await import('@/lib/risque/negativeBinomial')
        r.nb = predictNB(evenements.length ? [evenements.length] : [0])
      } catch { /* */ }

      try {
        const { predictCopula } = await import('@/lib/risque/copulas')
        const copHist = historique.map((h: any) => ({
          c1: profil?.c1 ?? 50, c2: profil?.c2 ?? 50, c3: profil?.c3 ?? 50, c4: profil?.c4 ?? 50, c5: profil?.c5 ?? 50,
        }))
        r.copula = predictCopula(copHist)
      } catch { /* */ }

      try {
        const { createThompsonSampling } = await import('@/lib/risque/thompsonSampling')
        r.ts = createThompsonSampling([
          { id: 'maintien', name: 'Maintien' },
          { id: 'periodique', name: 'Périodique' },
          { id: 'renforcee', name: 'Renforcée' },
        ])
      } catch { /* */ }

      setResults(r)
    })()
  }, [aerodromeId])

  const surv = results.survival
  const evt = results.evt
  const hmm = results.hmm
  const nb = results.nb
  const copula = results.copula
  const ts = results.ts

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="advanced-models">
      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft"><Clock className="w-5 h-5 text-danger" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Survie médiane</div>
            <div className="kpi-value">{surv?.medianSurvivalDays || '—'} j</div>
            <div className="kpi-trend down">50% incident critique</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft"><Activity className="w-5 h-5 text-warning" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Hazard 90 jours</div>
            <div className="kpi-value">{surv?.hazard90days || '—'}%</div>
            <div className="kpi-trend down">Risque court terme</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft"><TrendingUp className="w-5 h-5 text-role-primary" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Pire attendu 12m</div>
            <div className="kpi-value">{evt?.maxExpected12m || '—'}/100</div>
            <div className={`kpi-trend ${evt?.isHeavyTailed ? 'down' : 'up'}`}>
              {evt?.isHeavyTailed ? 'Queue lourde' : 'Risque normal'}
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft"><Brain className="w-5 h-5 text-success" /></div>
          <div className="kpi-content">
            <div className="kpi-label">État HMM</div>
            <div className="kpi-value capitalize">{hmm?.currentState || '—'}</div>
            <div className={`kpi-trend ${hmm?.isTransitioning ? 'down' : 'up'}`}>
              {hmm?.isTransitioning ? 'En transition' : 'Stable'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Survival Analysis */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Clock className="w-4 h-4 text-role-primary" />
              Survival Analysis — Quand l'incident arrivera
            </div>
          </div>
          <div className="card-content space-y-3">
            {surv ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Hazard 90 jours</p>
                    <div className="progress h-3"><div className="progress-bar bg-danger" style={{ width: `${Math.min(surv.hazard90days, 100)}%` }} /></div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{surv.hazard90days}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Hazard 180 jours</p>
                    <div className="progress h-3"><div className="progress-bar bg-warning" style={{ width: `${Math.min(surv.hazard180days, 100)}%` }} /></div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{surv.hazard180days}%</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Médiane de survie : <strong>{surv.medianSurvivalDays} jours</strong> avant incident critique
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Données insuffisantes pour l'analyse de survie</p>
            )}
          </div>
        </div>

        {/* Hidden Markov Model */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Activity className="w-4 h-4 text-role-primary" />
              HMM — Détection de transition
            </div>
          </div>
          <div className="card-content space-y-3">
            {hmm ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-role-primary-soft">
                  <div className={`w-3 h-3 rounded-full ${hmm.currentState === 'critical' ? 'bg-danger animate-pulse' : hmm.currentState === 'degrading' ? 'bg-warning' : 'bg-success'}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground capitalize">{hmm.currentState}</p>
                    <p className="text-xs text-muted-foreground">
                      {hmm.daysToCritical < 999 ? `Risque critique dans ~${hmm.daysToCritical} jours` : 'Pas de risque critique imminent'}
                    </p>
                  </div>
                </div>
                {hmm.isTransitioning && (
                  <div className="alert alert-warning">
                    <AlertTriangle className="alert-icon" />
                    <div className="alert-content">
                      <div className="alert-description text-xs">Transition silencieuse détectée — l'aérodrome passe d'un état stable à dégradé</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  {hmm.stateProbabilities?.map((p: number, i: number) => {
                    const name = ['Stable', 'Dégradé', 'Critique'][i] || ''
                    return (
                      <div key={name} className="flex-1">
                        <p className="text-muted-foreground">{name}</p>
                        <div className="progress h-1.5"><div className={`progress-bar ${i === 2 ? 'bg-danger' : i === 1 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${p}%` }} /></div>
                        <p className="text-right text-[10px]">{p}%</p>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Données insuffisantes pour HMM</p>
            )}
          </div>
        </div>

        {/* Extreme Value Theory */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Zap className="w-4 h-4 text-role-primary" />
              Extreme Value Theory — Risques extrêmes
            </div>
          </div>
          <div className="card-content space-y-3">
            {evt ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-danger/5">
                    <p className="text-xs text-muted-foreground">Niveau 1 an</p>
                    <p className="text-lg font-bold text-danger">{evt.returnLevel1y}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-warning/5">
                    <p className="text-xs text-muted-foreground">Niveau 5 ans</p>
                    <p className="text-lg font-bold text-warning">{evt.returnLevel5y}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/5">
                    <p className="text-xs text-muted-foreground">Niveau 10 ans</p>
                    <p className="text-lg font-bold text-role-primary">{evt.returnLevel10y}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="badge neutral">ξ = {evt.shape}</span>
                  <span className="badge neutral">σ = {evt.scale}</span>
                  {evt.isHeavyTailed && <span className="badge danger">Queue lourde</span>}
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Probabilité de dépasser le pire historique : <strong className="text-danger">{evt.probabilityExtreme}%</strong>
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Données insuffisantes pour EVT</p>
            )}
          </div>
        </div>

        {/* Copulas + Negative Binomial */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Layers className="w-4 h-4 text-role-primary" />
              Copulas & Negative Binomial
            </div>
          </div>
          <div className="card-content space-y-3">
            {copula ? (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Corrélations C1-C5</p>
                <div className="space-y-1">
                  {copula.correlationMatrix?.[0]?.slice(0, 5).map((v: number, i: number) => {
                    const labels = ['C1', 'C2', 'C3', 'C4', 'C5']
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono w-6">{labels[i]}</span>
                        <div className="flex-1 progress h-1.5">
                          <div className={`progress-bar ${Math.abs(v) > 0.5 ? 'bg-success' : Math.abs(v) > 0.3 ? 'bg-warning' : 'bg-muted'}`} style={{ width: `${Math.abs(v) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono w-8 text-right">{v > 0 ? '+' : ''}{Math.round(v * 100) / 100}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Groupes corrélés : C{copula.clusters?.group1?.join('-C')} et C{copula.clusters?.group2?.join('-C')}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Copulas non disponible</p>
            )}
            {nb && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-foreground mb-1">Distribution des incidents</p>
                <div className="flex items-center gap-3 text-xs">
                  <span>μ = {nb.mean}</span>
                  <span>σ² = {nb.variance}</span>
                  <span className={`badge ${nb.isOverdispersed ? 'warning' : 'success'} text-[10px]`}>
                    {nb.isOverdispersed ? 'Surdispersion' : 'Poisson'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Max attendu (95%) : <strong>{nb.expectedMax}</strong> incidents
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thompson Sampling — recommandation d'action */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Target className="w-4 h-4 text-role-primary" />
            Thompson Sampling — Recommandation optimale
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-3 gap-4">
            {ts?.actions?.map((a: any) => {
              const pct = a.samples > 0 ? Math.round(a.alpha / (a.alpha + a.beta) * 100) : 50
              const isBest = a.id === ts.bestAction
              return (
                <div key={a.id} className={`p-4 rounded-xl text-center border ${isBest ? 'border-role-primary bg-role-primary/5 shadow-role-glow' : 'border-border'}`}>
                  <p className="text-sm font-semibold text-foreground">{a.name}</p>
                  <p className="text-2xl font-bold text-role-primary mt-1">{pct}%</p>
                  <p className="text-[10px] text-muted-foreground">récompense</p>
                  <div className="progress h-1 mt-2"><div className={`progress-bar ${isBest ? 'bg-role-primary' : ''}`} style={{ width: `${pct}%` }} /></div>
                  {isBest && <span className="badge success text-[10px] mt-2">Recommandé</span>}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3 italic">
            Confiance : <strong>{ts?.bestProbability || '—'}%</strong> que la recommandation soit optimale
          </p>
        </div>
      </div>
    </div>
  )
}
