// components/ui/confidence-badge.tsx
// Badge de confiance IA pour les prédictions des modèles
// Affiche un voyant couleur + texte + tooltip

'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  accuracy?: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
  showTooltip?: boolean
}

const LEVELS = [
  { min: 0.85, label: 'Fiable', variant: 'success' as const },
  { min: 0.70, label: 'Moyen', variant: 'warning' as const },
  { min: 0.50, label: 'Faible', variant: 'neutral' as const },
  { min: 0,    label: 'Non fiable', variant: 'danger' as const },
]

function getLevel(accuracy: number) {
  return LEVELS.find(l => accuracy >= l.min) || LEVELS[LEVELS.length - 1]
}

export function ConfidenceBadge({ accuracy, label, size = 'sm', showTooltip = true }: Props) {
  const acc = accuracy ?? 0
  const level = getLevel(acc)
  const pct = Math.round(acc * 100)
  const displayLabel = label || level.label

  const cls = size === 'lg' ? 'text-xs px-2.5 py-1' : size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'

  const badge = (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${cls} ${level.variant === 'success' ? 'bg-success/15 text-success' : level.variant === 'warning' ? 'bg-warning/15 text-warning' : level.variant === 'danger' ? 'bg-danger/15 text-danger' : 'bg-muted text-foreground'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${level.variant === 'success' ? 'bg-success' : level.variant === 'warning' ? 'bg-warning' : level.variant === 'danger' ? 'bg-danger' : 'bg-foreground'}`} />
      {displayLabel}{accuracy !== undefined ? ` (${pct}%)` : ''}
    </span>
  )

  if (showTooltip && accuracy !== undefined) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] text-xs">Précision du modèle: {pct}% — {level.label}. Évalué sur des données réelles hors-échantillon.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}

/**
 * Version simplifiée pour les prédictions individuelles.
 * Prend un score de confiance (0-100) au lieu de l'accuracy normalisée
 */
export function PredictionConfidence({ confidence }: { confidence: number }) {
  const acc = confidence / 100
  return <ConfidenceBadge accuracy={acc} size="sm" />
}
