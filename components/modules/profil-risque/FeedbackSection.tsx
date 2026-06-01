'use client'

import { useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { ThumbsUp, AlertTriangle, ThumbsDown, CheckCircle2 } from 'lucide-react'

interface FeedbackSectionProps {
  aerodromeId: string
  userRole: string
}

type Rating = 'exacte' | 'proche' | 'eloignee'

const RATINGS: { value: Rating; label: string; icon: React.ElementType; variant: string }[] = [
  {
    value: 'exacte',
    label: 'Précision exacte',
    icon: ThumbsUp,
    variant:
      'bg-success/10 text-success border border-success/30 hover:bg-success/20',
  },
  {
    value: 'proche',
    label: 'Assez proche',
    icon: AlertTriangle,
    variant:
      'bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20',
  },
  {
    value: 'eloignee',
    label: 'Très éloignée',
    icon: ThumbsDown,
    variant:
      'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
  },
]

export function FeedbackSection({ aerodromeId, userRole }: FeedbackSectionProps) {
  const addNotification = useAppStore(s => s.addNotification)
  const [submittedRating, setSubmittedRating] = useState<Rating | null>(null)

  const isInspector = userRole === 'inspecteur'

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!isInspector) return
      setSubmittedRating(rating)
      addNotification({
        user_id: '',
        type: 'info',
        message: `[Feedback] ${aerodromeId} — précision: ${rating}`,
        canal: 'in_app',
      })
    },
    [aerodromeId, isInspector, addNotification]
  )

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title flex items-center gap-2">
          <ThumbsUp className="w-4 h-4 text-primary" />
          Évaluation de la précision
        </div>
      </div>
      <div className="card-content space-y-3">
        {submittedRating ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <p className="text-sm text-success font-medium">
              Merci pour votre retour ! Évaluation enregistrée.
            </p>
          </div>
        ) : !isInspector ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border">
            <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Seuls les inspecteurs peuvent soumettre une évaluation de la précision des
              prédictions.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Dans quelle mesure la prédiction de risque correspond-elle à la réalité terrain ?
            </p>
            <div className="flex flex-wrap gap-2">
              {RATINGS.map(({ value, label, icon: Icon, variant }) => (
                <button
                  key={value}
                  onClick={() => handleRate(value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${variant}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
