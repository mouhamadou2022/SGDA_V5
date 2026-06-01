// components/modules/profil-risque/AnticipationTab.tsx
// Vue d'anticipation : prédictions, HMM, survie, EVT, scénarios, incidents

'use client'

import { useMemo } from 'react'
import { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'
import { TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Zap, Brain, Activity, Target } from 'lucide-react'

interface AnticipationTabProps {
  profil: ProfilRisque
  historicalScores: ScoreHistoryPoint[]
  evenements: any[]
}

function TrendBadge({ score, prev }: { score: number; prev?: number }) {
  const diff = prev !== undefined ? score - prev : 0
  if (diff > 0) return <span className="badge success text-[10px]"><TrendingUp className="w-3 h-3" /> +{diff.toFixed(1)}</span>
  if (diff < 0) return <span className="badge danger text-[10px]"><TrendingDown className="w-3 h-3" /> {diff.toFixed(1)}</span>
  return <span className="badge neutral text-[10px]"><Minus className="w-3 h-3" /> 0</span>
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null
  const pct = Math.round(confidence * 100)
  const cls = confidence >= 0.7 ? 'badge success' : confidence >= 0.4 ? 'badge warning' : 'badge danger'
  return <span className={`${cls} text-[10px]`}>Confiance {pct}%</span>
}

function ScoreLabel({ label, value, color }: { label: string; value?: number; color: string }) {
  if (value === undefined) return null
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{Math.round(value)}</span>
    </div>
  )
}

