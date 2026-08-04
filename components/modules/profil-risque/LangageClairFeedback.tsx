'use client'

// components/modules/profil-risque/LangageClairFeedback.tsx
// Boutons 👍/👎 d'un encart « En langage clair ». Enregistre automatiquement le
// texte affiché (auto-apprentissage d'AERORISQ) puis transmet le vote exploitant.
// L'enregistrement est best-effort : il ne bloque jamais l'affichage.

import { useEffect, useRef, useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { enregistrerLangageClair } from '@/lib/ia/aerorisqLearning'

interface Props {
  module: string
  aerodromeId?: string
  contexte?: Record<string, unknown>
  texte: string
  fallbackIA: boolean
}

export function LangageClairFeedback({ module, aerodromeId, contexte = {}, texte, fallbackIA }: Props) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const sentRef = useRef(false)

  useEffect(() => {
    if (sentRef.current) return
    sentRef.current = true
    enregistrerLangageClair({ module, aerodromeId, contexte, texte, fallbackIA })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, aerodromeId, texte])

  const voter = (v: 'up' | 'down') => {
    const nouveauVote = vote === v ? null : v
    setVote(nouveauVote)
    if (nouveauVote) {
      enregistrerLangageClair({ module, aerodromeId, contexte, texte, fallbackIA, vote: nouveauVote })
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1.5" data-module="langage-clair-feedback">
      <span className="text-[10px] text-foreground/70">Ce texte est-il clair ?</span>
      <button
        type="button"
        onClick={() => voter('up')}
        aria-label="Ce texte est clair"
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
          vote === 'up' ? 'bg-success/20 text-success' : 'bg-background/60 text-foreground/70 hover:text-success'
        }`}
      >
        <ThumbsUp className="w-3 h-3" /> Clair
      </button>
      <button
        type="button"
        onClick={() => voter('down')}
        aria-label="Ce texte n'est pas clair"
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
          vote === 'down' ? 'bg-danger/20 text-danger' : 'bg-background/60 text-foreground/70 hover:text-danger'
        }`}
      >
        <ThumbsDown className="w-3 h-3" /> Pas clair
      </button>
    </div>
  )
}
