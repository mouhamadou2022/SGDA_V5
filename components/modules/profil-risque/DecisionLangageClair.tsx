'use client'

// components/modules/profil-risque/DecisionLangageClair.tsx
// Encart « En langage clair » pour la vue DG : traduit la synthèse et chaque
// carte du tableau de bord décisionnel en langage très simple via l'IA.
// Le fallback déterministe est affiché immédiatement (aucun écran vide),
// l'IA vient ensuite enrichir le texte si disponible.

import { useState, useEffect } from 'react'
import { ProfilRisque, EvenementSecurite, Ecart, Surveillance } from '@/lib/store'
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { expliquerDecisionDG, fallbackDecisionDG, type DecisionDGExplication } from '@/lib/ia/decisionIA'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  nbEcartsCritiques: number
  ecartsActifs: Ecart[]
  prochainesSurveillances?: Surveillance[]
  evenements?: EvenementSecurite[]
}

export default function DecisionLangageClair({
  profil, aerodromeCode, aerodromeName, nbEcartsCritiques,
  ecartsActifs, prochainesSurveillances = [], evenements = [],
}: Props) {
  const input = { profil, aerodromeCode, aerodromeName, nbEcartsCritiques, ecartsActifs, prochainesSurveillances, evenements }

  const [explication, setExplication] = useState<DecisionDGExplication>(() => fallbackDecisionDG(input))
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)
  const [ouvert, setOuvert] = useState(true)

  useEffect(() => {
    let actif = true
    setIaEnCours(true)
    setIaActif(false)
    setExplication(fallbackDecisionDG(input))
    expliquerDecisionDG(input).then((res) => {
      if (!actif) return
      setExplication(res)
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil, aerodromeCode, aerodromeName, nbEcartsCritiques])

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-soft/10 p-4" data-module="decision-langage-clair">
      <button onClick={() => setOuvert((o) => !o)} className="w-full flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles className="w-4 h-4 text-role-primary" /> En langage clair
        </span>
        <span className="flex items-center gap-2">
          {!iaEnCours && iaActif && <span className="badge primary text-[10px]">Langage clair AERORISQ</span>}
          {iaEnCours ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : ouvert ? <ChevronUp className="w-4 h-4 text-foreground" /> : <ChevronDown className="w-4 h-4 text-foreground" />}
        </span>
      </button>

      {ouvert && (
        <div className="mt-3 text-xs text-foreground">
          {iaEnCours ? (
            <p className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" /> Analyse en cours…
            </p>
          ) : (
            <>
              <p className="leading-relaxed font-medium">{explication.synthese}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 mt-3 border-t border-border/50">
                {[
                  { label: 'Score', texte: explication.score },
                  { label: 'Projections', texte: explication.projections },
                  { label: 'Actions à décider', texte: explication.actions },
                  { label: 'Écarts & surveillances', texte: explication.ecarts },
                ].map((s) => (
                  <div key={s.label} className="bg-background/60 rounded-lg p-2.5">
                    <p className="text-[10px] font-semibold uppercase text-primary mb-1">{s.label}</p>
                    <p className="leading-relaxed">{s.texte}</p>
                  </div>
                ))}
              </div>
              <LangageClairFeedback module="decision" aerodromeId={aerodromeCode} contexte={{ score: profil.score_global, nbEcartsCritiques }} texte={explication.synthese} fallbackIA={!iaActif} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
