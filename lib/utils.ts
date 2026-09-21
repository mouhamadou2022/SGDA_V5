// lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'relative' = 'short') {
  const d = new Date(date)
  
  if (format === 'relative') {
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return `à l'instant`
    if (diffMins < 60) return `il y a ${diffMins} min`
    if (diffHours < 24) return `il y a ${diffHours} h`
    if (diffDays < 7) return `il y a ${diffDays} j`
    return d.toLocaleDateString('fr-FR')
  }

  if (format === 'long') {
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return d.toLocaleDateString('fr-FR')
}

export function generateId(): string {
  return crypto.randomUUID()
}

/** Nombre fini borné (garde anti-NaN partagée — voir assainirProfilRisque). */
export function toFiniteNumber(v: unknown, def: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def
  return Math.min(max, Math.max(min, n))
}

/** Niveau de maturité SGS OACI — N1 Absent → N5 Efficace */
export function getSgsMaturiteLabel(score: number): string {
  if (score >= 80) return 'N5 Efficace'
  if (score >= 60) return 'N4 Opérationnel'
  if (score >= 40) return 'N3 Approprié'
  if (score >= 20) return 'N2 Présent'
  return 'N1 Absent'
}

// ─────────────────────────────────────────────────────────────
// Échelle canonique de maturite_sgs : 0-100.
// Référence : migration SQL 2026-05-21 (« Migration de maturite_sgs de 1-5
// vers 0-100 », contrainte CHECK 1-5 supprimée). Tous les lecteurs
// (initialProfile, profilScoreEngine, riskEngine, surveillanceAutoCreator,
// évaluation PAOE qui écrit scoreGlobal %) supposent 0-100.
// Seul le formulaire travaille en N1-N5 : convertir à la frontière via
// les helpers ci-dessous — ne JAMAIS stocker du 1-5.
// ─────────────────────────────────────────────────────────────

export type SgsNiveau = 1 | 2 | 3 | 4 | 5

/** Seuils strictement alignés sur getSgsMaturiteLabel (source unique). */
export function sgsScoreVersNiveau(score: number): SgsNiveau {
  if (score >= 80) return 5
  if (score >= 60) return 4
  if (score >= 40) return 3
  if (score >= 20) return 2
  return 1
}

/**
 * Niveau N1-N5 → score 0-100. Même mapping que calculateC1
 * (lib/risque.ts) : N1=0, N2=25, N3=50, N4=75, N5=100.
 */
export function sgsNiveauVersScore(niveau: SgsNiveau | number): number {
  const n = Math.min(5, Math.max(1, Math.round(niveau)))
  return (n - 1) * 25
}

/**
 * Normalise une valeur lue (DB, store, import) vers 0-100.
 * Les lignes écrites par le formulaire avant sa conversion en 0-100
 * contiennent encore du 1-5 : elles sont détectées (1 ≤ v ≤ 5) et
 * converties. Après une ré-édition, la valeur est stockée en 0-100.
 */
export function normaliserScoreSgs(valeur: number | null | undefined, defaut = 50): number {
  if (valeur == null || Number.isNaN(valeur)) return defaut
  if (valeur >= 1 && valeur <= 5) return sgsNiveauVersScore(valeur)
  return Math.min(100, Math.max(0, Math.round(valeur)))
}

/** Classe badge associée au niveau N1-N5 (source unique d'affichage). */
export function getSgsMaturiteBadgeClass(niveau: SgsNiveau | number): string {
  switch (Math.min(5, Math.max(1, Math.round(niveau)))) {
    case 1: return 'badge danger'
    case 2: return 'badge warning'
    case 3:
    case 4: return 'badge primary'
    default: return 'badge success'
  }
}