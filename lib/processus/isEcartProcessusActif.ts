// lib/processus/isEcartProcessusActif.ts
// Vérifie si un écart appartient à un processus de certification/homologation
// qui n'est PAS encore terminé. Dans ce cas, il ne doit pas apparaître
// dans les checklists de surveillance continue.

import type { Certification, Homologation } from '@/lib/store';

/**
 * Retourne un Set des surveillance_id issus de processus certification/homologation
 * non terminés. Un écart lié à ces surveillances doit être exclu de la surveillance continue.
 */
export function getSurveillancesProcessusNonTerminee(
  aerodromeId: string,
  certifications: Certification[],
  homologations: Homologation[],
): Set<string> {
  const ids = new Set<string>();

  // Certification terminée uniquement quand phase5 est cloturée
  for (const cert of certifications) {
    if (cert.aerodrome_id !== aerodromeId) continue;
    const phase5Cloturee = cert.phases_data?.phase5?.cloture_le;
    if (phase5Cloturee) continue; // certification terminée → OK, on ne filtre pas
    // Phase 3 de la certification a un surveillance_id
    const survId = cert.phases_data?.phase3?.surveillance_id;
    if (survId) ids.add(survId);
  }

  // Homologation terminée uniquement quand phase3 est cloturée
  for (const homo of homologations) {
    if (homo.aerodrome_id !== aerodromeId) continue;
    const phase3Cloturee = homo.phases_data?.phase3?.cloture_le;
    if (phase3Cloturee) continue; // homologation terminée → OK
    // Phase 2 de l'homologation a un surveillance_id
    const survId = homo.phases_data?.phase2?.surveillance_id;
    if (survId) ids.add(survId);
  }

  return ids;
}

/**
 * Vérifie si un écart doit être exclu car il appartient à un processus
 * certification/homologation non terminé.
 */
export function isEcartProcessusActif(
  surveillanceId: string | undefined | null,
  aerodromeId: string,
  certifications: Certification[],
  homologations: Homologation[],
): boolean {
  if (!surveillanceId) return false;
  const ids = getSurveillancesProcessusNonTerminee(aerodromeId, certifications, homologations);
  return ids.has(surveillanceId);
}
