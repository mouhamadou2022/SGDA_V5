// synthesesDgIA : fallbacks déterministes (test isolé, sans IA).

import {
  fallbackPilotage,
  fallbackConformite,
  fallbackDecisions,
  detailsPilotage,
} from '../ia/synthesesDgIA'

describe('fallbackPilotage', () => {
  test('sites + domaine + événements + PAC, avec chiffres réels', () => {
    const t = fallbackPilotage({
      sitesAlerte: ['GOOO', 'GOBD'],
      nbEcartsCritiques: 2,
      topDomaine: 'PHY',
      topDomaineTotal: 5,
      topDomaineCritiques: 1,
      nbEvenements90j: 3,
      nbPacRetard: 2,
    })
    expect(t).toContain('GOOO')
    expect(t).toContain('PHY')
    expect(t).toContain('5 écarts')
    expect(t).toContain('3 événement')
  })
  test('calme : message nominal', () => {
    const t = fallbackPilotage({
      sitesAlerte: [], nbEcartsCritiques: 0, topDomaine: null,
      topDomaineTotal: 0, topDomaineCritiques: 0, nbEvenements90j: 0, nbPacRetard: 0,
    })
    expect(t).toContain('Aucun site en alerte')
  })
})

describe('detailsPilotage', () => {
  test('lignes par carte avec chiffres réels', () => {
    const d = detailsPilotage('PHY', 5, 1, 3, [{ score: 72 }, { score: null }])
    expect(d.domaines).toContain('PHY')
    expect(d.domaines).toContain('(5 dont 1 critique(s))')
    expect(d.evenements).toContain('3 événement')
    expect(d.scores).toContain('72/100')
  })
  test('vide : messages nominaux', () => {
    const d = detailsPilotage(null, 0, 0, 0, [])
    expect(d.domaines).toContain('Aucun écart ouvert')
    expect(d.evenements).toContain('Aucun événement')
    expect(d.scores).toContain('Aucun score')
  })
})

describe('fallbackConformite', () => {
  test('taux + expirations + sans surveillance', () => {
    const t = fallbackConformite({
      taux: 80, certifies: 6, homologues: 2, total: 10,
      expirations: [{ aerodrome: 'GOOO', type: 'Certification', jours: 12 }],
      sansSurveillance: ['GOBD'],
      planifiees: 3,
    })
    expect(t).toContain('80 %')
    expect(t).toContain('GOOO')
    expect(t).toContain('J-12')
    expect(t).toContain('GOBD')
  })
})

describe('fallbackDecisions', () => {
  test('efficacité + évolution + signatures', () => {
    const t = fallbackDecisions({
      efficacite: 75, fermes: 15, totaux: 20,
      ameliorations: 2, degradations: 1,
      signaturesAttente: 2,
      topAmelioration: 'GOOO', topDegradation: 'GOBD',
    })
    expect(t).toContain('75 %')
    expect(t).toContain('GOOO')
    expect(t).toContain('2 dossier(s)')
  })
})
