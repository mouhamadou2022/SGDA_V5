'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, User, Send, X, Brain, Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { aiClient } from '@/lib/ia/aiClient'
import { construireContexteChecklist } from '@/lib/ia/checklistContext'
import { Markdown } from '@/components/ui/markdown'

const CHAT_SYSTEM_PROMPT = (contexte: string) => `Tu es un assistant expert en réglementation aéronautique (OACI, Annexe 14, Doc 9137, Doc 9981, Doc 9157, Doc 9859, Doc 9261, circulaires ANACIM).

Tu aides un inspecteur à **construire et affiner une checklist** de surveillance d'aérodrome.

**Règles ABSOLUES :**
- Tu peux AJOUTER de nouveaux items ou MODIFIER des items existants.
- Tu NE DOIS JAMAIS SUPPRIMER des items, domaines, sous-domaines ou sous-sous-domaines existants.
- Réponds TOUJOURS en JSON uniquement avec le format ci-dessous.
- Si tu modifies la checklist, renvoie SEULEMENT les domaines concernés, et dans chaque domaine SEULEMENT les items modifiés ou ajoutés. Le système fusionne par id : tout ce que tu ne renvoies pas est conservé tel quel.
- Pour un item EXISTANT que tu modifies, renvoie son id et UNIQUEMENT les champs que tu changes (ne recopie pas les autres).
- Pour un item NOUVEAU, fournis tous les champs listés ci-dessous.
- Si tu ajoutes un sous-domaine ou un domaine, renvoie-le avec son id, son nom et ses items.
- Si tu ne fais que répondre à une question, mets updatedChecklist: null.
- Le champ "message" doit être concis (2-3 phrases) et ne pas recopier la checklist.
- Conserve scrupuleusement les IDs existants des domaines, sous-domaines et sous-sous-domaines.
- Pour les nouveaux items, génère un ID unique (ex: "ai_item_{Date.now()}_{index}").
- La référence d'un nouvel item ("numero") doit être UNIQUE dans toute la checklist : reprends le schéma du domaine (QSC19 → QSC20, SGS.01 → SGS.02). Ne réutilise JAMAIS une référence déjà présente dans le contexte.
- Les nouveaux items doivent avoir ces champs : id, numero, reference_reglementaire, point_verification, directive_preuve, directive_sa, directive_ns, directive_nv, directive_na, type_entite_cible, sous_domaine, prediction ("NV"), confiance (50), justification, alerte (false), prefilled (true).
- Base TOUJOURS les questions et références sur la réglementation aéronautique réelle (RAS 14, Annexe 14, Doc 9137, Doc 9859, etc.). N'invente JAMAIS des références.

**Format de réponse :**
{"message": "Réponse pour l'utilisateur", "updatedChecklist": null | tableau de domaines (seulement ceux modifiés ou ajoutés)}

**Contexte actuel de la checklist (JSON) :**
${contexte}`

interface ChatIALateralProps {
  checklistJson: any[]
  onChecklistUpdate: (updatedChecklist: any[]) => void
  /** Affiche un bouton de fermeture dans l'en-tête (mode panneau/flottant) */
  onClose?: () => void
}

export function ChatIALateral({ checklistJson, onChecklistUpdate, onClose }: ChatIALateralProps) {
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

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      // Contexte COMPACT : la checklist entière avec tous ses champs dépassait
      // la fenêtre des providers (≈ 61 500 tokens sur 138 items) et l'appel
      // échouait systématiquement. On n'envoie que de quoi identifier les
      // items ; la fusion côté client conserve les champs non renvoyés.
      const contexteCompact = construireContexteChecklist(checklistJson)
      const noteContexte = contexteCompact.itemsOmis > 0
        ? `\n\n[Note : checklist très volumineuse — ${contexteCompact.itemsEnvoyes} items sur ${contexteCompact.itemsTotal} sont listés. Ne recrée jamais un item dont le sujet existe déjà.]`
        : ''
      const contexte = contexteCompact.texte + noteContexte

      const result = await aiClient.callJSON<{ message: string; updatedChecklist: any[] | null }>(
        {
          systemPrompt: CHAT_SYSTEM_PROMPT(contexte),
          // Les domaines sont déjà décrits dans le contexte JSON ci-dessus :
          // inutile de les répéter (chaque caractère compte pour rester sous le
          // plafond du provider rapide).
          userMessage: `Question: ${msg}\n\nRéponds UNIQUEMENT en JSON. Si tu ajoutes ou modifies des items, renvoie SEULEMENT les domaines concernés avec SEULEMENT les items modifiés ou ajoutés dans updatedChecklist.`,
          temperature: 0.3,
          maxTokens: 8192,
          responseFormat: 'json_object',
        },
        { message: "Je n'ai pas pu traiter votre demande. Veuillez réessayer.", updatedChecklist: null }
      )

      if (result.updatedChecklist && Array.isArray(result.updatedChecklist) && result.updatedChecklist.length > 0) {
        onChecklistUpdate(result.updatedChecklist)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: result.message }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Erreur de communication avec AERORISQ. Vérifiez que le service est disponible." }])
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
              Demandez à AERORISQ d'ajouter, modifier ou supprimer des items de la checklist.
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
              {m.role === 'user' ? m.content : <Markdown texte={m.content} />}
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
