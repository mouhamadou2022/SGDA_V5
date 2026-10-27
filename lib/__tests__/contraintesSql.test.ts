// lib/__tests__/contraintesSql.test.ts — garde-fou anti-dérive code ↔ DB.
// Toute valeur de statut/engine émise par le code doit être acceptée par le
// CHECK correspondant (sinon : violation silencieuse en prod, cf.
// ecarts_statut_check octobre 2026). Lit le schéma de référence.
import * as fs from 'fs';
import * as path from 'path';
import { STATUTS_ECART } from '../config';

const SQL = fs.readFileSync(path.join(process.cwd(), 'SGDA_v5_FINAL_COMPLET.sql'), 'utf8');

function blocCheck(marqueur: string, taille = 2000): string {
  const i = SQL.indexOf(marqueur);
  expect(i).toBeGreaterThan(-1);
  return SQL.slice(i, i + taille);
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

describe('RLS dossiers — accès interne uniquement', () => {
  test('lecture réservée aux admins et inspecteurs', () => {
    const bloc = blocCheck('CREATE POLICY "dossiers_select"');
    expect(bloc).toContain("get_user_role() IN ('admin','inspector')");
    expect(bloc).not.toContain('dg_operator');
    expect(bloc).not.toContain('dg_anacim');
  });
  test('création et suppression réservées aux admins', () => {
    expect(blocCheck('CREATE POLICY "dossiers_insert"')).toContain("get_user_role() = 'admin'");
    expect(blocCheck('CREATE POLICY "dossiers_delete"')).toContain("get_user_role() = 'admin'");
  });
  test('le trigger protège les métadonnées et les assignations des tiers', () => {
    const bloc = blocCheck('CREATE OR REPLACE FUNCTION protect_dossier_metadata', 4000);
    expect(bloc).toContain('Seul un administrateur peut modifier les métadonnées');
    expect(bloc).toContain('Un inspecteur ne peut modifier que sa propre assignation');
  });
});

describe('schéma SQL — intégrité structurelle', () => {
  test('aucun caractère de remplacement U+FFFD', () => {
    expect(SQL).not.toContain('\uFFFD');
  });

  test('aucune policy dupliquée (table + nom)', () => {
    const matches = [...SQL.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+([a-zA-Z0-9_.]+)/g)];
    const keys = matches.map(m => `${m[2]}.${m[1]}`);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(duplicates).toEqual([]);
  });

  test('chaque CREATE POLICY est précédé de son DROP IF EXISTS', () => {
    const matches = [...SQL.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+([a-zA-Z0-9_.]+)/g)];
    for (const match of matches) {
      const [, name, table] = match;
      const drop = new RegExp(`DROP POLICY IF EXISTS\\s+"${name}"\\s+ON\\s+${table};`);
      expect(SQL).toMatch(drop);
    }
  });
});
