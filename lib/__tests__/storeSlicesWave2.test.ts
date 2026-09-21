// lib/__tests__/storeSlicesWave2.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices extraits en vague 2, testés ISOLÉS via zustand/vanilla.
// Doubles documentés pour les lectures inter-slices (surveillances, ecarts,
// aerodromes, registre) : le store composé les fournit en production.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createChecklistSlice, type ChecklistSlice, type ChecklistItem } from '../store/checklistSlice'
import { createEcartsRedactionSlice, type EcartsRedactionSlice } from '../store/ecartsRedactionSlice'
import { createCertificationsSlice, type CertificationSlice, type Certification } from '../store/certificationsSlice'
import { createHomologationsSlice, type HomologationSlice, type Homologation } from '../store/homologationsSlice'

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

const item = (id: string, resultat?: ChecklistItem['resultat']): ChecklistItem => ({
  id, surveillance_id: 's1', type_checklist: 'standard', categorie: 'c',
  reference_ras14: '', description: '', directive_preuve: '', domaine: 'SGS',
  ordre: 1, last_modified: '', modified_by: '', ...(resultat ? { resultat } : {}),
})

const hierarchie = () => [{
  id: 'd1', nom: 'SGS', description: '', sousDomaines: [], isExpanded: true,
  progression: 0, ordre: 1,
  items: [item('i1', 'SA'), item('i1', 'NS'), item('i2')],
}]

describe('checklistSlice', () => {
  test('setChecklistHierarchy déduplique par id', () => {
    const s = isolated<ChecklistSlice>(createChecklistSlice)
    s.getState().setChecklistHierarchy('s1', hierarchie())
    expect(s.getState().checklistHierarchy['s1'][0].items).toHaveLength(2)
  })

  test('getItemsNSNV : hiérarchie persistée prioritaire + filtre NS/NV', () => {
    const s = isolated<ChecklistSlice>(createChecklistSlice)
    s.setState({
      surveillances: [{ id: 's1', checklist_hierarchy: hierarchie() }],
    } as unknown as Partial<ChecklistSlice>)
    const nsnv = s.getState().getItemsNSNV('s1')
    expect(nsnv.map(i => i.id)).toEqual(['i1'])
  })

  test('calculerProgression : 2/3 renseignés (SA + NS) → 67%', () => {
    const s = isolated<ChecklistSlice>(createChecklistSlice)
    s.setState({
      surveillances: [{ id: 's1', checklist_hierarchy: hierarchie() }],
    } as unknown as Partial<ChecklistSlice>)
    expect(s.getState().calculerProgression('s1')).toBe(67)
    expect(s.getState().calculerProgression('inconnu')).toBe(0)
  })

  test('updateChecklistItem met à jour + synchronise la progression', () => {
    const s = isolated<ChecklistSlice>(createChecklistSlice)
    s.setState({
      surveillances: [{ id: 's1' }],
      checklistItems: { s1: [item('i1'), item('i2', 'SA')] },
      calculerProgression: () => 50,
    } as unknown as Partial<ChecklistSlice>)
    s.getState().updateChecklistItem('s1', 'i1', { resultat: 'NS' })
    const items = s.getState().checklistItems['s1']
    expect(items.find(i => i.id === 'i1')?.resultat).toBe('NS')
    expect(items.find(i => i.id === 'i1')?.last_modified).toBeTruthy()
  })
})

describe('ecartsRedactionSlice', () => {
  test('add génère id + référence BRDN + cellule OACI', () => {
    const s = isolated<EcartsRedactionSlice>(createEcartsRedactionSlice)
    s.setState({ user: { id: 'u1' }, ecarts: [] } as unknown as Partial<EcartsRedactionSlice>)
    s.getState().addEcartRedaction({
      reference: '', ref_reglementaire: '', libelle: 'Libellé', niveau: 'moyen',
      item_ids: [], surveillance_id: 's1', aerodrome_id: 'a1', domaine: 'SGS',
      created_by: '', updated_by: '',
    })
    const all = s.getState().ecartsRedaction
    expect(all).toHaveLength(1)
    expect(all[0].reference).toMatch(/-BRDN-/)
    expect(all[0].cellule_risque_oaci).toBeTruthy()
    expect(all[0].created_by).toBe('u1')
  })

  test('effectifs : brouillons prioritaires, repli officiels', () => {
    const s = isolated<EcartsRedactionSlice>(createEcartsRedactionSlice)
    const officiel = { id: 'e1', surveillance_id: 's1', statut: 'pac_attendu' }
    const brouillon = {
      id: 'e2', surveillance_id: 's1', aerodrome_id: 'a1', reference: 'R',
      ref_reglementaire: '', libelle: '', niveau: 'moyen' as const, item_ids: [] as string[],
      statut: 'ouvert', created_at: '', created_by: '', updated_at: '', updated_by: '',
    }
    s.setState({ ecarts: [officiel] } as unknown as Partial<EcartsRedactionSlice>)
    // Sans brouillon → officiels
    expect(s.getState().getEcartsEffectifsSurveillance('s1')).toEqual([officiel])
    s.getState().setEcartsRedaction([brouillon])
    const effectifs = s.getState().getEcartsEffectifsSurveillance('s1')
    expect(effectifs).toHaveLength(1)
    expect(effectifs[0].id).toBe('e2')
    expect(effectifs[0].statut).toBe('ouvert')
  })
})

