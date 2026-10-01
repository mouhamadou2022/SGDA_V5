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
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { copiloteAgent } from '@/lib/ia/agents/copiloteAgent'
import type { MessageCopilote, PieceJointeCopilote } from '@/lib/ia/agents/copiloteAgent'
import { detecterFormatOffice, extractTextFromOffice } from '@/lib/services/officeExtractor'
import { Markdown, markdownVersTexte } from '@/components/ui/markdown'
import { executerPilote } from '@/lib/ia/pilote/bouclePilote'
import { exporterRapportConversation } from '@/lib/services/rapportConversation'

const SUGGESTIONS = [
  'Peux-tu analyser les documents joints et m\'en faire une synthèse ?',
  'Quelles exigences OACI / ANACIM s\'appliquent à ce type d\'étude ?',
  'Rédige un projet de note de synthèse à partir du dossier joint.',
  'Compare la norme ANACIM applicable avec la pratique décrite dans la pièce jointe.',
]

const MAX_FILE_SIZE = 20 * 1024 * 1024

/** État de lecture d'une pièce (repli pour les pièces sans statut explicite). */
function statutPiece(p: PieceJointeCopilote): 'ok' | 'vision' | 'ocr' | 'echec' {
  return p.statutLecture ?? (p.texte.trim().length > 50 ? 'ok' : 'echec')
}

