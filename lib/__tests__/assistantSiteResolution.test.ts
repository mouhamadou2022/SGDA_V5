// lib/__tests__/assistantSiteResolution.test.ts
// Verrouille la résolution du site nommé dans les questions à AERORISQ
// (bug : « Aéroport International Blaise Diagne » → aucune donnée).
import { resoudreSiteNomme, normaliserNomSite, initialesNomSite } from '../ia/agents/assistantAgent'

// Vrais codes : Blaise Diagne = GOBD, LSS militaire = GOOY.
const AERODROMES = [
  { id: 'a1', code_oaci: 'GOBD', nom: 'Aéroport International Blaise Diagne' },
  { id: 'a2', code_oaci: 'GOOY', nom: 'Aéroport Militaire Léopold Sédar Senghor' },
  { id: 'a3', code_oaci: 'GOTT', nom: 'Aéroport de Tambacounda' },
]

describe('normaliserNomSite', () => {
  it('insensible accents/casse/apostrophes', () => {
    expect(normaliserNomSite('Aéroport')).toBe('aeroport')
    expect(normaliserNomSite("l'AIBD")).toBe('l aibd')
  })
})

describe('initialesNomSite', () => {
  it('calcule les initiales (AIBD générique, rien en dur)', () => {
    expect(initialesNomSite('Aéroport International Blaise Diagne')).toBe('aibd')
  })
})

describe('resoudreSiteNomme', () => {
  it('résout le nom complet accentué (cas AIBD du bug → GOBD)', () => {
    expect(resoudreSiteNomme("donne moi des informations sur l'aéroport international blaise diagne", AERODROMES)?.id).toBe('a1')
  })
  it('résout le code OACI exact', () => {
    expect(resoudreSiteNomme('écarts de GOOY ?', AERODROMES)?.id).toBe('a2')
  })
  it("résout l'acronyme via les initiales (sans alias en dur)", () => {
    expect(resoudreSiteNomme("situation de l'AIBD", AERODROMES)?.id).toBe('a1')
  })
  it('résout un mot significatif (repli)', () => {
    expect(resoudreSiteNomme('rapport Tambacounda', AERODROMES)?.id).toBe('a3')
  })
  it('retourne undefined si aucun site cité', () => {
    expect(resoudreSiteNomme('comment créer un planning ?', AERODROMES)).toBeUndefined()
    expect(resoudreSiteNomme('GOOY ?', [])).toBeUndefined()
  })
})
