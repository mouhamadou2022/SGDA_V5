// components/modules/profil-risque/DecisionTab.tsx
// Vue DG — Data-Driven Decision Making. Masque les détails techniques ML.
// Score, niveau, tendance, alertes clés, écarts, recommandations actionnables.

'use client'

import { ProfilRisque } from '@/lib/store'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Target, Clock, BarChart3, CheckCircle2 } from 'lucide-react'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  nbEcartsCritiques: number
  userRole: string
  onRecalculate: () => void
}

export default function DecisionTab({ profil, aerodromeCode, aerodromeName, nbEcartsCritiques, userRole, onRecalculate }: Props) {
  const isDG = userRole === 'dg_anacim' || userRole === 'dg_operator' || userRole === 'focal_operator'

  const getNiveauConfig = (score: number) => {
    if (score >= 80) return { label: 'Faible', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', badge: 'badge success' }
    if (score >= 60) return { label: 'Moyen', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'badge primary' }
    if (score >= 30) return { label: 'Élevé', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'badge warning' }
    return { label: 'Critique', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'badge danger' }
  }

  const config = getNiveauConfig(profil.score_global)

  // Construire les recommandations actionnables
  const recommandations: { id: string; label: string; icon: React.ElementType; priorite: 'critique' | 'haute' | 'moyenne' | 'basse'; action: string }[] = []
  if (profil.score_global < 30) recommandations.push({ id: 'score', label: 'Surveillance immédiate', icon: AlertTriangle, priorite: 'critique', action: 'Programmer une inspection complète dans les 7 jours' })
  if (profil.c1 < 40) recommandations.push({ id: 'sgs', label: 'Renforcer le SGS', icon: Shield, priorite: 'haute', action: 'Auditer les 4 piliers PAOE et identifier les lacunes de maturité' })
  if (profil.c2 < 40) recommandations.push({ id: 'pac', label: 'Accélérer les PAC', icon: Clock, priorite: 'haute', action: 'Vérifier l\'état d\'avancement des plans d\'action corrective' })
  if (profil.c3 < 50) recommandations.push({ id: 'conformite', label: 'Contrôler la conformité', icon: Target, priorite: 'moyenne', action: 'Inspecter les infrastructures critiques (piste, balisage, énergie)' })
  if (profil.c5 < 50) recommandations.push({ id: 'resilience', label: 'Améliorer la résilience', icon: Shield, priorite: 'moyenne', action: 'Analyser les incidents récents et renforcer les barrières de sécurité' })
  if (nbEcartsCritiques > 0) recommandations.push({ id: 'ecarts', label: `${nbEcartsCritiques} écart(s) critique(s)`, icon: AlertTriangle, priorite: 'critique', action: 'Traiter les écarts critiques avant la prochaine inspection' })
  if (profil.hmm_state?.isTransitioning) recommandations.push({ id: 'hmm', label: 'Transition silencieuse détectée', icon: TrendingDown, priorite: 'critique', action: `Agir avant J-${profil.hmm_state.daysToCritical} — l'aérodrome glisse vers un état critique` })
  if (profil.extreme_risk?.isHeavyTailed) recommandations.push({ id: 'evt', label: 'Risque extrême identifié', icon: AlertTriangle, priorite: 'haute', action: 'Préparer un plan d\'urgence — risque de queue lourde détecté' })

  const prioriteOrder = { critique: 0, haute: 1, moyenne: 2, basse: 3 }
  recommandations.sort((a, b) => prioriteOrder[a.priorite] - prioriteOrder[b.priorite])

  const topRisks = recommandations.filter(r => r.priorite === 'critique' || r.priorite === 'haute')
  const otherRisks = recommandations.filter(r => r.priorite !== 'critique' && r.priorite !== 'haute')

  return (
    <div className="space-y-6">
      {/* Carte score principal */}
      <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-6`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="code-oaci-badge text-sm">{aerodromeCode}</span>
              <span className="text-sm text-gray-500">{aerodromeName}</span>
            </div>
            <h1 className={`text-4xl font-bold ${config.color}`}>{profil.score_global}/100</h1>
            <span className={`badge ${config.badge} mt-1`}>Niveau {config.label}</span>
          </div>
          <div className="text-right text-sm">
            <div className="flex items-center gap-1.5 justify-end mb-1">
              <span className="text-gray-500">Tendance :</span>
              {profil.tendance === 'hausse' ? <><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-green-600">En amélioration</span></>
                : profil.tendance === 'baisse' ? <><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-red-600 font-semibold">En dégradation</span></>
                : <><Minus className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Stable</span></>}
            </div>
            {profil.bayesian_black_swan && (
              <span className="badge danger animate-pulse text-xs">Black Swan détecté</span>
            )}
          </div>
        </div>

        {/* Radar simplifié */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {[
            { label: 'SGS', value: profil.c1 },
            { label: 'PAC', value: profil.c2 },
            { label: 'Conform.', value: profil.c3 },
            { label: 'Charge', value: profil.c4 },
            { label: 'Résilience', value: profil.c5 },
          ].map(c => (
            <div key={c.label} className="text-center">
              <div className="text-xs text-gray-500 mb-1">{c.label}</div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                <div className={`h-2 rounded-full ${c.value < 40 ? 'bg-red-500' : c.value < 60 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${c.value}%` }} />
              </div>
              <span className={`text-xs font-bold ${c.value < 40 ? 'text-red-600' : c.value < 60 ? 'text-orange-600' : 'text-green-600'}`}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alertes immédiates */}
      {topRisks.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />Actions prioritaires
          </h3>
          <div className="space-y-2">
            {topRisks.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-2 rounded-lg bg-white/70">
                <r.icon className={`w-4 h-4 mt-0.5 shrink-0 ${r.priorite === 'critique' ? 'text-red-500' : 'text-orange-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{r.label}</p>
                  <p className="text-xs text-gray-500">{r.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Autres recommandations */}
      {otherRisks.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />Points de vigilance
          </h3>
          <div className="space-y-2">
            {otherRisks.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <r.icon className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
                <div>
                  <p className="text-sm text-gray-700">{r.label}</p>
                  <p className="text-xs text-gray-400">{r.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prédictions simplifiées */}
      <div className="card border-border">
        <div className="card-header border-b border-border"><div className="card-title text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gray-500" />Projection du risque</div></div>
        <div className="card-content p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500">3 mois</p>
              <p className={`text-lg font-bold ${profil.prediction_3m < 30 ? 'text-red-600' : profil.prediction_3m < 60 ? 'text-orange-600' : 'text-green-600'}`}>
                {profil.prediction_3m}/100
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">6 mois</p>
              <p className={`text-lg font-bold ${profil.prediction_6m < 30 ? 'text-red-600' : profil.prediction_6m < 60 ? 'text-orange-600' : 'text-green-600'}`}>
                {profil.prediction_6m}/100
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Scénario pire cas</p>
              <p className={`text-lg font-bold ${(profil.scenarios?.[3]?.scoreProjecte ?? profil.score_global) < 30 ? 'text-red-600' : 'text-orange-600'}`}>
                {profil.scenarios?.[3]?.scoreProjecte ?? profil.score_global}/100
              </p>
            </div>
          </div>
          {profil.survival_metrics && (
            <div className="mt-3 pt-3 border-t border-border text-xs text-gray-500 text-center">
              Risque d'incident à 90 jours : {Math.round(profil.survival_metrics.hazard90d * 100)}%
              {profil.survival_metrics.hazard90d > 0.5 && <span className="text-red-500 font-semibold ml-1">— Inspection recommandée</span>}
            </div>
          )}
        </div>
      </div>

      {/* Écarts critiques */}
      {nbEcartsCritiques > 0 && (
        <div className="alert alert-danger">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">{nbEcartsCritiques} écart(s) critique(s) non résolu(s)</div>
            <div className="alert-description">Ces écarts impactent directement le score de risque. Leur résolution est prioritaire.</div>
          </div>
        </div>
      )}

      {/* Rapport — admin only */}
      {userRole === 'admin' && (
        <div className="flex justify-end">
          <button className="btn btn-secondary gap-2 text-sm" onClick={onRecalculate}>
            <BarChart3 className="w-4 h-4" />Recalculer le profil
          </button>
        </div>
      )}
    </div>
  )
}
