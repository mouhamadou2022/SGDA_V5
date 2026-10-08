// lib/historiqueRefus.ts — Refus antérieurs d'un écart (multi-cycles).
// L'évaluation courante écrase l'objet evaluation_pac/validation_preuves :
// seuls les refus PRÉCÉDENTS intéressent la resoumission. Le doublon
// courant/historique (même décision à < 60 s d'intervalle = même événement
// d'évaluation) est exclu. Pur et testé.
import type { HistoriqueEcart } from './store/ecartsTypes';

export interface DecisionCourante {
  decision?: string;
  date?: string;
}

/** Refus/réserves passés d'un type donné, plus récents d'abord. */
export function refusAnterieurs(
  historique: HistoriqueEcart[] | null | undefined,
  type: 'evaluation_pac' | 'validation_preuves',
  actuel: DecisionCourante | null | undefined,
): HistoriqueEcart[] {
  const liste = (historique || []).filter((h) => {
    if (!h || h.type !== type) return false;
    const decision = (h.details as { decision?: string } | undefined)?.decision;
    if (decision !== 'refuse' && decision !== 'reserve') return false;
    if (actuel?.decision && decision === actuel.decision && actuel.date && h.date) {
      const ecartMs = Math.abs(new Date(h.date).getTime() - new Date(actuel.date).getTime());
      if (Number.isFinite(ecartMs) && ecartMs < 60000) return false;
    }
    return true;
  });
  return [...liste].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
  );
}
