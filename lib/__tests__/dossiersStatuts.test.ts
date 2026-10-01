import { STATUTS_DOSSIER, STATUTS_ASSIGNMENT, infoStatutDossier, infoStatutAssignment } from '../dossiersStatuts'

describe('dossiersStatuts (source unique)', () => {
  test('statuts dossier couverts', () => {
    expect(STATUTS_DOSSIER.map(s => s.value).sort()).toEqual(['archive', 'en_attente', 'en_cours', 'termine'].sort())
    expect(infoStatutDossier('en_attente').label).toBe('En attente')
  })
  test('statuts assignment couverts', () => {
    expect(STATUTS_ASSIGNMENT.map(s => s.value).sort()).toEqual(
      ['accuse', 'attribue', 'en_cours', 'en_validation', 'termine', 'valide'].sort(),
    )
    expect(infoStatutAssignment('en_validation').label).toBe('En validation')
  })
  test('repli gracieux', () => {
    expect(infoStatutDossier('zzz').label).toBe('zzz')
  })
})
