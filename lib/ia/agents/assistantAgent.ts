// lib/ia/agents/assistantAgent.ts
// Agent Assistant Conversationnel — version LLM hybride
// Architecture : données locales (store) + Groq LLM (Llama 3.3 70B gratuit)
// Fallback local si API indisponible

'use client'

import { useAppStore, ProfilRisque } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  actions?: ActionSuggestion[]
  sources?: SourceReference[]
}

export interface ActionSuggestion {
  id: string
  label: string
  description: string
  type: 'navigate' | 'action' | 'query' | 'generate'
  target?: string
  params?: Record<string, unknown>
}

export interface SourceReference {
  type: 'reglementation' | 'procedure' | 'donnee' | 'historique'
  title: string
  reference: string
  url?: string
}

export interface ChatRequest {
  message: string
  contexte?: {
    module?: string
    aerodromeId?: string
    surveillanceId?: string
    ecartId?: string
    historiqueMessages?: ChatMessage[]
  }
  userRole: string
}

export interface ChatResponse {
  message: string
  actions: ActionSuggestion[]
  sources: SourceReference[]
  confidence: number
}

export interface ContextualHelpRequest {
  module: string
  currentPage?: string
  userRole: string
  userLevel?: 'debutant' | 'confirme' | 'expert'
}

export interface ContextualHelpResponse {
  titre: string
  description: string
  etapes: string[]
  raccourcis: { action: string; shortcut?: string }[]
  tips: string[]
}

export interface ProactiveSuggestion {
  id: string
  type: 'alerte' | 'rappel' | 'opportunite' | 'action'
  titre: string
  description: string
  priorite: 'haute' | 'moyenne' | 'basse'
  action: ActionSuggestion
  declencheur: string
}

// ============================================================
// RACCOURCIS CLAVIER
// ============================================================

const RACCOURCIS: Record<string, { action: string; shortcut?: string }> = {
  'profil_risque': { action: 'Ouvrir le module Profil de Risque', shortcut: 'G+P' },
  'certification': { action: 'Ouvrir le module Certification', shortcut: 'G+C' },
  'planning': { action: 'Ouvrir le module Planning', shortcut: 'G+L' },
  'surveillance': { action: 'Ouvrir le module Surveillance', shortcut: 'G+S' },
  'ecarts': { action: 'Ouvrir le module Écarts et PAC', shortcut: 'G+E' },
  'recherche': { action: 'Ouvrir la recherche globale', shortcut: 'Ctrl+K' },
  'aide': { action: 'Afficher l\'aide contextuelle', shortcut: 'F1' },
}

// ============================================================
// AGENT ASSISTANT
// ============================================================

export class AssistantAgent {
  private responseCache = new Map<string, { timestamp: number; response: ChatResponse }>()
  private initialized: boolean = false
  private conversationHistory: Map<string, ChatMessage[]> = new Map()
  private llmAvailable: boolean | null = null // null = non testé encore

  async init(_storeData: unknown): Promise<void> {
    this.initialized = true
  }

  // ============================================================
  // MÉTHODE PRINCIPALE
  // ============================================================

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const message = request.message.toLowerCase().trim()
    const contexte = request.contexte || {}

    this.addToHistory(contexte, {
      id: this.generateId(),
      role: 'user',
      content: request.message,
      timestamp: new Date().toISOString(),
    })

    let response: ChatResponse

    // Commandes purement structurelles — pas besoin du LLM
    if (this.matches(message, ['raccourci', 'touche', 'keyboard', 'shortcut'])) {
      response = this.handleShortcuts()
    } else if (this.matches(message, ['merci', 'thanks', 'ok', 'super', 'parfait'])) {
      response = this.handleThanks()
    } else {
      // Toutes les autres questions → LLM avec contexte riche du store
      response = await this.handleWithLLM(request)
    }

    this.addToHistory(contexte, {
      id: this.generateId(),
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      actions: response.actions,
      sources: response.sources,
    })

