// lib/store/ecartsTypes.ts — Types du domaine Écarts (source unique)
// Extraits de ecartsSlice.ts (zéro changement) : le slice importe ces
// types, lib/store.ts les réexporte (importateurs @/lib/store inchangés).

export interface Ecart {
  id: string
  aerodrome_id: string
  surveillance_id?: string
  evenement_id?: string
  domaine: string
  reference: string
  ref_reglementaire: string
  libelle: string
  niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible' | 'tres_faible'
  // Matrice de risque OACI (ex: probabilite=4, gravite='C' → cellule='4C')
  cellule_risque_oaci?: string
  probabilite_risque?: 1 | 2 | 3 | 4 | 5
  gravite_risque?: 'A' | 'B' | 'C' | 'D' | 'E'
  justification_risque_ia?: string
  cellule_ia_suggeree?: string
  statut:
    | 'ouvert' | 'pac_attendu' | 'pac_soumis' | 'pac_refuse'
    | 'pac_accepte' | 'preuves_soumises' | 'preuves_evaluees'
    | 'en_retard' | 'cloture'
    | 'en_attente_validation_chef'
  delai_pac: string
  delai_regularisation: string
  inspecteur_ref_id: string
  responsable_id?: string
  date_detection?: string
  cout_estime?: number
  
  pac?: {
    actions: {
      description: string
      responsable: string
      date_prevue: string
      livrables: string[]
    }[]
    observations: string
    fichiers: string[]
    soumis_par: string
    soumis_le: string
    version: number
  }
  evaluation_pac?: {
    note_pertinence: number
    note_exhaustivite: number
    note_precision: number
    note_specificite: number
    note_coherence: number
    note_tracabilite: number
    note_realisme?: number
    note_globale: number
    decision: 'accepte' | 'reserve' | 'refuse'
    commentaire_refus?: string
    evalue_par: string
    evalue_le: string
    delai_traitement?: number
    /** Date butoir pour l'évaluation par l'inspecteur */
    deadline?: string
    /** True si l'inspecteur a dépassé le délai d'évaluation */
    retard_inspecteur?: boolean
    risque_residuel_cible_niveau?: 'critique' | 'eleve' | 'moyen' | 'faible'
    risque_residuel_cible_cellule?: string
  }
  preuves?: {
    fichiers: {
      nom: string
      url: string
      type: string
      description: string
    }[]
    commentaire: string
    soumis_par: string
    soumis_le: string
  }
  validation_preuves?: {
    decision: 'valide' | 'refuse' | 'reserve'
    commentaire: string
    valide_par: string
    valide_le: string
    notes_criteres?: {
      completude: number
      qualite: number
      pertinence: number
      tracabilite: number
      efficacite: number
    }
    note_globale?: number
    /** Date butoir pour la validation par l'inspecteur */
    deadline?: string
    /** True si l'inspecteur a dépassé le délai de validation */
    retard_inspecteur?: boolean
    verification_ia?: {
      conforme: boolean
      niveauConfiance: number
      elementsManquants: string[]
      preuvesSuffisantes: boolean
    }
    reserves?: string[]
  }
  evaluation_niveau_risque?: {
    note_impact_securite: number
    note_conformite_reglementaire: number
    note_recurrence: number
    note_portee: number
    note_tendance: number
    note_globale: number
    niveau_suggere: 'critique' | 'eleve' | 'moyen' | 'faible'
    evalue_par: string
    evalue_le: string
  }
  cloture_le?: string
  motif_cloture?: 'resolu_normal' | 'resolu_reconciliation' | 'obsolete' | 'fusionne'
  fusionne_vers_id?: string
  fusion_depuis_id?: string
  rappels_envoyes?: {
    j7?: boolean
    j3?: boolean
    j1?: boolean
  }
  /** True si le retard actuel est dû à l'inspecteur (évaluation PAC/preuves dépassée) */
  retard_inspecteur?: boolean
  /** Validation par le chef d'équipe après évaluation inspecteur */
  validation_chef?: {
    type: 'evaluation_pac' | 'validation_preuves'
    statut: 'en_attente' | 'approuve' | 'revision'
    approuve_par?: string
    approuve_le?: string
    commentaire?: string
  }
  
  created_at: string
  updated_at: string
  deleted_at?: string
  deleted_by?: string
}

export interface SoumissionPAC {
  actions: {
    description: string
    responsable: string
    date_prevue: string
    livrables: string[]
  }[]
  observations: string
  fichiers: string[]
  soumis_par: string
}

// Types CertificationMetadata, HomologationMetadata, RegistreEntry : source
// unique lib/store/registresSlice.ts. Types RegulationAnalysis,
// FormationSuggestion : source unique lib/store/registreIASlice.ts.
// (Importés et réexportés en tête de fichier.)

export interface EvaluationPAC {
  note_pertinence: number
  note_exhaustivite: number
  note_precision: number
  note_specificite: number
  note_coherence: number
  note_tracabilite: number
  note_realisme: number
  note_globale: number
  decision: 'accepte' | 'reserve' | 'refuse'
  commentaire_refus?: string
  evalue_par: string
  evalue_le?: string
  niveau_risque_reevalue?: 'critique' | 'eleve' | 'moyen' | 'faible'
  cellule_risque_oaci_reevaluee?: string
}

export interface SoumissionPreuves {
  fichiers: {
    nom: string
    url: string
    type: string
    description: string
  }[]
  commentaire: string
  soumis_par: string
}

export interface ValidationPreuves {
  decision: 'valide' | 'refuse' | 'reserve'
  commentaire: string
  valide_par: string
  valide_le: string
  notes_criteres?: {
    completude: number
    qualite: number
    pertinence: number
    tracabilite: number
    efficacite: number
  }
  note_globale?: number
  verification_ia?: {
    conforme: boolean
    niveauConfiance: number
    elementsManquants: string[]
    preuvesSuffisantes: boolean
  }
  reserves?: string[]
  niveau_risque_reevalue?: 'critique' | 'eleve' | 'moyen' | 'faible'
  cellule_risque_oaci_reevaluee?: string
}

export interface HistoriqueEcart {
  id: string
  type: 'creation' | 'notification' | 'soumission_pac' | 'evaluation_pac' | 'soumission_preuves' | 'validation_preuves' | 'cloture' | 'reconciliation' | 'rappel' | 'retard'
  date: string
  acteur: string
  role_acteur: string
  description: string
  details?: Record<string, unknown>
  fichiers?: string[]
}

export interface StatistiquesPAC {
  total: number
  en_attente: number
  evalues: number
  acceptes: number
  refuses: number
  taux_acceptation: number
  delai_moyen_traitement: number
  en_retard: number
  critiques: number
}
