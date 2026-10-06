// lib/__tests__/sgsMaturiteReport.test.ts
// Report maturité SGS → aérodrome à la signature (bug Saint-Louis : N1→N3
// invisible partout car écrit avec un code OACI au lieu de l'id, ou jamais
// écrit selon le chemin de signature).
import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createWorkflowSlice, type WorkflowSlice } from '../store/workflowSlice'

jest.mock('../datastore', () => ({
  updateSurveillance: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const PREPA = {
  aerodromeId: 'aero-1',
  surveillanceId: 's1',
  date: '2026-09-01',
  inspecteurId: 'u1',
  inspecteurNom: 'Inspecteur Test',
  scoreGlobal: 60,
  composantes: [
    { id: 1, label: 'C1', poids: 1, prefixe: '1', score: 60, niveauGlobal: 'operationnel', elements: [] },
  ],
}

describe('signerChecklistSurveillance — report maturité SGS', () => {
  test('signature marquée SGS + prépa → updateAerodrome avec la maturité (vrai id)', async () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    const majAero: Array<{ id: string; data: unknown }> = []
    s.setState({
      surveillances: [{ id: 's1', aerodrome_id: 'aero-1', statut: 'en_cours', portee: ['SGS'], sgs_evaluation_prepa: PREPA }],
      // R3 — signataire qualifié (titulaire) requis pour signer.
      utilisateurs: [{ id: 'u1', type_inspecteur: 'inspecteur_titulaire' }],
      inspecteurs: [],
      updateSurveillance: async () => {},
      updateAerodrome: async (id: string, data: unknown) => { majAero.push({ id, data }) },
      updateDelegation: () => {},
      getDelegationsBySurveillance: () => [],
    } as unknown as Partial<WorkflowSlice>)
    const res = await s.getState().signerChecklistSurveillance('s1', {
      signataire_id: 'u1', signataire_nom: 'Inspecteur Test', signature_url: 'x', marque_sgs: true,
    } as never)
    expect(res.ok).toBe(true)
    expect(majAero).toHaveLength(1)
    expect(majAero[0].id).toBe('aero-1')
    expect(majAero[0].data).toMatchObject({ maturite_sgs: 60 })
  })

  test('rattrapage : signature déjà posée, maturité divergente → réparée', async () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    const majAero: Array<{ id: string; data: unknown }> = []
    s.setState({
      aerodromes: [{ id: 'aero-1', maturite_sgs: 20 }],
      surveillances: [{ id: 's1', aerodrome_id: 'aero-1', statut: 'en_cours', portee: ['SGS'], sgs_evaluation_signee_le: '2026-09-02', sgs_evaluation_prepa: PREPA }],
      updateSurveillance: async () => {},
      updateAerodrome: async (id: string, data: unknown) => { majAero.push({ id, data }) },
      updateDelegation: () => {},
      getDelegationsBySurveillance: () => [],
    } as unknown as Partial<WorkflowSlice>)
    const n = await s.getState().reparerMaturiteSGSNonReportee()
    expect(n).toBe(1)
    expect(majAero[0].id).toBe('aero-1')
    expect(majAero[0].data).toMatchObject({ maturite_sgs: 60 })
  })

  test('rattrapage : déjà cohérent → 0 écriture', async () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    let appels = 0
    s.setState({
      aerodromes: [{ id: 'aero-1', maturite_sgs: 60 }],
      surveillances: [{ id: 's1', aerodrome_id: 'aero-1', statut: 'en_cours', portee: ['SGS'], sgs_evaluation_signee_le: '2026-09-02', sgs_evaluation_prepa: PREPA }],
      updateSurveillance: async () => {},
      updateAerodrome: async () => { appels++ },
      updateDelegation: () => {},
      getDelegationsBySurveillance: () => [],
    } as unknown as Partial<WorkflowSlice>)
    expect(await s.getState().reparerMaturiteSGSNonReportee()).toBe(0)
    expect(appels).toBe(0)
  })

  test('sans marque SGS → aucun report (pas d’écrasement)', async () => {
    const s = isolated<WorkflowSlice>(createWorkflowSlice)
    let appels = 0
    s.setState({
      surveillances: [{ id: 's1', aerodrome_id: 'aero-1', statut: 'en_cours', portee: ['SGS'], sgs_evaluation_prepa: PREPA }],
      updateSurveillance: async () => {},
      updateAerodrome: async () => { appels++ },
      updateDelegation: () => {},
      getDelegationsBySurveillance: () => [],
    } as unknown as Partial<WorkflowSlice>)
    await s.getState().signerChecklistSurveillance('s1', {
      signataire_id: 'u1', signataire_nom: 'T', signature_url: 'x',
    } as never)
    expect(appels).toBe(0)
  })
})
