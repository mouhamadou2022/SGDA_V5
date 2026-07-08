// lib/ia/engines/modelOrchestrator.ts
// Meta-model : choisit le meilleur modèle selon le contexte
// Critères : score, type d'entité, signaux disponibles, volume de données, qualité

import type { ProfilRisque } from '@/lib/store'

export type AvailableModel =
  | 'hmm' | 'survival' | 'evt' | 'negbin' | 'copula'
  | 'thompson_sampling' | 'linear_regression' | 'seasonal_forecast'
  | 'bayesian_posterior' | 'bayesian_network_causal' | 'ensemble'

export interface ModelCapability {
  model: AvailableModel
  label: string
  description: string
  /** Conditions minimales pour que ce modèle soit utilisable */
  requirements: {
    minDataPoints?: number
    hasTransition?: boolean
    hasSurvival?: boolean
    hasExtreme?: boolean
    hasCopula?: boolean
    hasNegbin?: boolean
    hasTS?: boolean
    hasBayesian?: boolean
    hasBowTie?: boolean
    hasEvents?: boolean
    minQualityScore?: number
    maxScore?: number
    entityTypes?: string[]
  }
  /** Poids de confiance par défaut quand toutes les conditions sont remplies */
  baseConfidence: number
  /** Domaine de prédiction principal */
  specialty: 'transition' | 'degradation' | 'incident' | 'scenario' | 'calibration' | 'all'
}

export interface ModelSelection {
  selected: AvailableModel
  confidence: number
  reason: string
  alternatives: Array<{ model: AvailableModel; reason: string; confidence: number }>
}

export interface OrchestratorContext {
  profil: ProfilRisque
  entityType?: string
  dataQuality?: number
  historicalLength?: number
  hasEvents?: boolean
  hasEcarts?: boolean
}

const MODELS: ModelCapability[] = [
  {
    model: 'hmm',
    label: 'Hidden Markov Model',
    description: 'Détection de transitions silencieuses entre états de risque',
    requirements: { hasTransition: true, minDataPoints: 10 },
    baseConfidence: 85,
    specialty: 'transition',
  },
  {
    model: 'survival',
    label: 'Analyse de survie (Kaplan-Meier)',
    description: 'Probabilité de défaillance dans un horizon donné',
    requirements: { hasSurvival: true, minDataPoints: 5 },
    baseConfidence: 78,
    specialty: 'degradation',
  },
  {
    model: 'evt',
    label: 'Théorie des valeurs extrêmes',
    description: 'Risque de queue lourde et scénario extrême',
    requirements: { hasExtreme: true, minDataPoints: 15 },
    baseConfidence: 72,
    specialty: 'incident',
  },
  {
    model: 'negbin',
    label: 'Binomial négatif (surdispersion)',
    description: 'Modélisation de la variance anormale des incidents',
    requirements: { hasNegbin: true, minDataPoints: 8 },
    baseConfidence: 65,
    specialty: 'incident',
  },
  {
    model: 'copula',
    label: 'Copules (dépendance multivariée)',
    description: 'Corrélation entre dimensions C1-C5 et scénarios combinés',
    requirements: { hasCopula: true, minDataPoints: 20 },
    baseConfidence: 70,
    specialty: 'scenario',
  },
  {
    model: 'thompson_sampling',
    label: 'Thompson Sampling',
    description: 'Recommandation exploratoire quand les données sont rares',
    requirements: { hasTS: true, minDataPoints: 3 },
    baseConfidence: 55,
    specialty: 'calibration',
  },
  {
    model: 'linear_regression',
    label: 'Régression linéaire',
    description: 'Tendance simple et prédiction court terme',
    requirements: { minDataPoints: 4 },
    baseConfidence: 60,
    specialty: 'degradation',
  },
  {
    model: 'seasonal_forecast',
    label: 'Prévision saisonnière',
    description: 'Cycle saisonnier des événements (saison des pluies, etc.)',
    requirements: { minDataPoints: 12, hasEvents: true },
    baseConfidence: 68,
    specialty: 'incident',
  },
  {
    model: 'bayesian_posterior',
    label: 'Bayésien (posterior à nœud unique)',
    description: 'Inférence bayésienne sur le score global (posterior bayésien existant)',
    requirements: { hasBayesian: true, minDataPoints: 10 },
    baseConfidence: 80,
    specialty: 'all',
  },
  {
    model: 'bayesian_network_causal',
    label: 'Réseau bayésien causal (bow-tie)',
    description: 'Propagation causale des dégradations de barrières via réseau bayésien construit depuis les bow-tie',
    requirements: { hasBowTie: true, minDataPoints: 1 },
    baseConfidence: 82,
    specialty: 'scenario',
  },
  {
    model: 'ensemble',
    label: 'Ensemble (moyenne pondérée)',
    description: 'Combinaison de tous les modèles disponibles',
    requirements: {},
    baseConfidence: 75,
    specialty: 'all',
  },
]

