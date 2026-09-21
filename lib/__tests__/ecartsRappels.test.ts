// lib/__tests__/ecartsRappels.test.ts — Décisions pures des rappels
// (lib/ecarts-rappels.ts). Testées isolément avec dates figées.

import type { Ecart } from '../store/ecartsTypes';
import {
  joursRestants,
  evaluerRappelsEcart,
  evaluerDelaisInspecteur,
  calculerDelaiRestant,
} from '../ecarts-rappels'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const iso = (daysFromNow: number) =>
  new Date(NOW.getTime() + daysFromNow * 86400000).toISOString()

const base = {
  id: 'e1',
  statut: 'ouvert',
  delai_pac: iso(10),
  delai_regularisation: iso(30),
} as unknown as Ecart

describe('joursRestants', () => {
  test('ceil des jours, négatif si dépassé', () => {
    expect(joursRestants(iso(7), NOW)).toBe(7)
    expect(joursRestants(iso(-1), NOW)).toBe(-1)
  })
})

describe('evaluerRappelsEcart', () => {
  test('clôturé → rien', () => {
    expect(evaluerRappelsEcart({ ...base, statut: 'cloture' } as unknown as Ecart, NOW))
      .toEqual({ passerEnRetard: false, rappels: [] })
  })
  test('délai dépassé → passerEnRetard (sauf déjà en_retard)', () => {
    expect(evaluerRappelsEcart({ ...base, delai_pac: iso(-2) } as unknown as Ecart, NOW).passerEnRetard).toBe(true)
    expect(evaluerRappelsEcart({ ...base, statut: 'en_retard', delai_pac: iso(-2) } as unknown as Ecart, NOW).passerEnRetard).toBe(false)
  })
  test('seuils J-7/J-3/J-1, déjà envoyé ignoré', () => {
    const r = evaluerRappelsEcart({ ...base, delai_pac: iso(7) } as unknown as Ecart, NOW)
    expect(r.rappels).toEqual(['J-7'])
    const deja = evaluerRappelsEcart(
      { ...base, delai_pac: iso(7), rappels_envoyes: { j7: true } } as unknown as Ecart, NOW)
    expect(deja.rappels).toEqual([])
  })
})

describe('evaluerDelaisInspecteur', () => {
  const soumis = {
    ...base,
    statut: 'pac_soumis',
    evaluation_pac: { deadline: iso(-1) },
    inspecteur_ref_id: 'insp-1',
  } as unknown as Ecart
  test('deadline passée → marquer retard', () => {
    const d = evaluerDelaisInspecteur(soumis, NOW)
    expect(d.marquerRetardEvalPAC).toBe(true)
    expect(d.rappelsEvalPAC).toEqual([])
  })
  test('J-3 → rappel, déjà marqué → rien', () => {
    const d = evaluerDelaisInspecteur(
      { ...soumis, evaluation_pac: { deadline: iso(3) } } as unknown as Ecart, NOW)
    expect(d).toMatchObject({ marquerRetardEvalPAC: false, rappelsEvalPAC: [3] })
    const deja = evaluerDelaisInspecteur(
      { ...soumis, evaluation_pac: { deadline: iso(3) }, _rappel_eval_j3: true } as unknown as Ecart, NOW)
    expect(deja.rappelsEvalPAC).toEqual([])
  })
  test('preuves_soumises → volet validation', () => {
    const d = evaluerDelaisInspecteur(
      { ...base, statut: 'preuves_soumises', validation_preuves: { deadline: iso(-2) } } as unknown as Ecart, NOW)
    expect(d.marquerRetardValidation).toBe(true)
  })
  test('autre statut → neutre', () => {
    expect(evaluerDelaisInspecteur(base, NOW)).toMatchObject({
      marquerRetardEvalPAC: false, rappelsEvalPAC: [],
      marquerRetardValidation: false, rappelsValidation: [],
    })
  })
})

describe('calculerDelaiRestant', () => {
  test('couleurs + dépassement', () => {
    expect(calculerDelaiRestant({ ...base, delai_pac: iso(-1) } as unknown as Ecart, NOW))
      .toMatchObject({ couleur: 'rouge', depasse: true })
    expect(calculerDelaiRestant({ ...base, delai_pac: iso(3) } as unknown as Ecart, NOW).couleur).toBe('rouge')
    expect(calculerDelaiRestant({ ...base, delai_pac: iso(10) } as unknown as Ecart, NOW).couleur).toBe('orange')
    expect(calculerDelaiRestant({ ...base, delai_pac: iso(30) } as unknown as Ecart, NOW).couleur).toBe('vert')
    // Statut avancé → base régularisation
    expect(calculerDelaiRestant(
      { ...base, statut: 'pac_accepte', delai_regularisation: iso(30) } as unknown as Ecart, NOW).couleur).toBe('vert')
  })
})