export default function AnticipationTab({ profil, historicalScores, evenements }: AnticipationTabProps) {
  const hmm = profil.hmm_state
  const surv = profil.survival_metrics
  const evt = profil.extreme_risk
  const scenarios = profil.scenarios

  const scenarioCatastrophe = useMemo(
    () => scenarios?.find((s) => s.nom.toLowerCase() === 'catastrophe'),
    [scenarios]
  )
  const scenariosSummary = useMemo(
    () => scenarios?.filter((s) => s.nom.toLowerCase() !== 'catastrophe') ?? [],
    [scenarios]
  )

  const prevScore = historicalScores?.[historicalScores.length - 1]?.score

  return (
    <div className="space-y-6 animate-fade-up" data-module="anticipation-tab">
      {/* ── Predictions Timeline ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Target className="w-4 h-4 text-role-primary" />
            Prédictions temporelles
            {profil.ensemble_confidence !== undefined && (
              <ConfidenceBadge confidence={profil.ensemble_confidence} />
            )}
          </div>
        </div>
        <div className="card-content">
          <div className="flex items-center gap-4">
            {/* Barre de timeline 3m / 6m / 12m */}
            <div className="flex-1 flex items-center gap-0">
              <div className="flex flex-col items-center gap-1 flex-1 relative">
                <div className={`w-full h-2 rounded-l-full ${
                  (profil.prediction_3m ?? 0) >= 80 ? 'bg-danger' :
                  (profil.prediction_3m ?? 0) >= 60 ? 'bg-warning' :
                  (profil.prediction_3m ?? 0) >= 30 ? 'bg-role-primary' : 'bg-success'
                }`} style={{ width: `${Math.min(Math.max(profil.prediction_3m ?? 0, 5), 100)}%` }} />
                <span className="text-xs font-semibold text-foreground">{Math.round(profil.prediction_3m)}</span>
                <span className="text-[10px] text-muted-foreground">3 mois</span>
                {profil.prediction_interval_3m && (
                  <span className="text-[10px] text-muted-foreground italic">
                    IC95: [{Math.round(profil.prediction_interval_3m.lower)} - {Math.round(profil.prediction_interval_3m.upper)}]
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-full h-2 ${
                  (profil.prediction_6m ?? 0) >= 80 ? 'bg-danger' :
                  (profil.prediction_6m ?? 0) >= 60 ? 'bg-warning' :
                  (profil.prediction_6m ?? 0) >= 30 ? 'bg-role-primary' : 'bg-success'
                }`} style={{ width: `${Math.min(Math.max(profil.prediction_6m ?? 0, 5), 100)}%` }} />
                <span className="text-xs font-semibold text-foreground">{Math.round(profil.prediction_6m)}</span>
                <span className="text-[10px] text-muted-foreground">6 mois</span>
                {profil.prediction_interval_6m && (
                  <span className="text-[10px] text-muted-foreground italic">
                    IC95: [{Math.round(profil.prediction_interval_6m.lower)} - {Math.round(profil.prediction_interval_6m.upper)}]
                  </span>
                )}
              </div>
              {profil.prediction_12m !== undefined && (
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-full h-2 rounded-r-full ${
                    (profil.prediction_12m ?? 0) >= 80 ? 'bg-danger' :
                    (profil.prediction_12m ?? 0) >= 60 ? 'bg-warning' :
                    (profil.prediction_12m ?? 0) >= 30 ? 'bg-role-primary' : 'bg-success'
                  }`} style={{ width: `${Math.min(Math.max(profil.prediction_12m ?? 0, 5), 100)}%` }} />
                  <span className="text-xs font-semibold text-foreground">{Math.round(profil.prediction_12m)}</span>
                  <span className="text-[10px] text-muted-foreground">12 mois</span>
                </div>
              )}
            </div>
            <TrendBadge score={profil.prediction_3m} prev={prevScore} />
          </div>
        </div>
      </div>

      {/* ── Grid de cartes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* HMM State */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Brain className="w-4 h-4 text-role-primary" />
              État caché (HMM)
            </div>
          </div>
          <div className="card-content space-y-3">
            {hmm ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-role-primary-soft">
                  <div className={`w-3 h-3 rounded-full ${
                    hmm.currentStateName === 'critique' ? 'bg-danger animate-pulse' :
                    hmm.currentStateName === 'degrade' ? 'bg-warning' :
                    'bg-success'
                  }`} />
                  <div>
                    <p className="text-sm font-semibold capitalize text-foreground">{hmm.currentStateName}</p>
                    <p className="text-xs text-muted-foreground">
                      {hmm.daysToCritical < 999
                        ? `~${hmm.daysToCritical} jours avant critique`
                        : 'Pas de risque critique imminent'}
                    </p>
                  </div>
                </div>
                {hmm.isTransitioning && (
                  <div className="alert alert-warning">
                    <AlertTriangle className="alert-icon" />
                    <div className="alert-content">
                      <div className="alert-description text-xs">
                        Transition silencieuse détectée — passage d'un état stable à dégradé
                      </div>
                    </div>
                  </div>
                )}
                {hmm.transitionRisk > 50 && (
                  <div className="alert alert-danger">
                    <AlertTriangle className="alert-icon" />
                    <div className="alert-content">
                      <div className="alert-title text-xs font-semibold">Risque de transition élevé</div>
                      <div className="alert-description text-xs">
                        Probabilité de transition : {Math.round(hmm.transitionRisk)}% — action immédiate recommandée
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <span className="badge neutral">Transition: {Math.round(hmm.transitionRisk)}%</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Données HMM non disponibles</p>
            )}
          </div>
        </div>

        {/* Survival Metrics */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Clock className="w-4 h-4 text-role-primary" />
              Analyse de survie
            </div>
          </div>
          <div className="card-content space-y-3">
            {surv ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Hazard 90 jours</p>
                    <div className="progress h-3">
                      <div className="progress-bar bg-danger" style={{ width: `${Math.min(surv.hazard90d, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{Math.round(surv.hazard90d)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Hazard 180 jours</p>
                    <div className="progress h-3">
                      <div className="progress-bar bg-warning" style={{ width: `${Math.min(surv.hazard180d, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{Math.round(surv.hazard180d)}%</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Médiane de survie : <strong>{surv.medianDays} jours</strong> avant incident critique
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Données de survie non disponibles</p>
            )}
          </div>
        </div>

        {/* Extreme Value Theory */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Zap className="w-4 h-4 text-role-primary" />
              Risques extrêmes (EVT)
            </div>
          </div>
          <div className="card-content space-y-3">
            {evt ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-danger/5">
                    <p className="text-xs text-muted-foreground">Risque de queue</p>
                    <p className="text-lg font-bold text-danger">{Math.round(evt.tailRisk)}%</p>
                  </div>
                  <div className="p-2 rounded-lg bg-warning/5">
                    <p className="text-xs text-muted-foreground">Max attendu 12m</p>
                    <p className="text-lg font-bold text-warning">{evt.maxExpected12m}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`badge ${evt.isHeavyTailed ? 'danger' : 'success'}`}>
                    {evt.isHeavyTailed ? 'Queue lourde' : 'Queue normale'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Maximum attendu sur 12 mois : <strong>{evt.maxExpected12m} incidents</strong>
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Données EVT non disponibles</p>
            )}
          </div>
        </div>

        {/* Scénarios */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Activity className="w-4 h-4 text-role-primary" />
              Scénarios projetés
            </div>
          </div>
          <div className="card-content space-y-3">
            {/* Catastrophe — warning card */}
            {scenarioCatastrophe ? (
              <div className="alert alert-danger">
                <AlertTriangle className="alert-icon" />
                <div className="alert-content">
                  <div className="alert-title text-xs font-semibold">
                    Catastrophe — {Math.round(scenarioCatastrophe.probabilite * 100)}%
                  </div>
                  <div className="alert-description text-xs">
                    Score projeté : <strong>{Math.round(scenarioCatastrophe.scoreProjecte)}</strong>
                    <br />
                    {scenarioCatastrophe.description}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Scénario catastrophe non disponible</p>
            )}

            {/* Summary of other scenarios */}
            {scenariosSummary.length > 0 && (
              <div className="space-y-2">
                {scenariosSummary.map((s) => (
                  <div key={s.nom} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-xs font-semibold capitalize text-foreground">{s.nom}</p>
                      <p className="text-[10px] text-muted-foreground">{s.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{Math.round(s.scoreProjecte)}</p>
                      <p className="text-[10px] text-muted-foreground">{Math.round(s.probabilite * 100)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!scenarioCatastrophe && scenariosSummary.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun scénario disponible</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Incident Predictions ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-role-primary" />
            Prédictions d'incidents
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-danger/5">
              <p className="text-xs text-muted-foreground">3 mois</p>
              <p className="text-xl font-bold text-danger">{profil.incident_prediction_3m ?? '—'}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-warning/5">
              <p className="text-xs text-muted-foreground">6 mois</p>
              <p className="text-xl font-bold text-warning">{profil.incident_prediction_6m ?? '—'}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-role-primary-soft">
              <p className="text-xs text-muted-foreground">12 mois</p>
              <p className="text-xl font-bold text-role-primary">{profil.incident_prediction_12m ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Event Metrics ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Activity className="w-4 h-4 text-role-primary" />
            Métriques événementielles
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="kpi-card">
              <div className="kpi-label">Fréquence</div>
              <div className="kpi-value">{profil.event_frequency?.toFixed(1) ?? '—'} /mois</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Tendance sévérité</div>
              <div className="kpi-value text-sm capitalize">{profil.event_severity_trend ?? '—'}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Dernier événement</div>
              <div className="kpi-value">{profil.days_since_last_event ?? '—'} j</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Accélération</div>
              <div className="kpi-value">{profil.event_trend_acceleration?.toFixed(2) ?? '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scenario Simulator (placeholder) ── */}
      <div className="card">
        <div className="card-content">
          <button
            type="button"
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
            onClick={() => {
              const el = document.querySelector('[data-module="scenario-simulator"]')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            <Target className="w-4 h-4" />
            <span>Simuler un scénario →</span>
          </button>
        </div>
      </div>
    </div>
  )
}
