// lib/ecarts-rappels.ts — Décisions pures des rappels automatiques.
// Extraites de ecartsSlice.verifierRappelsAutomatiques / getDelaiRestant
// (comportement identique) : le slice applique (set/emit), ici on décide.
// Testé : lib/__tests__/ecartsRappels.test.ts.

import type { Ecart } from './store/ecartsTypes';

/** Jours restants (ceil) entre une échéance ISO et maintenant. NaN-safe par propagation (comparaisons fausses, comme avant). */
export function joursRestants(dateISO: string, maintenant: Date): number {
  return Math.ceil((new Date(dateISO).getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
}

export type TypeRappelEcart = 'J-7' | 'J-3' | 'J-1';

const SEUILS_RAPPEL: Array<{ jours: number; type: TypeRappelEcart }> = [
  { jours: 7, type: 'J-7' },
  { jours: 3, type: 'J-3' },
  { jours: 1, type: 'J-1' },
];

export interface DecisionRappelsEcart {
  /** Passer l'écart en `en_retard` (délai PAC ou régularisation dépassé). */
  passerEnRetard: boolean;
  /** Rappels J-7/J-3/J-1 à émettre (non clôturé, seuil atteint, non déjà envoyé). */
  rappels: TypeRappelEcart[];
}

/** Retard + rappels d'échéance PAC/régularisation (écarts non clôturés). */
export function evaluerRappelsEcart(ecart: Ecart, maintenant: Date): DecisionRappelsEcart {
  if (ecart.statut === 'cloture') return { passerEnRetard: false, rappels: [] }
  const joursAvantPAC = joursRestants(ecart.delai_pac, maintenant)
  const joursAvantReg = joursRestants(ecart.delai_regularisation, maintenant)
  const passerEnRetard =
    (joursAvantPAC < 0 || joursAvantReg < 0) && ecart.statut !== 'en_retard'
  const rappels = SEUILS_RAPPEL
    .filter(({ jours }) => joursAvantPAC === jours || joursAvantReg === jours)
    .filter(({ jours }) => {
      const dejaEnvoye = ecart.rappels_envoyes?.[`j${jours}` as keyof typeof ecart.rappels_envoyes]
      return !dejaEnvoye
    })
    .map(({ type }) => type)
  return { passerEnRetard, rappels }
}

export interface DecisionDelaisInspecteur {
  /** Marquer retard_inspecteur (deadline passée, pas encore marqué). */
  marquerRetardEvalPAC: boolean;
  /** Rappels J-7/J-3/J-1 d'évaluation PAC à émettre. */
  rappelsEvalPAC: number[];
  /** Marquer retard_inspecteur (deadline validation preuves passée). */
  marquerRetardValidation: boolean;
  /** Rappels J-7/J-3/J-1 de validation preuves à émettre. */
  rappelsValidation: number[];
}

/** Délais inspecteur : évaluation PAC (pac_soumis) + validation preuves (preuves_soumises). */
export function evaluerDelaisInspecteur(ecart: Ecart, maintenant: Date): DecisionDelaisInspecteur {
  const neutre: DecisionDelaisInspecteur = {
    marquerRetardEvalPAC: false, rappelsEvalPAC: [],
    marquerRetardValidation: false, rappelsValidation: [],
  }
  const flags = ecart as unknown as Record<string, unknown>
  const eligibles = (jours: number, prefixe: string): number[] =>
    jours > 0 && [7, 3, 1].includes(jours) && !flags[`${prefixe}${jours}`] ? [jours] : []

  if (ecart.statut === 'pac_soumis' && ecart.evaluation_pac?.deadline) {
    const jours = joursRestants(ecart.evaluation_pac.deadline, maintenant)
    if (jours < 0 && !ecart.retard_inspecteur) {
      neutre.marquerRetardEvalPAC = true
    } else {
      neutre.rappelsEvalPAC = eligibles(jours, '_rappel_eval_j')
    }
  }
  if (ecart.statut === 'preuves_soumises' && ecart.validation_preuves?.deadline) {
    const jours = joursRestants(ecart.validation_preuves.deadline, maintenant)
    if (jours < 0 && !ecart.retard_inspecteur) {
      neutre.marquerRetardValidation = true
    } else {
      neutre.rappelsValidation = eligibles(jours, '_rappel_val_j')
    }
  }
  return neutre
}

export interface DelaiRestant {
  jours: number;
  couleur: 'vert' | 'orange' | 'rouge';
  depasse: boolean;
}

/** Couleur + dépassement d'un délai (règle d'affichage unique). */
export function calculerDelaiRestant(ecart: Ecart, maintenant: Date = new Date()): DelaiRestant {
  const delai = ecart.statut === 'ouvert' || ecart.statut === 'pac_attendu'
    ? new Date(ecart.delai_pac)
    : new Date(ecart.delai_regularisation)
  const joursRestants = Math.ceil((delai.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
  let couleur: DelaiRestant['couleur'] = 'vert'
  if (joursRestants < 0) couleur = 'rouge'
  else if (joursRestants < 7) couleur = 'rouge'
  else if (joursRestants < 15) couleur = 'orange'
  return { jours: joursRestants, couleur, depasse: joursRestants < 0 }
}
