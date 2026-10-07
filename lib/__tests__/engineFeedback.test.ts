// lib/__tests__/engineFeedback.test.ts — finder pur (sans IDB, sans reseau).
import { trouverDernierFeedbackEnrichissement } from '../ia/engines/engineFeedback';
import type { EngineFeedbackRecord } from '../ia/engines/engineFeedback';

function fb(champ: string, coords: string, vote: 'pertinent' | 'non_pertinent' | 'partiellement' = 'non_pertinent', engine: any = 'aerodromeEnrichment'): EngineFeedbackRecord {
  return {
    id: `ef-${champ}-${coords}-${vote}`,
    engineType: engine,
    aerodromeId: '',
    date: new Date().toISOString(),
    contexte: {},
    decision: { type: `enrichissement:${champ}`, donnees: { champ, coordonnees: coords } },
    vote,
  };
}

describe('trouverDernierFeedbackEnrichissement', () => {
  test('retourne le dernier feedback du champ aux memes coordonnees', () => {
    const liste = [fb('nom', '14.7,-17.4', 'non_pertinent'), fb('nom', '14.7,-17.4', 'pertinent')];
    expect(trouverDernierFeedbackEnrichissement(liste, 'nom', '14.7,-17.4')?.vote).toBe('pertinent');
  });
  test('ignore autres champs, autres sites et autres engines', () => {
    const liste = [
      fb('nom', '14.7,-17.4'),
      fb('region', '14.7,-17.4'),
      fb('nom', '12.3,-16.1'),
      fb('nom', '14.7,-17.4', 'pertinent', 'recommendation'),
    ];
    expect(trouverDernierFeedbackEnrichissement(liste, 'nom', '14.7,-17.4')?.vote).toBe('non_pertinent');
    expect(trouverDernierFeedbackEnrichissement(liste, 'altitude', '14.7,-17.4')).toBeNull();
  });
  test('entrees vides -> null', () => {
    expect(trouverDernierFeedbackEnrichissement([], 'nom', '14.7,-17.4')).toBeNull();
    expect(trouverDernierFeedbackEnrichissement([fb('nom', '14.7,-17.4')], '', '14.7,-17.4')).toBeNull();
    expect(trouverDernierFeedbackEnrichissement([fb('nom', '14.7,-17.4')], 'nom', '')).toBeNull();
  });
});
