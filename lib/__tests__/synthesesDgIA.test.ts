// synthesesDgIA : fallbacks déterministes (test isolé, sans IA).

import {
  fallbackPilotage,
  fallbackConformite,
  fallbackDecisions,
  detailsPilotage,
  explicationSiteAlerte,
  explicationScoresMaturite,
  resumeExpirations,
  resumeSansSurveillance,
  resumeEvolution,
  resumeEfficacite,
  explicationTrajectoire,
  ecartTypeScores,
  calculerFourchette,
  etatProcessus,
  resumeProcessus,
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
    const d = detailsPilotage('PHY', 5, 1, 3, [{ score: 72 }, { score: null }], 2)
    expect(d.domaines).toContain('2 écart(s) critique(s)')
    expect(d.domaines).toContain('PHY')
    expect(d.evenements).toContain('3 événement')
    expect(d.scores).toContain('72/100')
    expect(d.nbEcartsCritiques).toBe(2)
  })
  test('vide : messages nominaux', () => {
    const d = detailsPilotage(null, 0, 0, 0, [], 0)
    expect(d.domaines).toContain('Aucun écart critique ouvert')
    expect(d.evenements).toContain('Aucun événement')
    expect(d.scores).toContain('Aucun score')
  })
})

describe('explicationSiteAlerte', () => {
  const site = {
    code: 'GOOO', nom: 'Dakar', niveau: 'critique', score: 25, tendance: 'baisse',
    c1: 30, statutSgs: 'complet', prediction3m: 30, prediction6m: 28,
    ecritsCritiques: 2, ecritsEleves: 1, pacRetard: 1, preuvesRetard: 0,
    eventsCritiques: 1, motif: 'profil critique',
  }
  test('pourquoi + action urgente', () => {
    const e = explicationSiteAlerte(site, 'N2 Présent')
    expect(e.pourquoi).toContain('profil critique')
    expect(e.pourquoi).toContain('N2 Présent')
    expect(e.pourquoi).toContain('28/100')
    expect(e.action).toContain('urgente')
  })
  test('sans urgence : relance ou maintien', () => {
    const e = explicationSiteAlerte({ ...site, niveau: 'eleve', ecritsCritiques: 0, pacRetard: 2 }, 'N4')
    expect(e.action).toContain('relancer')
    const calme = explicationSiteAlerte(
      { ...site, niveau: 'eleve', ecritsCritiques: 0, pacRetard: 0, preuvesRetard: 0, eventsCritiques: 0 }, 'N4')
    expect(calme.action).toContain('maintenir')
  })
})

describe('explicationScoresMaturite', () => {
  test('dernier score + alerte SGS faible', () => {
    const t = explicationScoresMaturite([
      { score: 72, maturite: 'N2 Présent' },
      { score: 80, maturite: 'N4 Opérationnel' },
    ])
    expect(t).toContain('72/100')
    expect(t).toContain('N1-N2')
  })
  test('vide', () => {
    expect(explicationScoresMaturite([])).toContain('Aucun score')
  })
})

describe('lignes par carte', () => {
  test('expirations : plus urgent cité', () => {
    expect(resumeExpirations([{ aerodrome: 'GOOO', jours: 12 }])).toContain('GOOO')
    expect(resumeExpirations([{ aerodrome: 'GOOO', jours: 12 }])).toContain('J-12')
    expect(resumeExpirations([])).toContain('Aucune expiration')
  })
  test('sans surveillance : jamais comptés', () => {
    expect(resumeSansSurveillance([{ code: 'GOBD', joursDepuis: null }])).toContain('jamais')
    expect(resumeSansSurveillance([])).toContain('Tous les sites')
  })
  test('sans surveillance : couverture planifiée déduite', () => {
    const t = resumeSansSurveillance([
      { code: 'GOOO', joursDepuis: 400, couvert: 12 },
      { code: 'GOBD', joursDepuis: null, couvert: null },
    ])
    expect(t).toContain('1 déjà couvert')
    expect(t).toContain('1 à planifier')
  })
  test('trajectoire site : sens, maturité, projections', () => {
    const t = explicationTrajectoire({
      evolution: -8, scoreActuel: 35, maturite: 'N2 Présent', maturiteInitiale: 'N3 Approprié',
      pred3m: 32, pred6m: 30, nbSurveillances: 3,
    })
    expect(t).toContain('dégradation')
    expect(t).toContain('N3 Approprié à N2 Présent')
    expect(t).toContain('30/100')
    expect(t).toContain('priorité')
    const stable = explicationTrajectoire({
      evolution: 0, scoreActuel: 75, maturite: 'N4 Opérationnel', maturiteInitiale: 'N4 Opérationnel',
      pred3m: null, pred6m: null, nbSurveillances: 2,
    })
    expect(stable).toContain('stable')
    expect(stable).not.toContain('passée de')
  })
  test('fourchette : centrale + bande bornée 0-100', () => {
    expect(ecartTypeScores([70])).toBe(5)
    expect(ecartTypeScores([60, 70, 80])).toBeGreaterThan(5)
    const f = calculerFourchette(90, 15)
    expect(f).toEqual({ centrale: 90, optimiste: 100, pessimiste: 75 })
    expect(calculerFourchette(null, 5)).toEqual({ centrale: null, optimiste: null, pessimiste: null })
    const basse = calculerFourchette(5, 10)
    expect(basse.pessimiste).toBe(0)
  })
  test('évolution et efficacité', () => {
    expect(resumeEvolution(2, 1, 'GOOO', 'GOBD')).toContain('GOOO')
    expect(resumeEvolution(0, 0, null, null)).toContain('Pas assez de recul')
    expect(resumeEfficacite(75, 15, 20)).toContain('75 %')
    expect(resumeEfficacite(0, 0, 0)).toContain('Aucun écart')
  })
})

describe('processus en cours', () => {
  const T0 = Date.UTC(2026, 5, 1)
  test('avis défavorable → bloqué', () => {
    const e = etatProcessus({ phase2: { statut: 'a_reviser', date_reception: '2026-04-01' } }, 2, T0)
    expect(e).toMatchObject({ statut: 'bloque', phase: 2 })
  })
  test('en attente > 30j → attente prolongée', () => {
    const e = etatProcessus({ phase1: { statut: 'en_attente', date_reception: '2026-01-01' } }, 1, T0)
    expect(e.statut).toBe('attente')
  })
  test('nominal → en cours', () => {
    expect(etatProcessus({ phase1: { statut: 'en_cours' } }, 1, T0).statut).toBe('en_cours')
    expect(resumeProcessus([])).toContain('Aucun processus')
    expect(resumeProcessus([{ statut: 'bloque' }, { statut: 'en_cours' }])).toContain('bloqué')
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
