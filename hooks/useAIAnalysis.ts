// hooks/useAIAnalysis.ts
// Hook React partagé — appelle le LLM Groq pour enrichir n'importe quel module
// Gère : loading, cache local, erreurs, retry

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { aiClient, AICallOptions } from '@/lib/ia/aiClient'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import { LRUCache } from '@/lib/cache'

// ============================================================
// HOOK GÉNÉRIQUE
// ============================================================

export interface UseAIOptions extends AICallOptions {
  cacheKey?: string
  cacheTTLms?: number
}

export interface UseAIState<T = string> {
  data: T | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

const memoryCache = new LRUCache<any>({ ttl: 5 * 60 * 1000, maxSize: 50 })

export function useAI<T = string>(options?: Partial<UseAIOptions>) {
  const [state, setState] = useState<UseAIState<T>>({ data: null, loading: false, error: null, lastUpdated: null })
  const abortRef = useRef<AbortController | null>(null)

  const analyze = useCallback(async (callOptions: UseAIOptions): Promise<T | null> => {
    // Vérifier le cache
    if (callOptions.cacheKey) {
      const cached = memoryCache.get(callOptions.cacheKey)
      if (cached !== undefined) {
        setState(s => ({ ...s, data: cached, loading: false }))
        return cached
      }
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setState(s => ({ ...s, loading: true, error: null }))

    try {
      const result = await aiClient.call({
        systemPrompt: callOptions.systemPrompt,
        userMessage: callOptions.userMessage,
        temperature: callOptions.temperature,
        maxTokens: callOptions.maxTokens,
        history: callOptions.history,
      })

      if (!result.ok) {
        setState(s => ({ ...s, loading: false, error: result.error ?? 'Erreur IA' }))
        return null
      }

      let parsedContent: unknown = result.content
      if (callOptions.responseFormat === 'json_object') {
        try {
          parsedContent = JSON.parse(result.content)
        } catch {
          setState(s => ({ ...s, loading: false, error: 'Réponse IA invalide (JSON malformé)' }))
          return null
        }
      }
      const data = parsedContent as T

      if (callOptions.cacheKey) {
        memoryCache.set(callOptions.cacheKey, data)
      }

      setState({ data, loading: false, error: null, lastUpdated: new Date() })
      return data
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setState(s => ({ ...s, loading: false, error: err.message }))
      }
      return null
    }
  }, [])

  return { ...state, analyze }
}

// ============================================================
// HOOK SPÉCIALISÉ — PROFIL DE RISQUE
// ============================================================

export interface AIRiskAnalysis {
  narrative: string
  keyInsights: string[]
  immediateActions: string[]
  mediumTermActions: string[]
  riskExplanation: string
}

export interface UseAIRiskAnalysisReturn {
  // Phase 1 — analyse quantitative complète (riskAgent.analyzeRisk)
  riskResult: import('@/lib/ia/agents/riskAgent').RiskAnalysisResult | null
  loadingRisk: boolean
  errorRisk: string | null
  runAnalysis: (opts?: { includePredictions?: boolean; includeBlackSwan?: boolean }) => Promise<void>

  // Phase 2 — narration IA (riskAgent.getAIAnalysis, optionnelle car coûteuse)
  aiNarrative: AIRiskAnalysis | null
  loadingNarrative: boolean
  errorNarrative: string | null
  runNarrative: () => Promise<void>

