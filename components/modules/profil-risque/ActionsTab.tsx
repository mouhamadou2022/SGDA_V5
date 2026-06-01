// components/modules/profil-risque/ActionsTab.tsx
// Recommandations actionnables enrichies par ML — Thompson Sampling, HMM, EVT, Survival

'use client'

import { useState } from 'react'
import { ProfilRisque } from '@/lib/store'
import {
  CheckCircle2,
  AlertTriangle,
  Shield,
  Zap,
  RefreshCw,
  Download,
  Brain,
  TrendingUp,
  Clock,
  Target,
  Activity,
  Gauge,
} from 'lucide-react'

interface ActionsTabProps {
  profil: ProfilRisque
  aerodromeId: string
  userRole: string
  onRecalculate: () => void
}

type Urgence = 'critique' | 'haute' | 'moyenne'

interface RecommandationItem {
  id: string
  titre: string
  description: string
  urgence: Urgence
  icon: React.ElementType
}

const URGENCE_CONFIG: Record<Urgence, {
  label: string
  badgeClass: string
  borderClass: string
  iconClass: string
  bgClass: string
}> = {
  critique: {
    label: 'CRITIQUE',
    badgeClass: 'badge danger pulse',
    borderClass: 'border-l-4 border-l-danger',
    iconClass: 'text-danger',
    bgClass: 'bg-danger/5',
  },
  haute: {
    label: 'HAUTE',
    badgeClass: 'badge warning',
    borderClass: 'border-l-4 border-l-warning',
    iconClass: 'text-warning',
    bgClass: 'bg-warning/5',
  },
  moyenne: {
    label: 'MOYENNE',
    badgeClass: 'badge primary',
    borderClass: 'border-l-4 border-l-role-primary',
    iconClass: 'text-role-primary',
    bgClass: 'bg-role-primary-soft',
  },
}

function buildRecommandations(profil: ProfilRisque): RecommandationItem[] {
  const recs: RecommandationItem[] = []

  // 1. Score global critique
  if (profil.score_global < 30) {
    recs.push({
      id: 'global-critique',
      titre: 'Surveillance immediate recommandee',
      description: `Score global ${profil.score_global}/100 — score critique. Declencher une mission de surveillance inopinee et notifier la direction.`,
      urgence: 'critique',
      icon: AlertTriangle,
    })
  }

  // 2. C1 — Maturite SGS
  if (profil.c1 < 40) {
    recs.push({
      id: 'c1-sgs',
      titre: 'Renforcer le SGS',
      description: `Maturite insuffisante — Score C1 ${profil.c1}/100. Mettre en place un plan d'amelioration du systeme de gestion de la securite.`,
      urgence: 'critique',
      icon: Shield,
    })
  }

  // 3. C2 — Efficacite PAC
  if (profil.c2 < 40) {
    recs.push({
      id: 'c2-pac',
      titre: 'Accelerer les PAC',
      description: `Efficacite faible — Score C2 ${profil.c2}/100. Suivi renforce des plans d'actions correctives et priorisation des mesures.`,
      urgence: profil.c2 < 25 ? 'critique' : 'haute',
      icon: TrendingUp,
    })
  }

  // 4. C3 — Conformite technique
  if (profil.c3 < 50) {
    recs.push({
      id: 'c3-tech',
      titre: 'Verifier conformite technique',
      description: `Scores bas sur PHY/OLS/ELEC/MFP — Score C3 ${profil.c3}/100. Inspection technique detaillee recommandee.`,
      urgence: profil.c3 < 30 ? 'critique' : 'haute',
      icon: Gauge,
    })
  }

  // 5. C4 — Charge d'ecarts
  if (profil.c4 < 50) {
    recs.push({
      id: 'c4-ecarts',
      titre: 'Reduire la charge d\'ecarts',
      description: `Trop de NC actives — Score C4 ${profil.c4}/100. Apurement accelere des non-conformites en cours.`,
      urgence: profil.c4 < 30 ? 'critique' : 'haute',
      icon: AlertTriangle,
    })
  }

  // 6. C5 — Resilience
  if (profil.c5 < 50) {
    recs.push({
      id: 'c5-resilience',
      titre: 'Ameliorer la resilience',
      description: `Incidents frequents — Score C5 ${profil.c5}/100. Renforcer les mesures de resilience operationnelle.`,
      urgence: profil.c5 < 30 ? 'critique' : 'haute',
      icon: Shield,
    })
  }

  // ML-driven recommendations
  if (profil.hmm_state?.isTransitioning) {
    recs.push({
      id: 'hmm-transition',
      titre: 'Transition silencieuse detectee (HMM)',
      description: `L'aerodrome glisse vers un etat critique — agir avant J-${profil.hmm_state.daysToCritical}. Risque de transition: ${profil.hmm_state.transitionRisk}%.`,
      urgence: 'critique',
      icon: AlertTriangle,
    })
  }
  if (profil.survival_metrics?.hazard90d && profil.survival_metrics.hazard90d > 0.5) {
    recs.push({
      id: 'survival-hazard',
      titre: 'Inspection urgente recommandee (Survival)',
      description: `Risque d'incident a 90 jours: ${Math.round(profil.survival_metrics.hazard90d * 100)}%. Mediane de survie: ${profil.survival_metrics.medianDays}j. Programmer une inspection.`,
      urgence: 'critique',
      icon: Clock,
    })
  }
  if (profil.extreme_risk?.isHeavyTailed) {
    recs.push({
      id: 'evt-extreme',
      titre: 'Plan urgence recommande (EVT)',
      description: `Distribution a queue lourde detectee — risque extreme ${Math.round(profil.extreme_risk.tailRisk * 100)}%. Max attendu 12m: ${profil.extreme_risk.maxExpected12m} incidents.`,
      urgence: 'haute',
      icon: Zap,
    })
  }
  if (profil.copula_metrics?.maxTailDependence && profil.copula_metrics.maxTailDependence > 0.3) {
    recs.push({
      id: 'copula-domaines',
      titre: 'Domaines fortement lies (Copulas)',
      description: `Dependance de queue ${profil.copula_metrics.maxTailDependence.toFixed(2)} — une defaillance entraine les autres. Inspecter large, tous domaines.`,
      urgence: profil.copula_metrics.maxTailDependence > 0.6 ? 'haute' : 'moyenne',
      icon: Target,
    })
  }
  if (profil.negbin_metrics?.isOverdispersed) {
    recs.push({
      id: 'nb-groupes',
      titre: 'Incidents par grappes (NB)',
      description: `Surdispersion detectee — les incidents arrivent en grappes. Augmenter la frequence de surveillance.`,
      urgence: 'moyenne',
      icon: Activity,
    })
  }

  return recs.sort((a, b) => {
    const order = { critique: 0, haute: 1, moyenne: 2 }
    return (order[a.urgence] ?? 2) - (order[b.urgence] ?? 2)
  })
}

