// lib/__tests__/storeSlicesWave5.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices dossiers/formations/kit, testés ISOLÉS via zustand/vanilla.
// Persistance mockée (doubles documentés) : les slices écrivent l'état local
// puis synchronisent — le mock simule le succès serveur.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createDossiersSlice, type DossierSlice } from '../store/dossiersSlice'
import { createFormationsSlice, type FormationSlice } from '../store/formationsSlice'
import { createKitDocumentsSlice, type KitSlice } from '../store/kitDocumentsSlice'

jest.mock('../datastore', () => ({
  createDossier: async (d: unknown) => ({ data: d, error: null }),
  updateDossier: async () => ({ error: null }),
  deleteDossier: async () => ({ error: null }),
  createFormation: async (f: unknown) => ({ data: { ...(f as object), id: 'mock-id' }, error: null }),
  updateFormation: async () => ({ error: null }),
  deleteFormation: async () => ({ error: null }),
  checkMatriculeExists: async () => false,
  createInspecteur: async () => ({ error: null }),
  createCompetence: async () => ({ error: null }),
  deleteInspecteur: async () => ({ error: null }),
  deleteUtilisateur: async () => ({ error: null }),
  updateInspecteur: async () => ({ error: null }),
  createKitDocument: async (d: unknown) => ({ data: d, error: null }),
  updateKitDocument: async () => ({ data: null, error: null }),
  deleteKitDocument: async () => ({ error: null }),
}))

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

describe('dossiersSlice', () => {
  const base = {
    titre: 'T', reference: 'R', categorie: 'technique' as const,
    service_assigne: 'securite_aerodromes' as const,
    date_instruction: '', date_limite: '', fichiers: [], progression: 0,
    statut: 'en_attente' as const, assignments: [], created_by: 'u1',
  }
  test('add + getDossiersUrgents', async () => {
    const s = isolated<DossierSlice>(createDossiersSlice)
    s.setState({ user: { id: 'u1' } } as unknown as Partial<DossierSlice>)
    const created = await s.getState().addDossier(base)
    expect(created?.historique).toHaveLength(1)
    expect(s.getState().getDossiersUrgents()).toHaveLength(1)
  })

  test('addAssignment alimente assignments + historique', async () => {
    const s = isolated<DossierSlice>(createDossiersSlice)
    s.setState({ user: { nom: 'Chef' } } as unknown as Partial<DossierSlice>)
    const created = await s.getState().addDossier(base)
    await s.getState().addAssignment(created!.id, { inspecteur_id: 'i1', inspecteur_nom: 'I', statut: 'attribue', progression: 0 })
    const dossier = s.getState().dossiers[0]
    expect(dossier.assignments).toHaveLength(1)
    expect(dossier.assignments[0].statut).toBe('attribue')
    expect(dossier.historique.length).toBeGreaterThan(1)
  })

  test('archiverDossierAutomatique : terminé → archive + registre', async () => {
    const s = isolated<DossierSlice>(createDossiersSlice)
    s.setState({
      aerodromes: [{ id: 'a1' }],
      // Double : registreEntries vit dans le slice registres (store composé en prod).
      registreEntries: [],
    } as unknown as Partial<DossierSlice>)
    const created = await s.getState().addDossier({ ...base, statut: 'termine' })
    await s.getState().archiverDossierAutomatique(created!.id)
    expect(s.getState().dossiers[0].statut).toBe('archive')
    const registre = (s.getState() as unknown as { registreEntries: unknown[] }).registreEntries
    expect(registre).toHaveLength(1)
  })
})

describe('formationsSlice', () => {
  test('add/update/delete formation + version', async () => {
    const s = isolated<FormationSlice>(createFormationsSlice)
    await s.getState().addFormation({
      reference: 'F', titre: 'T', type: 'continue', domaines: ['SGS'], date: '',
      duree_heures: 1, lieu: '', formateur: '', participants: [], objectifs: '',
      statut: 'planifiee', created_by: '',
    })
    expect(s.getState().formations).toHaveLength(1)
    expect(s.getState().competencesVersion).toBe(1)
    const id = s.getState().formations[0].id
    await s.getState().updateFormation(id, { statut: 'terminee' })
    expect(s.getState().formations[0].statut).toBe('terminee')
    await s.getState().deleteFormation(id)
    expect(s.getState().formations).toHaveLength(0)
  })

  test('mettreAJourCompetences : remplace par domaine', () => {
    const s = isolated<FormationSlice>(createFormationsSlice)
    s.setState({
      formations: [{ id: 'f1', domaines: ['SGS', 'PHY'] }],
    } as unknown as Partial<FormationSlice>)
    s.getState().mettreAJourCompetences('insp-1', 'f1')
    const comps = s.getState().getCompetencesByInspecteur('insp-1')
    expect(comps.map(c => c.domaine).sort()).toEqual(['PHY', 'SGS'])
    expect(comps[0].niveau).toBe(3)
    // Second passage : pas de doublons
    s.getState().mettreAJourCompetences('insp-1', 'f1')
    expect(s.getState().getCompetencesByInspecteur('insp-1')).toHaveLength(2)
  })
})

describe('kitDocumentsSlice', () => {
  const docBase = {
    nom: 'Doc', type_document: 'guide' as const, version: '1', date_revision: '',
    etat: 'a_jour' as const, domaines: ['SGS'], fichier_url: '', fichier_nom: '',
    fichier_taille: 0, mots_cles: [], accessible_exploitant: false, created_by: '',
  }
  test('add/update/delete + partage/révocation', async () => {
    const s = isolated<KitSlice>(createKitDocumentsSlice)
    s.setState({
      user: { id: 'u1', prenom: 'A', nom: 'B' }, aerodromes: [{ id: 'a1' }],
      envoyerMessage: () => {},
    } as unknown as Partial<KitSlice>)
    const created = await s.getState().addKitDocument(docBase)
    expect(s.getState().kitDocuments).toHaveLength(1)
    await s.getState().updateKitDocument(created.id, { version: '2' })
    expect(s.getState().kitDocuments[0].version).toBe('2')
    s.getState().partagerKitDocumentExploitant(created.id, 'a1', 'msg')
    expect(s.getState().kitDocuments[0].accessible_exploitant).toBe(true)
    expect(s.getState().getDocumentsExploitant('a1')).toHaveLength(1)
    s.getState().revoquerPartageKitDocument(created.id, 'a1')
    expect(s.getState().kitDocuments[0].partage_exploitant?.[0].actif).toBe(false)
    await s.getState().deleteKitDocument(created.id)
    expect(s.getState().kitDocuments).toHaveLength(0)
  })

  test('getDocumentsByDomaine + preview + téléchargement', () => {
    const s = isolated<KitSlice>(createKitDocumentsSlice)
    s.getState().setKitDocuments([{ ...docBase, id: 'd1', created_at: '', updated_at: '', telechargements: 0 }])
    expect(s.getState().getDocumentsByDomaine('SGS')).toHaveLength(1)
    expect(s.getState().getDocumentsByDomaine('PHY')).toHaveLength(0)
    s.getState().incrementerTelechargement('d1')
    expect(s.getState().kitDocuments[0].telechargements).toBe(1)
    s.getState().clearKitPreview()
    expect(s.getState().kitPreviewDoc).toBeNull()
  })
})
