// lib/__tests__/ourAirports.test.ts — Matching OurAirports (lib/ia/ourAirports.ts).
// Code exact, nom insensible aux accents départagé par proximité, rayon progressif.

import {
  normaliserNom,
  parserOurAirports,
  rechercherMeilleur,
  type OurAirportsRecord,
} from '../ia/ourAirports';

const LIGNE = (ident: string, nom: string, lat: string, lon: string, mun = '', elev = '') =>
  `1,"${ident}","medium_airport","${nom}",${lat},${lon},${elev},AF,SN,SN-DK,"${mun}",1,,,`;

const CSV = [
  LIGNE('GOBD', 'Blaise Diagne International', '14.6700', '-17.0700', 'Diass', '290'),
  LIGNE('GOOY', 'Léopold Sédar Senghor International Airport', '14.6700', '-17.4900', 'Dakar', '83'),
  LIGNE('GOTT', 'Tambacounda Airport', '13.7400', '-13.6500', 'Tambacounda', '161'),
].join('\n');

const rows: OurAirportsRecord[] = parserOurAirports(CSV);

describe('parserOurAirports', () => {
  test('parse + filtre Afrique de l\u2019Ouest', () => {
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ oaci: 'GOBD', nom: 'Blaise Diagne International', municipality: 'Diass' });
  });
  test('ignore les hors zone', () => {
    const autres = parserOurAirports(LIGNE('LFPG', 'Paris CDG', '49.0', '2.5', 'Paris', '300'));
    expect(autres).toHaveLength(0);
  });
});

describe('normaliserNom', () => {
  test('accents et casse ignorés', () => {
    expect(normaliserNom('Léopold Sédar SENGHOR')).toBe(normaliserNom('leopold sedar senghor'));
  });
});

describe('rechercherMeilleur', () => {
  test('code exact prioritaire', () => {
    expect(rechercherMeilleur(rows, { code: 'gooy' })?.nom).toMatch(/Senghor/);
  });
  test('nom accentué retrouvé, départagé par proximité', () => {
    // « dakar » matche GOBD (nom? non) et GOOY (municipality Dakar) → un seul candidat.
    expect(rechercherMeilleur(rows, { nom: 'dakar' })?.oaci).toBe('GOOY');
    // « international » matche GOBD + GOOY → le plus proche de Dakar-centre gagne.
    const pres_de_dakar = rechercherMeilleur(rows, { nom: 'international', lat: 14.69, lon: -17.44 });
    expect(pres_de_dakar?.oaci).toBe('GOOY');
    const pres_de_diass = rechercherMeilleur(rows, { nom: 'international', lat: 14.67, lon: -17.07 });
    expect(pres_de_diass?.oaci).toBe('GOBD');
  });
  test('sans nom : plus proche par rayon progressif, jamais hors rayon', () => {
    expect(rechercherMeilleur(rows, { nom: '', lat: 13.74, lon: -13.65 })?.oaci).toBe('GOTT');
    expect(rechercherMeilleur(rows, { nom: '', lat: 0, lon: 0 })).toBeNull();
    expect(rechercherMeilleur(rows, { nom: '', lat: 48.85, lon: 2.35 })).toBeNull();
  });
  test('nom inconnu + coordonnées loin de tout → null (pas de devinette)', () => {
    expect(rechercherMeilleur(rows, { nom: 'xyz introuvable', lat: 48.85, lon: 2.35 })).toBeNull();
  });
});
