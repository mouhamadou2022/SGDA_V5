// lib/store/kitTypes.ts — Phase 2 (monolithe modulaire)
// Types documentaires du Kit Inspecteur (source unique, réexportés par lib/store.ts).

export type TypeDocumentOACI =
  | 'RAS-14'
  | 'Circulaires'
  | 'Guides'
  | 'Checklists'
  | 'Procédures'
  | 'Rapports'
  | 'Formulaires'

export type FormatDocument = 'PDF' | 'DOCX' | 'XLS' | 'PPT' | 'ZIP'

export interface KitDocExtrait {
  reference: string
  titre: string
  contenu_resume: string
  statut: 'ACTIF' | 'NOUVEAU' | 'MODIFIE' | 'OBSOLETE' | 'ABROGE' | 'CONFLIT'
  domaines: string[]
  type_entite_cible: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
  seuil_numerique?: string
  source_document_id: string
  detecte_le: string
}

export interface KitChecklistItemGenere {
  id: string
  numero: string
  reference_reglementaire: string
  point_verification: string
  directive_preuve: string
  directive_sa?: string
  directive_ns?: string
  directive_nv?: string
  directive_na?: string
  domaine: string
  sous_domaine?: string
  type_entite_cible: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
  source_document_id: string
}
