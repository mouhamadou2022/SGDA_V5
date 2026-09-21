// lib/__tests__/storeSlicesEngines.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices moteurs/mémoires/analytics, testés ISOLÉS via
// zustand/vanilla. Les singletons sous-jacents (riskEngine, mémoires,
// learning) sont purs et fonctionnent sans store.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createRiskEnginesSlice, type RiskEngineSlice } from '../store/riskEnginesSlice'
import { createChecklistMemorySlice, type ChecklistMemorySlice } from '../store/checklistMemorySlice'
import { createLearningEnginesSlice, type LearningEngineSlice } from '../store/learningEnginesSlice'
import { createPacLearningSlice, type PACLearningEngineSlice } from '../store/pacLearningSlice'
import { createRiskAnalyticsSlice, type RiskAnalyticsSlice } from '../store/riskAnalyticsSlice'
import type { ProfilRisque } from '../store'

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const profil = {
  aerodrome_id: 'a1', score_global: 70, niveau: 'moyen' as const,
  c1: 70, c2: 70, c3: 70, c4: 70, c5: 70,
  prediction_3m: 70, prediction_6m: 70, tendance: 'stable' as const,
  computed_at: '',
} as ProfilRisque

describe('riskEnginesSlice', () => {
  test('determineChecklistType délègue + mémorise la décision', async () => {
    const s = isolated<RiskEngineSlice>(createRiskEnginesSlice)
    const decision = await s.getState().determineChecklistType(profil, [], 'periodique')
    expect(decision).toBeTruthy()
    expect(s.getState().decisionChecklist).toBe(decision)
  })

  test('detecteurs synchrones', () => {
    const s = isolated<RiskEngineSlice>(createRiskEnginesSlice)
    expect(Array.isArray(s.getState().detectUrgentEcarts([], profil))).toBe(true)
    expect(Array.isArray(s.getState().detectDomainDegradations(profil))).toBe(true)
    expect(['critique', 'haute', 'moyenne', 'basse']).toContain(s.getState().calculateGlobalPriority(profil))
  })
})

describe('checklistMemorySlice', () => {
  test('versions rapport + modifications planning (surveillances/plannings stubbés)', () => {
    const s = isolated<ChecklistMemorySlice>(createChecklistMemorySlice)
    s.setState({
      surveillances: [{ id: 's1' }],
      plannings: [{ id: 'p1' }],
    } as unknown as Partial<ChecklistMemorySlice>)
    s.getState().addRapportVersion('s1', { a: '1' }, 'u1', 'U')
    s.getState().addRapportVersion('s1', { a: '2' }, 'u1', 'U')
    const surv = (s.getState() as unknown as { surveillances: { rapport_versions: string }[] }).surveillances[0]
    expect(JSON.parse(surv.rapport_versions)).toHaveLength(2)
    // La comparaison se fait contre rapport_sections (persisté à la sauvegarde) :
    // une fois les sections à jour, même contenu → no-op.
    s.setState({
      surveillances: [{ id: 's1', rapport_sections: JSON.stringify({ a: '2' }) }],
    } as unknown as Partial<ChecklistMemorySlice>)
    s.getState().addRapportVersion('s1', { a: '2' }, 'u1', 'U')
    const surv2 = (s.getState() as unknown as { surveillances: { rapport_versions: string }[] }).surveillances[0]
    expect(surv2.rapport_versions).toBeUndefined()
    s.getState().addPlanningModification('p1', 'u1', 'U', 'statut', 'a', 'b')
    const plans = (s.getState() as unknown as { plannings: { planning_modifications: string }[] }).plannings
    expect(JSON.parse(plans[0].planning_modifications)).toHaveLength(1)
    // Inconnu → no-op
    s.getState().addRapportVersion('nope', { a: 'x' }, 'u1', 'U')
  })

  test('upsert/getPrediction via singleton', () => {
    const s = isolated<ChecklistMemorySlice>(createChecklistMemorySlice)
    s.getState().upsertItemHistory('a1', 'periodique', 'SGS', '', '', {
      id: 'it-1', numero: '1', point_verification: 'PV',
    }, 's1')
    expect(s.getState().checklistMemoryRecords.length).toBeGreaterThan(0)
    const pred = s.getState().getPredictionForItem('a1', 'periodique', 'SGS', '', '', {
      id: 'it-1', numero: '1', point_verification: 'PV',
    })
    expect(pred).toBeTruthy()
  })
})

