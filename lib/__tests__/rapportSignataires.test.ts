// lib/__tests__/rapportSignataires.test.ts — R3 : le rapport exige la
// signature de tous les titulaires/principaux de l'équipe (chef compris),
// observateurs exclus. Observateurs ne signent aucune checklist.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createWorkflowSlice, type WorkflowSlice } from '../store/workflowSlice'

jest.mock('../datastore', () => ({
  updateSurveillance: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const SURV = {
  id: 's1',
  aerodrome_id: 'aero-1',
  statut: 'rapport_signe',
  portee: ['PHY'],
  equipe_ids: ['u-tit', 'u-tit2', 'u-sta'],
  chef_id: 'u-tit',
  signatures_rapport: [],
}

function base(extra: Record<string, unknown> = {}) {
  const s = isolated<WorkflowSlice>(createWorkflowSlice)
  s.setState({
    surveillances: [{ ...SURV }],
    utilisateurs: [
      { id: 'u-tit', type_inspecteur: 'inspecteur_titulaire' },
      { id: 'u-tit2', type_inspecteur: 'inspecteur_principal' },
      { id: 'u-sta', type_inspecteur: 'inspecteur_stagiaire' },
    ],
    inspecteurs: [],
    ecartsRedaction: [],
    getItemsNSNV: () => [],
    ...extra,
  } as unknown as Partial<WorkflowSlice>)
  return s
}

const sig = (id: string) => ({ signataire_id: id, signataire_nom: id, date_signature: '2026-01-01', signature_url: 'x' })

describe('rapport_signe — signataires qualifiés requis', () => {
  test('un titulaire manquant → bloqué (stagiaire signé ne suffit pas)', () => {
    const s = base()
    s.setState({ surveillances: [{ ...SURV, signatures_rapport: [sig('u-tit'), sig('u-sta')] }] } as never)
    const res = s.getState().peutPasserEtape('s1')
    expect(res.peut).toBe(false)
    expect(res.raison).toMatch(/qualifié/);
  })
  test('tous titulaires/principaux → OK (observateur non requis)', () => {
    const s = base()
    s.setState({ surveillances: [{ ...SURV, signatures_rapport: [sig('u-tit'), sig('u-tit2')] }] } as never)
    expect(s.getState().peutPasserEtape('s1').peut).toBe(true)
  })
})

describe('signerChecklistSurveillance — observateur rejeté', () => {
  test('stagiaire ne signe pas', async () => {
    const s = base({
      updateSurveillance: async () => {},
      updateDelegation: () => {},
      getDelegationsBySurveillance: () => [],
    })
    s.setState({
      surveillances: [{ ...SURV, statut: 'en_cours' }],
      utilisateurs: [{ id: 'u-sta', type_inspecteur: 'inspecteur_stagiaire' }],
    } as never)
    const res = await s.getState().signerChecklistSurveillance('s1', {
      signataire_id: 'u-sta', signataire_nom: 'Stagiaire', signature_url: 'x',
    } as never)
    expect(res.ok).toBe(false)
    expect(res.raison).toMatch(/titulaires et principaux/);
  })
})
