// lib/__tests__/eventBus.test.ts — Monolithe modulaire
// Contrat du bus : typage, ordre synchrone, isolation des pannes, désabonnement.

import { StoreEventBus } from '../store/eventBus'

describe('eventBus', () => {
  test("émission synchrone dans l'ordre d'abonnement", () => {
    const bus = new StoreEventBus()
    const ordre: string[] = []
    bus.on('risque:recalcul-demande', () => { ordre.push('a') })
    bus.on('risque:recalcul-demande', () => { ordre.push('b') })
    bus.emit('risque:recalcul-demande', { aerodrome_id: 'a1' })
    expect(ordre).toEqual(['a', 'b'])
  })

  test('payload transmis tel quel', () => {
    const bus = new StoreEventBus()
    const recus: { planning_id: string; surveillance_id: string }[] = []
    bus.on('planning:mission-terminee', (p) => { recus.push(p) })
    bus.emit('planning:mission-terminee', { planning_id: 'p1', surveillance_id: 's1' })
    expect(recus).toEqual([{ planning_id: 'p1', surveillance_id: 's1' }])
  })

  test("panne d'un abonné : les autres reçoivent quand même", () => {
    const bus = new StoreEventBus()
    const recus: string[] = []
    const silence = jest.spyOn(console, 'error').mockImplementation(() => {})
    bus.on('risque:recalcul-demande', () => { throw new Error('boom') })
    bus.on('risque:recalcul-demande', () => { recus.push('ok') })
    expect(() => bus.emit('risque:recalcul-demande', { aerodrome_id: 'a1' })).not.toThrow()
    expect(recus).toEqual(['ok'])
    silence.mockRestore()
  })

  test('désabonnement via la fonction retournée', () => {
    const bus = new StoreEventBus()
    let n = 0
    const off = bus.on('risque:recalcul-demande', () => { n += 1 })
    bus.emit('risque:recalcul-demande', { aerodrome_id: 'a1' })
    off()
    bus.emit('risque:recalcul-demande', { aerodrome_id: 'a1' })
    expect(n).toBe(1)
  })

  test('émission sans abonné : no-op', () => {
    const bus = new StoreEventBus()
    expect(() => bus.emit('planning:mission-annulee', { planning_id: 'p1' })).not.toThrow()
    expect(bus.subscriberCount('planning:mission-annulee')).toBe(0)
  })
})
