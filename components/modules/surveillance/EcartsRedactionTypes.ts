// components/modules/surveillance/EcartsRedactionTypes.ts
// Types du domaine redaction (source unique, re-exportes par le module).

export interface EcartRedaction {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible' | 'tres_faible';
  item_ids: string[];
  created_at: string;
  updated_at: string;
  cellule_risque_oaci?: string;
  probabilite_risque?: 1 | 2 | 3 | 4 | 5;
  gravite_risque?: 'A' | 'B' | 'C' | 'D' | 'E';
  justification_risque_ia?: string;
  cellule_ia_suggeree?: string;
  /** Domaine réglementaire de l'écart (SGS, PHY, OLS…) — utilisé lors de la transmission */
  domaine?: string;
  /** ID de la surveillance source */
  surveillance_id?: string;
  /** ID de l'aérodrome */
  aerodrome_id?: string;
  /** ID de l'inspecteur rédacteur */
  created_by?: string;
  /** ID du dernier modificateur */
  updated_by?: string;
  /** Délai de soumission du PAC (en jours) — prérempli par l'IA, ajustable */
  delai_pac?: number;
  /** Délai de régularisation complète (en jours) — prérempli par l'IA, ajustable */
  delai_regularisation?: number;
}

export interface QuestionNSNV {
  id: string;
  numero: string;
  reference_reglementaire: string;
  description: string;
  domaine: string;
  sousDomaine: string;
  sousSousDomaine: string;
  resultat: 'NS' | 'NV';
  /** Niveau PAOE réel de l'élément — SGS uniquement (absent | present | approprie) */
  paoeLevel?: 'absent' | 'present' | 'approprie';
  /** Notes/constatations de l'inspecteur liées à la question (checklist / éval SGS) */
  observation?: string;
  /** Justification / constat détaillé de l'écart (remonté depuis l'évaluation SGS) */
  justification?: string;
}
