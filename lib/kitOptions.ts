// lib/kitOptions.ts
// Constantes partagées du Kit Inspecteur (formulaire + module) pour éviter
// la duplication entre KitInspecteurModule et KitDocForm.

import { FileText, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import type { TypeDocumentOACI, FormatDocument } from '@/lib/store'

// Types de documents (catégorie)
export const TYPES_DOCUMENTS = [
  { id: 'reglementation', label: 'Réglementation', icon: FileText, color: 'primary' },
  { id: 'procedure', label: 'Procédure', icon: FileText, color: 'primary' },
  { id: 'checklist', label: 'Checklist', icon: FileText, color: 'success' },
  { id: 'modele_rapport', label: 'Modèle de rapport', icon: FileText, color: 'info' },
  { id: 'guide', label: 'Guide', icon: FileText, color: 'warning' },
  { id: 'autre', label: 'Autre', icon: FileText, color: 'neutral' },
];

// Types OACI de référence
export const TYPES_OACI: { id: TypeDocumentOACI; label: string }[] = [
  { id: 'RAS-14', label: 'RAS 14 (Norme aérodromes)' },
  { id: 'Circulaires', label: 'Circulaires ANACIM' },
  { id: 'Guides', label: 'Guides OACI (Doc 9157, 9261...)' },
  { id: 'Checklists', label: 'Checklists officielles' },
  { id: 'Procédures', label: 'Procédures internes' },
  { id: 'Rapports', label: 'Rapports de surveillance' },
  { id: 'Formulaires', label: 'Formulaires ANACIM' },
];

// Formats de fichier
export const FORMATS_FICHIER: { id: FormatDocument; label: string }[] = [
  { id: 'PDF', label: 'PDF' },
  { id: 'DOCX', label: 'Word (DOCX)' },
  { id: 'XLS', label: 'Excel (XLS/XLSX)' },
  { id: 'PPT', label: 'PowerPoint (PPT)' },
  { id: 'ZIP', label: 'Archive (ZIP)' },
];

// Domaines (alignés avec DOMAINES_SURVEILLANCE)
export const DOMAINES = [
  { id: 'SGS', label: 'SGS — Système de Gestion de la Sécurité' },
  { id: 'SLI', label: 'SLI — Sauvetage et Lutte contre l\'Incendie' },
  { id: 'PHY', label: 'PHY — Caractéristiques Physiques' },
  { id: 'OLS', label: 'OLS — Surface de Limitation d\'Obstacles' },
  { id: 'RA', label: 'RA — Risque Animalier' },
  { id: 'ELEC', label: 'ELEC — Réseaux Électriques' },
  { id: 'MFP', label: 'MFP — Marques, Feux et Panneaux' },
  { id: 'COP', label: 'COP — Compétences Organisationnelles et Personnels' },
  { id: 'OPS', label: 'OPS — Procédures Opérationnelles' },
  { id: 'AGA', label: 'AGA — Tous domaines' },
];

// États
export const ETATS_DOCUMENT = [
  { id: 'a_jour', label: 'À jour', icon: CheckCircle2, color: 'success' },
  { id: 'en_revision', label: 'En révision', icon: RefreshCw, color: 'warning' },
  { id: 'obsolete', label: 'Obsolète', icon: XCircle, color: 'danger' },
];
