// types/surveillance.ts
// ✅ Types pour le module Surveillance (CDC 5.6)

// ============================================================
// Types de base
// ============================================================

export type SurveillanceType = 
  | 'programmee'
  | 'inopinee'
  | 'speciale'
  | 'suivi_ecarts'
  | 'mise_oeuvre_pac'
  | 'certification'
  | 'homologation'
  | 'audit_complet'
  | 'urgence'
  | 'periodique'
  | 'inopine'
  | 'maintien';

export type SurveillanceStatut =
  | 'planifiee'
  | 'en_cours'
  | 'checklist_signee'
  | 'ecarts_signes'
  | 'rapport_signe'
  | 'lettre_signee'
  | 'transmise'
  | 'archivee';

export type DomaineSurveillance =
  | 'SGS'
  | 'SLI'
  | 'PHY'
  | 'ANI'
  | 'OPS'
  | 'RH'
  | 'AGA'
  | 'ELEC'
  | 'DOC';

export type ResultatChecklist = 'SA' | 'NS' | 'NA' | 'NV';

// ============================================================
// Interface principale Surveillance — source unique : lib/store.ts
// ============================================================

export type { SignatureInfo, Surveillance } from '@/lib/store'

// ============================================================
// Types pour les checklists
// ============================================================

export interface ChecklistItem {
  id: string;
  surveillance_id: string;
  type_checklist: 'standard' | 'suivi_ecarts' | 'pac';
  categorie: string;
  reference_ras14: string;
  description: string;
  directive_preuve: string;
  domaine: DomaineSurveillance;
  ordre: number;
  resultat?: ResultatChecklist;
  observation?: string;
  fichiers?: {
    nom: string;
    url: string;
    dateUpload: string;
  }[];
  last_modified: string;
  modified_by: string;
}

// ============================================================
// Types pour le suivi des écarts (checklist spécifique)
// ============================================================

export interface EcartSuivi {
  id: string;
  reference_ecart: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  libelle: string;
  pac_prevu: string;
  date_echeance: string;
  resultat?: 'SA' | 'NS' | 'NV';
  observation?: string;
  preuve_url?: string;
  preuve_nom?: string;
}

// ============================================================
// Types pour le suivi PAC (checklist spécifique)
// ============================================================

export interface PACSuivi {
  id: string;
  reference_ecart: string;
  libelle: string;
  actions_prevues: string;
  date_echeance_preuves: string;
  verification_site?: 'termine' | 'en_cours' | 'non_entame';
  progression?: 0 | 25 | 50 | 75 | 100;
  observation?: string;
  preuve_url?: string;
  preuve_nom?: string;
}

// ============================================================
// Types pour la rédaction des écarts
// ============================================================

export interface EcartRedaction {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  item_ids: string[];
  created_at: string;
  created_by: string;
}

// ============================================================
// Types pour le rapport
// ============================================================

export interface RapportSurveillance {
  id: string;
  surveillance_id: string;
  contenu: string;
  version: number;
  signe_par?: string[];
  signe_le?: string;
  pdf_url?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Constantes
// ============================================================

export const SURVEILLANCE_STATUT_LABELS: Record<SurveillanceStatut, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  checklist_signee: 'Checklist signée',
  ecarts_signes: 'Écarts signés',
  rapport_signe: 'Rapport signé',
  lettre_signee: 'Lettre signée',
  transmise: 'Transmise',
  archivee: 'Archivée'
};

export const SURVEILLANCE_TYPE_LABELS: Record<SurveillanceType, string> = {
  programmee: 'Programmée',
  inopinee: 'Inopinée',
  speciale: 'Spéciale',
  suivi_ecarts: 'Suivi des écarts',
  mise_oeuvre_pac: 'Mise en œuvre PAC',
  certification: 'Certification',
  homologation: 'Homologation',
  audit_complet: 'Audit complet',
  urgence: 'Urgence',
  periodique: 'Inspection périodique',
  inopine: 'Inspection inopinée',
  maintien: 'Maintien de la sécurité'
};

export const DOMAINE_LABELS: Record<DomaineSurveillance, string> = {
  SGS: 'Système de Gestion de la Sécurité',
  SLI: 'Sauvetage et Lutte Incendie',
  PHY: 'Caractéristiques physiques',
  ANI: 'Péril animalier',
  OPS: 'Procédures opérationnelles',
  RH: 'Compétences & Personnel',
  AGA: 'Tous domaines AGA',
  ELEC: 'Réseaux électriques & Balisage',
  DOC: 'Documentation & Procédures'
};