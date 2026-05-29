// lib/ia/agents/riskAgent.ts
// Agent 1 — Profil Risque (moteur du système)
// Analyse quantitative locale + narratif IA (Groq Llama 3.3 70B)

'use client'

import { useAppStore, ProfilRisque, ScoreHistoryPoint, Ecart, Aerodrome } from '@/lib/store'
import {
  computeVelocityMetrics,
  computeHawkesContagion,
  computeSystemStress,
  computeProactiveAlert,
  detectChangePoints,
  predictRiskScore,
  predictWithEWMA,
  computeHistoricalVolatility,
} from '@/lib/risque'
import { detectBlackSwan } from '@/lib/risque/bayesian'
import { aiClient } from '@/lib/ia/aiClient'
import { RISK_SYSTEM_PROMPT } from '@/lib/ia/prompts'

export interface RiskAnalysisRequest {
  aerodromeId: string
  includePredictions?: boolean
  includeBlackSwan?: boolean
  includeSuggestions?: boolean
  horizonMonths?: number
}

export interface RiskAnalysisResult {
  profil: ProfilRisque | null
  predictions?: {
    score3m: number
    score6m: number
    score12m: number
    confidence: number
    intervals: {
      score3m: [number, number]
      score6m: [number, number]
      score12m: [number, number]
    }
  }
  velocityMetrics?: ReturnType<typeof computeVelocityMetrics>
  hawkesRisk?: ReturnType<typeof computeHawkesContagion>
  systemStress?: ReturnType<typeof computeSystemStress>
  proactiveAlert?: ReturnType<typeof computeProactiveAlert>
  changePoints?: ReturnType<typeof detectChangePoints>
  survival?: { medianDays: number; hazard90d: number; hazard180d: number }
  extremeValue?: { returnLevel1y: number; isHeavyTailed: boolean; maxExpected12m: number; tailRisk: number }
  hiddenMarkov?: { currentState: string; isTransitioning: boolean; transitionRisk: number; daysToCritical: number }
  negativeBinomial?: { mean: number; isOverdispersed: boolean; expectedMax: number; recommendedDistribution: string }
  copulas?: { correlationMatrix: number[][]; worstCaseProbability: number; worstCaseDescription: string }
  thompsonSampling?: { bestAction: string; bestProbability: number; expectedRewards: Record<string, number> }
  blackSwans?: Array<{
    domaine: string
    priorProbability: number
    posteriorProbability: number
    message: string
  }>
  suggestions?: Array<{
    type: 'surveillance' | 'ecart' | 'formation' | 'barriere'
    titre: string
    description: string
    priorite: 'critique' | 'haute' | 'normale' | 'basse'
    domaines: string[]
    sousDomaines?: string[]
    confiance: number
  }>
  // Nouveaux champs IA
  aiAnalysis?: {
    narrative: string           // Analyse narrative complète
    keyInsights: string[]       // Points clés détectés
    immediateActions: string[]  // Actions immédiates prioritaires
    mediumTermActions: string[] // Actions à moyen terme
    riskExplanation: string     // Explication du score
  }
  confidence: number
  computedAt: string
}

export interface RiskAnalysisData {
  aerodromeId: string
  historique: ScoreHistoryPoint[]
  profil: ProfilRisque | null
  ecarts: Ecart[]
  aerodrome: Aerodrome | null
}

export class RiskAgent {
  private initialized: boolean = false
  private lastAnalysisCache: Map<string, RiskAnalysisResult> = new Map()
  private cacheTTL = 3600000 // 1h — invalidé si données changent

  async init(_storeData: any): Promise<void> {
    this.initialized = true
  }

  // ============================================================
  // ANALYSE PRINCIPALE
  // ============================================================

