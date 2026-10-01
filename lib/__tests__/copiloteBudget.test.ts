import { plafonnerTextePieces, BUDGET_PIECES_CHARS } from '../ia/agents/copiloteAgent'

const piece = (nom: string, taille: number) => ({ id: nom, nom, texte: 'x'.repeat(taille) })

describe('plafonnerTextePieces', () => {
  test('petites pièces : rien tronqué', () => {
    const r = plafonnerTextePieces([piece('a.pdf', 100), piece('b.pdf', 200)])
    expect(r.tronque).toBe(false)
    expect(r.texte).toContain('a.pdf')
    expect(r.texte).toContain('b.pdf')
  })

  test('grosse pièce : tronquée proprement avec mention', () => {
    const r = plafonnerTextePieces([piece('gros.pdf', BUDGET_PIECES_CHARS + 5000)])
    expect(r.tronque).toBe(true)
    expect(r.texte).toContain('tronquée')
    expect(r.texte.length).toBeLessThan(BUDGET_PIECES_CHARS + 500)
  })

  test('budget respecté sur plusieurs pièces', () => {
    const r = plafonnerTextePieces([piece('a.pdf', 20000), piece('b.pdf', 20000)])
    expect(r.tronque).toBe(true)
    expect(r.texte).toContain('a.pdf')
  })
})
