import { prioriteDossier, estDossierBloque, prioritePlanning, prioriteSurveillance, prioriteEvenement, prioriteDossierItem, prioriteEnquete } from '../processusTri'

describe('processusTri', () => {
  test('ordre : bloqué > attente > cours > non démarré > terminé', () => {
    const bloque = { statut_global: 'en_cours', phase_active: 1, phases_data: { phase1: { statut: 'a_reviser' } } }
    const attente = { statut_global: 'en_cours', phase_active: 1, phases_data: { phase1: { statut: 'en_attente', date_reception: '2026-01-01' } } }
    const cours = { statut_global: 'en_cours', phase_active: 2, phases_data: { phase2: { statut: 'en_cours' } } }
    expect(prioriteDossier(bloque)).toBeLessThan(prioriteDossier(attente))
    expect(prioriteDossier(attente)).toBeLessThan(prioriteDossier(cours))
    expect(prioriteDossier(cours)).toBeLessThan(prioriteDossier(null))
    expect(prioriteDossier(null)).toBeLessThan(prioriteDossier({ statut_global: 'certifie' }))
  })
  test('planning : retard > cours > planifiee > realisee > annulee', () => {
    const ordre = [
      prioritePlanning({ statut: 'planifiee', estRetard: true }),
      prioritePlanning({ statut: 'en_cours' }),
      prioritePlanning({ statut: 'planifiee' }),
      prioritePlanning({ statut: 'realisee' }),
      prioritePlanning({ statut: 'annulee' }),
    ]
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre)
  })
  test('surveillance : cours > planifiee > transmise > archivee', () => {
    expect(prioriteSurveillance({ statut: 'en_cours' })).toBeLessThan(prioriteSurveillance({ statut: 'planifiee' }))
    expect(prioriteSurveillance({ statut: 'planifiee' })).toBeLessThan(prioriteSurveillance({ statut: 'transmise' }))
    expect(prioriteSurveillance({ statut: 'transmise' })).toBeLessThan(prioriteSurveillance({ statut: 'archivee' }))
  })
  test('événement : critiques ouverts > clôturés', () => {
    expect(prioriteEvenement({ statut: 'recu', gravite: 'critique' })).toBeLessThan(prioriteEvenement({ statut: 'recu', gravite: 'faible' }))
    expect(prioriteEvenement({ statut: 'recu', gravite: 'faible' })).toBeLessThan(prioriteEvenement({ statut: 'cloture' }))
  })
  test('dossier : retard > cours > attente > terminé', () => {
    const ordre = [
      prioriteDossierItem({ statut: 'en_cours', joursRestants: -2 }),
      prioriteDossierItem({ statut: 'en_cours', joursRestants: 10 }),
      prioriteDossierItem({ statut: 'en_attente', joursRestants: 10 }),
      prioriteDossierItem({ statut: 'termine' }),
    ]
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre)
  })
  test('enquête : active > brouillon > terminee', () => {
    expect(prioriteEnquete({ statut: 'active' })).toBeLessThan(prioriteEnquete({ statut: 'brouillon' }))
    expect(prioriteEnquete({ statut: 'brouillon' })).toBeLessThan(prioriteEnquete({ statut: 'terminee' }))
  })
  test('estDossierBloque', () => {
    expect(estDossierBloque({ statut_global: 'en_cours', phase_active: 1, phases_data: { phase1: { statut: 'defavorable' } } })).toBe(true)
    expect(estDossierBloque({ statut_global: 'en_cours', phase_active: 1, phases_data: { phase1: { statut: 'en_cours' } } })).toBe(false)
    expect(estDossierBloque(null)).toBe(false)
  })
})
