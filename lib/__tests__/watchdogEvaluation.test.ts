import {
  compterNSsansObservation,
  veillerEvaluationPAC,
  veillerEvaluationPreuves,
  veillerItemSuivi,
  veillerItemPACAction,
  veillerItemStandard,
  veillerSGSElement,
  veillerSGSQuestions,
  recouvrementConstat,
  ressemblance,
} from '../ia/watchdogEvaluation'

const BASE = {
  notes: { pertinence: 4, exhaustivite: 4, precision: 4, specificite: 4, realisme: 4, coherence: 4 },
  decision: 'accepte' as const,
  libelleEcart: 'Fissures longitudinales sur la piste principale',
  domaine: 'PHY',
  niveauRisque: 'moyen',
  actions: [{ description: 'Réparer les fissures longitudinales de la piste', responsable: 'Chef maintenance', date_prevue: '2026-12-31' }],
  antecedents: [],
  maintenant: Date.UTC(2026, 8, 30),
}

describe('veillerEvaluationPreuves', () => {
  const BASE = {
    notes: { completude: 4, qualite: 4, pertinence: 4, tracabilite: 4, efficacite: 4 },
    decision: 'valide' as const, nbPreuves: 2, niveauRisque: 'moyen',
  }
  test('dossier sain : rien', () => {
    expect(veillerEvaluationPreuves(BASE)).toEqual([])
  })
  test('validé sans preuve', () => {
    const a = veillerEvaluationPreuves({ ...BASE, nbPreuves: 0 })
    expect(a.some(x => x.niveau === 'danger')).toBe(true)
  })
  test('indulgence sur critique', () => {
    const a = veillerEvaluationPreuves({
      ...BASE, niveauRisque: 'critique',
      notes: { completude: 2, qualite: 2, pertinence: 2, tracabilite: 2, efficacite: 2 },
    })
    expect(a.some(x => x.titre.includes('Indulgence'))).toBe(true)
  })
})

describe('veillerItemSuivi', () => {
  test('SA complet : rien', () => {
    expect(veillerItemSuivi({
      conclusion: 'SA', commentaire: 'Réparé et vérifié', preuves: [{}],
      statut_mesure: 'realisee', risque_initial: 'moyen', risque_residuel: 'faible',
    })).toEqual([])
  })
  test('SA sans commentaire ni preuve', () => {
    const a = veillerItemSuivi({ conclusion: 'SA', risque_initial: 'moyen', risque_residuel: 'faible' })
    expect(a.length).toBeGreaterThanOrEqual(2)
  })
  test('résiduel non réduit + SA', () => {
    const a = veillerItemSuivi({
      conclusion: 'SA', commentaire: 'ok', preuves: [{}],
      risque_initial: 'eleve', risque_residuel: 'eleve',
    })
    expect(a.some(x => x.titre.includes('non réduit'))).toBe(true)
  })
})

describe('veillerItemPACAction', () => {
  test('SA documenté : rien', () => {
    expect(veillerItemPACAction({
      resultat: 'SA', observation: 'Travaux vérifiés conformes', preuves: [{}],
      efficacite: 85, maintenant: Date.UTC(2026, 8, 30),
    })).toEqual([])
  })
  test('SA sans observation ni preuve + efficacité basse', () => {
    const a = veillerItemPACAction({ resultat: 'SA', efficacite: 30, maintenant: Date.UTC(2026, 8, 30) })
    expect(a.some(x => x.niveau === 'danger')).toBe(true)
  })
  test('échéance dépassée', () => {
    const a = veillerItemPACAction({
      resultat: 'NS', observation: 'Non fait', datePrevue: '2026-01-01',
      maintenant: Date.UTC(2026, 8, 30),
    })
    expect(a.some(x => x.titre.includes('dépassée'))).toBe(true)
  })
})

describe('veillerItemStandard', () => {
  test('NS sans observation', () => {
    const a = veillerItemStandard({ resultat: 'NS', libelle: 'Piste fissurée' })
    expect(a.some(x => x.titre.includes('Non-satisfaisant'))).toBe(true)
  })
  test('SA documenté : rien', () => {
    expect(veillerItemStandard({
      resultat: 'SA', libelle: 'Balise OK', observation: 'Vérifié le 12/03', preuves: [{}],
    })).toEqual([])
  })
  test('NV : pas d’alerte (va aux restants)', () => {
    expect(veillerItemStandard({ resultat: 'NV' })).toEqual([])
  })
})

