// lib/ia/agents/inspecteurVirtuelAgent.ts
// Agent Inspecteur Virtuel — point d'entrée unique AERORISQ
// Remplace tous les appels IA directs dans le flux Kit Inspecteur

'use client'

import { useAppStore, type ProfilRisque, type KitDocument, type KitChecklistItemGenere } from '@/lib/store'
import { riskAgent, type RiskAnalysisResult } from '@/lib/ia/agents/riskAgent'
import { kitDocAgent, generateKitChecklist, type KitDocAnalysis, type KitDocChecklistParams, type KitChecklistResult, type TypeSurveillanceKit, type TypeEntite } from '@/lib/ia/agents/kitDocAgent'
import { checklistFeedbackEngine, type ChecklistFeedbackReport } from '@/lib/ia/agents/checklistFeedbackEngine'
import { kitAerorisqBridge, type AerorisqItemPrediction } from '@/lib/ia/bridge/kitAerorisqBridge'
import { modelOrchestrator } from '@/lib/ia/engines/modelOrchestrator'
import { aiClient } from '@/lib/ia/aiClient'
import { GENERER_SGS_QUESTIONS_PROMPT, SUGGEST_DIRECTIVES_PROMPT, SUGGEST_QUESTION_PROMPT, SUGGEST_GUIDE_PROMPT } from '@/lib/ia/prompts'
import type { SuggestedDirectives } from '@/lib/ia/suggestDirectives'

export interface SGSEvaluationParams {
  aerodromeType: 'international' | 'national'
  maturiteInitiale?: number
  composanteId: 1 | 2 | 3 | 4 | 5
  elementId: string
  elementLabel: string
  existingQuestions?: { ref: string; texte: string }[]
  documentsActifs?: KitDocument[]
}

export interface SGSEvaluationResult {
  questions: { ref: string; texte: string; sourceReglementaire: string }[]
  directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
  guideEtapes: { etape: number; titre: string; actions: string[] }[]
  justification: string
}

export class InspecteurVirtuelAgent {
  private initialized = false
  private aerorisqCache = new Map<string, { profil: ProfilRisque; analysis: RiskAnalysisResult }>()

  async init(): Promise<void> {
    if (this.initialized) return
    await riskAgent.init({})
    await kitDocAgent.init()
    this.initialized = true
  }

  isReady(): boolean {
    return this.initialized
  }

  // ── Contexte AERORISQ ──

  private async getOrBuildAerorisqContext(aerodromeId: string): Promise<{ profil: ProfilRisque | null; analysis: RiskAnalysisResult | null }> {
    const store = useAppStore.getState()
    const profil = store.profilsRisque[aerodromeId] ?? null
    if (!profil) return { profil: null, analysis: null }

    const cached = this.aerorisqCache.get(aerodromeId)
    if (cached && cached.profil === profil) return cached

    const analysis = await riskAgent.analyzeRisk({
      aerodromeId,
      includePredictions: true,
      includeBlackSwan: true,
    })
    this.aerorisqCache.set(aerodromeId, { profil, analysis })
    return { profil, analysis }
  }

  // ── Analyse documentaire ──

  async analyzeDocument(doc: KitDocument): Promise<KitDocAnalysis> {
    return kitDocAgent.analyzeDocument(doc)
  }

  // ── Génération d'items checklist avec AERORISQ ──

  async generateChecklistItems(params: {
    docId: string
    domaine: string
    type_entite: TypeEntite
    aerodromeId?: string
  }): Promise<KitChecklistItemGenere[]> {
    if (!params.aerodromeId) {
      return kitDocAgent.genererItemsPourDocument(params.docId, [params.domaine], params.type_entite)
    }
    return riskAgent.generateChecklistItems(params)
  }

  async generateChecklist(params: KitDocChecklistParams): Promise<KitChecklistResult> {
    const { entite_id, portee } = params
    const domainesActifs = (await import('@/lib/domaines')).expandDomaines(portee)

    if (entite_id && useAppStore.getState().profilsRisque[entite_id]) {
      const ctx = await this.getOrBuildAerorisqContext(entite_id)
      if (ctx.profil) {
        const modelSelection = modelOrchestrator.selectModel({ profil: ctx.profil })
        console.log(`[InspecteurVirtuel] Génération checklist avec modèle ${modelSelection.selected} (confiance ${modelSelection.confidence})`)
      }
    }

    return generateKitChecklist(params)
  }

  // ── Prédiction d'item ──

