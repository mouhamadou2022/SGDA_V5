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

/** Niveau de maturité SGS OACI — N1 Absent → N5 Efficace */
export function getSgsMaturiteLabel(score: number): string {
  if (score >= 80) return 'N5 Efficace'
  if (score >= 60) return 'N4 Opérationnel'
  if (score >= 40) return 'N3 Approprié'
  if (score >= 20) return 'N2 Présent'
  return 'N1 Absent'
}