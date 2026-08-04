'use client'

// components/modules/profil-risque/BowTieLangageClair.tsx
// Encart « En langage clair » intégré au bloc « Analyse Bow-Tie HIRM » de la
// vue exploitant : traduit les analyses Bow-Tie (danger, protections, risque
// résiduel) en langage très simple via l'IA. Le fallback déterministe chiffré
// est affiché immédiatement (aucun écran vide), l'IA enrichit ensuite le texte.

import { useState, useEffect } from 'react'
import { ProfilRisque } from '@/lib/store'
import { BowTieModele } from '@/lib/risque/types'
import { Sparkles, Loader2 } from 'lucide-react'
import { expliquerBowTie, fallbackBowTie } from '@/lib/ia/exploitantIA'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  bowties: BowTieModele[]
}

export function BowTieLangageClair({ profil, aerodromeCode, aerodromeName, bowties }: Props) {
  const [texte, setTexte] = useState(() => fallbackBowTie({ profil, aerodromeCode, aerodromeName, bowties }).texte)
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)

  useEffect(() => {
    let actif = true
    setIaEnCours(true)
    setIaActif(false)
    setTexte(fallbackBowTie({ profil, aerodromeCode, aerodromeName, bowties }).texte)
    expliquerBowTie({ profil, aerodromeCode, aerodromeName, bowties }).then((res) => {
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
  }, [profil, aerodromeCode, aerodromeName])

  return (
    <div className="mt-3 pt-3 border-t border-border text-xs text-foreground" data-module="bowtie-langage-clair">
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
          <LangageClairFeedback module="bowtie" aerodromeId={aerodromeCode} contexte={{ nbBowties: bowties.length }} texte={texte} fallbackIA={!iaActif} />
        </div>
      )}
    </div>
  )
}
