// lib/__tests__/simulationSurveillance.test.ts
// Tests du moteur de simulation de surveillance AERORISQ : construction de la
// checklist simulée depuis le Kit Inspecteur, prédictions SA/NS/NA/NV à partir
// des données réelles, écarts proposés, statistiques et rapport PDF.

import type { Aerodrome, Ecart, ProfilRisque, KitChecklistItemGenere } from '@/lib/store'
import {
  simulerSurveillance,
  construireRapportSimulation,
  type SimulationSurveillanceParams,
} from '@/lib/ia/simulationSurveillance'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'GOSS',
    score_global: 62,
    niveau: 'moyen',
    c1: 55, c2: 60, c3: 68, c4: 50, c5: 70,
    prediction_3m: 60,
    prediction_6m: 58,
    tendance: 'stable',
    computed_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeEcart(overrides: Partial<Ecart> = {}): Ecart {
  return {
    id: 'ec-1', aerodrome_id: 'GOSS', statut: 'ouvert',
    niveau_risque: 'moyen', domaine: 'SGS',
    reference: 'EC-1', ref_reglementaire: 'RAS 14 I §1',
    libelle: 'Écart SGS', date_detection: new Date().toISOString(),
    delai_pac: '', delai_regularisation: '', inspecteur_ref_id: 'u1',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  } as Ecart
}

function makeKitItem(overrides: Partial<KitChecklistItemGenere> = {}): KitChecklistItemGenere {
  return {
    id: 'k1', numero: 'QSC-01',
    reference_reglementaire: 'RAS 14 I §1.1',
    point_verification: 'Le manuel SGS est-il à jour ?',
    directive_preuve: '1. Demander le document\n2. Vérifier la date',
    domaine: 'SGS',
    sous_domaine: 'Politique',
    type_entite_cible: 'tous',
    source_document_id: 'doc-1',
    ...overrides,
  }
}

