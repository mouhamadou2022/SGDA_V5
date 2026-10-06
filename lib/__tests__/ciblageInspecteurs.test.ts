// lib/__tests__/ciblageInspecteurs.test.ts — Ciblage formation (pur, sans réseau).
import { ciblerInspecteurs, normaliserDomainesDoc } from '../ia/ciblageInspecteurs';

const T0 = new Date('2026-10-01T00:00:00Z').getTime();
const MOIS = 30 * 86400 * 1000;

const INSPECTEURS = [{ id: 'i-expert' }, { id: 'i-neuf' }, { id: 'i-forme' }, { id: 'i-autre' }];

describe('ciblerInspecteurs', () => {
  test('impact majeur → tous les inspecteurs (comportement conservé)', () => {
    const res = ciblerInspecteurs({
      inspecteurs: INSPECTEURS, competences: [], formations: [],
      domainesDoc: ['SGS'], impact: 'majeur', maintenant: T0,
    });
    expect(res.ids).toEqual(['i-expert', 'i-neuf', 'i-forme', 'i-autre']);
  });

  test('classe par compétence + besoin de formation, jamais formé d abord', () => {
    const res = ciblerInspecteurs({
      inspecteurs: INSPECTEURS,
      competences: [
        { id: 'c1', inspecteur_id: 'i-expert', domaine: 'SGS', niveau: 3, date_obtention: '2024-01-01', source: 'formation' },
        { id: 'c2', inspecteur_id: 'i-forme', domaine: 'SGS', niveau: 2, date_obtention: '2024-01-01', source: 'formation' },
      ],
      formations: [
        { id: 'f1', reference: 'F1', titre: 'SGS', type: 'continue', domaines: ['SGS'], date: new Date(T0 - MOIS).toISOString(), duree_heures: 4, lieu: '', formateur: '', participants: ['i-forme'], objectifs: '', statut: 'terminee', created_at: '', created_by: '' },
      ],
      domainesDoc: ['SGS'],
      impact: 'modere',
      maintenant: T0,
    });
    // i-expert : niv3 (45) + jamais formé (30) = 75 ; i-forme : niv2 (30) + formé récent (0) = 30.
    expect(res.ids[0]).toBe('i-expert');
    expect(res.scores['i-expert']).toBe(75);
    expect(res.scores['i-forme']).toBe(30);
    expect(res.ids.length).toBe(3);
  });

  test('compétence expirée ignorée, formation ancienne relance le besoin', () => {
    const res = ciblerInspecteurs({
      inspecteurs: [{ id: 'i-a' }, { id: 'i-b' }],
      competences: [
        { id: 'c1', inspecteur_id: 'i-a', domaine: 'PHY', niveau: 3, date_obtention: '2020-01-01', source: 'formation', expire_le: '2024-01-01' },
      ],
      formations: [
        { id: 'f1', reference: 'F1', titre: 'PHY', type: 'continue', domaines: ['PHY'], date: new Date(T0 - 13 * MOIS).toISOString(), duree_heures: 4, lieu: '', formateur: '', participants: ['i-b'], objectifs: '', statut: 'terminee', created_at: '', created_by: '' },
      ],
      domainesDoc: ['PHY'],
      impact: 'mineur',
      maintenant: T0,
    });
    // i-a : compétence expirée (0) + jamais formé (30) = 30 ; i-b : formé il y a 13 mois (+20) = 20.
    expect(res.ids).toEqual(['i-a', 'i-b']);
  });

  test('doc AGA → tous les domaines individuels, déclaratives prises en compte', () => {
    expect(normaliserDomainesDoc(['AGA']).length).toBeGreaterThan(5);
    const res = ciblerInspecteurs({
      inspecteurs: [
        { id: 'i-1', competencesDeclaratives: [{ domaine: 'ELEC', niveau: 'expert' }] },
        { id: 'i-2' },
      ],
      competences: [],
      formations: [],
      domainesDoc: ['AGA'],
      impact: 'modere',
      maintenant: T0,
    });
    // i-1 : déclarative expert (3×10=30) + jamais formé (30) = 60 ; i-2 : 30.
    expect(res.ids).toEqual(['i-1', 'i-2']);
  });

  test('aucun inspecteur → vide, égalités stables par id', () => {
    expect(ciblerInspecteurs({
      inspecteurs: [], competences: [], formations: [],
      domainesDoc: ['SGS'], impact: 'modere', maintenant: T0,
    }).ids).toEqual([]);
    const res = ciblerInspecteurs({
      inspecteurs: [{ id: 'i-z' }, { id: 'i-a' }], competences: [], formations: [],
      domainesDoc: [], impact: 'modere', maintenant: T0,
    });
    expect(res.ids).toEqual(['i-a', 'i-z']);
  });
});
