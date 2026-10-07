// lib/__tests__/weightController.test.ts — Normalisation exacte à 100 (pur).
import { DEFAULT_WEIGHTS, computeAdaptiveWeightDelta, qualifierPoids, normaliserPoidsSomme100, extrairePoidsLus } from '../ia/weightController';

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
describe('computeAdaptiveWeightDelta', () => {
  test('ratio 0.5 : aucun décalage', () => {
    expect(computeAdaptiveWeightDelta(0.5)).toBe(0)
  })
  test('ratio 0.8 (80% efficace) : +2', () => {
    expect(computeAdaptiveWeightDelta(0.8)).toBe(2)
  })
  test('ratio 0.2 (20% efficace) : -2', () => {
    expect(computeAdaptiveWeightDelta(0.2)).toBe(-2)
  })
  test('ratio 0.65 : +1 (plancher ±2 respecté)', () => {
    expect(computeAdaptiveWeightDelta(0.65)).toBe(1)
  })
  test('ratio 0.99 : +3 (arrondi de 2.94)', () => {
    expect(computeAdaptiveWeightDelta(0.99)).toBe(3)
  })
})

describe('qualifierPoids', () => {
  test('somme à 100 et clés c1..c5 uniquement', () => {
    const q = qualifierPoids({ c1: 20, c2: 25, c3: 20, c4: 20, c5: 15, colorde: 'x', c6: 999 } as any)
    expect(Object.keys(q).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(Object.values(q).reduce((a, b) => a + b, 0)).toBe(100)
  })
  test('valeurs hors limites clippées et somme exacte', () => {
    const q = qualifierPoids({ c1: -5, c2: 200, c3: 20, c4: 20, c5: 15 } as any)
    expect(Object.keys(q).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(Object.values(q).reduce((a, b) => a + b, 0)).toBe(100)
  })
  test('inverti, null et undefined → valeurs par défaut', () => {
    const q = qualifierPoids({ c1: NaN, c2: null, c3: undefined, c4: 20, c5: 15 } as any)
    expect(q.c1).toBe(20)
    expect(q.c2).toBe(25)
    expect(q.c3).toBe(20)
  })
})

describe('extrairePoidsLus', () => {
  test('prefere engine=recommendation avec repli historique', () => {
    // Jeu complet (somme 100, pas de renormalisation) + ligne parasite
    const base = [
      { parametre: 'weight_c1', valeur: 20, engine: 'recommendation' },
      { parametre: 'weight_c2', valeur: 30, engine: 'recommendation' },
      { parametre: 'weight_c3', valeur: 20, engine: 'recommendation' },
      { parametre: 'weight_c4', valeur: 20, engine: 'recommendation' },
      { parametre: 'weight_c5', valeur: 10, engine: 'recommendation' },
      { parametre: 'weight_c2', valeur: 99, engine: 'autre' },
    ]
    const r = extrairePoidsLus(base)
    expect(r.poids.c2).toBe(30)
    expect(r.trouves).toBe(5)
    // Sans aucune ligne recommendation : repli sur l'historique
    const r2 = extrairePoidsLus([{ parametre: 'weight_c2', valeur: 99, engine: 'autre' }])
    expect(r2.trouves).toBe(1)
    expect(r2.poids.c2).toBeGreaterThan(30)
  })
  test('sans engine : toutes les lignes weight_* sont prises', () => {
    const r = extrairePoidsLus([{ parametre: 'weight_c1', valeur: 15 }])
    // Partiel {c1:15} + defauts -> somme 95 -> normalise a 100 : c1 vaut 16
    expect(r.poids.c1).toBe(16)
    expect(Object.values(r.poids).reduce((s, v) => s + v, 0)).toBe(100)
    expect(r.trouves).toBe(1)
  })
  test('cles parasites ignorees, valeurs invalides qualifiees', () => {
    const r = extrairePoidsLus([
      { parametre: 'weight_c6', valeur: 999 },
      { parametre: 'pred_3m_mae', valeur: 3 },
      { parametre: 'weight_c1', valeur: -5 },
    ])
    expect(Object.keys(r.poids).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(r.poids.c1).toBe(0)
    expect(Object.values(r.poids).reduce((s, v) => s + v, 0)).toBe(100)
    expect(r.trouves).toBe(1)
  })
  test('rien en base : defauts + trouves 0', () => {
    for (const rows of [[], null, undefined] as any[]) {
      const r = extrairePoidsLus(rows)
      expect(r.poids).toEqual(expect.objectContaining({ ...DEFAULT_WEIGHTS }))
      expect(r.trouves).toBe(0)
    }
  })
})
