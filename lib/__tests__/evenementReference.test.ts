// lib/__tests__/evenementReference.test.ts — references EVT (pur, sans reseau).
import { prochaineReferenceEvenement, evenementUtils } from '../evenementUtils';

describe('prochaineReferenceEvenement', () => {
  test('liste vide -> EVT-AAAA-001', () => {
    expect(prochaineReferenceEvenement([], 2026)).toBe('EVT-2026-001');
  });
  test('max+1 meme avec des trous (suppressions)', () => {
    expect(prochaineReferenceEvenement(['EVT-2026-001', 'EVT-2026-003'], 2026)).toBe('EVT-2026-004');
  });
  test('ignore les autres annees et les formats inconnus', () => {
    expect(prochaineReferenceEvenement(['EVT-2025-099', 'XXX', undefined, null, 'EVT-2026-007'], 2026)).toBe('EVT-2026-008');
  });
  test('cas portail exploitant : compteur local filtre ne biaise plus', () => {
    // 2 events sur l'aerodrome mais 5 au total -> 006, pas 003
    const tous = ['EVT-2026-001', 'EVT-2026-002', 'EVT-2026-003', 'EVT-2026-004', 'EVT-2026-005'];
    expect(prochaineReferenceEvenement(tous, 2026)).toBe('EVT-2026-006');
  });
  test('expose via evenementUtils.prochaineReference', () => {
    expect(evenementUtils.prochaineReference(['EVT-2026-009'], 2026)).toBe('EVT-2026-010');
  });
});
