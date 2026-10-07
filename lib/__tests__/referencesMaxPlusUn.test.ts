// lib/__tests__/referencesMaxPlusUn.test.ts — compteurs max+1 (pur).
import { plansActionsUtils } from '../plansActionsUtils';
import { formationUtils } from '../formationUtils';
import { dossierUtils } from '../dossierUtils';

describe('prochaineReference (ECA/FMT/DOS)', () => {
  test('ECA : max+1 avec trous, ignore autres annees', () => {
    expect(plansActionsUtils.prochaineReference(['ECA-2026-001', 'ECA-2026-003'], 2026)).toBe('ECA-2026-004');
    expect(plansActionsUtils.prochaineReference(['ECA-2025-099'], 2026)).toBe('ECA-2026-001');
    expect(plansActionsUtils.prochaineReference([], 2026)).toBe('ECA-2026-001');
  });
  test('FMT : padding 4, ignore formats inconnus', () => {
    expect(formationUtils.prochaineReference(['FMT-2026-0009', 'XXX', undefined], 2026)).toBe('FMT-2026-0010');
    expect(formationUtils.prochaineReference([], 2026)).toBe('FMT-2026-0001');
  });
  test('DOS : deterministe (fini le random 1-9999)', () => {
    expect(dossierUtils.prochaineReference(['DOS-2026-0041'], 2026)).toBe('DOS-2026-0042');
    expect(dossierUtils.prochaineReference([], 2026)).toBe('DOS-2026-0001');
  });
});
