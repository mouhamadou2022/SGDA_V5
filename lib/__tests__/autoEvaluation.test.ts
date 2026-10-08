// lib/__tests__/autoEvaluation.test.ts — score honnête (pur).
import { calculerScoreAutoEval } from '../autoEvaluation';

describe('calculerScoreAutoEval', () => {
  test('données complètes : 50/30/20', () => {
    // 60*0.5 + 80*0.3 + 40*0.2 = 30 + 24 + 8 = 62
    expect(calculerScoreAutoEval({ tauxPac: 60, pacTotal: 5, tauxSurv: 80, totalSurv: 3, c1: 40, sgsNonApplicable: false })).toBe(62);
  });
  test('SGS proportionnel (fini le bonus binaire 20/0)', () => {
    const bas = calculerScoreAutoEval({ tauxPac: 60, pacTotal: 5, tauxSurv: 80, totalSurv: 3, c1: 10, sgsNonApplicable: false });
    const haut = calculerScoreAutoEval({ tauxPac: 60, pacTotal: 5, tauxSurv: 80, totalSurv: 3, c1: 90, sgsNonApplicable: false });
    expect(haut).toBeGreaterThan(bas!);
    expect(bas).toBe(56); // 30 + 24 + 2
  });
  test('SGS non applicable : exclu (comme le score officiel)', () => {
    // (30 + 24) / 0.8 = 67.5 -> 68
    expect(calculerScoreAutoEval({ tauxPac: 60, pacTotal: 5, tauxSurv: 80, totalSurv: 3, c1: 0, sgsNonApplicable: true })).toBe(68);
  });
  test('aucune donnée : null, jamais 100 par défaut', () => {
    expect(calculerScoreAutoEval({ tauxPac: 100, pacTotal: 0, tauxSurv: 100, totalSurv: 0, c1: 0, sgsNonApplicable: false })).toBeNull();
  });
  test('données partielles : repondéré sur le disponible', () => {
    // PAC seuls : 60 (pas de bonus surveillance fantôme)
    expect(calculerScoreAutoEval({ tauxPac: 60, pacTotal: 2, tauxSurv: 100, totalSurv: 0, c1: 0, sgsNonApplicable: true })).toBe(60);
  });
});
