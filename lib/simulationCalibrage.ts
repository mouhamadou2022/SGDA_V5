// lib/simulationCalibrage.ts
// Moteur pur du mode « Règles » (simulateur de calibrage) : poids C1-C5 et
// seuils de niveaux modifiables + impact avant/après. AUCUNE écriture —
// la simulation ne touche ni au store, ni à ia_thresholds, ni aux crons.
// L'application réelle reste un acte validé séparé (cycle versionné).

import { calculateGlobalScore } from './risque';
import { normaliserPoidsSomme100 } from './ia/weightController';

export interface SeuilsNiveaux {
  /** Score >= faible → FAIBLE. */
  faible: number;
  /** Score >= moyen → MOYEN. */
  moyen: number;
  /** Score >= eleve → ELEVE, sinon CRITIQUE. */
  eleve: number;
}

export const SEUILS_NIVEAUX_DEFAUT: SeuilsNiveaux = { faible: 80, moyen: 60, eleve: 30 };

export type NiveauCle = 'FAIBLE' | 'MOYEN' | 'ELEVE' | 'CRITIQUE';

/** Niveau d'un score selon des seuils personnalisés. Pur et testé. */
export function niveauAvecSeuils(score: number, seuils: SeuilsNiveaux): NiveauCle {
  if (score >= seuils.faible) return 'FAIBLE';
  if (score >= seuils.moyen) return 'MOYEN';
  if (score >= seuils.eleve) return 'ELEVE';
  return 'CRITIQUE';
}

/** Cohérence des seuils (ordre strict, bornes). Retourne l'erreur ou null. */
export function validerSeuils(s: SeuilsNiveaux): string | null {
  const vals = [s.faible, s.moyen, s.eleve];
  if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return 'Seuils incomplets';
  if (s.faible > 100 || s.eleve < 0) return 'Seuils hors 0–100';
  if (!(s.faible > s.moyen && s.moyen > s.eleve)) return 'Ordre requis : FAIBLE > MOYEN > ÉLEVÉ';
  return null;
}

export interface ProfilSimulable {
  aerodrome_id: string;
  score_global?: number;
  c1?: number;
  c2?: number;
  c3?: number;
  c4?: number;
  c5?: number;
  niveau?: string;
}

export interface ImpactCalibrage {
  aerodrome_id: string;
  avantScore: number;
  avantNiveau: NiveauCle;
  apresScore: number;
  apresNiveau: NiveauCle;
  delta: number;
}

/**
 * Impact d'un jeu (poids + seuils) sur des profils : seuls les changements
 * de niveau sont retournés. Les poids sont normalisés à 100 (même règle
 * que le moteur). Pur et testé.
 */
export function calculerImpacts(
  profils: ProfilSimulable[],
  poids: Record<string, number>,
  seuils: SeuilsNiveaux,
): { total: number; changements: ImpactCalibrage[] } {
  const w = normaliserPoidsSomme100(poids);
  const changements: ImpactCalibrage[] = [];
  for (const p of profils || []) {
    if (!p || !p.aerodrome_id) continue;
    const criteres = {
      c1: p.c1 ?? 50, c2: p.c2 ?? 50, c3: p.c3 ?? 50, c4: p.c4 ?? 50, c5: p.c5 ?? 50,
    };
    const apresScore = calculateGlobalScore(criteres as never, w);
    const apresNiveau = niveauAvecSeuils(apresScore, seuils);
    const avantNiveau = String(p.niveau || '').toUpperCase() as NiveauCle;
    if (apresNiveau !== avantNiveau) {
      changements.push({
        aerodrome_id: p.aerodrome_id,
        avantScore: p.score_global ?? 0,
        avantNiveau: ['FAIBLE', 'MOYEN', 'ELEVE', 'CRITIQUE'].includes(avantNiveau) ? avantNiveau : niveauAvecSeuils(p.score_global ?? 0, SEUILS_NIVEAUX_DEFAUT),
        apresScore,
        apresNiveau,
        delta: apresScore - (p.score_global ?? 0),
      });
    }
  }
  changements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { total: (profils || []).length, changements };
}
