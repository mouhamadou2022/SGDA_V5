import { smoothCPT, construireReseauDepuisBowTie, inferer, computeBayesianNetworkRisk, incrementAndRecalibrate, recomputeCPTFromObservations } from '../risque/bayesianNetwork'
import type { BowTieModele } from '../risque/types'

function makeBowTie(overrides: Partial<BowTieModele> = {}): BowTieModele {
  return {
    id: 'bt-SGS',
    domaine: 'SGS',
    danger: 'Défaut de conformité SGS',
    defaillance: 'SGS inefficace',
    scenario: 'Dégradation de la maturité SGS',
    consequence: 'Non-conformité OACI',
    barrieresPreventives: [
      { id: 'prev-sgs-SGS', nom: 'Maturité SGS (C1)', type: 'preventive', efficace: true, efficacite: 80 },
      { id: 'prev-audit-SGS', nom: 'Audits SGS', type: 'preventive', efficace: true, efficacite: 70 },
    ],
    barrieresCorrectives: [
      { id: 'corr-pac-SGS', nom: 'PAC existants', type: 'corrective', efficace: true, efficacite: 65 },
      { id: 'corr-new-SGS', nom: 'Nouvelles mesures (IA)', type: 'corrective', efficace: true, efficacite: 75 },
    ],
    probabiliteResiduelle: 30,
    niveauRisqueResiduel: 'moyen',
    lastAssessed: new Date().toISOString(),
    ...overrides,
  }
}

describe('smoothCPT', () => {
  it('retourne des probabilités qui somment à 1', () => {
    const result = smoothCPT([5, 3, 2])
    const total = result.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('donne un prior uniforme quand toutes les observations sont à zéro', () => {
    const result = smoothCPT([0, 0, 0])
    expect(result[0]).toBeCloseTo(1 / 3, 5)
    expect(result[1]).toBeCloseTo(1 / 3, 5)
    expect(result[2]).toBeCloseTo(1 / 3, 5)
  })

  it('ne donne jamais 100% même avec une seule observation', () => {
    const result = smoothCPT([1, 0, 0])
    expect(result[0]).toBeLessThan(0.9)
  })
})

describe('construireReseauDepuisBowTie', () => {
  const reseau = construireReseauDepuisBowTie(makeBowTie())

  it('crée un noeud evenement_redoute', () => {
    const evt = reseau.find(n => n.type === 'evenement_redoute')
    expect(evt).toBeDefined()
    expect(evt!.parents).toHaveLength(4)
  })

  it('crée tous les types de noeuds', () => {
    const types = reseau.map(n => n.type)
    expect(types).toContain('barriere')
    expect(types).toContain('evenement_redoute')
    expect(types).toContain('consequence')
  })

  it('crée les noeuds organisationnels pour les domaines COP', () => {
    const org = reseau.filter(n => n.type === 'organisationnel')
    expect(org.length).toBe(3)
    expect(org.map(n => n.id)).toEqual(
      expect.arrayContaining(['charge_travail_bt-SGS', 'formation_adequation_bt-SGS', 'supervision_quality_bt-SGS'])
    )
  })

  it('chaque CPT a des probabilités valides', () => {
    for (const node of reseau) {
      for (const [key, probs] of Object.entries(node.cpt.table)) {
        const total = probs.reduce((a, b) => a + b, 0)
        expect(total).toBeCloseTo(1, 1)
        expect(probs.length).toBe(node.etats.length)
      }
    }
  })
})

describe('inferer', () => {
  const bt = makeBowTie()
  const reseau = construireReseauDepuisBowTie(bt)

  it('retourne une distribution qui somme à 1', () => {
    const dist = inferer(reseau, 'consequence_bt-SGS', { 'barriere_prev-sgs-SGS': 2 })
    const total = dist.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('retourne des états certains quand tous les parents sont fixés', () => {
    const dist = inferer(reseau, 'barriere_prev-sgs-SGS', { 'barriere_prev-sgs-SGS': 0 })
    const intactProb = dist[0]
    expect(intactProb).toBeCloseTo(1, 3)
  })

  it('retourne une distribution qui somme à 1 sans évidence', () => {
    const dist = inferer(reseau, 'charge_travail_bt-SGS')
    const total = dist.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
    expect(dist.length).toBe(3)
  })
})

describe('computeBayesianNetworkRisk', () => {
  it('retourne une probabilité entre 0 et 100', () => {
    const reseau = construireReseauDepuisBowTie(makeBowTie())
    const result = computeBayesianNetworkRisk(reseau, 'consequence_bt-SGS', { 'barriere_prev-sgs-SGS': 0 })
    expect(result.probabiliteResiduelle).toBeGreaterThanOrEqual(0)
    expect(result.probabiliteResiduelle).toBeLessThanOrEqual(100)
    expect(result.confiance).toBeGreaterThanOrEqual(0)
    expect(result.confiance).toBeLessThanOrEqual(100)
  })
})

describe('incrementAndRecalibrate + recomputeCPTFromObservations', () => {
  it('incrémente puis recalcule la CPT', () => {
    const bt = makeBowTie()
    let reseau = construireReseauDepuisBowTie(bt)
    const node = reseau.find(n => n.type === 'evenement_redoute')!
    const firstKey = Object.keys(node.cpt.table)[0]
    const oldProbs = node.cpt.table[firstKey]

    const updated = incrementAndRecalibrate(node, firstKey, 2)
    const newProbs = updated.cpt.table[firstKey]

    const oldObs = node.cpt.observations[firstKey]
    const newObs = updated.cpt.observations[firstKey]

    expect(newObs[2]).toBe((oldObs?.[2] || 0) + 1)
    expect(newProbs).not.toEqual(oldProbs)

    const total = newProbs.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })
})

describe('apprentissage — convergence vers les données', () => {
  it('converge vers P(grave) ≈ 0.9 après 100 observations de l\'état grave', () => {
    const bt = makeBowTie()
    let reseau = construireReseauDepuisBowTie(bt)
    let node = reseau.find(n => n.type === 'consequence')!
    const parentKey = Object.keys(node.cpt.table)[0]

    for (let i = 0; i < 100; i++) {
      node = incrementAndRecalibrate(node, parentKey, 2)
    }

    const probs = node.cpt.table[parentKey]
    expect(probs[2]).toBeGreaterThan(0.7)
    expect(probs[0] + probs[1] + probs[2]).toBeCloseTo(1, 3)
  })
})