const certBase: Certification = {
  id: 'c1', aerodrome_id: 'a1', reference: 'CERT-1', phase_active: 1,
  phases_data: {}, statut_global: 'en_cours', created_at: '', updated_at: '',
}

describe('certificationsSlice', () => {
  test('add renouvellement : phase 1 sautée', () => {
    const s = isolated<CertificationSlice>(createCertificationsSlice)
    s.getState().addCertification({ ...certBase, type_certification: 'renouvellement', phase_active: 1 })
    expect(s.getState().certifications[0].phase_active).toBe(2)
    s.getState().addCertification({ ...certBase, id: 'c2', type_certification: 'initiale', phase_active: 1 })
    expect(s.getState().certifications.find(c => c.id === 'c2')?.phase_active).toBe(1)
  })

  test('update/delete/restaurer', () => {
    const s = isolated<CertificationSlice>(createCertificationsSlice)
    // Double : changement de statut → recalculerProfilRisque (store composé en prod).
    s.setState({ recalculerProfilRisque: () => {} } as unknown as Partial<CertificationSlice>)
    s.getState().addCertification(certBase)
    s.getState().updateCertification('c1', { statut_global: 'certifie' })
    expect(s.getState().certifications[0].statut_global).toBe('certifie')
    s.getState().restaurerCertification('c1')
    // restaurer ne touche que 'archive' en pratique : statut inchangé ici
    s.getState().deleteCertification('c1')
    expect(s.getState().certifications).toHaveLength(0)
  })

  test('archiver : statut + registre (doubles documentés)', () => {
    const s = isolated<CertificationSlice>(createCertificationsSlice)
    s.setState({
      aerodromes: [{ id: 'a1' }],
      user: { prenom: 'A', nom: 'B' },
      addRegistreEntry: () => {},
      recalculerProfilRisque: () => {},
    } as unknown as Partial<CertificationSlice>)
    s.getState().addCertification(certBase)
    s.getState().archiverCertification('c1')
    const archived = s.getState().certifications[0]
    expect(archived.statut_global).toBe('archive')
    expect(archived.archived_at).toBeTruthy()
    expect(s.getState().currentCertification).toBeNull()
  })
})

const homoBase: Homologation = {
  id: 'h1', aerodrome_id: 'a1', reference: 'HOM-1', phase_active: 1,
  phases_data: {}, statut_global: 'en_cours', created_at: '', updated_at: '',
}

describe('homologationsSlice', () => {
  test('CRUD + archiver/restaurer', () => {
    const s = isolated<HomologationSlice>(createHomologationsSlice)
    // Double : changement de statut → recalculerProfilRisque (store composé en prod).
    s.setState({ recalculerProfilRisque: () => {} } as unknown as Partial<HomologationSlice>)
    s.setState({
      aerodromes: [{ id: 'a1' }],
      user: { prenom: 'A', nom: 'B' },
      addRegistreEntry: () => {},
      recalculerProfilRisque: () => {},
    } as unknown as Partial<HomologationSlice>)
    s.getState().addHomologation(homoBase)
    s.getState().updateHomologation('h1', { statut_global: 'homologue' })
    expect(s.getState().homologations[0].statut_global).toBe('homologue')
    s.getState().archiverHomologation('h1')
    expect(s.getState().homologations[0].statut_global).toBe('archive')
    s.getState().restaurerHomologation('h1')
    expect(s.getState().homologations[0].statut_global).toBe('en_cours')
    s.getState().deleteHomologation('h1')
    expect(s.getState().homologations).toHaveLength(0)
  })
})