    return response
  }

  // ============================================================
  // APPEL LLM — cœur du nouveau système
  // ============================================================

  private async handleWithLLM(request: ChatRequest): Promise<ChatResponse> {
    const store = useAppStore.getState()
    const contexte = request.contexte || {}

    // 1. Construire le contexte riche depuis le store
    const aerodromeCtx = contexte.aerodromeId
      ? store.aerodromes?.find((a) => a.id === contexte.aerodromeId)
      : undefined

    const profilCtx = contexte.aerodromeId
      ? store.profilsRisque?.[contexte.aerodromeId]
      : undefined

    const ecartsCtx = store.ecarts
      ? store.ecarts
          .filter((e) => !contexte.aerodromeId || e.aerodrome_id === contexte.aerodromeId)
          .filter((e) => e.statut !== 'cloture')
          .slice(0, 10)
          .map((e) => ({
            reference: e.reference,
            libelle: e.libelle?.substring(0, 80),
            niveau_risque: e.niveau_risque,
            statut: e.statut,
            jours_restants: e.delai_pac
              ? Math.ceil((new Date(e.delai_pac).getTime() - Date.now()) / 86400000)
              : undefined,
          }))
      : []

    const surveillanceCtx = contexte.surveillanceId
      ? store.surveillances?.find((s) => s.id === contexte.surveillanceId)
      : undefined

    const checklistCtx = contexte.surveillanceId
      ? (() => {
          const items = store.checklistItems?.[contexte.surveillanceId] || []
          const sa = items.filter((i) => i.resultat === 'SA').length
          const ns = items.filter((i) => i.resultat === 'NS').length
          const nv = items.filter((i) => i.resultat === 'NV').length
          return items.length > 0
            ? { total: items.length, sa, ns, nv, progression: Math.round(((sa + ns) / items.length) * 100) }
            : undefined
        })()
      : undefined

    // 2. Construire l'historique pour la continuité de la conversation
    const sessionId = contexte.module || 'default'
    const localHistory = this.conversationHistory.get(sessionId) || []
    const recentHistory = localHistory
      .slice(-8)
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // 3. Appel API avec cache 5 minutes
    const cacheKey = request.message.substring(0, 100)
    const cached = this.responseCache?.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 300_000) {
      return cached.response
    }

    try {
      const apiResponse = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: request.message,
          contexte: {
            aerodrome: aerodromeCtx
              ? { code_oaci: aerodromeCtx.code_oaci, nom: aerodromeCtx.nom, categorie: aerodromeCtx.categorie_sslia, type: aerodromeCtx.type }
              : undefined,
            profil_risque: profilCtx
              ? {
                  score_global: profilCtx.score_global,
                  niveau: profilCtx.niveau,
                  tendance: profilCtx.tendance,
                  c1: profilCtx.c1, c2: profilCtx.c2, c3: profilCtx.c3,
                  c4: profilCtx.c4, c5: profilCtx.c5,
                  alerte: profilCtx.proactive_alert?.message_court,
                }
              : undefined,
            ecarts_actifs: ecartsCtx.length > 0 ? ecartsCtx : undefined,
            surveillance_en_cours: surveillanceCtx
              ? {
                  type: surveillanceCtx.type,
                  date: surveillanceCtx.date_debut,
                  statut: surveillanceCtx.statut,
                  taux_conformite: checklistCtx?.progression,
                }
              : undefined,
            historique: recentHistory,
            module: contexte.module,
          },
        }),
      })

      if (apiResponse.ok) {
        this.llmAvailable = true
        const data = await apiResponse.json()
        const result = this.wrapLLMResponse(data.message, request.message, {
          aerodromeId: contexte.aerodromeId,
          surveillanceId: contexte.surveillanceId,
          hasCriticalEcarts: ecartsCtx.some((e) => e.niveau_risque === 'critique'),
          profilScore: profilCtx?.score_global,
        })
        this.responseCache.set(cacheKey, { timestamp: Date.now(), response: result })
        return result
      }

      if (apiResponse.status === 503) {
        const err = await apiResponse.json()
        if (err.code === 'NO_API_KEY') {
          this.llmAvailable = false
          return this.handleNoApiKey()
        }
      }

      throw new Error(`API ${apiResponse.status}`)
    } catch (error) {
      // Fallback local si l'API est indisponible
      console.warn('[AssistantAgent] LLM indisponible, fallback local:', error)
      this.llmAvailable = false
      return this.localFallback(request.message, contexte, {
        aerodrome: aerodromeCtx,
        profil: profilCtx,
        ecarts: ecartsCtx,
        checklist: checklistCtx,
      })
    }
  }

  // Ajoute les boutons d'action contextuels à une réponse LLM
  private wrapLLMResponse(
    message: string,
    originalQuestion: string,
    context: {
      aerodromeId?: string
      surveillanceId?: string
      hasCriticalEcarts?: boolean
      profilScore?: number
    }
  ): ChatResponse {
    const actions: ActionSuggestion[] = []
    const q = originalQuestion.toLowerCase()

    if (q.includes('risque') || q.includes('score') || q.includes('profil') || q.includes('c1') || q.includes('c2')) {
      actions.push({ id: '1', label: 'Voir profil de risque', description: 'Module profil de risque', type: 'navigate', target: 'risque' })
      if (context.aerodromeId) {
        actions.push({ id: '2', label: 'Voir tendances', description: 'Tendances et prédictions', type: 'navigate', target: 'risque', params: { tab: 'tendances' } })
      }
    } else if (q.includes('écart') || q.includes('pac') || q.includes('non-conformité') || q.includes('nc')) {
      actions.push({ id: '1', label: 'Voir les écarts', description: 'Module écarts et PAC', type: 'navigate', target: 'plans-actions' })
      if (context.hasCriticalEcarts) {
        actions.push({ id: '2', label: 'Filtrer critiques', description: 'Écarts critiques uniquement', type: 'navigate', target: 'plans-actions', params: { filter: 'critique' } })
      }
    } else if (q.includes('checklist') || q.includes('item') || q.includes('sa') || q.includes('ns')) {
      if (context.surveillanceId) {
        actions.push({ id: '1', label: 'Ouvrir la checklist', description: 'Voir les items', type: 'navigate', target: 'checklist', params: { surveillanceId: context.surveillanceId } })
      } else {
        actions.push({ id: '1', label: 'Voir surveillances', description: 'Liste des surveillances', type: 'navigate', target: 'surveillance' })
      }
    } else if (q.includes('planning') || q.includes('mission') || q.includes('inspection')) {
      actions.push({ id: '1', label: 'Voir planning', description: 'Module planning', type: 'navigate', target: 'planning' })
    } else if (q.includes('certification') || q.includes('homologation')) {
      actions.push({ id: '1', label: 'Voir certifications', description: 'Module certification', type: 'navigate', target: 'certification' })
    } else if (q.includes('rapport') || q.includes('génère') || q.includes('genere')) {
      if (context.surveillanceId) {
        actions.push({ id: '1', label: 'Générer rapport', description: 'Générer le rapport de surveillance', type: 'generate', target: 'report', params: { surveillanceId: context.surveillanceId } })
      }
    }

    // Toujours proposer une aide si le score est critique
    if (context.profilScore !== undefined && context.profilScore < 30) {
      actions.push({ id: 'alert', label: 'Voir alertes', description: 'Alertes proactives', type: 'navigate', target: 'risque', params: { tab: 'alertes' } })
    }

    return { message, actions, sources: [], confidence: 90 }
  }

  // ============================================================
  // FALLBACK LOCAL — si API non configurée ou indisponible
  // ============================================================

  private localFallback(
    message: string,
    contexte: ChatRequest['contexte'],
    data: {
      aerodrome?: { code_oaci?: string; nom?: string; categorie_sslia?: string; type?: string }
      profil?: ProfilRisque
      ecarts?: Array<{ reference: string; libelle?: string; niveau_risque: string; statut: string; jours_restants?: number }>
      checklist?: unknown
    }
  ): ChatResponse {
    const msg = message.toLowerCase()

    if (this.matches(msg, ['bonjour', 'salut', 'hello'])) {
      return {
        message: `Bonjour ! Je suis l'assistant SGDA. Pour activer mes capacités IA complètes, configurez la clé GROQ_API_KEY dans votre fichier .env.local.\n\nEn attendant, je peux vous donner des informations de base sur vos données.`,
        actions: [
          { id: '1', label: 'Voir profil de risque', description: '', type: 'navigate', target: 'risque' },
          { id: '2', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' },
        ],
        sources: [],
        confidence: 60,
      }
    }

    if (data.profil && this.matches(msg, ['profil', 'risque', 'score', 'c1', 'c2', 'c3', 'c4', 'c5'])) {
      const p = data.profil
      return {
        message: `**Profil de risque — ${data.aerodrome?.code_oaci || ''}**\n\nScore global : **${p.score_global}/100** (${p.niveau})\nTendance : ${p.tendance === 'hausse' ? '↗ Hausse' : p.tendance === 'baisse' ? '↘ Baisse' : '→ Stable'}\n\n- C1 Maturité SGS : ${p.c1}/100\n- C2 Efficacité PAC : ${p.c2}/100\n- C3 Conformité : ${p.c3}/100\n- C4 Charge critique : ${p.c4}/100\n- C5 Résilience : ${p.c5}/100`,
        actions: [{ id: '1', label: 'Voir détails', description: '', type: 'navigate', target: 'risque' }],
        sources: [],
        confidence: 80,
      }
    }

    if (data.ecarts && data.ecarts.length > 0 && this.matches(msg, ['écart', 'pac', 'non-conformité'])) {
      const critiques = data.ecarts.filter((e) => e.niveau_risque === 'critique')
      return {
        message: `**Écarts actifs : ${data.ecarts.length}**\n\nCritiques : ${critiques.length}\n${critiques.slice(0, 3).map((e) => `- ${e.reference} : ${e.libelle}`).join('\n')}`,
        actions: [{ id: '1', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' }],
        sources: [],
        confidence: 80,
      }
    }

    return {
      message: `L'assistant IA complet nécessite la clé GROQ_API_KEY (gratuite sur console.groq.com).\n\nAjoutez dans .env.local :\n\`\`\`\nGROQ_API_KEY=gsk_votre_cle_ici\n\`\`\`\n\nSans IA, je peux afficher vos données mais ne peux pas répondre à vos questions métier.`,
      actions: [
        { id: '1', label: 'Voir profil de risque', description: '', type: 'navigate', target: 'risque' },
        { id: '2', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' },
      ],
      sources: [],
      confidence: 40,
    }
  }

  private handleNoApiKey(): ChatResponse {
    return {
      message: `**Configuration requise**\n\nPour activer l'assistant IA, vous devez configurer une clé API Groq (gratuite).\n\n**Étapes :**\n1. Créez un compte sur [console.groq.com](https://console.groq.com)\n2. Générez une clé API (gratuit)\n3. Ajoutez dans votre fichier \`.env.local\` :\n\`\`\`\nGROQ_API_KEY=gsk_votre_cle_ici\n\`\`\`\n4. Redémarrez le serveur Next.js\n\n**Limites gratuites :** 14 400 requêtes/jour — largement suffisant pour l'usage SGDA.`,
      actions: [],
      sources: [],
      confidence: 100,
    }
  }

  // ============================================================
  // RÉPONSES LOCALES SIMPLES
  // ============================================================

  private handleShortcuts(): ChatResponse {
    return {
      message: `**Raccourcis clavier SGDA**

| Action | Raccourci |
|--------|-----------|
| Profil de Risque | G+P |
| Certification | G+C |
| Planning | G+L |
| Surveillance | G+S |
| Écarts et PAC | G+E |
| Recherche globale | Ctrl+K |
| Aide contextuelle | F1 |

**Commandes :**
- \`@module\` — Aller directement à un module
- \`/search terme\` — Rechercher dans SGDA`,
      actions: [],
      sources: [],
      confidence: 100,
    }
  }

  private handleThanks(): ChatResponse {
    return {
      message: `Je vous en prie ! N'hésitez pas si vous avez d'autres questions sur vos missions ou la réglementation.`,
      actions: [{ id: '1', label: 'Suggestions intelligentes', description: 'Voir les alertes proactives', type: 'action', target: 'suggestions' }],
      sources: [],
      confidence: 100,
    }
  }

  // ============================================================
  // AIDE CONTEXTUELLE
  // ============================================================

  async getContextualHelp(request: ContextualHelpRequest): Promise<ContextualHelpResponse> {
    const helpConfig: Record<string, ContextualHelpResponse> = {
      'profil-risque': {
        titre: 'Module Profil de Risque',
        description: 'Analyse le risque des aérodromes selon 5 critères (C1-C5) avec prédictions et alertes proactives.',
        etapes: [
          '1. Sélectionnez un aérodrome dans la liste',
          '2. Consultez le score global et le niveau de risque',
          '3. Analysez les 5 critères détaillés',
          '4. Visualisez les tendances et prédictions',
          '5. Explorez les suggestions intelligentes',
        ],
        raccourcis: [
          { action: 'Recalculer le profil', shortcut: 'Ctrl+R' },
          { action: 'Exporter les données', shortcut: 'Ctrl+E' },
          { action: 'Aide contextuelle', shortcut: 'F1' },
        ],
        tips: [
          'Les prédictions N+1 et N+2 sont basées sur l\'historique',
          'Les alertes proactives s\'affichent automatiquement',
          'Cliquez sur un domaine pour voir les détails',
        ],
      },
      'planning': {
        titre: 'Module Planning',
        description: 'Gérez les plannings de surveillance et les assignations d\'inspecteurs.',
        etapes: [
          '1. Filtrez par aérodrome, type ou statut',
          '2. Créez un nouveau planning',
          '3. Assignez les inspecteurs',
          '4. Lancez la surveillance',
        ],
        raccourcis: [
          { action: 'Nouveau planning', shortcut: 'Ctrl+N' },
          { action: 'Génération N+1', shortcut: 'Ctrl+G' },
          { action: 'Vue calendrier', shortcut: 'Ctrl+D' },
        ],
        tips: [
          'La génération N+1 utilise le profil de risque',
          'Les conflits de dates sont détectés automatiquement',
          'Les inspecteurs sont suggérés par IA',
        ],
      },
      'plans-actions': {
        titre: 'Module Écarts et PAC',
        description: 'Gérez les non-conformités et les plans d\'actions correctives.',
        etapes: [
          '1. Identifiez les écarts prioritaires',
          '2. Analysez le niveau de risque',
          '3. Soumettez un PAC',
          '4. Suivez l\'avancement',
        ],
        raccourcis: [
          { action: 'Nouvel écart', shortcut: 'Ctrl+E' },
          { action: 'Voir statistiques', shortcut: 'Ctrl+S' },
        ],
        tips: [
          'Les écarts critiques ont priorité',
          'Les délais sont calculés automatiquement',
          'L\'IA peut aider à rédiger les libellés',
        ],
      },
    }

    return helpConfig[request.module] || helpConfig['profil-risque']
  }

  // ============================================================
  // SUGGESTIONS PROACTIVES
  // ============================================================

  async getProactiveSuggestions(aerodromeId?: string): Promise<ProactiveSuggestion[]> {
    const store = useAppStore.getState()
    const suggestions: ProactiveSuggestion[] = []

    if (aerodromeId) {
      const profil = store.profilsRisque?.[aerodromeId]
      if (profil && profil.score_global < 30) {
        suggestions.push({
          id: 'risk_critical',
          type: 'alerte',
          titre: '⚠️ Profil de risque critique',
          description: `Score ${profil.score_global}/100 — action immédiate requise.`,
          priorite: 'haute',
          action: { id: 'view_risk', label: 'Voir analyse', description: '', type: 'navigate', target: 'risque' },
          declencheur: `Score ${profil.score_global} < 30`,
        })
      }
    }

    const ecartsCritiques = store.ecarts?.filter((e) => e.niveau_risque === 'critique' && e.statut !== 'cloture') || []
    if (ecartsCritiques.length > 0) {
      suggestions.push({
        id: 'ecarts_critiques',
        type: 'alerte',
        titre: `🔴 ${ecartsCritiques.length} écart(s) critique(s)`,
        description: `Nécessitent une attention immédiate.`,
        priorite: 'haute',
        action: { id: 'view_ecarts', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' },
        declencheur: `${ecartsCritiques.length} écarts critiques actifs`,
      })
    }

    const today = new Date()
    const upcomingPlannings = store.plannings?.filter((p) => {
      const diffDays = Math.ceil((new Date(p.date_debut).getTime() - today.getTime()) / 86400000)
      return diffDays <= 7 && diffDays >= 0 && p.statut === 'planifiee'
    }) || []

    if (upcomingPlannings.length > 0) {
      suggestions.push({
        id: 'upcoming_plannings',
        type: 'rappel',
        titre: `📅 ${upcomingPlannings.length} surveillance(s) cette semaine`,
        description: `${upcomingPlannings.length} mission(s) dans les 7 prochains jours.`,
        priorite: 'moyenne',
        action: { id: 'view_planning', label: 'Voir planning', description: '', type: 'navigate', target: 'planning' },
        declencheur: `${upcomingPlannings.length} plannings dans les 7 jours`,
      })
    }

    return suggestions.slice(0, 5)
  }

  // ============================================================
  // SUGGEST ACTION — requis par l'orchestrateur
  // ============================================================

  async suggestAction(data: { aerodromeId?: string; context?: string }): Promise<ActionSuggestion[]> {
    const suggestions = await this.getProactiveSuggestions(data?.aerodromeId)
    return suggestions.map(s => ({
      id: s.id,
      label: s.titre,
      description: s.description,
      type: 'action' as const,
      target: s.action?.target,
      params: s.action?.params,
    }))
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private matches(message: string, patterns: string[]): boolean {
    return patterns.some(pattern => message.includes(pattern))
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  private addToHistory(contexte: ChatRequest['contexte'], message: ChatMessage): void {
    const sessionId = contexte?.module || 'default'
    const history = this.conversationHistory.get(sessionId) || []
    history.push(message)
    if (history.length > 50) history.shift()
    this.conversationHistory.set(sessionId, history)
  }

  getHistory(sessionId: string): ChatMessage[] {
    return this.conversationHistory.get(sessionId) || []
  }

  clearHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId)
  }

  isReady(): boolean {
    return this.initialized
  }

  isLLMAvailable(): boolean | null {
    return this.llmAvailable
  }
}

export const assistantAgent = new AssistantAgent()
