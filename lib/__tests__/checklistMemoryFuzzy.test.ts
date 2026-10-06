// lib/__tests__/checklistMemoryFuzzy.test.ts — Appariement flou (pur, sans réseau).
import { trouverRecordSimilaire, type ItemHistoryRecord } from '../checklistMemory';

function record(overrides: Partial<ItemHistoryRecord> = {}): ItemHistoryRecord {
  return {
    id: 'r1',
    aerodrome_id: 'a-gobd',
    type_inspection: 'periodique',
    domaine: 'PHY',
    sous_domaine: '',
    sous_sous_domaine: '',
    item_id: 'it-1',
    item_numero: '01',
    item_description: 'Vérifier l état de la piste principale',
    historique_resultats: [],
    taux_conformite: 100,
    nb_occurrences: 3,
    confiance: 80,
    feedback_ajustement: 0,
    dernier_feedback: '',
    nb_corrections: 0,
    nb_erreurs_correction: 0,
    alerte_ecart_recurrent: false,
    ...overrides,
  };
}

describe('trouverRecordSimilaire', () => {
  test('égalité (insensible casse/accents) retrouvée', () => {
    const r = record();
    const trouve = trouverRecordSimilaire([r], {
      aerodrome_id: 'a-gobd', domaine: 'PHY', texte: 'VERIFIER L’ETAT DE LA PISTE PRINCIPALE',
    });
    expect(trouve?.id).toBe('r1');
  });

  test('reformulation partielle appariée, hors-seuil rejeté', () => {
    const r = record();
    expect(trouverRecordSimilaire([r], {
      aerodrome_id: 'a-gobd', domaine: 'PHY', texte: 'Vérifier état piste principale et balisage',
    })?.id).toBe('r1');
    expect(trouverRecordSimilaire([r], {
      aerodrome_id: 'a-gobd', domaine: 'PHY', texte: 'Contrôler extincteurs du hangar',
    })).toBeNull();
  });

  test('filtre aérodrome + domaine, départage par occurrences', () => {
    const records = [
      record({ id: 'mauvais-site', aerodrome_id: 'a-gott' }),
      record({ id: 'mauvais-dom', domaine: 'ELEC' }),
      record({ id: 'peu-vu', nb_occurrences: 1 }),
      record({ id: 'bien-vu', nb_occurrences: 9 }),
    ];
    const trouve = trouverRecordSimilaire(records, {
      aerodrome_id: 'a-gobd', domaine: 'PHY', texte: 'Vérifier état piste principale',
    });
    expect(trouve?.id).toBe('bien-vu');
  });

  test('texte vide ou sans mots utiles → null', () => {
    expect(trouverRecordSimilaire([record()], { aerodrome_id: 'a-gobd', domaine: 'PHY', texte: '  ' })).toBeNull();
    expect(trouverRecordSimilaire([], { aerodrome_id: 'a-gobd', domaine: 'PHY', texte: 'piste' })).toBeNull();
  });
});
