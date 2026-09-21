// lib/__tests__/ecartsSlice.test.ts — Phase 2 (monolithe modulaire)
// Contrat du slice écarts (+PAC, preuves, historique, rappels), testé ISOLÉ
// via zustand/vanilla. Persistance mockée (doubles documentés).

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createEcartsSlice, type EcartSlice } from '../store/ecartsSlice'
import { storeEvents } from '../store/eventBus'

jest.mock('../datastore', () => ({
  createEcart: async (e: unknown) => ({ data: e, error: null }),
  updateEcart: async () => ({ error: null }),
  upsertEcart: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const base = {
  aerodrome_id: 'a1', surveillance_id: 's1', domaine: 'SGS', reference: 'E-1',
  ref_reglementaire: '', libelle: 'Libellé', niveau_risque: 'moyen' as const,
  statut: 'ouvert' as const, delai_pac: '', delai_regularisation: '',
  inspecteur_ref_id: 'insp-1', created_at: '', updated_at: '',
}

describe('ecartsSlice', () => {
  test('add : historique + recalcul + notification via événements (doubles documentés)', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    s.setState({
      user: null, utilisateurs: [], aerodromes: [],
    } as unknown as Partial<EcartSlice>)
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().addEcart({ ...base, id: 'e1' })
    // Le slice ÉMET au lieu d'appeler les autres slices directement.
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    // Aucun exploitant stubbé → aucune notification émise.
    expect(spy.mock.calls.filter(c => c[0] === 'notification:envoyer')).toHaveLength(0)
    spy.mockRestore()
    expect(s.getState().ecarts).toHaveLength(1)
    expect(s.getState().getHistoriqueEcart('e1')).toHaveLength(1)
    expect(s.getState().getActiveEcarts()).toHaveLength(1)
  })

  test('opérateur cantonné à son aérodrome', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    s.setState({
      user: { id: 'op', role: 'focal_operator', aerodrome_id: 'a1' },
    } as unknown as Partial<EcartSlice>)
    await expect(s.getState().addEcart({ ...base, id: 'e2', aerodrome_id: 'a2' }))
      .rejects.toThrow('votre aérodrome')
  })

  test('soumettrePAC : version + statut + historique', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    s.setState({
      utilisateurs: [], aerodromes: [], addNotification: () => {},
      getUtilisateur: () => undefined,
    } as unknown as Partial<EcartSlice>)
    s.getState().setEcarts([{ ...base, id: 'e1' }])
    await s.getState().soumettrePAC('e1', {
      actions: [], observations: '', fichiers: [], soumis_par: 'op-1',
    })
    const updated = s.getState().ecarts[0]
    expect(updated.statut).toBe('pac_soumis')
    expect(updated.pac?.version).toBe(1)
    expect(updated.pac?.soumis_le).toBeTruthy()
    expect(s.getState().getHistoriqueEcart('e1')).toHaveLength(1)
  })

  test('getDelaiRestant : couleurs et dépassement', () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    const futur = new Date(Date.now() + 10 * 86400000).toISOString()
    const passe = new Date(Date.now() - 2 * 86400000).toISOString()
    // Statut ouvert → délai PAC ; autres statuts → délai régularisation.
    const ok = s.getState().getDelaiRestant({ ...base, id: 'e1', delai_pac: futur, delai_regularisation: futur })
    expect(ok.depasse).toBe(false)
    expect(ok.couleur).toBe('orange')
    const ko = s.getState().getDelaiRestant({ ...base, id: 'e2', statut: 'en_retard', delai_regularisation: passe })
    expect(ko.depasse).toBe(true)
    expect(ko.couleur).toBe('rouge')
  })

  test('marquerEcartEnRetard + statistiques', () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    // Doubles : marquage notifie l'inspecteur référent (store composé en prod).
    s.setState({
      getUtilisateur: () => undefined,
      addNotification: () => {},
    } as unknown as Partial<EcartSlice>)
    s.getState().setEcarts([
      { ...base, id: 'e1', statut: 'pac_soumis' },
      { ...base, id: 'e2', statut: 'cloture' },
    ])
    s.getState().marquerEcartEnRetard('e1')
    expect(s.getState().ecarts[0].statut).toBe('en_retard')
    const stats = s.getState().getStatistiquesPAC('a1')
    expect(stats.total).toBe(2)
  })
})