  async analyzeRisk(
    request: RiskAnalysisRequest,
    storeData: any
  ): Promise<RiskAnalysisResult> {
    const cacheKey = `${request.aerodromeId}_${request.includePredictions}_${request.includeBlackSwan}`
    const cached = this.lastAnalysisCache.get(cacheKey)
    if (cached && Date.now() - new Date(cached.computedAt).getTime() < this.cacheTTL) {
      return cached
    }

    const store = useAppStore.getState()
    const profil = store.profilsRisque[request.aerodromeId] ?? null
    const historique = store.historiqueScores?.[request.aerodromeId] ?? []
    const ecarts = store.ecarts.filter((e: Ecart) => e.aerodrome_id === request.aerodromeId)
    const aerodrome = store.aerodromes.find((a: Aerodrome) => a.id === request.aerodromeId) ?? null

    const data: RiskAnalysisData = { aerodromeId: request.aerodromeId, historique, profil, ecarts, aerodrome }

    const result: RiskAnalysisResult = { profil, confidence: 0, computedAt: new Date().toISOString() }

    // Calculs quantitatifs (rapides, locaux)
    if (historique.length >= 3) result.velocityMetrics = computeVelocityMetrics(historique)
    if (ecarts.length > 0) {
      result.hawkesRisk = computeHawkesContagion(
        ecarts.map((e: Ecart) => ({ createdAt: e.created_at, niveau: e.niveau_risque }))
      )
    }
    if (profil && result.velocityMetrics) result.systemStress = computeSystemStress(profil, ecarts, result.velocityMetrics)
    if (profil && historique.length > 0 && result.hawkesRisk) result.proactiveAlert = computeProactiveAlert(profil, historique, result.hawkesRisk)
    if (historique.length >= 5) result.changePoints = detectChangePoints(historique)
    if (request.includePredictions !== false) result.predictions = await this.computePredictions(data, request.horizonMonths ?? 12)
    if (request.includeBlackSwan !== false && profil && historique.length >= 6) result.blackSwans = await this.detectBlackSwans(data)

    // Suggestions structurées (locale)
    if (request.includeSuggestions !== false && profil) result.suggestions = this.buildStructuredSuggestions(data)

    // Nouveaux modèles avancés — via ModelCache partagé (1 seul calcul pour tous)
    if (result.predictions && historique.length >= 3 && profil) {
      try {
        const { modelCache } = await import('@/lib/risque/modelCache')
        const scoresHist = historique.map(h => h.score)
        const cached = modelCache.computeAll(request.aerodromeId, scoresHist, profil)

        if (cached.hmm) result.hiddenMarkov = {
          currentState: cached.hmm.currentStateName,
          isTransitioning: cached.hmm.isTransitioning,
          transitionRisk: cached.hmm.transitionRisk,
          daysToCritical: cached.hmm.daysToCritical,
        }
        if (cached.survival) result.survival = {
          medianDays: cached.survival.medianSurvivalDays || 90,
          hazard90d: cached.survival.hazard90days,
          hazard180d: cached.survival.hazard180days,
        }
        if (cached.evt) result.extremeValue = {
          returnLevel1y: cached.evt.returnLevel1y,
          isHeavyTailed: cached.evt.isHeavyTailed,
          maxExpected12m: cached.evt.maxExpected12m,
          tailRisk: cached.evt.probabilityExtreme,
        }
        if (cached.nb) result.negativeBinomial = {
          mean: cached.nb.mean,
          isOverdispersed: cached.nb.isOverdispersed,
          expectedMax: cached.nb.expectedMax,
          recommendedDistribution: cached.nb.recommendedDistribution,
        }
        if (cached.copula) result.copulas = {
          correlationMatrix: [],
          worstCaseProbability: cached.copula.worstCaseScenario.probability,
          worstCaseDescription: cached.copula.worstCaseScenario.description,
        }
        if (cached.ts) result.thompsonSampling = {
          bestAction: cached.ts.recommend(`${request.aerodromeId}_diagnostic`).name,
          bestProbability: cached.ts.bestProbability,
          expectedRewards: {},
        }
      } catch { /* Modèles indisponibles */ }
    }

    // Analyse IA narrative
    result.confidence = this.computeGlobalConfidence(result)

    this.lastAnalysisCache.set(cacheKey, result)
    return result
  }

