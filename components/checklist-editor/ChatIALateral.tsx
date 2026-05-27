'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, User, Send, X, Brain, Sparkles, Loader2 } from 'lucide-react'
import { aiClient } from '@/lib/ia/aiClient'

const CHAT_SYSTEM_PROMPT = (contexte: string) => `Tu es un assistant expert en réglementation aéronautique (OACI, Annexe 14, Doc 9137, Doc 9981, Doc 9157, Doc 9859, Doc 9261, circulaires ANACIM).

Tu aides un inspecteur à **construire et affiner une checklist** de surveillance d'aérodrome.

**Règles :**
- L'utilisateur peut demander d'AJOUTER, MODIFIER ou SUPPRIMER des items.
- Réponds TOUJOURS en JSON uniquement avec le format ci-dessous.
- Si tu modifies la checklist, renvoie la structure COMPLÈTE mise à jour (pas de diff).
- Si tu ne fais que répondre à une question, mets updatedChecklist: null.
- Conserve scrupuleusement les IDs existants des domaines, sous-domaines et sous-sous-domaines.
- Pour les nouveaux items, génère un ID unique (ex: "ai_item_{Date.now()}_{index}").
- Les items doivent avoir ces champs : id, numero, reference_reglementaire, point_verification, directive_preuve, prediction ("NV"), confiance (50), justification, alerte (false), prefilled (true).

**Format de réponse :**
{"message": "Réponse pour l'utilisateur", "updatedChecklist": null | tableau de domaines}

**Contexte actuel de la checklist (JSON) :**
${contexte}`

interface ChatIALateralProps {
  checklistJson: any[]
  onChecklistUpdate: (updatedChecklist: any[]) => void
}

export function ChatIALateral({ checklistJson, onChecklistUpdate }: ChatIALateralProps) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const contexte = JSON.stringify(
        (checklistJson || []).map((d: any) => ({
          id: d.id,
          nom: d.nom,
          description: d.description,
          items: (d.items || []).map((i: any) => ({
            id: i.id, numero: i.numero, reference_reglementaire: i.reference_reglementaire,
            point_verification: i.point_verification, directive_preuve: i.directive_preuve,
            prediction: i.prediction, confiance: i.confiance, justification: i.justification,
          })),
          sousDomaines: (d.sousDomaines || []).map((sd: any) => ({
            id: sd.id,
            nom: sd.nom,
            items: (sd.items || []).map((i: any) => ({
              id: i.id, numero: i.numero, reference_reglementaire: i.reference_reglementaire,
              point_verification: i.point_verification, directive_preuve: i.directive_preuve,
              prediction: i.prediction, confiance: i.confiance, justification: i.justification,
            })),
            sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) => ({
              id: ssd.id,
              nom: ssd.nom,
              items: (ssd.items || []).map((i: any) => ({
                id: i.id, numero: i.numero, reference_reglementaire: i.reference_reglementaire,
                point_verification: i.point_verification, directive_preuve: i.directive_preuve,
                prediction: i.prediction, confiance: i.confiance, justification: i.justification,
              })),
            })),
          })),
        }))
      )

      const result = await aiClient.callJSON<{ message: string; updatedChecklist: any[] | null }>(
        {
          systemPrompt: CHAT_SYSTEM_PROMPT(contexte),
          userMessage: msg,
          temperature: 0.3,
          maxTokens: 4096,
          responseFormat: 'json_object',
        },
        { message: "Je n'ai pas pu traiter votre demande. Veuillez réessayer.", updatedChecklist: null }
      )

      if (result.updatedChecklist && Array.isArray(result.updatedChecklist) && result.updatedChecklist.length > 0) {
        onChecklistUpdate(result.updatedChecklist)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: result.message }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Erreur de communication avec l'IA. Vérifiez que le service est disponible." }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, checklistJson, onChecklistUpdate])

  const examples = [
    'Ajoute 3 items sur le balisage lumineux',
    'Ajoute des items du Doc 9137 Partie 1 (SLI)',
    'Supprime les items en double sur le SGS',
    'Ajoute un sous-domaine "Gestion des risques" dans SGS',
    'Reformule la question SGS.01 plus précisément',
  ]

  return (
    <div className="w-80 shrink-0 border-r border-blue-200 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-blue-100 bg-blue-50">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Assistant IA</span>
          <Sparkles className="w-3 h-3 text-blue-400" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="w-8 h-8 mx-auto mb-2 text-blue-300" />
            <p className="text-xs text-blue-400 mb-3">
              Demandez à l'IA d'ajouter, modifier ou supprimer des items de la checklist.
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
            placeholder="Ajouter, modifier, supprimer..."
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
