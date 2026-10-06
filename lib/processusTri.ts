// lib/processusTri.ts
// Rangement unique des dossiers certification/homologation (partagé) :
// bloqués → en retard → en cours → non démarrés → terminés.
// Un seul ordre partout = pas de surprise entre les modules.

import { etatProcessus } from './ia/synthesesDgIA'

export interface DossierProcessus {
  statut_global?: string
  phase_active?: number
  phases_data?: Record<string, ({ statut?: string; date_reception?: string; conclusion?: string } & Record<string, unknown>) | undefined>
  date_expiration?: string | null
}

/**
 * Priorité croissante (0 = le plus urgent) : bloqué (avis défavorable/à
 * réviser), en attente prolongée, en cours nominal, non démarré, terminé,
 * expiré/archivé en dernier (vaceterminés se gèrent par ailleurs).
 */
export function prioriteDossier(d: DossierProcessus | null | undefined): number {
  if (!d) return 3
  if (d.statut_global === 'en_cours') {
    const etat = etatProcessus(d.phases_data || {}, d.phase_active || 1)
    if (etat.statut === 'bloque') return 0
    if (etat.statut === 'attente') return 1
    return 2
  }
  if (d.statut_global === 'expire') return 4
  if (d.statut_global === 'suspendu') return 1
  // certifie / homologue / archive : en bas.
  return 5
}

/** Vrai si le dossier en cours est bloqué (pastille dans les listes). */
export function estDossierBloque(d: DossierProcessus | null | undefined): boolean {
  if (!d || d.statut_global !== 'en_cours') return false
  return etatProcessus(d.phases_data || {}, d.phase_active || 1).statut === 'bloque'
}

export interface MissionPlanning {
  statut?: string
  /** Déjà calculé par estPlanningEnRetard (lib/planning). */
  estRetard?: boolean
}

/**
 * Priorité planning (même esprit) : en retard → en cours → planifié →
 * réalisé → annulé. Les missions qui brûlent en tête.
 */
export function prioritePlanning(p: MissionPlanning | null | undefined): number {
  if (!p) return 2
  if (p.statut === 'annulee') return 4
  if (p.estRetard) return 0
  if (p.statut === 'en_cours') return 1
  if (p.statut === 'planifiee') return 2
  return 3
}

export interface MissionSurveillance {
  statut?: string
}

/**
 * Priorité surveillance : en cours d'abord (terrain), puis planifiée,
 * puis transmise/archivée (historique en bas).
 */
export function prioriteSurveillance(s: MissionSurveillance | null | undefined): number {
  if (!s) return 2
  if (s.statut === 'en_cours') return 0
  if (s.statut === 'planifiee') return 1
  if (s.statut === 'transmise') return 3
  return 4
}

const ORDRE_GRAVITE_EVT: Record<string, number> = { critique: 0, eleve: 1, moyen: 2, faible: 3 }

/**
 * Priorité événement : non clôturés d'abord (critiques en tête), clôturés en bas.
 */
export function prioriteEvenement(e: { statut?: string; gravite?: string } | null | undefined): number {
  if (!e) return 2
  if (e.statut === 'cloture') return 4
  if (e.statut === 'refuse') return 3
  return ORDRE_GRAVITE_EVT[e.gravite || ''] ?? 2
}

/**
 * Priorité dossier : en retard (délai dépassé) → en cours → en attente →
 * terminé/archivé. `joursRestants` = getDelaiRestant(date_limite).jours.
 */
export function prioriteDossierItem(d: { statut?: string; joursRestants?: number } | null | undefined): number {
  if (!d) return 2
  if (d.statut === 'termine' || d.statut === 'archive') return 4
  if ((d.joursRestants ?? 999) < 0) return 0
  if (d.statut === 'en_cours') return 1
  if (d.statut === 'en_attente') return 2
  return 3
}

/**
 * Priorité enquête : actives d'abord, brouillons ensuite, terminées en bas.
 */
export function prioriteEnquete(e: { statut?: string } | null | undefined): number {
  if (!e) return 2
  if (e.statut === 'active') return 0
  if (e.statut === 'brouillon') return 1
  if (e.statut === 'terminee') return 2
  return 3
}
