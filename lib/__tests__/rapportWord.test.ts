// lib/__tests__/rapportWord.test.ts — Génération Word institutionnelle
// (lib/services/rapportWord.ts) : mêmes données que les PDF, téléchargement .docx.

import { TextEncoder, TextDecoder } from 'util';
// Polyfill jsdom (TextEncoder natif dans les navigateurs) pour docx.
Object.assign(globalThis, { TextEncoder, TextDecoder });

import { downloadBlob } from '@/lib/pdfGenerator';
import {
  genererRapportWordCertification,
  genererRapportWordHomologation,
  genererRapportWordBriefing,
  genererRapportWordChecklist,
} from '../services/rapportWord';
import { useAppStore } from '../store';

jest.mock('@/lib/pdfGenerator', () => ({ downloadBlob: jest.fn() }));

const telechargements = downloadBlob as jest.Mock;

beforeEach(() => {
  telechargements.mockClear();
  useAppStore.setState({
    aerodromes: [{ id: 'a1', code_oaci: 'GOBD', nom: 'Blaise Diagne', type: 'international' }],
    certifications: [],
    homologations: [],
    profilsRisque: {},
  } as never);
});

describe('rapportWord', () => {
  test('certification nationale → .docx non vide', async () => {
    const res = await genererRapportWordCertification();
    expect(res.fichier).toMatch(/\.docx$/);
    expect(telechargements).toHaveBeenCalledTimes(1);
    const blob: Blob = telechargements.mock.calls[0][0];
    expect(blob.size).toBeGreaterThan(1000);
  });
  test('homologation nationale → .docx non vide', async () => {
    const res = await genererRapportWordHomologation();
    expect(res.fichier).toMatch(/\.docx$/);
    const blob: Blob = telechargements.mock.calls[0][0];
    expect(blob.size).toBeGreaterThan(1000);
  });
  test('briefing site → .docx avec sections réelles', async () => {
    const res = await genererRapportWordBriefing({
      reference: 'BRF-1', type_mission: 'periodique', periode: 'janvier',
      objectifs: ['Vérifier la piste'], portee: ['PHY'], equipe: ['I. Ndiaye'],
      points_attention: ['Fissures'], preuves_a_verifier: [], recommandations: ['Reboucher'],
      confiance: 80, genere_le: new Date().toISOString(),
      contexte_ecarts: [{ reference: 'ECA-1', libelle: 'Fissure', niveau_risque: 'eleve', statut: 'ouvert', pac: false }],
    }, { codeOaci: 'GOBD', nom: 'Blaise Diagne', redacteur: 'Test' });
    expect(res.fichier).toMatch(/^Briefing_GOBD.*\.docx$/);
    const blob: Blob = telechargements.mock.calls[0][0];
    expect(blob.size).toBeGreaterThan(1000);
  });
  test('checklist → .docx avec items aplatis', async () => {
    const res = await genererRapportWordChecklist([{
      id: 'd1', nom: 'PHY', description: 'Piste', items: [{
        id: 'i1', surveillance_id: 's1', type_checklist: 'standard', categorie: 'c',
        reference_ras14: '', description: 'État de la piste', directive_preuve: '', domaine: 'PHY',
        ordre: 0, numero: '1.1', point_verification: 'Fissures ?', resultat: 'NS',
        last_modified: '', modified_by: '',
      }], sousDomaines: [], isExpanded: true, progression: 0, ordre: 0,
    }], { titre: 'Checklist - GOBD', code: 's1abcdef', portee: ['PHY'] });
    expect(res.fichier).toMatch(/\.docx$/);
    const blob: Blob = telechargements.mock.calls[0][0];
    expect(blob.size).toBeGreaterThan(1000);
  });
});
