'use client'

// components/modules/profil-risque/HealthIndexLangageClair.tsx
// Encart « En langage clair » intégré à la carte « Health Index — Synthèse
// exécutive » : explique l'indice de santé en langage très simple via l'IA.
// Le fallback déterministe est affiché immédiatement (aucun écran vide).

import { useState, useEffect } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Sparkles, Loader2 } from 'lucide-react'
import { expliquerHealthIndex, fallbackHealthIndex } from '@/lib/ia/exploitantIA'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'

interface Props {
  profil: ProfilRisque
}

export function HealthIndexLangageClair({ profil }: Props) {
  const [texte, setTexte] = useState(() => fallbackHealthIndex(profil).texte)
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)

  useEffect(() => {
    let actif = true
    setIaEnCours(true)
    setIaActif(false)
    setTexte(fallbackHealthIndex(profil).texte)
    expliquerHealthIndex(profil).then((res) => {
      if (!actif) return
      setTexte(res.texte)
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil])

  return (
    <div className="mt-4 pt-3 border-t border-border text-xs text-foreground" data-module="health-index-langage-clair">
      {iaEnCours ? (
        <p className="flex items-center gap-1.5 text-primary">
          <Loader2 className="w-3 h-3 animate-spin" /> Analyse en cours…
        </p>
      ) : (
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-primary mb-1">
            <Sparkles className="w-3 h-3" /> En langage clair
          </p>
          <p className="leading-relaxed">{texte}</p>
          {iaActif && (
            <p className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
              <Sparkles className="w-3 h-3" /> Langage clair IA
            </p>
          )}
          <LangageClairFeedback module="health-index" contexte={{ score: profil.score_global }} texte={texte} fallbackIA={!iaActif} />
        </div>
      )}
    </div>
  )
}
