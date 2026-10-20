// lib/__tests__/infrastructureComplexite.test.ts — Indice de complexité infra (pur).
import {
  computeInfrastructureComplexite,
  applyComplexiteC3,
  PENALITE_C3_MAX,
} from '../risque/infrastructureComplexite';
import { calculerProfilInitial } from '../risque/initialProfile';

describe('computeInfrastructureComplexite', () => {
  test('repli NEUTRE quand la donnée est absente (non-régression)', () => {
    for (const vide of [undefined, null, {}]) {
      const r = computeInfrastructureComplexite(vide as never);
      expect(r.applicable).toBe(false);
      expect(r.indice).toBe(0);
      expect(r.penaliteC3).toBe(0);
      expect(applyComplexiteC3(72, r)).toBe(72);
    }
  });

  test('aérodrome simple : 1 piste unique, peu de taxiways → aucune pénalité', () => {
    const r = computeInfrastructureComplexite({
      nombre_pistes: 1,
      configuration_pistes: 'unique',
      nombre_voies_circulation: 2,
      nombre_acces_piste: 1,
      nombre_postes_stationnement: 3,
      points_chauds: 0,
    });
    expect(r.applicable).toBe(true);
    expect(r.indice).toBe(0);
    expect(r.penaliteC3).toBe(0);
    expect(applyComplexiteC3(80, r)).toBe(80);
  });

  test('aérodrome complexe : pistes croisées + gros trafic → pénalité plafonnée', () => {
    const r = computeInfrastructureComplexite({
      nombre_pistes: 3,
      configuration_pistes: 'mixte',
      nombre_voies_circulation: 8,
      nombre_acces_piste: 6,
      nombre_postes_stationnement: 40,
      points_chauds: 3,
    });
    expect(r.indice).toBe(100);
    expect(r.penaliteC3).toBe(PENALITE_C3_MAX);
    expect(applyComplexiteC3(90, r)).toBe(90 - PENALITE_C3_MAX);
  });

  test('monotone : plus d\'infrastructure → indice >=', () => {
    const petit = computeInfrastructureComplexite({ nombre_pistes: 1, configuration_pistes: 'unique' });
    const moyen = computeInfrastructureComplexite({ nombre_pistes: 2, configuration_pistes: 'paralleles' });
    const grand = computeInfrastructureComplexite({ nombre_pistes: 2, configuration_pistes: 'croisees', nombre_postes_stationnement: 20 });
    expect(moyen.indice).toBeGreaterThanOrEqual(petit.indice);
    expect(grand.indice).toBeGreaterThan(moyen.indice);
  });

  test('borne basse C3 : la pénalité ne descend jamais sous 0', () => {
    const r = computeInfrastructureComplexite({ nombre_pistes: 4, configuration_pistes: 'mixte', points_chauds: 5 });
    expect(applyComplexiteC3(5, r)).toBe(0);
  });

  test('indice toujours borné 0-100 et pénalité 0-20 quel que soit l\'input', () => {
    const r = computeInfrastructureComplexite({
      nombre_pistes: 999,
      configuration_pistes: 'mixte',
      nombre_voies_circulation: 999,
      nombre_acces_piste: 999,
      nombre_postes_stationnement: 9999,
      points_chauds: 999,
    });
    expect(r.indice).toBeLessThanOrEqual(100);
    expect(r.penaliteC3).toBeLessThanOrEqual(PENALITE_C3_MAX);
    expect(r.penaliteC3).toBeGreaterThanOrEqual(0);
  });
});

describe('intégration — profil initial (tous les statuts)', () => {
  const BASE = {
    id: 'a-test', nom: 'Test', code_oaci: 'GOTX', type: 'international',
    type_entite: 'aerodrome', categorie_sslia: '3', region: 'Dakar',
    maturite_sgs: 70, statut: 'actif', lat: 0, lon: 0, altitude: 0,
    created_at: '', updated_at: '',
  };
  const COMPLEXE = {
    nombre_pistes: 3,
    configuration_pistes: 'mixte' as const,
    nombre_voies_circulation: 8,
    nombre_acces_piste: 6,
    nombre_postes_stationnement: 40,
    points_chauds: 3,
  };

  test('certifié : C3 de base 90 moins la pénalité', () => {
    const r = calculerProfilInitial({
      ...BASE, statut_certification: 'certifie', infrastructure_complexite: COMPLEXE,
    } as never, []);
    expect(r.profil.c3).toBe(90 - PENALITE_C3_MAX);
  });

  test('homologué : C3 de base 80 moins la pénalité', () => {
    const r = calculerProfilInitial({
      ...BASE, statut_certification: 'homologue', infrastructure_complexite: COMPLEXE,
    } as never, []);
    expect(r.profil.c3).toBe(80 - PENALITE_C3_MAX);
  });

  test('certifié sans donnée de complexité : C3 inchangé (90)', () => {
    const r = calculerProfilInitial({
      ...BASE, statut_certification: 'certifie',
    } as never, []);
    expect(r.profil.c3).toBe(90);
    expect(r.profil.infrastructure?.complexite_infra).toBeUndefined();
  });
});
