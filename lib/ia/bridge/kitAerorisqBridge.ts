// lib/ia/bridge/kitAerorisqBridge.ts
// Pont entre le Kit Inspecteur et AERORISQ
// Phase 1 : enrichir les items checklist avec les prédictions AERORISQ
// Phase 2 : boucler les résultats terrain → recalibrage

'use client'

import type { ProfilRisque } from '@/lib/store'
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent'
import { getRiskLevel } from '@/lib/risque'

export interface AerorisqItemPrediction {
  prediction: 'SA' | 'NS' | 'NA' | 'NV'
  confiance: number
  justification: string
  alerte: boolean
  prefill: boolean
}

export interface AerorisqDomaineContext {
  scoreDomaine: number
  scoreGlobal: number
  tendance: string
  niveau: string
  niveauVigilance: string
  predictions: { score3m: number; score6m: number } | null
  blackSwans: string[]
  hmmTransition: boolean
  isHeavyTailed: boolean
}

const DOMAINE_TO_CSCORE: Record<string, keyof ProfilRisque> = {
  SGS: 'c1',
  COP: 'c1',
  OPS: 'c2',
  PHY: 'c3',
  OLS: 'c3',
  ELEC: 'c3',
  MFP: 'c3',
  SLI: 'c5',
  RA: 'c5',
}

export function mapDomaineToCScore(domaine: string): keyof ProfilRisque | null {
  return DOMAINE_TO_CSCORE[domaine] ?? null
}

export function getScoreDomaine(domaine: string, profil: ProfilRisque): number {
  const key = mapDomaineToCScore(domaine)
  if (key) return (profil[key] as number) ?? profil.score_global
  return profil.score_global
}

export function construireContexteDomaine(
  domaine: string,
  profil: ProfilRisque | null,
  analysisResult?: RiskAnalysisResult
): AerorisqDomaineContext | null {
  if (!profil) return null

  const scoreDomaine = getScoreDomaine(domaine, profil)
  const scoreGlobal = profil.score_global
  const tendance = profil.tendance || 'stable'
  const niveau = getRiskLevel(scoreGlobal)

  let niveauVigilance = 'info'
  if (analysisResult?.proactiveAlert?.niveauUrgence) {
    niveauVigilance = analysisResult.proactiveAlert.niveauUrgence
  } else if (profil.velocity_metrics?.niveau_vigilance) {
    niveauVigilance = profil.velocity_metrics.niveau_vigilance
  }

  const blackSwans = (analysisResult?.blackSwans || [])
    .filter(bs => bs.domaine === domaine || DOMAINE_TO_CSCORE[domaine] === (
      { SGS: 'c1', COP: 'c1', OPS: 'c2', PHY: 'c3', OLS: 'c3', ELEC: 'c3', MFP: 'c3', SLI: 'c5', RA: 'c5' }[domaine]
    ))
    .map(bs => bs.message)

  return {
    scoreDomaine,
    scoreGlobal,
    tendance,
    niveau,
    niveauVigilance,
    predictions: analysisResult?.predictions
      ? { score3m: analysisResult.predictions.score3m, score6m: analysisResult.predictions.score6m }
      : null,
    blackSwans,
    hmmTransition: analysisResult?.hiddenMarkov?.isTransitioning ?? false,
    isHeavyTailed: analysisResult?.extremeValue?.isHeavyTailed ?? false,
  }
}

export function predicterItemAvecAerorisq(
  domaine: string,
  profil: ProfilRisque | null,
  analysisResult?: RiskAnalysisResult
): AerorisqItemPrediction {
  if (!profil) {
    return {
      prediction: 'NV',
      confiance: 30,
      justification: 'Aucun profil de risque AERORISQ disponible — à vérifier sur site',
      alerte: false,
      prefill: false,
    }
  }

  const ctx = construireContexteDomaine(domaine, profil, analysisResult)
  if (!ctx) {
    return { prediction: 'NV', confiance: 30, justification: 'Contexte AERORISQ indisponible', alerte: false, prefill: false }
  }

  let prediction: 'SA' | 'NS' | 'NA' | 'NV' = 'NV'
  let confiance = 40
  let alerte = false
  const parts: string[] = []

  // 1) Score domaine dégradé
  if (ctx.scoreDomaine < 40) {
    prediction = 'NS'
    confiance = 75
    alerte = true
    parts.push(`score domaine ${ctx.scoreDomaine}/100 (critique)`)
  } else if (ctx.scoreDomaine < 60) {
    prediction = 'NV'
    confiance = 55
    alerte = ctx.scoreGlobal < 50
    parts.push(`score domaine ${ctx.scoreDomaine}/100 (faible)`)
  } else if (ctx.scoreDomaine >= 70 && ctx.scoreGlobal >= 60) {
    prediction = 'SA'
    confiance = 70
    parts.push(`score domaine ${ctx.scoreDomaine}/100 favorable`)
  }

  // 2) Tendance
  if (ctx.tendance === 'baisse') {
    confiance = Math.max(20, confiance - 10)
    if (prediction === 'SA') { prediction = 'NV'; alerte = true }
    parts.push('tendance dégradée')
  } else if (ctx.tendance === 'hausse') {
    confiance = Math.min(100, confiance + 5)
  }

  // 3) Vigilance
  if (ctx.niveauVigilance === 'alerte' || ctx.niveauVigilance === 'critique') {
    alerte = true
    confiance = Math.min(confiance, ctx.niveauVigilance === 'critique' ? 45 : 55)
    if (prediction === 'SA') prediction = 'NV'
    parts.push(`vigilance ${ctx.niveauVigilance}`)
  }

  // 4) Black swans
  if (ctx.blackSwans.length > 0) {
    alerte = true
    if (prediction !== 'NS') { prediction = 'NS'; confiance = Math.min(confiance + 5, 85) }
    parts.push('signal faible AERORISQ')
  }

  // 5) HMM transition
  if (ctx.hmmTransition) {
    alerte = true
    if (prediction !== 'NS') prediction = 'NV'
    parts.push('transition HMM en cours')
  }

  // 6) Prédictions AERORISQ
  if (ctx.predictions && ctx.predictions.score6m < ctx.scoreGlobal - 10) {
    alerte = true
    if (prediction !== 'NS') prediction = 'NV'
    parts.push(`prédiction 6m en baisse (${ctx.predictions.score6m})`)
  }

  // Confiance plancher/plafond
  confiance = Math.max(20, Math.min(99, confiance))

  const justification = parts.length > 0
    ? `AERORISQ : ${parts.join(' ; ')}`
    : 'AERORISQ : profil stable — prédiction par défaut'

  return {
    prediction,
    confiance,
    justification,
    alerte,
    prefill: confiance >= 70 && prediction !== 'NV',
  }
}

