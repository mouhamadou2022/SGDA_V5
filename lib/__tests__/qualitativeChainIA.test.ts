// lib/__tests__/qualitativeChainIA.test.ts
// Vérifie que l'interprétation AERORISQ de la « chaîne qualitative » est
// construite depuis les données réelles du DiagnosticQualitatif (indice,
// domaines, barrières, sources) et non d'un texte statique — fallback
// déterministe si l'API n'est pas disponible.

import { expliquerChaineQualitative } from '@/lib/ia/qualitativeChainIA'
import type { DiagnosticQualitatif } from '@/lib/risque/qualitativeChain'

function makeDiagnostic(overrides: Partial<DiagnosticQualitatif> = {}): DiagnosticQualitatif {
  return {
    scenarios: [
      {
        domaine: 'SLI',
        danger: 'Incendie aéronef',
        defaillance: 'Perte de capacité SSLIA',
        consequence: 'Impossibilité de sauver les occupants',
        probabiliteMenace: 60,
        probabiliteResiduelle: 85,
        coupesMinimales: [['b1', 'b3'], ['b5']],
        barrieres: [
          { id: 'prev-sgs-SLI', nom: 'Maturité SGS (C1)', type: 'preventive', efficaciteBase: 80, efficaciteAjustee: 75, efficace: true },
          { id: 'prev-audit-SLI', nom: 'Audits SLI', type: 'preventive', efficaciteBase: 70, efficaciteAjustee: 65, efficace: true },
        ],
        barrieresCritiques: [],
        sources: ['amdec', 'fta', 'bayes', 'bowtie'],
        modesCritiquesAmdec: ['Service SSLIA — Véhicule SSLIA inopérant'],
        confiance: 75,
      },
      {
        domaine: 'PHY',
        danger: 'Aire de mouvement',
        defaillance: 'Incursion de piste',
        consequence: 'Collision au sol',
        probabiliteMenace: 20,
        probabiliteResiduelle: 30,
        coupesMinimales: [],
        barrieres: [
          { id: 'prev-sgs-PHY', nom: 'Maturité SGS (C1)', type: 'preventive', efficaciteBase: 80, efficaciteAjustee: 80, efficace: true },
        ],
        barrieresCritiques: [],
        sources: ['bowtie'],
        modesCritiquesAmdec: [],
        confiance: 40,
      },
    ],
    indiceGlobal: 62,
    confiance: 70,
    barrieresCritiquesGlobales: [],
    interpretation: 'test',
    ...overrides,
  }
}

describe('expliquerChaineQualitative (fallback déterministe)', () => {
  it("reflète l'indice et la confiance réels du diagnostic", async () => {
    const res = await expliquerChaineQualitative({ diagnostic: makeDiagnostic() })
    expect(res.synthese).toContain('62/100')
    expect(res.synthese).toContain('70')
    expect(res.fallbackIA).toBe(true)
  })

  it('nomme le domaine le plus dégradé (probabilité résiduelle)', async () => {
    const res = await expliquerChaineQualitative({ diagnostic: makeDiagnostic() })
    expect(res.synthese).toContain('SLI')
    expect(res.synthese).toContain('85')
  })

  it('décrit ce que chaque outil a apporté sur les domaines à signaux', async () => {
    const res = await expliquerChaineQualitative({ diagnostic: makeDiagnostic() })
    expect(res.outils).toContain('AMDEC')
    expect(res.outils).toContain('arbre de défaillance')
    expect(res.outils).toContain('réseau bayésien')
    expect(res.outils).toContain('combinaison(s) de causes possibles')
  })

  it('recommande de renforcer les barrières quand la menace dépasse le seuil', async () => {
    const res = await expliquerChaineQualitative({ diagnostic: makeDiagnostic() })
    expect(res.recommandation).toContain('renforcer les barrières')
    expect(res.recommandation).toContain('SLI')
  })

  it('liste les barrières critiques quand elles descendent sous le seuil', async () => {
    const diag = makeDiagnostic({
      barrieresCritiquesGlobales: ['Audits SLI'],
      scenarios: [
        {
          domaine: 'SLI',
          danger: 'Incendie aéronef',
          defaillance: 'Perte de capacité SSLIA',
          consequence: 'Impossibilité de sauver les occupants',
          probabiliteMenace: 60,
          probabiliteResiduelle: 85,
          coupesMinimales: [],
          barrieres: [
            { id: 'prev-audit-SLI', nom: 'Audits SLI', type: 'preventive', efficaciteBase: 70, efficaciteAjustee: 45, efficace: false },
          ],
          barrieresCritiques: ['prev-audit-SLI'],
          sources: ['amdec', 'bowtie'],
          modesCritiquesAmdec: ['Service SSLIA — Véhicule SSLIA inopérant'],
          confiance: 75,
        },
      ],
    })
    const res = await expliquerChaineQualitative({ diagnostic: diag })
    expect(res.barrieres).toContain('Audits SLI')
    expect(res.barrieres).toContain('45')
  })

  it('gère un diagnostic vide avec un message data-driven', async () => {
    const res = await expliquerChaineQualitative({ diagnostic: null })
    expect(res.synthese).toContain('Aucun diagnostic qualitatif')
    expect(res.fallbackIA).toBe(true)
  })

  it('confirme une situation sous contrôle quand l\'indice est faible', async () => {
    const res = await expliquerChaineQualitative({
      diagnostic: makeDiagnostic({
        indiceGlobal: 12,
        confiance: 60,
        barrieresCritiquesGlobales: [],
        scenarios: [
          {
            domaine: 'SLI',
            danger: 'Incendie aéronef',
            defaillance: 'Perte de capacité SSLIA',
            consequence: 'Impossibilité de sauver les occupants',
            probabiliteMenace: 10,
            probabiliteResiduelle: 15,
            coupesMinimales: [],
            barrieres: [
              { id: 'prev-sgs-SLI', nom: 'Maturité SGS (C1)', type: 'preventive', efficaciteBase: 90, efficaciteAjustee: 90, efficace: true },
            ],
            barrieresCritiques: [],
            sources: ['bowtie'],
            modesCritiquesAmdec: [],
            confiance: 60,
          },
        ],
      }),
    })
    expect(res.recommandation).toContain('Aucune action immédiate')
  })
})