function makeParams(overrides: Partial<SimulationSurveillanceParams> = {}): SimulationSurveillanceParams {
  const aerodrome: Aerodrome = {
    id: 'GOSS', code_oaci: 'GOSS', nom: 'Dakar', type: 'international',
    type_entite: 'aerodrome', categorie_sslia: '', region: '',
    maturite_sgs: 60, statut: 'actif', lat: 14.7, lon: -17.4, altitude: 24,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  return {
    aerodrome,
    profil: makeProfil(),
    ecartsReels: [],
    evenementsReels: 2,
    historique: [{ date: '2026-01-01', score: 64 }, { date: '2026-02-01', score: 62 }],
    kitItems: [
      makeKitItem(),
      makeKitItem({ id: 'k2', numero: 'QSC-02', domaine: 'SLI', point_verification: 'Le SSLIA respecte-t-il les délais ?' }),
      makeKitItem({ id: 'k3', numero: 'QSC-03', domaine: 'SLI', point_verification: 'Les véhicules sont-ils conformes ?' }),
    ],
    typeSurveillance: 'periodique',
    portee: ['AGA'],
    typeEntite: 'aerodrome',
    utilisateurs: [{ id: 'u1', prenom: 'Jean', nom: 'Dupont' }],
    ...overrides,
  }
}

describe('simulerSurveillance', () => {
  test('produit une checklist avec le bon nombre d\'items issus du Kit', () => {
    const r = simulerSurveillance(makeParams())
    expect(r.items).toHaveLength(3)
    expect(r.items.every(i => i.source === 'kit')).toBe(true)
  })

  test('filtre la portée quand elle est restreinte', () => {
    const r = simulerSurveillance(makeParams({ portee: ['SLI'] }))
    expect(r.items).toHaveLength(2)
    expect(r.items.every(i => i.domaine === 'SLI')).toBe(true)
  })

  test('prédit NS sur un domaine avec écart critique ouvert', () => {
    const r = simulerSurveillance(makeParams({
      ecartsReels: [makeEcart({ id: 'ec-c', domaine: 'SGS', niveau_risque: 'critique', statut: 'ouvert' })],
    }))
    const sgs = r.items.find(i => i.domaine === 'SGS')
    expect(sgs?.prediction).toBe('NS')
    expect(sgs?.alerte).toBe(true)
    expect(sgs?.confiance).toBe(90)
  })

  test('prédit NS sur score global critique (< 30)', () => {
    const r = simulerSurveillance(makeParams({ profil: makeProfil({ score_global: 25 }) }))
    expect(r.items.every(i => i.prediction === 'NS')).toBe(true)
  })

  test('prédit SA sur profil favorable (score >= 80, critère >= 70)', () => {
    const r = simulerSurveillance(makeParams({ profil: makeProfil({ score_global: 85, c1: 80, c2: 85, c3: 82, c4: 78, c5: 88 }) }))
    expect(r.items.every(i => i.prediction === 'SA')).toBe(true)
  })

  test('marque NA les items réservés à l\'autre type d\'entité', () => {
    const r = simulerSurveillance(makeParams({
      kitItems: [makeKitItem({ type_entite_cible: 'helistation' })],
      portee: ['SGS'],
    }))
    expect(r.items[0].prediction).toBe('NA')
    expect(r.items[0].confiance).toBe(98)
  })

  test('dérive les écarts proposés depuis les items NS', () => {
    const r = simulerSurveillance(makeParams({
      ecartsReels: [makeEcart({ id: 'ec-c', domaine: 'SGS', niveau_risque: 'critique', statut: 'ouvert' })],
    }))
    expect(r.ecartsProposes.length).toBeGreaterThanOrEqual(1)
    const sgs = r.ecartsProposes.find(e => e.domaine === 'SGS')
    expect(sgs?.niveau_risque).toBe('critique')
    expect(sgs?.libelle).toBe('Le manuel SGS est-il à jour ?')
  })

  test('calcul correct du taux de conformité et des stats', () => {
    // SLI : 2 items sans écart ni profil favorable → NV/SA selon score moyen
    const r = simulerSurveillance(makeParams({ profil: makeProfil({ score_global: 85, c1: 80, c2: 85, c3: 82, c4: 78, c5: 88 }) }))
    expect(r.stats.sa).toBe(3)
    expect(r.stats.ns).toBe(0)
    expect(r.stats.total).toBe(3)
    expect(r.stats.tauxConformite).toBe(100)
  })

  test('produit un contexte avec les données réelles', () => {
    const r = simulerSurveillance(makeParams())
    expect(r.contexte.scoreGlobal).toBe(62)
    expect(r.contexte.maturiteSgs).toBeDefined()
    expect(r.contexte.evenementsRecents).toBe(2)
    expect(r.contexte.ecartsOuvertsReels).toBe(0)
  })

  test('génère une référence de rapport au bon format', () => {
    const r = simulerSurveillance(makeParams({ dateSimulation: '2026-08-04T00:00:00Z' }))
    expect(r.reference).toMatch(/^SIM_GOSS_2026_08_SURV$/)
  })

  test('reste déterministe à données égales', () => {
    const a = simulerSurveillance(makeParams())
    const b = simulerSurveillance(makeParams())
    expect(a.items.map(i => i.prediction)).toEqual(b.items.map(i => i.prediction))
    expect(a.ecartsProposes).toEqual(b.ecartsProposes)
  })

  test('accepte une prédiction injectée externe (historique réel)', () => {
    const r = simulerSurveillance(makeParams({
      predireItem: () => ({ prediction: 'SA', confiance: 95, justification: 'historique réel', alerte: false }),
    }))
    expect(r.items.every(i => i.prediction === 'SA')).toBe(true)
  })
  test('analyserTendance : sens et pente', async () => {
    const { analyserTendance } = await import('../ia/simulationSurveillance')
    expect(analyserTendance([{ date: '2026-01-01', score: 70 }, { date: '2026-02-01', score: 60 }, { date: '2026-03-01', score: 50 }])).toMatchObject({ sens: 'baisse' })
    expect(analyserTendance([{ date: '2026-01-01', score: 50 }, { date: '2026-02-01', score: 60 }]).sens).toBe('hausse')
    expect(analyserTendance([{ date: '2026-01-01', score: 60 }])).toMatchObject({ sens: 'stable', pente: null })
  })
  test('dégradation + SA fragile → NV avec alerte', () => {
    const r = simulerSurveillance(makeParams({
      profil: makeProfil({ score_global: 65, c1: 65, c2: 65, c3: 65, c4: 65, c5: 65 }),
      historique: [
        { date: '2026-01-01', score: 80 },
        { date: '2026-02-01', score: 72 },
        { date: '2026-03-01', score: 64 },
      ],
    }))
    expect(r.contexte.penteScores).toBeLessThan(-0.75)
    expect(r.items.some(i => i.alerte && i.prediction === 'NV')).toBe(true)
  })
  test('points d’attention : récidive, PAC manquant, passées', () => {
    const r = simulerSurveillance(makeParams({
      ecartsReels: [
        makeEcart({ id: 'ec-old', domaine: 'SGS', niveau_risque: 'moyen', statut: 'cloture', libelle: 'Manuel SGS non à jour' }),
        makeEcart({ id: 'ec-new', domaine: 'SGS', niveau_risque: 'moyen', statut: 'ouvert', libelle: 'Manuel SGS non à jour version 2' }),
        makeEcart({ id: 'ec-nopac', domaine: 'PHY', niveau_risque: 'eleve', statut: 'ouvert', libelle: 'Fissures piste' }),
      ],
      historique: [
        { date: '2026-01-01', score: 70, c1: 45 },
        { date: '2026-04-01', score: 66, c1: 55 },
      ],
    }))
    const cats = r.pointsAttention.map(p => p.categorie)
    expect(cats).toContain('recrudescence')
    expect(cats).toContain('pac_manquant')
    expect(cats).toContain('passe')
    expect(r.trajectoireSgs).toContain('→')
  })
  test('propage le marqueur mémoire vers les items', () => {
    const r = simulerSurveillance(makeParams({
      predireItem: () => ({ prediction: 'NS', confiance: 88, justification: 'récurrent', alerte: true, memoire: true }),
    }))
    expect(r.items.every(i => i.memoire === true)).toBe(true)
    expect(r.items.every(i => i.prediction === 'NS')).toBe(true)
  })
})

describe('construireRapportSimulation', () => {
  test('produit les données de rapport compatibles avec le builder PDF', () => {
    const { rapport } = construireRapportSimulation(makeParams())
    expect(rapport.surveillance.aerodrome_id).toBe('GOSS')
    expect(rapport.reference).toContain('SIM_GOSS')
    expect(rapport.items).toHaveLength(3)
    expect(rapport.items[0]).toMatchObject({ domaine: 'SGS', resultat: expect.any(String) })
    expect(rapport.sections).toHaveProperty('resume')
    expect(rapport.sections).toHaveProperty('recommandations')
    expect(rapport.sections).toHaveProperty('conclusion')
  })
})
