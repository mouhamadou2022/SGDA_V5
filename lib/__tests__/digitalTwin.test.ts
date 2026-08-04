// lib/__tests__/digitalTwin.test.ts
// Tests du moteur du jumeau numérique interactif AERORISQ : calcul déterministe
// des leviers → critères → score, scénarios what-if, série de projection et
// impact des actions correctives.

import type { ProfilRisque, Ecart } from '@/lib/store'
import {
  leviersParDefaut,
  compterEcartsOuverts,
  construireSerieHistorique,
  simulerJumeauNumerique,
  construireProjection,
} from '@/lib/ia/digitalTwin'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'LFOB',
    score_global: 70,
    niveau: 'faible',
    c1: 70, c2: 72, c3: 68, c4: 66, c5: 74,
    prediction_3m: 71,
    prediction_6m: 69,
    tendance: 'stable',
    computed_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeEcart(overrides: Partial<Ecart> = {}): Ecart {
  return {
    id: 'ec-1', aerodrome_id: 'LFOB', statut: 'ouvert',
    niveau_risque: 'moyen', domaine: 'SGS',
    date_detection: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as Ecart
}

describe('leviersParDefaut', () => {
  test('reflète l\'état réel du profil', () => {
    const l = leviersParDefaut(makeProfil())
    expect(l).toMatchObject({ c1: 70, c2: 72, c3: 68, c4: 66, c5: 74, horizon: 6, aggravators: 1, blackSwan: false })
  })

  test('hérite le signal cygne noir du profil', () => {
    const l = leviersParDefaut(makeProfil({ bayesian_black_swan: true }))
    expect(l.blackSwan).toBe(true)
  })
})

describe('compterEcartsOuverts', () => {
  test('compte uniquement les écarts ouverts', () => {
    const ecarts = [
      makeEcart({ id: 'a', statut: 'ouvert', niveau_risque: 'critique' }),
      makeEcart({ id: 'b', statut: 'ouvert', niveau_risque: 'eleve' }),
      makeEcart({ id: 'c', statut: 'cloture', niveau_risque: 'critique' }),
    ]
    expect(compterEcartsOuverts(ecarts)).toEqual({ critiques: 1, total: 2 })
  })
})

describe('construireSerieHistorique', () => {
  test('garantit au moins deux points pour la régression', () => {
    expect(construireSerieHistorique([], 55)).toHaveLength(2)
    expect(construireSerieHistorique([{ date: '2026-01-01', score: 50 }], 55)).toHaveLength(2)
  })

  test('ajoute le score jumeau en fin de série', () => {
    const serie = construireSerieHistorique([{ date: '2026-01-01', score: 50 }, { date: '2026-02-01', score: 52 }], 60)
    expect(serie).toEqual([50, 52, 60])
  })
})

describe('simulerJumeauNumerique', () => {
  test('sans levier, le jumeau reproduit le physique', () => {
    const profil = makeProfil()
    const l = leviersParDefaut(profil)
    const etat = simulerJumeauNumerique({ profil, ecarts: [], historique: [], leviers: l })
    expect(etat.scoreJumeau).toBe(profil.score_global)
    expect(etat.delta).toBe(0)
    expect(etat.scenarios).toHaveLength(4)
  })

  test('augmenter un critère augmente le score jumeau', () => {
    const profil = makeProfil()
    const l = { ...leviersParDefaut(profil), c2: 100 }
    const etat = simulerJumeauNumerique({ profil, ecarts: [], historique: [], leviers: l })
    expect(etat.scoreJumeau).toBeGreaterThan(profil.score_global)
  })

  test('le levier « fermer les écarts critiques » ajoute un bonus C4 borné', () => {
    const profil = makeProfil()
    const ecarts = [
      makeEcart({ id: 'a', statut: 'ouvert', niveau_risque: 'critique' }),
      makeEcart({ id: 'b', statut: 'ouvert', niveau_risque: 'critique' }),
      makeEcart({ id: 'c', statut: 'ouvert', niveau_risque: 'critique' }),
    ]
    const l = { ...leviersParDefaut(profil), fermerEcartsCritiques: true }
    const etat = simulerJumeauNumerique({ profil, ecarts, historique: [], leviers: l })
    expect(etat.bonus.c4).toBeGreaterThan(0)
    expect(etat.ecartsCritiquesOuverts).toBe(0)
    expect(etat.scoreJumeau).toBeGreaterThan(profil.score_global)
  })

  test('le levier est sans effet s\'il n\'y a aucun écart critique', () => {
    const profil = makeProfil()
    const l = { ...leviersParDefaut(profil), fermerEcartsCritiques: true }
    const etat = simulerJumeauNumerique({ profil, ecarts: [makeEcart({ niveau_risque: 'moyen' })], historique: [], leviers: l })
    expect(etat.bonus.c4).toBe(0)
    expect(etat.ecartsCritiquesOuverts).toBe(0)
  })

  test('le cygne noir durcit le scénario catastrophe', () => {
    const profil = makeProfil()
    const base = simulerJumeauNumerique({ profil, ecarts: [], historique: [], leviers: { ...leviersParDefaut(profil), blackSwan: false } })
    const swan = simulerJumeauNumerique({ profil, ecarts: [], historique: [], leviers: { ...leviersParDefaut(profil), blackSwan: true } })
    const catBase = base.scenarios.find(s => s.nom === 'catastrophe')!
    const catSwan = swan.scenarios.find(s => s.nom === 'catastrophe')!
    expect(catSwan.scoreProjecte).toBeLessThanOrEqual(catBase.scoreProjecte)
  })

  test('les valeurs sont bornées 0-100', () => {
    const profil = makeProfil()
    const l = { ...leviersParDefaut(profil), c1: 1000, renforcerFormation: true }
    const etat = simulerJumeauNumerique({ profil, ecarts: [], historique: [], leviers: l })
    expect(etat.criteres.c1).toBeLessThanOrEqual(100)
    expect(etat.scoreJumeau).toBeLessThanOrEqual(100)
  })
})

describe('construireProjection', () => {
  test('produit historique + aujourd\'hui + horizon', () => {
    const profil = makeProfil()
    const etat = simulerJumeauNumerique({ profil, ecarts: [], historique: [{ date: '2026-01-01', score: 65 }], leviers: leviersParDefaut(profil) })
    const points = construireProjection({ historique: [{ date: '2026-01-01', score: 65 }], etat, horizon: 6 })
    expect(points).toHaveLength(3)
    expect(points[points.length - 1].realiste).not.toBeNull()
    expect(points[points.length - 1].label).toBe('6m')
  })
})
