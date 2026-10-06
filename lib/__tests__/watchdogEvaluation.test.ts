import {
  compterNSsansObservation,
  veillerEvaluationPAC,
  veillerEvaluationPreuves,
  veillerItemSuivi,
  veillerItemPACAction,
  veillerItemStandard,
  veillerSGSElement,
  veillerSGSQuestions,
  veillerSoumissionPAC,
  veillerEvenement,
  veillerRedactionEcart,
  veillerCoherenceChecklist,
  veillerQuestionsChecklist,
  controlerDirectivesItems,
  formulerConsigneRetouches,
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

describe('veillerSoumissionPAC', () => {
  const SOUMISSION = {
    libelleEcart: 'Fissures longitudinales sur la piste principale',
    domaine: 'PHY',
    niveauRisque: 'eleve',
    actions: [
      { description: 'Réparer les fissures longitudinales de la piste principale', responsable: 'Chef maintenance', date_prevue: '2026-11-30' },
      { description: 'Contrôler la piste après réparation et prévenir la récidive', responsable: 'Chef maintenance', date_prevue: '2026-12-15' },
    ],
  }
  test('plan sain : aucune alerte', () => {
    expect(veillerSoumissionPAC(SOUMISSION)).toEqual([])
  })
  test('vide : aucune alerte (validation dure du formulaire)', () => {
    expect(veillerSoumissionPAC({ ...SOUMISSION, actions: [] })).toEqual([])
    expect(veillerSoumissionPAC({ ...SOUMISSION, actions: [{ description: '   ' }] })).toEqual([])
  })
  test('hors sujet détecté', () => {
    const a = veillerSoumissionPAC({ ...SOUMISSION, actions: [{ description: 'Organiser une fête du personnel pour motiver les équipes', responsable: 'X', date_prevue: '2026-12-31' }] })
    expect(a.some(x => x.titre.includes('hors sujet'))).toBe(true)
  })
  test('famélique sur élevé', () => {
    const a = veillerSoumissionPAC({ ...SOUMISSION, actions: [SOUMISSION.actions[0]] })
    expect(a.some(x => x.titre.includes('Une seule action'))).toBe(true)
  })
  test('vague détecté', () => {
    const a = veillerSoumissionPAC({ ...SOUMISSION, actions: [{ description: 'Réparer la piste', responsable: 'X', date_prevue: '2026-12-31' }] })
    expect(a.some(x => x.titre.includes('vague'))).toBe(true)
  })
})

describe('veillerEvenement', () => {
  const EVT = {
    type: 'Incursion piste',
    gravite: 'eleve',
    description: 'Un véhicule de service a traversé la piste 01 sans autorisation pendant le roulage du vol HC301',
    actions_immediates: 'Piste fermée 20 minutes, véhicule intercepté, briefing du chauffeur',
    services_alertes: ['Gendarmerie'],
    blesses_mortels: 0,
    blesses_graves: 0,
    dommages_desc: '',
    date: '2026-09-20',
    recents: [],
    maintenant: Date.UTC(2026, 8, 30),
  }
  test('événement sain : aucune alerte', () => {
    expect(veillerEvenement(EVT)).toEqual([])
  })
  test('gravité sous-évaluée avec victimes', () => {
    const a = veillerEvenement({ ...EVT, gravite: 'moyen', blesses_graves: 2 })
    expect(a.some(x => x.niveau === 'danger' && x.titre.includes('sous-évaluée'))).toBe(true)
  })
  test('grave sans services alertés', () => {
    const a = veillerEvenement({ ...EVT, gravite: 'critique', services_alertes: [] })
    expect(a.some(x => x.titre.includes('Aucun service'))).toBe(true)
  })
  test('actions immédiates vagues sur grave', () => {
    const a = veillerEvenement({ ...EVT, actions_immediates: 'On a géré' })
    expect(a.some(x => x.titre.includes('vagues'))).toBe(true)
  })
  test('doublon probable (30 j, même site)', () => {
    const proche = 'Un véhicule de service a traversé la piste sans autorisation pendant le roulage';
    const a = veillerEvenement({
      ...EVT,
      recents: [{ type: 'Incursion piste', description: proche, date: '2026-09-10' }],
    })
    expect(a.some(x => x.titre.includes('Doublon'))).toBe(true)
    const vieux = veillerEvenement({
      ...EVT,
      recents: [{ type: 'Incursion piste', description: proche, date: '2026-01-01' }],
    })
    expect(vieux.some(x => x.titre.includes('Doublon'))).toBe(false)
  })
})

describe('veillerRedactionEcart', () => {
  test('vide : aucune alerte', () => {
    expect(veillerRedactionEcart({ libelle: '   ', niveau: 'moyen' })).toEqual([])
  })
  test('brouillon sain : aucune alerte', () => {
    expect(veillerRedactionEcart({
      libelle: 'Fissures longitudinales sur la piste principale',
      ref_reglementaire: 'RAS 14 §3.1',
      niveau: 'eleve',
      cellule_oaci: '3A',
      delai_pac_jours: 7,
    })).toEqual([])
  })
  test('sans référence → warning', () => {
    const a = veillerRedactionEcart({ libelle: 'Fissures sur la piste', niveau: 'moyen' })
    expect(a.some(x => x.titre.includes('référence'))).toBe(true)
  })
  test('cellule incohérente avec niveau → danger (hors SGS)', () => {
    const a = veillerRedactionEcart({ libelle: 'Fissures sur la piste', ref_reglementaire: 'RAS 14', niveau: 'faible', cellule_oaci: '5A' })
    expect(a.some(x => x.niveau === 'danger' && x.titre.includes('incohérents'))).toBe(true)
    const sgs = veillerRedactionEcart({ libelle: 'Manuel SGS incomplet', ref_reglementaire: 'RAS 19', niveau: 'moyen', cellule_oaci: '5A', isSGS: true })
    expect(sgs.some(x => x.titre.includes('incohérents'))).toBe(false)
  })
  test('délai incohérent avec le niveau → warning', () => {
    const a = veillerRedactionEcart({ libelle: 'Fissures sur la piste', ref_reglementaire: 'RAS 14', niveau: 'critique', delai_pac_jours: 30 })
    expect(a.some(x => x.titre.includes('Délai PAC incohérent'))).toBe(true)
  })
})

describe('veillerCoherenceChecklist', () => {
  const ITEM = (over: Record<string, unknown> = {}) => ({
    id: `i-${Math.random().toString(36).slice(2, 7)}`,
    ref: 'RAS 14 §3.1',
    texte: 'État de la piste',
    resultat: 'SA',
    evalue: true,
    observation: 'Piste en bon état, marquage lisible',
    directives: ['Vérifier les fissures'],
    ...over,
  })
  test('checklist saine : aucune alerte, jauge à 0', () => {
    const b = veillerCoherenceChecklist({
      items: [ITEM(), ITEM({ ref: 'RAS 14 §3.2', texte: 'Balisage lumineux' })],
      niveauRisqueSite: 'moyen',
    })
    expect(b.alertes).toEqual([])
    expect(b.tauxSansObservation).toBe(0)
    expect(b.nbEvalues).toBe(2)
  })
  test('contradiction même référence SA/NS', () => {
    const b = veillerCoherenceChecklist({
      items: [ITEM(), ITEM({ resultat: 'NS', observation: 'Fissure de 3 m relevée' })],
      niveauRisqueSite: 'moyen',
    })
    expect(b.alertes.some(x => x.titre.includes('contradictoire'))).toBe(true)
  })
  test('tout-SA suspect sur site critique', () => {
    const b = veillerCoherenceChecklist({
      items: [ITEM(), ITEM({ ref: 'RAS 14 §3.2' }), ITEM({ ref: 'RAS 14 §3.3' })],
      niveauRisqueSite: 'critique',
    })
    expect(b.alertes.some(x => x.titre.includes('Aucune non-conformité'))).toBe(true)
    const calme = veillerCoherenceChecklist({ items: [ITEM()], niveauRisqueSite: 'faible' })
    expect(calme.alertes.some(x => x.titre.includes('Aucune non-conformité'))).toBe(false)
  })
  test('copier-coller détecté (≥3 items, ≥15 car.)', () => {
    const items = [1, 2, 3].map(n => ITEM({ ref: `RAS 14 §3.${n}`, observation: 'Constat identique relevé sur le terrain ce jour' }))
    const b = veillerCoherenceChecklist({ items, niveauRisqueSite: 'moyen' })
    expect(b.alertes.some(x => x.titre.includes('dupliquée'))).toBe(true)
  })
  test('NS sans référence + évalué sans énoncé', () => {
    const b = veillerCoherenceChecklist({
      items: [
        ITEM({ resultat: 'NS', ref: '', observation: 'Fissure relevée' }),
        ITEM({ ref: 'RAS 14 §3.9', texte: '', directives: [] }),
      ],
      niveauRisqueSite: 'moyen',
    })
    expect(b.alertes.some(x => x.titre.includes('sans référence'))).toBe(true)
    expect(b.alertes.some(x => x.titre.includes('sans énoncé'))).toBe(true)
  })
  test('jauge : % évalués sans observation', () => {
    const b = veillerCoherenceChecklist({
      items: [ITEM(), ITEM({ ref: 'RAS 14 §3.2', observation: '' })],
      niveauRisqueSite: 'moyen',
    })
    expect(b.tauxSansObservation).toBe(50)
  })
})

describe('veillerQuestionsChecklist', () => {
  const Q = (over: Record<string, unknown> = {}) => ({
    id: `q-${Math.random().toString(36).slice(2, 7)}`,
    ref: 'RAS 14 I \u00A73.1.2',
    texte: 'La longueur de piste d\u00E9clar\u00E9e est-elle conforme aux performances des avions critiques ?',
    ...over,
  })
  test('checklist saine : rien', () => {
    const a = veillerQuestionsChecklist([
      Q(),
      Q({ ref: 'RAS 14 I \u00A79.2.1', texte: 'Le balisage lumineux est-il maintenu en \u00E9tat de fonctionnement permanent ?' }),
    ])
    expect(a).toEqual([])
  })
  test('doublon intra + inter-domaines (seuil 0.7)', () => {
    const a = veillerQuestionsChecklist([
      Q(),
      Q({ ref: 'RAS 14 I \u00A73.1.3', texte: 'La longueur de piste d\u00E9clar\u00E9e est-elle conforme aux performances des avions ?' }),
      Q({ ref: 'DOC 9157', texte: 'Les extincteurs du hangar sont-ils v\u00E9rifi\u00E9s ?' }),
    ])
    expect(a.some(x => x.titre.includes('double'))).toBe(true)
    expect(a.filter(x => x.titre.includes('double')).length).toBe(1)
  })
  test('sans r\u00E9f\u00E9rence + \u00E9nonc\u00E9 vague', () => {
    const a = veillerQuestionsChecklist([
      Q({ ref: '' }),
      Q({ ref: 'RAS 14 I \u00A79.9', texte: 'OK ?' }),
    ])
    expect(a.some(x => x.titre.includes('sans r\u00E9f\u00E9rence'))).toBe(true)
    expect(a.some(x => x.titre.includes('vague'))).toBe(true)
  })
  test('vide : rien', () => {
    expect(veillerQuestionsChecklist([])).toEqual([])
  })
})

describe('controlerDirectivesItems', () => {
  test('directives saines : rien', () => {
    expect(controlerDirectivesItems([
      { numero: '01', directive_sa: 'Tout est conforme au plan approuv\u00E9', directive_ns: 'Au moins un panneau est manquant' },
    ])).toEqual([])
  })
  test('vide ou identiques signal\u00E9s', () => {
    const a = controlerDirectivesItems([
      { numero: '01', directive_sa: '', directive_ns: 'Panneau manquant' },
      { numero: '02', directive_sa: 'Conforme au plan', directive_ns: 'Conforme au plan' },
    ])
    expect(a.some(x => x.titre.includes('incompl\u00E8tes'))).toBe(true)
    expect(a.some(x => x.titre.includes('identiques'))).toBe(true)
  })
})

describe('formulerConsigneRetouches', () => {
  test('vide : consigne vide', () => {
    expect(formulerConsigneRetouches([])).toBe('')
  })
  test('top champs cit\u00E9s avec libell\u00E9s lisibles', () => {
    const c = formulerConsigneRetouches([
      { field: 'directive_ns', count: 12 },
      { field: 'point_verification', count: 5 },
    ])
    expect(c).toContain('Non Satisfaisant')
    expect(c).toContain('12\u00D7')
    expect(c).toContain('formulation des questions')
  })
})
