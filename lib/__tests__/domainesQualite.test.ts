// lib/__tests__/domainesQualite.test.ts — Qualité signataire (lib/domaines.ts).
// Titulaires + principaux évaluent et signent ; stagiaires + cadres =
// observateurs. Fiche liée prioritaire, compte en repli.

import {
  qualiteDepuisType,
  qualiteInspecteur,
  aQualiteSignature,
  trouverFicheInspecteur,
  qualiteCompte,
  estResultatValide,
  estItemTermine,
} from '../domaines';

describe('qualiteDepuisType', () => {
  test('titulaire / principal reconnus, le reste = observateur', () => {
    expect(qualiteDepuisType('inspecteur_titulaire')).toBe('titulaire');
    expect(qualiteDepuisType('inspecteur_principal')).toBe('principal');
    expect(qualiteDepuisType('inspecteur_stagiaire')).toBe('observateur');
    expect(qualiteDepuisType('cadre_technique')).toBe('observateur');
    expect(qualiteDepuisType(undefined)).toBe('observateur');
    expect(qualiteDepuisType('nimporte_quoi')).toBe('observateur');
  });
});

describe('qualiteInspecteur / aQualiteSignature', () => {
  test('fiche prioritaire sur le compte', () => {
    expect(qualiteInspecteur({ type: 'inspecteur_titulaire' }, { type_inspecteur: 'cadre_technique' })).toBe('titulaire');
    expect(qualiteInspecteur(undefined, { type_inspecteur: 'inspecteur_principal' })).toBe('principal');
    expect(aQualiteSignature({ type: 'inspecteur_titulaire' })).toBe(true);
    expect(aQualiteSignature({ type: 'inspecteur_principal' })).toBe(true);
    expect(aQualiteSignature({ type: 'inspecteur_stagiaire' })).toBe(false);
    expect(aQualiteSignature({ type: 'cadre_technique' })).toBe(false);
    expect(aQualiteSignature(undefined, undefined)).toBe(false);
  });
});

describe('estResultatValide (R2 brouillon)', () => {
  const fiches = [{ id: 'f1', user_id: 'u-tit', type: 'inspecteur_titulaire' }];
  const comptes = [
    { id: 'u-tit', role: 'inspector' },
    { id: 'u-sta', role: 'inspector', type_inspecteur: 'inspecteur_stagiaire' },
  ];
  test('vide ou NV → invalide ; auteur signataire → valide', () => {
    expect(estResultatValide({ resultat: 'SA', modified_by: 'u-tit' }, fiches, comptes)).toBe(true);
    expect(estResultatValide({ conclusion: 'NS', modified_by: 'u-tit' }, fiches, comptes)).toBe(true);
    expect(estResultatValide({ resultat: 'NV', modified_by: 'u-tit' }, fiches, comptes)).toBe(false);
    expect(estResultatValide({ resultat: undefined }, fiches, comptes)).toBe(false);
    expect(estResultatValide(null, fiches, comptes)).toBe(false);
  });
  test('brouillon observateur → invalide ; legacy sans auteur → valide', () => {
    expect(estResultatValide({ resultat: 'SA', modified_by: 'u-sta' }, fiches, comptes)).toBe(false);
    expect(estResultatValide({ resultat: 'SA' }, fiches, comptes)).toBe(true);
    expect(estResultatValide({ resultat: 'SA', modified_by: 'inconnu' }, fiches, comptes)).toBe(false);
  });
});

describe('estItemTermine (terminé = valide OU NV motivé)', () => {
  const fiches = [{ id: 'f1', user_id: 'u-tit', type: 'inspecteur_titulaire' }];
  const comptes = [
    { id: 'u-tit', role: 'inspector' },
    { id: 'u-sta', role: 'inspector', type_inspecteur: 'inspecteur_stagiaire' },
  ];
  test('SA/NS/NA signataire → terminé ; brouillon → non', () => {
    expect(estItemTermine({ resultat: 'SA', modified_by: 'u-tit' }, fiches, comptes)).toBe(true);
    expect(estItemTermine({ resultat: 'NS', modified_by: 'u-tit' }, fiches, comptes)).toBe(true);
    expect(estItemTermine({ resultat: 'NA', modified_by: 'u-tit' }, fiches, comptes)).toBe(true);
    expect(estItemTermine({ resultat: 'SA', modified_by: 'u-sta' }, fiches, comptes)).toBe(false);
    expect(estItemTermine({ resultat: undefined }, fiches, comptes)).toBe(false);
  });
  test('NV motivé → terminé ; NV muet → restant', () => {
    expect(estItemTermine({ resultat: 'NV', observation: 'Piste inondée, reporté' }, fiches, comptes)).toBe(true);
    expect(estItemTermine({ resultat: 'NV', observation_stylus_data: 'zzz' }, fiches, comptes)).toBe(true);
    expect(estItemTermine({ conclusion: 'NV', commentaire: 'Inaccessible' }, fiches, comptes)).toBe(true);
    expect(estItemTermine({ resultat: 'NV' }, fiches, comptes)).toBe(false);
    expect(estItemTermine({ resultat: 'NV', observation: '   ' }, fiches, comptes)).toBe(false);
  });
});

describe('trouverFicheInspecteur / qualiteCompte', () => {
  const fiches = [
    { id: 'f1', user_id: 'u1', type: 'inspecteur_titulaire' },
    { id: 'f2', user_id: 'u2', type: 'inspecteur_stagiaire' },
  ];
  test('liaison par inspecteur_id puis user_id', () => {
    expect(trouverFicheInspecteur(fiches, { id: 'u9', inspecteur_id: 'f2' })?.id).toBe('f2');
    expect(trouverFicheInspecteur(fiches, { id: 'u1' })?.id).toBe('f1');
    expect(trouverFicheInspecteur(fiches, { id: 'u9' })).toBeUndefined();
  });
  test('qualité du compte via fiche liée, repli compte', () => {
    expect(qualiteCompte(fiches, { id: 'u1' })).toBe('titulaire');
    expect(qualiteCompte(fiches, { id: 'u2' })).toBe('observateur');
    expect(qualiteCompte([], { id: 'u3', type_inspecteur: 'inspecteur_principal' })).toBe('principal');
    expect(qualiteCompte([], { id: 'u4' })).toBe('observateur');
  });
});
