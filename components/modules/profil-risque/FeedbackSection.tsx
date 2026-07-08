'use client'

import { useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { ThumbsUp, AlertTriangle, ThumbsDown, CheckCircle2, Brain } from 'lucide-react'
import { isCorrectionNeeded, computeModelPerformance } from '@/lib/risque/calibration'
import type { MatricePerformance } from '@/lib/risque/types'
import type { FeedbackInspecteur } from '@/lib/risque/types'

interface FeedbackSectionProps {
  aerodromeId: string
  userRole: string
  predictedScore?: number
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

const FEEDBACK_STORAGE_KEY = 'sgda_feedbacks'

function loadFeedbacks(aerodromeId: string): FeedbackInspecteur[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY)
    if (!raw) return []
    const all: FeedbackInspecteur[] = JSON.parse(raw)
    return all.filter(f => f.aerodrome_id === aerodromeId)
  } catch { return [] }
}

function saveFeedback(fb: FeedbackInspecteur): void {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY)
    const all: FeedbackInspecteur[] = raw ? JSON.parse(raw) : []
    all.push(fb)
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

export function FeedbackSection({ aerodromeId, userRole, predictedScore = 50 }: FeedbackSectionProps) {
  const addNotification = useAppStore(s => s.addNotification)
  const [submittedRating, setSubmittedRating] = useState<Rating | null>(null)
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null)

  const isInspector = userRole === 'inspecteur'

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!isInspector) return
      setSubmittedRating(rating)

      const erreur = rating === 'exacte' ? 0 : rating === 'proche' ? 5 : 15
      const valueReelle = Math.max(0, Math.min(100, predictedScore - (rating === 'exacte' ? 0 : rating === 'proche' ? -3 : 10)))

      const fb: FeedbackInspecteur = {
        id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        aerodrome_id: aerodromeId,
        type: 'prediction_3m',
        valeurPredite: predictedScore,
        valeurReelle: valueReelle,
        erreur,
        commentaire: rating,
        inspecteur_id: '',
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
      }

      saveFeedback(fb)

      addNotification({
        user_id: '',
        type: 'info',
        message: `[Feedback] ${aerodromeId} — précision: ${rating} (erreur: ${erreur} pts)`,
        canal: 'in_app',
      })

      // Vérifier si calibration nécessaire
      const allFeedbacks = loadFeedbacks(aerodromeId)
      const perf = computeModelPerformance(allFeedbacks)
      const { besoin, raisons } = isCorrectionNeeded(perf)
      if (besoin) {
        setCalibrationNote(raisons.join('; '))
      }
    },
    [aerodromeId, isInspector, addNotification, predictedScore]
  )

  return (
    <Card variant="role" title="Évaluation de la précision" icon={<ThumbsUp className="w-4 h-4" />}>
      <div className="space-y-4">
        {submittedRating ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <p className="text-sm text-success font-medium">
                Merci pour votre retour ! Évaluation enregistrée.
              </p>
            </div>
            {calibrationNote && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <Brain className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Calibration suggérée</p>
                  <p className="text-xs text-foreground mt-0.5">{calibrationNote}</p>
                </div>
              </div>
            )}
          </div>
        ) : !isInspector ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border">
            <AlertTriangle className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">
              Seuls les inspecteurs peuvent soumettre une évaluation de la précision des
              prédictions.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-foreground">
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
    </Card>
  )
}
