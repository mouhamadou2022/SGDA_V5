// lib/__tests__/ceQuiNeVaPasIA.test.ts
// Vérifie que le diagnostic « Ce qui ne va pas » est construit depuis les
// données réelles (critères, écarts, barrières, signaux avancés) et produit
// des explications exploitables (cause, conséquence, action) — fallback
// déterministe si l'API n'est pas disponible.

import { expliquerCeQuiNeVaPas } from '@/lib/ia/ceQuiNeVaPasIA'
import type { ProfilRisque, Ecart } from '@/lib/store'
import type { BowTieModele } from '@/lib/risque/types'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'GOBD',
    score_global: 32,
    niveau: 'eleve',
    c1: 25, c2: 45, c3: 60, c4: 50, c5: 70,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as ProfilRisque
}

describe('expliquerCeQuiNeVaPas (fallback déterministe)', () => {
  it('détecte le critère le plus dégradé avec cause exploitable', async () => {
    const res = await expliquerCeQuiNeVaPas({ profil: makeProfil(), ecarts: [] })
    const c1 = res.points.find(p => p.cle === 'critere_c1')
    expect(c1).toBeDefined()
    expect(c1!.constat).toContain('Maturité SGS')
    expect(c1!.constat).toContain('25/100')
    expect(c1!.cause).toContain('critère le plus dégradé')
    expect(c1!.action).toContain('plan d\'action')
  })

  it('remonte les écarts critiques non clôturés', async () => {
    const res = await expliquerCeQuiNeVaPas({
      profil: makeProfil({ c1: 70 }),
      ecarts: [
        { id: 'e1', aerodrome_id: 'GOBD', domaine: 'PHY', reference: 'PHY-01', libelle: 'x', ref_reglementaire: 'y', niveau_risque: 'critique', statut: 'ouvert', delai_pac: '', delai_regularisation: '', inspecteur_ref_id: 'i' } as Ecart,
      ],
    })
    const ecart = res.points.find(p => p.cle === 'ecarts_critiques')
    expect(ecart).toBeDefined()
    expect(ecart!.constat).toContain('1 écart critique')
    expect(ecart!.action).toContain('responsable')
  })

  it('signale les barrières Bow-Tie sous 50% avec le nom réel', async () => {
    const res = await expliquerCeQuiNeVaPas({
      profil: makeProfil({
        c1: 70,
        bowtie_metrics: [{
          id: 'bt-PHY', domaine: 'PHY', danger: 'Incursion', defaillance: 'x',
          scenario: 's', consequence: 'c', probabiliteResiduelle: 30, niveauRisqueResiduel: 'eleve',
          lastAssessed: '2026-01-01',
          barrieresPreventives: [{ id: 'b1', nom: 'Radar de surface', type: 'preventive', efficace: false, efficacite: 20 }],
          barrieresCorrectives: [],
        }] as BowTieModele[],
      }),
      ecarts: [],
    })
    const b = res.points.find(p => p.cle === 'barrieres_faibles')
    expect(b).toBeDefined()
    expect(b!.constat).toContain('Radar de surface')
    expect(b!.consequence).toContain('perte de maîtrise')
  })

  it('explique le cygne noir bayésien avec prior/posterior réels', async () => {
    const res = await expliquerCeQuiNeVaPas({
      profil: makeProfil({ c1: 70, bayesian_black_swan: true, bayesian_prior: 0.02, bayesian_posterior: 0.35 }),
      ecarts: [],
    })
    const cn = res.points.find(p => p.cle === 'cygne_noir')
    expect(cn).toBeDefined()
    expect(cn!.constat).toContain('2%')
    expect(cn!.consequence).toContain('événement extrême')
  })

  it('hiérarchise la synthèse du point critique vers le moins critique', async () => {
    const res = await expliquerCeQuiNeVaPas({ profil: makeProfil(), ecarts: [] })
    expect(res.synthese).toContain('signal')
    expect(res.points.length).toBeGreaterThanOrEqual(1)
  })

  it('stabilise un profil sain sans point de vigilance', async () => {
    const res = await expliquerCeQuiNeVaPas({
      profil: makeProfil({ score_global: 90, c1: 92, c2: 88, c3: 85, c4: 90, c5: 95 }),
      ecarts: [],
    })
    expect(res.points).toHaveLength(0)
    expect(res.synthese).toContain('sous contrôle')
  })

  it('chaque point porte les trois champs exploitables', async () => {
    const res = await expliquerCeQuiNeVaPas({ profil: makeProfil(), ecarts: [] })
    for (const p of res.points) {
      expect(p.cause.length).toBeGreaterThan(10)
      expect(p.consequence.length).toBeGreaterThan(10)
      expect(p.action.length).toBeGreaterThan(10)
    }
  })
})