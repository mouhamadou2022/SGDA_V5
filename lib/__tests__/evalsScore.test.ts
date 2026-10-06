// lib/__tests__/evalsScore.test.ts — Notation des cas étalons (lib/ia/evals/score.ts).
// Barème : bons outils 50 + mots-clés 30 + interdits 20.

import { noterCas, noteGlobale } from '../ia/evals/score';
import type { CasEtalon } from '../ia/evals/golden';

const CAS: CasEtalon = {
  id: 'demo',
  question: 'État de Tambacounda ?',
  outilsAttendus: ['etat_site'],
  contient: ['GOTT'],
  interdit: ['GOGB'],
};

describe('noterCas', () => {
  test('parfait = 100', () => {
    const n = noterCas(CAS, { outilsLances: ['etat_site'], reponse: 'GOTT : score 72', dureeMs: 5000 });
    expect(n).toMatchObject({ note: 100, outilsOk: true, motsOk: true, interditsOk: true });
  });
  test('mauvais outil + mot manquant + interdit', () => {
    const n = noterCas(CAS, { outilsLances: ['lister_plannings'], reponse: 'GOGB : rien', dureeMs: 5000 });
    expect(n.note).toBe(0);
    expect(n.details.length).toBeGreaterThan(0);
  });
  test('politesse sans outils attendus : aucun appel = parfait', () => {
    const n = noterCas(
      { id: 'x', question: 'bonsoir', outilsAttendus: [] },
      { outilsLances: [], reponse: 'Bonjour, je suis AERORISQ', dureeMs: 1000 },
    );
    expect(n.note).toBe(100);
  });
  test('appel superflu sur politesse pénalisé', () => {
    const n = noterCas(
      { id: 'x', question: 'bonsoir', outilsAttendus: [] },
      { outilsLances: ['lister_ecarts'], reponse: 'Bonjour', dureeMs: 1000 },
    );
    expect(n.outilsOk).toBe(false);
  });
  test('interrompu plafonné', () => {
    const n = noterCas(CAS, { outilsLances: ['etat_site'], reponse: 'GOTT', dureeMs: 1000, interrompu: true });
    expect(n.note).toBeLessThanOrEqual(40);
  });
});

describe('noteGlobale', () => {
  test('moyenne arrondie, vide = 0', () => {
    expect(noteGlobale([
      { note: 100, outilsOk: true, motsOk: true, interditsOk: true, depassementDuree: false, details: [] },
      { note: 50, outilsOk: false, motsOk: true, interditsOk: true, depassementDuree: false, details: [] },
    ])).toBe(75);
    expect(noteGlobale([])).toBe(0);
  });
});
