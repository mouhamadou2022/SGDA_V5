// lib/__tests__/oaciGraph.test.ts
// Tests du graphe unifié OACI → risques → écarts : construction des nœuds et
// arêtes, chaîne causale Critère → Barrière → Domaine → Écart, propagation de
// l'impact d'un critère et statistiques agrégées.

import type { ProfilRisque, Ecart } from '@/lib/store'
import { construireGrapheOaci, calculerImpactCritere, libelleNoeud } from '@/lib/ia/oaciGraph'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'LFOB',
    score_global: 60,
    niveau: 'moyen',
    c1: 70, c2: 65, c3: 60, c4: 40, c5: 66,
    prediction_3m: 62,
    prediction_6m: 58,
    tendance: 'baisse',
    computed_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeEcart(overrides: Partial<Ecart> = {}): Ecart {
  return {
    id: 'ec-1', aerodrome_id: 'LFOB', statut: 'ouvert',
    niveau_risque: 'moyen', domaine: 'PHY',
    date_detection: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as Ecart
}

describe('construireGrapheOaci', () => {
  test('contient les 5 critères et leurs poids', () => {
    const g = construireGrapheOaci({ profil: makeProfil(), ecarts: [], surveillances: [] })
    expect(g.stats.nbCriteres).toBe(5)
    const c2 = g.noeuds.find(n => n.id === 'critere_c2')!
    expect(c2.type).toBe('critere')
    if (c2.type === 'critere') expect(c2.poids).toBe(25)
  })

  test('un écart critique crée la chaîne C4 → écart et Domaine → écart', () => {
    const g = construireGrapheOaci({
      profil: makeProfil(),
      ecarts: [makeEcart({ id: 'x', domaine: 'PHY', niveau_risque: 'critique' })],
      surveillances: [],
    })
    const hasC4Charge = g.aretes.some(a => a.source === 'critere_c4' && a.cible === 'ecart_x' && a.type === 'charge')
    const hasDomaine = g.aretes.some(a => a.source === 'domaine_PHY' && a.cible === 'ecart_x' && a.type === 'rattache')
    expect(hasC4Charge).toBe(true)
    expect(hasDomaine).toBe(true)
    expect(g.stats.ecartsCritiques).toBe(1)
  })

  test('les barrières Bow-Tie sont reliées à leur critère pilote', () => {
    const g = construireGrapheOaci({ profil: makeProfil(), ecarts: [], surveillances: [] })
    const barrieres = g.noeuds.filter(n => n.type === 'barriere')
    expect(barrieres.length).toBeGreaterThan(0)
    for (const b of barrieres) {
      if (b.type !== 'barriere') continue
      // Chaque barrière a une arête 'pilote' depuis son critère
      expect(g.aretes.some(a => a.source === `critere_${b.cle}` && a.cible === b.id && a.type === 'pilote')).toBe(true)
      // Et une arête 'porte' vers son domaine
      expect(g.aretes.some(a => a.source === b.id && a.cible === `domaine_${b.domaine}` && a.type === 'porte')).toBe(true)
    }
  })

  test('les écarts clôturés sont exclus du graphe', () => {
    const g = construireGrapheOaci({
      profil: makeProfil(),
      ecarts: [
        makeEcart({ id: 'ouvert', domaine: 'PHY', statut: 'ouvert' }),
        makeEcart({ id: 'ferme', domaine: 'PHY', statut: 'cloture' }),
      ],
      surveillances: [],
    })
    expect(g.noeuds.some(n => n.id === 'ecart_ouvert')).toBe(true)
    expect(g.noeuds.some(n => n.id === 'ecart_ferme')).toBe(false)
  })

  test('la statistique des barrières faibles reflète l\'efficacité', () => {
    const g = construireGrapheOaci({
      profil: makeProfil({ c1: 20, c2: 25, c3: 30, c4: 30, c5: 35 }),
      ecarts: [],
      surveillances: [],
    })
    // Avec C1/C2 très bas, la majorité des barrières sont faibles (< 50)
    expect(g.stats.barrieresFaibles).toBeGreaterThan(0)
    expect(g.stats.barrieresFaibles).toBeLessThanOrEqual(g.stats.nbBarrieres)
  })
})

describe('calculerImpactCritere', () => {
  test('depuis C1, l\'impact atteint domaines et écarts par les barrières', () => {
    const g = construireGrapheOaci({
      profil: makeProfil(),
      ecarts: [makeEcart({ id: 'a', domaine: 'PHY', niveau_risque: 'eleve' })],
      surveillances: [],
    })
    const impacts = calculerImpactCritere(g, 'critere_c1')
    const atteintDomaine = impacts.some(i => i.id === 'domaine_PHY')
    expect(impacts.length).toBeGreaterThan(0)
    // L'impact décroît le long de la chaîne : barrière (0.7) puis domaine (×0.5) puis écart (×0.85)
    for (const i of impacts) {
      expect(i.impact).toBeGreaterThan(0)
      expect(i.impact).toBeLessThanOrEqual(1)
    }
    // Seuls les critères pilotant C1 (barrières préventives) puis leurs domaines/écarts sont atteints
    if (atteintDomaine) {
      const dom = impacts.find(i => i.id === 'domaine_PHY')!
      expect(dom.impact).toBeLessThan(1)
      expect(dom.chemin.length).toBeGreaterThanOrEqual(3)
    }
  })

  test('ne remonte pas vers la source et reste déterministe', () => {
    const g = construireGrapheOaci({ profil: makeProfil(), ecarts: [], surveillances: [] })
    const a = calculerImpactCritere(g, 'critere_c2')
    const b = calculerImpactCritere(g, 'critere_c2')
    expect(a.some(i => i.id === 'critere_c2')).toBe(false)
    expect(a).toEqual(b)
  })
})

describe('libelleNoeud', () => {
  test('retire le préfixe de type', () => {
    expect(libelleNoeud('critere_c1')).toBe('c1')
    expect(libelleNoeud('domaine_PHY')).toBe('PHY')
    expect(libelleNoeud('barriere_prev-sgs-PHY')).toBe('prev-sgs-PHY')
    expect(libelleNoeud('ecart_ec-1')).toBe('ec-1')
  })
})
