// lib/__tests__/competencesReparation.test.ts
// Verrouille la correction du bug d'affichage JSON brut
// ('{"domaine":"COP","niveau":3}') sur les cartes inspecteurs.
import {
  normaliserDomaineCompetence,
  normaliserNiveauCompetence,
  reparerCompetence,
  declarativesVersCompetences,
} from '../store/formationsSlice'

describe('normaliserDomaineCompetence', () => {
  it('conserve un code brut', () => {
    expect(normaliserDomaineCompetence('COP')).toBe('COP')
  })
  it('déballe un domaine sérialisé en JSON', () => {
    expect(normaliserDomaineCompetence('{"domaine":"COP","niveau":3}')).toBe('COP')
  })
  it('déballe un objet imbriqué', () => {
    expect(normaliserDomaineCompetence({ domaine: 'SGS' })).toBe('SGS')
  })
  it('retourne vide si inexploitable', () => {
    expect(normaliserDomaineCompetence('')).toBe('')
    expect(normaliserDomaineCompetence(null)).toBe('')
    expect(normaliserDomaineCompetence({})).toBe('')
  })
})

describe('normaliserNiveauCompetence', () => {
  it('borne les nombres sur 1-5', () => {
    expect(normaliserNiveauCompetence(3)).toBe(3)
    expect(normaliserNiveauCompetence(9)).toBe(5)
  })
  it('convertit les niveaux textuels', () => {
    expect(normaliserNiveauCompetence('expert')).toBe(3)
    expect(normaliserNiveauCompetence('4')).toBe(4)
  })
})

describe('reparerCompetence', () => {
  it('répare une entrée JSON stringifiée', () => {
    const c = reparerCompetence('{"domaine":"COP","niveau":3}', 'insp-1')
    expect(c).toMatchObject({ inspecteur_id: 'insp-1', domaine: 'COP', niveau: 3 })
  })
  it('écarte une entrée inexploitable', () => {
    expect(reparerCompetence({ niveau: 2 }, 'insp-1')).toBeNull()
    expect(reparerCompetence('nimporte quoi', 'insp-1')).toBeNull()
  })
})

describe('declarativesVersCompetences', () => {
  it('filtre les entrées sales au lieu de les afficher en JSON brut', () => {
    const res = declarativesVersCompetences('insp-1', [
      { domaine: '{"domaine":"COP","niveau":3}', niveau: 3 },
      { domaine: '', niveau: 1 },
    ] as any)
    expect(res).toHaveLength(1)
    expect(res[0].domaine).toBe('COP')
  })
})
