import {
  peutEtreChefInstruction,
  lireInstruction,
  verifierEquipeInstruction,
} from '../instructionHabilitation'

const base = (surcharges: Record<string, unknown> = {}) => ({
  id: 'u1', prenom: 'Awa', nom: 'Diallo', role: 'inspecteur',
  type_inspecteur: 'inspecteur_titulaire', specialites: ['EXPL'], ...surcharges,
}) as Parameters<typeof verifierEquipeInstruction>[0][number]

describe('peutEtreChefInstruction', () => {
  test('titulaire/principal oui, autres non', () => {
    expect(peutEtreChefInstruction({ type_inspecteur: 'inspecteur_titulaire' })).toBe(true)
    expect(peutEtreChefInstruction({ type_inspecteur: 'inspecteur_principal' })).toBe(true)
    expect(peutEtreChefInstruction({ type_inspecteur: 'inspecteur_stagiaire' })).toBe(false)
    expect(peutEtreChefInstruction(undefined)).toBe(false)
  })
})

describe('lireInstruction', () => {
  test('clé partagée prioritaire', () => {
    const lue = lireInstruction({
      instruction: { responsable_id: 'r', equipe_ids: ['e'], chef_id: 'c' },
      phase1: { responsable_id: 'vieux' },
    })
    expect(lue.responsable_id).toBe('r')
    expect(lue.equipe_ids).toEqual(['e'])
  })
  test('repli étape 1 (fusion phase1+phase2)', () => {
    const lue = lireInstruction({
      phase1: { responsable_id: 'r1', equipe_ids: ['e1'] },
      phase2: { chef_id: 'c2', equipe_ids: ['e1', 'e2'] },
    })
    expect(lue).toMatchObject({ responsable_id: 'r1', chef_id: 'c2' })
    expect(lue.equipe_ids?.sort()).toEqual(['e1', 'e2'])
  })
  test('vide', () => {
    expect(lireInstruction(null)).toEqual({})
    expect(lireInstruction({})).toEqual({ responsable_id: undefined, equipe_ids: [], chef_id: undefined, externes: [], assigne_le: undefined, assigne_par: undefined })
  })
})

describe('verifierEquipeInstruction', () => {
  test('équipe saine : rien', () => {
    const v = verifierEquipeInstruction([base()], 'u1', 0)
    expect(v.blocages).toEqual([])
    expect(v.avertissements).toEqual([])
  })
  test('chef non habilité : bloquant', () => {
    const stagiaire = base({ id: 'u2', type_inspecteur: 'inspecteur_stagiaire' })
    const v = verifierEquipeInstruction([base(), stagiaire], 'u2', 0)
    expect(v.blocages.length).toBe(1)
    expect(v.blocages[0]).toContain('titulaires ou principaux')
  })
  test('rôle non inspecteur : bloquant', () => {
    const v = verifierEquipeInstruction([base({ role: 'comptable' })], undefined, 0)
    expect(v.blocages.length).toBe(1)
  })
  test('sans spécialités : avertissement sauf externes', () => {
    const sansSpec = base({ specialites: [] })
    expect(verifierEquipeInstruction([sansSpec], undefined, 0).avertissements.length).toBe(1)
    expect(verifierEquipeInstruction([sansSpec], undefined, 2).avertissements).toEqual([])
  })
})
