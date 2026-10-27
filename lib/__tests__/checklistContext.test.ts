// lib/__tests__/checklistContext.test.ts
// Non-régression : le contexte envoyé à l'assistant latéral doit tenir dans la
// fenêtre des providers. La checklist entière avec tous ses champs coûtait
// ~61 500 tokens (138 items) → 503 ALL_PROVIDERS_FAILED.

import { construireContexteChecklist, BUDGET_CONTEXTE_CHECKLIST } from '../ia/checklistContext'

interface ItemLike {
  id: string
  numero: string
  reference_reglementaire: string
  point_verification: string
  directive_preuve?: string
  directive_sa?: string
  directive_ns?: string
  directive_nv?: string
  directive_na?: string
  prediction?: string
  justification?: string
}

function item(i: number, longueurPoint = 400): ItemLike {
  const suffixe = 'x'.repeat(longueurPoint)
  return {
    id: `it_${i}`,
    numero: `QSC${String(i).padStart(2, '0')}`,
    reference_reglementaire: `RAS 14 Volume I, §1.4.1.3 ; Doc 9734 Partie A, C3 — ${'r'.repeat(80)}`,
    point_verification: `L'exploitant assure-t-il le suivi du point ${i} ? ${suffixe}`,
    directive_preuve: `Preuve attendue ${i} ${'p'.repeat(300)}`,
    directive_sa: `Directive SA ${i} ${'a'.repeat(300)}`,
    directive_ns: `Directive NS ${i} ${'b'.repeat(300)}`,
    directive_nv: `Directive NV ${i} ${'c'.repeat(300)}`,
    directive_na: `Directive NA ${i} ${'d'.repeat(300)}`,
    prediction: 'NV',
    justification: `Justification ${i} ${'j'.repeat(200)}`,
  }
}

function checklistVolumineuse(nbItems = 138) {
  return [
    {
      id: 'dom_ops',
      nom: 'OPS — Procédures opérationnelles',
      items: Array.from({ length: nbItems }, (_, i) => item(i)),
      sousDomaines: [
        {
          id: 'sd_sgs',
          nom: 'SGS — Système de Gestion de la Sécurité',
          items: Array.from({ length: 20 }, (_, i) => item(1000 + i)),
          sousSousDomaines: [
            {
              id: 'ssd_risques',
              nom: 'Gestion des risques',
              items: Array.from({ length: 5 }, (_, i) => item(2000 + i)),
            },
          ],
        },
      ],
    },
  ]
}

describe('construireContexteChecklist', () => {
  test('une checklist de 138 items tient dans le budget par défaut', () => {
    const ctx = construireContexteChecklist(checklistVolumineuse())
    expect(ctx.itemsTotal).toBe(163)
    expect(ctx.texte.length).toBeLessThanOrEqual(BUDGET_CONTEXTE_CHECKLIST)
    // Très en dessous de la fenêtre minimale des providers (60 000 tokens à chars/3)
    expect(Math.ceil(ctx.texte.length / 3)).toBeLessThan(60000)
  })

  test('n’envoie pas les champs lourds (directives, justifications)', () => {
    const ctx = construireContexteChecklist(checklistVolumineuse(5))
    expect(ctx.texte).not.toContain('directive_sa')
    expect(ctx.texte).not.toContain('directive_preuve')
    expect(ctx.texte).not.toContain('justification')
    expect(ctx.texte).toContain('point_verification')
  })

  test('conserve les identifiants et numéros nécessaires à la fusion', () => {
    const ctx = construireContexteChecklist(checklistVolumineuse(5))
    expect(ctx.texte).toContain('it_0')
    expect(ctx.texte).toContain('QSC00')
    expect(ctx.texte).toContain('sd_sgs')
    expect(ctx.texte).toContain('ssd_risques')
  })

  test('raccourcit les questions quand le budget est serré', () => {
    const ctx = construireContexteChecklist(checklistVolumineuse(60), 12000)
    expect(ctx.questionsRaccourcies).toBe(true)
    expect(ctx.texte.length).toBeLessThanOrEqual(12000)
  })

  test('compte les items omis quand le budget est trop petit pour tout lister', () => {
    const ctx = construireContexteChecklist(checklistVolumineuse(200), 4000)
    expect(ctx.itemsTotal).toBe(225)
    expect(ctx.itemsOmis).toBeGreaterThan(0)
    expect(ctx.itemsEnvoyes + ctx.itemsOmis).toBe(ctx.itemsTotal)
    expect(ctx.texte).toContain('autres_items_non_listes')
  })

  test('gère une checklist vide ou absente sans erreur', () => {
    for (const entree of [[], null, undefined]) {
      const ctx = construireContexteChecklist(entree as any)
      expect(ctx.itemsTotal).toBe(0)
      expect(ctx.itemsOmis).toBe(0)
      expect(ctx.texte).toBe('[]')
    }
  })

  test('un budget minuscule ne produit jamais un texte vide', () => {
    const ctx = construireContexteChecklist(checklistVolumineuse(50), 10)
    expect(ctx.texte.length).toBeGreaterThan(0)
    expect(ctx.questionsRaccourcies).toBe(true)
  })
})