describe('veillerSGSElement', () => {
  test('N0 : pas d’alerte', () => {
    expect(veillerSGSElement({ niveauGlobal: 'N0', label: 'Politique' })).toEqual([])
  })
  test('N5 sans note', () => {
    const a = veillerSGSElement({ niveauGlobal: 'N5', label: 'Politique' })
    expect(a.some(x => x.titre.includes('sans justification'))).toBe(true)
  })
  test('N1 avec score élevé : incohérence', () => {
    const a = veillerSGSElement({ niveauGlobal: 'N1', label: 'Politique', score: 45 })
    expect(a.some(x => x.niveau === 'warning')).toBe(true)
  })
})

describe('compterNSsansObservation', () => {
  test('NS sans observation comptés (texte ou stylet acceptés)', () => {
    expect(compterNSsansObservation([
      { resultat: 'NS' },
      { resultat: 'NS', observation: 'Fissure vue' },
      { resultat: 'NS', observation_stylus_data: 'base64...' },
      { resultat: 'SA' },
      { resultat: 'NV' },
    ])).toBe(1)
  })
})

describe('veillerSGSQuestions', () => {
  test('questions neuves non touchées = restants', () => {
    const r = veillerSGSQuestions([
      { ref: 'SGS-1.1', texte: 'Politique documentée ?', niveau: 'absent', statutIA: 'nouvelle' },
      { ref: 'SGS-1.2', texte: 'Responsabilités ?', niveau: 'present', justification: 'Organigramme vu' },
    ])
    expect(r.restants).toEqual(['SGS-1.1'])
    expect(r.alertes).toEqual([])
  })
  test('efficace sans justification', () => {
    const r = veillerSGSQuestions([{ ref: 'SGS-2.1', texte: 'X', niveau: 'efficace' }])
    expect(r.restants).toEqual([])
    expect(r.alertes.some(a => a.titre.includes('sans justification'))).toBe(true)
  })
})

describe('recouvrementConstat', () => {
  test('actions en lien : recouvrement haut', () => {
    expect(recouvrementConstat(BASE.libelleEcart, BASE.actions)).toBeGreaterThan(0.5)
  })
  test('hors sujet : recouvrement bas', () => {
    expect(recouvrementConstat(BASE.libelleEcart, [{ description: 'Organiser une fête du personnel' }])).toBeLessThan(0.25)
  })
})

describe('veillerEvaluationPAC', () => {
  test('dossier sain : aucune alerte', () => {
    expect(veillerEvaluationPAC(BASE)).toEqual([])
  })
  test('hors sujet détecté', () => {
    const a = veillerEvaluationPAC({ ...BASE, actions: [{ description: 'Organiser une fête du personnel', responsable: 'X', date_prevue: '2026-12-31' }] })
    expect(a.some(x => x.titre.includes('hors sujet'))).toBe(true)
  })
  test('échéance passée', () => {
    const a = veillerEvaluationPAC({ ...BASE, actions: [{ description: 'Réparer les fissures de la piste', responsable: 'X', date_prevue: '2026-01-01' }] })
    expect(a.some(x => x.titre.includes('dépassée'))).toBe(true)
  })
  test('indulgence sur critique', () => {
    const a = veillerEvaluationPAC({
      ...BASE,
      niveauRisque: 'critique',
      notes: { pertinence: 2, exhaustivite: 2, precision: 2, specificite: 2, realisme: 2, coherence: 2 },
    })
    expect(a.some(x => x.niveau === 'danger' && x.titre.includes('Indulgence'))).toBe(true)
  })
  test('récidive détectée', () => {
    expect(ressemblance('Fissures sur la piste principale', 'Fissures longitudinales sur la piste principale')).toBeGreaterThan(0.5)
    const a = veillerEvaluationPAC({
      ...BASE,
      antecedents: [{ libelle: 'Fissures longitudinales sur la piste', domaine: 'PHY' }],
    })
    expect(a.some(x => x.titre.includes('Récidive'))).toBe(true)
  })
  test('aucun responsable', () => {
    const a = veillerEvaluationPAC({ ...BASE, actions: [{ description: 'Réparer les fissures de la piste', date_prevue: '2026-12-31' }] })
    expect(a.some(x => x.titre.includes('responsable'))).toBe(true)
  })
})
