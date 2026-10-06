// lib/__tests__/assainirStockage.test.ts — Textes extractibles vers Supabase (pur).
// Contexte : un contenu_complet issu de PDF faisait echouer l'upsert
// (« unsupported Unicode escape sequence » : surrogates isoles, octet nul).
// Tout non-ASCII passe par fromCharCode (aucun octet fragile dans le fichier).
import { assainirTexteStockage, assainirPayloadKit } from '../datastore/kitDocuments';
import { cheminStockageSain } from '../datastore/fichiers';

const NUL = String.fromCharCode(0);
const LEAD_SEUL = String.fromCharCode(0xd800);
const TRAIL_SEUL = String.fromCharCode(0xdc00);
const EMOJI = String.fromCharCode(0xd83d) + String.fromCharCode(0xde00);

describe('assainirTexteStockage', () => {
  test('supprime octet nul et surrogates isoles', () => {
    expect(assainirTexteStockage(`a${NUL}b`)).toBe('ab');
    expect(assainirTexteStockage(`a${LEAD_SEUL}b`)).toBe('ab');
    expect(assainirTexteStockage(`a${TRAIL_SEUL}b`)).toBe('ab');
  });
  test('preserve paires valides (emoji) et texte sain', () => {
    expect(assainirTexteStockage(`Piste ${EMOJI} conforme`)).toBe(`Piste ${EMOJI} conforme`);
    expect(assainirTexteStockage('RAS 14 - verifie')).toBe('RAS 14 - verifie');
    expect(assainirTexteStockage('')).toBe('');
  });
});

describe('assainirPayloadKit', () => {
  test('nettoie contenu, noms et extraits, laisse le reste', () => {
    const out = assainirPayloadKit({
      contenu_complet: `texte${NUL}sale`,
      resume: 'ok',
      nom: `Doc${LEAD_SEUL}`,
      version: 'v1',
      extraits: [{ reference: 'RAS', titre: `t${TRAIL_SEUL}i`, contenu_resume: 'propre' }],
    });
    expect(out.contenu_complet).toBe('textesale');
    expect(out.resume).toBe('ok');
    expect(out.nom).toBe('Doc');
    expect((out.extraits as Array<{ titre: string }>)[0].titre).toBe('ti');
    expect(out.version).toBe('v1');
  });
});

describe('cheminStockageSain', () => {
  test('accents et espaces normalises, structure gardee', () => {
    const A_GRAVE = String.fromCharCode(0xe0);
    expect(cheminStockageSain(`kit-documents/aea9_AMENDEMNT_VOLUME_II_VF_mis_${A_GRAVE}_jour.pdf`))
      .toBe('kit-documents/aea9_AMENDEMNT_VOLUME_II_VF_mis_a_jour.pdf');
    expect(cheminStockageSain('kit-documents/mon doc final (2).PDF'))
      .toBe('kit-documents/mon_doc_final_2_.PDF');
  });
  test('segments vides et traversee supprimes, borne 200', () => {
    expect(cheminStockageSain('a/../../b')).toBe('a/b');
    expect(cheminStockageSain('')).toBe('fichier');
    expect(cheminStockageSain(`d/${'x'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(200);
  });
});
