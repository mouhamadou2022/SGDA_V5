// lib/ia/evals/score.ts — Notation pure d'un cas étalon (testée, sans réseau).
// Barème : bons outils 50 % + mots-clés 30 % + interdits 20 %.

import type { CasEtalon } from './golden';
import { normaliserRecherche } from '../../domaines';

export interface ResultatCas {
  outilsLances: string[];
  reponse: string;
  dureeMs: number;
  interrompu?: boolean;
}

export interface NoteCas {
  note: number;
  outilsOk: boolean;
  motsOk: boolean;
  interditsOk: boolean;
  depassementDuree: boolean;
  details: string[];
}

function normaliser(texte: string): string {
  return normaliserRecherche(texte);
}

export function noterCas(cas: CasEtalon, resultat: ResultatCas): NoteCas {
  const details: string[] = [];
  let note = 0;

  const outilsOk = cas.outilsAttendus.length === 0
    ? resultat.outilsLances.length === 0
    : cas.outilsAttendus.some(o => resultat.outilsLances.includes(o));
  if (outilsOk) note += 50;
  else details.push(`outils: attendu [${cas.outilsAttendus.join(', ')}], vu [${resultat.outilsLances.join(', ')}]`);

  const texte = normaliser(resultat.reponse);
  const mots = cas.contient || [];
  const motsOk = mots.length === 0 || mots.every(m => texte.includes(normaliser(m)));
  if (motsOk) note += 30;
  else details.push(`mots manquants: [${mots.filter(m => !texte.includes(normaliser(m))).join(', ')}]`);

  const interdits = cas.interdit || [];
  const interditsOk = !interdits.some(m => texte.includes(normaliser(m)));
  if (interditsOk) note += 20;
  else details.push(`interdits présents: [${interdits.filter(m => texte.includes(normaliser(m))).join(', ')}]`);

  const depassementDuree = !!cas.dureeMaxMs && resultat.dureeMs > cas.dureeMaxMs;
  if (depassementDuree) details.push(`lent: ${Math.round(resultat.dureeMs / 1000)}s`);

  if (resultat.interrompu) {
    details.push('interrompu');
    note = Math.min(note, 40);
  }
  return { note, outilsOk, motsOk, interditsOk, depassementDuree, details };
}

export function noteGlobale(notes: NoteCas[]): number {
  if (notes.length === 0) return 0;
  return Math.round(notes.reduce((s, n) => s + n.note, 0) / notes.length);
}

/**
 * Sous-note qualité de réponse (mots 30 + interdits 20, ramenée /100) :
 * terrain commun local vs cloud (le cloud n'a pas d'outils).
 */
export function noteQualite(note: NoteCas): number {
  const mots = note.motsOk ? 30 : 0;
  const interdits = note.interditsOk ? 20 : 0;
  return Math.round(((mots + interdits) / 50) * 100);
}
