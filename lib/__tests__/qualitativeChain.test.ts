// lib/__tests__/qualitativeChain.test.ts
// Vérifie l'enchaînement des quatre outils qualitatifs (AMDEC → BowTie → FTA → Bayésien) :
// chaque outil répond à une question que les autres ne posent pas ; leurs sorties
// se combinent sans s'opposer.

import { chainerModelesQualitatifs, voterChaineQualitative } from '@/lib/risque/qualitativeChain'
import { synthetiserModeles } from '@/lib/risque/modelSynthesis'
import type { BowTieModele } from '@/lib/risque/types'
import type { AmdecAnalyse } from '@/lib/risque/amdecEngine'
import type { ArbreFTA } from '@/lib/risque/ftaEngine'
import type { ProfilRisque } from '@/lib/store'

function analyseAmdec(overrides: Partial<AmdecAnalyse> = {}): AmdecAnalyse {
  return {
    id: 'a1',
    aerodrome_id: 'GOBD',
    mode_id: 'sli-01',
    domaine: 'SLI',
    systeme: 'Service SSLIA',
    equipement: 'Véhicules d\'extinction',
    mode_defaillance: 'Véhicule SSLIA inopérant',
    effet: 'Perte de capacité',
    cause: 'Maintenance insuffisante',
    detection: 'Essais journaliers',
    gravite: 'A',
    probabilite: 3,
    detection_score: 2,
    ipr: 72,
    niveau: 'critique',
    statut: 'a_analyser',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function bowTie(): BowTieModele {
  return {
    id: 'bt-SLI',
    domaine: 'SLI',
    danger: 'Incendie aéronef',
    defaillance: 'Perte de capacité SSLIA',
    scenario: 'Incendie pendant l\'intervention',
    consequence: 'Impossibilité de sauver les occupants',
    barrieresPreventives: [
      { id: 'prev-sgs-SLI', nom: 'Maturité SGS (C1)', type: 'preventive', efficace: true, efficacite: 80 },
      { id: 'prev-audit-SLI', nom: 'Audits SLI', type: 'preventive', efficace: true, efficacite: 70 },
    ],
    barrieresCorrectives: [{ id: 'corr-pac-SLI', nom: 'PAC existants', type: 'corrective', efficace: true, efficacite: 65 }],
    probabiliteResiduelle: 30,
    niveauRisqueResiduel: 'moyen',
    lastAssessed: '2026-01-01T00:00:00Z',
  }
}

function arbreFTA(): ArbreFTA {
  return {
    id: 'fta1',
    evenementId: 'evt1',
    aerodromeId: 'GOBD',
    domaine: 'SLI',
    evenementLabel: 'Perte de capacité SSLIA',
    templateId: 'perte-capacite-sslia',
    sommetId: 's0',
    // OU(s0) ← i1(OU: b1 20, b2 15, b3 25), i2(OU: b4 20, b5 30), b6 25, i3(OU: b7 15, b8 20)
    noeuds: [
      { id: 's0', parentId: undefined, label: 'Perte de capacité SSLIA', type: 'sommet', porte: 'OU', probabilite: 0 },
      { id: 'i1', parentId: 's0', label: 'Véhicules inopérants', type: 'intermediaire', porte: 'OU', probabilite: 0 },
      { id: 'b1', parentId: 'i1', label: 'Panne pompe', type: 'cause', probabilite: 20 },
      { id: 'b3', parentId: 'i1', label: 'Maintenance non réalisée', type: 'cause', probabilite: 25 },
      { id: 'i2', parentId: 's0', label: 'Effectif insuffisant', type: 'intermediaire', porte: 'OU', probabilite: 0 },
      { id: 'b5', parentId: 'i2', label: 'Sous-effectif', type: 'cause', probabilite: 30 },
      { id: 'b6', parentId: 's0', label: 'Agent extincteur insuffisant', type: 'cause', probabilite: 25 },
    ],
    statut: 'termine',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function profilActif(): ProfilRisque {
  return {
    aerodrome_id: 'GOBD',
    score_global: 55,
    niveau: 'moyen',
    c1: 60, c2: 55, c3: 50, c4: 45, c5: 40,
    prediction_3m: 50,
    prediction_6m: 45,
    tendance: 'stable',
    computed_at: '2026-01-01T00:00:00Z',
  } as ProfilRisque
}

describe('chainerModelesQualitatifs', () => {
  it('affaiblit les barrières préventives via les modes AMDEC critiques non corrigés', () => {
    const diag = chainerModelesQualitatifs({
      bowties: [bowTie()],
      amdecAnalyses: [analyseAmdec({ niveau: 'critique', ipr: 72, statut: 'a_analyser' })],
      ftaArbres: [],
    })
    const scenario = diag.scenarios[0]
    expect(scenario.sources).toContain('amdec')
    const prev = scenario.barrieres.find((b) => b.id === 'prev-sgs-SLI')!
    // -5 / mode critique non corrigé (barème C3), plafonné à 20
    expect(prev.efficaciteAjustee).toBe(80 - 5)
    expect(scenario.modesCritiquesAmdec).toHaveLength(1)
  })

  it('recalibre la menace via le max des arbres FTA terminés du domaine', () => {
    const diag = chainerModelesQualitatifs({
      bowties: [bowTie()],
      amdecAnalyses: [],
      ftaArbres: [arbreFTA()],
    })
    const scenario = diag.scenarios[0]
    expect(scenario.sources).toContain('fta')
    // La probabilité du sommet de l'arbre remplace la valeur BowTie.
    expect(scenario.probabiliteMenace).toBeGreaterThanOrEqual(0)
    expect(scenario.probabiliteMenace).toBeLessThanOrEqual(100)
    expect(scenario.coupesMinimales.length).toBeGreaterThan(0)
  })

  it('fusionne les barrières critiques détectées par l\'inférence bayésienne', () => {
    const diag = chainerModelesQualitatifs({
      bowties: [bowTie()],
      amdecAnalyses: [],
      ftaArbres: [],
      bayesParDomaine: {
        SLI: { probabiliteResiduelle: 85, barrieresCritiques: ['barriere_prev-sgs-SLI'], confiance: 75 },
      },
    })
    const scenario = diag.scenarios[0]
    expect(scenario.sources).toContain('bayes')
    expect(scenario.probabiliteResiduelle).toBe(85)
    expect(scenario.barrieresCritiques).toContain('prev-sgs-SLI')
  })

  it('combine les sources : un domaine intègre AMDEC + FTA + Bayésien', () => {
    const diag = chainerModelesQualitatifs({
      bowties: [bowTie()],
      amdecAnalyses: [analyseAmdec({ niveau: 'eleve', ipr: 45, statut: 'surveille' })],
      ftaArbres: [arbreFTA()],
      bayesParDomaine: {
        SLI: { probabiliteResiduelle: 60, barrieresCritiques: [], confiance: 70 },
      },
    })
    const scenario = diag.scenarios[0]
    expect(scenario.sources.sort()).toEqual(['amdec', 'bayes', 'bowtie', 'fta'])
    expect(diag.indiceGlobal).toBeGreaterThan(0)
    expect(diag.confiance).toBeGreaterThanOrEqual(50)
  })

  it('s\'aligne sur le BowTie seul quand aucun autre outil n\'a de données', () => {
    const diag = chainerModelesQualitatifs({
      bowties: [bowTie()],
      amdecAnalyses: [],
      ftaArbres: [],
    })
    const scenario = diag.scenarios[0]
    expect(scenario.sources).toEqual(['bowtie'])
    expect(scenario.probabiliteResiduelle).toBe(30)
  })
})

describe('voterChaineQualitative — pont avec synthetiserModeles', () => {
  it('ajoute un 13e vote optionnel sans casser les 12 votes de base', () => {
    const diag = chainerModelesQualitatifs({
      bowties: [bowTie()],
      amdecAnalyses: [analyseAmdec({ niveau: 'critique', ipr: 72 })],
      ftaArbres: [],
    })
    const sansQualitatif = synthetiserModeles(profilActif())
    const avecQualitatif = synthetiserModeles(profilActif(), diag)
    expect(sansQualitatif.votes).toHaveLength(1)
    expect(avecQualitatif.votes).toHaveLength(2)
    const vote = avecQualitatif.votes[1]
    expect(vote.nom).toBe('Chaîne qualitative (BowTie+FTA+AMDEC)')
    expect(vote.indiceDegradation).toBe(diag.indiceGlobal)
    expect(vote.dataSupport).toBe(100) // support par défaut (historique non requis)
  })

  it('le vote qualitatif est structuré comme un ModeleVote', () => {
    const vote = voterChaineQualitative({
      scenarios: [],
      indiceGlobal: 0,
      confiance: 0,
      barrieresCritiquesGlobales: [],
      interpretation: 'vide',
    })
    expect(vote).toMatchObject({ nom: expect.any(String), indiceDegradation: expect.any(Number), confiance: expect.any(Number), interpretation: expect.any(String) })
  })
})