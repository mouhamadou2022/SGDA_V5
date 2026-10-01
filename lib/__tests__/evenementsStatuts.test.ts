import { STATUTS_EVENEMENT, infoStatutEvenement, labelStatutEvenement } from '../evenementsStatuts'

describe('evenementsStatuts (source unique)', () => {
  test('12 statuts du workflow, uniques', () => {
    expect(STATUTS_EVENEMENT).toHaveLength(12)
    const values = STATUTS_EVENEMENT.map(s => s.value)
    expect(new Set(values).size).toBe(12)
    for (const v of ['recu', 'assigne', 'accepte', 'refuse', 'attente_operateur', 'en_cours', 'analyse', 'ecart_cree', 'rapport_redige', 'soumis_validation', 'retourne', 'cloture']) {
      expect(values).toContain(v)
    }
  })
  test('repli gracieux sur code inconnu', () => {
    expect(labelStatutEvenement('assigne')).toBe('Assigné')
    expect(infoStatutEvenement('inconnu')).toMatchObject({ label: 'inconnu', className: 'badge neutral' })
  })
})
