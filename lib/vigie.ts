// lib/vigie.ts — Décisions pures de la vigie périodique (dossiers, plannings).
// Extraites des tranches (comportement identique) : les slices appliquent
// (set/emit), ici on décide. Testé : lib/__tests__/vigie.test.ts.

import { isPlanningTerminal } from './planning';
import { joursRestants } from './ecarts-rappels';
import type { Planning } from './store/planningsSlice';
import type { Surveillance } from './store/surveillancesSlice';

export interface DecisionRappelsDossier {
  /** Date limite dépassée et pas encore notifiée. */
  notifierRetard: boolean;
  /** Seuils d'échéance atteints et pas encore notifiés (parmi 15/7/3). */
  seuils: number[];
}

/** Retard + seuils d'échéance d'un dossier (flags `_retard_notifie`, `_rappel_j*`). */
export function evaluerRappelsDossier<T extends { date_limite: string }>(
  dossier: T,
  maintenant: Date,
): DecisionRappelsDossier {
  const jours = joursRestants(dossier.date_limite, maintenant)
  const flags = dossier as Record<string, unknown>
  if (jours < 0) {
    return { notifierRetard: !flags._retard_notifie, seuils: [] }
  }
  if (jours <= 15 && jours > 0) {
    return {
      notifierRetard: false,
      seuils: [15, 7, 3].filter(seuil => jours === seuil && !flags[`_rappel_j${seuil}`]),
    }
  }
  return { notifierRetard: false, seuils: [] }
}

export interface DecisionDepassementPlanning {
  depasse: boolean;
  joursRetard: number;
}

/**
 * Planning dépassé non notifié : ni supprimé/proposition, ni terminal
 * (statut surveillance liée pris en compte), flag overdue non posé,
 * date de fin passée.
 */
export function evaluerDepassementPlanning(
  planning: Planning,
  surveillances: Surveillance[],
  maintenantMs: number,
): DecisionDepassementPlanning {
  const neutre = { depasse: false, joursRetard: 0 }
  if (planning.deleted_at || planning.est_proposition) return neutre
  if (isPlanningTerminal(planning, surveillances)) return neutre
  if (planning.rappels_envoyes?.overdue) return neutre
  const dFin = new Date(planning.date_fin || planning.date_debut).getTime()
  if (Number.isNaN(dFin) || dFin >= maintenantMs) return neutre
  return { depasse: true, joursRetard: Math.max(1, Math.ceil((maintenantMs - dFin) / (1000 * 60 * 60 * 24))) }
}
