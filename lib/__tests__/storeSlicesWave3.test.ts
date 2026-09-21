// lib/__tests__/storeSlicesWave3.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices extraits en vague 3, testés ISOLÉS via zustand/vanilla.
// Doubles documentés pour les lectures inter-slices et la persistance.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createUISlice, type UISlice } from '../store/uiSlice'
import { createApiKeysSlice, type ApiKeySlice } from '../store/apiKeysSlice'
import { createCodesAccesSlice, type CodeAccesSlice } from '../store/codesAccesSlice'
import { createAuditSlice, type AuditSlice } from '../store/auditSlice'
import { createRegistresSlice, type RegistreSlice, type RegistreEntry } from '../store/registresSlice'
import { createRegistreIASlice, type RegistreIASlice } from '../store/registreIASlice'
import { createMasterChecklistsSlice, type MasterChecklistSlice } from '../store/masterChecklistsSlice'
import { createEnquetesSlice, type EnqueteSlice } from '../store/enquetesSlice'
import { createMessagerieSlice, type MessagerieSlice } from '../store/messagerieSlice'

jest.mock('../datastore', () => ({
  saveRegistreEntry: async (entry: unknown) => ({ data: entry, error: null }),
  deleteRegistreEntryFromDB: async () => ({ error: null }),
  createApiKey: async () => ({ error: null }),
  updateApiKey: async () => ({ error: null }),
  deleteApiKey: async () => ({ error: null }),
  createCodeAcces: async () => ({ error: null }),
  revokeCodeAcces: async () => ({ error: null }),
  deleteCodeAcces: async () => ({ error: null }),
  createMessage: async (msg: unknown) => ({ data: msg, error: null }),
  updateMessage: async () => ({ error: null }),
  deleteMessage: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

describe('uiSlice', () => {
  test('filtres fusionnés, chargement, module, source registre', () => {
    const s = isolated<UISlice>(createUISlice)
    s.getState().setFilters({ search: 'goo' })
    expect(s.getState().filters).toMatchObject({ search: 'goo', region: [] })
    s.getState().setViewMode('map')
    expect(s.getState().viewMode).toBe('map')
    s.getState().setLoading('k', true)
    expect(s.getState().isLoading['k']).toBe(true)
    s.getState().setActiveModule('planning')
    expect(s.getState().activeModule).toBe('planning')
    s.getState().setPendingRegistreSource({ type: 'certification', id: 'c1', aerodrome_id: 'a1' })
    expect(s.getState().pendingRegistreSource?.id).toBe('c1')
    s.getState().setPendingRegistreSource(null)
    expect(s.getState().pendingRegistreSource).toBeNull()
  })
})

describe('apiKeysSlice', () => {
  test('add/update avec rollback + delete', async () => {
    const s = isolated<ApiKeySlice>(createApiKeysSlice)
    await s.getState().addApiKey({ service: 's', key_value: 'k', is_active: true, fallback_order: 1 })
    expect(s.getState().apiKeys).toHaveLength(1)
    const id = s.getState().apiKeys[0].id
    await s.getState().updateApiKey(id, { is_active: false })
    expect(s.getState().apiKeys[0].is_active).toBe(false)
    await s.getState().deleteApiKey(id)
    expect(s.getState().apiKeys).toHaveLength(0)
  })
})

describe('codesAccesSlice', () => {
  test('genererCode : format + masquage + vérification', () => {
    const s = isolated<CodeAccesSlice>(createCodesAccesSlice)
    s.setState({ user: { id: 'u1' } } as unknown as Partial<CodeAccesSlice>)
    const created = s.getState().genererCode('a1', 'desc')
    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(created.code_partiel).not.toBe(created.code)
    expect(created.statut).toBe('actif')
    expect(s.getState().verifierCode(created.code)).toEqual({ valide: true, aerodromeId: 'a1' })
    expect(s.getState().verifierCode('ZZZZZZZZ')).toEqual({ valide: false })
    expect(s.getState().getCodesByAerodrome('a1')).toHaveLength(1)
  })

  test('code expiré → auto-révocation (utilisateurs stubbés)', async () => {
    const s = isolated<CodeAccesSlice>(createCodesAccesSlice)
    s.setState({ user: { id: 'u1' }, utilisateurs: [] } as unknown as Partial<CodeAccesSlice>)
    const created = s.getState().genererCode('a1', '', new Date(Date.now() - 1000).toISOString(), 'EXPIRE01')
    expect(s.getState().verifierCode('EXPIRE01')).toEqual({ valide: false })
    await Promise.resolve()
    expect(s.getState().codesAcces.find(c => c.id === created.id)?.statut).toBe('revogue')
  })
})

describe('auditSlice', () => {
  test('add + filtres + CSV', () => {
    const s = isolated<AuditSlice>(createAuditSlice)
    const base = {
      utilisateur_id: 'u1', utilisateur_nom: 'N', utilisateur_role: 'admin',
      action: 'creation' as const, module: 'planning', entite_type: 'planning', entite_id: 'p1',
    }
    s.getState().addAuditLog(base)
    s.getState().addAuditLog({ ...base, module: 'risque' })
    expect(s.getState().getLogsByUtilisateur('u1')).toHaveLength(2)
    expect(s.getState().getLogsByModule('planning')).toHaveLength(1)
    const csv = s.getState().exporterLogsCSV(s.getState().auditLogs)
    expect(csv.split('\n')).toHaveLength(3)
  })
})

describe('registresSlice', () => {
  const entry = {
    id: 'r1', type: 'surveillance' as const, reference: 'R', titre: 'T',
    description: '', date_entree: '', fichiers: [], timeline: [],
    statut: 'valide' as const, auto_generated: false, created_at: '', created_by: '',
  } satisfies RegistreEntry
  test('add/update/delete persistés (datastore mocké)', async () => {
    const s = isolated<RegistreSlice>(createRegistresSlice)
    await s.getState().addRegistreEntry(entry)
    expect(s.getState().registreEntries).toHaveLength(1)
    expect(s.getState().getRegistreByType('surveillance')).toHaveLength(1)
    await s.getState().updateRegistreEntry('r1', { statut: 'archive' })
    expect(s.getState().registreEntries[0].statut).toBe('archive')
    await s.getState().deleteRegistreEntry('r1')
    expect(s.getState().registreEntries).toHaveLength(0)
  })
})

describe('registreIASlice', () => {
  test('alertes < 30j non résolues + suggestions expert', () => {
    const s = isolated<RegistreIASlice>(createRegistreIASlice)
    const now = new Date().toISOString()
    s.getState().addRegulationAnalysis({
      id: 'a1', documentId: 'd', documentTitre: 't', documentType: 'x', version: '1',
      date_analyse: now, impact: 'majeur', impact_description: '', chapitres_modifies: [],
      formations_suggerees: [], inspecteurs_concernes: [], delai_mise_conformite: 1,
      status: 'pending', confidence: 1,
    })
    expect(s.getState().getPendingRegulationAlerts()).toHaveLength(1)
    s.getState().addFormationSuggestion({
      id: 'f1', titre: '', description: '', duree_heures: 1, priorite: 'haute',
      justification: '', public_cible: ['expert'], domaines: [], source_document_id: 'd',
      source_document_titre: 't', status: 'suggested', created_at: now,
    })
    expect(s.getState().getFormationSuggestionsByInspector('x')).toHaveLength(1)
  })
})

describe('masterChecklistsSlice', () => {
  const domaines = [
    { id: 'd1', nom: 'PHY', description: '', sousDomaines: [], isExpanded: true, progression: 0, ordre: 1 },
    { id: 'd2', nom: 'SGS', description: '', sousDomaines: [], isExpanded: true, progression: 0, ordre: 2 },
  ]
  test('cycle archive + versions + recherche (SGS exclu)', () => {
    const s = isolated<MasterChecklistSlice>(createMasterChecklistsSlice)
    s.getState().setMasterChecklist('QSC_1', domaines)
    s.getState().addTemplateVersion('QSC_1', domaines)
    expect(s.getState().templateVersions['QSC_1']).toHaveLength(1)
    const found = s.getState().findMasterChecklistForPortee(['PHY'])
    expect(found?.id).toBe('QSC_1')
    // SGS seul → null (SGS exclu de la portée)
    expect(s.getState().findMasterChecklistForPortee(['SGS'])).toBeNull()
    expect(s.getState().findMasterChecklistForPortee([])).toBeNull()
    // Domaines SGS filtrés du résultat
    expect(found?.checklist.map(d => d.nom)).toEqual(['PHY'])
    s.getState().archiveMasterChecklist('QSC_1')
    expect(s.getState().masterChecklists['QSC_1']).toBeUndefined()
    s.getState().unarchiveMasterChecklist('QSC_1')
    expect(s.getState().masterChecklists['QSC_1']).toHaveLength(2)
    s.getState().deleteMasterChecklist('QSC_1')
    expect(s.getState().masterChecklists['QSC_1']).toBeUndefined()
  })
})

describe('enquetesSlice', () => {
  test('CRUD + réponse + stats + impact C1', () => {
    const s = isolated<EnqueteSlice>(createEnquetesSlice)
    s.getState().addEnquete({
      reference: 'E', titre: 'T', description: '', type_enquete: 'x', aerodrome_ids: ['a1', 'a2'],
      questions: [], deadline: '', statut: 'active', created_by: '',
    })
    const id = s.getState().enquetes[0].id
    s.getState().soumettreReponse({
      enquete_id: id, aerodrome_id: 'a1', repondant_id: 'u', repondant_nom: 'n',
      repondant_role: 'r', reponses: {}, score_c1: 4,
    })
    const stats = s.getState().getStatistiquesEnquete(id)
    expect(stats).toMatchObject({ total_reponses: 1, taux_reponse: 50 })
    expect(s.getState().calculerImpactC1(s.getState().reponsesEnquetes)).toBe(80)
    expect(s.getState().calculerImpactC1([])).toBe(50)
  })
})

describe('messagerieSlice', () => {
  test('conversations groupées + non-lus + lecture', () => {
    const s = isolated<MessagerieSlice>(createMessagerieSlice)
    // Double : canal interne → pas de notification inter-slice.
    s.setState({ addNotification: () => {} } as unknown as Partial<MessagerieSlice>)
    const base = {
      canal: 'interne' as const, from_id: 'u1', from_nom: 'A', from_role: 'admin',
      to_id: 'u2', subject: 'S', body: 'Hello',
    }
    s.getState().envoyerMessage(base)
    s.getState().envoyerMessage({ ...base, conversation_id: 'c1', body: 'Re' })
    const convs = s.getState().getConversations('u2')
    expect(convs).toHaveLength(2)
    expect(s.getState().getMessagesNonLus('u2')).toBe(2)
    const id = s.getState().messages[0].id
    s.getState().marquerCommeLu(id)
    expect(s.getState().getMessagesNonLus('u2')).toBe(1)
    expect(s.getState().getMessagesConversation('c1')).toHaveLength(1)
  })
})
