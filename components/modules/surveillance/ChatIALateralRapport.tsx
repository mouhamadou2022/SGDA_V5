'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, User, Send, X, Brain, Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { aiClient } from '@/lib/ia/aiClient'

type RapportSections = {
  resume: string; introduction: string; methodologie: string; equipe: string;
  deroulement: { preparation: string; reunionOuverture: string; verificationSite: string; reunionCloture: string };
  resultsIntro: string; resultsAnalysis: string;
  preoccupations: string; recommandations: string; conclusion: string;
  [key: string]: any;
}

const CHAT_SYSTEM_PROMPT = (sectionsSummary: string, rapportType: string) => `Tu es un assistant expert en rédaction de rapports de surveillance aéronautique (OACI, ANACIM Sénégal).

Tu aides un inspecteur à **modifier, supprimer ou réécrire des sections** d'un rapport de surveillance ${rapportType === 'charge' ? 'préalablement chargé' : 'généré par l\'IA'}.

**Règles ABSOLUES :**
- Tu peux MODIFIER, SUPPRIMER ou RÉÉCRIRE le contenu de n'importe quelle section.
- Tu peux AJOUTER du contenu dans une section existante.
- Tu dois TOUJOURS renvoyer le contenu modifié de la section concernée dans updatedSections.
- Si l'utilisateur demande de supprimer une section, mets son contenu à une chaîne vide "".
- Réponds TOUJOURS en JSON uniquement avec le format ci-dessous.
- Conserve le style professionnel et technique d'un rapport ANACIM.
- Utilise le format HTML pour le contenu (paragraphes, listes, tableaux si besoin).
- N'inclus JAMAIS le titre de la section dans le contenu.

**Sections disponibles :**
- resume : Résumé exécutif
- introduction : Introduction et contexte
- methodologie : Méthodologie
- preparation : Déroulement - Préparation
- reunionOuverture : Déroulement - Réunion d'ouverture
- verificationSite : Déroulement - Phase de vérification sur site
- reunionCloture : Déroulement - Réunion de clôture
- resultsIntro : Résultats - Introduction
- resultsAnalysis : Résultats - Analyse approfondie
- preoccupations : Préoccupations de sécurité
- recommandations : Recommandations
- conclusion : Conclusion

**Format de réponse :**
{"message": "Réponse pour l'utilisateur", "updatedSections": null | { "clé_section": "nouveau contenu HTML" }}

**Aperçu des sections actuelles :**
${sectionsSummary}`

interface ChatIALateralRapportProps {
  sections: RapportSections
  rapportType: 'redige' | 'charge'
  onSectionsUpdate: (updatedSections: Partial<RapportSections>) => void
  onClose?: () => void
}

