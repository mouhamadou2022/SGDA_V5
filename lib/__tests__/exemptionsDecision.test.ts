import { construireDecisionExemption } from '../store/exemptionsSlice'

describe('construireDecisionExemption', () => {
  const NOW = '2026-09-30T12:00:00.000Z'
  test('favorable → active/acceptee + traçabilité', () => {
    const p = construireDecisionExemption('favorable', { commentaires: 'OK' }, NOW, 'u1')
    expect(p).toMatchObject({
      avis_final: 'favorable', statut: 'active', decision: 'acceptee',
      date_decision: NOW, valide_par: 'u1', transmis_exploitant_le: NOW,
    })
  })
  test('a_reviser → sans statut, sans décision', () => {
    const p = construireDecisionExemption('a_reviser', undefined, NOW, 'u1')
    expect(p).toMatchObject({ avis_final: 'a_reviser', workflow_statut: 'a_reviser' })
    expect(p).not.toHaveProperty('statut')
    expect(p).not.toHaveProperty('decision')
  })
  test('defavorable → cloturee/refusee', () => {
    const p = construireDecisionExemption('defavorable', undefined, NOW, 'u1')
    expect(p).toMatchObject({
      avis_final: 'defavorable', statut: 'cloturee', decision: 'refusee',
      valide_par: 'u1', transmis_exploitant_le: NOW,
    })
  })
})
