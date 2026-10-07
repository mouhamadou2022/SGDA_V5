// lib/__tests__/checklistFeedback.test.ts — repli hierarchie (pur).
import { extraireItemsHierarchie } from '../ia/agents/checklistFeedbackEngine';

describe('extraireItemsHierarchie', () => {
  test('aplatit domaines et sous-domaines avec le nom du domaine parent', () => {
    const items = extraireItemsHierarchie([
      {
        nom: 'PHY',
        items: [{ resultat: 'SA' }, { resultat: 'NS' }, {}],
        sousDomaines: [
          { nom: 'Piste', items: [{ resultat: 'SA' }], sousSousDomaines: [{ items: [{ resultat: 'NV' }] }] },
        ],
      },
      { nom: 'SGS', items: [] },
    ]);
    expect(items).toEqual([
      { resultat: 'SA', domaine: 'PHY' },
      { resultat: 'NS', domaine: 'PHY' },
      { resultat: 'SA', domaine: 'PHY' },
      { resultat: 'NV', domaine: 'PHY' },
    ]);
  });
  test('entrees vides -> [] sans crash', () => {
    expect(extraireItemsHierarchie([])).toEqual([]);
    expect(extraireItemsHierarchie(null)).toEqual([]);
    expect(extraireItemsHierarchie(undefined)).toEqual([]);
  });
});