function scoreModel(
  model: ModelCapability,
  ctx: OrchestratorContext,
): { score: number; reason: string } {
  const p = ctx.profil
  let score = model.baseConfidence
  let penalties: string[] = []

  // Vérifier les prérequis
  if (model.requirements.minDataPoints && (ctx.historicalLength ?? 0) < model.requirements.minDataPoints) {
    penalties.push(`données insuffisantes (${ctx.historicalLength ?? 0} < ${model.requirements.minDataPoints})`)
  }

  if (model.requirements.hasTransition && !p.hmm_state?.isTransitioning) {
    penalties.push('pas de transition HMM détectée')
  }

  if (model.requirements.hasSurvival && !p.survival_metrics) {
    penalties.push('pas de métriques de survie')
  }

  if (model.requirements.hasExtreme && !p.extreme_risk?.isHeavyTailed) {
    penalties.push('pas de queue lourde détectée')
  }

  if (model.requirements.hasCopula && !p.copula_metrics) {
    penalties.push('pas de métriques copules')
  }

  if (model.requirements.hasNegbin && !p.negbin_metrics?.isOverdispersed) {
    penalties.push('pas de surdispersion détectée')
  }

  if (model.requirements.hasTS && !p.ts_metrics) {
    penalties.push('pas de métriques Thompson Sampling')
  }

  if (model.requirements.hasBayesian && !p.bayesian_posterior) {
    penalties.push('pas de posterior bayésien')
  }

  if (model.requirements.hasBowTie && !p.bowtie_metrics?.length) {
    penalties.push('pas de modèle bow-tie')
  }

  if (model.requirements.maxScore && (p.score_global ?? 0) > model.requirements.maxScore) {
    penalties.push(`score trop élevé (${p.score_global} > ${model.requirements.maxScore})`)
  }

  // Bonus / malus contextuels
  if (p.tendance === 'baisse') {
    if (model.specialty === 'transition' || model.specialty === 'degradation') {
      score += 10
    }
  }

  if (p.extreme_risk?.isHeavyTailed && model.model === 'evt') {
    score += 8
  }

  if (p.hmm_state?.isTransitioning && model.model === 'hmm') {
    score += 12
  }

  if (model.model === 'bayesian_network_causal' && p.bowtie_metrics && p.bowtie_metrics.length >= 3) {
    score += 10 // plus de domaines = réseau plus riche
  }

  if (penalties.length > 0) {
    score = Math.max(0, score - penalties.length * 15)
  }

  const reason = penalties.length > 0
    ? `${model.label} : ${penalties.join(' ; ')}`
    : `${model.label} : conditions remplies`

  return { score: Math.round(score), reason }
}

export function selectModel(ctx: OrchestratorContext): ModelSelection {
  const scored = MODELS
    .map(m => ({ model: m, ...scoreModel(m, ctx) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const alternatives = scored.slice(1, 4).map(s => ({
    model: s.model.model,
    reason: s.reason,
    confidence: s.score,
  }))

  return {
    selected: best.model.model,
    confidence: best.score,
    reason: best.reason,
    alternatives,
  }
}

export function getAvailableModels(profil: ProfilRisque): ModelCapability[] {
  const ctx: OrchestratorContext = { profil }
  return MODELS.filter(m => {
    const s = scoreModel(m, ctx)
    return s.score > 0
  })
}

export const modelOrchestrator = { selectModel, getAvailableModels }
