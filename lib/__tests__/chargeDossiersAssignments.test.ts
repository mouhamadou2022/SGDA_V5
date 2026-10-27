import { chargeUtils } from '../chargeUtils'
import type { Dossier, DossierAssignment } from '../store'

const future = () => new Date(Date.now() + 10 * 86400000).toISOString()
const past = () => new Date(Date.now() - 2 * 86400000).toISOString()

function assignment(over: Partial<DossierAssignment> = {}): DossierAssignment {
  return {
    id: 'a1',
    inspecteur_id: 'i1',
    inspecteur_nom: 'Inspecteur Un',
    statut: 'attribue',
    progression: 0,
    date_attribution: new Date().toISOString(),
    feedbacks: [],
    collaborateurs: [],
    preuves: [],
    historique: [],
    ...over,
  }
}

function dossier(over: Partial<Dossier> = {}): Dossier {
  return {
    id: 'd1',
    titre: 'Avis technique',
    reference: 'DOS-2026-0001',
    categorie: 'technique',
    service_assigne: 'securite_aerodromes',
    date_instruction: new Date().toISOString(),
    date_limite: future(),
    fichiers: [],
    progression: 0,
    statut: 'en_attente',
    historique: [],
    assignments: [],
    created_by: 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  } as Dossier
}

describe('dossierVersTache : une tâche par assignation', () => {
  test('deux assignations → deux tâches distinctes, chacune pour son inspecteur', () => {
    const d = dossier({
      assignments: [
        assignment({ id: 'a1', inspecteur_id: 'i1', inspecteur_nom: 'Un' }),
        assignment({ id: 'a2', inspecteur_id: 'i2', inspecteur_nom: 'Deux' }),
      ],
    })
    const t1 = chargeUtils.dossierVersTache(d, [], d.assignments[0])
    const t2 = chargeUtils.dossierVersTache(d, [], d.assignments[1])

    expect(t1.id).not.toBe(t2.id)
    expect(t1.lien_id).toBe('i1')
    expect(t2.lien_id).toBe('i2')
    expect(t1.dossier_id).toBe('d1')
    expect(t2.dossier_id).toBe('d1')
    expect(t1.assignment_id).toBe('a1')
    expect(t2.assignment_id).toBe('a2')
  })

  test('retard propre à l\'assignation ; une assignation terminée reste terminée', () => {
    const d = dossier({
      date_limite: past(),
      assignments: [
        assignment({ id: 'a1', statut: 'attribue' }),
        assignment({ id: 'a2', inspecteur_id: 'i2', statut: 'termine', progression: 100 }),
      ],
    })
    expect(chargeUtils.dossierVersTache(d, [], d.assignments[0]).statut).toBe('en_retard')
    expect(chargeUtils.dossierVersTache(d, [], d.assignments[1]).statut).toBe('termine')
  })

  test('assignation en validation = en cours (pas encore validée par l\'admin)', () => {
    const d = dossier({
      assignments: [assignment({ statut: 'en_validation', progression: 100 })],
    })
    expect(chargeUtils.dossierVersTache(d, [], d.assignments[0]).statut).toBe('en_cours')
  })

  test('sans assignation (legacy) : repli sur inspecteur_id et statut du dossier', () => {
    const d = dossier({ inspecteur_id: 'i9', statut: 'en_cours' })
    const t = chargeUtils.dossierVersTache(d, [])
    expect(t.lien_id).toBe('i9')
    expect(t.assignment_id).toBeUndefined()
    expect(t.statut).toBe('en_cours')
  })
})
