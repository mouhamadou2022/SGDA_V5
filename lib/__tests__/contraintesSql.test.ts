// lib/__tests__/contraintesSql.test.ts — garde-fou anti-dérive code ↔ DB.
// Toute valeur de statut/engine émise par le code doit être acceptée par le
// CHECK correspondant (sinon : violation silencieuse en prod, cf.
// ecarts_statut_check octobre 2026). Lit le schéma de référence.
import * as fs from 'fs';
import * as path from 'path';
import { STATUTS_ECART } from '../config';

const SQL = fs.readFileSync(path.join(process.cwd(), 'SGDA_v5_FINAL_COMPLET.sql'), 'utf8');

function blocCheck(marqueur: string): string {
  const i = SQL.indexOf(marqueur);
  expect(i).toBeGreaterThan(-1);
  return SQL.slice(i, i + 2000);
}

describe('contraintes CHECK alignées sur le code', () => {
  test('ecarts.statut accepte STATUTS_ECART + en_attente_validation_chef', () => {
    const bloc = blocCheck('ecarts_statut_check');
    for (const s of Object.keys(STATUTS_ECART)) {
      expect(bloc).toContain(`'${s}'`);
    }
    expect(bloc).toContain(`'en_attente_validation_chef'`);
  });
  test('evenements_securite.statut accepte les 12 statuts du cycle', () => {
    const bloc = blocCheck('evenements_securite_statut_check');
    for (const s of ['recu', 'assigne', 'accepte', 'refuse', 'attente_operateur', 'en_cours', 'analyse', 'ecart_cree', 'rapport_redige', 'soumis_validation', 'retourne', 'cloture']) {
      expect(bloc).toContain(`'${s}'`);
    }
  });
  test('ia_feedback.engine_type accepte les 6 engines (dont aerodromeEnrichment)', () => {
    const bloc = blocCheck('ia_feedback_engine_type_check');
    for (const e of ['riskProfile', 'compliance', 'recommendation', 'certificate', 'team', 'aerodromeEnrichment']) {
      expect(bloc).toContain(`'${e}'`);
    }
  });
});
