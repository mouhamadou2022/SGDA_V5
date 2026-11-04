import { dossierUtils, fusionnerHistorique, ajouterJours } from '../dossierUtils'

describe('dossierUtils.getDelaiRestant (date_limite en type date)', () => {
  const now = new Date(2026, 10, 3, 13, 0, 0) // 3 nov. 2026, 13:00 local

  test('échéance passée → jours de retard en jours calendaires', () => {
    expect(dossierUtils.getDelaiRestant('2026-11-01', now).jours).toBe(-2)
    expect(dossierUtils.getDelaiRestant('2026-11-01', now).couleur).toBe('rouge')
  })

  test('le jour de l’échéance n’est pas encore en retard', () => {
    expect(dossierUtils.getDelaiRestant('2026-11-03', now).jours).toBe(0)
    expect(dossierUtils.getDelaiRestant('2026-11-04', now).jours).toBe(1)
  })

  test('seuils de couleur', () => {
    expect(dossierUtils.getDelaiRestant('2026-11-05', now).couleur).toBe('rouge')
    expect(dossierUtils.getDelaiRestant('2026-11-12', now).couleur).toBe('orange')
    expect(dossierUtils.getDelaiRestant('2026-12-20', now).couleur).toBe('vert')
  })

  test('timestamp complet → calcul horaire conservé', () => {
    expect(dossierUtils.getDelaiRestant('2026-11-03T23:00:00', now).jours).toBe(1)
  })

  test('estUrgent : échéance proche et dossier non terminé', () => {
    const base = { date_limite: '2026-11-01', statut: 'en_attente' } as never
    expect(dossierUtils.estUrgent(base)).toBe(true)
    expect(dossierUtils.estUrgent({ date_limite: '2026-11-01', statut: 'termine' } as never)).toBe(false)
  })
})

describe('fusionnerHistorique', () => {  const a = { date: '2026-11-03T10:00:00.000Z', action: 'Accusé réception' }
  const b = { date: '2026-11-03T11:00:00.000Z', action: 'Progression: 25%' }
  const c = { date: '2026-11-03T12:00:00.000Z', action: 'Progression: 50%' }

  test('appelant qui renvoie tout l’historique → aucun doublon', () => {
    expect(fusionnerHistorique([a, b], [a, b, c])).toEqual([a, b, c])
  })

  test('appelant qui ne passe que les nouvelles entrées', () => {
    expect(fusionnerHistorique([a, b], [c])).toEqual([a, b, c])
  })

  test('aucune nouveauté → tableau inchangé', () => {
    const existants = [a, b]
    expect(fusionnerHistorique(existants, [a, b])).toBe(existants)
    expect(fusionnerHistorique(existants, undefined)).toBe(existants)
  })
})

describe('ajouterJours (prolongation de date_limite)', () => {
  test('date seule → date seule, sans dérive de fuseau', () => {
    expect(ajouterJours('2026-11-01', 7)).toBe('2026-11-08')
    expect(ajouterJours('2026-12-28', 10)).toBe('2027-01-07')
  })

  test('timestamp complet → timestamp ISO', () => {
    expect(ajouterJours('2026-11-01T10:00:00.000Z', 3)).toBe('2026-11-04T10:00:00.000Z')
  })
})