  predictItem(domaine: string, profil?: ProfilRisque | null, analysis?: RiskAnalysisResult | null): AerorisqItemPrediction {
    return kitAerorisqBridge.predicterItemAvecAerorisq(domaine, profil ?? null, analysis ?? undefined)
  }

  async predictItemWithHistory(
    aerodromeId: string,
    itemId: string,
    historiqueItem: any[]
  ): Promise<{ prediction: 'SA' | 'NS' | 'NA' | 'NV'; confidence: number; justification: string }> {
    return riskAgent.predictItem(aerodromeId, itemId, historiqueItem)
  }

  // ── Adaptation checklist à l'entité (R1-R10) ──

  adaptChecklistToEntity(checklist: any[], aerodrome: any): any[] {
    return kitDocAgent.filterChecklistByAerodrome(checklist, aerodrome)
  }

  // ── Application du profil risque à une checklist ──

  applyRiskProfileToChecklist(
    checklist: any[],
    params: {
      entite_id: string
      type_entite: TypeEntite
      type_surveillance: TypeSurveillanceKit
      portee: string[]
      profil_risque?: ProfilRisque
    }
  ): any[] {
    return kitDocAgent.applyRiskProfileToChecklist(checklist, params)
  }

  // ── Injection dans le store ──

  injectIntoStore(surveillanceId: string, result: KitChecklistResult): void {
    kitDocAgent.injectIntoStore(surveillanceId, result)
  }

  // ── Évaluation SGS (PAOE) avec contexte AERORISQ ──

  async generateSGSEvaluation(params: SGSEvaluationParams): Promise<SGSEvaluationResult> {
    const { aerodromeType, maturiteInitiale, composanteId, elementId, elementLabel, existingQuestions, documentsActifs } = params

    const composanteLabels: Record<number, string> = {
      1: 'Politique & objectifs de sécurité',
      2: 'Gestion des risques',
      3: 'Assurance sécurité',
      4: 'Promotion sécurité',
      5: 'Gestion des interfaces',
    }

    const docsContext = documentsActifs && documentsActifs.length > 0
      ? `Documents réglementaires actifs:\n${documentsActifs.map(d => `- ${d.nom} (${d.reference_base || d.type_document}) v${d.version}`).join('\n')}`
      : 'Documents de référence: RAS 19 (Annexe 19 OACI), RAS 14 (Aérodromes), Doc 9859'

    const existingContext = existingQuestions && existingQuestions.length > 0
      ? `Questions existantes (à conserver ou mettre à jour):\n${existingQuestions.map(q => `- ${q.ref}: ${q.texte}`).join('\n')}`
      : 'Première génération — aucune question existante'

    const maturiteContext = maturiteInitiale !== undefined
      ? maturiteInitiale < 25
        ? 'Aérodrome avec SGS naissant — privilégier les questions fondamentales (niveau Présent/Approprié)'
        : maturiteInitiale < 50
          ? 'Aérodrome avec SGS en développement — équilibrer questions fondamentales et avancées'
          : maturiteInitiale < 75
            ? 'Aérodrome avec SGS mature — inclure questions niveau Opérationnel/Efficace'
            : 'Aérodrome avec SGS très mature — focus sur l\'efficacité et l\'amélioration continue'
      : 'Niveau de maturité inconnu — générer un ensemble complet et progressif'

    const systemPrompt = GENERER_SGS_QUESTIONS_PROMPT

    type SGSGenerationResult = {
      questions: { ref: string; texte: string; sourceReglementaire: string }[]
      directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
      guideEtapes: { etape: number; titre: string; actions: string[] }[]
      justification: string
    }

    const userMessage = `${docsContext}

Composante ${composanteId}: ${composanteLabels[composanteId]}
Élément: ${elementId} — ${elementLabel}
Type d'aérodrome: ${aerodromeType}
${maturiteContext}

${existingContext}

Génère un JSON avec cette structure exacte:
{
  "questions": [
    {"ref": "SGS-X.X", "texte": "Question précise...", "sourceReglementaire": "RAS 19 §X.X.X"}
  ],
  "directives": {
    "present": ["Critère objectif pour niveau Présent..."],
    "approprie": ["Critère objectif pour niveau Approprié..."],
    "operationnel": ["Critère objectif pour niveau Opérationnel..."],
    "efficace": ["Critère objectif pour niveau Efficace..."]
  },
  "guideEtapes": [
    {"etape": 1, "titre": "Vérifier la documentation", "actions": ["Action 1", "Action 2"]},
    {"etape": 2, "titre": "Vérifier la mise en oeuvre", "actions": ["Action 1", "Action 2"]}
  ],
  "justification": "Pourquoi ces questions sont pertinentes pour cet élément..."
}`

    const result = await aiClient.callJSON<SGSGenerationResult>(
      {
        systemPrompt,
        userMessage,
        temperature: 0.2,
        maxTokens: 32768,
        responseFormat: 'json_object',
      },
      {
        questions: [
          { ref: `${elementId}.q1`, texte: `La politique de sécurité de l'élément ${elementLabel} est-elle documentée et approuvée?`, sourceReglementaire: 'RAS 19 §3.1' },
          { ref: `${elementId}.q2`, texte: `Les responsabilités liées à ${elementLabel} sont-elles clairement attribuées?`, sourceReglementaire: 'RAS 19 §3.2' },
          { ref: `${elementId}.q3`, texte: `Les processus de ${elementLabel} sont-ils régulièrement évalués?`, sourceReglementaire: 'Doc 9859 §5.3' },
        ],
        directives: { present: ['Documenté et accessible', 'Procédure formalisée'], approprie: ['Adapté au contexte de l\'aérodrome', 'Revu par la direction'], operationnel: ['Appliqué au quotidien', 'Registres tenus à jour'], efficace: ['Résultats mesurables', 'Amélioration continue démontrée'] },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier la documentation', actions: ['Consulter les manuels SGS', 'Vérifier la signature et la date'] },
          { etape: 2, titre: 'Entretien avec le responsable', actions: ['Questionner sur l\'application', 'Identifier les écarts éventuels'] },
          { etape: 3, titre: 'Observation terrain', actions: ['Vérifier les registres', 'Confirmer la conformité'] }
        ],
        justification: 'Questions par défaut générées par le système — l\'analyse IA n\'a pas abouti',
      }
    )

