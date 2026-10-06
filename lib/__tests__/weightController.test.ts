// lib/__tests__/weightController.test.ts — Normalisation exacte à 100 (pur).
import { DEFAULT_WEIGHTS, normaliserPoidsSomme100 } from '../ia/weightController';

describe('normaliserPoidsSomme100', () => {
  test('somme déjà 100 : inchangé', () => {
    expect(normaliserPoidsSomme100({ ...DEFAULT_WEIGHTS })).toEqual({ ...DEFAULT_WEIGHTS });
  });
  test('somme 99/101 (cas Math.round) : somme exacte, plus grands restes servis', () => {
    const r99 = normaliserPoidsSomme100({ c1: 20, c2: 25, c3: 20, c4: 20, c5: 14 });
    expect(Object.values(r99).reduce((s, v) => s + v, 0)).toBe(100);
    const r101 = normaliserPoidsSomme100({ c1: 20, c2: 25, c3: 20, c4: 20, c5: 16 });
    expect(Object.values(r101).reduce((s, v) => s + v, 0)).toBe(100);
  });
  test('carte partielle : proportions préservées, somme exacte', () => {
    const r = normaliserPoidsSomme100({ c1: 30, c2: 25 });
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBe(100);
    expect(r.c1).toBeGreaterThan(r.c2);
  });
  test('entrée vide ou nulle : retournée telle quelle', () => {
    expect(normaliserPoidsSomme100({})).toEqual({});
  });
});
