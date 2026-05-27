// lib/certificationUtils.ts
'use client'

import type { Certification } from './store'

export interface PhaseStats {
  total: number
  active: number
  completed: number
  blocked: number
  inactive: number
  averageDuration: number
}

/**
 * Vérifie les certifications qui expirent bientôt
 */
export function checkExpiringCertifications(certifications: Certification[]) {
  const now = new Date()
  
  const expiringSoon = certifications.filter(cert => {
    if (!cert.date_expiration) return false
    const diffJ = Math.floor(
      (new Date(cert.date_expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
    return diffJ >= 0 && diffJ < 90
  })

  const expired = certifications.filter(cert => {
    if (!cert.date_expiration) return false
    return new Date(cert.date_expiration) < now
  })

  const critical = certifications.filter(cert => {
    if (!cert.date_expiration) return false
    const diffJ = Math.floor(
      (new Date(cert.date_expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
    return diffJ >= 0 && diffJ < 30
  })

  return { expiringSoon, expired, critical }
}

/**
 * Calcule les statistiques des phases d'une certification
 */
export function getPhaseStats(certification: Certification): PhaseStats {
  const now = new Date()
  let active = 0
  let completed = 0
  let blocked = 0
  let inactive = 0
  const durations: number[] = []

  for (let phase = 1; phase <= 5; phase++) {
    const phaseData = certification.phases_data?.[`phase${phase}` as keyof typeof certification.phases_data]
    const phaseAny = phaseData as { date_reception?: string; cloture_le?: string; last_activity?: string } | undefined;
    
    if (phaseAny?.cloture_le) {
      completed++
      if (phaseAny.date_reception) {
        const debut = new Date(phaseAny.date_reception)
        const fin = new Date(phaseAny.cloture_le)
        const duree = Math.ceil((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24))
        durations.push(duree)
      }
    } else if (phase <= (certification.phase_active || 1)) {
      active++
      
      // Vérifier l'inactivité
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
    total: 5,
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
export function isPhaseBlocked(certification: Certification, phase: number): boolean {
  const phaseData = certification.phases_data?.[`phase${phase}` as keyof typeof certification.phases_data]
  if (!phaseData) return false
  
  const now = new Date()
  const pd = phaseData as { last_activity?: string; date_reception?: string };
  const lastActivity = pd.last_activity || pd.date_reception
  
  if (!lastActivity) return false
  
  const daysInactive = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
  return daysInactive > 60
}

/**
 * Calcule la progression globale d'une certification
 */
export function getCertificationProgress(certification: Certification): number {
  const phaseActive = certification.phase_active || 1
  let progress = 0
  
  for (let phase = 1; phase <= 5; phase++) {
    if (phase < phaseActive) {
      progress += 20 // Phase complétée
    } else if (phase === phaseActive) {
      const phaseData = certification.phases_data?.[`phase${phase}` as keyof typeof certification.phases_data] as { completude?: number } | undefined
      if (phaseData?.completude) {
        progress += phaseData.completude * 0.2
      } else {
        progress += 10 // Phase en cours à 50%
      }
    }
  }
  
  return Math.min(100, Math.round(progress))
}

/**
 * Calcule les jours restants avant expiration
 */
export function getDaysUntilExpiration(certification: Certification): number | null {
  if (!certification.date_expiration) return null
  
  const now = new Date()
  const exp = new Date(certification.date_expiration)
  const diffJ = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  
  return diffJ
}

/**
 * Génère une alerte si nécessaire
 */
export function shouldGenerateAlert(certification: Certification): { level: 'info' | 'warning' | 'critical'; message: string } | null {
  const daysUntilExp = getDaysUntilExpiration(certification)
  
  if (daysUntilExp !== null && daysUntilExp < 30 && daysUntilExp >= 0) {
    return {
      level: 'critical',
      message: `Certificat expire dans ${daysUntilExp} jours`
    }
  }
  
  if (daysUntilExp !== null && daysUntilExp < 90 && daysUntilExp >= 0) {
    return {
      level: 'warning',
      message: `Certificat expire dans ${daysUntilExp} jours`
    }
  }
  
  const phaseStats = getPhaseStats(certification)
  if (phaseStats.blocked > 0) {
    return {
      level: 'warning',
      message: `${phaseStats.blocked} phase(s) bloquée(s) sans activité`
    }
  }
  
  return null
}