// lib/ia/healthIndex.ts
// Airport Health Index — indicateur synthétique de santé d'un aérodrome
// Combinaison pondérée des 5 dimensions C1-C5 + signaux avancés

import type { ProfilRisque, ProactiveAlertStored } from '@/lib/store'

export interface DimensionScore {
  label: string
  score: number
  poids: number
  description: string
}

export interface HealthIndexResult {
  aerodrome_id: string
  /** Score global 0-100 */
  score: number
  /** Évolution vs période précédente */
  evolution: { valeur: number; direction: 'hausse' | 'baisse' | 'stable' }
  /** Niveau de risque associé */
  niveau: string
  /** Dimensions détaillées */
  dimensions: DimensionScore[]
  /** Dimension la plus faible (risque dominant) */
  dominantRisk: { label: string; score: number }
  /** Alerte proactive la plus urgente */
  topAlert?: { message: string; urgence: string; delaiJours: number | null }
  /** Prédiction 3 mois */
  prediction: { score: number; intervalle?: { lower: number; upper: number } }
  /** Niveau de confiance du calcul */
  confiance: number
  /** Date du calcul */
  computeAt: string
}

const DIMENSION_MAP: { key: keyof ProfilRisque; label: string; description: string }[] = [
  { key: 'c1', label: 'Maturité SGS', description: 'Système de gestion de la sécurité' },
  { key: 'c2', label: 'Efficacité PAC', description: 'Plan d\'actions correctives' },
  { key: 'c3', label: 'Conformité', description: 'Conformité réglementaire' },
  { key: 'c4', label: 'Charge critique', description: 'Charge de travail et écarts' },
  { key: 'c5', label: 'Résilience', description: 'Capacité d\'absorption et de reprise' },
]

export function computeHealthIndex(profil: ProfilRisque): HealthIndexResult {
  const dimensions: DimensionScore[] = DIMENSION_MAP.map((d) => {
    const raw = profil[d.key as keyof ProfilRisque]
    const score = typeof raw === 'number' ? Math.round(raw) : 0
    return { label: d.label, score, description: d.description, poids: 0.2 }
  })

  const dominant = [...dimensions].sort((a, b) => a.score - b.score)[0]

  const evolution: HealthIndexResult['evolution'] = {
    valeur: profil.tendance === 'hausse' ? -2 : profil.tendance === 'baisse' ? 2 : 0,
    direction: profil.tendance,
  }

  let topAlert: HealthIndexResult['topAlert'] | undefined
  if (profil.proactive_alert) {
    topAlert = {
      message: profil.proactive_alert.message_court,
      urgence: profil.proactive_alert.niveau_urgence,
      delaiJours: profil.proactive_alert.delai_estime_jours,
    }
  }

  return {
    aerodrome_id: profil.aerodrome_id,
    score: Math.round(profil.score_global),
    evolution,
    niveau: profil.niveau,
    dimensions,
    dominantRisk: { label: dominant.label, score: dominant.score },
    topAlert,
    prediction: {
      score: Math.round(profil.prediction_3m),
      intervalle: profil.prediction_interval_3m,
    },
    confiance: Math.round(profil.ensemble_confidence ?? profil.qualityScore ?? 75),
    computeAt: new Date().toISOString(),
  }
}

export function computeAllHealthIndices(profils: Record<string, ProfilRisque>): HealthIndexResult[] {
  return Object.values(profils)
    .filter((p) => p.score_global != null)
    .map(computeHealthIndex)
    .sort((a, b) => a.score - b.score)
}

export function getEvolutionArrow(direction: 'hausse' | 'baisse' | 'stable'): string {
  if (direction === 'hausse') return '↑'
  if (direction === 'baisse') return '↓'
  return '→'
}

export function getEvolutionColor(direction: 'hausse' | 'baisse' | 'stable'): string {
  if (direction === 'hausse') return 'text-danger'
  if (direction === 'baisse') return 'text-success'
  return 'text-muted-foreground'
}

export function getHealthLevel(score: number): { niveau: string; color: string; bg: string } {
  if (score >= 80) return { niveau: 'Excellent', color: 'text-success', bg: 'bg-success/10' }
  if (score >= 60) return { niveau: 'Bon', color: 'text-primary', bg: 'bg-primary/10' }
  if (score >= 40) return { niveau: 'Moyen', color: 'text-warning', bg: 'bg-warning/10' }
  if (score >= 20) return { niveau: 'Faible', color: 'text-danger', bg: 'bg-danger/10' }
  return { niveau: 'Critique', color: 'text-destructive', bg: 'bg-destructive/10' }
}
