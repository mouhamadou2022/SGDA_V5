import { peutInstruire, nomUtilisateur } from '@/components/modules/certification/AssignationInstruction'

describe('peutInstruire', () => {
  test('admin toujours admis', () => {
    expect(peutInstruire({ responsable_id: 'x' }, 'y', 'admin')).toBe(true)
  })
  test('non assigné = ouvert', () => {
    expect(peutInstruire({}, 'insp1', 'inspector')).toBe(true)
  })
  test('assigné = réservé à l’équipe', () => {
    const a = { responsable_id: 'insp1', equipe_ids: ['insp2'], chef_id: 'chef1' }
    expect(peutInstruire(a, 'insp1', 'inspector')).toBe(true)
    expect(peutInstruire(a, 'insp2', 'inspector')).toBe(true)
    expect(peutInstruire(a, 'chef1', 'inspector')).toBe(true)
    expect(peutInstruire(a, 'autre', 'inspector')).toBe(false)
  })
  test('nomUtilisateur', () => {
    expect(nomUtilisateur({ prenom: 'Awa', nom: 'Diallo' })).toBe('Awa Diallo')
    expect(nomUtilisateur(undefined)).toBe('—')
  })
})
