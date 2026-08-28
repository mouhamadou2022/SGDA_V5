// components/modules/agents/CopiloteInspecteur.tsx
// Copilote conversationnel LIBRE de l'inspecteur.
// Un grand chat libre : l'inspecteur joint des documents quand il le souhaite
// (optionnel), converse naturellement avec l'IA sur n'importe quel sujet selon
// son besoin (question règlementaire, analyse d'une pièce, rédaction d'une
// note ou d'un courrier, comparaison…), et peut exporter la conversation en
// PDF / Word à tout moment. Aucun parcours imposé.

'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import {
  MessageSquare,
  Send,
  Paperclip,
  FileText,
  Loader2,
  X,
  Sparkles,
  FileDown,
  Eraser,
} from 'lucide-react'
import { copiloteAgent } from '@/lib/ia/agents/copiloteAgent'
import type { MessageCopilote, PieceJointeCopilote } from '@/lib/ia/agents/copiloteAgent'
import { exporterRapportConversation } from '@/lib/services/rapportConversation'

const SUGGESTIONS = [
  'Peux-tu analyser les documents joints et m\'en faire une synthèse ?',
  'Quelles exigences OACI / ANACIM s\'appliquent à ce type d\'étude ?',
  'Rédige un projet de note de synthèse à partir du dossier joint.',
  'Compare la norme ANACIM applicable avec la pratique décrite dans la pièce jointe.',
]

const MAX_FILE_SIZE = 20 * 1024 * 1024