  // Utilitaires
  reset: () => void
  lastUpdated: Date | null
}

export function useAIRiskAnalysis(aerodromeId: string | null): UseAIRiskAnalysisReturn {
  const [riskResult, setRiskResult] = useState<import('@/lib/ia/agents/riskAgent').RiskAnalysisResult | null>(null)
  const [loadingRisk, setLoadingRisk]     = useState(false)
  const [errorRisk, setErrorRisk]         = useState<string | null>(null)

  const [aiNarrative, setAiNarrative]         = useState<AIRiskAnalysis | null>(null)
  const [loadingNarrative, setLoadingNarrative] = useState(false)
  const [errorNarrative, setErrorNarrative]     = useState<string | null>(null)

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Phase 1 — calculs quantitatifs (rapides, locaux + modèles IA embarqués)
  const runAnalysis = useCallback(async (
    opts: { includePredictions?: boolean; includeBlackSwan?: boolean } = {}
  ) => {
    if (!aerodromeId) return
    setLoadingRisk(true)
    setErrorRisk(null)
    try {
      const result = await riskAgent.analyzeRisk(
        {
          aerodromeId,
          includePredictions:  opts.includePredictions  ?? true,
          includeBlackSwan:    opts.includeBlackSwan    ?? true,
          includeSuggestions:  true,
          horizonMonths:       12,
        },
        {}
      )
      setRiskResult(result)
      setLastUpdated(new Date())
      // Invalider la narration précédente quand les données changent
      setAiNarrative(null)
    } catch (err: any) {
      setErrorRisk(err.message ?? 'Erreur lors de l\'analyse')
    } finally {
      setLoadingRisk(false)
    }
  }, [aerodromeId])

  // Phase 2 — narration IA (appel LLM, déclenchée manuellement)
  const runNarrative = useCallback(async () => {
    if (!aerodromeId || !riskResult) return
    setLoadingNarrative(true)
    setErrorNarrative(null)
    try {
      const narrative = await riskAgent.getAIAnalysis(aerodromeId, riskResult)
      setAiNarrative(narrative ?? null)
    } catch (err: any) {
      setErrorNarrative(err.message ?? 'Erreur lors de la génération du narratif')
    } finally {
      setLoadingNarrative(false)
    }
  }, [aerodromeId, riskResult])

  // Relancer l'analyse quand l'aérodrome change
  useEffect(() => {
    if (!aerodromeId) return
    runAnalysis()
  }, [aerodromeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    setRiskResult(null)
    setAiNarrative(null)
    setErrorRisk(null)
    setErrorNarrative(null)
    setLastUpdated(null)
  }, [])

  return {
    riskResult, loadingRisk, errorRisk, runAnalysis,
    aiNarrative, loadingNarrative, errorNarrative, runNarrative,
    reset, lastUpdated,
  }
}

// ============================================================
// HOOK SPÉCIALISÉ — GÉNÉRATION D'ÉCART
// ============================================================

export interface UseAIEcartState {
  libelle: string | null
  loading: boolean
  error: string | null
}

export function useAIEcartLibelle() {
  const [state, setState] = useState<UseAIEcartState>({ libelle: null, loading: false, error: null })

  const generate = useCallback(async (request: any) => {
    setState({ libelle: null, loading: true, error: null })
    try {
      const { ecartAgent } = await import('@/lib/ia/agents/ecartAgent')
      const result = await ecartAgent.generateEcart(request, {})
      setState({ libelle: result.libelle, loading: false, error: null })
      return result
    } catch (err: any) {
      setState({ libelle: null, loading: false, error: err.message })
      return null
    }
  }, [])

  return { ...state, generate }
}

// ============================================================
// HOOK SPÉCIALISÉ — ASSISTANT CHAT
// ============================================================

export function useAIChat() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>>([])
  const [loading, setLoading] = useState(false)

  const sendMessage = useCallback(async (
    message: string,
    contexte?: {
      aerodromeId?: string
      module?: string
      surveillanceId?: string
    }
  ) => {
    const userMsg = { role: 'user' as const, content: message, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const { assistantAgent } = await import('@/lib/ia/agents/assistantAgent')
      const response = await assistantAgent.chat({
        message,
        contexte: { ...contexte, historiqueMessages: [] },
        userRole: 'inspector',
      })

      const assistantMsg = { role: 'assistant' as const, content: response.message, timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, assistantMsg])
      return response
    } catch (err) {
      const errorMsg = { role: 'assistant' as const, content: 'Désolé, une erreur est survenue. Veuillez réessayer.', timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, errorMsg])
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, loading, sendMessage, clearMessages }
}