export function ActionsTab({
  profil,
  aerodromeId: _aerodromeId,
  userRole,
  onRecalculate,
}: ActionsTabProps) {
  const [loading, setLoading] = useState(false)

  const recommandations = buildRecommandations(profil)
  const tsMetrics = profil.ts_metrics
  const hmmState = profil.hmm_state
  const extremeRisk = profil.extreme_risk
  const survivalMetrics = profil.survival_metrics

  const handleRecalculate = async () => {
    setLoading(true)
    try {
      onRecalculate()
    } finally {
      setTimeout(() => setLoading(false), 800)
    }
  }

  const handleExportReport = () => {
    const lines: string[] = []
    lines.push(`RAPPORT DE PROFIL DE RISQUE — SGDA V5`)
    lines.push(`Aérodrome: ${profil.aerodrome_id}`)
    lines.push(`Date: ${profil.computed_at ? new Date(profil.computed_at).toLocaleDateString('fr-FR') : 'N/A'}`)
    lines.push(``)
    lines.push(`SCORE GLOBAL: ${profil.score_global}/100 — Niveau ${(profil.niveau || '').toUpperCase()}`)
    lines.push(`Tendance: ${profil.tendance}`)
    lines.push(`Prédiction 3m: ${profil.prediction_3m}/100 | 6m: ${profil.prediction_6m}/100`)
    lines.push(``)
    lines.push(`C1 (SGS): ${profil.c1}/100 | C2 (PAC): ${profil.c2}/100 | C3 (Conformité): ${profil.c3}/100`)
    lines.push(`C4 (Charge): ${profil.c4}/100 | C5 (Résilience): ${profil.c5}/100`)
    if (profil.hmm_state) lines.push(`HMM: ${profil.hmm_state.currentStateName} | Transition: ${profil.hmm_state.isTransitioning ? 'OUI' : 'non'}`)
    if (profil.survival_metrics) lines.push(`Survival: Hazard 90j=${Math.round(profil.survival_metrics.hazard90d * 100)}%`)
    if (profil.ts_metrics) lines.push(`Action IA: ${profil.ts_metrics.recommendedAction} (${Math.round(profil.ts_metrics.bestProbability * 100)}%)`)
    lines.push(``)
    lines.push(`--- Généré par SGDA V5 ---`)
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `SGDA_Rapport_${profil.aerodrome_id}_${new Date().toISOString().split('T')[0]}.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">

      {/* Section ML — Carte Thompson Sampling */}
      {tsMetrics && (
        <div className="card border-l-4 border-l-role-primary bg-gradient-to-r from-role-primary-soft/30 to-transparent">
          <div className="card-content p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-role-primary-soft flex items-center justify-center flex-shrink-0">
                <Brain className="w-6 h-6 text-role-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge primary">IA — Thompson Sampling</span>
                  <span className="text-xs text-muted-foreground">
                    Confiance: <strong className="text-role-primary">{tsMetrics.bestProbability}%</strong>
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-2">
                  Action recommandee par IA: {tsMetrics.recommendedAction}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Selectionnee par echantillonnage de Thompson parmi les actions disponibles, optimisant le compromis exploration/exploitation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section ML — Alerte HMM */}
      {hmmState?.isTransitioning && (
        <div className="card border-l-4 border-l-danger bg-danger/5">
          <div className="card-content p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge danger pulse">HMM — Transition silencieuse</span>
                  {hmmState.currentStateName && (
                    <span className="text-xs text-muted-foreground">
                      Etat: <strong className="text-danger">{hmmState.currentStateName}</strong>
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground mt-2">
                  Action urgente: l&apos;aerodrome est en transition silencieuse vers un etat critique
                  {hmmState.daysToCritical > 0 && (
                    <> — agir avant J-{hmmState.daysToCritical}</>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Le modele de Markov cache detecte un changement d&apos;etat non visible par les indicateurs classiques. Risque de transition: {(hmmState.transitionRisk * 100).toFixed(1)}%.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section ML — Alerte EVT (Extreme Value Theory) */}
      {extremeRisk?.isHeavyTailed && (
        <div className="card border-l-4 border-l-warning bg-warning/5">
          <div className="card-content p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge warning">EVT — Risque extreme</span>
                  <span className="text-xs text-muted-foreground">
                    Tail risk: <strong className="text-warning">{extremeRisk.tailRisk.toFixed(2)}</strong>
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-2">
                  Preparer un plan d&apos;urgence — risque extreme identifie
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  La distribution des evenements presente une queue lourde. Maximum attendu a 12 mois: {extremeRisk.maxExpected12m.toFixed(1)}. Anticipez les scenarios extremes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section ML — Alerte Survival (analyse de survie) */}
      {survivalMetrics && survivalMetrics.hazard90d > 0.5 && (
        <div className="card border-l-4 border-l-warning bg-warning/5">
          <div className="card-content p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge warning">Survie — Risque a 90 jours</span>
                  <span className="text-xs text-muted-foreground">
                    Hazard: <strong className="text-warning">{(survivalMetrics.hazard90d * 100).toFixed(1)}%</strong>
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-2">
                  Programmer une inspection dans les 90 jours
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  L&apos;analyse de survie indique un risque eleve d&apos;evenement dans les 90 prochains jours. Delai median estime: {survivalMetrics.medianDays} jours.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommandations priorisees classiques */}
      {recommandations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-role-primary" />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              Recommandations priorisees
            </h3>
            <span className="badge neutral text-[10px]">{recommandations.length}</span>
          </div>

          {recommandations.map((rec) => {
            const config = URGENCE_CONFIG[rec.urgence]
            const RecIcon = rec.icon
            return (
              <div key={rec.id} className={`card ${config.borderClass}`}>
                <div className="card-content p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bgClass}`}>
                      <RecIcon className={`w-5 h-5 ${config.iconClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={config.badgeClass}>{config.label}</span>
                        <span className="text-xs text-muted-foreground">
                          Score: <strong>{
                            rec.id === 'global-critique' ? profil.score_global :
                            rec.id === 'c1-sgs' ? profil.c1 :
                            rec.id === 'c2-pac' ? profil.c2 :
                            rec.id === 'c3-tech' ? profil.c3 :
                            rec.id === 'c4-ecarts' ? profil.c4 :
                            rec.id === 'c5-resilience' ? profil.c5 : '—'
                          }/100</strong>
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground mt-2">
                        {rec.titre}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rec.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Etat satisfaisant si aucune recommandation */}
      {recommandations.length === 0 && !tsMetrics && !hmmState?.isTransitioning && !extremeRisk?.isHeavyTailed && !(survivalMetrics && survivalMetrics.hazard90d > 0.5) && (
        <div className="card card-glass text-center">
          <div className="card-content py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-success">Profil de risque satisfaisant</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Aucune recommandation urgente detectee. Maintenez les bonnes pratiques et poursuivez la surveillance programmee.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'actions */}
      <div className="flex items-center gap-3 flex-wrap pt-2">
        <button
          onClick={handleRecalculate}
          disabled={loading}
          className="btn btn-primary gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Recalcul en cours...' : 'Recalculer le profil de risque'}
        </button>

        <button
          className="btn btn-secondary gap-2"
          onClick={handleExportReport}
        >
          <Download className="w-4 h-4" />
          Exporter le rapport
        </button>

        {userRole === 'admin' && (
          <button
            className="btn btn-outline gap-2"
            onClick={() => {}}
          >
            <Brain className="w-4 h-4" />
            Calibration des modeles
          </button>
        )}
      </div>

    </div>
  )
}

export default ActionsTab