function libelleLecture(p: PieceJointeCopilote): string {
  const statut = statutPiece(p)
  if (statut === 'ok') return 'texte lu'
  if (statut === 'vision') return 'lu par l’IA locale'
  if (statut === 'ocr') return 'scan récupéré par OCR'
  return p.detailEchec || 'non exploitable'
}

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
  const [secondesAttente, setSecondesAttente] = useState(0)
  const jetonReponse = useRef(0)
  // ── Mode pilote AERORISQ : l'IA agit via des outils (écritures confirmées).
  const [modePilote, setModePilote] = useState(false)
  const [tracePilote, setTracePilote] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState<{
    outil: string
    args: Record<string, unknown>
    resoudre: (ok: boolean) => void
  } | null>(null)
  // ── Commandes vocales : dictée (STT) + lecture des réponses (TTS).
  const [dictation, setDictation] = useState(false)
  const [lectureActive, setLectureActive] = useState(false)
  const recognitionRef = useRef<any>(null)
  const voixSupportee = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  // Meilleure voix française : neurale/naturelle d'abord (Edge : « Natural »,
  // Chrome : « Google français »), voix robotiques en dernier recours.
  // Note : getVoices() est souvent vide au premier appel → écoute voiceschanged.
  const choisirVoixFr = (): SpeechSynthesisVoice | null => {
    try {
      const voix = window.speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('fr'))
      if (voix.length === 0) return null
      const score = (v: SpeechSynthesisVoice) => {
        const nom = (v.name || '').toLowerCase()
        let s = 0
        if (/natural|neural/.test(nom)) s += 3
        if (/google français/.test(nom)) s += 2
        if (/microsoft|google/.test(nom)) s += 1
        if (v.localService) s += 1
        return s
      }
      return [...voix].sort((a, b) => score(b) - score(a))[0]
    } catch {
      return null
    }
  }

  useEffect(() => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices()
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
      }
    } catch { /* silencieux */ }
    return () => {
      try {
        window.speechSynthesis?.cancel()
        if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null
      } catch { /* silencieux */ }
    }
  }, [])

  const lireTexte = (texte: string) => {
    try {
      if (!('speechSynthesis' in window)) return
      window.speechSynthesis.cancel()
      const propre = markdownVersTexte(texte).slice(0, 2000)
      if (!propre.trim()) return
      const voix = new SpeechSynthesisUtterance(propre)
      voix.lang = 'fr-FR'
      voix.rate = 1.02
      const fr = choisirVoixFr()
      if (fr) voix.voice = fr
      window.speechSynthesis.speak(voix)
    } catch { /* TTS indisponible : silencieux */ }
  }

  const basculerLecture = () => {
    const prochaine = !lectureActive
    setLectureActive(prochaine)
    if (!prochaine) {
      try { window.speechSynthesis?.cancel() } catch { /* silencieux */ }
      return
    }
    const derniere = [...messages].reverse().find(m => m.role === 'assistant')
    if (derniere) lireTexte(derniere.content)
  }

  const basculerDictee = () => {
    if (!voixSupportee) {
      setErreur('Commandes vocales non supportées par ce navigateur — utilisez Chrome ou Edge (micro autorisé).')
      return
    }
    if (dictation) {
      try { recognitionRef.current?.stop() } catch { /* silencieux */ }
      setDictation(false)
      return
    }
    try {
      const Classe = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const rec = new Classe()
      rec.lang = 'fr-FR'
      rec.continuous = false
      rec.interimResults = false
      rec.onresult = (event: any) => {
        const texte = event.results?.[0]?.[0]?.transcript || ''
        setDictation(false)
        if (texte.trim()) {
          setQuestion(texte.trim())
          // Envoi automatique : « demande à l'IA » d'une phrase.
          setTimeout(() => envoyer(texte.trim()), 50)
        }
      }
      rec.onerror = () => setDictation(false)
      rec.onend = () => setDictation(false)
      recognitionRef.current = rec
      rec.start()
      setDictation(true)
    } catch {
      setDictation(false)
    }
  }

  // Chronomètre d'attente pendant la réponse IA (rassure quand le modèle est lent).
  useEffect(() => {
    if (!repondreLoading) return
    const id = setInterval(() => setSecondesAttente(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [repondreLoading])
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
    const tropLourds = all.filter(f => f.size > MAX_FILE_SIZE)
    if (tropLourds.length > 0) {
      setErreur(`Fichier(s) trop lourd(s) (20 Mo max) : ${tropLourds.map(f => f.name).join(', ')}.`)
    }
    const valides = all.filter(f => f.size <= MAX_FILE_SIZE)
    setFichiers(prev => [...prev, ...valides])
    if (valides.length) setErreur(null)
    if (valides.length) {
      setExtracting(true)
      try {
        const extraites: PieceJointeCopilote[] = []
        for (const f of valides) {
          // Documents Office (Word/Excel/PowerPoint) : lecture locale instantanée.
          if (detecterFormatOffice(f.name)) {
            try {
              const office = await extractTextFromOffice(await f.arrayBuffer(), f.name)
              extraites.push({
                id: f.name, nom: f.name, texte: office.texte,
                nbPages: office.nbUnites || undefined, uniteLecture: office.nbUnites ? office.unite : undefined,
                type: f.type, statutLecture: office.texte.trim().length > 50 ? 'ok' : 'echec',
                detailEchec: office.texte.trim().length > 50 ? undefined : 'Document Office vide — vérifiez son contenu.',
              })
            } catch (err) {
              extraites.push({
                id: f.name, nom: f.name, texte: '', type: f.type,
                statutLecture: 'echec', detailEchec: (err as Error).message,
              })
            }
            continue
          }
          // Ni PDF ni Office supporté (ex. vieux .doc/.xls/.ppt) : message clair.
          const estPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
          if (!estPdf) {
            extraites.push({
              id: f.name, nom: f.name, texte: '', type: f.type,
              statutLecture: 'echec',
              detailEchec: `Format non pris en charge : « ${f.name} ». Formats acceptés : PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx).`,
            })
            continue
          }
          // PDF : texte natif, sinon lecture par l'IA de vision.
          const url = URL.createObjectURL(f)
          try {
            const { texte, nbPages, statutLecture, detailEchec } = await copiloteAgent.extraireTextePiece(url, f.name)
            extraites.push({ id: f.name, nom: f.name, texte, nbPages, uniteLecture: 'pages', type: f.type, statutLecture, detailEchec })
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

  const envoyer = async (questionForcee?: string) => {
    const q = (questionForcee ?? question).trim()
    if (!q || repondreLoading) return
    try { window.speechSynthesis?.cancel() } catch { /* silencieux */ }
    setRepondreLoading(true)
    setSecondesAttente(0)
    setErreur(null)
    const userMsg: MessageCopilote = { role: 'user', content: q }
    const historique = [...messages, userMsg]
    setMessages(historique)
    setQuestion('')
    // L'appel IA n'est pas annulable côté client : en cas d'abandon on ignore
    // simplement la réponse à son arrivée (flag) au lieu de la perdre en erreur.
    const jeton = ++jetonReponse.current
    try {
      if (modePilote) {
        // MODE PILOTE : AERORISQ agit via ses outils (confirmations humaines).
        const textesPieces = pieces
          .filter(p => p.texte.trim().length > 50)
          .map(p => `── PIÈCE : ${p.nom} ──\n${p.texte.trim().substring(0, 4000)}`)
          .join('\n\n')
        const resultat = await executerPilote({
          instruction: [textesPieces, `DEMANDE : ${q}`].filter(Boolean).join('\n\n'),
          historique: messages,
          contexte: { userId: user?.id },
          onConfirmer: (outil, args) => new Promise<boolean>(resoudre => {
            setConfirmation({ outil, args, resoudre })
          }),
          onTrace: (etape) => setTracePilote(prev => [...prev, etape]),
        })
        if (jetonReponse.current !== jeton) return
        const resumeActions = resultat.actions.length > 0
          ? `\n\n---\n**Actions du pilote :**\n${resultat.actions.map(a => `- ${a.outil} : ${a.statut}`).join('\n')}`
          : ''
        const contenuFinal = resultat.reponse + resumeActions
        setMessages([...historique, { role: 'assistant', content: contenuFinal }])
        if (lectureActive) lireTexte(contenuFinal)
      } else {
        const reponse = await copiloteAgent.repondre({
          question: q,
          pieces,
          historique: messages,
          aerodromeNom: aerodromeNom || undefined,
          instructions: contexte.trim() || undefined,
        })
        if (jetonReponse.current !== jeton) return
        setMessages([...historique, { role: 'assistant', content: reponse }])
        if (lectureActive) lireTexte(reponse)
      }
    } catch (err) {
      if (jetonReponse.current !== jeton) return
      setMessages([...historique, { role: 'assistant', content: 'Erreur : ' + ((err as Error).message || 'réponse indisponible.') }])
    } finally {
      if (jetonReponse.current === jeton) {
        setRepondreLoading(false)
        setConfirmation(null)
      }
    }
  }

  const abandonnerReponse = () => {
    jetonReponse.current++
    setRepondreLoading(false)
    setMessages(prev => [...prev, { role: 'assistant', content: 'Réponse interrompue à votre demande — reformulez ou réessayez.' }])
  }

  const resetAll = () => {
    setMessages([])
    setQuestion('')
    setFichiers([])
    setPieces([])
    setContexte('')
    setAerodromeId('')
    setErreur(null)
    setTracePilote([])
    setConfirmation(null)
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
          <label className="flex items-center gap-2 ml-auto cursor-pointer" title="Le copilote conseille ; le mode action EXÉCUTE via des outils (profil de risque, écarts, propositions de surveillance). Chaque écriture demande votre approbation.">
            <input
              type="checkbox"
              checked={modePilote}
              onChange={(e) => setModePilote(e.target.checked)}
              className="accent-warning w-4 h-4"
            />
            <span className={`text-xs font-medium flex items-center gap-1 rounded-full px-2.5 py-1 border ${modePilote ? 'bg-warning/10 border-warning/40 text-foreground' : 'border-border text-foreground/70'}`}>
              <Sparkles className="w-3.5 h-3.5 text-warning" /> Mode action — l’IA exécute
            </span>
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
              <span className="text-xs font-medium text-foreground">Joindre un document</span>
              <span className="text-[11px] text-muted-foreground mt-1">PDF, Word, Excel, PowerPoint · 20 Mo max</span>
            </button>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,application/pdf" className="hidden" onChange={handleFichiers} />
            {(extracting || fichiers.length > 0) && (
              <div className="mt-3 space-y-1.5">
                {extracting && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture du document (texte direct, sinon l’IA locale lit les pages)…
                  </div>
                )}
                {pieces.map((p, i) => (
                  <div key={`${p.id}-${i}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <FileText className="w-4 h-4 text-role-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-foreground text-xs">{p.nom}</div>
                      <div className={`text-[11px] ${statutPiece(p) === 'echec' ? 'text-danger' : 'text-muted-foreground'}`} title={p.detailEchec}>
                        {p.nbPages ? `${p.nbPages} ${p.uniteLecture || 'pages'} · ` : ''}{libelleLecture(p)}
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
          <Card variant="role" title="Conversation" subtitle="Copilote = conseil. Mode action = l’IA exécute via ses outils (avec votre approbation). Réponses fondées sur les pièces jointes et les référentiels OACI / IATA / ANACIM." icon={<Sparkles className="w-5 h-5 text-role-primary" />}>
            {modePilote && (
              <p className="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-foreground">
                ⚡ Mode action actif : AERORISQ consulte les données et propose des actions — chacune sera soumise à votre approbation.
              </p>
            )}
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
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'bg-role-primary text-white whitespace-pre-wrap' : 'bg-muted text-foreground'}`}>
                    {m.role === 'user' ? m.content : <Markdown texte={m.content} />}
                  </div>
                </div>
              ))}
              {repondreLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-3 py-2 text-sm text-foreground/60 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Réflexion en cours… ({secondesAttente}s)
                    <button onClick={abandonnerReponse} className="ml-1 underline hover:text-danger" title="Interrompre l'attente">
                      Interrompre
                    </button>
                  </div>
                </div>
              )}
              {tracePilote.length > 0 && (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                  <p className="font-medium mb-0.5">Traces du pilote</p>
                  {tracePilote.slice(-6).map((t, i) => <p key={i}>{t}</p>)}
                </div>
              )}
              {confirmation && (
                <div className="rounded-xl border-2 border-warning bg-warning/5 p-3">
                  <p className="text-sm font-semibold text-foreground">✋ Le pilote demande votre approbation</p>
                  <p className="text-xs text-foreground mt-1">
                    Action : <span className="font-mono font-medium">{confirmation.outil}</span>
                  </p>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-card p-2 text-[11px] text-foreground/80">
                    {JSON.stringify(confirmation.args, null, 2)}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => { confirmation.resoudre(true); setConfirmation(null) }}
                      className="btn btn-primary h-8 px-4 text-xs"
                    >
                      Approuver et exécuter
                    </button>
                    <button
                      onClick={() => { confirmation.resoudre(false); setConfirmation(null) }}
                      className="btn btn-secondary h-8 px-4 text-xs"
                    >
                      Refuser
                    </button>
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
                placeholder="Votre demande, votre question… ou dictez-la au micro"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
              <button
                onClick={basculerDictee}
                title={voixSupportee ? 'Dicter la demande (envoi automatique)' : 'Voix non supportée par ce navigateur'}
                className={`btn h-9 px-3 gap-1.5 text-sm ${dictation ? 'btn-danger' : 'btn-secondary'}`}
              >
                {dictation ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={basculerLecture}
                title={lectureActive ? 'Couper la lecture vocale des réponses' : 'Lire les réponses à voix haute'}
                className={`btn h-9 px-3 gap-1.5 text-sm ${lectureActive ? 'btn-primary' : 'btn-secondary'}`}
              >
                {lectureActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button onClick={() => envoyer()} disabled={!canEnvoyer} className="btn btn-primary h-9 px-4 gap-1.5 text-sm">
                {repondreLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
              </button>
            </div>
            {dictation && (
              <p className="text-xs text-danger mt-1.5 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 animate-pulse" /> Écoute en cours… parlez, la demande part automatiquement.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CopiloteInspecteur