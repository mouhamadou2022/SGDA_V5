// lib/homologationUtils.ts
'use client'

import type { Homologation } from './store'

export interface PhaseStats {
  total: number
  active: number
  completed: number
  blocked: number
  inactive: number
  averageDuration: number
}

/**
 * Calcule les statistiques des phases d'une homologation
 */
export function getPhaseStats(homologation: Homologation): PhaseStats {
  const now = new Date()
  let active = 0
  let completed = 0
  let blocked = 0
  let inactive = 0
  const durations: number[] = []

  for (let phase = 1; phase <= 3; phase++) {
    const phaseData = homologation.phases_data?.[`phase${phase}` as keyof typeof homologation.phases_data]
    const phaseAny = phaseData as { date_reception?: string; cloture_le?: string; last_activity?: string } | undefined;

    if (phaseAny?.cloture_le) {
      completed++
      if (phaseAny.date_reception) {
        const debut = new Date(phaseAny.date_reception)
        const fin = new Date(phaseAny.cloture_le)
        const duree = Math.ceil((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24))
        durations.push(duree)
      }
    } else if (phase <= (homologation.phase_active || 1)) {
      active++

      const lastActivity = phaseAny?.last_activity || phaseAny?.date_reception
      if (lastActivity) {
        const lastDate = new Date(lastActivity)
        const daysInactive = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysInactive > 60) {
          blocked++
        } else if (daysInactive > 30) {
          inactive++
        }
      }
    }
  }

  const averageDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0

  return {
    total: 3,
    active,
    completed,
    blocked,
    inactive,
    averageDuration
  }
}

/**
 * Vérifie si une phase est bloquée
 */
export function isPhaseBlocked(homologation: Homologation, phase: number): boolean {
  const phaseData = homologation.phases_data?.[`phase${phase}` as keyof typeof homologation.phases_data]
  if (!phaseData) return false

  const now = new Date()
  const pd = phaseData as { last_activity?: string; date_reception?: string };
  const lastActivity = pd.last_activity || pd.date_reception

  if (!lastActivity) return false

  const daysInactive = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
  return daysInactive > 60
}

/**
 * Calcule la progression globale d'une homologation
 */
export function getHomologationProgress(homologation: Homologation): number {
  const phaseActive = homologation.phase_active || 1
  let progress = 0

  for (let phase = 1; phase <= 3; phase++) {
    if (phase < phaseActive) {
      progress += 33.33
    } else if (phase === phaseActive) {
      const phaseData = homologation.phases_data?.[`phase${phase}` as keyof typeof homologation.phases_data] as { completude?: number } | undefined
      if (phaseData?.completude) {
        progress += phaseData.completude * 0.3333
      } else {
        progress += 16.66
      }
    }
  }

  return Math.min(100, Math.round(progress))
}