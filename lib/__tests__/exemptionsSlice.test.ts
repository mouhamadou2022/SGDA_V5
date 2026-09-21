// lib/__tests__/exemptionsSlice.test.ts — Phase 2 (monolithe modulaire)
// Contrat du slice exemptions : testé ISOLÉ du store monolithique via
// zustand/vanilla. Le créateur est typé pour le AppStore complet (accès
// get() inter-slices possible) ; à l'exécution il ne touche que ses clés.
// Le cast ci-dessous documente cet écart sans changer le comportement.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import {
  createExemptionsSlice,
  type Exemption,
  type ExemptionSlice,
} from '../store/exemptionsSlice'

function makeStore(initial: Exemption[] = []) {
  const store = createStore<ExemptionSlice>()(
    createExemptionsSlice as unknown as StateCreator<ExemptionSlice, [], [], ExemptionSlice>,
  )
  if (initial.length > 0) store.getState().setExemptions(initial)
  return store
}

const base: Omit<Exemption, 'id' | 'created_at' | 'updated_at'> = {
  reference: 'EX-2026-001',
  aerodrome_id: 'aero-1',
  description: 'Exemption test',
  decision: 'acceptee',
  date_debut: '2026-01-01',
  date_fin_prevue: '2027-01-01',
  duree_mois: 12,
  statut: 'active',
  mesures: [],
}

describe('exemptionsSlice — CRUD', () => {
  test('addExemption génère id + timestamps', () => {
    const s = makeStore()
    s.getState().addExemption(base)
    const all = s.getState().exemptions
    expect(all).toHaveLength(1)
    expect(all[0].id).toBeTruthy()
    expect(all[0].created_at).toBeTruthy()
    expect(all[0].reference).toBe('EX-2026-001')
  })

  test('updateExemption fusionne + touche updated_at', () => {
    const s = makeStore()
    s.getState().addExemption(base)
    const id = s.getState().exemptions[0].id
    s.getState().updateExemption(id, { statut: 'cloturee' })
    const updated = s.getState().exemptions[0]
    expect(updated.statut).toBe('cloturee')
    expect(updated.reference).toBe('EX-2026-001')
  })

  test('deleteExemption retire la fiche', () => {
    const s = makeStore()
    s.getState().addExemption(base)
    const id = s.getState().exemptions[0].id
    s.getState().deleteExemption(id)
    expect(s.getState().exemptions).toHaveLength(0)
  })

  test('setExemptions remplace le lot', () => {
    const s = makeStore()
    s.getState().addExemption(base)
    s.getState().setExemptions([])
    expect(s.getState().exemptions).toHaveLength(0)
  })
})

describe('exemptionsSlice — sélecteurs', () => {
  const active: Exemption = {
    ...base, id: 'ex-active', created_at: '', updated_at: '',
    aerodrome_id: 'aero-1', statut: 'active', date_fin_prevue: '2027-06-01',
  }
  const expiree: Exemption = {
    ...base, id: 'ex-expiree', created_at: '', updated_at: '',
    aerodrome_id: 'aero-1', statut: 'active', date_fin_prevue: '2020-01-01',
  }
  const autreAero: Exemption = {
    ...base, id: 'ex-autre', created_at: '', updated_at: '',
    aerodrome_id: 'aero-2', statut: 'active', date_fin_prevue: '2027-06-01',
  }
  const sansDate: Exemption = {
    ...base, id: 'ex-sans-date', created_at: '', updated_at: '',
    aerodrome_id: 'aero-1', statut: 'active', date_fin_prevue: undefined,
  }

  test('getExemptionsActives : active + date future + même aérodrome uniquement', () => {
    const s = makeStore([active, expiree, autreAero, sansDate])
    const result = s.getState().getExemptionsActives('aero-1')
    expect(result.map(e => e.id)).toEqual(['ex-active'])
  })

  test('getExemptionsByAerodrome / getExemptionsByParent filtrent', () => {
    const parent: Exemption = {
      ...base, id: 'ex-parent', created_at: '', updated_at: '',
      parent_id: 'cert-1',
    }
    const s = makeStore([active, autreAero, parent])
    expect(s.getState().getExemptionsByAerodrome('aero-1').map(e => e.id))
      .toEqual(expect.arrayContaining(['ex-active', 'ex-parent']))
    expect(s.getState().getExemptionsByParent('cert-1').map(e => e.id)).toEqual(['ex-parent'])
    expect(s.getState().getExemptionsByParent('inconnu')).toEqual([])
  })
})

describe('exemptionsSlice — mesures', () => {
  test('ajouter + mettre à jour une mesure', () => {
    const s = makeStore()
    s.getState().addExemption(base)
    const id = s.getState().exemptions[0].id
    s.getState().ajouterMesureAtténuation(id, {
      description: 'Mesure 1',
      responsable: 'Exploitant',
      date_debut: '2026-01-01',
      date_fin_prevue: '2026-06-01',
      statut: 'en_cours',
      declencher_inspection_si_retard: false,
    })
    let mesures = s.getState().getMesuresByExemption(id)
    expect(mesures).toHaveLength(1)
    expect(mesures[0].id).toBeTruthy()
    const mesureId = mesures[0].id
    s.getState().updateMesureAtténuation(id, mesureId, { statut: 'en_retard' })
    mesures = s.getState().getMesuresByExemption(id)
    expect(mesures[0].statut).toBe('en_retard')
  })

  test('getMesuresByExemption inconnue → []', () => {
    const s = makeStore()
    expect(s.getState().getMesuresByExemption('nope')).toEqual([])
  })
})
