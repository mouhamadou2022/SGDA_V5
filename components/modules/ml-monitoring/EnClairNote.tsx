// components/modules/ml-monitoring/EnClairNote.tsx
// Encart « En clair » affiché en tête de chaque carte du module Monitoring ML.
// Deux phrases simples : à quoi sert la carte + comment interpréter les résultats.
// Suit le pattern AERORISQ : le texte est enregistré auprès du moteur
// d'apprentissage et l'exploitant peut voter 👍/👎 via LangageClairFeedback.

import { BookOpen } from 'lucide-react'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'

interface Props {
  module: string
  aerodromeId?: string
  aQuoiCaSert: string
  commentLire: string
}

export function EnClairNote({ module, aerodromeId, aQuoiCaSert, commentLire }: Props) {
  const texte = `À quoi ça sert ? ${aQuoiCaSert} Comment lire les résultats ? ${commentLire}`
  return (
    <div className="rounded-lg bg-role-primary-soft/30 border border-role-primary/20 p-3 text-xs mb-4">
      <p className="flex items-center gap-1.5 font-semibold text-role-primary uppercase tracking-wide mb-1.5">
        <BookOpen className="w-3.5 h-3.5" /> En clair
      </p>
      <p className="text-foreground leading-relaxed">
        <span className="font-medium">À quoi ça sert ?</span> {aQuoiCaSert}
      </p>
      <p className="text-foreground leading-relaxed mt-1">
        <span className="font-medium">Comment lire les résultats ?</span> {commentLire}
      </p>
      <LangageClairFeedback module={module} aerodromeId={aerodromeId} texte={texte} fallbackIA={true} />
    </div>
  )
}
