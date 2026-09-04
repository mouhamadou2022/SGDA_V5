// lib/__tests__/reglementaireRag.test.ts
// Tests du RAG réglementaire (Kit Inspecteur) — récupération + formatage cité

import { useAppStore, type KitDocument } from '../store'
import {
  recupererExtraitsReglementaires,
  formaterContexteReglementaire,
  construireContexteReglementaire,
} from '../ia/rag/reglementaireRagClient'

function makeDoc(overrides: Partial<KitDocument> = {}): KitDocument {
  return {
    id: `doc_${Math.random().toString(36).slice(2, 8)}`,
    nom: 'RAS 14 Vol I',
    type_document: 'reglementation',
    type_document_oaci: 'RAS-14',
    version: '2023.1',
    date_revision: '2023-06-01',
    etat: 'a_jour',
    domaines: ['PHY'],
    fichier_url: '',
    fichier_nom: 'ras14.pdf',
    fichier_taille: 0,
    mots_cles: ['piste'],
    accessible_exploitant: false,
    telechargements: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'test',
    ...overrides,
  }
}

describe('recupererExtraitsReglementaires', () => {
  beforeEach(() => {
    useAppStore.setState({ kitDocuments: [] })
  })

  test('filtre par domaine demandé', () => {
    useAppStore.setState({
      kitDocuments: [
        makeDoc({
          id: 'doc-phy',
          domaines: ['PHY'],
          extraits: [{ reference: 'RAS 14 I §3.1.2', titre: 'Longueur de piste', contenu_resume: 'La longueur de piste déclarée doit être conforme.', statut: 'ACTIF', domaines: ['PHY'], type_entite_cible: 'tous', source_document_id: 'doc-phy', detecte_le: '2024-01-01' }],
        }),
        makeDoc({
          id: 'doc-elec',
          domaines: ['ELEC'],
          extraits: [{ reference: 'RAS 14 I §9.2.1', titre: 'Balisage lumineux', contenu_resume: 'Le balisage lumineux doit être maintenu en état de fonctionnement.', statut: 'ACTIF', domaines: ['ELEC'], type_entite_cible: 'tous', source_document_id: 'doc-elec', detecte_le: '2024-01-01' }],
        }),
      ],
    })

    const result = recupererExtraitsReglementaires({ domaines: ['ELEC'] })
    expect(result.length).toBe(1)
    expect(result[0].document_id).toBe('doc-elec')
    expect(result[0].reference).toBe('RAS 14 I §9.2.1')
  })

  test('exclut les documents obsolètes', () => {
    useAppStore.setState({
      kitDocuments: [
        makeDoc({ id: 'doc-old', etat: 'obsolete', extraits: [{ reference: 'RAS 14 I §3.1.2', titre: 'T', contenu_resume: 'Ancienne norme', statut: 'OBSOLETE', domaines: ['PHY'], type_entite_cible: 'tous', source_document_id: 'doc-old', detecte_le: '2020-01-01' }] }),
      ],
    })
    expect(recupererExtraitsReglementaires({ domaines: ['PHY'] })).toHaveLength(0)
  })

  test('classe la pertinence de la requête en premier', () => {
    useAppStore.setState({
      kitDocuments: [
        makeDoc({
          id: 'doc-phy',
          domaines: ['PHY'],
          mots_cles: ['piste'],
          extraits: [{ reference: 'RAS 14 I §3.1.2', titre: 'Longueur de piste', contenu_resume: 'La longueur de piste déclarée doit être conforme.', statut: 'ACTIF', domaines: ['PHY'], type_entite_cible: 'tous', source_document_id: 'doc-phy', detecte_le: '2024-01-01' }],
        }),
        makeDoc({
          id: 'doc-elec',
          domaines: ['ELEC'],
          mots_cles: ['balisage', 'feux'],
          extraits: [{ reference: 'RAS 14 I §9.2.1', titre: 'Balisage lumineux', contenu_resume: 'Le balisage lumineux doit être maintenu en état de fonctionnement.', statut: 'ACTIF', domaines: ['ELEC'], type_entite_cible: 'tous', source_document_id: 'doc-elec', detecte_le: '2024-01-01' }],
        }),
      ],
    })

    const result = recupererExtraitsReglementaires({ domaines: ['PHY', 'ELEC'], requete: 'balisage lumineux' })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].document_id).toBe('doc-elec')
  })

  test('utilise contenu_complet quand il n\'y a pas d\'extraits', () => {
    useAppStore.setState({
      kitDocuments: [
        makeDoc({
          id: 'doc-complet',
          domaines: ['SLI'],
          contenu_complet: 'Le temps d\'intervention SSLIA est de 2 minutes.\nLes véhicules doivent être en état de fonctionnement permanent.\nLe personnel doit être formé.',
        }),
      ],
    })
    const result = recupererExtraitsReglementaires({ domaines: ['SLI'] })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].contenu).toContain('temps d\'intervention')
  })

  test('limite le nombre de caractères injectés', () => {
    useAppStore.setState({
      kitDocuments: [
        makeDoc({
          id: 'doc-long',
          domaines: ['OPS'],
          contenu_complet: Array.from({ length: 40 }, (_, i) => `Paragraphe ${i} : procédure opérationnelle numéro ${i}.`).join('\n'),
        }),
      ],
    })
    const result = recupererExtraitsReglementaires({ domaines: ['OPS'], maxChars: 300, maxChunks: 20 })
    const total = result.reduce((s, r) => s + r.contenu.length, 0)
    expect(total).toBeLessThanOrEqual(300)
  })
})

describe('formaterContexteReglementaire', () => {
  test('cite référence + source + contenu avec la règle anti-fabrication', () => {
    const contexte = formaterContexteReglementaire([
      {
        document_id: 'doc-phy',
        document_nom: 'RAS 14 Vol I',
        reference_base: 'RAS-14',
        version: '2023.1',
        statut: 'a_jour',
        reference: 'RAS 14 I §3.1.2',
        titre: 'Longueur de piste',
        contenu: 'La longueur de piste déclarée doit être conforme.',
        domaine: 'PHY',
        priorite: 1,
      },
    ])
    expect(contexte).toContain('RAS 14 I §3.1.2')
    expect(contexte).toContain('Longueur de piste')
    expect(contexte).toContain('RÈGLE ANTI-FABRICATION')
    expect(contexte).toContain('Ne cite JAMAIS une référence')
  })

  test('avertit quand aucun document n\'est disponible', () => {
    const contexte = formaterContexteReglementaire([])
    expect(contexte).toContain('Aucun document du Kit Inspecteur')
    expect(contexte).toContain('RÈGLE ANTI-FABRICATION')
    expect(contexte).toContain('Ne fabrique AUCUNE référence précise')
  })
})

describe('construireContexteReglementaire', () => {
  test('retourne un contexte avec la règle anti-fabrication si aucun doc', () => {
    useAppStore.setState({ kitDocuments: [] })
    const contexte = construireContexteReglementaire({ domaines: ['PHY'], requete: 'piste' })
    expect(contexte).toContain('RÈGLE ANTI-FABRICATION')
  })
})
