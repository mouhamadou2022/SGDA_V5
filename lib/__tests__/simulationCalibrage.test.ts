// lib/__tests__/simulationCalibrage.test.ts — moteur pur du mode Règles.
import {
  niveauAvecSeuils,
  validerSeuils,
  calculerImpacts,
  SEUILS_NIVEAUX_DEFAUT,
} from '../simulationCalibrage';

describe('niveauAvecSeuils', () => {
  test('seuils par défaut = comportement moteur', () => {
    expect(niveauAvecSeuils(80, SEUILS_NIVEAUX_DEFAUT)).toBe('FAIBLE');
    expect(niveauAvecSeuils(60, SEUILS_NIVEAUX_DEFAUT)).toBe('MOYEN');
    expect(niveauAvecSeuils(30, SEUILS_NIVEAUX_DEFAUT)).toBe('ELEVE');
    expect(niveauAvecSeuils(29, SEUILS_NIVEAUX_DEFAUT)).toBe('CRITIQUE');
  });
  test('seuils personnalisés déplacent les frontières', () => {
    const s = { faible: 70, moyen: 50, eleve: 20 };
    expect(niveauAvecSeuils(65, s)).toBe('MOYEN');
    expect(niveauAvecSeuils(65, SEUILS_NIVEAUX_DEFAUT)).toBe('MOYEN');
    expect(niveauAvecSeuils(75, s)).toBe('FAIBLE');
    expect(niveauAvecSeuils(75, SEUILS_NIVEAUX_DEFAUT)).toBe('MOYEN');
  });
});

describe('validerSeuils', () => {
  test('défauts valides, désordre rejeté', () => {
    expect(validerSeuils(SEUILS_NIVEAUX_DEFAUT)).toBeNull();
    expect(validerSeuils({ faible: 60, moyen: 70, eleve: 30 })).not.toBeNull();
    expect(validerSeuils({ faible: 80, moyen: 80, eleve: 30 })).not.toBeNull();
    expect(validerSeuils({ faible: 101, moyen: 60, eleve: 30 })).not.toBeNull();
  });
});

describe('calculerImpacts', () => {
  const PROFILS = [
    { aerodrome_id: 'a1', score_global: 65, c1: 65, c2: 65, c3: 65, c4: 65, c5: 65, niveau: 'moyen' },
    { aerodrome_id: 'a2', score_global: 20, c1: 20, c2: 20, c3: 20, c4: 20, c5: 20, niveau: 'critique' },
  ];
  test('poids/seuils identiques : aucun changement', () => {
    const r = calculerImpacts(PROFILS, { c1: 20, c2: 25, c3: 20, c4: 20, c5: 15 }, SEUILS_NIVEAUX_DEFAUT);
    expect(r.total).toBe(2);
    expect(r.changements).toHaveLength(0);
  });
  test('seuil durci : a1 bascule', () => {
    const r = calculerImpacts(PROFILS, { c1: 20, c2: 25, c3: 20, c4: 20, c5: 15 }, { faible: 80, moyen: 70, eleve: 30 });
    expect(r.changements.map((c) => c.aerodrome_id)).toEqual(['a1']);
    expect(r.changements[0].avantNiveau).toBe('MOYEN');
    expect(r.changements[0].apresNiveau).toBe('ELEVE');
  });
  test('profils incomplets ignorés sans crash', () => {
    const r = calculerImpacts(
      [null, {}] as unknown as Array<{ aerodrome_id: string }>,
      { c1: 20 },
      SEUILS_NIVEAUX_DEFAUT,
    );
    expect(r.changements).toHaveLength(0);
  });
});