export function buildPromptContext(
  profil: ProfilRisque | null,
  result: RiskAnalysisResult | null,
  domaine: string
): string {
  if (!profil) return ''
  const ctx = construireContexteDomaine(domaine, profil, result ?? undefined)
  if (!ctx) return ''

  const lines: string[] = [
    `CONTEXTE AERORISQ POUR LE DOMAINE ${domaine} :`,
    `- Score global : ${ctx.scoreGlobal}/100 (${ctx.niveau})`,
    `- Score domaine : ${ctx.scoreDomaine}/100`,
    `- Tendance : ${ctx.tendance}`,
    `- Vigilance : ${ctx.niveauVigilance}`,
  ]

  if (ctx.predictions) {
    lines.push(`- Prédiction 3 mois : ${ctx.predictions.score3m}/100`)
    lines.push(`- Prédiction 6 mois : ${ctx.predictions.score6m}/100`)
  }
  if (ctx.blackSwans.length > 0) {
    lines.push(`- Signaux faibles : ${ctx.blackSwans.length} détecté(s)`)
  }
  if (ctx.hmmTransition) {
    lines.push('- Transition HMM en cours — risque accru de bascule')
  }

  lines.push('')
  lines.push('INSTRUCTION : Utilise ce contexte pour prioriser les items. Si le score domaine est < 60, génère plus d\'items de vérification approfondie. Si le score est ≥ 70, concentre-toi sur les points de maintien.')

  return lines.join('\n')
}

// ── Phase 2 : Feedback ──

export interface DomaineConformiteResult {
  domaine: string
  totalItems: number
  saCount: number
  nsCount: number
  naCount: number
  nvCount: number
  tauxConformite: number  // SA / (SA + NS)
  niveau: 'bon' | 'moyen' | 'faible' | 'critique'
}

export function computeDomaineConformite(
  items: Array<{ resultat?: string; domaine: string }>
): DomaineConformiteResult[] {
  const parDomaine = new Map<string, { sa: number; ns: number; na: number; nv: number }>()

  for (const item of items) {
    const r = item.resultat || 'NV'
    if (!parDomaine.has(item.domaine)) {
      parDomaine.set(item.domaine, { sa: 0, ns: 0, na: 0, nv: 0 })
    }
    const stats = parDomaine.get(item.domaine)!
    if (r === 'SA') stats.sa++
    else if (r === 'NS') stats.ns++
    else if (r === 'NA') stats.na++
    else stats.nv++
  }

  return Array.from(parDomaine.entries()).map(([domaine, stats]) => {
    const denom = stats.sa + stats.ns
    const tauxConformite = denom > 0 ? Math.round((stats.sa / denom) * 100) : 100
    const niveau = tauxConformite >= 80 ? 'bon' : tauxConformite >= 60 ? 'moyen' : tauxConformite >= 40 ? 'faible' : 'critique'
    return {
      domaine,
      totalItems: stats.sa + stats.ns + stats.na + stats.nv,
      saCount: stats.sa,
      nsCount: stats.ns,
      naCount: stats.na,
      nvCount: stats.nv,
      tauxConformite,
      niveau,
    }
  })
}

export function mapConformiteToEffectiveness(taux: number): 'efficace' | 'partiel' | 'inefficace' {
  if (taux >= 80) return 'efficace'
  if (taux >= 50) return 'partiel'
  return 'inefficace'
}

export function mapNiveauToEffectiveness(niveau: DomaineConformiteResult['niveau']): 'efficace' | 'partiel' | 'inefficace' {
  if (niveau === 'bon') return 'efficace'
  if (niveau === 'moyen') return 'partiel'
  return 'inefficace'
}

export const kitAerorisqBridge = {
  mapDomaineToCScore,
  getScoreDomaine,
  construireContexteDomaine,
  predicterItemAvecAerorisq,
  buildPromptContext,
  computeDomaineConformite,
  mapConformiteToEffectiveness,
  mapNiveauToEffectiveness,
}
