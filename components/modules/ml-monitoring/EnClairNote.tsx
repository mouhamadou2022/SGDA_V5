// components/modules/ml-monitoring/EnClairNote.tsx
// Encart « En clair » affiché en tête de chaque carte du module Monitoring ML.
// Deux phrases simples : à quoi sert la carte + comment interpréter les résultats.

import { BookOpen } from 'lucide-react'

interface Props {
  aQuoiCaSert: string
  commentLire: string
}

export function EnClairNote({ aQuoiCaSert, commentLire }: Props) {
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
    </div>
  )
}
