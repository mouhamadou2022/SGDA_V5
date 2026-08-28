'use client'

// components/modules/profil-risque/CarteLangageClair.tsx
// Encart « En langage clair » intégré dans une carte de la vue exploitant.
// Traduit une section (situation / diagnostic / actions) en langage très simple
// via l'IA. Le fallback déterministe est affiché immédiatement (aucun écran
// vide), l'IA vient ensuite enrichir le texte si disponible.
// Les 3 cartes partagent la même entrée : le cache de l'aiClient garantit un
// seul appel IA réel.

import { useState, useEffect } from 'react'
import { ProfilRisque, EvenementSecurite, Ecart } from '@/lib/store'
import { Sparkles, Loader2 } from 'lucide-react'
import { expliquerSituationExploitant, fallbackExploitant } from '@/lib/ia/exploitantIA'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'

export type CarteLangageClairSection = 'situation' | 'diagnostic' | 'actions'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  ecartsActifs: Ecart[]
  evenements?: EvenementSecurite[]
  section: CarteLangageClairSection
  label?: string
}

export function CarteLangageClair({
  profil, aerodromeCode, aerodromeName, ecartsActifs, evenements = [],
  section, label,
}: Props) {
  const input = { profil, aerodromeCode, aerodromeName, ecartsActifs, evenements }
  const fallbackText = fallbackExploitant(input)[section]

  const [texte, setTexte] = useState(fallbackText)
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)

  useEffect(() => {
    let actif = true
    setIaEnCours(true)
    setIaActif(false)
    setTexte(fallbackExploitant(input)[section])
    expliquerSituationExploitant(input).then((res) => {
      if (!actif) return
      setTexte(res[section])
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil, aerodromeCode, aerodromeName, section])

  return (
    <div className="mt-4 pt-3 border-t border-border text-xs text-foreground" data-module={`carte-langage-clair-${section}`}>
      {iaEnCours ? (
        <p className="flex items-center gap-1.5 text-primary">
          <Loader2 className="w-3 h-3 animate-spin" /> Analyse en cours…
        </p>
      ) : (
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-primary mb-1">
            <Sparkles className="w-3 h-3" /> {label ?? 'En langage clair'}
          </p>
          <p className="leading-relaxed">{texte}</p>
          {iaActif && (
            <p className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
              <Sparkles className="w-3 h-3" /> Langage clair IA
            </p>
          )}
          <LangageClairFeedback module={`exploitant-${section}`} aerodromeId={aerodromeCode} contexte={{ section, score: profil.score_global }} texte={texte} fallbackIA={!iaActif} />
        </div>
      )}
    </div>
  )
}
