// teamOptimizer : composition par portée + exigences risque (test isolé).

import { teamOptimizer } from '../ia/engines/teamOptimizer'

const insp = (id: string, competences: Array<{ domaine: string; niveau: string }>, type: string) => ({
  id, nom: 'N', prenom: 'P', role: 'inspector', statut: 'en_service',
  competences, type_inspecteur: type,
})

describe('teamOptimizer.proposer', () => {
  const users = [
    insp('u1', [{ domaine: 'securite', niveau: 'expert' }], 'inspecteur_titulaire'),
    insp('u2', [{ domaine: 'securite', niveau: 'debutant' }], 'inspecteur_titulaire'),
    insp('u3', [{ domaine: 'autre', niveau: 'expert' }], 'inspecteur_titulaire'),
  ] as never

  test('sans exigences : comportement historique (score, chef, taille)', () => {
    const r = teamOptimizer.proposer(users, [], ['SGS'], [])
    expect(r.inspecteurs.length).toBeGreaterThan(0)
    expect(r.chefPropose).toBeTruthy()
    // Expert SGS devant débutant SGS
    expect(r.inspecteurs[0].id).toBe('u1')
  })

  test('niveauMin filtre les niveaux insuffisants', () => {
    const r = teamOptimizer.proposer(users, [], ['SGS'], [], { niveauMin: 'confirme' })
    expect(r.inspecteurs.map(i => i.id)).not.toContain('u2')
    expect(r.inspecteurs.map(i => i.id)).toContain('u1')
  })

  test('tailleMin élargit l’équipe', () => {
    const r = teamOptimizer.proposer(users, [], ['SGS'], [], { tailleMin: 3 })
    expect(r.inspecteurs.length).toBe(3)
  })
})
