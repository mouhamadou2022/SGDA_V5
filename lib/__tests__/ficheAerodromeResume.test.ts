// lib/__tests__/ficheAerodromeResume.test.ts â€” Fiche langage clair (pur).
import { resumerFicheAerodrome } from '../ficheAerodromeResume';
import type { Aerodrome } from '../store/aerodromesSlice';

const BASE: Aerodrome = {
  id: 'a-gobd', nom: 'Blaise Diagne', code_oaci: 'GOBD',
  type: 'international', type_entite: 'aerodrome', categorie_sslia: '9',
  region: 'Dakar', maturite_sgs: 50, statut: 'actif',
  lat: 14.6, lon: -17.4, altitude: 87,
  created_at: '', updated_at: '',
} as Aerodrome;

describe('resumerFicheAerodrome', () => {
  test('fiche complète : identité, piste, exploitant, horaires, contacts', () => {
    const lignes = resumerFicheAerodrome({
      ...BASE,
      piste_principale: { longueur: 3400, largeur: 60, orientation: '01/19', revetement: 'enrobé', pcr: 80, code_reference: '4E', avion_reference: 'B777' },
      exploitant_nom: 'AIBD SA', exploitant_telephone: '+221 33',
      horaires: 'h24',
      statut_certification: 'certifie', certifie_le: '2024-05-01', numero_certificat: 'SN-001',
      contacts: [{ nom: 'A. Ndiaye', poste: 'Chef', email: '', telephone: '' }],
    } as Aerodrome);
    const texte = lignes.join(' ');
    expect(texte).toContain('Blaise Diagne (GOBD)');
    expect(texte).toContain('3400');
    expect(texte).toContain('AIBD SA');
    expect(texte).toContain('H24');
    expect(texte).toContain('certifié');
    expect(texte).toContain('A. Ndiaye');
  });
  test('fiche minimale, jamais invention', () => {
    const lignes = resumerFicheAerodrome(BASE);
    expect(lignes.length).toBeGreaterThanOrEqual(1);
    const texte = lignes.join(' ');
    expect(texte).toContain('GOBD');
    expect(texte).not.toContain('undefined');
    expect(texte).not.toContain('null');
  });
  test('SGS non applicable mentionné', () => {
    const lignes = resumerFicheAerodrome({ ...BASE, statut_sgs: 'non_applicable' });
    expect(lignes.join(' ')).toContain("ne s'y applique pas");
  });
});