describe('learningEnginesSlice', () => {
  test('feedback + alertes + reset', () => {
    const s = isolated<LearningEngineSlice>(createLearningEnginesSlice)
    const fb = s.getState().recordLearningFeedback('a1', 'SGS', '', 'it-1', 'SA', 90, 'SA', 'ok')
    expect(fb).toBeTruthy()
    expect(s.getState().learningFeedbacks.length).toBeGreaterThan(0)
    expect(Array.isArray(s.getState().checkForAlerts())).toBe(true)
    expect(Array.isArray(s.getState().getPendingAlerts())).toBe(true)
    const stats = s.getState().calculatePerformance()
    expect(stats.total_feedbacks).toBeGreaterThan(0)
    s.getState().resetLearningData()
    expect(s.getState().learningFeedbacks).toHaveLength(0)
  })
})

describe('pacLearningSlice', () => {
  const contexte = {
    score_global: 60, tendance: 'stable', c4: 50, nb_ecarts_critiques: 0,
    type_inspection: 'periodique', delai_restant: 30,
  }
  const contextePreuves = { score_global: 60, nb_preuves: 2, delai_restant: 30 }
  test('feedbacks PAC/preuves + stats', () => {
    const s = isolated<PACLearningEngineSlice>(createPacLearningSlice)
    s.getState().enregistrerFeedbackPAC('e1', 'a1', contexte, ['c1'], ['c1'], 'accepte', 'accepte', 'oui')
    s.getState().enregistrerFeedbackPreuves('e1', 'a1', contextePreuves, ['c1'], ['c2'], 'valide', 'refuse', 'peu')
    expect(s.getState().pacFeedbacks).toHaveLength(1)
    expect(s.getState().preuveFeedbacks).toHaveLength(1)
    // Les stats sont calculées par le singleton moteur (état global partagé),
    // pas par les tableaux du store : on vérifie la forme, pas le total.
    const stats = s.getState().getLearningStatsPAC()
    expect(stats.total_feedbacks).toBeGreaterThanOrEqual(1)
    expect(typeof s.getState().getPACPriorite(contexte)).toBe('number')
  })
})

describe('riskAnalyticsSlice', () => {
  test('historique + alertes proactives + effectiveness', () => {
    const s = isolated<RiskAnalyticsSlice>(createRiskAnalyticsSlice)
    s.getState().addScoreHistoryPoint('a1', { date: '2026-01-01', score: 70 })
    s.getState().addScoreHistoryPoint('a1', { date: '2026-02-01', score: 72 })
    expect(s.getState().getHistoricalScoresForAerodrome('a1')).toHaveLength(2)
    expect(typeof s.getState().computeEffectivenessScore('a1')).toBe('number')
    s.getState().addProactiveAlert({
      id: 'al-1', aerodrome_id: 'a1', created_at: '', niveau_urgence: 'alerte',
      probabilite_degradation_3m: 1, probabilite_seuil30_3m: 1, message_court: '',
      message_long: '', action_suggerer: '', acknowledged_at: null, resolved_at: null,
    })
    s.getState().acknowledgeProactiveAlert('al-1')
    s.getState().resolveAlert('al-1')
    const alert = (s.getState() as unknown as { proactiveAlerts: { resolved_at: string | null }[] }).proactiveAlerts[0]
    expect(alert.resolved_at).toBeTruthy()
  })

  test('hawkes + modèles (écarts stubbés)', () => {
    const s = isolated<RiskAnalyticsSlice>(createRiskAnalyticsSlice)
    s.setState({ ecarts: [] } as unknown as Partial<RiskAnalyticsSlice>)
    const hawkes = s.getState().getHawkesRiskForAerodrome('a1')
    expect(hawkes.riskNext30Days).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(s.getState().getRecurrentPatterns('a1'))).toBe(true)
    expect(s.getState().getTransferPredictions('a1') instanceof Map).toBe(true)
  })
})
