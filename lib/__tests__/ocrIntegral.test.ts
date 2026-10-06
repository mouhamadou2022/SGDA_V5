// lib/__tests__/ocrIntegral.test.ts — Reprise OCR vision (pur, sans réseau).
import { dernierePageLue } from '../services/pdfExtractor';

describe('dernierePageLue', () => {
  test('aucun marqueur → 0 (commence à la page 1)', () => {
    expect(dernierePageLue('')).toBe(0);
    expect(dernierePageLue('Texte natif sans marqueurs')).toBe(0);
  });
  test('retourne la plus grande page marquée', () => {
    const texte = '--- Page 1 ---\nContenu\n\n--- Page 2 ---\nSuite\n\n--- Page 5 ---\nFin';
    expect(dernierePageLue(texte)).toBe(5);
  });
  test('insensible à la casse et aux espaces', () => {
    expect(dernierePageLue('---  page   3---\nX')).toBe(3);
  });
});
