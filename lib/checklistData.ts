// lib/checklistData.ts
// Données des checklists selon RAS 14
// Conforme à la Section 5.6.1 du CDC

import type { ResultatChecklist } from '@/types/checklist'

export interface ChecklistItemData {
  id: string;
  numero: string;
  reference_reglementaire: string;
  point_verification: string;
  directive_preuve: string;
  domaine: string;
  sous_domaine: string;
  ordre: number;
}

export interface ChecklistCategory {
  code: string;
  nom: string;
  description: string;
  items: ChecklistItemData[];
}

export interface ChecklistItemState {
  itemId: string;
  resultat?: ResultatChecklist;
  observation?: string;
  fichiers?: {
    nom: string;
    url: string;
    dateUpload: string;
  }[];
  lastModified: string;
}

// Labels pour les résultats (harmonisés avec le design system)
export const RESULTAT_CHECKLIST_LABELS = {
  SA: { 
    label: 'Satisfaisant', 
    variant: 'success',
    icon: 'CheckCircle',
    description: 'Conforme aux exigences'
  },
  NS: { 
    label: 'Non satisfaisant', 
    variant: 'danger',
    icon: 'XCircle',
    description: 'Non conforme, écart à traiter'
  },
  NA: { 
    label: 'Non applicable', 
    variant: 'neutral',
    icon: 'MinusCircle',
    description: 'Ne s\'applique pas à cet aérodrome'
  },
  NV: { 
    label: 'Non vérifié', 
    variant: 'warning',
    icon: 'AlertCircle',
    description: 'À vérifier lors de la visite'
  },
} as const;

// Couleurs de badge pour les domaines
export const DOMAINE_CHECKLIST_COLORS: Record<string, string> = {
  SGS: 'primary',
  SLI: 'danger',
  PHY: 'warning',
  ANI: 'success',
  OPS: 'teal',
  RH: 'neutral',
  ELEC: 'primary',
  DOC: 'neutral'
};

// Le reste du fichier (CHECKLIST_STANDARD) reste identique
export const CHECKLIST_STANDARD: ChecklistCategory[] = [
  // ... tout le contenu existant (conservé à l'identique)
];