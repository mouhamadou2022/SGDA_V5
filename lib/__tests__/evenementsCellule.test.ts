// lib/__tests__/evenementsCellule.test.ts — Indice OACI → gravité (pur).
import { normaliserCellule, graviteDepuisCellule, normaliserGravite, niveauDepuisCellule, libelleNiveau5, estResiduelCoherent, axesResiduelCoherents } from '../evenementUtils';

const NIVEAUX = ['critique', 'eleve', 'moyen', 'faible'];

describe('normaliserCellule', () => {
  test('format 1-5 + A-E, insensible casse/espaces', () => {
    expect(normaliserCellule('2A')).toBe('2A');
    expect(normaliserCellule(' 4c ')).toBe('4C');
    expect(normaliserCellule('5E')).toBe('5E');
  });
  test('invalides rejetés', () => {
    expect(normaliserCellule('')).toBeNull();
    expect(normaliserCellule('9Z')).toBeNull();
    expect(normaliserCellule('A2')).toBeNull();
    expect(normaliserCellule('12A')).toBeNull();
    expect(normaliserCellule(undefined)).toBeNull();
  });
});

describe('graviteDepuisCellule', () => {
  test('5A (fréquent × catastrophique) → critique', () => {
    expect(graviteDepuisCellule('5A')).toBe('critique');
  });
  test('toujours un des 4 niveaux événement, jamais tres_faible', () => {
    for (const c of ['1A', '1E', '2A', '3C', '4B', '5E']) {
      const g = graviteDepuisCellule(c);
      expect(NIVEAUX).toContain(g);
    }
  });
  test('invalide → null (repli type conservé par l’appelant)', () => {
    expect(graviteDepuisCellule('XX')).toBeNull();
    expect(graviteDepuisCellule('')).toBeNull();
  });
});

describe('estResiduelCoherent (résiduel strictement < initial)', () => {
  test('accepte une vraie réduction', () => {
    expect(estResiduelCoherent('eleve', '3C')).toBe(true);
    expect(estResiduelCoherent('moyen', '2D')).toBe(true);
  });
  test('refuse égal ou supérieur', () => {
    expect(estResiduelCoherent('moyen', '3C')).toBe(false);
    expect(estResiduelCoherent('faible', '4B')).toBe(false);
    expect(estResiduelCoherent('moyen', 'XX')).toBe(false);
  });
  test('faible initial admet tres_faible (ex. 1E)', () => {
    const niv = niveauDepuisCellule('1E');
    expect(niv).toBe('tres_faible');
    expect(estResiduelCoherent('faible', '1E')).toBe(true);
    expect(libelleNiveau5('tres_faible')).toBe('Très faible');
  });
});

describe('axesResiduelCoherents (guidage avant erreur)', () => {
  test('initial eleve/critique : tout ouvert (chaque axe peut finir plus bas)', () => {
    for (const niv of ['eleve', 'critique']) {
      const axes = axesResiduelCoherents(niv);
      expect(axes.probas).toHaveLength(5);
      expect(axes.gravites).toHaveLength(5);
    }
  });
  test('initial moyen : proba 4 exclue (4A-4E jamais sous moyen)', () => {
    const axes = axesResiduelCoherents('moyen');
    expect(axes.probas).toEqual(['1', '2', '3', '5']);
    expect(axes.gravites).toHaveLength(5);
  });
  test('initial faible : seules les issues tres_faible restent', () => {
    const axes = axesResiduelCoherents('faible');
    expect(axes.probas).toEqual(['1', '2', '3']);
    expect(axes.gravites).toEqual(['C', 'D', 'E']);
  });
});

describe('normaliserGravite (non-régression)', () => {
  test('4 niveaux conservés, legacy converti', () => {
    expect(normaliserGravite('eleve')).toBe('eleve');
    expect(normaliserGravite('ORANGE')).toBe('eleve');
    expect(normaliserGravite('inconnu')).toBe('moyen');
  });
});