export function ChatIALateralRapport({ sections, rapportType, onSectionsUpdate, onClose }: ChatIALateralRapportProps) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const buildSectionsSummary = useCallback(() => {
    const d = sections.deroulement
    return [
      `resume: ${(sections.resume || '').replace(/<[^>]*>/g, '').substring(0, 150)}...`,
      `introduction: ${(sections.introduction || '').replace(/<[^>]*>/g, '').substring(0, 150)}...`,
      `methodologie: ${(sections.methodologie || '').replace(/<[^>]*>/g, '').substring(0, 150)}...`,
      `preparation: ${(d.preparation || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `reunionOuverture: ${(d.reunionOuverture || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `verificationSite: ${(d.verificationSite || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `reunionCloture: ${(d.reunionCloture || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `resultsIntro: ${(sections.resultsIntro || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `resultsAnalysis: ${(sections.resultsAnalysis || '').replace(/<[^>]*>/g, '').substring(0, 150)}...`,
      `preoccupations: ${(sections.preoccupations || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `recommandations: ${(sections.recommandations || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
      `conclusion: ${(sections.conclusion || '').replace(/<[^>]*>/g, '').substring(0, 100)}...`,
    ].join('\n')
  }, [sections])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const result = await aiClient.callJSON<{ message: string; updatedSections: Partial<RapportSections> | null }>(
        {
          systemPrompt: CHAT_SYSTEM_PROMPT(buildSectionsSummary(), rapportType),
          userMessage: `Demande: ${msg}\n\nAperçu des sections:\n${buildSectionsSummary()}\n\nRéponds UNIQUEMENT en JSON. Si tu modifies des sections, renvoie les sections modifiées dans updatedSections.`,
          temperature: 0.3,
          maxTokens: 4096,
          responseFormat: 'json_object',
        },
        { message: "Je n'ai pas pu traiter votre demande. Veuillez réessayer.", updatedSections: null }
      )

      if (result.updatedSections && typeof result.updatedSections === 'object') {
        onSectionsUpdate(result.updatedSections)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: result.message }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Erreur de communication avec AERORISQ. Vérifiez que le service est disponible." }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, buildSectionsSummary, rapportType, onSectionsUpdate])

  const examples = rapportType === 'charge'
    ? [
        'Supprime la section conclusion et reformule les recommandations',
        'Ajoute un paragraphe sur les écarts dans la section résultats',
        'Réécris le résumé exécutif de manière plus concise',
        'Modifie la méthodologie pour inclure la référence OACI Doc 9137',
        'Supprime les préoccupations et fusionne-les avec les recommandations',
      ]
    : [
        'Améliore le résumé exécutif avec plus de données chiffrées',
        'Supprime la section préoccupations',
        'Réécris la conclusion de manière plus percutante',
        'Ajoute des références réglementaires dans la méthodologie',
        'Modifie l\'analyse des résultats pour inclure une comparaison inter-aérodromes',
      ]

  return collapsed ? (
    <div className="w-9 h-full shrink-0 border-r border-blue-200 bg-blue-50 flex flex-col items-center py-2 gap-2">
      <button type="button" onClick={() => setCollapsed(false)}
        className="p-1.5 rounded text-blue-600 hover:bg-blue-100 transition-colors"
        title="Déplier le chat AERORISQ">
        <ChevronRight className="w-4 h-4" />
      </button>
      <div className="flex-1 flex items-center justify-center">
        <Brain className="w-4 h-4 text-blue-400" />
      </div>
      <button type="button" onClick={() => setCollapsed(false)}
        className="p-1.5 rounded text-blue-600 hover:bg-blue-100 transition-colors"
        title="Déplier le chat AERORISQ">
        <Sparkles className="w-3.5 h-3.5" />
      </button>
      {onClose && (
        <button type="button" onClick={onClose}
          className="p-1 rounded text-blue-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Fermer le chat">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : (
    <div className="w-80 h-full shrink-0 border-r border-blue-200 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-blue-100 bg-blue-50">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Assistant AERORISQ</span>
          <Sparkles className="w-3 h-3 text-blue-400" />
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setCollapsed(true)}
            className="p-1 rounded text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
            title="Replier le chat AERORISQ">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button type="button" onClick={onClose}
              className="p-1 rounded text-blue-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Fermer le chat">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="w-8 h-8 mx-auto mb-2 text-blue-300" />
            <p className="text-xs text-blue-400 mb-3">
              Demandez à AERORISQ de modifier, supprimer ou réécrire des sections du rapport.
            </p>
            <div className="space-y-1.5">
              {examples.map((ex, i) => (
                <button key={i} onClick={() => { setInput(ex); inputRef.current?.focus() }}
                  className="block w-full text-left text-[10px] px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-blue-600" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-blue-50 text-blue-800 rounded-bl-sm'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="rounded-xl px-3 py-2 bg-blue-50">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-blue-100 p-2.5">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Modifier, supprimer, réécrire..."
            disabled={loading}
            className="flex-1 h-9 px-3 text-xs rounded-lg border border-blue-200 bg-white placeholder:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400/50 disabled:opacity-50"
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