export function CopiloteInspecteur() {
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)

  const [messages, setMessages] = useState<MessageCopilote[]>([])
  const [question, setQuestion] = useState('')
  const [repondreLoading, setRepondreLoading] = useState(false)
  const [fichiers, setFichiers] = useState<File[]>([])
  const [pieces, setPieces] = useState<PieceJointeCopilote[]>([])
  const [extracting, setExtracting] = useState(false)
  const [aerodromeId, setAerodromeId] = useState('')
  const [contexte, setContexte] = useState('')
  const [exporting, setExporting] = useState<'pdf' | 'word' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const aerodromeNom = aerodromes.find(a => a.id === aerodromeId)?.nom || ''

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, repondreLoading])

  const canEnvoyer = useMemo(() => question.trim().length > 0 && !repondreLoading, [question, repondreLoading])

  // ── Pièces jointes ────────────────────────────────────────

  const handleFichiers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const all = Array.from(e.target.files)
    const valides = all.filter(f => f.size <= MAX_FILE_SIZE)
    setFichiers(prev => [...prev, ...valides])
    setErreur(null)
    if (valides.length) {
      setExtracting(true)
      try {
        const extraites: PieceJointeCopilote[] = []
        for (const f of valides) {
          const url = URL.createObjectURL(f)
          try {
            const { texte, nbPages } = await copiloteAgent.extraireTextePiece(url)
            extraites.push({ id: f.name, nom: f.name, texte, nbPages, type: f.type })
          } finally {
            URL.revokeObjectURL(url)
          }
        }
        setPieces(prev => [...prev, ...extraites])
      } finally {
        setExtracting(false)
      }
    }
    e.target.value = ''
  }

  const retirerPiece = (index: number) => {
    setPieces(prev => prev.filter((_, i) => i !== index))
    setFichiers(prev => prev.filter((_, i) => i !== index))
  }

  // ── Dialogue ──────────────────────────────────────────────

  const envoyer = async () => {
    const q = question.trim()
    if (!q || repondreLoading) return
    setRepondreLoading(true)
    setErreur(null)
    const userMsg: MessageCopilote = { role: 'user', content: q }
    const historique = [...messages, userMsg]
    setMessages(historique)
    setQuestion('')
    try {
      const reponse = await copiloteAgent.repondre({
        question: q,
        pieces,
        historique: messages,
        aerodromeNom: aerodromeNom || undefined,
        instructions: contexte.trim() || undefined,
      })
      setMessages([...historique, { role: 'assistant', content: reponse }])
    } catch (err) {
      setMessages([...historique, { role: 'assistant', content: 'Erreur : ' + ((err as Error).message || 'réponse indisponible.') }])
    } finally {
      setRepondreLoading(false)
    }
  }

  const resetAll = () => {
    setMessages([])
    setQuestion('')
    setFichiers([])
    setPieces([])
    setContexte('')
    setAerodromeId('')
    setErreur(null)
  }

  // ── Export ────────────────────────────────────────────────

  const telecharger = async (format: 'pdf' | 'word') => {
    if (!messages.length) return
    setExporting(format)
    setErreur(null)
    try {
      await exporterRapportConversation({
        titre: 'Dialogue IA — Inspecteur ANACIM',
        aerodromeNom: aerodromeNom || undefined,
        redacteur: user ? `${user.prenom} ${user.nom}`.trim() : undefined,
        messages,
      }, format)
    } catch (err) {
      setErreur((err as Error).message || `Erreur export ${format}.`)
    } finally {
      setExporting(null)
    }
  }

  // ── Rendu ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Card
        variant="role"
        title="Copilote Inspecteur"
        subtitle="Dialogue libre avec l'IA : posez vos questions, joignez des documents si besoin, et exportez la conversation. Aucun parcours imposé."
        icon={<MessageSquare className="w-5 h-5 text-role-primary" />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Aérodrome concerné (optionnel)</span>
            <select
              value={aerodromeId}
              onChange={(e) => setAerodromeId(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">— Non précisé —</option>
              {aerodromes.map(a => <option key={a.id} value={a.id}>{a.code_oaci} — {a.nom}</option>)}
            </select>
          </label>
          <label className="block flex-1 min-w-[220px]">
            <span className="text-xs text-muted-foreground">Contexte de travail (optionnel)</span>
            <input
              value={contexte}
              onChange={(e) => setContexte(e.target.value)}
              placeholder="Ex : étude de sécurité, aéroport de Diass — je prépare un avis technique."
              className="mt-0.5 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          {messages.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={resetAll} className="btn btn-secondary h-9 px-3 text-xs gap-1.5">
                <Eraser className="w-3.5 h-3.5" /> Nouvelle conversation
              </button>
              <button onClick={() => telecharger('pdf')} disabled={exporting !== null} className="btn btn-primary h-9 px-3 text-xs gap-1.5">
                {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF
              </button>
              <button onClick={() => telecharger('word')} disabled={exporting !== null} className="btn btn-secondary h-9 px-3 text-xs gap-1.5">
                {exporting === 'word' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Word
              </button>
            </div>
          )}
        </div>
      </Card>

      {erreur && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-foreground">
          <X className="w-4 h-4 text-danger shrink-0" /> {erreur}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Pièces jointes (optionnel) */}
        <div className="lg:col-span-3 space-y-3">
          <Card variant="level" levelColor="primary" title="Documents joints" subtitle="Optionnel — l'IA garde le contexte des pièces déposées." icon={<Paperclip className="w-5 h-5 text-role-primary" />}>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card p-6 text-center cursor-pointer hover:border-role-primary/40 transition-colors"
            >
              <Paperclip className="w-6 h-6 text-role-primary mb-2" />
              <span className="text-xs font-medium text-foreground">Joindre des PDF</span>
              <span className="text-[11px] text-muted-foreground mt-1">20 Mo max par pièce</span>
            </button>
            <input ref={fileInputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={handleFichiers} />
            {(extracting || fichiers.length > 0) && (
              <div className="mt-3 space-y-1.5">
                {extracting && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extraction du texte…
                  </div>
                )}
                {pieces.map((p, i) => (
                  <div key={`${p.id}-${i}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <FileText className="w-4 h-4 text-role-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-foreground text-xs">{p.nom}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.nbPages ? `${p.nbPages} pages · ` : ''}{p.texte.trim().length > 50 ? 'texte lu' : 'non exploitable'}
                      </div>
                    </div>
                    <button onClick={() => retirerPiece(i)} className="text-foreground/40 hover:text-danger" title="Retirer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pieces.length === 0 && !extracting && (
              <p className="text-xs text-muted-foreground mt-3">Le dialogue fonctionne sans pièce jointe : l&apos;IA s&apos;appuie alors sur la réglementation OACI / IATA / ANACIM.</p>
            )}
          </Card>
        </div>

        {/* Conversation */}
        <div className="lg:col-span-9">
          <Card variant="role" title="Conversation" subtitle="Réponses fondées sur les pièces jointes (si présentes) et les référentiels OACI / IATA / ANACIM." icon={<Sparkles className="w-5 h-5 text-role-primary" />}>
            <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1 mb-3">
              {messages.length === 0 && (
                <div className="text-center py-10 text-foreground/50">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium text-foreground">Que puis-je faire pour vous, Inspecteur ?</p>
                  <p className="text-xs mt-1 mb-6">Demandez librement : analyse, rédaction, question réglementaire, comparaison…</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setQuestion(s)}
                        className="px-3 py-1.5 rounded-full border border-border bg-card text-xs text-foreground/70 hover:border-role-primary/40 hover:text-role-primary transition-colors"
                      >
                        {s.length > 70 ? s.slice(0, 70) + '…' : s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-role-primary text-white' : 'bg-muted text-foreground'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {repondreLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-3 py-2 text-sm text-foreground/60 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Réflexion en cours…
                  </div>
                </div>
              )}
              <div ref={finRef} />
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }}
                placeholder="Votre demande, votre question…"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
              <button onClick={envoyer} disabled={!canEnvoyer} className="btn btn-primary h-9 px-4 gap-1.5 text-sm">
                {repondreLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CopiloteInspecteur