    return result
  }

  // ── Suggestion des critères SA/NS/NV/NA depuis le guide d'évaluation ──
  // Délègue à AERORISQ : inclut le contexte de risque de l'aérodrome quand disponible.

  async suggestDirectives(params: {
    directivePreuve: string
    pointVerification: string
    referenceReglementaire: string
    aerodromeId?: string
    domaine?: string
  }): Promise<SuggestedDirectives> {
    const trimmed = (params.directivePreuve || '').trim()
    if (!trimmed) {
      return { directive_sa: '', directive_ns: '', directive_nv: '', directive_na: '' }
    }

    let aerorisqContext = ''
    if (params.aerodromeId) {
      // Contexte léger (sans analyzeRisk, coûteux) : scores, tendance, vigilance du profil.
      const profil = useAppStore.getState().profilsRisque[params.aerodromeId] ?? null
      if (profil) {
        const domaineCode = params.domaine || 'SGS'
        const domaineCtx = kitAerorisqBridge.construireContexteDomaine(domaineCode, profil)
        if (domaineCtx) {
          aerorisqContext = [
            `CONTEXTE AERORISQ DE L'AÉRODROME :`,
            `- Score global : ${domaineCtx.scoreGlobal}/100 (${domaineCtx.niveau})`,
            `- Score domaine (${domaineCode}) : ${domaineCtx.scoreDomaine}/100`,
            `- Tendance : ${domaineCtx.tendance}`,
            `- Vigilance : ${domaineCtx.niveauVigilance}`,
          ].join('\n')
          if (domaineCtx.blackSwans.length > 0) {
            aerorisqContext += `\n- Signaux faibles : ${domaineCtx.blackSwans.length} détecté(s)`
          }
          if (domaineCtx.hmmTransition) {
            aerorisqContext += '\n- Transition HMM en cours — risque accru de bascule'
          }
        }
      }
    }

    const userMessage = `QUESTION À VÉRIFIER :
${params.pointVerification || '(non spécifiée)'}

RÉFÉRENCE RÉGLEMENTAIRE : ${params.referenceReglementaire || '(non spécifiée)'}

GUIDE D'ÉVALUATION :
${trimmed}
${aerorisqContext ? `\n${aerorisqContext}` : ''}

Déduis les critères SA, NS, NV, NA spécifiques à cette question. Réponds en JSON.`

    const result = await aiClient.callJSON<SuggestedDirectives>(
      {
        systemPrompt: SUGGEST_DIRECTIVES_PROMPT,
        userMessage,
        temperature: 0.15,
        maxTokens: 4096,
        responseFormat: 'json_object',
      },
      { directive_sa: '', directive_ns: '', directive_nv: '', directive_na: '' },
    )

    // Normalisation : accepte directive_sa/ns/nv/na (schéma attendu) ou SA/NS/NV/NA (convention du modèle)
    const r = result as unknown as Record<string, string | undefined>
    const get = (directiveKey: string, shortKey: string) =>
      String(r[directiveKey] ?? r[shortKey] ?? '').trim()

    return {
      directive_sa: get('directive_sa', 'SA'),
      directive_ns: get('directive_ns', 'NS'),
      directive_nv: get('directive_nv', 'NV'),
      directive_na: get('directive_na', 'NA'),
    }
  }

  // ── Suggestion d'une question (point de vérification) ──

  async suggestQuestion(params: {
    questionActuelle: string
    referenceReglementaire?: string
    guideEtape?: string
    directiveSA?: string
    aerodromeId?: string
    domaine?: string
  }): Promise<{ question: string }> {
    const userMessage = `QUESTION ACTUELLE :
${params.questionActuelle || '(non spécifiée)'}

RÉFÉRENCE RÉGLEMENTAIRE : ${params.referenceReglementaire || '(non spécifiée)'}
${params.guideEtape ? `GUIDE D'ÉVALUATION EXISTANT :\n${params.guideEtape}` : ''}
${params.directiveSA ? `CRITÈRE SA EXISTANT (décrit l'objet attendu) :\n${params.directiveSA}` : ''}

Rédige le point de vérification clair et actionnable. Réponds en JSON.`

    const result = await aiClient.callJSON<{ question?: string }>(
      {
        systemPrompt: SUGGEST_QUESTION_PROMPT,
        userMessage,
        temperature: 0.3,
        maxTokens: 1024,
        responseFormat: 'json_object',
      },
      { question: '' }
    )

    return { question: String(result.question || '').trim() }
  }

  // ── Suggestion du guide d'évaluation (étape par étape) ──

  async suggestGuideEtape(params: {
    question: string
    referenceReglementaire?: string
    guideActuel?: string
    aerodromeId?: string
    domaine?: string
  }): Promise<{ guide: string }> {
    const trimmed = (params.question || '').trim()
    if (!trimmed) {
      return { guide: '' }
    }

    const userMessage = `QUESTION À VÉRIFIER :
${trimmed}

RÉFÉRENCE RÉGLEMENTAIRE : ${params.referenceReglementaire || '(non spécifiée)'}
${params.guideActuel ? `GUIDE ACTUEL :\n${params.guideActuel}` : ''}

Rédige le guide d'évaluation étape par étape. Réponds en JSON.`

    const result = await aiClient.callJSON<{ guide?: string }>(
      {
        systemPrompt: SUGGEST_GUIDE_PROMPT,
        userMessage,
        temperature: 0.3,
        maxTokens: 2048,
        responseFormat: 'json_object',
      },
      { guide: '' }
    )

    return { guide: String(result.guide || '').trim() }
  }

  // ── Extraction checklist ANACIM legacy ──

  async extractAnacimChecklistItems(docId: string): Promise<Awaited<ReturnType<typeof kitDocAgent.extractAnacimChecklistItems>>> {
    return kitDocAgent.extractAnacimChecklistItems(docId)
  }

  // ── Feedback → recalibrage AERORISQ ──

  async ingestFeedback(surveillanceId: string): Promise<ChecklistFeedbackReport | null> {
    return checklistFeedbackEngine.ingestSurveillanceResults(surveillanceId)
  }

  // ── Analyse AERORISQ complète ──

  async getAerorisqAnalysis(aerodromeId: string): Promise<{
    profil: ProfilRisque | null
    analysis: RiskAnalysisResult | null
    aiAnalysis: RiskAnalysisResult['aiAnalysis']
  }> {
    const { profil, analysis } = await this.getOrBuildAerorisqContext(aerodromeId)
    if (!analysis) return { profil, analysis: null, aiAnalysis: undefined }

    const aiAnalysis = await riskAgent.getAIAnalysis(aerodromeId, analysis)
    return { profil, analysis, aiAnalysis }
  }

  invalidateCache(aerodromeId?: string): void {
    if (aerodromeId) {
      this.aerorisqCache.delete(aerodromeId)
    } else {
      this.aerorisqCache.clear()
    }
    riskAgent.invalidateCache(aerodromeId)
  }
}

export const inspecteurVirtuel = new InspecteurVirtuelAgent()
