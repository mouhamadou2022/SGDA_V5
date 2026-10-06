// lib/__tests__/recitEcart.test.ts — Récit calculé d'un écart (lib/ia/recitEcart.ts).
// Faits uniquement : synthèse, situation, anomalies de parcours.

import type { Ecart, HistoriqueEcart } from '../store/ecartsTypes';
import { construireRecitEcart } from '../ia/recitEcart';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const iso = (daysFromNow: number) =>
  new Date(NOW.getTime() + daysFromNow * 86400000).toISOString();
const passe = (daysAgo: number) =>
  new Date(NOW.getTime() - daysAgo * 86400000).toISOString();

const base = {
  id: 'e1',
  aerodrome_id: 'a1',
  reference: 'ECA-2026-001',
  libelle: 'Fissure piste',
  niveau_risque: 'eleve',
  statut: 'pac_attendu',
  delai_pac: iso(5),
  delai_regularisation: iso(25),
  inspecteur_ref_id: 'insp-1',
  created_at: passe(10),
  updated_at: passe(1),
} as unknown as Ecart;

const h = (type: HistoriqueEcart['type'], description: string, jours: number): HistoriqueEcart => ({
  id: `${type}-${jours}`,
  type,
  date: passe(jours),
  acteur: 'u1',
  role_acteur: 'inspector',
  description,
});

describe('construireRecitEcart', () => {
  test('synthèse sans PAC : phrases factuelles + attente exploitant', () => {
    const recit = construireRecitEcart(base, [], NOW);
    expect(recit.phrases.join(' ')).toMatch(/Aucun PAC soumis/);
    expect(recit.situation.attente).toBe('exploitant');
    expect(recit.situation.action).toMatch(/Soumettre le PAC/);
    expect(recit.situation.joursDepuisConstat).toBe(10);
    expect(recit.anomalies).toEqual([]);
  });
  test('PAC accepté : attente exploitant, échéance calculée', () => {
    const ecart = {
      ...base,
      statut: 'pac_accepte',
      pac: { actions: [{ description: 'a', responsable: 'r', date_prevue: iso(20), livrables: [] }], observations: '', fichiers: [], soumis_par: 'op', soumis_le: passe(8), version: 1 },
      evaluation_pac: { decision: 'accepte', evalue_le: passe(2) },
    } as unknown as Ecart;
    const recit = construireRecitEcart(ecart, [h('soumission_pac', 'Soumission du PAC version 1', 8)], NOW);
    expect(recit.phrases.join(' ')).toMatch(/accepté/);
    expect(recit.situation.action).toMatch(/Réaliser les actions/);
    expect(recit.situation.echeance).toMatch(/Échéance dans 25 jour/);
  });
  test('refus répétés → anomalie danger', () => {
    const ecart = { ...base, statut: 'pac_refuse', evaluation_pac: { decision: 'refuse', evalue_le: passe(1), commentaire_refus: 'Flou' } } as unknown as Ecart;
    const recit = construireRecitEcart(ecart, [
      h('evaluation_pac', 'Évaluation PAC — refusé', 9),
      h('evaluation_pac', 'Évaluation PAC — refusé', 1),
    ], NOW);
    expect(recit.anomalies.some(a => a.niveau === 'danger' && /Refus répétés/.test(a.titre))).toBe(true);
  });
  test('retard critique → anomalie danger, échéance dépassée', () => {
    const ecart = { ...base, statut: 'en_retard', niveau_risque: 'critique' } as unknown as Ecart;
    const recit = construireRecitEcart(
      { ...ecart, delai_pac: passe(40), delai_regularisation: passe(30), created_at: passe(100) } as unknown as Ecart,
      [], NOW);
    expect(recit.anomalies.some(a => /Retard sur risque/.test(a.titre))).toBe(true);
    expect(recit.situation.echeance).toMatch(/En retard/);
  });
  test('clôturé : pas d\u2019attente, mention clôture', () => {
    const ecart = {
      ...base,
      statut: 'cloture',
      preuves: { fichiers: [], commentaire: '', soumis_par: 'op', soumis_le: passe(6) },
      validation_preuves: { decision: 'valide', valide_le: passe(2) },
      cloture_le: passe(2),
    } as unknown as Ecart;
    const recit = construireRecitEcart(ecart, [], NOW);
    expect(recit.situation.echeance).toBe('Dossier clôturé.');
    expect(recit.phrases.join(' ')).toMatch(/clôturé/);
  });
});
