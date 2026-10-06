// lib/__tests__/initialProfileFlotte.test.ts — Priors empiriques de flotte (pur).
import {
  cleFlotte, priorC3Flotte, construireRefsFlotte, calculerProfilInitial,
} from '../risque/initialProfile';

const FEATURE_FLOTTE = [
  { type: 'national', categorie_sslia: '3', type_entite: 'aerodrome', c3: 60 },
  { type: 'national', categorie_sslia: '3', type_entite: 'aerodrome', c3: 70 },
  { type: 'national', categorie_sslia: '3', type_entite: 'aerodrome', c3: 80 },
  { type: 'international', categorie_sslia: '9', type_entite: 'aerodrome', c3: 40 },
];

describe('cleFlotte', () => {
  test('stable : casse/espaces et SSLIA numérique', () => {
    expect(cleFlotte({ type: 'National', categorie_sslia: '3', type_entite: 'AERODROME' }))
      .toBe(cleFlotte({ type: 'national', categorie_sslia: 3, type_entite: 'aerodrome' }));
    expect(cleFlotte({})).toBe('?|?|?');
  });
});

describe('priorC3Flotte', () => {
  const cible = { type: 'national', categorie_sslia: '3', type_entite: 'aerodrome' };
  test('≥3 pairs : médiane (60,70,80 → 70)', () => {
    const r = priorC3Flotte(cible, FEATURE_FLOTTE);
    expect(r.valeur).toBe(70);
    expect(r.nbPairs).toBe(3);
  });
  test('<3 pairs : null (repli heuristique conservé)', () => {
    const r = priorC3Flotte(cible, FEATURE_FLOTTE.slice(0, 2));
    expect(r.valeur).toBeNull();
    expect(r.nbPairs).toBe(2);
  });
  test('médiane paire : moyenne des deux milieux', () => {
    const r = priorC3Flotte(cible, [...FEATURE_FLOTTE.slice(0, 3), {
      type: 'national', categorie_sslia: '3', type_entite: 'aerodrome', c3: 90,
    }]);
    expect(r.valeur).toBe(75);
    expect(r.nbPairs).toBe(4);
  });
  test('ignore les C3 non finis', () => {
    const r = priorC3Flotte(cible, [
      ...FEATURE_FLOTTE.slice(0, 3),
      { type: 'national', categorie_sslia: '3', type_entite: 'aerodrome', c3: NaN },
    ]);
    expect(r.nbPairs).toBe(3);
    expect(r.valeur).toBe(70);
  });
});

describe('construireRefsFlotte', () => {
  test('ne retient que les pairs avec C3 (le nouveau site est exclu de fait)', () => {
    const refs = construireRefsFlotte(
      [
        { id: 'a1', type: 'national', categorie_sslia: '3', type_entite: 'aerodrome' },
        { id: 'a2', type: 'national', categorie_sslia: '3', type_entite: 'aerodrome' },
      ],
      { a1: { c3: 65 } },
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].c3).toBe(65);
  });
});

describe('calculerProfilInitial avec flotte', () => {
  const NOUVEAU = {
    id: 'a-new', nom: 'Nouveau', code_oaci: 'GONE', type: 'national',
    categorie_sslia: '3', type_entite: 'aerodrome',
    region: 'Dakar', maturite_sgs: 50, statut: 'actif',
    lat: 0, lon: 0, altitude: 0, created_at: '', updated_at: '',
  } as never;
  test('sans flotte : heuristique (priorFlotte null)', () => {
    const r = calculerProfilInitial(NOUVEAU, []);
    expect(r.priorFlotte).toBeNull();
    expect(r.profil.c3).toBeGreaterThan(0);
  });
  test('avec flotte : C3 hérité de la médiane', () => {
    const r = calculerProfilInitial(NOUVEAU, FEATURE_FLOTTE);
    expect(r.priorFlotte).toEqual({ cle: 'national|3|aerodrome', nbPairs: 3, mediane: 70 });
    expect(r.profil.c3).toBe(70);
  });
});