  // Méthode séparée pour l'analyse narrative IA — appelée par les composants qui en ont besoin
  async getAIAnalysis(
    aerodromeId: string,
    result: RiskAnalysisResult
  ): Promise<RiskAnalysisResult['aiAnalysis']> {
    const store = useAppStore.getState()
    const aerodrome = store.aerodromes.find((a: Aerodrome) => a.id === aerodromeId)
    const profil = result.profil
    if (!profil) return undefined

    const ecartsCritiques = store.ecarts.filter(
      (e: Ecart) => e.aerodrome_id === aerodromeId && e.niveau_risque === 'critique' && e.statut !== 'cloture'
    )
    const ecartsEleves = store.ecarts.filter(
      (e: Ecart) => e.aerodrome_id === aerodromeId && e.niveau_risque === 'eleve' && e.statut !== 'cloture'
    )

    const contextData = {
      aerodrome: aerodrome ? `${aerodrome.code_oaci} — ${aerodrome.nom} (${aerodrome.categorie_sslia || 'NC'})` : aerodromeId,
      score_global: profil.score_global,
      niveau: profil.niveau,
      tendance: profil.tendance,
      criteres: { C1: profil.c1, C2: profil.c2, C3: profil.c3, C4: profil.c4, C5: profil.c5 },
      ecarts_critiques: ecartsCritiques.length,
      ecarts_eleves: ecartsEleves.length,
      alertes: result.proactiveAlert?.niveauUrgence ?? 'info',
      stress_systeme: result.systemStress?.score?.toFixed(1) ?? 'N/A',
      contagion_hawkes: result.hawkesRisk?.riskNext30Days?.toFixed(0) ?? 'N/A',
      predictions: result.predictions
        ? `3m: ${result.predictions.score3m}, 6m: ${result.predictions.score6m}, 12m: ${result.predictions.score12m}`
        : 'N/A',
      black_swans: result.blackSwans?.map(bs => bs.domaine).join(', ') ?? 'Aucun',
    }

    type AIAnalysisJSON = {
      narrative: string
      keyInsights: string[]
      immediateActions: string[]
      mediumTermActions: string[]
      riskExplanation: string
    }

    const fallback: AIAnalysisJSON = {
      narrative: `L'aérodrome ${contextData.aerodrome} présente un score de risque de ${profil.score_global}/100 (${profil.niveau}).`,
      keyInsights: [],
      immediateActions: [],
      mediumTermActions: [],
      riskExplanation: `Score calculé sur 5 critères : C1=${profil.c1}, C2=${profil.c2}, C3=${profil.c3}, C4=${profil.c4}, C5=${profil.c5}`,
    }

    const userMessage = `Analyse le profil de risque suivant et retourne un JSON avec ces champs exactement :
{
  "narrative": "Analyse narrative complète en 3-4 phrases",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "immediateActions": ["action urgente 1", "action urgente 2"],
  "mediumTermActions": ["action 3-6 mois 1", "action 3-6 mois 2"],
  "riskExplanation": "Explication du niveau de risque en 1-2 phrases"
}

DONNÉES :
${JSON.stringify(contextData, null, 2)}`

    return aiClient.callJSON<AIAnalysisJSON>(
      {
        systemPrompt: RISK_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3,
        maxTokens: 1024,
        responseFormat: 'json_object',
      },
      fallback
    )
  }

  // Analyse comparative IA entre aérodromes
  async compareAerodromesAI(
    aerodromeIds: string[]
  ): Promise<{
    rankings: Array<{ aerodromeId: string; score: number; rank: number; code_oaci?: string }>
    averageScore: number
    bestPractices: string[]
    alertAerodromes: string[]
    aiSummary: string
  }> {
    const store = useAppStore.getState()
    const profils = aerodromeIds
      .map(id => ({ id, profil: store.profilsRisque[id], aerodrome: store.aerodromes.find((a: Aerodrome) => a.id === id) }))
      .filter(p => p.profil != null) as Array<{ id: string; profil: ProfilRisque; aerodrome: Aerodrome }>

    const sorted = [...profils].sort((a, b) => b.profil.score_global - a.profil.score_global)
    const rankings = sorted.map((p, idx) => ({
      aerodromeId: p.id,
      score: p.profil.score_global,
      rank: idx + 1,
      code_oaci: p.aerodrome?.code_oaci,
    }))
    const averageScore = Math.round(profils.reduce((s, p) => s + p.profil.score_global, 0) / profils.length)
    const alertAerodromes = profils.filter(p => p.profil.score_global < 40 || p.profil.tendance === 'baisse').map(p => p.id)

    // Générer best practices et summary avec IA
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]

