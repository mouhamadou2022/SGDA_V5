// components/modules/dashboard/GuestDashboardModule.tsx
// ✅ Mode consultation publique
// ✅ Design system premium - classes harmonisées
// ✅ Animations et accessibilité
// ✅ Chat interactif AERORISQ (questions + quiz)

'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import {
  Plane, Phone, Mail, UserPlus, Globe, Building2,
  Sparkles, Loader2, AlertCircle, Activity, Send, HelpCircle,
  Trophy, RotateCcw, CheckCircle2, XCircle, MessageSquare, X,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface AerorisqResult {
  synthese: string
  indicateurs?: {
    totalAerodromes: number
    internationaux: number
    certifies: number
    certificationsEnCours: number
    homologationsActives: number
    surveillancesAnnee: number
    ecartsOuverts: number
  }
  generatedAt?: string
  iaDisponible?: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface QuizData {
  question: string
  options: string[]
  correct_index: number
  explication: string
}

const QUESTIONS_RAPIDES = [
  'Comment se déroule la certification d\'un aérodrome ?',
  'Quelle est la différence entre certification et homologation ?',
  'Qu\'est-ce que la surveillance continue ?',
  'Comment les écarts et les PAC sont-ils traités ?',
  'Comment AERORISQ analyse-t-il les risques ?',
  'Quel est le rôle de l\'ANACIM ?',
]

export function GuestDashboardModule() {
  const aerodromes = useAppStore(s => s.aerodromes);

  const aerodromesPublics = useMemo(() => (aerodromes || []).filter(a => !a.deleted_at), [aerodromes])

  const now = new Date()

  // ── Synthèse AERORISQ (consultation publique) ──
  const [aerorisq, setAerorisq] = useState<AerorisqResult | null>(null)
  const [aerorisqLoading, setAerorisqLoading] = useState(true)
  const [aerorisqError, setAerorisqError] = useState('')

  const loadAerorisq = useCallback(async () => {
    setAerorisqLoading(true)
    setAerorisqError('')
    try {
      const res = await fetch('/api/aerorisq/supervision-publique', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAerorisqError(body.error || 'Synthèse AERORISQ indisponible')
        setAerorisq(null)
        return
      }
      setAerorisq(body)
    } catch {
      setAerorisqError('Impossible de contacter AERORISQ.')
      setAerorisq(null)
    } finally {
      setAerorisqLoading(false)
    }
  }, [])

  useEffect(() => { loadAerorisq() }, [loadAerorisq])

  // ── Chat AERORISQ ──
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Quiz AERORISQ ──
  const [quizActive, setQuizActive] = useState(false)
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [quizScore, setQuizScore] = useState(0)
  const [quizTotal, setQuizTotal] = useState(0)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendQuestion = useCallback(async (texte: string) => {
    const question = texte.trim()
    if (!question || chatLoading) return
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/aerorisq/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', message: question }),
      })
      const body = await res.json().catch(() => ({}))
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: body.reply || 'Je n\u2019ai pas pu répondre pour le moment. Essayez une autre question !',
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connexion à AERORISQ impossible. Veuillez réessayer.',
      }])
    } finally {
      setChatLoading(false)
    }
  }, [chatLoading])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendQuestion(input)
  }

  const startQuiz = useCallback(async () => {
    setQuizActive(true)
    setQuizLoading(true)
    setSelectedOption(null)
    setQuizScore(0)
    setQuizTotal(0)
    try {
      const res = await fetch('/api/aerorisq/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz', theme: 'certification' }),
      })
      const body = await res.json().catch(() => ({}))
      setQuiz(body.quiz || null)
    } catch {
      setQuiz(null)
    } finally {
      setQuizLoading(false)
    }
  }, [])

  const nextQuestion = useCallback(async () => {
    setQuizLoading(true)
    setSelectedOption(null)
    try {
      const theme = quizTotal % 2 === 0 ? 'homologation' : 'certification'
      const res = await fetch('/api/aerorisq/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz', theme }),
      })
      const body = await res.json().catch(() => ({}))
      setQuiz(body.quiz || null)
    } catch {
      setQuiz(null)
    } finally {
      setQuizLoading(false)
    }
  }, [quizTotal])

  const answerQuiz = (index: number) => {
    if (selectedOption !== null || !quiz) return
    setSelectedOption(index)
    setQuizTotal(t => t + 1)
    if (index === quiz.correct_index) setQuizScore(s => s + 1)
  }

  const quitQuiz = useCallback(() => {
    setQuizActive(false)
    setQuiz(null)
    setSelectedOption(null)
    setQuizScore(0)
    setQuizTotal(0)
  }, [])

  // ── Demande d'accès au système ──
  const [accessModalOpen, setAccessModalOpen] = useState(false)
  const [accessForm, setAccessForm] = useState({ nom: '', email: '', structure: '', message: '' })
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [accessSuccess, setAccessSuccess] = useState(false)

  const openAccessModal = useCallback(() => {
    setAccessForm({ nom: '', email: '', structure: '', message: '' })
    setAccessError('')
    setAccessSuccess(false)
    setAccessModalOpen(true)
  }, [])

  const submitAccess = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (accessLoading) return
    setAccessLoading(true)
    setAccessError('')
    try {
      const res = await fetch('/api/auth/demande-acces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accessForm),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAccessError(body.error || 'Impossible d\u2019envoyer la demande.')
        return
      }
      setAccessSuccess(true)
    } catch {
      setAccessError('Connexion impossible. Veuillez réessayer.')
    } finally {
      setAccessLoading(false)
    }
  }, [accessForm, accessLoading])

  return (
    <div className="space-y-6 animate-fade-in" data-module="guest-dashboard">

      {/* ==================== EN-TÊTE ANACIM ==================== */}
      <div className="relative overflow-hidden rounded-2xl bg-role-gradient shadow-role-glow">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        </div>
        <div className="relative p-8 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 rounded-xl p-3 backdrop-blur-sm">
              <Globe className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">ANACIM</h1>
              <p className="text-white/80 text-sm">Agence Nationale de l&apos;Aviation Civile et de la Météorologie</p>
            </div>
          </div>
          <p className="text-white/90 text-sm leading-relaxed max-w-3xl">
            L&apos;ANACIM assure la supervision de la sécurité des aérodromes au Sénégal conformément aux normes
            de l&apos;Organisation de l&apos;Aviation Civile Internationale (OACI). Notre mission : garantir la sécurité
            des infrastructures aéroportuaires, superviser les processus de certification et d&apos;homologation,
            et veiller à la conformité réglementaire de l&apos;ensemble du réseau aéroportuaire national.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="badge outline bg-white/20 text-white border-white/30">
              Données publiques
            </span>
            <span className="badge outline bg-white/20 text-white border-white/30">
              Mise à jour {now.toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== SYNTTHÈSE AERORISQ ==================== */}
      <div className="relative overflow-hidden rounded-2xl border border-role-primary/20 bg-gradient-to-br from-role-primary-soft/60 via-background to-background animate-fade-up">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-role-primary/10 blur-3xl" />
        </div>
        <div className="relative p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center shadow-role-glow">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                  Supervision en un coup d&apos;œil
                  <span className="badge primary text-[10px]">AERORISQ</span>
                </h2>
                <p className="text-xs text-muted-foreground">Analyse fondée sur le risque — IA de l&apos;ANACIM</p>
              </div>
            </div>
            <button
              onClick={loadAerorisq}
              disabled={aerorisqLoading}
              className="btn btn-ghost gap-2 text-sm disabled:opacity-50"
              title="Régénérer la synthèse"
            >
              {aerorisqLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Actualiser
            </button>
          </div>

          {aerorisqLoading && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
              <Loader2 className="w-5 h-5 text-role-primary animate-spin" />
              AERORISQ analyse la supervision des aérodromes…
            </div>
          )}

          {!aerorisqLoading && aerorisqError && (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-danger">{aerorisqError}</p>
                <p className="text-xs text-muted-foreground mt-1">Posez votre question ci-dessous ou consultez les contacts.</p>
              </div>
            </div>
          )}

          {!aerorisqLoading && aerorisq && (
            <>
              <p className="text-sm leading-relaxed text-foreground">{aerorisq.synthese}</p>
              {aerorisq.generatedAt && (
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Généré par AERORISQ le {new Date(aerorisq.generatedAt).toLocaleString('fr-FR')}
                  {!aerorisq.iaDisponible ? ' — indicateurs agrégés (IA non connectée)' : ''}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ==================== CHAT & QUIZ AERORISQ ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.15s' }}>
        <div className="card-header flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-role-gradient flex items-center justify-center shadow-role-glow">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="card-title flex items-center gap-2">
                Posez votre question à AERORISQ
                <span className="badge primary text-[10px]">IA</span>
              </h3>
              <p className="text-xs text-muted-foreground">Supervision, certification, homologation, surveillance, risques…</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={quizActive ? quitQuiz : startQuiz}
              disabled={quizLoading}
              className={`gap-2 text-sm disabled:opacity-50 ${quizActive ? 'btn btn-ghost' : 'btn btn-secondary'}`}
              title={quizActive ? 'Revenir à la discussion' : 'Lancer un quiz'}
            >
              {quizLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : quizActive ? <MessageSquare className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
              {quizActive ? 'Retour au chat' : 'Tester mes connaissances'}
            </button>
          </div>
        </div>

        <div className="card-content">
          {!quizActive ? (
            <>
              {/* Suggestions rapides */}
              <div className="flex flex-wrap gap-2 mb-4">
                {QUESTIONS_RAPIDES.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendQuestion(q)}
                    disabled={chatLoading}
                    className="px-3 py-1.5 rounded-full text-xs border border-role-primary/30 bg-role-primary-soft/50 text-role-primary hover:bg-role-primary-soft transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Fil de discussion */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 mb-4">
                {messages.length === 0 && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border">
                    <Sparkles className="w-5 h-5 text-role-primary shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Bonjour ! Je suis AERORISQ. Posez-moi une question sur la supervision des aérodromes
                      du Sénégal, ou choisissez une suggestion ci-dessus.
                    </p>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-role-gradient text-white rounded-br-sm shadow-role-glow'
                        : 'bg-muted/40 border border-border rounded-bl-sm text-foreground'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted/40 border border-border text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      AERORISQ réfléchit…
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Champ de saisie */}
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ex : Comment se passe la certification d'un aérodrome ?"
                    className="w-full px-4 py-3 pr-10 rounded-xl bg-background border border-border text-sm placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-role-primary/40 focus:border-role-primary/40 transition-all"
                  />
                  <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                </div>
                <button
                  type="submit"
                  disabled={chatLoading || !input.trim()}
                  className="btn btn-primary gap-2 shrink-0 disabled:opacity-50"
                >
                  {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Envoyer
                </button>
              </form>
            </>
          ) : (
            /* ==================== QUIZ ==================== */
            <div className="space-y-4">
              {quizLoading && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="w-8 h-8 text-role-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">AERORISQ prépare une question…</p>
                </div>
              )}

              {!quizLoading && !quiz && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertCircle className="w-8 h-8 text-danger" />
                  <p className="text-sm text-muted-foreground">Impossible de générer le quiz pour le moment.</p>
                  <button onClick={startQuiz} className="btn btn-secondary gap-2">
                    <RotateCcw className="w-4 h-4" /> Réessayer
                  </button>
                </div>
              )}

              {!quizLoading && quiz && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Trophy className="w-4 h-4 text-role-primary" />
                      Score : {quizScore} / {quizTotal}
                    </div>
                    <button onClick={nextQuestion} className="btn btn-ghost gap-2 text-sm" disabled={selectedOption === null}>
                      Question suivante <Activity className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 rounded-xl bg-role-primary-soft/50 border border-role-primary/20">
                    <p className="text-base font-semibold text-foreground leading-snug">{quiz.question}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quiz.options.map((opt, idx) => {
                      const isCorrect = idx === quiz.correct_index
                      const isSelected = selectedOption === idx
                      let cls = 'border-border bg-background hover:border-role-primary/50 hover:bg-role-primary-soft/30 text-foreground'
                      let badge: React.ReactNode = null
                      if (selectedOption !== null) {
                        if (isCorrect) {
                          cls = 'border-success/50 bg-success/10 text-success'
                          badge = <CheckCircle2 className="w-4 h-4 text-success" />
                        } else if (isSelected) {
                          cls = 'border-danger/50 bg-danger/10 text-danger'
                          badge = <XCircle className="w-4 h-4 text-danger" />
                        } else {
                          cls = 'border-border bg-background text-foreground opacity-60'
                        }
                      }
                      return (
                        <button
                          key={idx}
                          onClick={() => answerQuiz(idx)}
                          disabled={selectedOption !== null}
                          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm font-medium transition-all disabled:cursor-default ${cls}`}
                        >
                          <span>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold mr-2">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            {opt}
                          </span>
                          {badge}
                        </button>
                      )
                    })}
                  </div>

                  {selectedOption !== null && (
                    <div className={`p-4 rounded-xl border flex items-start gap-3 ${selectedOption === quiz.correct_index ? 'bg-success/10 border-success/30' : 'bg-warning/10 border-warning/30'}`}>
                      {selectedOption === quiz.correct_index ? (
                        <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${selectedOption === quiz.correct_index ? 'text-success' : 'text-warning'}`}>
                          {selectedOption === quiz.correct_index ? 'Bonne réponse !' : 'Mauvaise réponse…'}
                        </p>
                        <p className="text-sm text-foreground mt-1">{quiz.explication}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================== RÉSEAU D'AÉRODROMES ==================== */}
      {aerodromesPublics.length > 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="card-header">
            <h3 className="card-title flex items-center gap-2">
              <Plane className="h-5 w-5 text-role-primary" />
              Le réseau des aérodromes du Sénégal
            </h3>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {aerodromesPublics.map(aero => (
                <div key={aero.id} className="rounded-xl bg-muted/30 border border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="code-oaci-badge">{aero.code_oaci}</span>
                    <span className={`badge ${aero.type === 'international' ? 'primary' : 'neutral'}`}>
                      {aero.type === 'international' ? 'International' : 'National'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug">{aero.nom}</p>
                  {aero.region && <p className="text-xs text-muted-foreground mt-0.5">{aero.region}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONTACT ANACIM ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.25s' }}>
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Building2 className="h-5 w-5 text-role-primary" />
            Contact ANACIM
          </h3>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3 hover:bg-muted/50 transition-colors">
              <Mail className="h-5 w-5 text-role-primary shrink-0" />
              <div>
                <p className="text-xs text-muted mb-0.5">Email</p>
                <p className="text-sm font-semibold text-foreground">contact@anacim.sn</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3 hover:bg-muted/50 transition-colors">
              <Phone className="h-5 w-5 text-role-primary shrink-0" />
              <div>
                <p className="text-xs text-muted mb-0.5">Téléphone</p>
                <p className="text-sm font-semibold text-foreground">+221 33 869 00 00</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-role-primary-soft border border-role-primary/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-role-primary text-sm">Accès complet au système SGDA</p>
              <p className="text-xs text-muted mt-0.5">
                Exploitants, inspecteurs et partenaires peuvent demander un accès complet.
              </p>
            </div>
            <button className="btn btn-primary gap-2 shrink-0" onClick={openAccessModal}>
              <UserPlus className="h-4 w-4" />
              Demander un accès au système
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-muted">
          © ANACIM Sénégal — Données publiques — Version 5.0
        </p>
      </div>

      {/* ==================== MODAL DEMANDE D'ACCÈS ==================== */}
      {accessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !accessLoading && setAccessModalOpen(false)}>
          <div className="card w-full max-w-lg animate-fade-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="card-header flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center shadow-role-glow">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="card-title">Demander un accès au système</h3>
                  <p className="text-xs text-muted-foreground">Votre demande sera transmise à l&apos;ANACIM.</p>
                </div>
              </div>
              <button
                onClick={() => setAccessModalOpen(false)}
                disabled={accessLoading}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="card-content">
              {accessSuccess ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-success" />
                  </div>
                  <p className="font-semibold text-foreground">Demande enregistrée !</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Merci {accessForm.nom || 'pour votre demande'}. L&apos;ANACIM examinera votre demande d&apos;accès
                    et vous contactera à l&apos;adresse {accessForm.email || 'fournie'}.
                  </p>
                  <button onClick={() => setAccessModalOpen(false)} className="btn btn-primary mt-2">
                    Fermer
                  </button>
                </div>
              ) : (
                <form onSubmit={submitAccess} className="space-y-4">
                  {accessError && (
                    <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
                      {accessError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nom complet *</label>
                    <input
                      type="text"
                      required
                      value={accessForm.nom}
                      onChange={(e) => setAccessForm(f => ({ ...f, nom: e.target.value }))}
                      placeholder="Votre nom et prénom"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-role-primary/40 focus:border-role-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Adresse email *</label>
                    <input
                      type="email"
                      required
                      value={accessForm.email}
                      onChange={(e) => setAccessForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="vous@entreprise.sn"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-role-primary/40 focus:border-role-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Structure / société</label>
                    <input
                      type="text"
                      value={accessForm.structure}
                      onChange={(e) => setAccessForm(f => ({ ...f, structure: e.target.value }))}
                      placeholder="Exploitant, société, administration…"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-role-primary/40 focus:border-role-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message (facultatif)</label>
                    <textarea
                      value={accessForm.message}
                      onChange={(e) => setAccessForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Précisez vos besoins d'accès (type de compte, aérodromes concernés…)"
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-role-primary/40 focus:border-role-primary/40 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setAccessModalOpen(false)} disabled={accessLoading} className="btn btn-ghost text-sm disabled:opacity-50">
                      Annuler
                    </button>
                    <button type="submit" disabled={accessLoading} className="btn btn-primary gap-2 disabled:opacity-50">
                      {accessLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Envoyer la demande
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GuestDashboardModule;
