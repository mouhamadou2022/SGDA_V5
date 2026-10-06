// lib/__tests__/assistantSalutations.test.ts
// Un salut isolé ne doit jamais déclencher le LLM ni déballer les écarts
// critiques (bug constaté : « bonjour » → pavé sur 2026-GOTT-PERIO-SDT-16).
import { assistantAgent } from '../ia/agents/assistantAgent'

describe('salutations isolées', () => {
  it('« bonjour » seul → réponse brève, sans contexte écarts', async () => {
    const r = await assistantAgent.chat({ message: 'bonjour', userRole: 'inspector' })
    expect(r.message).toMatch(/AERORISQ/)
    expect(r.message).not.toMatch(/écart critique/i)
    expect(r.message).not.toMatch(/ECA-\d/)
    expect(r.actions).toEqual([])
  })

  it('« salut ! » → idem', async () => {
    const r = await assistantAgent.chat({ message: 'salut !', userRole: 'inspector' })
    expect(r.message).toMatch(/AERORISQ/)
  })

  it('« bonjour, détaille … » → PAS un salut (passe au circuit normal)', async () => {
    const r = await assistantAgent.chat({ message: 'bonjour, détaille les écarts critiques', userRole: 'inspector' })
    expect(r.message).not.toContain('Posez votre question en langage naturel')
  })
})

describe('intention PDF (bypass déterministe — le LLM ne doit jamais nier)', () => {
  it('« fais un rapport pdf … » → réponse locale + action generate, sans appel LLM', async () => {
    const r = await assistantAgent.chat({ message: 'fais un rapport pdf détaillé sur Tambacounda', userRole: 'inspector' })
    expect(r.message).toMatch(/Mode action/)
    expect(r.message).not.toMatch(/ne peux pas/i)
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'generate', target: 'report' }),
    ])
  })

  it('« fais un rapport sur X » (sans pdf) → circuit normal, pas le bypass', async () => {
    const r = await assistantAgent.chat({ message: 'fais un rapport sur Tambacounda', userRole: 'inspector' })
    expect(r.message).not.toContain('rebascule en **Mode action**')
  })
})
