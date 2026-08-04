// lib/__tests__/actionsIAStore.test.ts
// Vérifie que le store partagé des actions IA permet de partager les actions
// entre l'onglet « Anticipation » et l'onglet « Actions » sans double appel réseau.

import { useActionsIAStore } from '@/lib/state/actionsIAStore'
import type { ActionConcrete } from '@/lib/risque/recommendations'

function makeAction(priorite: ActionConcrete['priorite']): ActionConcrete {
  return {
    titre: `Action ${priorite}`,
    constat: 'Constat',
    verification: 'Vérification',
    priorite,
    echeance: '7 jours',
    impactAttendu: 'Impact mesurable',
    donnees: {},
  }
}

describe('useActionsIAStore', () => {
  beforeEach(() => {
    useActionsIAStore.getState().clear()
  })

  it('stocke et relit les actions par aérodrome', () => {
    const actions = [makeAction('immediate'), makeAction('moyenne')]
    useActionsIAStore.getState().setActions('aero-1', actions)

    expect(useActionsIAStore.getState().getActions('aero-1')).toEqual(actions)
    expect(useActionsIAStore.getState().getActions('aero-2')).toEqual([])
  })

  it('remplace les actions d’un aérodrome sans écraser les autres', () => {
    useActionsIAStore.getState().setActions('aero-1', [makeAction('immediate')])
    useActionsIAStore.getState().setActions('aero-2', [makeAction('basse')])

    useActionsIAStore.getState().setActions('aero-1', [makeAction('haute')])

    expect(useActionsIAStore.getState().getActions('aero-1')).toHaveLength(1)
    expect(useActionsIAStore.getState().getActions('aero-1')[0].priorite).toBe('haute')
    expect(useActionsIAStore.getState().getActions('aero-2')).toHaveLength(1)
  })

  it('expose la liste agrégée et le clear', () => {
    useActionsIAStore.getState().setActions('aero-1', [makeAction('immediate')])
    expect(useActionsIAStore.getState().actions).toHaveLength(1)

    useActionsIAStore.getState().clear()
    expect(useActionsIAStore.getState().actions).toHaveLength(0)
    expect(useActionsIAStore.getState().getActions('aero-1')).toEqual([])
  })
})
