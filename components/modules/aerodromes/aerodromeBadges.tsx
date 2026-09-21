// components/modules/aerodromes/aerodromeBadges.tsx
// Badges d'affichage des aérodromes — source unique.
// Remplace les helpers dupliqués de AerodromesModule.tsx et AerodromeDetail.tsx
// (labels et classes qui pouvaient diverger : « Actif » vs « En service »…).
'use client'

import React from 'react'
import {
  Plane, CheckCircle, Minus, AlertTriangle, XCircle,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import type { Aerodrome } from '@/lib/store'
import {
  getSgsMaturiteLabel,
  getSgsMaturiteBadgeClass,
  sgsScoreVersNiveau,
  normaliserScoreSgs,
} from '@/lib/utils'

// ── Statut ────────────────────────────────────────────────────────────────
// Labels fidèles aux valeurs DB ('actif' → 'Actif').

const STATUT_VARIANTS: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }>; label: string }> = {
  actif:     { cls: 'badge success', Icon: CheckCircle,  label: 'Actif' },
  brouillon: { cls: 'badge neutral', Icon: Minus,        label: 'Brouillon' },
  suspendu:  { cls: 'badge warning', Icon: AlertTriangle, label: 'Suspendu' },
  ferme:     { cls: 'badge danger',  Icon: XCircle,       label: 'Fermé' },
}

export function AerodromeStatutBadge({ statut }: { statut: Aerodrome['statut'] | string }) {
  const variant = STATUT_VARIANTS[statut] || STATUT_VARIANTS['brouillon']
  const Icon = variant.Icon
  return (
    <span className={`${variant.cls} inline-flex items-center gap-1`}>
      <Icon className="h-3 w-3" />{variant.label}
    </span>
  )
}

// ── Type (international / national) + icône entité ─────────────────────────

export function EntiteIcon({ typeEntite, className = 'w-4 h-4' }: { typeEntite?: string; className?: string }) {
  if (typeEntite === 'helistation') return <span>🚁</span>
  if (typeEntite === 'mixte') return <span>✈🚁</span>
  return <Plane className={className} />
}

export function AerodromeTypeBadge({ type, typeEntite }: { type: string; typeEntite?: string }) {
  return type === 'international'
    ? (
      <span className="badge primary inline-flex items-center gap-1">
        <EntiteIcon typeEntite={typeEntite} className="w-3 h-3" />International
      </span>
    )
    : (
      <span className="badge teal inline-flex items-center gap-1">
        <EntiteIcon typeEntite={typeEntite} className="w-3 h-3" />National
      </span>
    )
}

export function AerodromeTypeEntiteBadge({ typeEntite }: { typeEntite?: string }) {
  switch (typeEntite) {
    case 'helistation': return <span className="badge warning inline-flex items-center gap-1">🚁 Hélistation</span>
    case 'mixte':       return <span className="badge purple  inline-flex items-center gap-1">✈🚁 Mixte</span>
    default:            return <span className="badge neutral inline-flex items-center gap-1">✈ Aérodrome</span>
  }
}

// ── Niveau de risque (profil) ─────────────────────────────────────────────
// Le fallback est sûr : l'ancienne version accédait à variants['modere']
// (inexistant) puis déréférençait undefined → crash pour tout niveau
// inattendu dès qu'un score était fourni.

export function getRiskBadgeClass(niveau: string): string {
  switch (niveau) {
    case 'faible':   return 'risk-badge faible'
    case 'moyen':    return 'risk-badge moyen'
    case 'eleve':    return 'risk-badge eleve'
    case 'critique': return 'risk-badge critique'
    default:         return 'badge neutral'
  }
}

export function getRiskProgressClass(niveau: string): string {
  switch (niveau) {
    case 'faible':   return 'progress-faible'
    case 'moyen':    return 'progress-moyen'
    case 'eleve':    return 'progress-eleve'
    case 'critique': return 'progress-critique'
    default:         return ''
  }
}

const RISQUE_VARIANTS: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  faible:   { cls: 'risk-badge faible',   Icon: CheckCircle },
  moyen:    { cls: 'risk-badge moyen',    Icon: Minus },
  eleve:    { cls: 'risk-badge eleve',    Icon: AlertTriangle },
  critique: { cls: 'risk-badge critique', Icon: AlertTriangle },
}

export function NiveauRisqueBadge({ niveau, score }: { niveau?: string; score?: number }) {
  if (!niveau || score == null) return <span className="badge neutral">N/A</span>
  const variant = RISQUE_VARIANTS[niveau] || { cls: 'badge neutral', Icon: Minus }
  const Icon = variant.Icon
  return (
    <span className={`${variant.cls} inline-flex items-center gap-1`}>
      <Icon className="h-3 w-3" />{niveau.charAt(0).toUpperCase() + niveau.slice(1)} ({score}%)
    </span>
  )
}

// ── Maturité SGS ──────────────────────────────────────────────────────────
// Échelle canonique 0-100 (normalise le legacy 1-5), libellé AGENTS.md
// getSgsMaturiteLabel (« N5 Efficace »…).

export function SgsMaturiteBadge({ score }: { score: number | null | undefined }) {
  const normalise = normaliserScoreSgs(score, 0)
  const niveau = sgsScoreVersNiveau(normalise)
  return (
    <span className={getSgsMaturiteBadgeClass(niveau)}>
      {getSgsMaturiteLabel(normalise)}
    </span>
  )
}

// ── Tendance ──────────────────────────────────────────────────────────────

export function TendanceIcon({ tendance }: { tendance?: string }) {
  switch (tendance) {
    case 'hausse': return <TrendingUp className="h-4 w-4 text-success" />
    case 'baisse': return <TrendingDown className="h-4 w-4 text-danger" />
    default: return <Minus className="h-4 w-4 text-muted-foreground" />
  }
}