    const contextData = {
      nb_aerodromes: profils.length,
      score_moyen: averageScore,
      meilleur: best ? `${best.aerodrome?.code_oaci} (${best.profil.score_global}/100)` : 'N/A',
      pire: worst ? `${worst.aerodrome?.code_oaci} (${worst.profil.score_global}/100)` : 'N/A',
      en_alerte: alertAerodromes.length,
      classement: rankings.map(r => `${r.code_oaci ?? r.aerodromeId}: ${r.score}/100`).join(', '),
    }

    type CompareJSON = { bestPractices: string[]; summary: string }
    const fallback: CompareJSON = {
      bestPractices: best?.profil.c1 >= 80 ? ['SGS mature au meilleur aérodrome'] : [],
      summary: `${profils.length} aérodromes analysés, score moyen ${averageScore}/100.`,
    }

    const aiResult = await aiClient.callJSON<CompareJSON>(
      {
        systemPrompt: RISK_SYSTEM_PROMPT,
        userMessage: `Compare ces aérodromes et retourne JSON {"bestPractices": ["..."], "summary": "..."}:
${JSON.stringify(contextData, null, 2)}`,
        temperature: 0.3,
        maxTokens: 512,
        responseFormat: 'json_object',
      },
      fallback
    )

    return { rankings, averageScore, bestPractices: aiResult.bestPractices, alertAerodromes, aiSummary: aiResult.summary }
  }

  // ============================================================
  // PRÉDICTIONS QUANTITATIVES (inchangées)
  // ============================================================

  private async computePredictions(data: RiskAnalysisData, horizonMonths: number): Promise<RiskAnalysisResult['predictions']> {
    const { historique, profil } = data
    if (historique.length < 3) {
      const s = profil?.score_global ?? 70
      return {
        score3m: s, score6m: s, score12m: s, confidence: 30,
        intervals: { score3m: [Math.max(0, s - 15), Math.min(100, s + 15)], score6m: [Math.max(0, s - 20), Math.min(100, s + 20)], score12m: [Math.max(0, s - 30), Math.min(100, s + 30)] },
      }
    }
    const regression = predictRiskScore(historique)
    const ewma3m = predictWithEWMA(historique, 0.3, 3)
    const ewma6m = predictWithEWMA(historique, 0.5, 6)
    const ewma12m = predictWithEWMA(historique, 0.7, 12)
    const score3m = Math.round(regression.score3m * 0.4 + ewma3m * 0.6)
    const score6m = Math.round(regression.score6m * 0.4 + ewma6m * 0.6)
    // Extrapolate 12m from linear regression: score6m + 2*(score6m - score3m)
    const regrScore12m = Math.min(100, Math.max(0, regression.score6m + 2 * (regression.score6m - regression.score3m)))
    const score12m = Math.round(regrScore12m * 0.3 + ewma12m * 0.7)
    const scores = historique.map(h => h.score)
    const volatility = computeHistoricalVolatility(scores)
    let local3m = score3m, local6m = score6m
    const confidence = Math.min(95, Math.max(40, 100 - volatility * 2))
    // Conformal prediction + Transfer learning
    let confIntervals = {
      score3m: [score3m - volatility * 1.5, score3m + volatility * 1.5] as [number, number],
      score6m: [score6m - volatility * 2, score6m + volatility * 2] as [number, number],
      score12m: [score12m - volatility * 3, score12m + volatility * 3] as [number, number],
    }
    let transferAdjusted = false
    try {
      const { computeConformalInterval, findSimilarAerodromes, bandit } = await import('@/lib/risque')
      // Conformal
      const actuals = historique.slice(-6).map(h => h.score)
      const preds = historique.slice(0, -6).map(h => h.score)
      if (actuals.length >= 3 && preds.length >= 3) {
        const ci3 = computeConformalInterval(preds, actuals, score3m) as any
        const ci6 = computeConformalInterval(preds, actuals, score6m) as any
        const ci12 = computeConformalInterval(preds, actuals, score12m) as any
        confIntervals = {
          score3m: [ci3.lower ?? ci3[0] ?? score3m - volatility, ci3.upper ?? ci3[1] ?? score3m + volatility],
          score6m: [ci6.lower ?? ci6[0] ?? score6m - volatility * 2, ci6.upper ?? ci6[1] ?? score6m + volatility * 2],
          score12m: [ci12.lower ?? ci12[0] ?? score12m - volatility * 3, ci12.upper ?? ci12[1] ?? score12m + volatility * 3],
        }
      }
      // Transfer learning : enrich with similar aerodromes
      if (data.aerodromeId) {
        const store = (await import('@/lib/store')).useAppStore.getState()
        const similar = findSimilarAerodromes(data.aerodromeId, store.aerodromes || [], store.profilsRisque || {})
        if (similar.length > 0) {
          const avg = similar.reduce((s: number, a: any) => s + (a.score || 70), 0) / similar.length
          transferAdjusted = true
          local3m = Math.round(local3m * 0.85 + avg * 0.15)
          local6m = Math.round(local6m * 0.85 + avg * 0.15)
        }
      }
    } catch { /* fallback to volatility */ }

    // ── Survival Analysis ──
    let survival: any = null
    try {
      const { predictSurvival } = await import('@/lib/risque/survival')
      const survEvents = historique.slice().reverse().map((h, i) => ({
        time: i * 30 + 1,
        event: h.score < 40,
        score: h.score,
        covariates: [h.score, profil?.score_global || 70],
      }))
      const survResult = predictSurvival(survEvents, [local3m, profil?.score_global || 70])
      survival = {
        medianDays: survResult.medianSurvivalDays,
        hazard90d: survResult.hazard90days,
        hazard180d: survResult.hazard180days,
      }
    } catch { /* survival unavailable */ }

    // ── Extreme Value Theory ──
    let evt: any = null
    try {
      const { predictEVT } = await import('@/lib/risque/extreme')
      const evtEvents = historique.map(h => ({ value: 100 - h.score, date: h.date || '' }))
      const evtResult = predictEVT(evtEvents)
      evt = {
        returnLevel1y: evtResult.returnLevel1y,
        isHeavyTailed: evtResult.isHeavyTailed,
        maxExpected12m: evtResult.maxExpected12m,
        tailRisk: evtResult.probabilityExtreme,
      }
    } catch { /* EVT unavailable */ }

    // ── Hidden Markov Model ──
    let hmm: any = null
    try {
      const { predictHMM } = await import('@/lib/risque/hmm')
      const obs = historique.map(h => h.score)
      const hmmResult = predictHMM(obs)
      hmm = {
        currentState: hmmResult.currentStateName,
        isTransitioning: hmmResult.isTransitioning,
        transitionRisk: hmmResult.transitionRisk,
        daysToCritical: hmmResult.daysToCritical,
      }
    } catch { /* HMM unavailable */ }

    return {
      score3m: Math.min(100, Math.max(0, local3m)),
      score6m: Math.min(100, Math.max(0, local6m)),
      score12m: Math.min(100, Math.max(0, score12m)),
      confidence,
      intervals: {
        score3m: [Math.min(100, Math.max(0, confIntervals.score3m[0])), Math.min(100, Math.max(0, confIntervals.score3m[1]))],
        score6m: [Math.min(100, Math.max(0, confIntervals.score6m[0])), Math.min(100, Math.max(0, confIntervals.score6m[1]))],
        score12m: [Math.min(100, Math.max(0, confIntervals.score12m[0])), Math.min(100, Math.max(0, confIntervals.score12m[1]))],
      },
    }
  }

  // ============================================================
  // BLACK SWAN
  // ============================================================

  private async detectBlackSwans(data: RiskAnalysisData): Promise<RiskAnalysisResult['blackSwans']> {
    const { profil, historique } = data
    if (!profil || historique.length < 6) return []
    const domaines = [
      { key: 'c1', nom: 'SGS' }, { key: 'c2', nom: 'PAC' }, { key: 'c3', nom: 'Conformité' },
      { key: 'c4', nom: 'Charge Critique' }, { key: 'c5', nom: 'Résilience' },
    ]
    const historiqueScores = historique.map(h => h.score)
    // priorMean = probabilité de RISQUE historique (1 - score moyen)
    // Un aérodrome sûr (score=85%) → priorMean=0.15 (15% risque historique)
    const avgScore = historiqueScores.reduce((a, b) => a + b, 0) / historiqueScores.length
    const priorMean = 1 - avgScore / 100
    const result: RiskAnalysisResult['blackSwans'] = []

    for (const domaine of domaines) {
      const currentValue = (profil as any)[domaine.key] as number
      // posterior = niveau de risque actuel sur ce domaine (inverse du score)
      const posterior = (100 - currentValue) / 100
      // Black Swan : aérodrome historiquement sûr (priorMean < 0.3) mais domaine soudainement à risque (posterior > 0.5)
      if (detectBlackSwan(priorMean, posterior, 0.5, 0.3)) {
        result.push({
          domaine: domaine.nom,
          priorProbability: Math.round(priorMean * 100),
          posteriorProbability: Math.round(posterior * 100),
          message: `Signal faible détecté sur ${domaine.nom} — écart significatif entre le niveau de risque historique (${Math.round(priorMean * 100)}%) et la situation actuelle (${Math.round(posterior * 100)}%). Inspection renforcée recommandée.`,
        })
      }
    }
    return result
  }

  // ============================================================
  // SUGGESTIONS STRUCTURÉES (calcul local)
  // ============================================================

  private buildStructuredSuggestions(data: RiskAnalysisData): RiskAnalysisResult['suggestions'] {
    const { profil, ecarts } = data
    if (!profil) return []
    const suggestions: RiskAnalysisResult['suggestions'] = []

    if (profil.score_global < 30) {
      suggestions.push({
        type: 'surveillance', titre: 'Surveillance mensuelle obligatoire',
        description: `Score critique ${profil.score_global}/100 — Audit complet multi-domaines requis immédiatement (RAS 14, §2.1.1)`,
        priorite: 'critique', domaines: ['SGS', 'PHY', 'OPS', 'SLI'],
        sousDomaines: ['Documentation SGS', 'Piste', 'Procédures', 'Véhicules SLI'], confiance: 95,
      })
    } else if (profil.score_global < 50) {
      suggestions.push({
        type: 'surveillance', titre: 'Surveillance trimestrielle renforcée',
        description: `Score faible ${profil.score_global}/100 — Inspection ciblée sur les domaines faibles`,
        priorite: 'haute', domaines: this.getWeakDomains(profil), confiance: 85,
      })
    }

    const ecartsCritiques = ecarts.filter((e: Ecart) => e.niveau_risque === 'critique' && e.statut !== 'cloture')
    if (ecartsCritiques.length > 0) {
      suggestions.push({
        type: 'ecart', titre: `Traitement prioritaire de ${ecartsCritiques.length} écart(s) critique(s)`,
        description: `${ecartsCritiques.length} écart(s) critique(s) non clôturé(s) — Délai PAC : 3 jours max (Procédure SGDA-PAC-001)`,
        priorite: 'critique', domaines: [...new Set(ecartsCritiques.map((e: Ecart) => e.domaine))], confiance: 95,
      })
    }

    if (profil.c1 < 50) {
      suggestions.push({
        type: 'formation', titre: 'Renforcement culture sécurité SGS',
        description: `C1 à ${profil.c1}/100 — Formation du personnel sur le Doc 9859 OACI (Système de Gestion de la Sécurité)`,
        priorite: 'haute', domaines: ['SGS'], sousDomaines: ['Documentation', 'Audits internes', 'Gestion des risques'], confiance: 80,
      })
    }

    if (profil.c5 < 50) {
      suggestions.push({
        type: 'barriere', titre: 'Audit du service SLI / SSLIA',
        description: `C5 à ${profil.c5}/100 — Vérification des véhicules, équipements et temps d'intervention (Annexe 14, §9.2.15)`,
        priorite: 'normale', domaines: ['SLI'], sousDomaines: ['Véhicules', "Temps d'intervention", 'Formation'], confiance: 78,
      })
    }

    if (profil.c2 < 45) {
      suggestions.push({
        type: 'ecart', titre: 'Révision du processus PAC',
        description: `C2 à ${profil.c2}/100 — Efficacité des plans correctifs insuffisante. Révision des procédures SGDA-PAC-001`,
        priorite: 'normale', domaines: ['PAC'], confiance: 72,
      })
    }

    return suggestions
  }

  private getWeakDomains(profil: ProfilRisque): string[] {
    const domains: string[] = []
    if (profil.c1 < 60) domains.push('SGS')
    if (profil.c2 < 60) domains.push('PAC')
    if (profil.c3 < 60) domains.push('PHY', 'OPS')
    if (profil.c4 < 60) domains.push('Écarts')
    if (profil.c5 < 60) domains.push('SLI')
    return domains.slice(0, 4)
  }

  private computeGlobalConfidence(result: RiskAnalysisResult): number {
    let sum = 0, n = 0
    if (result.velocityMetrics) { sum += result.velocityMetrics.volatilite < 10 ? 90 : result.velocityMetrics.volatilite < 20 ? 70 : 50; n++ }
    if (result.hawkesRisk) { sum += result.hawkesRisk.riskNext30Days < 30 ? 85 : result.hawkesRisk.riskNext30Days < 60 ? 65 : 45; n++ }
    if (result.predictions) { sum += result.predictions.confidence; n++ }
    if (result.proactiveAlert) { sum += result.proactiveAlert.niveauUrgence === 'info' ? 90 : result.proactiveAlert.niveauUrgence === 'vigilance' ? 70 : 50; n++ }
    return n > 0 ? Math.round(sum / n) : 50
  }

  // ============================================================
  // PRÉDICTION D'UN ITEM CHECKLIST (avec justification IA)
  // ============================================================

  async predictItem(
    aerodromeId: string,
    itemId: string,
    historiqueItem: any[]
  ): Promise<{ prediction: 'SA' | 'NS' | 'NA' | 'NV'; confidence: number; justification: string }> {
    if (historiqueItem.length === 0) {
      return { prediction: 'NV', confidence: 30, justification: "Aucun historique disponible pour cet item — première inspection." }
    }

    const derniers = historiqueItem.slice(-3).map(r => r.resultat)
    const saCount = derniers.filter(r => r === 'SA').length
    const nsCount = derniers.filter(r => r === 'NS').length

    let prediction: 'SA' | 'NS' | 'NA' | 'NV' = 'NV'
    let confidence = 50

    if (saCount >= 2) { prediction = 'SA'; confidence = Math.min(95, 70 + saCount * 10) }
    else if (nsCount >= 2) { prediction = 'NS'; confidence = Math.min(95, 75 + nsCount * 10) }
    else if (saCount === 1 && nsCount === 1) { prediction = 'NV'; confidence = 55 }

    // Justification IA basée sur le pattern
    const patternContext = {
      total_inspections: historiqueItem.length,
      derniers_resultats: derniers,
      taux_conformite: Math.round((historiqueItem.filter(r => r.resultat === 'SA').length / historiqueItem.length) * 100),
      tendance: saCount >= 2 ? 'amélioration' : nsCount >= 2 ? 'dégradation' : 'instable',
    }

    const aiResult = await aiClient.call({
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage: `En 1 phrase courte et précise, explique pourquoi cet item checklist sera probablement "${prediction}" lors de la prochaine inspection. Données: ${JSON.stringify(patternContext)}`,
      temperature: 0.3,
      maxTokens: 80,
    })

    return {
      prediction,
      confidence,
      justification: aiResult.ok ? aiResult.content.trim() : `${prediction === 'SA' ? 'Conforme' : 'Non-conforme'} sur ${saCount + nsCount}/3 dernières inspections.`,
    }
  }

  // ============================================================
  // COMPARAISON AÉRODROMES (version legacy compatible)
  // ============================================================

  async compareAerodromes(aerodromeIds: string[]): Promise<{
    rankings: Array<{ aerodromeId: string; score: number; rank: number }>
    averageScore: number
    bestPractices: string[]
    alertAerodromes: string[]
  }> {
    const result = await this.compareAerodromesAI(aerodromeIds)
    return { rankings: result.rankings, averageScore: result.averageScore, bestPractices: result.bestPractices, alertAerodromes: result.alertAerodromes }
  }

  invalidateCache(aerodromeId?: string): void {
    if (aerodromeId) {
      for (const key of this.lastAnalysisCache.keys()) {
        if (key.startsWith(aerodromeId)) this.lastAnalysisCache.delete(key)
      }
    } else {
      this.lastAnalysisCache.clear()
    }
  }

  isReady(): boolean { return this.initialized }
}

export const riskAgent = new RiskAgent()
