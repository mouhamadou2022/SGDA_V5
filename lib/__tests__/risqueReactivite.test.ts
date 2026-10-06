// lib/__tests__/risqueReactivite.test.ts
// Le moteur de risque doit suivre les données : chaque mutation à impact
// (checklist signée, écart signé, PAC/prouves évalués, événement, exemption,
// réponse d'enquête, retard, site créé/modifié) ÉMET 'risque:recalcul-demande'.
// Tranches testées ISOLÉES (zustand/vanilla, persistance mockée).
import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createEcartsSlice, type EcartSlice } from '../store/ecartsSlice'
import { createEnquetesSlice, type EnqueteSlice } from '../store/enquetesSlice'
import { createExemptionsSlice, type ExemptionSlice } from '../store/exemptionsSlice'
import { createSurveillancesSlice, type SurveillanceSlice } from '../store/surveillancesSlice'
import { storeEvents } from '../store/eventBus'

jest.mock('../datastore', () => ({
  createEcart: async (e: unknown) => ({ data: e, error: null }),
  updateEcart: async () => ({ error: null }),
  upsertEcart: async () => ({ error: null }),
  createReponseEnquete: async () => ({ error: null }),
  createSurveillance: async (s: unknown) => ({ data: s, error: null }),
  updateSurveillance: async () => ({ error: null }),
  deleteSurveillance: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const ECART = {
  aerodrome_id: 'a1', surveillance_id: 's1', domaine: 'SGS', reference: 'E-1',
  ref_reglementaire: '', libelle: 'Libellé', niveau_risque: 'moyen' as const,
  statut: 'ouvert' as const, delai_pac: '', delai_regularisation: '',
  inspecteur_ref_id: 'insp-1', created_at: '', updated_at: '',
}

describe('dynamisme risque', () => {
  test('soumettrePAC + evaluerPAC recalculent (C2)', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    // R4 — évaluateur qualifié (principal) requis.
    s.setState({ utilisateurs: [{ id: 'chef-1', type_inspecteur: 'inspecteur_principal' }], inspecteurs: [], aerodromes: [], surveillances: [], delegations: [], getUtilisateur: () => undefined } as unknown as Partial<EcartSlice>)
    s.getState().setEcarts([{ ...ECART, id: 'e1', surveillance_id: undefined }])
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().soumettrePAC('e1', { actions: [], observations: '', fichiers: [], soumis_par: 'op' } as never)
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockClear()
    await s.getState().evaluerPAC('e1', {
      note_pertinence: 3, note_exhaustivite: 3, note_precision: 3, note_specificite: 3,
      note_realisme: 3, note_coherence: 3, decision: 'accepte', evalue_par: 'chef-1',
      evalue_le: new Date().toISOString(),
    } as never)
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockRestore()
  })

  test('soumettrePreuves + evaluerPreuves recalculent (C2)', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    // R4 — validateur qualifié (principal) requis.
    s.setState({ utilisateurs: [{ id: 'chef-1', type_inspecteur: 'inspecteur_principal' }], inspecteurs: [], aerodromes: [], surveillances: [], delegations: [], getUtilisateur: () => undefined } as unknown as Partial<EcartSlice>)
    // Workflow valide : preuves seulement sur PAC accepté (garde store).
    s.getState().setEcarts([{ ...ECART, id: 'e1', surveillance_id: undefined, statut: 'pac_accepte' as const, pac: { actions: [], observations: '', fichiers: [], soumis_par: 'op', soumis_le: '', version: 1 } }])
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().soumettrePreuves('e1', { fichiers: [], commentaire: '', soumis_par: 'op' } as never)
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockClear()
    await s.getState().evaluerPreuves('e1', { decision: 'valide', valide_par: 'chef-1' } as never)
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockRestore()
  })

  test('gardes verrouillées : transitions hors workflow rejetées', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    s.setState({ utilisateurs: [], aerodromes: [], surveillances: [], delegations: [], getUtilisateur: () => undefined } as unknown as Partial<EcartSlice>)
    s.getState().setEcarts([{ ...ECART, id: 'e1', surveillance_id: undefined }]) // ouvert
    await expect(s.getState().soumettrePreuves('e1', { fichiers: [], commentaire: '', soumis_par: 'op' } as never))
      .rejects.toThrow('n\'est pas accepté')
    await expect(s.getState().evaluerPAC('e1', { decision: 'accepte', evalue_par: 'x' } as never))
      .rejects.toThrow('pas de PAC soumis')
    await expect(s.getState().evaluerPreuves('e1', { decision: 'valide', valide_par: 'x' } as never))
      .rejects.toThrow('aucune preuve soumise')
  })

  test('marquerEcartEnRetard recalcule une fois (anti-doublon C4)', () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    s.setState({ utilisateurs: [], getUtilisateur: () => undefined } as unknown as Partial<EcartSlice>)
    s.getState().setEcarts([{ ...ECART, id: 'e1' }])
    const spy = jest.spyOn(storeEvents, 'emit')
    s.getState().marquerEcartEnRetard('e1')
    s.getState().marquerEcartEnRetard('e1')
    const recalc = spy.mock.calls.filter(c => c[0] === 'risque:recalcul-demande')
    expect(recalc).toHaveLength(1)
    spy.mockRestore()
  })

  test('updateEcart ne recalcule que sur champ à impact risque', async () => {
    const s = isolated<EcartSlice>(createEcartsSlice)
    s.setState({} as unknown as Partial<EcartSlice>)
    s.getState().setEcarts([{ ...ECART, id: 'e1' }])
    const spy = jest.spyOn(storeEvents, 'emit')
    await s.getState().updateEcart('e1', { libelle: 'Retouche sans impact' })
    expect(spy.mock.calls.filter(c => c[0] === 'risque:recalcul-demande')).toHaveLength(0)
    await s.getState().updateEcart('e1', { niveau_risque: 'eleve' })
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockRestore()
  })

  test('soumettreReponse recalcule (C1)', () => {
    const s = isolated<EnqueteSlice>(createEnquetesSlice)
    const spy = jest.spyOn(storeEvents, 'emit')
    s.getState().soumettreReponse({
      enquete_id: 'q1', aerodrome_id: 'a1', repondant_id: 'u1',
      repondant_nom: 'T', repondant_role: 'inspector', reponses: {}, score_c1: 4,
    })
    expect(spy).toHaveBeenCalledWith('risque:recalcul-demande', { aerodrome_id: 'a1' })
    spy.mockRestore()
  })

  test('surveillances : statut, score et suppression recalculent (C3)', async () => {
    const s = isolated<SurveillanceSlice>(createSurveillancesSlice)
    s.setState({
      aerodromes: [{ id: 'a1', code_oaci: 'GOOO' }], utilisateurs: [], incrementerVersion: () => {},
    } as unknown as Partial<SurveillanceSlice>)
    s.getState().setSurveillances([{
      id: 's1', aerodrome_id: 'a1', type: 'periodique', portee: ['PHY'],
      equipe_ids: [], chef_id: 'c1', date_debut: '2026-01-01', date_fin: '2026-01-03',
      statut: 'en_cours', score_global: 70, created_at: '', updated_at: '',
    }])
    const spy = jest.spyOn(storeEvents, 'emit')
    const recalc = () => spy.mock.calls.filter(c => c[0] === 'risque:recalcul-demande').length
    // Signature checklist → C3.
    await s.getState().updateSurveillance('s1', { statut: 'checklist_signee' })
    expect(recalc()).toBe(1)
    // Score seul (recalcul conformité) → C3 aussi.
    await s.getState().updateSurveillance('s1', { score_global: 80 })
    expect(recalc()).toBe(2)
    // Même statut, rien de score → aucun recalcul.
    await s.getState().updateSurveillance('s1', { statut: 'checklist_signee' })
    expect(recalc()).toBe(2)
    spy.mockRestore()
  })

  test('exemptions : add/update pertinent/delete recalculent (C3), traçabilité non', () => {
    const s = isolated<ExemptionSlice>(createExemptionsSlice)
    const spy = jest.spyOn(storeEvents, 'emit')
    const recalc = () => spy.mock.calls.filter(c => c[0] === 'risque:recalcul-demande').length
    s.getState().addExemption({ aerodrome_id: 'a1', statut: 'active' } as never)
    expect(recalc()).toBe(1)
    const id = (s.getState() as unknown as { exemptions: Array<{ id: string }> }).exemptions[0].id
    // Écriture de traçabilité du recalcul lui-même → JAMAIS de boucle.
    s.getState().updateExemption(id, { dernier_recalcul_risque: 'x', dernier_score_c3_ajuste: 50 } as never)
    expect(recalc()).toBe(1)
    // Décision métier → recalcul.
    s.getState().updateExemption(id, { avis_final: 'favorable' } as never)
    expect(recalc()).toBe(2)
    s.getState().deleteExemption(id)
    expect(recalc()).toBe(3)
    spy.mockRestore()
  })
})
