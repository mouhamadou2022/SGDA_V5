// lib/__tests__/storeSlicesFinal.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices profils-risque + workflow, testés ISOLÉS via
// zustand/vanilla. Moteur de score réel (pas de mock métier).

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createProfilsSlice, type ProfilRisqueSlice } from '../store/profilsSlice'
import { createWorkflowSlice, type WorkflowSlice } from '../store/workflowSlice'
import type { Surveillance } from '../store/surveillancesSlice'

jest.mock('../datastore', () => ({
  upsertProfilRisque: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

describe('profilsSlice', () => {
  test('set/get + assainissement NaN', async () => {
    const s = isolated<ProfilRisqueSlice>(createProfilsSlice)
    await s.getState().setProfilRisque('a1', {
      aerodrome_id: 'a1', score_global: NaN, niveau: 'moyen' as const,
      c1: 1, c2: 2, c3: 3, c4: 4, c5: 5,
      prediction_3m: 1, prediction_6m: 1, tendance: 'stable' as const, computed_at: '',
    })
    const profil = s.getState().getProfilRisque('a1')
    expect(profil).toBeTruthy()
    // NaN assaini vers le défaut 50, jamais propagé
    expect(profil!.score_global).toBe(50)
    expect(s.getState().getProfilRisque('inconnu')).toBeNull()
  })

  test('recalculerProfilRisque : moteur réel, score borné (doubles documentés)', async () => {
    const s = isolated<ProfilRisqueSlice>(createProfilsSlice)
    s.setState({
      ecarts: [], surveillances: [],
      aerodromes: [{ id: 'a1', maturite_sgs: 50, statut_sgs: 'complet' }],
      evenements: [], reponsesEnquetes: [], historiqueScores: {},
      addScoreHistoryPoint: () => {},
      getExemptionsActives: () => [],
      amdecAnalyses: [],
      computeFullRiskProfile: async () => {},
      updateExemption: () => {},
    } as unknown as Partial<ProfilRisqueSlice>)
    await s.getState().recalculerProfilRisque('a1')
    const profil = s.getState().getProfilRisque('a1')
    expect(profil).toBeTruthy()
    expect(profil!.score_global).toBeGreaterThanOrEqual(0)
    expect(profil!.score_global).toBeLessThanOrEqual(100)
    expect(['faible', 'moyen', 'eleve', 'critique']).toContain(profil!.niveau)
    expect(profil!.tendance).toBe('stable')
  })
})

describe('workflowSlice', () => {
  test('getProchaineEtape : mapping complet du cycle', () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    const g = s.getState().getProchaineEtape
    const base = { id: 's1' } as Surveillance
    expect(g({ ...base, statut: 'planifiee' }).type).toBe('checklist')
    expect(g({ ...base, statut: 'checklist_signee' }).type).toBe('ecarts')
    expect(g({ ...base, statut: 'ecarts_signes' }).type).toBe('rapport')
    expect(g({ ...base, statut: 'rapport_signe' }).type).toBe('lettre')
    expect(g({ ...base, statut: 'lettre_signee' }).type).toBe('transmission')
    expect(g({ ...base, statut: 'transmise' }).type).toBeNull()
    expect(g({ ...base, statut: 'archivee' }).type).toBeNull()
  })

  test('peutPasserEtape : planifiee OK, en_cours exige 100% (doubles documentés)', () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    // Double : progression 100% forcée via checklist persistée complète.
    s.setState({
      surveillances: [{
        id: 's1', statut: 'planifiee', portee: ['PHY'],
        checklist_hierarchy: [{
          id: 'd', nom: 'PHY', description: '', items: [
            { id: 'i1', resultat: 'SA' },
          ], sousDomaines: [], isExpanded: true, progression: 100, ordre: 1,
        }],
      }],
      checklistItems: {},
      ecartsRedaction: [],
      calculerProgression: () => 100,
      getItemsNSNV: () => [],
    } as unknown as Partial<WorkflowSlice>)
    expect(s.getState().peutPasserEtape('s1')).toEqual({ peut: true })
    expect(s.getState().peutPasserEtape('nope')).toEqual({ peut: false, raison: 'Surveillance introuvable' })
  })

  test('passerEtapeSuivante bloquée sans prérequis (aucun effet de bord)', async () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    s.setState({
      surveillances: [{ id: 's1', statut: 'transmise', portee: ['PHY'] }],
      checklistItems: {},
      ecartsRedaction: [],
      ecarts: [],
      calculerProgression: () => 0,
      peutPasserEtape: () => ({ peut: false, raison: 'Bloqué (test)' }),
      addNotification: () => {},
      user: null,
    } as unknown as Partial<WorkflowSlice>)
    const res = await s.getState().passerEtapeSuivante('s1')
    expect(res.ok).toBe(false)
    expect(res.raison).toBe('Bloqué (test)')
  })
})
