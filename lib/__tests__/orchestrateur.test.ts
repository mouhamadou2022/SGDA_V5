// lib/__tests__/orchestrateur.test.ts
// Tests de l'orchestrateur multi-agents AERORISQ : composition déterministe
// des moteurs existants, fusion pondérée des votes, journalisation du
// raisonnement et persistance locale.

import type { ProfilRisque, Ecart } from '@/lib/store'
import {
  lancerDiagnosticOrchestrateur,
  historiqueOrchestrateur,
  lireDernierDiagnostic,
} from '@/lib/ia/orchestrateur'

function makeProfil(overrides: Partial<ProfilRisque> = {}): ProfilRisque {
  return {
    aerodrome_id: 'LFOB',
    score_global: 85,
    niveau: 'faible',
    c1: 82, c2: 85, c3: 88, c4: 80, c5: 84,
    prediction_3m: 84,
    prediction_6m: 82,
    tendance: 'stable',
    computed_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeEcart(overrides: Partial<Ecart> = {}): Ecart {
  return {
    id: 'ec-1',
    aerodrome_id: 'LFOB',
    statut: 'ouvert',
    niveau_risque: 'moyen',
    domaine: 'SGS',
    date_detection: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as Ecart
}

beforeEach(() => {
  localStorage.clear()
})

describe('lancerDiagnosticOrchestrateur', () => {
  test('produit votes, journal, traçabilité et un niveau valide', () => {
    const resultat = lancerDiagnosticOrchestrateur({
      aerodromeId: 'LFOB',
      profil: makeProfil(),
      ecarts: [],
    })
    expect(resultat.votes).toHaveLength(5)
    expect(resultat.journal).toHaveLength(5)
    expect(['critique', 'eleve', 'moyen', 'faible']).toContain(resultat.niveau)
    expect(resultat.donneesUtilisees.length).toBeGreaterThan(0)
    expect(resultat.modelesAppeles.length).toBeGreaterThan(0)
    expect(resultat.id).toBeTruthy()
    // Chaque vote est borné 0-100
    for (const v of resultat.votes) {
      expect(v.degradation).toBeGreaterThanOrEqual(0)
      expect(v.degradation).toBeLessThanOrEqual(100)
      expect(['ok', 'erreur']).toContain(v.statut)
    }
  })

  test('profil stable → niveau faible et indice global bas', () => {
    const resultat = lancerDiagnosticOrchestrateur({
      aerodromeId: 'LFOB',
      profil: makeProfil(),
      ecarts: [],
    })
    expect(resultat.indiceGlobal).toBeLessThan(40)
    expect(resultat.niveau).toBe('faible')
  })

  test('profil dégradé + écarts critiques → indice plus élevé et niveau non faible', () => {
    const stable = lancerDiagnosticOrchestrateur({
      aerodromeId: 'LFOB',
      profil: makeProfil(),
      ecarts: [],
    })
    const degrade = lancerDiagnosticOrchestrateur({
      aerodromeId: 'LFOB',
      profil: makeProfil({ score_global: 25, niveau: 'critique', c1: 15, c2: 20, c3: 30, c4: 25, c5: 20 }),
      ecarts: [
        makeEcart({ id: 'a', statut: 'ouvert', niveau_risque: 'critique' }),
        makeEcart({ id: 'b', statut: 'en_retard', niveau_risque: 'critique', domaine: 'SGS' }),
        makeEcart({ id: 'c', statut: 'ouvert', niveau_risque: 'eleve' }),
      ],
      contexteML: { rfAccuracy: 0.35, benchmarkMeilleurScore: 30, modeleActifNom: 'XGBoost' },
    })
    expect(degrade.indiceGlobal).toBeGreaterThan(stable.indiceGlobal)
    expect(degrade.niveau).not.toBe('faible')
    // Le vote conformité signale les écarts critiques
    const conformite = degrade.votes.find(v => v.agent === 'conformite')
    expect(conformite?.statut).toBe('ok')
    expect(conformite?.interpretation).toMatch(/critique/)
  })

  test('conformité non applicable sans écarts → statut erreur, exclu de la fusion', () => {
    const resultat = lancerDiagnosticOrchestrateur({
      aerodromeId: 'LFOB',
      profil: makeProfil(),
      ecarts: [],
    })
    const conformite = resultat.votes.find(v => v.agent === 'conformite')
    expect(conformite?.statut).toBe('erreur')
    // Confiance nulle → le vote ne pèse pas dans l'indice global
    expect(conformite?.confiance).toBe(0)
  })
})

describe('persistance du journal', () => {
  test('le dernier diagnostic est retrouvé par aérodrome', () => {
    const resultat = lancerDiagnosticOrchestrateur({
      aerodromeId: 'LFOB',
      profil: makeProfil(),
      ecarts: [],
    })
    const histo = historiqueOrchestrateur('LFOB')
    expect(histo.length).toBeGreaterThanOrEqual(1)
    expect(lireDernierDiagnostic('LFOB')?.id).toBe(resultat.id)
  })

  test('les diagnostics sont isolés par aérodrome', () => {
    lancerDiagnosticOrchestrateur({ aerodromeId: 'LFOB', profil: makeProfil(), ecarts: [] })
    lancerDiagnosticOrchestrateur({ aerodromeId: 'LFPG', profil: makeProfil(), ecarts: [] })
    expect(historiqueOrchestrateur('LFOB')).toHaveLength(1)
    expect(historiqueOrchestrateur('LFPG')).toHaveLength(1)
    expect(historiqueOrchestrateur('LFOO')).toHaveLength(0)
  })

  test('l\'historique est borné et le plus récent en premier', () => {
    const premier = lancerDiagnosticOrchestrateur({ aerodromeId: 'LFOB', profil: makeProfil(), ecarts: [] })
    const second = lancerDiagnosticOrchestrateur({ aerodromeId: 'LFOB', profil: makeProfil(), ecarts: [] })
    const histo = historiqueOrchestrateur('LFOB')
    expect(histo).toHaveLength(2)
    expect(histo[0].id).toBe(second.id)
    expect(histo[1].id).toBe(premier.id)
  })
})
