// lib/types.ts - À ajouter/créer

export interface PacAction {
  description: string
  responsable: string
  date_prevue: string
  livrables: string[]
}

export interface Pac {
  actions: PacAction[]
  observations: string
  fichiers: string[]
  soumis_par: string
  soumis_le: string
  version: number
}

export interface EvaluationPac {
  note_pertinence: number
  note_exhaustivite: number
  note_precision: number
  note_specificite: number
  note_coherence: number
  note_tracabilite: number
  note_globale: number
  decision: 'accepte' | 'refuse'
  commentaire_refus?: string
  evalue_par: string
  evalue_le: string
  delai_traitement?: number
}

export interface Preuve {
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

export interface ValidationPreuve {
  decision: 'valide' | 'refuse'
  commentaire: string
  valide_par: string
  valide_le: string
}

// Étendre l'interface Ecart existante
export interface Ecart {
  id: string
  aerodrome_id: string
  surveillance_id?: string
  evenement_id?: string
  reference: string
  ref_reglementaire: string
  libelle: string
  niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible'
  statut:
    | 'ouvert'
    | 'pac_attendu'
    | 'pac_soumis'
    | 'pac_refuse'
    | 'pac_accepte'
    | 'preuves_soumises'
    | 'preuves_evaluees'
    | 'en_retard'
    | 'cloture'
  delai_pac: string
  delai_regularisation: string
  inspecteur_ref_id: string
  cout_estime?: number
  
  // NOUVEAUX CHAMPS
  pac?: Pac
  evaluation_pac?: EvaluationPac
  preuves?: Preuve
  validation_preuves?: ValidationPreuve
  cloture_le?: string
  
  created_at: string
  updated_at: string
}