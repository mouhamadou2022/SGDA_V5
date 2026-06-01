// lib/store.ts - VERSION COMPLÈTE FUSIONNÉE
// Contient TOUTES vos fonctionnalités existantes + TOUS les modèles avancés
// À copier-coller INTÉGRALEMENT

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useRef } from 'react'
import { AuthUser, buildIdentifiant, PosteANACIM } from './auth'
import { notifyDeletionCascade, notifyAerodromeDeleted } from './notifications'
import { toast } from './toast'
import { risqueUtils } from './risque'
import { plansActionsUtils } from './plansActionsUtils'
import { NIVEAUX_RISQUE_ECART } from './config'
import { riskEngine, DecisionChecklist, DomainDegradation, EcartUrgent } from './riskEngine';
import { checklistMemory, ItemHistoryRecord, PredictionResult, BatchValidationResult } from './checklistMemory';
import { supabase } from './supabase'
import * as datastore from './datastore'
import { learningEngine, LearningFeedback, ModelCalibration, RecalibrationAlert } from './learningEngine';
import { learningEnginePAC, PACLearningFeedback, PreuveLearningFeedback } from './learningEnginePAC';
import { createAdvancedModelsSlice, AdvancedModelsSlice } from './store/advancedModelsSlice';
import { syncLearningFromStore, syncPACFromStore, startScheduledLearningRecalibration } from './learningPersistence';
import { codeAccesUtils } from './codeAccesUtils';
import { registreUtils } from './registreUtils';
import { genererPlanning } from './services/planningGenerator';
import type { ResultatChecklist } from './stylet';
import type { HelistationData } from './types/helistation'
import type { SuggestionDetaillee } from './checklistMemory';

// ============================================================
// Types métier existants
// ============================================================

export interface ChecklistMemoryRecord extends ItemHistoryRecord {}
export interface LearningFeedbackRecord extends LearningFeedback {}
export interface ModelCalibrationRecord extends ModelCalibration {}
export interface RecalibrationAlertRecord extends RecalibrationAlert {}
export interface DecisionChecklistRecord extends DecisionChecklist {}
export interface PACLearningFeedbackRecord extends PACLearningFeedback {}
export interface PreuveLearningFeedbackRecord extends PreuveLearningFeedback {}

export type { SuggestionDetaillee as ChecklistSuggestion } from './checklistMemory';

// ============================================================
// TYPES POUR EXEMPTIONS ET MESURES D'ATTÉNUATION
// ============================================================

export interface MesureAtténuation {
  id: string;
  description: string;
  responsable: string;
  date_debut: string;
  date_fin_prevue: string;
  date_fin_reelle?: string;
  statut: 'a_venir' | 'en_cours' | 'realisee' | 'en_retard' | 'abandonnee';
  preuves?: { id: string; nom: string; url: string; date: string }[];
  commentaire_suivi?: string;
  declencher_inspection_si_retard: boolean;
  inspection_declenchee?: boolean;
  inspection_id?: string;
  
  // Pour apprentissage
  efficacite_suggeree?: number;
  efficacite_validee?: number;
  dernier_evenement_surveillance_id?: string;
  dernier_resultat_mise_oeuvre?: 'SA' | 'NS' | 'NV';
}

export interface Exemption {
  id: string;
  reference: string;
  parent_id?: string;
  parent_type?: 'certification' | 'homologation';
  certification_id?: string;
  homologation_id?: string;
  aerodrome_id: string;
  date_demande?: string;
  domaines_concerne?: string[];
  description: string;
  etude_securite_url?: string;
  formulaire_dg_url?: string;
  decision: 'acceptee' | 'refusee' | 'acceptee_partiellement';
  numero_arrete?: string;
  date_arrete?: string;
  date_debut: string;
  date_fin?: string;
  date_fin_prevue?: string;
  duree_mois: number;
  statut: 'active' | 'expiree' | 'cloturee' | 'revoquee' | 'renouvelee';
  mesures: MesureAtténuation[];
  // Workflow instructeur (exploitant → ANACIM)
  workflow_statut?: 'en_attente' | 'accuse' | 'en_cours';
  avis_final?: 'favorable' | 'a_reviser' | 'defavorable';
  inspecteur_commentaires?: string;
  inspecteur_fichiers?: { nom: string; url: string }[];
  date_accuse_reception?: string;
  date_decision?: string;
  dernier_recalcul_risque?: string;
  dernier_score_c3_ajuste?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type TypeEntiteAerodrome = 'aerodrome' | 'helistation' | 'mixte'

export interface Aerodrome {
  id: string
  nom: string
  code_oaci: string
  type: 'international' | 'national'
  type_entite: TypeEntiteAerodrome
  categorie_sslia: string
  region: string
  exploitant_id?: string
  exploitant_nom?: string
  exploitant_adresse?: string
  exploitant_telephone?: string
  maturite_sgs: number
  maturite_sgs_detaille?: {
    composantes: Record<1 | 2 | 3 | 4 | 5, { score: number; niveauGlobal: string; elements: { elementId: string; niveau: string; justification?: string }[] }>;
    scoreGlobal: number;
    evalueLe: string;
    evaluePar: string;
  }
  statut_sgs?: 'complet' | 'simplifie' | 'non_applicable'
  statut: 'brouillon' | 'actif' | 'suspendu' | 'ferme'
  lat: number
  lon: number
  altitude: number
  piste_principale?: {
    longueur: number
    largeur: number
    orientation: string
    revetement: string
    pcr: number
    code_reference: string
    type_approche?: 'a_vue' | 'classique' | 'cat1' | 'cat2'
    avion_reference?: string
  }
  helistation?: HelistationData
  horaires?: 'jour' | 'h24'
  aides_visuelles?: string[]
  statut_certification?: 'certifie' | 'homologue' | 'non_certifie' | 'non_homologue'
  certifie_le?: string
  numero_certificat?: string
  homologue_le?: string
  numero_homologation?: string
  phases_certification?: PhaseCertification[]
  phases_homologation?: PhaseCertification[]
  contacts?: {
    nom: string
    poste: string
    email: string
    telephone: string
  }[]
  created_at: string
  updated_at: string
  deleted_at?: string
  deleted_by?: string
}

export interface SignatureInfo {
  signataire_id: string;
  signataire_nom: string;
  date_signature: string;
  signature_url: string;
}

export interface PhaseCertification {
  phase: number
  intitule: string
  documents: { nom: string; url: string; date_upload: string }[]
}

export interface Surveillance {
  id: string
  aerodrome_id: string
  planning_id?: string
  type: 'programmee' | 'inopinee' | 'speciale' | 'suivi_ecarts' | 'mise_oeuvre_pac' | 'certification' | 'homologation' | 'audit_complet' | 'urgence' | 'periodique' | 'inopine' | 'maintien'
  portee: string[]
  equipe_ids: string[]
  chef_id: string
  date_debut: string
  date_fin: string
  statut:
    | 'planifiee' | 'en_cours' | 'checklist_signee'
    | 'ecarts_signes' | 'rapport_signe' | 'lettre_signee'
    | 'transmise' | 'archivee'
  score_global?: number
  observations?: string
  justification_declenchement?: string
  suggestions_maintien?: {
    domaines: string[]
    types_checklist: ('standard' | 'ecarts' | 'pac')[]
    raison: string
  }[]
  
  rapport_html?: string
  rapport_type?: 'redige' | 'charge'
  rapport_fichier_url?: string
  rapport_fichier_nom?: string
  rapport_signe_par?: string
  rapport_signe_le?: string
  rapport_sig_url?: string
  lettre_html?: string
  lettre_signee_url?: string
  
  signatures_checklist?: SignatureInfo[]
  signatures_ecarts?: SignatureInfo[]
  signatures_rapport?: SignatureInfo[]
  
  transmitted_at?: string
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
  progression?: number
  checklist_hierarchy?: DomaineChecklist[]
  sgs_evaluation_prepa?: any  // EvaluationSGS — transférée depuis le planning lors du lancement
  deleted_at?: string
  deleted_by?: string
}

export interface Ecart {
  id: string
  aerodrome_id: string
  surveillance_id?: string
  evenement_id?: string
  domaine: string
  reference: string
  ref_reglementaire: string
  libelle: string
  niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible'
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
    note_globale: number
    decision: 'accepte' | 'refuse'
    commentaire_refus?: string
    evalue_par: string
    evalue_le: string
    delai_traitement?: number
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
  rappels_envoyes?: {
    j7?: boolean
    j3?: boolean
    j1?: boolean
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

export interface CertificationMetadata {
  numero_certificat?: string
  date_delivrance?: string
  duree?: number
  statut_officiel?: 'en_cours' | 'revoque' | 'suspendu' | 'annule'
  exemption?: { date?: string; type?: string; numero?: string }
  reference_aip?: string
  restriction?: string
}

export interface HomologationMetadata {
  numero_decision?: string
  date_delivrance?: string
  statut_officiel?: 'en_cours' | 'revoque' | 'suspendu' | 'annule'
  exemption?: { date?: string; type?: string; numero?: string }
  restriction?: string
}

export interface RegistreEntry {
  id: string;
  type: 'certification' | 'homologation' | 'surveillance' | 'evenement' | 'ecart' | 'dossier' | 'document' | 'formation';
  reference: string;
  titre: string;
  description: string;
  date_entree: string;
  aerodrome_id?: string;
  fichiers: { nom: string; url: string }[];
  timeline: {
    id: string;
    etape: string;
    date: string;
    acteur: string;
    acteur_role: string;
    details?: string;
    fichiers?: { nom: string; url: string }[];
  }[];
  statut: 'valide' | 'archive';
  auto_generated: boolean;
  source_id?: string;
  source_type?: string;
  metadata?: CertificationMetadata | HomologationMetadata;
  ia_analysis?: {
    summary: string;
    keywords: string[];
    entities: { type: string; value: string }[];
    analyzed_at: string;
  };
  created_at: string;
  created_by: string;
}

export interface RegulationAnalysis {
  id: string
  documentId: string
  documentTitre: string
  documentType: string
  version: string
  date_analyse: string
  impact: 'majeur' | 'modere' | 'mineur' | 'aucun'
  impact_description: string
  chapitres_modifies: string[]
  formations_suggerees: FormationSuggestion[]
  inspecteurs_concernes: string[]
  delai_mise_conformite: number
  status: 'pending' | 'notified' | 'resolved'
  confidence: number
}

export interface FormationSuggestion {
  id: string
  titre: string
  description: string
  duree_heures: number
  priorite: 'critique' | 'haute' | 'moyenne' | 'basse'
  justification: string
  public_cible: ('tous' | 'expert' | 'debutant')[]
  domaines: string[]
  source_document_id: string
  source_document_titre: string
  status: 'suggested' | 'planned' | 'scheduled' | 'done' | 'ignored'
  created_at: string
  planifiee_le?: string
  planifiee_par?: string
}

export interface EvaluationPAC {
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
  type: 'creation' | 'notification' | 'soumission_pac' | 'evaluation_pac' | 'soumission_preuves' | 'validation_preuves' | 'cloture' | 'rappel' | 'retard'
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

// ============================================================
// PROFIL RISQUE ENRICHIE AVEC MODÈLES AVANCÉS
// ============================================================

// Types pour les modèles avancés
export interface ScoreHistoryPoint {
  date: string
  score: number
  c1?: number
  c2?: number
  c3?: number
  c4?: number
  c5?: number
}

export interface VelocityMetricsStored {
  vitesse: number
  acceleration: number
  volatilite: number
  temps_avant_seuil_critique: number | null
  niveau_vigilance: 'normal' | 'surveillance' | 'alerte' | 'critique'
}

export interface SystemStressStored {
  score: number
  niveau_stress: 'faible' | 'modere' | 'eleve' | 'critique'
  facteurs_contributeurs: string[]
  recommandation: string
}

export interface ProactiveAlertStored {
  niveau_urgence: 'info' | 'vigilance' | 'alerte' | 'critique'
  probabilite_degradation_3m: number
  probabilite_seuil30_3m: number
  message_court: string
  action_suggerer: string
}

export interface ProfilRisque {
  aerodrome_id: string
  score_global: number
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  prediction_3m: number
  prediction_6m: number
  prediction_12m?: number
  prediction_interval_3m?: { lower: number; upper: number }
  prediction_interval_6m?: { lower: number; upper: number }
  tendance: 'stable' | 'hausse' | 'baisse'
  computed_at: string
  // NOUVEAUX CHAMPS POUR MODÈLES AVANCÉS
  historical_scores?: ScoreHistoryPoint[]
  velocity_metrics?: VelocityMetricsStored
  system_stress?: SystemStressStored
  proactive_alert?: ProactiveAlertStored
  hawkes_intensity?: number
  effectiveness_score?: number
  last_change_point?: string
  // PRÉDICTION D'INCIDENTS ET TENDANCE ÉVÉNEMENTS
  incident_prediction_3m?: number
  incident_prediction_6m?: number
  incident_prediction_12m?: number
  event_frequency?: number
  event_severity_trend?: string
  days_since_last_event?: number
  event_trend_acceleration?: number
  // BAYESIEN ET SCÉNARIOS
  bayesian_posterior?: number
  bayesian_prior?: number
  bayesian_black_swan?: boolean
  scenarios?: Array<{ nom: string; description: string; probabilite: number; scoreProjecte: number; intervalleConfiance: [number, number]; actionsRecommandees: string[] }>
  ensemble_confidence?: number
  // MODÈLES AVANCÉS Phase 3 — persistés dans le profil
  hmm_state?: { currentStateName: string; isTransitioning: boolean; transitionRisk: number; daysToCritical: number }
  survival_metrics?: { hazard90d: number; hazard180d: number; medianDays: number }
  extreme_risk?: { tailRisk: number; isHeavyTailed: boolean; maxExpected12m: number }
  negbin_metrics?: { isOverdispersed: boolean; dispersion: number; mean: number; variance: number }
  copula_metrics?: { maxTailDependence: number; worstCaseProbability: number; worstCaseDescription: string }
  ts_metrics?: { recommendedAction: string; bestProbability: number }
  // Bow-Tie — efficacité des barrières par domaine
  bowtie_metrics?: { domaine: string; effectiveness: number; nsCount: number; ecartsCount: number }[]
  // SNAPSHOT INFRASTRUCTURE (au moment du calcul)
  // Permet aux décisions (type surveillance, filtrage checklist) de refléter
  // les caractéristiques réelles de l'entité sans re-calculer le score numérique.
  infrastructure?: {
    type_entite: TypeEntiteAerodrome
    horaires?: 'jour' | 'h24'
    aides_visuelles?: string[]
    revetement?: string
    type_approche?: string
    categorie_sslia: string
    type: 'international' | 'national'
  }
}

// ============================================================
// NOUVELLES INTERFACES À AJOUTER DANS LA SECTION DES TYPES
// ============================================================

export interface Delegation {
  id: string;
  surveillance_id: string;
  aerodrome_id: string;
  chef_id: string;
  /** Code du domaine réglementaire (SGS, PHY, OLS…) */
  domaine: string;
  /** Nom d'affichage du domaine */
  domaine_nom?: string;
  /** Type de surveillance délégué */
  type_surveillance?: string;
  /** ID de l'inspecteur désigné */
  assigne_a: string;
  /** Nom d'affichage de l'inspecteur */
  assigne_nom?: string;
  assigne_par: string;
  items_ids: string[];
  items_count?: number;
  progression: number;
  /**
   * Cycle de vie d'une délégation :
   * assigne → checklist_en_cours → checklist_signee
   *         → ecarts_en_cours → ecarts_signes → transmis_chef
   * (valeurs legacy conservées pour compatibilité)
   */
  statut:
    | 'assigne'
    | 'checklist_en_cours'
    | 'checklist_signee'
    | 'ecarts_en_cours'
    | 'ecarts_signes'
    | 'transmis_chef'
    // legacy
    | 'en_cours'
    | 'termine'
    | 'bloque';
  /** URL de la signature de la checklist par l'inspecteur */
  checklist_signature_url?: string;
  /** Date de signature de la checklist */
  checklist_signe_le?: string;
  /** URL de la signature des écarts par l'inspecteur */
  ecarts_signature_url?: string;
  /** Date de signature des écarts */
  ecarts_signes_le?: string;
  /** Date de transmission au chef d'équipe */
  transmis_le?: string;
  assigne_le: string;
  derniere_activite: string;
  derniere_sync: string;
}

export interface AlerteSecuriteFull {
  id: string;
  surveillance_id: string;
  delegation_id?: string;
  item_id: string;
  item_numero: string;
  item_description: string;
  domaine: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  message: string;
  declenchee_par: string;
  declencheur_nom: string;
  declenchee_le: string;
  statut: 'active' | 'traitee' | 'cloturee';
  preuves: { id: string; nom: string; url: string; dateUpload: string }[];
  commentaire_traitement?: string;
  traitee_par?: string;
  traitee_le?: string;
  notifie_chef: boolean;
  notifie_chef_le?: string;
  notifie_dg: boolean;
  notifie_dg_le?: string;
}

export interface PresenceEntry {
  id: string;
  surveillance_id: string;
  prenom_nom: string;
  structure: 'ANACIM' | 'EXPLOITANT' | 'AUTRE';
  fonction: string;
  telephone: string;
  email: string;
  signature_url: string;
  signature_date: string;
  heure_arrivee?: string;
  heure_depart?: string;
  observations?: string;
  ordre: number;
}

export interface RiskIndexFeedback {
  id: string;
  aerodrome_id: string;
  date: string;
  contexte: {
    score_global: number;
    c1: number;
    c2: number;
    c3: number;
    c4: number;
    c5: number;
    velocity: number;
    nb_ecarts_critiques: number;
    nb_nv: number;
    nb_ns: number;
  };
  suggestion_systeme: {
    probabilite: 1 | 2 | 3 | 4 | 5;
    gravite: 'A' | 'B' | 'C' | 'D' | 'E';
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  };
  choix_inspecteur: {
    probabilite: 1 | 2 | 3 | 4 | 5;
    gravite: 'A' | 'B' | 'C' | 'D' | 'E';
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  };
  ecart: number;
  commentaire?: string;
}

// ============================================================
// Types pour historiques et analyses avancées
// ============================================================

export interface PredictionHistoryRecord {
  id: string
  aerodrome_id: string
  predicted_at: string
  predicted_score_3m: number
  predicted_score_6m: number
  actual_score_3m: number | null
  actual_score_6m: number | null
  error_3m: number | null
  error_6m: number | null
}

export interface ActionOutcomeRecord {
  id: string
  aerodrome_id: string
  action_type: 'surveillance' | 'recommandation' | 'ecart_treatment' | 'formation'
  action_detail: string
  recommended_at: string
  chosen_at: string
  score_before: number
  score_after: number
  effectiveness: number
  cost_days: number
  was_followed: boolean
}

export interface ChangePointRecord {
  id: string
  aerodrome_id: string
  detected_at: string
  date_changement: string
  score_before: number
  score_after: number
  magnitude: number
  direction: 'amelioration' | 'degradation'
  probable_cause: string | null
  confirmed: boolean
}

export interface VelocitySnapshotRecord {
  aerodrome_id: string
  captured_at: string
  vitesse: number
  acceleration: number
  volatilite: number
  temps_avant_seuil_critique: number | null
  niveau_vigilance: string
}

export interface StressHistoryRecord {
  aerodrome_id: string
  captured_at: string
  stress_score: number
  niveau_stress: string
  facteurs: string[]
}

export interface ProactiveAlertRecord {
  id: string
  aerodrome_id: string
  created_at: string
  niveau_urgence: 'info' | 'vigilance' | 'alerte' | 'critique'
  probabilite_degradation_3m: number
  probabilite_seuil30_3m: number
  message_court: string
  message_long: string
  action_suggerer: string
  acknowledged_at: string | null
  resolved_at: string | null
}

export interface ModelPerformanceRecord {
  model_name: string
  last_calibrated: string
  mae_3m: number | null
  mae_6m: number | null
  bias_3m: number | null
  bias_6m: number | null
  coverage_95: number | null
  observations_count: number
}

// ============================================================
// Types existants (suite)
// ============================================================

export interface Notification {
  id: string
  user_id: string
  type: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  message: string
  link?: string
  canal: 'in_app' | 'email' | 'sms' | 'email_sms'
  sent_at: string
  read_at?: string
  data?: Record<string, unknown>
}

export interface EcartRedaction {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  item_ids: string[];
  surveillance_id: string;
  aerodrome_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  /** Domaine réglementaire (SGS, PHY, OLS…) — propagé lors de la transmission */
  domaine?: string;
  // Champs de risque (matrice OACI)
  cellule_risque_oaci?: string;
  probabilite_risque?: 1 | 2 | 3 | 4 | 5;
  gravite_risque?: 'A' | 'B' | 'C' | 'D' | 'E';
  justification_risque_ia?: string;
  cellule_ia_suggeree?: string;
}

export interface ChecklistItem {
  id: string;
  surveillance_id: string;
  type_checklist: 'standard' | 'suivi_ecarts' | 'pac';
  categorie: string;
  reference_ras14: string;
  description: string;
  directive_preuve: string;
  domaine: string;
  ordre: number;
  resultat?: 'SA' | 'NS' | 'NA' | 'NV';
  observation?: string;
  fichiers?: {
    nom: string;
    url: string;
    dateUpload: string;
  }[];
  last_modified: string;
  modified_by: string;
  // Champs enrichis Kit / éditeur (optionnels, rétrocompatibles)
  numero?: string;
  reference_reglementaire?: string;
  point_verification?: string;
  prediction?: 'SA' | 'NS' | 'NA' | 'NV';
  confiance?: number;
  justification?: string;
  alerte?: boolean;
  prefilled?: boolean;
  observation_stylus_data?: string;
  // ── Directives d'évaluation (critères par état) ────────────────────────────
  directive_sa?: string;
  directive_ns?: string;
  directive_nv?: string;
  directive_na?: string;
  mode_saisie_obs?: 'clavier' | 'stylet' | 'ocr';
}

export interface SousSousDomaine {
  id: string;
  nom: string;
  items: ChecklistItem[];
  isExpanded: boolean;
  ordre: number;
}

export interface SousDomaine {
  id: string;
  nom: string;
  items?: ChecklistItem[];
  sousSousDomaines: SousSousDomaine[];
  isExpanded: boolean;
  ordre: number;
}

export interface DomaineChecklist {
  id: string;
  nom: string;
  description: string;
  items?: ChecklistItem[];
  sousDomaines: SousDomaine[];
  isExpanded: boolean;
  assigne_a?: string;
  assigne_nom?: string;
  progression: number;
  ordre: number;
}

export interface Certification {
  id: string
  aerodrome_id: string
  reference: string
  phase_active: 1 | 2 | 3 | 4 | 5
  phases_data: {
      phase1?: {
        date_reception: string
        coordonnees: { nom: string; poste: string; email: string; telephone: string }
        nature_demande: string
        description: string
        lettre_intent_url?: string
        rapport_preliminaire_url?: string
        lettre_transmission_url?: string
        cloture_le?: string
        // Workflow exploitant → inspecteur
        statut?: 'en_attente' | 'accuse' | 'en_cours' | 'favorable' | 'a_reviser' | 'defavorable'
        inspecteur_commentaires?: string
        inspecteur_fichiers?: { nom: string; url: string }[]
        date_accuse_reception?: string
        date_decision?: string
      }
      phase2?: {
        date_reception: string
        numero_dossier: string
        responsable_id: string
        documents: Record<string, boolean>
        completude: number
        rapport_evaluation_url?: string
        lettre_transmission_url?: string
        avis: 'favorable' | 'favorable_reserves' | 'defavorable'
        details_reserves?: string
        cloture_le?: string
        // Workflow exploitant → inspecteur
        statut?: 'en_attente' | 'accuse' | 'en_cours' | 'favorable' | 'a_reviser' | 'defavorable'
        inspecteur_commentaires?: string
        inspecteur_fichiers?: { nom: string; url: string }[]
        date_accuse_reception?: string
        date_decision?: string
      }
    phase3?: {
      surveillance_id: string
      date_verification: string
      equipe_ids: string[]
      chef_id: string
      score_conformite: number
      nc_relevees: number
      rapport_verification_url?: string
      conditions?: string
      delai_conditions?: string
      plan_action_valide?: boolean
      rapport_evaluation_pac_url?: string
      conclusion: 'favorable' | 'favorable_conditions' | 'defavorable'
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
    phase4?: {
      numero_certificat: string
      date_delivrance: string
      date_expiration: string
      conditions_exploitation?: string
      limitations?: string
      signataire_id: string
      certificat_url?: string
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
    phase5?: {
      statut_officiel: 'certifie' | 'certifie_restrictions' | 'non_certifie'
      date_publication_aip: string
      reference_aip?: string
      notam?: string
      notification_envoyee: boolean
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
  }
  statut_global: 'en_cours' | 'certifie' | 'suspendu' | 'expire' | 'archive'
  numero_cert?: string
  date_delivrance?: string
  date_expiration?: string
  lettre_signee_url?: string
  type_certification?: 'initiale' | 'renouvellement'
  archived_at?: string | null
  exemptions_ids?: string[]
  created_at: string
  updated_at: string
}

export interface Homologation {
  id: string
  aerodrome_id: string
  reference: string
  phase_active: 1 | 2 | 3
  phases_data: {
    phase1?: {
      date_reception: string
      responsable_id: string
      documents: Record<string, boolean>
      completude: number
      observations?: string
      rapport_evaluation_url?: string
      lettre_transmission_url?: string
      cloture_le?: string
      // Workflow exploitant → inspecteur
      coordonnees?: { nom: string; poste: string; email: string; telephone: string }
      description?: string
      lettre_intent_url?: string
      statut?: 'en_attente' | 'accuse' | 'en_cours' | 'favorable' | 'a_reviser' | 'defavorable'
      inspecteur_commentaires?: string
      inspecteur_fichiers?: { nom: string; url: string }[]
      date_accuse_reception?: string
      date_decision?: string
    }
    phase2?: {
      surveillance_id: string
      date_verification: string
      equipe_ids: string[]
      chef_id: string
      rapport_verification_url?: string
      score_conformite: number
      nc_relevees: number
      conditions?: string
      delai_conditions?: string
      plan_action_valide?: boolean
      rapport_evaluation_pac_url?: string
      lettre_acceptation_pac_url?: string
      lettre_acceptation_manuel_url?: string
      conclusion: 'favorable' | 'favorable_conditions' | 'defavorable'
      inspecteur_fichiers?: { nom: string; url: string }[]
      cloture_le?: string
    }
    phase3?: {
      numero_decision: string
      date_delivrance: string
      date_expiration: string
      nature_decision: 'accordee' | 'conditions' | 'refusee'
      duree_validite: number
      conditions_exploitation?: string
      signataire_id: string
      decision_url?: string
      inspecteur_fichiers?: { nom: string; url: string }[]
      notification_envoyee: boolean
      cloture_le?: string
    }
  }
  statut_global: 'en_cours' | 'homologue' | 'suspendu' | 'expire' | 'archive'
  numero_decision?: string
  date_delivrance?: string
  date_expiration?: string
  decision_signee_url?: string
  type_homologation?: 'initiale' | 'renouvellement'
  archived_at?: string | null
  exemptions_ids?: string[]
  created_at: string
  updated_at: string
}

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export type HomologationPhaseData =
  Partial<NonNullable<Homologation['phases_data']['phase1']>> &
  Partial<NonNullable<Homologation['phases_data']['phase2']>> &
  Partial<NonNullable<Homologation['phases_data']['phase3']>> &
  { [key: string]: any }

export type CertificationPhaseData =
  Partial<NonNullable<Certification['phases_data']['phase1']>> &
  Partial<NonNullable<Certification['phases_data']['phase2']>> &
  Partial<NonNullable<Certification['phases_data']['phase3']>> &
  Partial<NonNullable<Certification['phases_data']['phase4']>> &
  Partial<NonNullable<Certification['phases_data']['phase5']>> &
  { [key: string]: any }

export interface Planning {
  id: string
  aerodrome_id: string
  type: 'programmee' | 'inopinee' | 'speciale' | 'suivi_ecarts' | 'mise_oeuvre_pac' | 'certification' | 'homologation' | 'audit_complet' | 'urgence' | 'periodique' | 'inopine' | 'maintien'
  date_debut: string
  date_fin: string
  portee: string[]
  equipe_ids: string[]
  chef_id: string
  statut: 'planifiee' | 'en_cours' | 'realisee' | 'annulee' | 'en_retard'
  priorite: 'basse' | 'moyenne' | 'haute' | 'critique'
  declencheur?: 'automatique' | 'manuel' | 'renouvellement' | 'evenement' | 'demande_dg'
  objectifs: string
  observations?: string
  est_proposition: boolean
  annee_cible: number
  surveillance_id?: string
  checklist_hierarchy?: DomaineChecklist[]
  checklist_pac?: any[]
  checklist_suivi_ecarts?: any[]
  sgs_evaluation_prepa?: any  // EvaluationSGS — sauvegardée lors de la préparation
  // Rappels avant surveillance
  rappels_envoyes?: { j30?: boolean; j15?: boolean; j7?: boolean }
  // Confirmation par l'inspecteur
  confirme_le?: string
  confirme_par?: string
  date_confirmee?: string
  motif_report?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  deleted_by?: string
}

export interface Utilisateur {
  id: string
  auth_id?: string
  email: string
  identifiant?: string
  nom: string
  prenom: string
  role: string
  statut: string
  force_pwd_change?: boolean
  aerodrome_id?: string
  telephone?: string
  poste?: string
  superieur_id?: string
  fonction?: string
  service?: string
  service_rattache?: string
  competences?: any[]
  matricule?: string
  inspecteur_id?: string
  last_login?: string
  password_temporaire?: boolean
  notifications_email?: boolean
  notifications_sms?: boolean
  bio?: string
  photo_url?: string
  date_embauche?: string
  deleted_at?: string
  created_at?: string
  updated_at?: string
}

export interface EvenementSecurite {
  id: string
  aerodrome_id: string
  reference: string
  type: string
  gravite: 'CRITIQUE' | 'ORANGE' | 'JAUNE' | 'GRIS' | 'BLEU'
  date: string
  heure: string
  localisation: string
  description: string
  declarant_nom?: string
  aeronef?: {
    immatriculation: string
    type: string
    exploitant: string
  }
  blesses?: {
    mortels: number
    graves: number
    legers: number
    indemnes: number
  }
  dommages_desc?: string
  dommages_estimation?: number
  actions_immediates: string
  services_alertes: string[]
  statut: 'recu' | 'en_cours' | 'analyse' | 'ecart_cree' | 'rapport_redige' | 'cloture'
  inspecteur_id?: string
  date_assignation?: string
  date_cloture?: string
  ecart_ids?: string[]
  rapport_final_url?: string
  // Workflow événement
  classification?: 'accident' | 'incident' | 'incident_grave'
  analyse_preliminaire?: string
  recommandations?: string
  causes?: string[]
  facteurs_contributifs?: { humain: boolean; technique: boolean; environnemental: boolean; organisationnel: boolean }
  rapport_investigation?: string
  rapport_final_contenu?: string
  impact_securite?: 'moyen' | 'faible'
  created_at: string
  updated_at: string
  created_by: string
}

export interface QuestionEnquete {
  id: string
  type: string
  texte: string
  options?: string[]
  obligatoire: boolean
  ordre: number
  impact_c1: boolean
}

export interface Enquete {
  id: string
  reference: string
  titre: string
  description: string
  type_enquete: string
  aerodrome_ids: string[]
  questions: QuestionEnquete[]
  deadline: string
  statut: 'brouillon' | 'active' | 'terminee' | 'archivee'
  created_by: string
  created_at: string
  updated_at: string
}

export interface ReponseEnquete {
  id: string
  enquete_id: string
  aerodrome_id: string
  repondant_id: string
  repondant_nom: string
  repondant_role: string
  reponses: Record<string, unknown>
  score_c1?: number
  submitted_at: string
}

export interface StatistiquesEnquete {
  total_reponses: number
  taux_reponse: number
  score_moyen?: number
  reponses_par_question: Record<string, {
    moyenne?: number
    repartition?: Record<string, number>
  }>
}

export interface Message {
  id: string
  conversation_id?: string
  canal: 'interne' | 'exploitant'
  from_id: string
  from_nom: string
  from_role: string
  to_id: string | string[]
  cc_id?: string[]
  aerodrome_id?: string
  subject: string
  body: string
  attachments?: {
    nom: string
    url: string
    taille: number
    type: string
  }[]
  read_at?: string
  read_by?: string[]
  archived_by?: string[]
  replied_to?: string
  created_at: string
}

export interface Conversation {
  id: string
  participants: string[]
  dernier_message: string
  non_lus: number
  updated_at: string
}

export interface EntreeRegistre {
  id: string
  aerodrome_id?: string
  type: 'formation' | 'evenement' | 'surveillance' | 'certification' | 'homologation' | 'ecart' | 'exploitation'
  reference: string
  date_entree: string
  objet: string
  description: string
  lien_id?: string
  lien_type?: string
  signataire_id?: string
  signataire_nom?: string
  fichiers?: {
    nom: string
    url: string
    taille: number
    type: string
  }[]
  statut: 'provisoire' | 'valide' | 'archive'
  created_at: string
  created_by: string
}

export interface DossierExtension {
  date: string
  jours: 3 | 7 | 10
  motif: string
  superieur_approbation?: string
  superieur_nom?: string
}

export interface Dossier {
  id: string
  aerodrome_id?: string
  titre: string
  reference: string
  categorie: 'reglementaire' | 'technique' | 'operationnel' | 'surveillance' | 'formation' | 'financier'
  demandeur?: {
    nom: string
    organisation: string
    contact: string
  }
  service_assigne: 'securite_aerodromes' | 'normes_aerodromes'
  inspecteur_id: string
  instructions?: string
  date_instruction: string
  date_limite: string
  date_limite_initiale?: string  // vérouillée après imputation
  fichiers: {
    nom: string
    url: string
    taille: number
    type: string
    date_upload: string
    ocr_extracted?: boolean
  }[]
  progression: 0 | 25 | 50 | 75 | 100
  preuve_traitement?: string
  extensions?: DossierExtension[]
  statut: 'en_cours' | 'en_attente' | 'termine' | 'archive'
  historique: {
    date: string
    action: string
    utilisateur: string
    commentaire?: string
  }[]
  archived_at?: string | null
  created_at: string
  updated_at: string
  created_by: string
}

export interface Formation {
  id: string
  reference: string
  titre: string
  type: 'initiale' | 'continue' | 'specialisee' | 'recyclage' | 'certification'
  domaines: string[]
  date: string
  duree_heures: number
  lieu: string
  formateur: string
  formateur_externe?: boolean
  participants: string[]
  objectifs: string
  programme?: string
  documents?: {
    nom: string
    url: string
  }[]
  budget?: number
  certificat?: boolean
  certificat_nom?: string
  date_debut_reelle?: string
  statut: 'planifiee' | 'en_cours' | 'terminee' | 'annulee'
  presence?: Record<string, 'present' | 'absent' | 'excusé'>
  evaluation?: Record<string, number>
  created_at: string
  created_by: string
  deleted_at?: string
  deleted_by?: string
}

export interface Competence {
  id: string
  inspecteur_id: string
  domaine: string
  niveau: number
  date_obtention: string
  source: 'formation' | 'certification' | 'evaluation' | 'auto' | 'manuel'
  source_id?: string
  expire_le?: string
}

export interface Inspecteur {
  id: string
  matricule: string
  prenom: string
  nom: string
  email: string
  telephone?: string
  type: 'cadre_technique' | 'inspecteur_stagiaire' | 'inspecteur_titulaire' | 'inspecteur_principal'
  service: 'normes_aerodromes' | 'securite_aerodromes'
  poste?: PosteANACIM
  superieur_id?: string
  domaine_principal: 'exploitation' | 'sli' | 'genie_civil' | 'genie_electrique'
  photo?: string
  statut: 'en_service' | 'en_conge' | 'en_mission' | 'absent'
  competences: Competence[]
  formations: string[]
  user_id?: string
  created_at: string
  deleted_at?: string
  deleted_by?: string
}

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

export interface KitDocument {
  id: string
  nom: string
  type_document: 'reglementation' | 'procedure' | 'checklist' | 'modele_rapport' | 'guide' | 'autre'
  type_document_oaci?: TypeDocumentOACI
  format?: FormatDocument
  version: string
  date_revision: string
  etat: 'a_jour' | 'en_revision' | 'obsolete'
  domaines: string[]
  fichier_url: string
  fichier_nom: string
  fichier_taille: number
  mots_cles: string[]
  resume?: string
  accessible_exploitant: boolean
  telechargements: number
  reference_base?: string
  extraits?: KitDocExtrait[]
  ia_analyse_at?: string
  ia_impact?: 'majeur' | 'modere' | 'mineur' | 'aucun'
  shared_aerodrome_ids?: string[]
  partage_exploitant?: {
    id: string
    aerodrome_id: string
    partage_par: string
    partage_le: string
    message?: string
    actif: boolean
  }[]
  created_at: string
  updated_at: string
  created_by: string
}

export interface ApiKey {
  id: string
  service: string
  key_value: string
  label?: string
  is_active: boolean
  fallback_order: number
  last_tested_at?: string
  last_test_ok?: boolean
  created_at: string
  updated_at: string
}

export interface CodeAcces {
  id: string
  code: string
  code_partiel: string
  aerodrome_id: string
  created_by: string
  created_at: string
  expires_at?: string
  last_login?: string
  nb_connexions: number
  statut: 'actif' | 'expire' | 'revogue'
  code_type?: string
  description?: string
  dg_prenom?: string
  dg_nom?: string
  focal_prenom?: string
  focal_nom?: string
  staff_prenom?: string
  staff_nom?: string
  telephone?: string
  email?: string
}

export interface AuditLog {
  id: string
  date: string
  utilisateur_id: string
  utilisateur_nom: string
  utilisateur_role: string
  action: 'connexion' | 'deconnexion' | 'creation' | 'modification' | 'suppression' | 'consultation' | 'signature' | 'transmission' | 'generation_code' | 'revocation'
  module: string
  entite_type: string
  entite_id: string
  entite_nom?: string
  details?: Record<string, unknown>
  ip?: string
  user_agent?: string
}

// ============================================================
// Slices Interfaces
// ============================================================

interface RiskEngineSlice {
  decisionChecklist: DecisionChecklist | null;
  setDecisionChecklist: (decision: DecisionChecklist) => void;
  determineChecklistType: (profil: ProfilRisque, ecarts: Ecart[], typePlanning: string) => Promise<DecisionChecklist>;
  detectDomainDegradations: (profilActuel: ProfilRisque, profilPrecedent?: ProfilRisque) => DomainDegradation[];
  detectUrgentEcarts: (ecarts: Ecart[], profil: ProfilRisque) => EcartUrgent[];
  needsFullDomainAudit: (profil: ProfilRisque, degradations: DomainDegradation[], nbEcartsCritiques: number) => { necessaire: boolean; domaine: string; raison: string };
  calculateGlobalPriority: (profil: ProfilRisque) => 'critique' | 'haute' | 'moyenne' | 'basse';
  calculateRecommendedDelay: (profil: ProfilRisque, type: string) => number;
}

interface ChecklistMemorySlice {
  checklistMemoryRecords: ChecklistMemoryRecord[];
  setChecklistMemoryRecords: (records: ChecklistMemoryRecord[]) => void;
  upsertItemHistory: (
    aerodrome_id: string,
    type_inspection: string,
    domaine: string,
    sous_domaine: string,
    sous_sous_domaine: string,
    item: { id: string; numero: string; point_verification: string; resultat?: string; observation?: string; fichiers?: { nom: string; url: string; dateUpload: string }[] },
    surveillance_id: string
  ) => void;
  getPredictionForItem: (
    aerodrome_id: string,
    type_inspection: string,
    domaine: string,
    sous_domaine: string,
    sous_sous_domaine: string,
    item: { id: string; numero: string; point_verification: string },
    profil?: ProfilRisque
  ) => PredictionResult;
  recordCorrection: (
    aerodrome_id: string,
    type_inspection: string,
    domaine: string,
    sous_domaine: string,
    sous_sous_domaine: string,
    item_id: string,
    prediction: string,
    correction: string,
    commentaire?: string
  ) => void;
  getProblematicItems: (aerodrome_id?: string, seuilErreur?: number) => { record: ChecklistMemoryRecord; taux_erreur: number }[];
  getSuggestionsWithAi?: (aerodromeId: string, type_inspection: string) => Promise<SuggestionDetaillee[]>;
  getLearningStats: () => { total_items: number; items_avec_historique: number; confiance_moyenne: number; taux_ecart_recurrent: number; items_problematiques: number };
  validateBatchItems: (items: { id: string; prediction: ResultatChecklist; confiance: number }[], acceptAllSA?: boolean) => BatchValidationResult;
  importChecklistMemoryRecords: (items: {
    numero: string;
    reference_reglementaire: string;
    point_verification: string;
    directive_preuve: string;
    resultat?: 'SA' | 'NS' | 'NA';
    domaine: string;
  }[]) => void;
}

interface ExemptionSlice {
  exemptions: Exemption[];
  setExemptions: (exemptions: Exemption[]) => void;
  addExemption: (exemption: Omit<Exemption, 'id' | 'created_at' | 'updated_at'>) => void;
  updateExemption: (id: string, data: Partial<Exemption>) => void;
  deleteExemption: (id: string) => void;
  getExemptionsByParent: (parentId: string) => Exemption[];
  getExemptionsByAerodrome: (aerodromeId: string) => Exemption[];
  getExemptionsActives: (aerodromeId: string) => Exemption[];
  getMesuresByExemption: (exemptionId: string) => MesureAtténuation[];
  updateMesureAtténuation: (exemptionId: string, mesureId: string, data: Partial<MesureAtténuation>) => void;
  ajouterMesureAtténuation: (exemptionId: string, mesure: Omit<MesureAtténuation, 'id'>) => void;
}

interface LearningEngineSlice {
  learningFeedbacks: LearningFeedbackRecord[];
  recalibrationAlerts: RecalibrationAlertRecord[];
  currentModel: ModelCalibrationRecord | null;
  recordLearningFeedback: (
    aerodrome_id: string,
    domaine: string,
    sous_domaine: string,
    item_id: string,
    prediction: string,
    confiance_avant: number,
    correction: string,
    commentaire?: string
  ) => LearningFeedbackRecord;
  checkForAlerts: () => RecalibrationAlertRecord[];
  getPendingAlerts: () => RecalibrationAlertRecord[];
  acknowledgeAlert: (alertId: string, traiteePar: string) => void;
  calculatePerformance: () => { precision_globale: number; precision_par_domaine: Record<string, number>; taux_faux_positifs: number; taux_faux_negatifs: number; total_feedbacks: number; feedbacks_recents: number };
  recalibrateModel: (declencheur?: 'auto' | 'manuel' | 'admin', initiePar?: string) => ModelCalibrationRecord;
  getCurrentModel: () => ModelCalibrationRecord | null;
  getDetailedLearningStats: () => { total_feedbacks: number; taux_justesse: number; alertes_pending: number; dernier_recalibrage: string; version_modele: number; precision_par_domaine: Record<string, number>; items_ameliores: number; items_degrades: number; confiance_moyenne: number };
  exportLearningData: () => string;
  importLearningData: (jsonData: string) => void;
  resetLearningData: () => void;
}

// ============================================================
// SLICE LEARNING ENGINE PAC (évaluation PAC & preuves)
// ============================================================

interface PACLearningEngineSlice {
  // Feedbacks collectés
  pacFeedbacks: PACLearningFeedbackRecord[];
  preuveFeedbacks: PreuveLearningFeedbackRecord[];

  // Pondérations courantes (mises à jour après chaque feedback)
  ponderationsCriteres: Record<string, number>;
  ponderationsPriorisation: Record<string, number>;

  // Méthodes
  enregistrerFeedbackPAC: (
    ecartId: string,
    aerodromeId: string,
    contexte: PACLearningFeedback['contexte'],
    criteresSuggere: string[],
    criteresInspecteur: string[],
    decisionSysteme: 'accepte' | 'refuse',
    decisionInspecteur: 'accepte' | 'refuse',
    utilite: 'oui' | 'peu' | 'non',
    commentaire?: string
  ) => void;

  enregistrerFeedbackPreuves: (
    ecartId: string,
    aerodromeId: string,
    contexte: PreuveLearningFeedback['contexte'],
    criteresSuggere: string[],
    criteresInspecteur: string[],
    decisionSysteme: 'valide' | 'refuse',
    decisionInspecteur: 'valide' | 'refuse',
    utilite: 'oui' | 'peu' | 'non',
    commentaire?: string
  ) => void;

  getPACPriorite: (contexte: PACLearningFeedback['contexte']) => number;
  getLearningStatsPAC: () => {
    total_feedbacks: number;
    taux_concordance: number;
    taux_utilite: number;
    ponderations_criteres: Record<string, number>;
    ponderations_priorisation: Record<string, number>;
  };
}

interface ChecklistSlice {
  checklistHierarchy: Record<string, DomaineChecklist[]>;
  checklistItems: Record<string, ChecklistItem[]>
  setChecklistHierarchy: (surveillanceId: string, hierarchy: DomaineChecklist[]) => void
  setChecklistItems: (surveillanceId: string, items: ChecklistItem[]) => void
  updateChecklistItem: (surveillanceId: string, itemId: string, data: Partial<ChecklistItem>) => void
  getItemsNSNV: (surveillanceId: string) => ChecklistItem[]
  getItemsNSNVFromHierarchy: (surveillanceId: string) => ChecklistItem[]
  calculerProgression: (surveillanceId: string) => number
}

interface EcartsRedactionSlice {
  ecartsRedaction: EcartRedaction[]
  setEcartsRedaction: (ecarts: EcartRedaction[]) => void
  addEcartRedaction: (ecart: Omit<EcartRedaction, 'id' | 'created_at' | 'updated_at'>) => void
  updateEcartRedaction: (id: string, data: Partial<EcartRedaction>) => void
  deleteEcartRedaction: (id: string) => void
  getEcartsBySurveillance: (surveillanceId: string) => EcartRedaction[]
}

interface WorkflowSlice {
  passerEtapeSuivante: (surveillanceId: string) => Promise<void>
  peutPasserEtape: (surveillanceId: string) => { peut: boolean; raison?: string }
  verifierAvantTransmission: (surveillanceId: string) => {
    ok: boolean
    checklistSignee: boolean
    ecartsTraites: boolean
    rapportSigne: boolean
    lettreSigneeDG: boolean
    manquants: string[]
  }
  getProchaineEtape: (surveillance: Surveillance) => {
    type: 'checklist' | 'ecarts' | 'rapport' | 'lettre' | 'transmission' | null
    label: string
  }
  addSignature: (surveillanceId: string, type: string, signature: SignatureInfo) => void
  /**
   * Répare les écarts manquants pour une surveillance déjà transmise :
   * lit les ecartsRedaction (IDB du navigateur) ou Supabase ecarts_redaction
   * et crée les écarts officiels manquants dans la table ecarts.
   */
  reparerEcartsManquants: (surveillanceId: string) => Promise<{ repaired: number; message: string }>
  reparerEcartsTransmisPourAerodrome: (aerodromeId: string) => Promise<{ repaired: number; surveillances: number }>
}

interface AuthSlice {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  authLoading: boolean
  setAuthLoading: (loading: boolean) => void
}

interface AerodromeSlice {
  aerodromes: Aerodrome[]
  selectedAerodrome: Aerodrome | null 
  currentAerodrome: Aerodrome | null
  setAerodromes: (aerodromes: Aerodrome[]) => void
  setSelectedAerodrome: (aerodrome: Aerodrome | null) => void 
  setCurrentAerodrome: (aerodrome: Aerodrome | null) => void
  addAerodrome: (aerodrome: Aerodrome) => Promise<Aerodrome>  
  updateAerodrome: (id: string, data: Partial<Aerodrome>) => Promise<void>  
  deleteAerodrome: (id: string) => Promise<void>  
  getActiveAerodromes: () => Aerodrome[]
}

interface EcartSlice {
  ecarts: Ecart[]
  currentEcart: Ecart | null
  historiqueEcarts: Record<string, HistoriqueEcart[]>
  setEcarts: (ecarts: Ecart[]) => void
  setCurrentEcart: (ecart: Ecart | null) => void
  addEcart: (ecart: Ecart) => Promise<void>
  updateEcart: (id: string, data: Partial<Ecart>) => Promise<void>
  soumettrePAC: (ecartId: string, pacData: SoumissionPAC) => Promise<void>
  evaluerPAC: (ecartId: string, evaluation: EvaluationPAC) => Promise<void>
  soumettrePreuves: (ecartId: string, preuves: SoumissionPreuves) => Promise<void>
  evaluerPreuves: (ecartId: string, validation: ValidationPreuves) => Promise<void>
  getEcartsByType: (aerodromeId?: string, typeSource?: 'surveillance' | 'evenement') => Ecart[]
  getDelaiRestant: (ecart: Ecart) => { jours: number; couleur: 'vert' | 'orange' | 'rouge'; depasse: boolean }
  getHistoriqueEcart: (ecartId: string) => HistoriqueEcart[]
  getStatistiquesPAC: (aerodromeId?: string) => StatistiquesPAC
  verifierRappelsAutomatiques: () => void
  marquerEcartEnRetard: (ecartId: string) => void
  envoyerRappelEcart: (ecartId: string, typeRappel: string) => void
  getActiveEcarts: () => Ecart[]
}

interface ProfilRisqueSlice {
  profilsRisque: Record<string, ProfilRisque>
  setProfilRisque: (aerodromeId: string, profil: ProfilRisque) => Promise<void>
  getProfilRisque: (aerodromeId: string) => ProfilRisque | null
  recalculerProfilRisque: (aerodromeId: string) => Promise<void>
  getProfilRisqueWithAiInsights?: (aerodromeId: string) => Promise<{
    profil: ProfilRisque | null;
    predictions: Record<string, unknown> | null | undefined;
    recommendations: string[];
    confidence: number;
  }>;
  }

interface NotificationSlice {
  notifications: Notification[]
  unreadCount: number
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Omit<Notification, 'id' | 'sent_at'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  envoyerNotificationMultiCanal: (userId: string, notification: Omit<Notification, 'id' | 'sent_at' | 'user_id'>, canaux: ('in_app' | 'email' | 'sms')[]) => Promise<void>
}

interface CertificationSlice {
  certifications: Certification[]
  currentCertification: Certification | null
  setCertifications: (certifications: Certification[]) => void
  setCurrentCertification: (certification: Certification | null) => void
  addCertification: (certification: Certification) => void
  updateCertification: (id: string, data: Partial<Certification>) => void
  deleteCertification: (id: string) => void
  archiverCertification: (id: string) => void
  restaurerCertification: (id: string) => void
}

interface HomologationSlice {
  homologations: Homologation[]
  currentHomologation: Homologation | null
  setHomologations: (homologations: Homologation[]) => void
  setCurrentHomologation: (homologation: Homologation | null) => void
  addHomologation: (homologation: Homologation) => void
  updateHomologation: (id: string, data: Partial<Homologation>) => void
  deleteHomologation: (id: string) => void
  archiverHomologation: (id: string) => void
  restaurerHomologation: (id: string) => void
}



interface UISlice {
  activeModule: string
  setActiveModule: (module: string) => void
  activeSurveillanceId: string | null
  setActiveSurveillanceId: (id: string | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  filters: {
    search: string
    region: string[]
    type: string[]
    statut: string[]
    niveauRisque: string[]
  }
  viewMode: 'list' | 'grid' | 'map'
  setFilters: (filters: Partial<UISlice['filters']>) => void
  setViewMode: (mode: 'list' | 'grid' | 'map') => void
  isLoading: Record<string, boolean>
  setLoading: (key: string, loading: boolean) => void
  _hydrated: boolean
  pendingRegistreSource: { type: 'certification' | 'homologation'; id: string; aerodrome_id: string } | null
  setPendingRegistreSource: (source: UISlice['pendingRegistreSource']) => void
}

interface PlanningSlice {
  plannings: Planning[]
  currentPlanning: Planning | null
  propositionsN1: Planning[]
  setPlannings: (plannings: Planning[]) => void
  setCurrentPlanning: (planning: Planning | null) => void
  setPropositionsN1: (proposals: Planning[]) => void
  addPlanning: (planning: Planning) => Promise<void>
  updatePlanning: (id: string, data: Partial<Planning>) => Promise<void>
  deletePlanning: (id: string) => Promise<void>
  genererPlanningN1: (aerodromeId: string, annee: number) => Planning[]
  validerPropositionN1: (id: string) => Promise<void>
  refuserPropositionN1: (id: string, motif: string) => void
  consoliderPropositionsN1: (ids: string[]) => Promise<void>
}

interface SurveillanceSlice {
  surveillances: Surveillance[]
  currentSurveillance: Surveillance | null
  setSurveillances: (surveillances: Surveillance[]) => void
  setCurrentSurveillance: (surveillance: Surveillance | null) => void
  addSurveillance: (surveillance: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'>) => Promise<Surveillance>
  updateSurveillance: (id: string, data: Partial<Surveillance>) => Promise<void>
  deleteSurveillance: (id: string) => Promise<void>
}

interface UtilisateurSlice {
  utilisateurs: Utilisateur[]
  setUtilisateurs: (utilisateurs: Utilisateur[]) => void
  getUtilisateur: (id: string) => Utilisateur | undefined
  addUtilisateur: (u: Utilisateur) => Promise<void>
  updateUtilisateur: (id: string, data: Partial<Utilisateur>) => Promise<void>
  deleteUtilisateur: (id: string) => Promise<void>
}

interface EvenementSlice {
  evenements: EvenementSecurite[]
  currentEvenement: EvenementSecurite | null
  setEvenements: (evenements: EvenementSecurite[]) => void
  setCurrentEvenement: (evenement: EvenementSecurite | null) => void
  addEvenement: (evenement: Omit<EvenementSecurite, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateEvenement: (id: string, data: Partial<EvenementSecurite>) => Promise<void>
  deleteEvenement: (id: string) => void
  assignerInspecteur: (evenementId: string, inspecteurId: string) => void
  creerEcartLie: (evenementId: string, ecartData: Partial<Ecart>) => void
  getEvenementsByAerodrome: (aerodromeId: string) => EvenementSecurite[]
  getEvenementsUrgents: () => EvenementSecurite[]
}

interface EnqueteSlice {
  enquetes: Enquete[]
  reponsesEnquetes: ReponseEnquete[]
  currentEnquete: Enquete | null
  setEnquetes: (enquetes: Enquete[]) => void
  setReponses: (reponses: ReponseEnquete[]) => void
  addEnquete: (enquete: Omit<Enquete, 'id' | 'created_at' | 'updated_at'>) => void
  updateEnquete: (id: string, data: Partial<Enquete>) => void
  deleteEnquete: (id: string) => void
  soumettreReponse: (reponse: Omit<ReponseEnquete, 'id' | 'submitted_at'>) => void
  getStatistiquesEnquete: (enqueteId: string) => StatistiquesEnquete
  calculerImpactC1: (reponses: ReponseEnquete[]) => number
}

interface MessagerieSlice {
  messages: Message[]
  conversations: Conversation[]
  messagesNonLus: number
  setMessages: (messages: Message[]) => void
  envoyerMessage: (message: Omit<Message, 'id' | 'created_at'>) => void
  marquerCommeLu: (messageId: string) => void
  supprimerMessage: (messageId: string, userId: string) => void
  archiverMessage: (messageId: string, userId: string) => void
  marquerCommeNonLu: (messageId: string, userId: string) => void
  getConversations: (userId: string) => Conversation[]
  getMessagesConversation: (conversationId: string) => Message[]
  getMessagesNonLus: (userId: string) => number
}

interface RegistreSlice {
  registres: EntreeRegistre[]
  setRegistres: (registres: EntreeRegistre[]) => void
  addEntreeRegistre: (entree: Omit<EntreeRegistre, 'id' | 'created_at'>) => void
  getRegistresByType: (type: string, aerodromeId?: string) => EntreeRegistre[]
  getRegistresByAerodrome: (aerodromeId: string) => EntreeRegistre[]
  genererEntreeFromSource: (source: Record<string, unknown>, type: string) => EntreeRegistre
}

interface DossierSlice {
  dossiers: Dossier[]
  currentDossier: Dossier | null
  setDossiers: (dossiers: Dossier[]) => void
  setCurrentDossier: (dossier: Dossier | null) => void
  addDossier: (dossier: Omit<Dossier, 'id' | 'created_at' | 'updated_at' | 'historique'>) => void
   updateDossier: (id: string, data: Partial<Dossier>) => void
   extendreDossier: (id: string, extension: DossierExtension, superieurNom?: string) => void
  deleteDossier: (id: string) => void
  getDossiersByInspecteur: (inspecteurId: string) => Dossier[]
  getDossiersUrgents: () => Dossier[]
  archiverDossierAutomatique: (dossierId: string) => void;
  restaurerDossier: (dossierId: string) => void;
}

interface FormationSlice {
  formations: Formation[]
  inspecteurs: Inspecteur[]
  competences: Competence[]
  competencesVersion: number
  setFormations: (formations: Formation[]) => void
  setInspecteurs: (inspecteurs: Inspecteur[]) => void
  addFormation: (formation: Omit<Formation, 'id' | 'created_at'>) => Promise<void>
  updateFormation: (id: string, data: Partial<Formation>) => Promise<void>
  deleteFormation: (id: string) => Promise<void>
  addInspecteur: (inspecteur: Omit<Inspecteur, 'id' | 'created_at'>) => Promise<void>
  updateInspecteur: (id: string, data: Partial<Inspecteur>) => Promise<void>
  deleteInspecteur: (id: string) => Promise<void>
  getCompetencesByInspecteur: (inspecteurId: string) => Competence[]
  getFormationsByInspecteur: (inspecteurId: string) => Formation[]
  mettreAJourCompetences: (inspecteurId: string, formationId: string) => void
  incrementerVersion: () => void
}

interface KitSlice {
  kitDocuments: KitDocument[]
  setKitDocuments: (documents: KitDocument[]) => void
  addKitDocument: (document: Omit<KitDocument, 'id' | 'created_at' | 'updated_at' | 'telechargements'>) => void
  updateKitDocument: (id: string, data: Partial<KitDocument>) => void
  deleteKitDocument: (id: string) => void
  getDocumentsByDomaine: (domaine: string) => KitDocument[]
  getDocumentsExploitant: (aerodromeId?: string) => KitDocument[]
  partagerKitDocumentExploitant: (documentId: string, aerodromeId: string, message?: string) => void
  revoquerPartageKitDocument: (documentId: string, aerodromeId: string) => void
  incrementerTelechargement: (id: string) => void
  kitPreviewDoc: KitDocument | null
  kitPreviewData: any[] | null
  kitAnalyseIA: any | null
  setKitPreview: (doc: KitDocument | null, data: any[] | null, analyse: any | null) => void
  clearKitPreview: () => void
}

interface MasterChecklistSlice {
  masterChecklists: Record<string, DomaineChecklist[]>
  setMasterChecklist: (id: string, checklist: DomaineChecklist[]) => void
  deleteMasterChecklist: (id: string) => void
  findMasterChecklistForPortee: (portee: string[]) => { id: string; checklist: DomaineChecklist[] } | null
}

interface ApiKeySlice {
  apiKeys: ApiKey[]
  setApiKeys: (keys: ApiKey[]) => void
  addApiKey: (key: Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateApiKey: (id: string, data: Partial<ApiKey>) => Promise<void>
  deleteApiKey: (id: string) => Promise<void>
}

interface CodeAccesSlice {
  codesAcces: CodeAcces[]
  setCodesAcces: (codes: CodeAcces[]) => void
  genererCode: (aerodromeId: string, description?: string, expiresAt?: string, codeGenere?: string, codeType?: string, dgPrenom?: string, dgNom?: string, focalPrenom?: string, focalNom?: string, staffPrenom?: string, staffNom?: string, telephone?: string, email?: string) => CodeAcces
  revoquerCode: (id: string) => Promise<void>
  deleteCodeAcces: (id: string) => Promise<void>
  verifierCode: (code: string) => { valide: boolean; aerodromeId?: string }
  getCodesByAerodrome: (aerodromeId: string) => CodeAcces[]
}

interface RegistreSlice {
  registreEntries: RegistreEntry[];
  setRegistreEntries: (entries: RegistreEntry[]) => void;
  addRegistreEntry: (entry: RegistreEntry) => void;
  updateRegistreEntry: (id: string, data: Partial<RegistreEntry>) => void;
  deleteRegistreEntry: (id: string) => void;
  getRegistreByType: (type: string) => RegistreEntry[];
  getRegistreByAerodrome: (aerodromeId: string) => RegistreEntry[];
}

interface RegistreIASlice {
  regulationAnalyses: RegulationAnalysis[];
  formationSuggestions: FormationSuggestion[];
  addRegulationAnalysis: (analysis: RegulationAnalysis) => void;
  updateRegulationAnalysis: (id: string, data: Partial<RegulationAnalysis>) => void;
  addFormationSuggestion: (suggestion: FormationSuggestion) => void;
  updateFormationSuggestion: (id: string, data: Partial<FormationSuggestion>) => void;
  getPendingRegulationAlerts: () => RegulationAnalysis[];
  getFormationSuggestionsByInspector: (inspecteurId: string) => FormationSuggestion[];
}

interface AuditSlice {
  auditLogs: AuditLog[]
  setAuditLogs: (logs: AuditLog[]) => void
  addAuditLog: (log: Omit<AuditLog, 'id' | 'date'>) => void
  getLogsByUtilisateur: (utilisateurId: string) => AuditLog[]
  getLogsByModule: (module: string) => AuditLog[]
  getLogsByPeriode: (debut: string, fin: string) => AuditLog[]
  exporterLogsCSV: (logs: AuditLog[]) => string
}

// ============================================================
// NOUVELLE SLICE POUR RISQUE ANALYTICS AVANCÉ
// ============================================================

interface RiskAnalyticsSlice {
  historiqueScores: Record<string, ScoreHistoryPoint[]>
  predictionHistorique: PredictionHistoryRecord[]
  actionOutcomes: ActionOutcomeRecord[]
  changePoints: ChangePointRecord[]
  velocitySnapshots: VelocitySnapshotRecord[]
  stressHistory: StressHistoryRecord[]
  proactiveAlerts: ProactiveAlertRecord[]
  modelPerformances: ModelPerformanceRecord[]
  
  addScoreHistoryPoint: (aerodromeId: string, point: ScoreHistoryPoint) => void
  addPredictionHistory: (prediction: PredictionHistoryRecord) => void
  addActionOutcome: (outcome: ActionOutcomeRecord) => void
  addChangePoint: (changePoint: ChangePointRecord) => void
  addVelocitySnapshot: (snapshot: VelocitySnapshotRecord) => void
  addStressHistoryPoint: (point: StressHistoryRecord) => void
  addProactiveAlert: (alert: ProactiveAlertRecord) => void
  acknowledgeProactiveAlert: (alertId: string) => void
  resolveAlert: (alertId: string) => void
  updateModelPerformance: (performance: ModelPerformanceRecord) => void
  getHistoricalScoresForAerodrome: (aerodromeId: string) => ScoreHistoryPoint[]
  getPredictionsForAerodrome: (aerodromeId: string) => PredictionHistoryRecord[]
  getActionsForAerodrome: (aerodromeId: string) => ActionOutcomeRecord[]
  computeEffectivenessScore: (aerodromeId: string) => number
  computeFullRiskProfile: (aerodromeId: string) => Promise<void>
   getHawkesRiskForAerodrome: (aerodromeId: string) => { riskNext30Days: number; currentIntensity: number }
   getRecurrentPatterns: (aerodromeId: string) => import('./risque').ChangePoint[]
   getBanditRecommendation: (context: Record<string, unknown>) => unknown
   updateBanditReward: (context: Record<string, unknown>, actionId: string, reward: number) => void
   getTransferPredictions: (aerodromeId: string) => Map<string, unknown>
}

// ============================================================
// STORE COMPLET
// ============================================================

export interface AppStore extends
  AuthSlice,
  AerodromeSlice,
  SurveillanceSlice,
  EcartSlice,
  PlanningSlice,
  ProfilRisqueSlice,
  NotificationSlice,
  ExemptionSlice,
  CertificationSlice,
  HomologationSlice,
   UISlice,
   RegistreSlice,      
   ChecklistSlice,      
   EcartsRedactionSlice, 
   WorkflowSlice,
   EvenementSlice,
   EnqueteSlice,
   MessagerieSlice,
   DossierSlice,
  FormationSlice,
  KitSlice,
  MasterChecklistSlice,
  CodeAccesSlice,
  AuditSlice,
  UtilisateurSlice,
   ApiKeySlice,
   RiskEngineSlice,
   ChecklistMemorySlice,
   LearningEngineSlice,
  PACLearningEngineSlice,
  RiskAnalyticsSlice,
  RegistreIASlice,
  AdvancedModelsSlice,
  DelegationSlice,
  AlerteSlice,
  PresenceSlice,
  RiskIndexFeedbackSlice,
  SuggestionFeedbackSlice {}

interface DelegationSlice {
  delegations: Delegation[];
  setDelegations: (delegations: Delegation[]) => void;
  addDelegation: (delegation: Omit<Delegation, 'id'>) => void;
  updateDelegation: (id: string, data: Partial<Delegation>) => void;
  deleteDelegation: (id: string) => void;
  getDelegationsBySurveillance: (surveillanceId: string) => Delegation[];
  getDelegationsByInspecteur: (inspecteurId: string) => Delegation[];
  getDelegationsByDomaine: (surveillanceId: string, domaine: string) => Delegation | undefined;
}

interface AlerteSlice {
  alertesSecurite: AlerteSecuriteFull[];
  setAlertesSecurite: (alertes: AlerteSecuriteFull[]) => void;
  addAlerteSecurite: (alerte: Omit<AlerteSecuriteFull, 'id'>) => void;
  updateAlerteSecurite: (id: string, data: Partial<AlerteSecuriteFull>) => void;
  deleteAlerteSecurite: (id: string) => void;
  getAlertesBySurveillance: (surveillanceId: string) => AlerteSecuriteFull[];
  getAlertesActivesBySurveillance: (surveillanceId: string) => AlerteSecuriteFull[];
}

interface PresenceSlice {
  fichesPresence: PresenceEntry[];
  setFichesPresence: (fiches: PresenceEntry[]) => void;
  addFichePresence: (fiche: Omit<PresenceEntry, 'id'>) => void;
  updateFichePresence: (id: string, data: Partial<PresenceEntry>) => void;
  deleteFichePresence: (id: string) => void;
  getFichesBySurveillance: (surveillanceId: string) => PresenceEntry[];
  getFichesSigneesBySurveillance: (surveillanceId: string) => PresenceEntry[];
}

interface RiskIndexFeedbackSlice {
  riskIndexFeedbacks: RiskIndexFeedback[];
  setRiskIndexFeedbacks: (feedbacks: RiskIndexFeedback[]) => void;
  addRiskIndexFeedback: (feedback: Omit<RiskIndexFeedback, 'id'>) => void;
  getFeedbacksByAerodrome: (aerodromeId: string) => RiskIndexFeedback[];
  getRiskIndexLearningStats: () => { totalFeedbacks: number; modelVersion: number; lastCalibrated: string; adjustmentsCount: number };
}

export interface SuggestionFeedback {
  id: string;
  aerodrome_id: string;
  suggestion_type: 'surveillance_pac' | 'surveillance_ecarts' | 'surveillance_mixte' | 'audit_complet';
  mission_type_suggeree: string;
  mission_type_effectif?: string;
  etait_pertinent: boolean;
  raison_inexactitude?: string;
  contexte_json?: string;
  ecart_ids?: string[];
  date_suggestion: string;
  date_feedback?: string;
}

interface SuggestionFeedbackSlice {
  suggestionFeedbacks: SuggestionFeedback[];
  setSuggestionFeedbacks: (feedbacks: SuggestionFeedback[]) => void;
  submitSuggestionFeedback: (feedback: Omit<SuggestionFeedback, 'id'>) => void;
  getSuggestionFeedbacksByAerodrome: (aerodromeId: string) => SuggestionFeedback[];
  getSuggestionAccuracy: (aerodromeId?: string) => { total: number; pertinents: number; rate: number };
  getAdjustedThreshold: (aerodromeId: string, baseThreshold: number, suggestionType: string) => number;
}

import { zustandIDBStorage } from '@/lib/persistence/zustandStorage'

function stripHtmlToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeEcartNiveau(value: string): Ecart['niveau_risque'] {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (normalized.includes('critique')) return 'critique'
  if (normalized.includes('eleve')) return 'eleve'
  if (normalized.includes('faible')) return 'faible'
  return 'moyen'
}

function extractEcartsFromRapportHtml(surveillance: Surveillance): Partial<EcartRedaction>[] {
  const html = surveillance.rapport_html
  if (!html) return []

  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const annexeTitle = Array.from(document.querySelectorAll('h3'))
      .find(h => h.textContent?.toLowerCase().includes('écarts constatés'))
    const table = annexeTitle?.nextElementSibling?.tagName === 'TABLE'
      ? annexeTitle.nextElementSibling
      : annexeTitle?.parentElement?.querySelector('table')

    return Array.from(table?.querySelectorAll('tbody tr') || [])
      .map((row, index) => {
        const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '')
        if (cells.length < 4 || cells.join(' ').toLowerCase().includes('aucun écart constaté')) return null
        return {
          id: `rapport-${surveillance.id}-${index}`,
          reference: cells[0],
          ref_reglementaire: cells[1],
          libelle: cells[2],
          niveau: normalizeEcartNiveau(cells[3]),
          surveillance_id: surveillance.id,
          aerodrome_id: surveillance.aerodrome_id,
          domaine: surveillance.portee?.[0] || 'SGS',
          created_at: surveillance.transmitted_at || surveillance.updated_at || new Date().toISOString(),
        }
      })
      .filter((ecart): ecart is Exclude<typeof ecart, null> => !!ecart && !!ecart.reference && !!ecart.libelle)
  }

  const annexeMatch = html.match(/Annexe A-2[\s\S]*?(?:<h3>|$)/i)
  const annexeHtml = annexeMatch?.[0] || ''
  const rows = Array.from(annexeHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi))

  return rows
    .map((row, index) => {
      const cells = Array.from(row[0].matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi))
        .map(cell => stripHtmlToText(cell[1]))
      if (cells.length < 4 || cells.join(' ').toLowerCase().includes('aucun écart constaté')) return null
      return {
        id: `rapport-${surveillance.id}-${index}`,
        reference: cells[0],
        ref_reglementaire: cells[1],
        libelle: cells[2],
        niveau: normalizeEcartNiveau(cells[3]),
        surveillance_id: surveillance.id,
        aerodrome_id: surveillance.aerodrome_id,
        domaine: surveillance.portee?.[0] || 'SGS',
        created_at: surveillance.transmitted_at || surveillance.updated_at || new Date().toISOString(),
      }
    })
    .filter((ecart): ecart is Exclude<typeof ecart, null> => !!ecart && !!ecart.reference && !!ecart.libelle)
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ============================================================
      // AUTH SLICE
      // ============================================================
      user: null,
      setUser: (user) => {
        set({ user })
        if (user?.id) {
          import('@/lib/datastore').then(({ fetchNotifications }) => {
            fetchNotifications(user.id).then((res) => {
              if (res.data) get().setNotifications(res.data as Notification[])
            })
          }).catch(() => {})
        }
      },
      authLoading: false,
      setAuthLoading: (loading) => set({ authLoading: loading }),

      // ============================================================
      // UTILISATEUR SLICE
      // ============================================================
      utilisateurs: [],
      setUtilisateurs: (utilisateurs) => set({ utilisateurs }),
      getUtilisateur: (id) => get().utilisateurs.find(u => u.id === id),
      addUtilisateur: async (u) => {
        set((state) => ({ utilisateurs: [...state.utilisateurs, u] }))
        // L'API /api/auth/create-user gère déjà la création Supabase
        // On ne fait qu'ajouter au store local
      },
      updateUtilisateur: async (id, data) => {
        set((state) => ({ utilisateurs: state.utilisateurs.map(u => u.id === id ? { ...u, ...data } : u) }))
        datastore.updateUtilisateur(id, data).then(r => { if (r.error) console.error('Erreur update utilisateur Supabase:', r.error) })
        // Sync vers Inspecteur si poste ou superieur_id change
        if (data.poste !== undefined || data.superieur_id !== undefined) {
          const user = get().utilisateurs.find(u => u.id === id)
          if (user?.inspecteur_id) {
            get().updateInspecteur(user.inspecteur_id, { poste: data.poste as PosteANACIM, superieur_id: data.superieur_id })
          }
        }
      },
      deleteUtilisateur: async (id: string) => {
        const state = get()
        const user = state.utilisateurs.find(u => u.id === id)
        if (!user) return
        const userId = get().user?.id || ''
        const deletedBy = state.user ? `${state.user.prenom} ${state.user.nom}` : 'Administrateur'
        
        // Trouver l'inspecteur lié
        const linkedInspecteur = state.inspecteurs.find(i => i.id === user.inspecteur_id)
        
        // Supprimer le compte Supabase Auth
        if (user.auth_id) {
          try {
            await fetch('/api/auth/delete-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ auth_id: user.auth_id }),
            })
          } catch (error) {
            console.error('Erreur API delete-user:', error)
          }
        }
        
        // Supprimer l'utilisateur de Supabase DB
        await datastore.deleteUtilisateur(id)
        
        // Supprimer l'utilisateur du store local
        set((state) => ({
          utilisateurs: state.utilisateurs.filter(u => u.id !== id)
        }))
        
        // Si un inspecteur est lié, le supprimer aussi avec cascade
        if (linkedInspecteur) {
          // Supprimer l'inspecteur dans Supabase
          await datastore.deleteInspecteur(linkedInspecteur.id)
          
          set((state) => ({
            inspecteurs: state.inspecteurs.filter(i => i.id !== linkedInspecteur.id),
            formations: state.formations.map(f => 
              f.participants?.includes(linkedInspecteur.id) && f.statut !== 'terminee'
                ? { ...f, participants: f.participants.filter((p: string) => p !== linkedInspecteur.id) }
                : f
            ),
            surveillances: state.surveillances.map(s => 
              s.equipe_ids?.includes(linkedInspecteur.id) && !['archivee', 'terminee'].includes(s.statut)
                ? { ...s, equipe_ids: s.equipe_ids.filter((eId: string) => eId !== linkedInspecteur.id) }
                : s
            ),
            ecarts: state.ecarts.map(e => 
              e.responsable_id === linkedInspecteur.id && !['resolu', 'archive'].includes(e.statut)
                ? { ...e, responsable_id: undefined }
                : e
            ),
          }))
          
          // Notification email à l'inspecteur
          if (linkedInspecteur.email) {
            const { notifyInspecteurDeleted } = await import('./notifications')
            notifyInspecteurDeleted(linkedInspecteur.prenom, linkedInspecteur.nom, linkedInspecteur.email, deletedBy)
          }
        }
        
        // Notification in-app + email aux admins
        const cascadeResults = linkedInspecteur ? [
          { type: 'formations', count: state.formations.filter(f => f.participants?.includes(linkedInspecteur.id) && f.statut !== 'terminee').length },
          { type: 'surveillances', count: state.surveillances.filter(s => s.equipe_ids?.includes(linkedInspecteur.id) && !['archivee', 'terminee'].includes(s.statut)).length },
        ] : []
        const { notifyDeletionCascade } = await import('./notifications')
        notifyDeletionCascade('inspecteur', `${user.prenom} ${user.nom}`, cascadeResults, deletedBy)
        
        get().addNotification({
          user_id: userId,
          type: 'warning',
          message: `L'utilisateur ${user.prenom} ${user.nom} a été supprimé${linkedInspecteur ? ' (inspecteur lié supprimé également)' : ''}`,
          canal: 'in_app'
        })
      },

       // ============================================================
// EXEMPTION SLICE
// ============================================================
exemptions: [],
setExemptions: (exemptions) => set({ exemptions }),
addExemption: (exemption) => set((state) => ({
  exemptions: [...state.exemptions, {
    ...exemption,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Exemption]
})),
updateExemption: (id, data) => set((state) => ({
  exemptions: state.exemptions.map(e => e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e)
})),
deleteExemption: (id) => set((state) => ({
  exemptions: state.exemptions.filter(e => e.id !== id)
})),
getExemptionsByAerodrome: (aerodromeId) => {
  return get().exemptions.filter(e => e.aerodrome_id === aerodromeId);
},
getExemptionsByParent: (parentId) => {
  return get().exemptions.filter(e => e.parent_id === parentId);
},
getExemptionsActives: (aerodromeId) => {
  const now = new Date();
  return get().exemptions.filter(e => 
    e.aerodrome_id === aerodromeId &&
    e.statut === 'active' &&
    e.date_fin_prevue &&
    new Date(e.date_fin_prevue) >= now
  );
},
getMesuresByExemption: (exemptionId) => {
  const exemption = get().exemptions.find(e => e.id === exemptionId);
  return exemption?.mesures || [];
},
updateMesureAtténuation: (exemptionId, mesureId, data) => set((state) => ({
  exemptions: state.exemptions.map(e => 
    e.id === exemptionId 
      ? { 
          ...e, 
          mesures: e.mesures.map(m => m.id === mesureId ? { ...m, ...data } : m),
          updated_at: new Date().toISOString()
        }
      : e
  )
})),
ajouterMesureAtténuation: (exemptionId, mesure) => set((state) => ({
  exemptions: state.exemptions.map(e => 
    e.id === exemptionId 
      ? { 
          ...e, 
          mesures: [...e.mesures, { ...mesure, id: crypto.randomUUID() }],
          updated_at: new Date().toISOString()
        }
      : e
  )
})),

// Dans le create, ajouter les implémentations
registreEntries: [],
setRegistreEntries: (entries) => set({ registreEntries: entries }),
addRegistreEntry: (entry) => set((state) => ({ 
  registreEntries: [...state.registreEntries, entry] 
})),
updateRegistreEntry: (id, data) => set((state) => ({
  registreEntries: state.registreEntries.map(e => e.id === id ? { ...e, ...data } : e)
})),
deleteRegistreEntry: (id) => set((state) => ({
  registreEntries: state.registreEntries.filter(e => e.id !== id)
})),
getRegistreByType: (type) => get().registreEntries.filter(e => e.type === type),
getRegistreByAerodrome: (aerodromeId) => get().registreEntries.filter(e => e.aerodrome_id === aerodromeId),
      // ============================================================
      // AERODROME SLICE
      // ============================================================
      aerodromes: [],
      selectedAerodrome: null,
      currentAerodrome: null,
      setAerodromes: (aerodromes) => set({ aerodromes }),
      setSelectedAerodrome: (aerodrome) => set({ selectedAerodrome: aerodrome }),
      setCurrentAerodrome: (aerodrome) => set({ currentAerodrome: aerodrome }),
      addAerodrome: async (aerodrome) => {
  const tempId = crypto.randomUUID()
  const now = new Date().toISOString()
  const tempAerodrome = { ...aerodrome, id: tempId, created_at: now, updated_at: now } as Aerodrome
  set((state) => ({ aerodromes: [...state.aerodromes, tempAerodrome] }))
  try {
    const result = await datastore.createAerodrome(aerodrome as any)
    if (result.error) throw new Error(result.error)
    const saved = result.data as Aerodrome
    set((state) => ({ aerodromes: state.aerodromes.map(a => a.id === tempId ? saved : a) }))
    return saved
  } catch (error) {
    set((state) => ({ aerodromes: state.aerodromes.filter(a => a.id !== tempId) }))
    throw error
  }
},

updateAerodrome: async (id, data) => {
  const snapshot = get().aerodromes
  const snapshotCurrent = get().currentAerodrome
  set((state) => ({
    aerodromes: state.aerodromes.map((a) => a.id === id ? { ...a, ...data, updated_at: new Date().toISOString() } : a),
    currentAerodrome: state.currentAerodrome?.id === id
      ? { ...state.currentAerodrome, ...data }
      : state.currentAerodrome,
  }))
  try {
    const result = await datastore.updateAerodrome(id, data)
    if (result.error) throw new Error(result.error)
    get().recalculerProfilRisque(id)
  } catch (error) {
    set({ aerodromes: snapshot, currentAerodrome: snapshotCurrent })
    throw error
  }
},

deleteAerodrome: async (id: string) => {
  const state = get()
  const aerodrome = state.aerodromes.find(a => a.id === id)
  if (!aerodrome) return

  const userId = get().user?.id || ''
  const deletedBy = state.user ? `${state.user.prenom} ${state.user.nom}` : 'Administrateur'

  // Révoquer tous les codes acces actifs de l'aérodrome dans Supabase
  const codesActifs = state.codesAcces.filter(c => c.aerodrome_id === id && c.statut === 'actif')
  if (codesActifs.length > 0) {
    const results = await Promise.allSettled(codesActifs.map(c => datastore.revokeCodeAcces(c.id)))
    results.forEach((r, i) => { if (r.status === 'rejected') console.error('Erreur révocation code accès:', codesActifs[i].id, r.reason) })
  }

  // Supprimer dans Supabase (cascade sur toutes les tables liées)
  await datastore.deleteAerodrome(id)

  // Hard delete du store local avec cascade
  set((state) => ({
    aerodromes: state.aerodromes.filter(a => a.id !== id),
    surveillances: state.surveillances.filter(s => s.aerodrome_id !== id),
    certifications: state.certifications.filter(c => c.aerodrome_id !== id),
    homologations: state.homologations.filter(h => h.aerodrome_id !== id),
    ecarts: state.ecarts.filter(e => e.aerodrome_id !== id),
    plannings: state.plannings.filter(p => p.aerodrome_id !== id),
    profilsRisque: Object.fromEntries(
      Object.entries(state.profilsRisque || {}).filter(([key]) => key !== id)
    ),
    codesAcces: state.codesAcces.filter(c => c.aerodrome_id !== id),
  }))

  // Notification email au DG et point focal + admins
  const { notifyAerodromeDeleted } = await import('./notifications')
  notifyAerodromeDeleted(aerodrome.nom, aerodrome.code_oaci, deletedBy)

  get().addNotification({
    user_id: userId,
    type: 'warning',
    message: `L'aérodrome ${aerodrome.code_oaci} - ${aerodrome.nom} a été supprimé avec cascade (codes révoqués, surveillances, certifications, homologations, écarts, plannings)`,
          canal: 'in_app'
        })
        get().incrementerVersion()
      },

getActiveAerodromes: () => {
  return get().aerodromes.filter(a => !a.deleted_at)
},

      // ============================================================
      // SURVEILLANCE SLICE
      // ============================================================
      surveillances: [],
      currentSurveillance: null,
      setSurveillances: (surveillances) => set({ surveillances }),
      setCurrentSurveillance: (surveillance) => set({ currentSurveillance: surveillance }),
      addSurveillance: async (surveillanceData) => {
        const now = new Date().toISOString()
        // Chef par défaut si vide
        const defautChefId = surveillanceData.chef_id && surveillanceData.chef_id !== '00000000-0000-0000-0000-000000000000'
          ? surveillanceData.chef_id
          : (() => {
              const inspecteurs = get().inspecteurs || []
              const defaut = inspecteurs.find(i => i.type === 'inspecteur_principal' && i.statut === 'en_service' && !i.deleted_at)
                || inspecteurs.find(i => i.type === 'inspecteur_titulaire' && i.statut === 'en_service' && !i.deleted_at)
                || inspecteurs.find(i => !i.deleted_at)
              if (defaut?.user_id) return defaut.user_id
              const utilisateurs = get().utilisateurs || []
              const userDefaut = get().user
                || utilisateurs.find(u => u.role === 'admin' && u.statut === 'actif')
                || utilisateurs.find(u => u.statut === 'actif')
              return userDefaut?.id || crypto.randomUUID()
            })()
        const newSurveillance: Surveillance = {
          id: crypto.randomUUID(),
          ...surveillanceData,
          chef_id: defautChefId,
          statut: surveillanceData.statut || 'planifiee',
          progression: 0,
          signatures_checklist: [],
          signatures_ecarts: [],
          signatures_rapport: [],
          created_at: now,
          updated_at: now,
          created_by: get().user?.id || defautChefId,
          updated_by: get().user?.id || defautChefId,
        }
        const result = await datastore.createSurveillance({ ...surveillanceData, chef_id: defautChefId, created_by: newSurveillance.created_by, updated_by: newSurveillance.updated_by } as any)
        if (result.error) {
          console.error('Erreur création surveillance Supabase:', result.error)
          toast('error', 'Erreur création surveillance', result.error)
          throw new Error(result.error)
        }
        const savedSurveillance = result.data as Surveillance
        set((state) => ({ surveillances: [...state.surveillances, savedSurveillance] }))
        toast('success', 'Surveillance créée', savedSurveillance.type.replace(/_/g, ' '))
        get().addNotification({
          user_id: get().user?.id || '',
          type: 'info',
          message: `Nouvelle surveillance créée`,
          link: `/surveillance/${savedSurveillance.id}`,
          canal: 'in_app'
        })
        get().incrementerVersion()
        return savedSurveillance
      },
      updateSurveillance: async (id, data) => {
        const oldSurveillance = get().surveillances.find(s => s.id === id)
        if (!oldSurveillance) return
        const snapshot = {
          surveillances: get().surveillances,
          currentSurveillance: get().currentSurveillance,
        }
        set((state) => ({
          surveillances: state.surveillances.map((s) => s.id === id ? { ...s, ...data, updated_at: new Date().toISOString() } : s),
          currentSurveillance: state.currentSurveillance?.id === id ? { ...state.currentSurveillance, ...data } : state.currentSurveillance,
        }))
        const { sgs_evaluation_prepa, ...dataSansSGS } = data;
        const result = await datastore.updateSurveillance(id, dataSansSGS)
        if (result.error) {
          console.error('Erreur update surveillance Supabase, rollback:', result.error)
          toast('error', 'Échec de la mise à jour', 'Les modifications n\'ont pas pu être sauvegardées')
          set({ surveillances: snapshot.surveillances, currentSurveillance: snapshot.currentSurveillance })
          return
        }

        if (!oldSurveillance || !data.statut || data.statut === oldSurveillance.statut) return
        const _aerodrome = get().aerodromes.find(a => a.id === oldSurveillance.aerodrome_id)
        const _codeOaci = _aerodrome?.code_oaci ?? oldSurveillance.aerodrome_id
        const _typeLabel = (oldSurveillance.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
        const _addN = get().addNotification
        const _equipeIds = oldSurveillance.equipe_ids || []
        const _exploitants = get().utilisateurs.filter(u =>
          u.aerodrome_id === oldSurveillance.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        const _link = `/surveillance/${id}`
        const _newStatut = data.statut as string

        switch (_newStatut) {
          case 'transmise':
            _exploitants.forEach(u =>
              _addN({ user_id: u.id, type: 'success', title: `📨 Rapport transmis — ${_codeOaci}`, message: `Le rapport de surveillance ${_typeLabel} de ${_codeOaci} vous a été transmis.`, canal: 'in_app', link: _link })
            )
            _equipeIds.forEach(uid =>
              _addN({ user_id: uid, type: 'success', title: `📨 Rapport transmis — ${_codeOaci}`, message: `Le rapport de surveillance ${_typeLabel} de ${_codeOaci} a été transmis à l'exploitant.`, canal: 'in_app', link: _link })
            )
            break
          case 'annulee':
            ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
              _addN({ user_id: uid, type: 'danger', title: `❌ Surveillance annulée — ${_codeOaci}`, message: `La surveillance ${_typeLabel} de ${_codeOaci} a été annulée.`, canal: 'in_app' })
            )
            break
          case 'checklist_signee':
            _equipeIds.forEach(uid =>
              _addN({ user_id: uid, type: 'success', title: `✅ Checklist signée — ${_codeOaci}`, message: `La checklist de la surveillance ${_typeLabel} de ${_codeOaci} a été signée par tous les inspecteurs.`, canal: 'in_app', link: _link })
            )
            break
          case 'ecarts_signes':
            _equipeIds.forEach(uid =>
              _addN({ user_id: uid, type: 'info', title: `📋 Écarts signés — ${_codeOaci}`, message: `Les écarts de la surveillance ${_typeLabel} de ${_codeOaci} ont été signés.`, canal: 'in_app', link: _link })
            )
            break
          case 'rapport_signe':
            _equipeIds.forEach(uid =>
              _addN({ user_id: uid, type: 'success', title: `✍️ Rapport signé — ${_codeOaci}`, message: `Le rapport de la surveillance ${_typeLabel} de ${_codeOaci} a été signé.`, canal: 'in_app', link: _link })
            )
            break
          case 'lettre_signee':
            ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
              _addN({ user_id: uid, type: 'info', title: `✉️ Lettre signée — ${_codeOaci}`, message: `La lettre de transmission de la surveillance ${_typeLabel} de ${_codeOaci} a été signée.`, canal: 'in_app', link: _link })
            )
            break
          case 'archivee':
            _equipeIds.forEach(uid =>
              _addN({ user_id: uid, type: 'info', title: `🗄 Surveillance archivée — ${_codeOaci}`, message: `La surveillance ${_typeLabel} de ${_codeOaci} a été archivée.`, canal: 'in_app' })
            )
            break
        }
        get().incrementerVersion()
      },
      deleteSurveillance: async (id: string) => {
        const state = get()
        const surveillance = state.surveillances.find(s => s.id === id)
        if (!surveillance) return

        const planningsSnapshot = state.plannings
        const surveillancesSnapshot = state.surveillances

        // Mettre à jour le planning associé si existant
        if (surveillance.planning_id) {
          const planning = state.plannings.find(p => p.id === surveillance.planning_id)
          if (planning) {
            set((s) => ({
              plannings: s.plannings.map(p =>
                p.id === surveillance.planning_id
                  ? { ...p, surveillance_id: undefined, statut: 'planifiee' as const, updated_at: new Date().toISOString() }
                  : p
              )
            }))
          }
        }

        set((state) => ({ surveillances: state.surveillances.filter(s => s.id !== id) }))

        const result = await datastore.deleteSurveillance(id)
        if (result.error) {
          console.error('Erreur delete surveillance Supabase, rollback:', result.error)
          toast('error', 'Échec de la suppression', 'La surveillance n\'a pas pu être supprimée')
          set({ surveillances: surveillancesSnapshot, plannings: planningsSnapshot })
          return
        }
        const equipeIds = surveillance.equipe_ids || []
        equipeIds.forEach(userId => {
          get().addNotification({
            user_id: userId,
            type: 'info',
            message: `La surveillance du ${new Date(surveillance.date_debut).toLocaleDateString('fr-FR')} a été supprimée`,
            canal: 'in_app'
          })
        })

        // ── Rappels planning (surveillances programmées) ──
        const maintenant2 = new Date()
        const rappelsSurveillance = [
          { jours: 30, cle: 'j30' as const, label: 'J-30' },
          { jours: 15, cle: 'j15' as const, label: 'J-15' },
          { jours: 7, cle: 'j7' as const, label: 'J-7' },
        ]
        state.plannings?.filter(p => p.statut === 'planifiee' && !p.deleted_at).forEach(planning => {
          const dateDebut = new Date(planning.date_debut)
          const joursAvant = Math.ceil((dateDebut.getTime() - maintenant2.getTime()) / (1000 * 60 * 60 * 24))
          if (joursAvant < 0) return

          rappelsSurveillance.forEach(({ jours, cle, label }) => {
            if (joursAvant === jours) {
              const dejaEnvoye = planning.rappels_envoyes?.[cle]
              if (!dejaEnvoye) {
                // Mettre à jour le flag rappels_envoyes
                const updated = { ...planning.rappels_envoyes, [cle]: true }
                get().updatePlanning(planning.id, { rappels_envoyes: updated } as any)

                const aerodrome = state.aerodromes.find(a => a.id === planning.aerodrome_id)
                const codeOaci = aerodrome?.code_oaci || planning.aerodrome_id
                const dateStr = new Date(planning.date_debut).toLocaleDateString('fr-FR')
                const typeLabel = (planning.type as string)?.replace(/_/g, ' ') || 'surveillance'
                const domaines = (planning.portee || []).slice(0, 3).join(', ')

                // Notifier les inspecteurs de l'équipe
                const equipeIds = planning.equipe_ids || []
                equipeIds.forEach(uid => {
                  get().addNotification({
                    user_id: uid,
                    type: jours <= 7 ? 'danger' : jours <= 15 ? 'warning' : 'info',
                    title: `⏰ Surveillance ${label} — ${codeOaci}`,
                    message: `La surveillance ${typeLabel} de ${codeOaci} est prévue le ${dateStr} (dans ${jours} jours). Domaines : ${domaines || 'tous'}. Confirmez ou réajustez les dates si nécessaire.`,
                    canal: 'in_app',
                    link: `/planning`,
                  })
                })

                // Notifier le chef
                if (planning.chef_id && !equipeIds.includes(planning.chef_id)) {
                  get().addNotification({
                    user_id: planning.chef_id,
                    type: jours <= 7 ? 'danger' : jours <= 15 ? 'warning' : 'info',
                    title: `⏰ Surveillance ${label} — ${codeOaci}`,
                    message: `En tant que chef d'équipe, confirmez la surveillance ${typeLabel} du ${dateStr} (J-${jours}).`,
                    canal: 'in_app',
                    link: `/planning`,
                  })
                }

                // J-7 : notifier aussi les exploitants
                if (jours <= 7) {
                  const exploitants = state.utilisateurs?.filter(u =>
                    u.aerodrome_id === planning.aerodrome_id &&
                    ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
                  ) || []
                  exploitants.forEach(op => {
                    get().addNotification({
                      user_id: op.id,
                      type: 'warning',
                      title: `📋 Surveillance imminente — ${codeOaci}`,
                      message: `La surveillance ${typeLabel} aura lieu le ${dateStr}. Domaines : ${domaines || 'tous'}. Préparez vos documents et registres.`,
                      canal: 'in_app',
                      link: `/operatorDashboard`,
                    })
                  })
                }
              }
            }
          })
        })
      },
      
      getActiveSurveillances: () => {
        return get().surveillances.filter(s => !s.deleted_at)
      },
      
      // ============================================================
      // ECART SLICE
      // ============================================================
      ecarts: [],
      currentEcart: null,
      historiqueEcarts: {},
      
      setEcarts: (ecarts) => set({ ecarts }),
      setCurrentEcart: (ecart) => set({ currentEcart: ecart }),
      
      addEcart: async (ecart) => {
        const historiqueEntry: HistoriqueEcart = {
          id: crypto.randomUUID(),
          type: 'creation',
          date: new Date().toISOString(),
          acteur: get().user?.id || 'system',
          role_acteur: get().user?.role || 'system',
          description: `Création de l'écart ${ecart.reference}`
        }
        const result = await datastore.createEcart(ecart)
        if (result.error) {
          console.error('Erreur création écart Supabase:', result.error)
          throw new Error(result.error)
        }
        const savedEcart = result.data as Ecart
        set((state) => ({
          ecarts: [...state.ecarts, savedEcart],
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [savedEcart.id]: [historiqueEntry]
          }
        }))
      },
      updateEcart: async (id, data) => {
        const result = await datastore.updateEcart(id, data)
        if (result.error) {
          console.error('Erreur update écart Supabase:', result.error)
          return
        }
        set((state) => ({
          ecarts: state.ecarts.map((e) => e.id === id ? { ...e, ...data, ...result.data, updated_at: new Date().toISOString() } : e),
          currentEcart: state.currentEcart?.id === id ? { ...state.currentEcart, ...data, ...result.data } : state.currentEcart,
        }))
      },

      soumettrePAC: async (ecartId, pacData) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) return
        const now = new Date().toISOString()
        const nouvelleVersion = (ecart.pac?.version || 0) + 1
        const pacPayload = {
          ...pacData,
          soumis_le: now,
          version: nouvelleVersion
        }

        // Sync Supabase EN PREMIER — upsert car l'écart peut exister seulement en local
        // (créé par reparerEcartsManquants si createEcart avait échoué au moment de la transmission)
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: 'pac_soumis',
          pac: pacPayload,
          updated_at: now
        })
        if (syncResult.error) {
          console.error('[soumettrePAC] Échec sync Supabase:', syncResult.error)
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → mise à jour du store local
        set((state) => {
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, statut: 'pac_soumis', pac: pacPayload, updated_at: now }
              : e
          ) as Ecart[])
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'soumission_pac',
            date: now,
            acteur: pacData.soumis_par,
            role_acteur: 'focal_operator',
            description: `Soumission du PAC version ${nouvelleVersion}`,
            fichiers: pacData.fichiers
          }
          // DEBUG: vérifier l'état après mise à jour
          const ecartApres = updatedEcarts.find(e => e.id === ecartId)
          console.log('[soumettrePAC] Après set() — statut:', ecartApres?.statut, 'pac:', ecartApres?.pac ? 'PRÉSENT' : 'ABSENT')
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })

        const utilisateur = get().getUtilisateur(ecart.inspecteur_ref_id)
        get().addNotification({
          user_id: ecart.inspecteur_ref_id,
          type: 'info',
          title: 'Nouveau PAC soumis',
          message: `PAC soumis pour l'écart ${ecart.reference}`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
        if (utilisateur?.notifications_email) {
          await fetch('/api/notifications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: utilisateur.email,
              subject: `SGDA - Nouveau PAC soumis - ${ecart.reference}`,
              template: 'pac-soumis',
              data: {
                reference: ecart.reference,
                aerodrome: state.aerodromes.find(a => a.id === ecart.aerodrome_id)?.nom,
                lien: `/plans-actions/${ecartId}`
              }
            })
          })
        }
        if (utilisateur?.notifications_sms && utilisateur.telephone) {
          await fetch('/api/notifications/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: utilisateur.telephone,
              message: `SGDA: PAC soumis pour écart ${ecart.reference}. À évaluer.`
            })
          })
        }
      },

      evaluerPAC: async (ecartId, evaluation) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        const nouveauStatut = evaluation.decision === 'accepte' ? 'pac_accepte' : 'pac_refuse'
        const now = new Date().toISOString()
        const dateSoumission = new Date(ecart.pac?.soumis_le || ecart.created_at)
        const dateEvaluation = new Date(evaluation.evalue_le || now)
        const delaiTraitement = Math.ceil((dateEvaluation.getTime() - dateSoumission.getTime()) / (1000 * 60 * 60 * 24))
        const evaluationPac: any = {
          ...evaluation,
          note_globale: plansActionsUtils.calculerNoteGlobale(evaluation),
          delai_traitement: delaiTraitement
        }

        // Supabase EN PREMIER
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: nouveauStatut,
          evaluation_pac: evaluationPac,
          updated_at: now
        })
        if (syncResult.error) {
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → store local
        set((state) => {
          const updatedFields: any = { statut: nouveauStatut, evaluation_pac: evaluationPac, updated_at: now }
          if (evaluation.niveau_risque_reevalue) {
            updatedFields.niveau_risque = evaluation.niveau_risque_reevalue
            updatedFields.evaluation_niveau_risque = {
              note_globale: evaluation.note_globale,
              niveau_suggere: evaluation.niveau_risque_reevalue,
              evalue_par: evaluation.evalue_par,
              evalue_le: evaluation.evalue_le || now,
            }
          }
          if (evaluation.cellule_risque_oaci_reevaluee) {
            updatedFields.cellule_risque_oaci = evaluation.cellule_risque_oaci_reevaluee
          }
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, ...updatedFields }
              : e
          ) as Ecart[])
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'evaluation_pac',
            date: now,
            acteur: evaluation.evalue_par,
            role_acteur: 'inspector',
            description: `PAC ${evaluation.decision === 'accepte' ? 'accepté' : 'refusé'}`,
            details: {
              note_globale: evaluationPac.note_globale,
              commentaire_refus: evaluation.commentaire_refus
            }
          }
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })

        // Auto-créer une surveillance de suivi PAC si accepté
        if (evaluation.decision === 'accepte' && ecart.surveillance_id) {
          const surveillanceOriginale = get().surveillances.find(s => s.id === ecart.surveillance_id);
          if (surveillanceOriginale && !('surveillance_id' in surveillanceOriginale)) {
            const nowSuivi = new Date().toISOString();
            const delaiReg = new Date(ecart.delai_regularisation);
            const newSurveillance: Surveillance = {
              id: crypto.randomUUID(),
              aerodrome_id: ecart.aerodrome_id,
              planning_id: surveillanceOriginale.planning_id,
              type: 'mise_oeuvre_pac',
              portee: surveillanceOriginale.portee,
              equipe_ids: surveillanceOriginale.equipe_ids,
              chef_id: surveillanceOriginale.chef_id,
              date_debut: nowSuivi,
              date_fin: delaiReg.toISOString(),
              statut: 'planifiee',
              progression: 0,
              created_at: nowSuivi,
              updated_at: nowSuivi,
              created_by: get().user?.id || '',
              updated_by: get().user?.id || '',
            };
            set((state) => ({ surveillances: [...state.surveillances, newSurveillance] }));
            get().addNotification({
              user_id: surveillanceOriginale.chef_id,
              type: 'info',
              title: 'Surveillance de suivi PAC créée',
              message: `Suivi PAC automatique pour l'écart ${ecart.reference} — ${get().aerodromes.find((a: { id: string; code_oaci?: string }) => a.id === ecart.aerodrome_id)?.code_oaci || ''}`,
              link: `/surveillance/${newSurveillance.id}/checklist`,
              canal: 'in_app',
            });
          }
        }

        const soumisPar = ecart.pac?.soumis_par
        if (soumisPar) {
          const utilisateur = get().getUtilisateur(soumisPar)
          get().addNotification({
            user_id: soumisPar,
            type: evaluation.decision === 'accepte' ? 'success' : 'warning',
            title: `PAC ${evaluation.decision === 'accepte' ? 'accepté' : 'refusé'}`,
            message: `Votre PAC pour l'écart ${ecart.reference} a été ${evaluation.decision === 'accepte' ? 'accepté' : 'refusé'}${evaluation.decision === 'refuse' ? '. Veuillez le réviser et le soumettre à nouveau.' : ''}`,
            link: utilisateur?.role === 'focal_operator' || utilisateur?.role === 'dg_operator'
              ? `/portail-exploitant/ecarts`
              : `/plans-actions/${ecartId}`,
            canal: 'in_app'
          })
          if (utilisateur?.notifications_email) {
            await fetch('/api/notifications/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: utilisateur.email,
                subject: `SGDA - PAC ${evaluation.decision === 'accepte' ? 'accepté' : 'refusé'} - ${ecart.reference}`,
                template: evaluation.decision === 'accepte' ? 'pac-accepte' : 'pac-refuse',
                data: {
                  reference: ecart.reference,
                  commentaire: evaluation.commentaire_refus,
                  lien: utilisateur?.role === 'focal_operator' || utilisateur?.role === 'dg_operator'
                    ? `/portail-exploitant/ecarts`
                    : `/plans-actions/${ecartId}`
                }
              })
            })
          }
        }
        // Réévaluation du risque → recalculer le profil
        if (ecart.aerodrome_id) {
          get().recalculerProfilRisque(ecart.aerodrome_id)
        }
      },

      soumettrePreuves: async (ecartId, preuves) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        const now = new Date().toISOString()
        const preuvesPayload = { ...preuves, soumis_le: now }

        // Supabase EN PREMIER
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: 'preuves_soumises',
          preuves: preuvesPayload,
          updated_at: now
        })
        if (syncResult.error) {
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → store local
        set((state) => {
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, statut: 'preuves_soumises', preuves: preuvesPayload, updated_at: now }
              : e
          ) as Ecart[])
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: 'soumission_preuves',
            date: now,
            acteur: preuves.soumis_par,
            role_acteur: 'focal_operator',
            description: `Soumission des preuves de levée`,
            fichiers: preuves.fichiers.map(f => f.url)
          }
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })
        get().addNotification({
          user_id: ecart.inspecteur_ref_id,
          type: 'info',
          title: 'Preuves soumises',
          message: `Des preuves ont été soumises pour l'écart ${ecart.reference}`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
      },

      evaluerPreuves: async (ecartId, validation) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) throw new Error('Écart introuvable')
        const nouveauStatut = validation.decision === 'valide' ? 'cloture' : 'preuves_evaluees'
        const now = new Date().toISOString()

        // Supabase EN PREMIER
        const syncResult = await datastore.upsertEcart({
          ...ecart,
          statut: nouveauStatut,
          validation_preuves: validation,
          cloture_le: validation.decision === 'valide' ? now : undefined,
          updated_at: now
        })
        if (syncResult.error) {
          throw new Error(`Erreur de synchronisation Supabase: ${syncResult.error}`)
        }

        // Supabase OK → store local
        set((state) => {
          const updatedFields: any = {
            statut: nouveauStatut,
            validation_preuves: validation,
            cloture_le: validation.decision === 'valide' ? now : undefined,
            updated_at: now
          }
          if (validation.niveau_risque_reevalue) {
            updatedFields.niveau_risque = validation.niveau_risque_reevalue
          }
          if (validation.cellule_risque_oaci_reevaluee) {
            updatedFields.cellule_risque_oaci = validation.cellule_risque_oaci_reevaluee
          }
          const updatedEcarts = (state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, ...updatedFields }
              : e
          ) as Ecart[])
          const descriptionMap = {
            valide: 'Écart clôturé - preuves validées',
            reserve: 'Preuves acceptées avec réserves - corrections demandées',
            refuse: 'Preuves refusées - demande de complément',
          }
          const historiqueEntry: HistoriqueEcart = {
            id: crypto.randomUUID(),
            type: validation.decision === 'valide' ? 'cloture' : 'validation_preuves',
            date: now,
            acteur: validation.valide_par,
            role_acteur: 'inspector',
            description: descriptionMap[validation.decision],
            details: {
              commentaire: validation.commentaire,
              notes_criteres: validation.notes_criteres,
              note_globale: validation.note_globale,
              verification_ia: validation.verification_ia,
              reserves: validation.reserves,
            }
          }
          return {
            ecarts: updatedEcarts,
            historiqueEcarts: {
              ...state.historiqueEcarts,
              [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
            }
          }
        })
        if (validation.decision === 'valide') {
          const soumisPar = ecart.preuves?.soumis_par
          if (soumisPar) {
            get().addNotification({
              user_id: soumisPar,
              type: 'success',
              title: 'Écart clôturé',
              message: `L'écart ${ecart.reference} a été clôturé avec succès`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }
          setTimeout(() => get().recalculerProfilRisque(ecart.aerodrome_id), 100)
        } else if (validation.decision === 'reserve') {
          const soumisPar = ecart.preuves?.soumis_par
          if (soumisPar) {
            get().addNotification({
              user_id: soumisPar,
              type: 'warning',
              title: 'Preuves acceptées avec réserves',
              message: `Les preuves pour l'écart ${ecart.reference} sont acceptées avec réserves. Corrections requises: ${validation.commentaire}`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }
        } else {
          const soumisPar = ecart.preuves?.soumis_par
          if (soumisPar) {
            get().addNotification({
              user_id: soumisPar,
              type: 'warning',
              title: 'Preuves refusées',
              message: `Les preuves pour l'écart ${ecart.reference} ont été refusées: ${validation.commentaire}`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }
        }
        // Réévaluation du risque → recalculer le profil pour evaluerPreuves
        if (validation.niveau_risque_reevalue && ecart.aerodrome_id) {
          get().recalculerProfilRisque(ecart.aerodrome_id)
        }
      },

      verifierRappelsAutomatiques: () => {
        const state = get()
        const maintenant = new Date()
        state.ecarts.forEach(ecart => {
          if (ecart.statut === 'cloture') return
          const delaiPAC = new Date(ecart.delai_pac)
          const delaiReg = new Date(ecart.delai_regularisation)
          const joursAvantPAC = Math.ceil((delaiPAC.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
          const joursAvantReg = Math.ceil((delaiReg.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
          if (joursAvantPAC < 0 || joursAvantReg < 0) {
            if (ecart.statut !== 'en_retard') {
              get().marquerEcartEnRetard(ecart.id)
            }
          }
          const rappels = [
            { jours: 7, type: 'J-7' },
            { jours: 3, type: 'J-3' },
            { jours: 1, type: 'J-1' }
          ]
          rappels.forEach(({ jours, type }) => {
            if (joursAvantPAC === jours || joursAvantReg === jours) {
              const dejaEnvoye = ecart.rappels_envoyes?.[`j${jours}` as keyof typeof ecart.rappels_envoyes]
              if (!dejaEnvoye) {
                get().envoyerRappelEcart(ecart.id, type)
              }
            }
          })
        })
      },

      marquerEcartEnRetard: (ecartId) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) return
        set((state) => ({
          ecarts: state.ecarts.map(e =>
            e.id === ecartId
              ? { ...e, statut: 'en_retard', updated_at: new Date().toISOString() }
              : e
          )
        }))
        const historiqueEntry: HistoriqueEcart = {
          id: crypto.randomUUID(),
          type: 'retard',
          date: new Date().toISOString(),
          acteur: 'system',
          role_acteur: 'system',
          description: `Écart en retard - délai dépassé`
        }
        set((state) => ({
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
          }
        }))
        const utilisateur = get().getUtilisateur(ecart.inspecteur_ref_id)
        get().addNotification({
          user_id: ecart.inspecteur_ref_id,
          type: 'danger',
          title: 'Écart en retard',
          message: `L'écart ${ecart.reference} a dépassé son délai`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
        if (utilisateur?.notifications_sms && utilisateur.telephone) {
          fetch('/api/notifications/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: utilisateur.telephone,
              message: `URGENT: Écart ${ecart.reference} en retard. Action requise.`
            })
          })
          .catch(error => console.error('[Notification] Erreur:', error))
        }
        if (ecart.niveau_risque === 'critique') {
          const dg = state.utilisateurs.find(u => u.role === 'dg_anacim')
          if (dg) {
            get().addNotification({
              user_id: dg.id,
              type: 'danger',
              title: 'Écart critique en retard',
              message: `Écart critique ${ecart.reference} en retard - action immédiate requise`,
              link: `/plans-actions/${ecartId}`,
              canal: 'in_app'
            })
          }
        }
      },

      envoyerRappelEcart: (ecartId, typeRappel) => {
        const state = get()
        const ecart = state.ecarts.find(e => e.id === ecartId)
        if (!ecart) return
        set((state) => ({
          ecarts: state.ecarts.map(e =>
            e.id === ecartId
              ? {
                  ...e,
                  rappels_envoyes: {
                    ...e.rappels_envoyes,
                    [`j${typeRappel.replace('J-', '')}`]: true
                  }
                }
              : e
          )
        }))
        const historiqueEntry: HistoriqueEcart = {
          id: crypto.randomUUID(),
          type: 'rappel',
          date: new Date().toISOString(),
          acteur: 'system',
          role_acteur: 'system',
          description: `Rappel automatique ${typeRappel} envoyé`
        }
        set((state) => ({
          historiqueEcarts: {
            ...state.historiqueEcarts,
            [ecartId]: [...(state.historiqueEcarts[ecartId] || []), historiqueEntry]
          }
        }))
        get().addNotification({
          user_id: ecart.inspecteur_ref_id,
          type: 'warning',
          title: `Rappel ${typeRappel}`,
          message: `Le délai pour l'écart ${ecart.reference} approche`,
          link: `/plans-actions/${ecartId}`,
          canal: 'in_app'
        })
      },

      getDelaiRestant: (ecart) => {
        const maintenant = new Date()
        const delai = ecart.statut === 'ouvert' || ecart.statut === 'pac_attendu'
          ? new Date(ecart.delai_pac)
          : new Date(ecart.delai_regularisation)
        const joursRestants = Math.ceil((delai.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
        let couleur: 'vert' | 'orange' | 'rouge' = 'vert'
        if (joursRestants < 0) couleur = 'rouge'
        else if (joursRestants < 7) couleur = 'rouge'
        else if (joursRestants < 15) couleur = 'orange'
        return { jours: joursRestants, couleur, depasse: joursRestants < 0 }
      },

      getHistoriqueEcart: (ecartId) => {
        return get().historiqueEcarts?.[ecartId] || []
      },

      getStatistiquesPAC: (aerodromeId) => {
        return plansActionsUtils.getStatistiquesPAC(get().ecarts, aerodromeId)
      },

      getEcartsByType: (aerodromeId, typeSource) => {
        return get().ecarts.filter(e => {
          if (aerodromeId && e.aerodrome_id !== aerodromeId) return false
          if (typeSource === 'surveillance' && !e.surveillance_id) return false
          if (typeSource === 'evenement' && !e.evenement_id) return false
          return true
        })
      },


// RiskEngine Slice
decisionChecklist: null,
setDecisionChecklist: (decision) => set({ decisionChecklist: decision }),
determineChecklistType: async (profil, ecarts, typePlanning) => {
  const urgents = riskEngine.detectUrgentEcards(ecarts, profil);
  const degradations = riskEngine.detectDomainDegradations(profil);
  const decision = riskEngine.determineChecklistType(profil, urgents, degradations, typePlanning);
  set({ decisionChecklist: decision });
  return decision;
},
detectDomainDegradations: (profilActuel, profilPrecedent) => {
  return riskEngine.detectDomainDegradations(profilActuel, profilPrecedent);
},
detectUrgentEcarts: (ecarts, profil) => {
  return riskEngine.detectUrgentEcards(ecarts, profil);
},
needsFullDomainAudit: (profil, degradations, nbEcartsCritiques) => {
  return riskEngine.needsFullDomainAudit(profil, degradations, nbEcartsCritiques);
},
calculateGlobalPriority: (profil) => {
  return riskEngine.calculateGlobalPriority(profil);
},
calculateRecommendedDelay: (profil, type) => {
  return riskEngine.calculateRecommendedDelay(profil, type as 'programmee' | 'suivi_ecarts' | 'mise_oeuvre_pac' | 'audit_complet');
},

// ChecklistMemory Slice
checklistMemoryRecords: [],
setChecklistMemoryRecords: (records) => set({ checklistMemoryRecords: records }),
upsertItemHistory: (aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item, surveillance_id) => {
  const record = checklistMemory.upsertItemHistory(
    aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine,
    { id: item.id, numero: item.numero, point_verification: item.point_verification, resultat: item.resultat as ResultatChecklist | undefined, observation: item.observation, fichiers: item.fichiers },
    surveillance_id
  );
  set((state) => ({
    checklistMemoryRecords: state.checklistMemoryRecords.filter(r => r.id !== record.id).concat([record])
  }));
},
getPredictionForItem: (aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item, profil) => {
  return checklistMemory.getPredictionForItem(
    aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine,
    { id: item.id, numero: item.numero, point_verification: item.point_verification },
    profil
  );
},
recordCorrection: (aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item_id, prediction, correction, commentaire) => {
  checklistMemory.recordCorrection(
    aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine,
    item_id, prediction as ResultatChecklist, correction as ResultatChecklist, commentaire
  );
  // Mettre à jour le store si nécessaire
  const record = get().checklistMemoryRecords.find(r => r.item_id === item_id);
  if (record) {
    set((state) => ({
      checklistMemoryRecords: state.checklistMemoryRecords.map(r =>
        r.item_id === item_id ? { ...r, feedback_correction: correction as ResultatChecklist, dernier_feedback: new Date().toISOString() } : r
      )
    }));
  }
},
getProblematicItems: (aerodrome_id, seuilErreur = 20) => {
  return checklistMemory.getProblematicItems(aerodrome_id, seuilErreur);
},
getLearningStats: () => {
  return checklistMemory.getLearningStats();
},
  validateBatchItems: (items: { id: string; prediction: ResultatChecklist; confiance: number }[], acceptAllSA = true) => {
  return checklistMemory.validateBatch(items, acceptAllSA);
},
importChecklistMemoryRecords: (items) => {
  const records: ChecklistMemoryRecord[] = items.map(item => {
    const resultat = item.resultat === 'NA' ? 'NA' : item.resultat === 'NS' ? 'NS' : item.resultat === 'SA' ? 'SA' : undefined;
    const key = `anacim_legacy_periodique_${item.domaine}__${item.numero}`;
    return {
      id: key,
      aerodrome_id: 'anacim_legacy',
      type_inspection: 'periodique',
      domaine: item.domaine,
      sous_domaine: '',
      sous_sous_domaine: '',
      item_id: item.numero,
      item_numero: item.numero,
      item_description: JSON.stringify({
        pv: item.point_verification,
        ref: item.reference_reglementaire,
        dir: item.directive_preuve,
      }),
      historique_resultats: resultat ? [{
        date: new Date().toISOString(),
        resultat,
        surveillance_id: 'anacim_legacy',
      }] : [],
      taux_conformite: resultat === 'SA' ? 100 : resultat === 'NS' ? 0 : 50,
      nb_occurrences: resultat ? 1 : 0,
      dernier_resultat: resultat,
      confiance: 95,
      dernier_feedback: new Date().toISOString(),
      alerte_ecart_recurrent: false,
    };
  });
  set((state) => {
    const existing = state.checklistMemoryRecords.filter(r => r.aerodrome_id !== 'anacim_legacy');
    return { checklistMemoryRecords: [...existing, ...records] };
  });
},

getSuggestionsWithAi: async (aerodromeId, type_inspection) => {
  const { getSuggestionsDetaillees } = await import('@/lib/checklistMemory');
  const suggestions = getSuggestionsDetaillees(aerodromeId, type_inspection);
  return suggestions;
},

// LearningEngine Slice
learningFeedbacks: [],
recalibrationAlerts: [],
currentModel: null,
recordLearningFeedback: (aerodrome_id, domaine, sous_domaine, item_id, prediction, confiance_avant, correction, commentaire) => {
  const feedback = learningEngine.recordLearningFeedback(
    aerodrome_id, domaine, sous_domaine, item_id, prediction as ResultatChecklist, confiance_avant, correction as ResultatChecklist, commentaire
  );
  set((state) => ({
    learningFeedbacks: [feedback, ...state.learningFeedbacks]
  }));
  return feedback;
},
checkForAlerts: () => {
  const alertes = learningEngine.checkForAlerts();
  set((state) => ({
    recalibrationAlerts: [...state.recalibrationAlerts, ...alertes.filter(a => !state.recalibrationAlerts.some(existing => existing.id === a.id))]
  }));
  return alertes;
},
getPendingAlerts: () => {
  return get().recalibrationAlerts.filter(a => !a.traitee);
},
acknowledgeAlert: (alertId, traiteePar) => {
  learningEngine.acknowledgeAlert(alertId, traiteePar);
  set((state) => ({
    recalibrationAlerts: state.recalibrationAlerts.map(a =>
      a.id === alertId ? { ...a, traitee: true, traitee_par: traiteePar, traitee_le: new Date().toISOString() } : a
    )
  }));
},
calculatePerformance: () => {
  return learningEngine.calculatePerformance();
},
recalibrateModel: (declencheur = 'auto', initiePar = 'system') => {
  const model = learningEngine.recalibrateModel(declencheur, initiePar);
  set({ currentModel: model });
  return model;
},
getCurrentModel: () => {
  return get().currentModel;
},
getDetailedLearningStats: () => {
  return learningEngine.getDetailedLearningStats();
},
exportLearningData: () => {
  return learningEngine.exportLearningData();
},
importLearningData: (jsonData) => {
  learningEngine.importLearningData(jsonData);
  // Recharger les données dans le store
  const feedbacks = learningEngine.getAllFeedbacks();
  const alerts = learningEngine.getPendingAlerts();
  const model = learningEngine.getCurrentModel();
  set({
    learningFeedbacks: feedbacks,
    recalibrationAlerts: alerts,
    currentModel: model,
  });
},
resetLearningData: () => {
  learningEngine.resetLearningData();
  set({
    learningFeedbacks: [],
    recalibrationAlerts: [],
    currentModel: null,
  });
},

     // Dans le create pour les dossiers
archiverDossierAutomatique: (dossierId) =>
  set((state) => ({
    dossiers: state.dossiers.map((d) =>
      d.id === dossierId && d.statut === 'termine'
        ? { ...d, statut: 'archive', archived_at: new Date().toISOString() }
        : d
    ),
  })),

restaurerDossier: (dossierId) =>
  set((state) => ({
    dossiers: state.dossiers.map((d) =>
      d.id === dossierId && d.statut === 'archive'
        ? { ...d, statut: 'termine', archived_at: undefined }
        : d
    ),
  })),

      // ============================================================
      // IMPLÉMENTATION DES SLICES DANS LE STORE surveillance
      // ============================================================

      // Delegation Slice
delegations: [],
setDelegations: (delegations) => set({ delegations }),
addDelegation: (delegation) => {
  const newDelegation: Delegation = {
    id: crypto.randomUUID(),
    ...delegation,
  };
  set((state) => ({
    delegations: [...state.delegations, newDelegation]
  }));
},
updateDelegation: (id, data) => set((state) => ({
  delegations: state.delegations.map(d => d.id === id ? { ...d, ...data } : d)
})),
deleteDelegation: (id) => set((state) => ({
  delegations: state.delegations.filter(d => d.id !== id)
})),
getDelegationsBySurveillance: (surveillanceId) => {
  return get().delegations.filter(d => d.surveillance_id === surveillanceId);
},
getDelegationsByInspecteur: (inspecteurId) => {
  return get().delegations.filter(d => d.assigne_a === inspecteurId);
},
getDelegationsByDomaine: (surveillanceId, domaine) => {
  return get().delegations.find(d => d.surveillance_id === surveillanceId && d.domaine === domaine);
},

// Alerte Slice
alertesSecurite: [],
setAlertesSecurite: (alertes) => set({ alertesSecurite: alertes }),
addAlerteSecurite: (alerte) => {
  const newAlerte: AlerteSecuriteFull = {
    id: crypto.randomUUID(),
    ...alerte,
  };
  set((state) => ({
    alertesSecurite: [...state.alertesSecurite, newAlerte]
  }));
},
updateAlerteSecurite: (id, data) => set((state) => ({
  alertesSecurite: state.alertesSecurite.map(a => a.id === id ? { ...a, ...data } : a)
})),
deleteAlerteSecurite: (id) => set((state) => ({
  alertesSecurite: state.alertesSecurite.filter(a => a.id !== id)
})),
getAlertesBySurveillance: (surveillanceId) => {
  return get().alertesSecurite.filter(a => a.surveillance_id === surveillanceId);
},
getAlertesActivesBySurveillance: (surveillanceId) => {
  return get().alertesSecurite.filter(a => a.surveillance_id === surveillanceId && a.statut === 'active');
},

// Presence Slice
fichesPresence: [],
setFichesPresence: (fiches) => set({ fichesPresence: fiches }),
addFichePresence: (fiche) => {
  const newFiche: PresenceEntry = {
    id: crypto.randomUUID(),
    ...fiche,
  };
  set((state) => ({
    fichesPresence: [...state.fichesPresence, newFiche]
  }));
},
updateFichePresence: (id, data) => set((state) => ({
  fichesPresence: state.fichesPresence.map(f => f.id === id ? { ...f, ...data } : f)
})),
deleteFichePresence: (id) => set((state) => ({
  fichesPresence: state.fichesPresence.filter(f => f.id !== id)
})),
getFichesBySurveillance: (surveillanceId) => {
  return get().fichesPresence.filter(f => f.surveillance_id === surveillanceId);
},
getFichesSigneesBySurveillance: (surveillanceId) => {
  return get().fichesPresence.filter(f => f.surveillance_id === surveillanceId && f.signature_url);
},

// RiskIndexFeedback Slice
riskIndexFeedbacks: [],
setRiskIndexFeedbacks: (feedbacks) => set({ riskIndexFeedbacks: feedbacks }),
addRiskIndexFeedback: (feedback) => {
  const newFeedback: RiskIndexFeedback = {
    id: crypto.randomUUID(),
    ...feedback,
  };
  set((state) => ({
    riskIndexFeedbacks: [...state.riskIndexFeedbacks, newFeedback]
  }));
},
getFeedbacksByAerodrome: (aerodromeId) => {
  return get().riskIndexFeedbacks.filter(f => f.aerodrome_id === aerodromeId);
},
getRiskIndexLearningStats: () => {
  const feedbacks = get().riskIndexFeedbacks;
  const uniqueModels = new Set(feedbacks.map(f => `${f.contexte.score_global}_${f.contexte.c4}`));
  return {
    totalFeedbacks: feedbacks.length,
    modelVersion: 1,
    lastCalibrated: new Date().toISOString(),
    adjustmentsCount: uniqueModels.size,
  };
},

// SuggestionFeedback Slice
suggestionFeedbacks: [],
setSuggestionFeedbacks: (feedbacks) => set({ suggestionFeedbacks: feedbacks }),
submitSuggestionFeedback: (feedback) => {
  const newFeedback: SuggestionFeedback = {
    id: crypto.randomUUID(),
    date_feedback: new Date().toISOString(),
    ...feedback,
  };
  set((state) => ({
    suggestionFeedbacks: [...state.suggestionFeedbacks, newFeedback]
  }));
},
getSuggestionFeedbacksByAerodrome: (aerodromeId) => {
  return get().suggestionFeedbacks.filter(f => f.aerodrome_id === aerodromeId);
},
getSuggestionAccuracy: (aerodromeId) => {
  const feedbacks = aerodromeId
    ? get().suggestionFeedbacks.filter(f => f.aerodrome_id === aerodromeId)
    : get().suggestionFeedbacks;
  const pertinents = feedbacks.filter(f => f.etait_pertinent).length;
  return {
    total: feedbacks.length,
    pertinents,
    rate: feedbacks.length > 0 ? pertinents / feedbacks.length : 1,
  };
},
getAdjustedThreshold: (aerodromeId, baseThreshold, suggestionType) => {
  const feedbacks = get().suggestionFeedbacks.filter(
    f => f.aerodrome_id === aerodromeId && f.mission_type_suggeree === suggestionType
  );
  if (feedbacks.length < 5) return baseThreshold;
  const negativeRate = feedbacks.filter(f => !f.etait_pertinent).length / feedbacks.length;
  if (negativeRate > 0.8) return baseThreshold * 0.75;
  if (negativeRate > 0.6) return baseThreshold * 0.85;
  if (negativeRate < 0.2) return baseThreshold * 1.1;
  return baseThreshold;
},


      // ============================================================
      // PROFIL RISQUE SLICE (ENRICHIE AVEC MODÈLES AVANCÉS)
      // ============================================================
      profilsRisque: {},
      setProfilRisque: async (aerodromeId, profil) => {
  // 1. Mettre à jour le store local
  set((state) => ({
    profilsRisque: { ...state.profilsRisque, [aerodromeId]: profil },
  }));
  
  // 2. Persister dans Supabase via datastore
  try {
    await datastore.upsertProfilRisque(profil)
  } catch (error) {
    console.error('[Store] Erreur sauvegarde profil:', error)
  }
},
      getProfilRisque: (aerodromeId) => get().profilsRisque?.[aerodromeId] || null,
      
      recalculerProfilRisque: async (aerodromeId) => {
        const { ecarts, surveillances, aerodromes, evenements, reponsesEnquetes, historiqueScores, addScoreHistoryPoint } = get()
        const ecartsAerodrome = ecarts.filter(e => e.aerodrome_id === aerodromeId)
        const surveillancesAerodrome = surveillances.filter(s => s.aerodrome_id === aerodromeId)
        const evenementsAerodrome = (evenements || []).filter((e: EvenementSecurite) => e.aerodrome_id === aerodromeId)
        const existingHistory = historiqueScores[aerodromeId] || []
        const lastScore = existingHistory.length > 0 ? existingHistory[existingHistory.length - 1].score : null
        const aerodrome = aerodromes.find(a => a.id === aerodromeId)
        const reponsesEnquetesAerodrome = (reponsesEnquetes || []).filter((r: ReponseEnquete) => r.aerodrome_id === aerodromeId)

        // C1 : si pas de donnée SGS, défaut bas (10) sauf si non_applicable (50)
        const maturiteSGS = aerodrome?.maturite_sgs ?? (aerodrome?.statut_sgs === 'non_applicable' ? 50 : 10)
        const scoreEnquetes = reponsesEnquetesAerodrome.length > 0
          ? reponsesEnquetesAerodrome.reduce((sum: number, r: ReponseEnquete) => sum + (r.score_c1 || 0), 0) / reponsesEnquetesAerodrome.length / 20
          : undefined
        const c1 = risqueUtils.calculateC1(maturiteSGS, scoreEnquetes)

        // C2 : dégradée par l'âge de l'aérodrome si pas d'écarts
        let c2 = risqueUtils.calculateC2FromEcarts(ecartsAerodrome)
        const ecartsActifs = ecartsAerodrome.filter(e => e.statut !== 'cloture')
        if (ecartsActifs.length === 0 && aerodrome?.created_at) {
          const ageJours = (Date.now() - new Date(aerodrome.created_at).getTime()) / 86400000
          if (ageJours > 365) c2 = Math.min(c2, 70)
          if (ageJours > 730) c2 = Math.min(c2, 55)
        }

        // C3 : toutes les surveillances terminées, pas seulement checklist_signee
        const surveillancesAvecScore = surveillancesAerodrome.filter(s =>
          s.score_global !== undefined && s.score_global !== null &&
          ['checklist_signee', 'transmise', 'archivee'].includes(s.statut)
        )
        const c3 = surveillancesAvecScore.length > 0
          ? risqueUtils.calculateC3(surveillancesAvecScore.map(s => ({
              score: s.score_global!,
              date: s.date_debut
            })))
          : aerodrome ? Math.round(
              // Heuristique multi-domaines comme dans initialProfile
              (aerodrome.type === 'international' ? 55 : aerodrome.type === 'national' ? 70 : 80) * 0.25 +
              ((aerodrome.maturite_sgs ?? 10) * 0.25) +
              ((aerodrome.type_entite === 'helistation' || aerodrome.type_entite === 'mixte' ? 55 : 70) * 0.15) +
              (80 - Math.max(0, (parseInt(aerodrome.categorie_sslia, 10) || 1) - 3) * 2) * 0.15 +
              ((aerodrome.region === 'Ziguinchor' || aerodrome.region === 'Kolda' || aerodrome.region === 'Tambacounda') ? 50 : 75) * 0.10
            ) : 30

        // Ajustement C3 selon les exemptions actives
        const exemptionsActives = get().getExemptionsActives(aerodromeId)
        let c3Final = c3
        if (exemptionsActives.length > 0) {
          const { calculateC3WithExemptions } = await import('./risque')
          const result = calculateC3WithExemptions(c3, exemptionsActives.map(e => ({
            id: e.id,
            domaines_concerne: e.domaines_concerne || [],
            mesures: e.mesures.map(m => ({
              statut: m.statut,
              efficacite_validee: m.efficacite_validee,
            })),
          })))
          c3Final = result.c3_ajuste
          const now = new Date().toISOString()
          exemptionsActives.forEach(ex => {
            get().updateExemption(ex.id, {
              dernier_recalcul_risque: now,
              dernier_score_c3_ajuste: result.c3_ajuste,
            })
          })
        }

        const c4 = risqueUtils.calculateC4FromEcarts(ecartsAerodrome)
        const c5 = risqueUtils.calculateC5(evenementsAerodrome.map((e: EvenementSecurite) => ({
          gravite: e.gravite,
          date: e.date || e.created_at,
        })))
        const scoreGlobal = risqueUtils.calculateGlobalScore({ c1, c2, c3: c3Final, c4, c5 })
        let niveau: 'faible' | 'moyen' | 'eleve' | 'critique' = 'faible'
        if (scoreGlobal >= 80) niveau = 'faible'
        else if (scoreGlobal >= 60) niveau = 'moyen'
        else if (scoreGlobal >= 30) niveau = 'eleve'
        else niveau = 'critique'
        let tendance: 'hausse' | 'baisse' | 'stable' = 'stable'
        if (lastScore !== null) {
          if (scoreGlobal > lastScore + 2) tendance = 'hausse'
          else if (scoreGlobal < lastScore - 2) tendance = 'baisse'
        }
        let prediction3m = scoreGlobal
        let prediction6m = scoreGlobal
        let ensembleConfidence = 30
        if (existingHistory.length >= 2) {
          const { predictRiskScore } = await import('./risque')
          const predictions = predictRiskScore(existingHistory.map(h => ({ date: h.date, score: h.score })))
          prediction3m = predictions.score3m
          prediction6m = predictions.score6m
          if (predictions.trend) tendance = predictions.trend
        }
        // Ensemble EWMA + régression si assez de données
        if (existingHistory.length >= 3) {
          const { predictWithEnsemble } = await import('./risque')
          const ensemble = predictWithEnsemble(existingHistory.map(h => ({ date: h.date, score: h.score })))
          prediction3m = Math.round((prediction3m + ensemble.score3m) / 2)
          prediction6m = Math.round((prediction6m + ensemble.score6m) / 2)
          ensembleConfidence = ensemble.confidence
        }
        // ── IA Ensemble (LSTM + BayesianDynamic + XGBoost + RF) ──
        // S'active automatiquement quand assez de données historiques
        // Fallback → régression actuelle si insuffisant
        if (existingHistory.length >= 6) {
          try {
            const { ensembleModel } = await import('./ia/models/ensemble')
            const iaEnsemble = await ensembleModel.predict(existingHistory, 1)
            if (iaEnsemble.metadata.nModels >= 2 && iaEnsemble.confidence > ensembleConfidence) {
              prediction3m = iaEnsemble.point
              prediction6m = iaEnsemble.point
              ensembleConfidence = iaEnsemble.confidence
            }
          } catch { /* IA ensemble indisponible — fallback régression */ }
        }
        // ── Phase 3 : Modèles avancés (HMM, Survival, EVT, NB, Copulas, TS) ──
        // Procrastiné après construction de nouveauProfil car Copulas en a besoin

        // Prédiction d'incidents et tendance événements
        const { computeIncidentPrediction, computeEventTrendAnalysis, computeBayesianPosterior } = await import('./risque')
        const evenementsAvecDate = evenementsAerodrome.map((e: EvenementSecurite) => ({
          gravite: e.gravite,
          date: e.date || e.created_at,
        }))
        const incidentPred = computeIncidentPrediction(evenementsAvecDate)
        const eventTrend = computeEventTrendAnalysis(evenementsAvecDate)

        // Scénarios (optimiste, réaliste, pessimiste, catastrophe)
        let scenarios: ProfilRisque['scenarios'] = []
        if (existingHistory.length >= 3) {
          try {
            const { generateAllScenarios } = await import('@/lib/risque/scenarios')
            const scores = existingHistory.map(h => h.score)
            const existingProfil = get().profilsRisque?.[aerodromeId]
            const hasBlackSwan = existingProfil?.proactive_alert?.niveau_urgence === 'critique'
            scenarios = generateAllScenarios(scores, 1, hasBlackSwan)
          } catch {}
        }

        // Mise à jour bayésienne : prior par défaut à 0.3
        let bayesianUpdate = await computeBayesianPosterior(get().profilsRisque?.[aerodromeId] || null, evenementsAerodrome)

        // Bayesian Dynamic — prior évolutif (remplace le bayésien statique si assez de données)
        if (existingHistory.length >= 5) {
          try {
            const { bayesianDynamicModel } = await import('./ia/models/bayesianDynamic')
            const priors = get().profilsRisque?.[aerodromeId]?.bayesian_prior ?? 0.3
            const { posterior } = bayesianDynamicModel.computePosterior(priors, [priors])
            const dynBlackSwan = bayesianDynamicModel.detectBlackSwan(priors, posterior)
            bayesianUpdate = {
              posteriorProbability: posterior,
              priorProbability: priors,
              estBlackSwan: dynBlackSwan || bayesianUpdate?.estBlackSwan || false,
            }
          } catch { /* bayesianDynamic indisponible */ }
        }

        // Bow-Tie — efficacité des barrières par domaine
        const DOMAINES = ['SGS', 'PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
        let bowtieMetrics: ProfilRisque['bowtie_metrics'] = []
        if (surveillancesAerodrome.length > 0 || ecartsAerodrome.length > 0) {
          try {
            const { assessBarrierEffectiveness } = await import('./risque')
            bowtieMetrics = DOMAINES.map(domaine => {
              const ecartsDom = ecartsAerodrome.filter((e: Ecart) => e.domaine === domaine)
              const surveillancesDom = surveillancesAerodrome.filter((s: any) => (s.portee || []).includes(domaine))
              const dernierScore = surveillancesDom.length > 0 ? surveillancesDom.reduce((max: number, s: any) => Math.max(max, s.score_global || 0), 0) : 70
              const effectiveness = assessBarrierEffectiveness(`${aerodromeId}_${domaine}`, {
                nsCount: 0,
                ecartsCount: ecartsDom.length,
                inspectionsPassed: surveillancesDom.some((s: any) => s.statut === 'realisee' || s.statut === 'rapport_signe'),
                lastAuditScore: dernierScore,
              })
              return { domaine, effectiveness, nsCount: 0, ecartsCount: ecartsDom.length }
            }).filter(b => b.ecartsCount > 0 || b.effectiveness < 80)
          } catch { /* Bow-tie indisponible */ }
        }

        const nouveauProfil: ProfilRisque = {
          aerodrome_id: aerodromeId,
          score_global: scoreGlobal,
          niveau,
          c1, c2, c3: c3Final, c4, c5,
          prediction_3m: prediction3m,
          prediction_6m: prediction6m,
          tendance,
          computed_at: new Date().toISOString(),
          historical_scores: existingHistory,
          incident_prediction_3m: incidentPred.probability3m,
          incident_prediction_6m: incidentPred.probability6m,
          incident_prediction_12m: incidentPred.probability12m,
          event_frequency: incidentPred.expectedEventsPerMonth,
          event_severity_trend: incidentPred.severityTrend,
          days_since_last_event: incidentPred.daysSinceLastIncident,
          event_trend_acceleration: eventTrend.recentAcceleration,
          bayesian_posterior: bayesianUpdate?.posteriorProbability,
          bayesian_prior: bayesianUpdate?.priorProbability,
          bayesian_black_swan: bayesianUpdate?.estBlackSwan,
          scenarios,
          bowtie_metrics: bowtieMetrics?.length ? bowtieMetrics : undefined,
          ensemble_confidence: ensembleConfidence,
          infrastructure: aerodrome ? {
            type_entite: aerodrome.type_entite,
            horaires: aerodrome.horaires,
            aides_visuelles: aerodrome.aides_visuelles,
            revetement: aerodrome.piste_principale?.revetement,
            type_approche: aerodrome.piste_principale?.type_approche,
            categorie_sslia: aerodrome.categorie_sslia,
            type: aerodrome.type,
          } : undefined,
        }
        // ── Phase 3 : computation et stockage modèles avancés ──
        if (existingHistory.length >= 3) {
          const scoresHist = existingHistory.map(h => h.score)
          try {
            const { modelCache } = await import('./risque/modelCache')
            const cached = modelCache.computeAll(aerodromeId, scoresHist, nouveauProfil)
            if (cached.hmm) nouveauProfil.hmm_state = {
              currentStateName: cached.hmm.currentStateName, isTransitioning: cached.hmm.isTransitioning,
              transitionRisk: cached.hmm.transitionRisk, daysToCritical: cached.hmm.daysToCritical,
            }
            if (cached.survival) nouveauProfil.survival_metrics = {
              hazard90d: cached.survival.hazard90days, hazard180d: cached.survival.hazard180days,
              medianDays: cached.survival.medianSurvivalDays || 999,
            }
            if (cached.evt) nouveauProfil.extreme_risk = {
              tailRisk: cached.evt.probabilityExtreme, isHeavyTailed: cached.evt.isHeavyTailed,
              maxExpected12m: cached.evt.maxExpected12m,
            }
            if (cached.nb) nouveauProfil.negbin_metrics = {
              isOverdispersed: cached.nb.isOverdispersed, dispersion: cached.nb.dispersion,
              mean: cached.nb.mean, variance: cached.nb.variance,
            }
            if (cached.copula) nouveauProfil.copula_metrics = {
              maxTailDependence: Math.max(...cached.copula.tailDependence.lower.flat()),
              worstCaseProbability: cached.copula.worstCaseScenario.probability,
              worstCaseDescription: cached.copula.worstCaseScenario.description,
            }
            if (cached.ts) nouveauProfil.ts_metrics = {
              recommendedAction: cached.ts.recommend(`${aerodromeId}_${new Date().getFullYear()}`).id,
              bestProbability: cached.ts.bestProbability,
            }
          } catch { /* Modèles avancés indisponibles */ }
        }
        // ── Fin Phase 3 ──
        const now = new Date().toISOString()
        addScoreHistoryPoint(aerodromeId, {
          date: now,
          score: scoreGlobal,
          c1, c2, c3: c3Final, c4, c5
        })
        set((state) => ({
          profilsRisque: { ...state.profilsRisque, [aerodromeId]: nouveauProfil }
        }))
        await get().computeFullRiskProfile(aerodromeId)
      },


     // Après la fonction getProfilRisque existante, ajouter :
getProfilRisqueWithAiInsights: async (aerodromeId) => {
  const state = get();
  const profil = state.profilsRisque[aerodromeId] || null;
  
  if (!profil) {
    return { profil: null, predictions: null, recommendations: [], confidence: 0 };
  }
  
  const historique = state.historiqueScores?.[aerodromeId] || [];
  const ecartsAerodrome = state.ecarts.filter(e => e.aerodrome_id === aerodromeId);
  
  // Importer dynamiquement l'agent IA
  const { riskAgent } = await import('@/lib/ia/agents/riskAgent');
  
  try {
    const analysis = await riskAgent.analyzeRisk({
      aerodromeId,
      includePredictions: true,
      includeSuggestions: true
    }, {});
    
    return {
      profil,
      predictions: analysis.predictions,
      recommendations: analysis.suggestions?.map(s => s.description) || [],
      confidence: analysis.confidence
    };
  } catch (error) {
    console.error('[Store] Erreur IA:', error);
    return { profil, predictions: null, recommendations: [], confidence: 50 };
  }
},

      // ============================================================
      // NOTIFICATION SLICE
      // ============================================================
      notifications: [],
      unreadCount: 0,
      
      setNotifications: (notifications) => set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read_at).length,
      }),
      
      addNotification: (notification) => {
        const newNotification: Notification = {
          id: crypto.randomUUID(),
          sent_at: new Date().toISOString(),
          ...notification
        }
        set((state) => ({
          notifications: [newNotification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }))
        // Persister dans Supabase (fire & forget)
        import('@/lib/datastore').then(({ sendNotification }) => {
          const { id, sent_at, ...payload } = newNotification
          sendNotification(payload)
        }).catch(() => {})
        // Email — throttle: max 1 email/30s par utilisateur
        if (notification.canal === 'email' || notification.canal === 'email_sms') {
          const now = Date.now()
          const lastSent = emailThrottle.get(notification.user_id) || 0
          if (now - lastSent < 30000) return // trop tôt, on ignore
          emailThrottle.set(notification.user_id, now)
          const utilisateur = get().getUtilisateur(notification.user_id)
          if (utilisateur?.email) {
            fetch('/api/notifications/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: utilisateur.email,
                subject: `SGDA - ${notification.title || 'Notification'}`,
                message: notification.message,
                link: notification.link
              })
            })
            .catch(() => {})
          }
        }
        // SMS
        if (notification.canal === 'sms' || notification.canal === 'email_sms') {
          const utilisateur = get().getUtilisateur(notification.user_id)
          if (utilisateur?.telephone) {
            fetch('/api/notifications/sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: utilisateur.telephone,
                message: `SGDA: ${notification.message}`
              })
            })
            .catch(error => console.error('[Notification] Erreur sms:', error))
          }
        }
      },

      envoyerNotificationMultiCanal: async (userId, notification, canaux) => {
        for (const canal of canaux) {
          get().addNotification({
            user_id: userId,
            ...notification,
            canal: canal as Notification['canal']
          })
        }
      },
      
      markAsRead: (id) => {
        set((state) => {
          const updated = state.notifications.map((n) =>
            n.id === id ? { ...n, read_at: new Date().toISOString() } : n
          )
          return { 
            notifications: updated, 
            unreadCount: updated.filter((n) => !n.read_at).length 
          }
        })
        import('@/lib/datastore').then(({ markNotificationRead }) => {
          markNotificationRead(id)
        }).catch(() => {})
      },
      
      markAllAsRead: () => {
        const unreadIds = get().notifications.filter((n) => !n.read_at).map((n) => n.id)
        set((state) => ({
          notifications: state.notifications.map((n) => ({
            ...n,
            read_at: n.read_at || new Date().toISOString(),
          })),
          unreadCount: 0,
        }))
        import('@/lib/datastore').then(({ markNotificationRead }) => {
          unreadIds.forEach((id) => markNotificationRead(id))
        }).catch(() => {})
      },

      // ============================================================
      // CERTIFICATION SLICE
      // ============================================================
      certifications: [],
      currentCertification: null,
      setCertifications: (certifications) => set({ certifications }),
      setCurrentCertification: (certification) => set({ currentCertification: certification }),
      addCertification: (certification) => {
        // Renouvellement : Phase 1 sautée (dossier déjà constitué)
        const phase = certification.type_certification === 'renouvellement' && certification.phase_active === 1
          ? 2 : certification.phase_active
        set((state) => ({
          certifications: [...state.certifications, { ...certification, phase_active: phase }],
        }))
      },
      updateCertification: (id, data) => {
        const oldCert = get().certifications.find(c => c.id === id)
        set((state) => ({
          certifications: state.certifications.map((c) => c.id === id ? { ...c, ...data } : c),
          currentCertification: state.currentCertification?.id === id
            ? { ...state.currentCertification, ...data }
            : state.currentCertification,
        }))
        // Recalculer le profil de risque quand la certification change de statut (surtout certifie)
        if (data.statut_global && data.statut_global !== oldCert?.statut_global && oldCert?.aerodrome_id) {
          get().recalculerProfilRisque(oldCert.aerodrome_id)
        }
      },
      deleteCertification: (id) => set((state) => ({
        certifications: state.certifications.filter((c) => c.id !== id),
        currentCertification: state.currentCertification?.id === id ? null : state.currentCertification,
      })),
      archiverCertification: (id) => {
        const cert = get().certifications.find(c => c.id === id);
        if (!cert) return;
        const now = new Date().toISOString();
        set((state) => ({
          certifications: state.certifications.map((c) =>
            c.id === id ? { ...c, statut_global: 'archive' as const, archived_at: now } : c
          ),
          currentCertification: state.currentCertification?.id === id ? null : state.currentCertification,
        }));
        const aerodrome = get().aerodromes.find(a => a.id === cert.aerodrome_id);
        const entry = registreUtils.toRegistreEntryFromCertification(cert, aerodrome);
        get().addRegistreEntry({
          id: crypto.randomUUID(),
          ...entry,
          timeline: [{ id: crypto.randomUUID(), etape: 'Archivage automatique', date: now, acteur: get().user?.prenom + ' ' + get().user?.nom || 'Système', acteur_role: 'systeme' }],
          created_at: now,
        });
      },
      restaurerCertification: (id) => set((state) => ({
        certifications: state.certifications.map((c) =>
          c.id === id ? { ...c, statut_global: 'en_cours' as const, archived_at: null } : c
        ),
      })),

      // ============================================================
      // HOMOLOGATION SLICE
      // ============================================================
      homologations: [],
      currentHomologation: null,
      setHomologations: (homologations) => set({ homologations }),
      setCurrentHomologation: (homologation) => set({ currentHomologation: homologation }),
      addHomologation: (homologation) => set((state) => ({
        homologations: [...state.homologations, homologation],
      })),
      updateHomologation: (id, data) => {
        const oldHomo = get().homologations.find(h => h.id === id)
        set((state) => ({
          homologations: state.homologations.map((h) => h.id === id ? { ...h, ...data } : h),
          currentHomologation: state.currentHomologation?.id === id
            ? { ...state.currentHomologation, ...data }
            : state.currentHomologation,
        }))
        if (data.statut_global && data.statut_global !== oldHomo?.statut_global && oldHomo?.aerodrome_id) {
          get().recalculerProfilRisque(oldHomo.aerodrome_id)
        }
      },
      deleteHomologation: (id) => set((state) => ({
        homologations: state.homologations.filter((h) => h.id !== id),
        currentHomologation: state.currentHomologation?.id === id ? null : state.currentHomologation,
      })),
      archiverHomologation: (id) => {
        const homo = get().homologations.find(h => h.id === id);
        if (!homo) return;
        const now = new Date().toISOString();
        set((state) => ({
          homologations: state.homologations.map((h) =>
            h.id === id ? { ...h, statut_global: 'archive' as const, archived_at: now } : h
          ),
          currentHomologation: state.currentHomologation?.id === id ? null : state.currentHomologation,
        }));
        const aerodrome = get().aerodromes.find(a => a.id === homo.aerodrome_id);
        const entry = registreUtils.toRegistreEntryFromHomologation(homo, aerodrome);
        get().addRegistreEntry({
          id: crypto.randomUUID(),
          ...entry,
          timeline: [{ id: crypto.randomUUID(), etape: 'Archivage automatique', date: now, acteur: get().user?.prenom + ' ' + get().user?.nom || 'Système', acteur_role: 'systeme' }],
          created_at: now,
        });
      },
      restaurerHomologation: (id) => set((state) => ({
        homologations: state.homologations.map((h) =>
          h.id === id ? { ...h, statut_global: 'en_cours' as const, archived_at: null } : h
        ),
      })),

      // ============================================================
      // PLANNING SLICE
      // ============================================================
      plannings: [],
      currentPlanning: null,
      propositionsN1: [],
      setPlannings: (plannings) => set({ plannings }),
      setCurrentPlanning: (planning) => set({ currentPlanning: planning }),
      setPropositionsN1: (proposals) => set({ propositionsN1: proposals }),
      addPlanning: async (planning) => {
        // Nettoyer les champs vides — assigner un chef par défaut si vide
        const cleanPlanning = { ...planning }
        if (!cleanPlanning.chef_id || cleanPlanning.chef_id === '00000000-0000-0000-0000-000000000000') {
          // 1) Inspecteur principal ou titulaire
          const inspecteurs = get().inspecteurs || []
          const chefDefaut = inspecteurs.find(i => i.type === 'inspecteur_principal' && i.statut === 'en_service' && !i.deleted_at)
            || inspecteurs.find(i => i.type === 'inspecteur_titulaire' && i.statut === 'en_service' && !i.deleted_at)
            || inspecteurs.find(i => !i.deleted_at)
          if (chefDefaut?.user_id) {
            cleanPlanning.chef_id = chefDefaut.user_id
          } else {
            // 2) Utilisateur actif ou admin
            const utilisateurs = get().utilisateurs || []
            const userDefaut = get().user
              || utilisateurs.find(u => u.role === 'admin' && u.statut === 'actif')
              || utilisateurs.find(u => u.statut === 'actif')
            cleanPlanning.chef_id = userDefaut?.id || crypto.randomUUID()
          }
        }
        const result = await datastore.createPlanning(cleanPlanning)
        if (result.error) {
          console.error('Erreur création planning Supabase:', result.error)
          throw new Error(result.error)
        }
        set((state) => ({ plannings: [...state.plannings, result.data as Planning] }))
      },
      updatePlanning: async (id, data) => {
        const oldPlanning = get().plannings.find(p => p.id === id)
        const result = await datastore.updatePlanning(id, data)
        if (result.error) {
          console.error('Erreur update planning Supabase:', result.error)
          return
        }
        set((state) => ({
          plannings: state.plannings.map((p) => p.id === id ? { ...p, ...data, ...result.data } : p),
          currentPlanning: state.currentPlanning?.id === id ? { ...state.currentPlanning, ...data, ...result.data } : state.currentPlanning,
        }))

        if (!oldPlanning) return
        const _aerodrome = get().aerodromes.find(a => a.id === oldPlanning.aerodrome_id)
        const _codeOaci = _aerodrome?.code_oaci ?? oldPlanning.aerodrome_id
        const _typeLabel = (oldPlanning.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
        const _addN = get().addNotification
        const _equipeIds: string[] = (data.equipe_ids ?? oldPlanning.equipe_ids) || []
        const _exploitants = get().utilisateurs.filter(u =>
          u.aerodrome_id === oldPlanning.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        const _notifyAll = (type: 'info' | 'success' | 'warning' | 'danger', title: string, message: string) => {
          ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
            _addN({ user_id: uid, type, title, message, canal: 'in_app' })
          )
        }

        // ── Confirmation par l'inspecteur → notifier les exploitants ──
        if (data.confirme_le && !oldPlanning?.confirme_le) {
          const dateConfirmee = data.date_confirmee || oldPlanning.date_debut
          const dateStr = new Date(dateConfirmee).toLocaleDateString('fr-FR')
          const motif = data.motif_report ? `\nMotif du report : ${data.motif_report}` : ''
          const user = get().user
          const confirmePar = user ? `${user.prenom} ${user.nom}` : 'ANACIM'
          _exploitants.forEach(op => {
            _addN({
              user_id: op.id,
              type: 'success',
              title: `✅ Surveillance confirmée — ${_codeOaci}`,
              message: `La surveillance ${_typeLabel} de ${_codeOaci} est confirmée pour le ${dateStr} par ${confirmePar}.${motif}\nPréparez vos documents et registres.`,
              canal: 'in_app',
            })
            // Email à l'exploitant
            if (op.notifications_email && op.email) {
              fetch('/api/notifications/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: op.email,
                  subject: `SGDA - Surveillance confirmée ${_codeOaci} - ${dateStr}`,
                  message: `Bonjour,\n\nLa surveillance ${_typeLabel} de votre aérodrome (${_codeOaci}) est confirmée pour le ${dateStr}.\nDomaines concernés : ${(oldPlanning.portee || []).join(', ') || 'tous'}.\n\nMerci de préparer les documents et registres nécessaires.\n\nCordialement,\nANACIM - SGDA`,
                }),
              }).catch(() => {})
            }
          })
        }

        // ── Statut change ──────────────────────────────────────────────
        if (data.statut && data.statut !== oldPlanning.statut) {
          switch (data.statut as string) {
            case 'annulee':
              _notifyAll('danger', `❌ Surveillance annulée — ${_codeOaci}`, `La surveillance ${_typeLabel} prévue pour ${_codeOaci} a été annulée.`)
              break
            case 'realisee':
              _notifyAll('success', `✅ Surveillance réalisée — ${_codeOaci}`, `La surveillance ${_typeLabel} de ${_codeOaci} est marquée comme réalisée.`)
              break
            case 'en_retard':
              _notifyAll('warning', `⏰ Surveillance en retard — ${_codeOaci}`, `La surveillance ${_typeLabel} prévue pour ${_codeOaci} accuse du retard.`)
              break
            case 'en_cours':
              _equipeIds.forEach(uid =>
                _addN({ user_id: uid, type: 'info', title: `🔍 Surveillance démarrée — ${_codeOaci}`, message: `La surveillance ${_typeLabel} de ${_codeOaci} est maintenant en cours.`, canal: 'in_app' })
              )
              break
          }
        }

        // ── Date changes ───────────────────────────────────────────────
        const _dateChanged =
          (data.date_debut && data.date_debut !== oldPlanning.date_debut) ||
          (data.date_fin   && data.date_fin   !== oldPlanning.date_fin)
        if (_dateChanged) {
          const _dateDebut = new Date(data.date_debut ?? oldPlanning.date_debut).toLocaleDateString('fr-FR')
          const _dateFin   = new Date(data.date_fin   ?? oldPlanning.date_fin).toLocaleDateString('fr-FR')
          _notifyAll('warning', `📅 Dates modifiées — ${_codeOaci}`, `La surveillance ${_typeLabel} de ${_codeOaci} a été reprogrammée du ${_dateDebut} au ${_dateFin}.`)
        }

        // ── Equipe changes ─────────────────────────────────────────────
        if (data.equipe_ids) {
          const _ancienne = new Set<string>(oldPlanning.equipe_ids || [])
          const _nouvelle = new Set<string>(data.equipe_ids)
          ;data.equipe_ids.filter((uid: string) => !_ancienne.has(uid)).forEach((uid: string) =>
            _addN({ user_id: uid, type: 'info', title: `📋 Nouvelle assignation — ${_codeOaci}`, message: `Vous avez été assigné à la surveillance ${_typeLabel} de ${_codeOaci}.`, canal: 'in_app' })
          )
          ;[..._ancienne].filter(uid => !_nouvelle.has(uid)).forEach(uid =>
            _addN({ user_id: uid, type: 'warning', title: `📋 Désassignation — ${_codeOaci}`, message: `Vous avez été retiré de la surveillance ${_typeLabel} de ${_codeOaci}.`, canal: 'in_app' })
          )
        }
      },
      deletePlanning: async (id) => {
        const _planning = get().plannings.find(p => p.id === id)
        const result = await datastore.deletePlanning(id)
        if (result.error) {
          console.error('Erreur delete planning Supabase:', result.error)
          return
        }
        set((state) => ({
          plannings: state.plannings.filter((p) => p.id !== id),
          currentPlanning: state.currentPlanning?.id === id ? null : state.currentPlanning,
        }))

        if (!_planning) return
        const _aerodrome = get().aerodromes.find(a => a.id === _planning.aerodrome_id)
        const _codeOaci = _aerodrome?.code_oaci ?? _planning.aerodrome_id
        const _typeLabel = (_planning.type as string)?.replace(/_/g, ' ') ?? 'surveillance'
        const _dateDebut = new Date(_planning.date_debut).toLocaleDateString('fr-FR')
        const _addN = get().addNotification
        const _equipeIds = _planning.equipe_ids || []
        const _exploitants = get().utilisateurs.filter(u =>
          u.aerodrome_id === _planning.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        ;[..._equipeIds, ..._exploitants.map(u => u.id)].forEach(uid =>
          _addN({
            user_id: uid,
            type: 'danger',
            title: `🗑 Planning supprimé — ${_codeOaci}`,
            message: `Le planning de surveillance ${_typeLabel} de ${_codeOaci} prévu le ${_dateDebut} a été supprimé.`,
            canal: 'in_app',
          })
        )
      },

      genererPlanningN1: (aerodromeId, annee) => {
        const state = get()
        const profil = state.profilsRisque?.[aerodromeId]
        const historique = state.surveillances
          .filter(s => s.aerodrome_id === aerodromeId && s.statut === 'archivee')
          .map(s => ({ type: s.type, date: s.date_debut, domaines: s.portee || [] }))
        const ecarts = (state.ecarts || []).filter(e => e.aerodrome_id === aerodromeId)
        const certs = (state.certifications || []).filter(c => c.aerodrome_id === aerodromeId)
        const homos = (state.homologations || []).filter(h => h.aerodrome_id === aerodromeId)
        const inspecteurs = (state.inspecteurs || []).filter(i => !i.deleted_at)
          .map(i => ({ id: i.id, prenom: i.prenom, nom: i.nom, competences: i.competences }))

        // Nouveau générateur centralisé (profil + carry-over + certif)
        const proposals = genererPlanning({
          aerodromeId, annee,
          profilRisque: profil,
          ecartsActifs: ecarts,
          certifications: certs,
          homologations: homos,
          inspecteurs,
          historiqueSurveillances: historique,
        })
        return proposals as unknown as Planning[]
      },

      validerPropositionN1: async (id) => {
        const prop = get().propositionsN1.find(p => p.id === id)
        if (!prop) return
        // Strip extra fields du PlanningProposal qui n'existent pas dans la DB
        const { sort_order, source, ...cleanProp } = prop as any
        const planning = { ...cleanProp, est_proposition: false, updated_at: new Date().toISOString() } as any
        await get().addPlanning(planning)
        set((s) => ({ propositionsN1: s.propositionsN1.filter(p => p.id !== id) }))
      },

      refuserPropositionN1: (id, motif) => {
        set((s) => ({ propositionsN1: s.propositionsN1.filter(p => p.id !== id) }))
      },

      consoliderPropositionsN1: async (ids) => {
        const state = get()
        for (const id of ids) {
          const prop = state.propositionsN1.find(p => p.id === id)
          if (!prop) continue
          const { sort_order, source, ...cleanProp } = prop as any
          const planning = { ...cleanProp, est_proposition: false, updated_at: new Date().toISOString() } as any
          await get().addPlanning(planning)
        }
        set((s) => ({ propositionsN1: s.propositionsN1.filter(p => !ids.includes(p.id)) }))
      },

      // ============================================================
      // EVENEMENT SLICE
      // ============================================================
      evenements: [],
      currentEvenement: null,
      setEvenements: (evenements) => set({ evenements }),
      setCurrentEvenement: (evenement) => set({ currentEvenement: evenement }),
      addEvenement: async (evenement) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const newEvent = { ...evenement, id, created_at: now, updated_at: now } as EvenementSecurite
        set((state) => ({ evenements: [...state.evenements, newEvent] }))
        try {
          const result = await datastore.createEvenement(evenement)
          if (result.error) throw new Error(result.error)
          set((state) => ({ evenements: state.evenements.map(e => e.id === id ? { ...e, id: result.data?.id || id } : e) }))
        } catch (error) {
          console.error('Erreur création événement Supabase, rollback:', error)
          set((state) => ({ evenements: state.evenements.filter(e => e.id !== id) }))
          return
        }
        get().recalculerProfilRisque(newEvent.aerodrome_id)
        import('@/lib/risque/bayesian').then(({ updatePriorAfterIncident }) => {
          const graviteMap: Record<string, 'mineur' | 'majeur' | 'critique' | 'catastrophique'> = {
            CRITIQUE: 'critique', ORANGE: 'majeur', JAUNE: 'mineur', GRIS: 'mineur', BLEU: 'mineur',
          }
          const bayesianGravite = graviteMap[newEvent.gravite] ?? 'mineur'
          updatePriorAfterIncident(0.3, bayesianGravite)
        }).catch(() => {})
      },
      updateEvenement: async (id, data) => {
        const eventAvant = get().evenements.find(e => e.id === id)
        const snapshot = get().evenements
        set((state) => ({
          evenements: state.evenements.map(e => e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e)
        }))
        try {
          const result = await datastore.updateEvenement(id, data)
          if (result.error) throw new Error(result.error)
        } catch (error) {
          console.error('Erreur update événement Supabase, rollback:', error)
          set({ evenements: snapshot })
          return
        }
        if (eventAvant) {
          get().recalculerProfilRisque(eventAvant.aerodrome_id)
        }
      },
      deleteEvenement: async (id) => {
        const eventAvant = get().evenements.find(e => e.id === id)
        const snapshot = get().evenements
        set((state) => ({
          evenements: state.evenements.filter(e => e.id !== id),
          currentEvenement: state.currentEvenement?.id === id ? null : state.currentEvenement,
        }))
        try {
          const result = await datastore.deleteEvenement(id)
          if (result.error) throw new Error(result.error)
        } catch (error) {
          console.error('Erreur delete événement Supabase, rollback:', error)
          set({ evenements: snapshot })
          return
        }
        if (eventAvant) {
          get().recalculerProfilRisque(eventAvant.aerodrome_id)
        }
      },
      assignerInspecteur: async (evenementId, inspecteurId) => {
        const snapshot = get().evenements
        set((state) => ({
          evenements: state.evenements.map(e => e.id === evenementId ? { ...e, inspecteur_id: inspecteurId } : e)
        }))
        try {
          const result = await datastore.updateEvenement(evenementId, { inspecteur_id: inspecteurId })
          if (result.error) throw new Error(result.error)
        } catch (error) {
          console.error('Erreur assignation inspecteur Supabase, rollback:', error)
          set({ evenements: snapshot })
        }
      },
      creerEcartLie: async (evenementId, ecartData) => {
        const now = new Date().toISOString()
        const ecartId = crypto.randomUUID()
        const newEcart: Ecart = {
          id: ecartId,
          aerodrome_id: ecartData.aerodrome_id || '',
          surveillance_id: ecartData.surveillance_id || '',
          domaine: ecartData.domaine || 'SGS',
          reference: ecartData.reference || `ECA-${new Date().getFullYear()}-${String(get().ecarts.length + 1).padStart(3, '0')}`,
          ref_reglementaire: ecartData.ref_reglementaire || '',
          libelle: ecartData.libelle || '',
          niveau_risque: ecartData.niveau_risque || 'moyen',
          statut: 'ouvert',
          delai_pac: ecartData.delai_pac || new Date(Date.now() + 15 * 86400000).toISOString(),
          delai_regularisation: ecartData.delai_regularisation || new Date(Date.now() + 90 * 86400000).toISOString(),
          inspecteur_ref_id: ecartData.inspecteur_ref_id || '',
          created_at: now,
          updated_at: now,
          evenement_id: evenementId,
        }
        // Persister dans Supabase comme addEcart (surveillance)
        const result = await datastore.createEcart(newEcart)
        if (result.error) {
          console.error('[creerEcartLie] Erreur création écart Supabase:', result.error)
          set((state) => ({ ecarts: [...state.ecarts, newEcart] })) // fallback local
        }
        const savedEcart = (result.data || newEcart) as Ecart
        set((state) => ({ ecarts: [...state.ecarts, savedEcart] }))
        set((state) => ({
          evenements: state.evenements.map(e => e.id === evenementId
            ? { ...e, statut: 'ecart_cree' as const, ecart_ids: [...(e.ecart_ids || []), savedEcart.id] }
            : e
          )
        }))
        
        // Notifier le focal_operator de l'aérodrome
        const aerodrome = get().aerodromes.find(a => a.id === savedEcart.aerodrome_id)
        const evenement = get().evenements.find(e => e.id === evenementId)
        const focalOperators = get().utilisateurs.filter(u => 
          (u.role === 'focal_operator' || u.role === 'dg_operator') && 
          u.aerodrome_id === savedEcart.aerodrome_id
        )
        
        focalOperators.forEach(operator => {
          get().addNotification({
            user_id: operator.id,
            type: 'warning',
            title: 'Écart créé suite à un événement',
            message: `Écart ${savedEcart.reference} lié à l'événement ${evenement?.reference || ''}${aerodrome ? ` - ${aerodrome.code_oaci}` : ''}. Un PAC sera requis après évaluation.`,
            link: `/portail-exploitant/ecarts`,
            canal: 'in_app'
          })
          
          if (operator.notifications_email) {
            fetch('/api/notifications/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: operator.email,
                subject: `SGDA - Écart ${savedEcart.reference} - Événement ${evenement?.reference || ''}`,
                template: 'ecart-evenement',
                data: {
                  reference: savedEcart.reference,
                  evenement: evenement?.reference || '',
                  aerodrome: aerodrome?.nom || '',
                  libelle: newEcart.libelle,
                  niveau: newEcart.niveau_risque,
                  lien: `/portail-exploitant/ecarts`
                }
              })
            })
            .catch(error => console.error('[Notification] Erreur:', error))
          }
        })
      },
      getEvenementsByAerodrome: (aerodromeId) => get().evenements.filter(e => e.aerodrome_id === aerodromeId),
      getEvenementsUrgents: () => get().evenements.filter(e => e.gravite === 'CRITIQUE' || e.gravite === 'ORANGE'),

      // ============================================================
      // ENQUETE SLICE
      // ============================================================
      enquetes: [],
      reponsesEnquetes: [],
      currentEnquete: null,
      setEnquetes: (enquetes) => set({ enquetes }),
      setReponses: (reponses) => set({ reponsesEnquetes: reponses }),
      addEnquete: (enquete) => set((state) => ({
        enquetes: [...state.enquetes, { ...enquete, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Enquete]
      })),
      updateEnquete: (id, data) => set((state) => ({
        enquetes: state.enquetes.map(e => e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e)
      })),
      deleteEnquete: (id) => set((state) => ({
        enquetes: state.enquetes.filter(e => e.id !== id),
        currentEnquete: state.currentEnquete?.id === id ? null : state.currentEnquete,
      })),
      soumettreReponse: (reponse) => set((state) => ({
        reponsesEnquetes: [...state.reponsesEnquetes, { ...reponse, id: crypto.randomUUID(), submitted_at: new Date().toISOString() } as ReponseEnquete]
      })),
      getStatistiquesEnquete: (enqueteId) => {
        const reponses = get().reponsesEnquetes.filter(r => r.enquete_id === enqueteId)
        const enquete = get().enquetes.find(e => e.id === enqueteId)
        const cible = enquete?.aerodrome_ids?.length || 1
        const taux = Math.round((reponses.length / cible) * 100)
        return { total_reponses: reponses.length, taux_reponse: taux, score_moyen: 0, reponses_par_question: {} } as StatistiquesEnquete
      },
      calculerImpactC1: (reponses) => {
        if (reponses.length === 0) return 50
        return Math.min(100, 50 + reponses.length * 2)
      },

      // ============================================================
      // MESSAGERIE SLICE
      // ============================================================
      messages: [],
      conversations: [],
      messagesNonLus: 0,
      setMessages: (messages) => set({ messages }),
      envoyerMessage: (message) => {
        const newMsg = { ...message, id: crypto.randomUUID(), created_at: new Date().toISOString() } as Message
        set((state) => ({ messages: [...state.messages, newMsg] }))
        // Fire-and-forget Supabase (ne bloque PAS l'UI)
        datastore.createMessage(newMsg).then(result => {
          if (result.error) {
            console.error('[store/envoyerMessage] Erreur Supabase:', result.error)
            return
          }
          set((state) => ({
            messages: state.messages.map(m => m.id === newMsg.id ? result.data as Message : m)
          }))
          // Si message exploitant, notifier les destinataires
          if (message.canal === 'exploitant') {
            const toIds = typeof message.to_id === 'string' ? [message.to_id] : message.to_id
            for (const uid of [...toIds, ...(message.cc_id || [])]) {
              if (uid && uid !== message.from_id) {
                get().addNotification({
                  user_id: uid,
                  type: 'info',
                  title: `Nouveau message: ${message.subject}`,
                  message: `De ${message.from_nom}: ${message.body.substring(0, 100)}`,
                  canal: 'in_app',
                  link: '/?module=messagerie',
                })
              }
            }
          }
        }).catch(err => console.error('[store/envoyerMessage] Exception:', err))
      },
      marquerCommeLu: (messageId) => {
        set((state) => ({
          messages: state.messages.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m)
        }))
        datastore.updateMessage(messageId, { read_at: new Date().toISOString() } as any).catch(err =>
          console.error('[store/marquerCommeLu] Erreur Supabase:', err)
        )
      },
      supprimerMessage: (messageId) => {
        set((state) => ({ messages: state.messages.filter(m => m.id !== messageId) }))
        datastore.deleteMessage(messageId).catch(err =>
          console.error('[store/supprimerMessage] Erreur Supabase:', err)
        )
      },
      archiverMessage: (messageId, userId) => {
        set((state) => ({
          messages: state.messages.map(m => {
            if (m.id !== messageId) return m
            const archived = m.archived_by || []
            return archived.includes(userId) ? m : { ...m, archived_by: [...archived, userId] }
          })
        }))
        const msg = get().messages.find(m => m.id === messageId)
        const archived_by = [...(msg?.archived_by || []), userId]
        datastore.updateMessage(messageId, { archived_by } as any).catch(err =>
          console.error('[store/archiverMessage] Erreur Supabase:', err)
        )
      },
      marquerCommeNonLu: (messageId, _userId) => {
        set((state) => ({
          messages: state.messages.map(m => m.id === messageId ? { ...m, read_at: undefined } : m)
        }))
        datastore.updateMessage(messageId, { read_at: undefined as any } as any).catch(err =>
          console.error('[store/marquerCommeNonLu] Erreur Supabase:', err)
        )
      },
      getConversations: (userId) => {
        const msgs = get().messages
        const convMap = new Map<string, Conversation>()
        for (const msg of msgs) {
          const convId = msg.conversation_id || msg.id
          const existing = convMap.get(convId)
          const toParticipants = typeof msg.to_id === 'string' ? [msg.to_id] : msg.to_id
          const participants = [msg.from_id, ...toParticipants, ...(msg.cc_id || [])]
          if (!existing) {
            convMap.set(convId, {
              id: convId,
              participants,
              dernier_message: msg.body,
              non_lus: (participants.includes(userId) && !msg.read_at) ? 1 : 0,
              updated_at: msg.created_at,
            })
          } else {
            if (new Date(msg.created_at) > new Date(existing.updated_at)) {
              existing.dernier_message = msg.body
              existing.updated_at = msg.created_at
            }
            if (participants.includes(userId) && !msg.read_at) {
              existing.non_lus += 1
            }
            existing.participants = [...new Set([...existing.participants, ...participants])]
          }
        }
        return Array.from(convMap.values()).filter(c => c.participants.includes(userId))
      },
      getMessagesConversation: (conversationId) => get().messages.filter(m => m.conversation_id === conversationId),
      getMessagesNonLus: (userId) => get().messages.filter(m => {
        const toId = m.to_id
        const isRecipient = toId === userId || (Array.isArray(toId) && toId.includes(userId))
        const isCC = m.cc_id?.includes(userId)
        return (isRecipient || isCC) && !m.read_at
      }).length,

      // ============================================================
      // REGISTRE SLICE
      // ============================================================

regulationAnalyses: [],
formationSuggestions: [],

addRegulationAnalysis: (analysis) => set((state) => ({
  regulationAnalyses: [...state.regulationAnalyses, analysis]
})),

updateRegulationAnalysis: (id, data) => set((state) => ({
  regulationAnalyses: state.regulationAnalyses.map(a => a.id === id ? { ...a, ...data } : a)
})),

addFormationSuggestion: (suggestion) => set((state) => ({
  formationSuggestions: [...state.formationSuggestions, suggestion]
})),

updateFormationSuggestion: (id, data) => set((state) => ({
  formationSuggestions: state.formationSuggestions.map(s => s.id === id ? { ...s, ...data } : s)
})),

getPendingRegulationAlerts: () => {
  const state = get()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return state.regulationAnalyses.filter(a => 
    new Date(a.date_analyse) > thirtyDaysAgo && 
    a.impact !== 'aucun' && 
    a.status !== 'resolved'
  )
},

getFormationSuggestionsByInspector: (inspecteurId) => {
  const state = get()
  return state.formationSuggestions.filter(s => 
    s.status === 'suggested' && 
    (s.public_cible.includes('tous') || s.public_cible.includes('expert'))
  )
},
      registres: [],
      setRegistres: (registres) => set({ registres }),
      addEntreeRegistre: (entree) => set((state) => ({
        registres: [...state.registres, { ...entree, id: crypto.randomUUID(), created_at: new Date().toISOString() } as EntreeRegistre]
      })),
      getRegistresByType: (type, aerodromeId) => {
        const all = get().registres.filter(r => r.type === type)
        return aerodromeId ? all.filter(r => r.aerodrome_id === aerodromeId) : all
      },
      getRegistresByAerodrome: (aerodromeId) => get().registres.filter(r => r.aerodrome_id === aerodromeId),
      genererEntreeFromSource: (source, type) => ({
        id: crypto.randomUUID(),
        type,
        aerodrome_id: source.aerodrome_id || '',
        date_entree: source.created_at || new Date().toISOString(),
        reference: source.reference || source.id || '',
        objet: source.libelle || source.titre || source.reference || '',
        description: source.libelle || source.titre || '',
        statut: 'provisoire' as const,
        created_at: new Date().toISOString(),
        created_by: get().user?.id || '',
      } as EntreeRegistre),

      // ============================================================
      // DOSSIER SLICE
      // ============================================================
      dossiers: [],
      currentDossier: null,
      setDossiers: (dossiers) => set({ dossiers }),
      setCurrentDossier: (dossier) => set({ currentDossier: dossier }),
      addDossier: (dossier) => set((state) => ({
        dossiers: [...state.dossiers, { ...dossier, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), historique: [] } as Dossier]
      })),
      extendreDossier: (id, extension, superieurNom) => set((state) => ({
        dossiers: state.dossiers.map(d => {
          if (d.id !== id) return d
          const now = new Date().toISOString()
          const newDateLimite = new Date(new Date(d.date_limite).getTime() + extension.jours * 86400000).toISOString()
          return {
            ...d,
            date_limite: newDateLimite,
            extensions: [...(d.extensions || []), { ...extension, superieur_approbation: superieurNom || 'chef', date: now }],
            historique: [...d.historique, { date: now, action: `Extension de délai de ${extension.jours} jour(s) : ${extension.motif}`, utilisateur: state.user?.nom || 'Système' }],
            updated_at: now,
          }
        })
      })),
      updateDossier: (id, data) => set((state) => ({
        dossiers: state.dossiers.map(d => d.id === id ? { ...d, ...data, updated_at: new Date().toISOString() } : d)
      })),
      deleteDossier: (id) => set((state) => ({
        dossiers: state.dossiers.filter(d => d.id !== id),
        currentDossier: state.currentDossier?.id === id ? null : state.currentDossier,
      })),
      getDossiersByInspecteur: (inspecteurId) => get().dossiers.filter(d => d.inspecteur_id === inspecteurId),
      getDossiersUrgents: () => get().dossiers.filter(d => d.statut === 'en_cours' || d.statut === 'en_attente'),

      // ============================================================
      // FORMATION SLICE
      // ============================================================
      formations: [],
      inspecteurs: [],
      competences: [],
      competencesVersion: 0,
      setFormations: (formations) => set({ formations }),
      setInspecteurs: (inspecteurs) => set({ inspecteurs }),
      addFormation: async (formation) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const newFormation: Formation = { ...formation, id, created_at: now }
        const { id: _, created_at: __, ...payload } = newFormation
        const result = await datastore.createFormation(payload as any)
        if (result.error) {
          console.error('Erreur création formation Supabase:', result.error)
          return
        }
        set((state) => ({ formations: [...state.formations, result.data as Formation] }))
        get().incrementerVersion()
      },
      updateFormation: async (id, data) => {
        const snapshot = get().formations
        set((state) => ({ formations: state.formations.map(f => f.id === id ? { ...f, ...data } : f) }))
        const result = await datastore.updateFormation(id, data)
        if (result.error) {
          console.error('Erreur update formation Supabase, rollback:', result.error)
          set({ formations: snapshot })
          return
        }
        if (data.statut === 'terminee') {
          const formation = get().formations.find(f => f.id === id)
          if (formation?.participants) {
            formation.participants.forEach(pid => get().mettreAJourCompetences(pid, id))
          }
        }
        get().incrementerVersion()
      },
      deleteFormation: async (id) => {
        const snapshot = get().formations
        set((state) => ({ formations: state.formations.filter(f => f.id !== id) }))
        const result = await datastore.deleteFormation(id)
        if (result.error) {
          console.error('Erreur delete formation Supabase, rollback:', result.error)
          set({ formations: snapshot })
        } else {
          get().incrementerVersion()
        }
      },
      addInspecteur: async (inspecteur) => {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  
  const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'
  const emailBase = buildIdentifiant(inspecteur.prenom, inspecteur.nom).replace(`@${domain}`, '')
  let emailANACIM = `${emailBase}@${domain}`
  
  const roleMap: Record<string, string> = {
    'inspecteur_principal': 'inspector',
    'inspecteur_titulaire': 'inspector',
    'cadre_technique': 'inspector',
  }

  const { competences, ...inspecteurSansCompetences } = inspecteur

  // Vérifier matricule (rapide)
  const matriculeExiste = await datastore.checkMatriculeExists(inspecteur.matricule);
  if (matriculeExiste) {
    throw new Error(`Le matricule "${inspecteur.matricule}" existe déjà dans la base de données`);
  }

  const inspecteurPourSupabase = {
    ...inspecteurSansCompetences,
    id,
    email: emailANACIM,
    created_at: now,
    competences: [],
  }

  // Créer dans Supabase avec retry si email dupliqué
  let result = await datastore.createInspecteur(inspecteurPourSupabase as any)
  
  if (result.error && result.error.includes('inspecteurs_email_key')) {
    let suffix = 2
    while (suffix <= 100) {
      const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'
      const nouvelEmail = `${emailBase}${suffix}@${domain}`
      inspecteurPourSupabase.email = nouvelEmail
      emailANACIM = nouvelEmail
      result = await datastore.createInspecteur(inspecteurPourSupabase as any)
      if (!result.error || !result.error.includes('inspecteurs_email_key')) {
        break
      }
      suffix++
    }
  }
  
  if (result.error) {
    throw new Error(result.error)
  }

  // Créer les compétences en parallèle
  if (competences && Array.isArray(competences) && competences.length > 0) {
    Promise.all(competences.map(comp =>
      datastore.createCompetence({
        inspecteur_id: id,
        domaine: comp.domaine,
        niveau: comp.niveau || 3,
        date_obtention: comp.date_obtention || now.split('T')[0],
        source: comp.source || 'formation',
        source_id: comp.source_id,
        expire_le: comp.expire_le || undefined,
      }).catch(err => console.error('Erreur création compétence:', err))
    ))
  }

  // Ajouter au store immédiatement
  const inspecteurComplet: Inspecteur = {
    ...inspecteurSansCompetences,
    id,
    email: emailANACIM,
    created_at: now,
    competences: competences || [],
    formations: [],
  }

  set((state) => ({
    inspecteurs: [...state.inspecteurs, inspecteurComplet],
  }))

  // Créer le compte Supabase Auth (synchrone pour garantir la connexion)
  const userId = crypto.randomUUID()
  const newUser: Utilisateur = {
    id: userId,
    email: emailANACIM,
    prenom: inspecteur.prenom,
    nom: inspecteur.nom,
    role: roleMap[inspecteur.type] || 'inspector',
    inspecteur_id: id,
    password_temporaire: true,
    notifications_email: true,
    notifications_sms: false,
    statut: 'actif',
    matricule: inspecteur.matricule,
    service: inspecteur.service,
  }

  try {
    console.log('[addInspecteur] Création compte Auth pour:', emailANACIM)
    const res = await fetch('/api/auth/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailANACIM,
        password: 'AnacimDNS@2026',
        prenom: inspecteur.prenom,
        nom: inspecteur.nom,
        role: newUser.role,
        inspecteur_id: id,
        matricule: inspecteur.matricule,
        service: inspecteur.service,
        must_change_password: true,
      }),
    })
    const data = await res.json()
    console.log('[addInspecteur] Réponse API:', res.status, data)
    if (!res.ok) {
      console.error('Erreur création compte auth:', data.error)
      throw new Error(`Compte Auth non créé: ${data.error}`)
    }
    
    set((state) => ({
      utilisateurs: [...state.utilisateurs, { ...newUser, auth_id: data.auth_id }]
    }))
    get().addNotification({
      user_id: get().user?.id || '',
      type: 'success',
      message: `Inspecteur ${inspecteur.prenom} ${inspecteur.nom} créé. Email: ${emailANACIM} / Mot de passe: AnacimDNS@2026`,
      canal: 'in_app'
    })
  } catch (error: any) {
    console.error('Erreur API create-user:', error)
    set((state) => ({
      utilisateurs: [...state.utilisateurs, newUser]
    }))
    throw new Error(`Inspecteur créé mais erreur Auth: ${error.message}`)
  }

  get().addNotification({
    user_id: get().user?.id || '',
    type: 'success',
    message: `Inspecteur ${inspecteur.prenom} ${inspecteur.nom} créé`,
    canal: 'in_app'
  })
  get().incrementerVersion()
},
      updateInspecteur: async (id, data) => {
        set((state) => ({
          inspecteurs: state.inspecteurs.map(i => i.id === id ? { ...i, ...data } : i)
        }))
        // Sync vers Utilisateur si poste ou superieur_id change
        if (data.poste !== undefined || data.superieur_id !== undefined) {
          const inspecteur = get().inspecteurs.find(i => i.id === id)
          if (inspecteur?.user_id) {
            get().updateUtilisateur(inspecteur.user_id, { poste: data.poste, superieur_id: data.superieur_id })
          }
        }
        try {
          const datastore = await import('./datastore')
          await datastore.updateInspecteur(id, data)
        } catch (err) {
          console.error('[store] Erreur update inspecteur:', err)
        }
        get().incrementerVersion()
      },
      deleteInspecteur: async (id: string) => {
        const state = get()
        const inspecteur = state.inspecteurs.find(i => i.id === id)
        if (!inspecteur) return
        
        const now = new Date().toISOString()
        const userId = get().user?.id || ''
        const deletedBy = state.user ? `${state.user.prenom} ${state.user.nom}` : 'Administrateur'
        
        // Trouver l'utilisateur lié
        const linkedUser = state.utilisateurs.find(u => u.inspecteur_id === id)
        
        // 1. Hard delete de l'inspecteur dans Supabase
        await datastore.deleteInspecteur(id)
        
        // 2. Hard delete de l'inspecteur du store local
        set((state) => ({
          inspecteurs: state.inspecteurs.filter(i => i.id !== id)
        }))
        
        // 3. Supprimer l'utilisateur lié s'il existe
        if (linkedUser) {
          set((state) => ({
            utilisateurs: state.utilisateurs.filter(u => u.id !== linkedUser.id)
          }))
          
          // Supprimer l'utilisateur dans Supabase
          await datastore.deleteUtilisateur(linkedUser.id)
          
          // Supprimer le compte Supabase Auth
          if (linkedUser.auth_id) {
            try {
              await fetch('/api/auth/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_id: linkedUser.auth_id }),
              })
            } catch (error) {
              console.error('Erreur API delete-user:', error)
            }
          }
        }
        
        // 4. Cascade sur formations: retirer des participants (sauf terminées)
        set((state) => ({
          formations: state.formations.map(f => 
            f.participants?.includes(id) && f.statut !== 'terminee'
              ? { ...f, participants: f.participants.filter((p: string) => p !== id) }
              : f
          )
        }))
        
        // 5. Cascade sur surveillances: retirer de l'équipe (sauf archivé/terminé)
        set((state) => ({
          surveillances: state.surveillances.map(s => 
            s.equipe_ids?.includes(id) && !['archivee', 'terminee'].includes(s.statut)
              ? { ...s, equipe_ids: s.equipe_ids.filter((eId: string) => eId !== id) }
              : s
          )
        }))
        
        // 6. Cascade sur écarts: retirer le responsable (sauf résolus/archivés)
        set((state) => ({
          ecarts: state.ecarts.map(e => 
            e.responsable_id === id && !['resolu', 'archive'].includes(e.statut)
              ? { ...e, responsable_id: undefined }
              : e
          )
        }))
        
        // 7. Notification email à l'inspecteur supprimé
        if (inspecteur.email) {
          const { notifyInspecteurDeleted } = await import('./notifications')
          notifyInspecteurDeleted(inspecteur.prenom, inspecteur.nom, inspecteur.email, deletedBy)
        }
        
        // 8. Notification in-app + email aux admins
        const cascadeResults = [
          { type: 'formations', count: state.formations.filter(f => f.participants?.includes(id) && f.statut !== 'terminee').length },
          { type: 'surveillances', count: state.surveillances.filter(s => s.equipe_ids?.includes(id) && !['archivee', 'terminee'].includes(s.statut)).length },
        ]
        const { notifyDeletionCascade } = await import('./notifications')
        notifyDeletionCascade('inspecteur', `${inspecteur.prenom} ${inspecteur.nom}`, cascadeResults, deletedBy)
        
        get().addNotification({
          user_id: userId,
          type: 'warning',
          message: `L'inspecteur ${inspecteur.prenom} ${inspecteur.nom} et son compte utilisateur ont été supprimés`,
          canal: 'in_app'
        })
      },
      getCompetencesByInspecteur: (inspecteurId) => get().competences.filter(c => c.inspecteur_id === inspecteurId),
      getFormationsByInspecteur: (inspecteurId) => get().formations.filter(f => f.participants?.includes(inspecteurId)),
      mettreAJourCompetences: (inspecteurId, formationId) => {
        const formation = get().formations.find(f => f.id === formationId)
        if (!formation) return
        const newCompetences = (formation.domaines || []).map((domaine: string) => ({
          id: crypto.randomUUID(),
          inspecteur_id: inspecteurId,
          domaine: domaine,
          niveau: 3,
          source: 'formation' as const,
          source_id: formationId,
          date_obtention: new Date().toISOString(),
          expire_le: new Date(Date.now() + 365 * 86400000 * 2).toISOString(),
        } as Competence))
        set((state) => ({ competences: [...state.competences.filter(c => !(c.inspecteur_id === inspecteurId && newCompetences.some(n => n.domaine === c.domaine))), ...newCompetences] }))
      },

      incrementerVersion: () => set((s) => ({ competencesVersion: s.competencesVersion + 1 })),

      // ============================================================
      // KIT SLICE
      // ============================================================
      kitDocuments: [],
      setKitDocuments: (documents) => set({ kitDocuments: documents }),
      addKitDocument: (document) => set((state) => ({
        kitDocuments: [...state.kitDocuments, { ...document, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), telechargements: 0 } as KitDocument]
      })),
      updateKitDocument: (id, data) => set((state) => ({
        kitDocuments: state.kitDocuments.map(k => k.id === id ? { ...k, ...data, updated_at: new Date().toISOString() } : k)
      })),
      deleteKitDocument: (id) => set((state) => ({
        kitDocuments: state.kitDocuments.filter(k => k.id !== id)
      })),
      getDocumentsByDomaine: (domaine) => get().kitDocuments.filter(k => k.domaines?.includes(domaine)),
      getDocumentsExploitant: (aerodromeId) => get().kitDocuments.filter(k => {
        if (!k.accessible_exploitant) return false
        if (!aerodromeId) return true
        const partagesActifs = k.partage_exploitant?.filter(p => p.actif).map(p => p.aerodrome_id) || []
        const cibles = k.shared_aerodrome_ids || []
        return partagesActifs.length === 0 && cibles.length === 0
          ? true
          : partagesActifs.includes(aerodromeId) || cibles.includes(aerodromeId)
      }),
      partagerKitDocumentExploitant: (documentId, aerodromeId, message) => {
        const doc = get().kitDocuments.find(k => k.id === documentId)
        if (!doc || !aerodromeId) return

        const now = new Date().toISOString()
        const user = get().user
        const aerodrome = get().aerodromes.find(a => a.id === aerodromeId)
        const partageId = `kit-share-${documentId}-${aerodromeId}`

        set((state) => ({
          kitDocuments: state.kitDocuments.map(k => {
            if (k.id !== documentId) return k
            const autresPartages = (k.partage_exploitant || []).filter(p => p.aerodrome_id !== aerodromeId)
            return {
              ...k,
              accessible_exploitant: true,
              shared_aerodrome_ids: Array.from(new Set([...(k.shared_aerodrome_ids || []), aerodromeId])),
              partage_exploitant: [
                ...autresPartages,
                {
                  id: partageId,
                  aerodrome_id: aerodromeId,
                  partage_par: user?.id || 'system',
                  partage_le: now,
                  message,
                  actif: true,
                },
              ],
              updated_at: now,
            }
          }),
        }))

        get().envoyerMessage({
          canal: 'exploitant',
          from_id: user?.id || 'system',
          from_nom: user ? `${user.prenom} ${user.nom}` : 'ANACIM',
          from_role: user?.role || 'system',
          to_id: aerodromeId,
          aerodrome_id: aerodromeId,
          subject: `Document partagé : ${doc.nom}`,
          body: message?.trim() || `Un document du kit inspecteur a été partagé avec ${aerodrome?.code_oaci || "l'exploitant"}.`,
          attachments: [{
            nom: doc.fichier_nom || doc.nom,
            url: doc.fichier_url,
            taille: doc.fichier_taille || 0,
            type: doc.format || doc.type_document || 'application/octet-stream',
          }],
        })

        // Notification exploitant
        import('@/lib/services/notificationService').then(({ notificationService }) => {
          notificationService.notify('document_partage', {
            aerodrome_id: aerodromeId,
            nom_document: doc.nom,
            partage_par: user ? `${user.prenom} ${user.nom}` : "L'inspecteur",
            message: message?.trim(),
          })
        })
      },
      revoquerPartageKitDocument: (documentId, aerodromeId) => set((state) => ({
        kitDocuments: state.kitDocuments.map(k => {
          if (k.id !== documentId) return k
          const partages = (k.partage_exploitant || []).map(p =>
            p.aerodrome_id === aerodromeId ? { ...p, actif: false } : p
          )
          const sharedIds = (k.shared_aerodrome_ids || []).filter(id => id !== aerodromeId)
          const resteActif = partages.some(p => p.actif)
          return {
            ...k,
            shared_aerodrome_ids: sharedIds,
            partage_exploitant: partages,
            accessible_exploitant: resteActif || (k.accessible_exploitant && (k.partage_exploitant || []).length === 0),
            updated_at: new Date().toISOString(),
          }
        }),
      })),
      incrementerTelechargement: (id) => set((state) => ({
        kitDocuments: state.kitDocuments.map(k => k.id === id ? { ...k, telechargements: (k.telechargements || 0) + 1 } : k)
      })),
      kitPreviewDoc: null,
      kitPreviewData: null,
      kitAnalyseIA: null,
      setKitPreview: (doc, data, analyse) => set({ kitPreviewDoc: doc, kitPreviewData: data, kitAnalyseIA: analyse }),
      clearKitPreview: () => set({ kitPreviewDoc: null, kitPreviewData: null, kitAnalyseIA: null }),

      // ============================================================
      // MASTER CHECKLIST SLICE (checklist source unique Kit Inspecteur)
      // ============================================================
      masterChecklists: {},

      setMasterChecklist: (id, checklist) => set((state) => ({
        masterChecklists: { ...state.masterChecklists, [id]: checklist }
      })),

      deleteMasterChecklist: (id) => set((state) => {
        const { [id]: _, ...rest } = state.masterChecklists
        return { masterChecklists: rest }
      }),

      findMasterChecklistForPortee: (portee) => {
        const mcs = get().masterChecklists
        if (!portee || portee.length === 0) return null
        for (const [id, checklist] of Object.entries(mcs)) {
          const domainesCodes = checklist.map(d => d.nom.toUpperCase())
          // Match si la portée est entièrement couverte par la checklist
          const couvre = portee.every(p => domainesCodes.some(d => d.includes(p.toUpperCase()) || p.toUpperCase().includes(d)))
          if (couvre) return { id, checklist }
        }
        return null
      },

      // ============================================================
      // API KEYS SLICE
      // ============================================================
      apiKeys: [],
      setApiKeys: (keys) => set({ apiKeys: keys }),
      addApiKey: async (keyData) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const newKey: ApiKey = { ...keyData, id, created_at: now, updated_at: now }
        set((state) => ({ apiKeys: [...state.apiKeys, newKey] }))
        const { createApiKey } = await import('./datastore')
        await createApiKey(newKey).catch(() => {})
      },
      updateApiKey: async (id, data) => {
        const snapshot = get().apiKeys
        set((state) => ({ apiKeys: state.apiKeys.map(k => k.id === id ? { ...k, ...data, updated_at: new Date().toISOString() } : k) }))
        const { updateApiKey: update } = await import('./datastore')
        const { error } = await update(id, data)
        if (error) { set({ apiKeys: snapshot }) }
      },
      deleteApiKey: async (id) => {
        const snapshot = get().apiKeys
        set((state) => ({ apiKeys: state.apiKeys.filter(k => k.id !== id) }))
        const { deleteApiKey: del } = await import('./datastore')
        const { error } = await del(id)
        if (error) { set({ apiKeys: snapshot }) }
      },

      // ============================================================
      // CODE ACCES SLICE
      // ============================================================
      codesAcces: [],
      setCodesAcces: (codes) => set({ codesAcces: codes }),
      genererCode: (aerodromeId, description, expiresAt, codeGenere, codeType, dgPrenom, dgNom, focalPrenom, focalNom, staffPrenom, staffNom, telephone, email) => {
        const code = codeGenere || (() => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
          return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
        })()
        const newCode: CodeAcces = {
          id: crypto.randomUUID(),
          aerodrome_id: aerodromeId,
          code,
          code_partiel: codeAccesUtils.masquerCode(code),
          description: description || '',
          expires_at: expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
          statut: 'actif',
          nb_connexions: 0,
          created_at: new Date().toISOString(),
          created_by: get().user?.id || '',
          code_type: codeType || 'FP',
          dg_prenom: dgPrenom || '',
          dg_nom: dgNom || '',
          focal_prenom: focalPrenom || '',
          focal_nom: focalNom || '',
          staff_prenom: staffPrenom || '',
          staff_nom: staffNom || '',
          telephone: telephone || '',
          email: email || '',
        }
        set((state) => ({ codesAcces: [...state.codesAcces, newCode] }))
        datastore.createCodeAcces(newCode).then(r => { if (r.error) console.error('Erreur création code acces Supabase:', r.error) })
        return newCode
      },
      revoquerCode: async (id) => {
        const code = get().codesAcces.find(c => c.id === id)
        set((state) => ({ codesAcces: state.codesAcces.map(c => c.id === id ? { ...c, statut: 'revogue' as const } : c) }))
        datastore.revokeCodeAcces(id).then(r => { if (r.error) console.error('Erreur révocation code acces Supabase:', r.error) })
        // Supprimer les utilisateurs liés à ce code d'accès
        if (code?.aerodrome_id) {
          const linkedUsers = get().utilisateurs.filter(u =>
            u.aerodrome_id === code.aerodrome_id &&
            ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role ?? '') &&
            u.password_temporaire === true
          )
          for (const user of linkedUsers) {
            try {
              await get().deleteUtilisateur(user.id)
            } catch {
              // Marquer comme inactif si la suppression échoue
              get().updateUtilisateur(user.id, { statut: 'inactif' } as any)
            }
          }
        }
      },
      deleteCodeAcces: async (id) => {
        const code = get().codesAcces.find(c => c.id === id)
        set((state) => ({ codesAcces: state.codesAcces.filter(c => c.id !== id) }))
        datastore.deleteCodeAcces(id).then(r => { if (r.error) console.error('Erreur suppression code acces Supabase:', r.error) })
        // Supprimer les utilisateurs liés
        if (code?.aerodrome_id) {
          const linkedUsers = get().utilisateurs.filter(u =>
            u.aerodrome_id === code.aerodrome_id &&
            ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role ?? '') &&
            u.password_temporaire === true
          )
          for (const user of linkedUsers) {
            try {
              await get().deleteUtilisateur(user.id)
            } catch {
              get().updateUtilisateur(user.id, { statut: 'inactif' } as any)
            }
          }
        }
      },
      verifierCode: (code) => {
        const found = get().codesAcces.find(c => c.code === code && c.statut === 'actif')
        if (!found) return { valide: false }
        if (found.expires_at && new Date(found.expires_at) < new Date()) {
          // Auto-révoquer le code expiré + supprimer les utilisateurs liés
          get().revoquerCode(found.id)
          return { valide: false }
        }
        return { valide: true, aerodromeId: found.aerodrome_id }
      },
      getCodesByAerodrome: (aerodromeId) => get().codesAcces.filter(c => c.aerodrome_id === aerodromeId),

      // ============================================================
      // AUDIT SLICE
      // ============================================================
      auditLogs: [],
      setAuditLogs: (logs) => set({ auditLogs: logs }),
      addAuditLog: (log) => set((state) => ({
        auditLogs: [...state.auditLogs, { ...log, id: crypto.randomUUID(), date: new Date().toISOString() } as AuditLog]
      })),
      getLogsByUtilisateur: (utilisateurId) => get().auditLogs.filter(l => l.utilisateur_id === utilisateurId),
      getLogsByModule: (module) => get().auditLogs.filter(l => l.module === module),
      getLogsByPeriode: (debut, fin) => get().auditLogs.filter(l => l.date >= debut && l.date <= fin),
      exporterLogsCSV: (logs) => {
        const header = 'Date,Utilisateur,Module,Action,Détail\n'
        const rows = logs.map(l => `${l.date},${l.utilisateur_id},${l.module},${l.action},"${l.details || ''}"`)
        return header + rows.join('\n')
      },

      // ============================================================
      // UI SLICE
      // ============================================================
      activeModule: 'dashboard',
      setActiveModule: (module) => set({ activeModule: module }),
      activeSurveillanceId: null,
      setActiveSurveillanceId: (id) => set({ activeSurveillanceId: id }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      theme: typeof window !== 'undefined' ? (() => { try { return (localStorage.getItem('sgda-theme') as 'light' | 'dark' | 'system') || 'system' } catch { console.warn('[Store] Erreur chargement thème'); return 'system' } })() : 'system',
      setTheme: (theme) => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('sgda-theme', theme)
          } catch (error) {
            console.warn('[Store] Erreur sauvegarde thème:', error)
          }
        }
        set({ theme })
      },
      
      filters: {
        search: '',
        region: [],
        type: [],
        statut: [],
        niveauRisque: [],
      },
      viewMode: 'list',
      setFilters: (newFilters) => set((state) => ({
        filters: { ...state.filters, ...newFilters }
      })),
      setViewMode: (mode) => set({ viewMode: mode }),
      
      isLoading: {},
      setLoading: (key, loading) => set((state) => ({
        isLoading: { ...state.isLoading, [key]: loading }
      })),
      _hydrated: false,
      pendingRegistreSource: null,
      setPendingRegistreSource: (source) => set({ pendingRegistreSource: source }),

      // ============================================================
      // CHECKLIST SLICE
      // ============================================================
      checklistItems: {},
      checklistHierarchy: {},

      setChecklistHierarchy: (surveillanceId, hierarchy) => set((state) => ({
        checklistHierarchy: { ...state.checklistHierarchy, [surveillanceId]: hierarchy }
      })),

      setChecklistItems: (surveillanceId, items) => set((state) => ({
        checklistItems: { ...state.checklistItems, [surveillanceId]: items }
      })),
      
      updateChecklistItem: (surveillanceId, itemId, data) => 
        set((state) => {
          const items = state.checklistItems?.[surveillanceId] || []
          const updatedItems = items.map(item =>
            item.id === itemId
              ? { ...item, ...data, last_modified: new Date().toISOString() }
              : item
          )
          const progression = get().calculerProgression(surveillanceId)
          const surveillances = state.surveillances.map(s =>
            s.id === surveillanceId ? { ...s, progression } : s
          )
          return {
            checklistItems: { ...state.checklistItems, [surveillanceId]: updatedItems },
            surveillances
          }
        }),  
      
      getItemsNSNV: (surveillanceId) => {
        const items = get().checklistItems?.[surveillanceId] || []
        return items.filter(i => i.resultat === 'NS' || i.resultat === 'NV')
      }, 
      
      getItemsNSNVFromHierarchy: (surveillanceId) => {
        const hierarchy = get().checklistHierarchy?.[surveillanceId] || []
        const itemsNSNV: (ChecklistItem & { domaine: string; sousDomaine: string; sousSousDomaine: string })[] = []
        
        const parcourir = (domaines: DomaineChecklist[]) => {
          for (const domaine of domaines) {
            for (const sousDomaine of domaine.sousDomaines) {
              for (const sousSousDomaine of sousDomaine.sousSousDomaines) {
                for (const item of sousSousDomaine.items) {
                  if (item.resultat === 'NS' || item.resultat === 'NV') {
                    itemsNSNV.push({
                      ...item,
                      domaine: domaine.nom,
                      sousDomaine: sousDomaine.nom,
                      sousSousDomaine: sousSousDomaine.nom,
                    })
                  }
                }
              }
            }
          }
        }
        
        parcourir(hierarchy)
        return itemsNSNV
      },
      
      calculerProgression: (surveillanceId) => {
        const items = get().checklistItems?.[surveillanceId] || []
        if (items.length === 0) return 0
        const renseignes = items.filter(i => i.resultat).length
        return Math.round((renseignes / items.length) * 100)
      },

      // ============================================================
      // ECARTS REDACTION SLICE
      // ============================================================
      ecartsRedaction: [],
      
      setEcartsRedaction: (ecarts) => set({ ecartsRedaction: ecarts }),
      
      addEcartRedaction: (ecartData) => {
        const now = new Date().toISOString()
        const newEcart: EcartRedaction = {
          id: crypto.randomUUID(),
          reference: ecartData.reference || `ECA-${new Date().getFullYear()}-${String(get().ecartsRedaction.length + 1).padStart(3, '0')}`,
          ref_reglementaire: ecartData.ref_reglementaire || '',
          libelle: ecartData.libelle || '',
          niveau: ecartData.niveau || 'moyen',
          item_ids: ecartData.item_ids || [],
          surveillance_id: ecartData.surveillance_id || '',
          aerodrome_id: ecartData.aerodrome_id || '',
          created_at: now,
          updated_at: now,
          created_by: get().user?.id || '',
          updated_by: get().user?.id || '',
        }
        set((state) => ({
          ecartsRedaction: [...state.ecartsRedaction, newEcart]
        }))
      },
      
      updateEcartRedaction: (id, data) => set((state) => ({
        ecartsRedaction: state.ecartsRedaction.map(e =>
          e.id === id ? { ...e, ...data, updated_at: new Date().toISOString() } : e
        )
      })),
      
      deleteEcartRedaction: (id) => set((state) => ({
        ecartsRedaction: state.ecartsRedaction.filter(e => e.id !== id)
      })),
      
      getEcartsBySurveillance: (surveillanceId) => {
        return get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
      },

      // ============================================================
      // WORKFLOW SLICE
      // ============================================================
      addSignature: (surveillanceId: string, type: string, signature: SignatureInfo) => {
        set((state) => {
          const surveillance = state.surveillances.find(s => s.id === surveillanceId)
          if (!surveillance) return state
          const field = `signatures_${type}` as keyof Surveillance
          const currentSignatures = (surveillance[field] as SignatureInfo[] | undefined) || []
          if (currentSignatures.some((s: SignatureInfo) => s.signataire_id === signature.signataire_id)) {
            return state
          }
          const updatedSurveillance = {
            ...surveillance,
            [field]: [...currentSignatures, signature]
          }
          return {
            surveillances: state.surveillances.map(s => 
              s.id === surveillanceId ? updatedSurveillance : s
            )
          }
        })
      },

      // ─── Réparation des écarts manquants (surveillances déjà transmises) ──────
      reparerEcartsManquants: async (surveillanceId) => {
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) return { repaired: 0, message: 'Surveillance introuvable' }

        // 1. Chercher les ecartsRedaction — store IDB en priorité, sinon Supabase
        let ecartsRedaction: any[] = get().ecartsRedaction.filter(
          (e: any) => e.surveillance_id === surveillanceId
        )
        if (ecartsRedaction.length === 0) {
          console.log('[reparerEcartsManquants] Store vide, tentative Supabase ecarts_redaction...')
          ecartsRedaction = await datastore.fetchEcartsRedactionBySurveillance(surveillanceId)
        }
        if (ecartsRedaction.length === 0) {
          ecartsRedaction = extractEcartsFromRapportHtml(surveillance)
          if (ecartsRedaction.length > 0) {
            console.log('[reparerEcartsManquants] Écarts reconstruits depuis le rapport signé')
          }
        }
        if (ecartsRedaction.length === 0) {
          return { repaired: 0, message: 'Aucun brouillon d\'écart trouvé (ni store, ni Supabase, ni rapport signé).' }
        }

        // 2. Écarts officiels déjà existants pour cette surveillance
        const existingIds  = new Set(get().ecarts.filter((e: any) => e.surveillance_id === surveillanceId).map((e: any) => e.id))
        const existingRefs = new Set(get().ecarts.filter((e: any) => e.surveillance_id === surveillanceId).map((e: any) => e.reference))

        const now = new Date().toISOString()
        const _isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const delaisMap: Record<string, { pac: number; regularisation: number }> = {
          critique: { pac: 3,  regularisation: 7   },
          eleve:    { pac: 7,  regularisation: 30  },
          moyen:    { pac: 15, regularisation: 90  },
          faible:   { pac: 30, regularisation: 180 },
        }

        let repaired = 0
        const errors: string[] = []

        for (const er of ecartsRedaction) {
          if (existingIds.has(er.id) || existingRefs.has(er.reference)) continue

          const ecartId = _isUUID.test(er.id) ? er.id : crypto.randomUUID()
          const niveau  = (er.niveau || er.niveau_risque || 'moyen') as Ecart['niveau_risque']
          const delais  = delaisMap[niveau] ?? delaisMap.moyen

          const newEcart: Ecart = {
            id:                    ecartId,
            aerodrome_id:          surveillance.aerodrome_id || '',
            surveillance_id:       surveillanceId,
            domaine:               er.domaine || surveillance.portee?.[0] || 'SGS',
            reference:             er.reference || `ECA-${new Date().getFullYear()}-${String(repaired + 1).padStart(3, '0')}`,
            ref_reglementaire:     er.ref_reglementaire || '',
            libelle:               er.libelle || '',
            niveau_risque:         niveau,
            cellule_risque_oaci:   er.cellule_risque_oaci,
            probabilite_risque:    er.probabilite_risque,
            gravite_risque:        er.gravite_risque,
            justification_risque_ia: er.justification_risque_ia,
            cellule_ia_suggeree:   er.cellule_ia_suggeree,
            statut:                'pac_attendu',
            delai_pac:             new Date(Date.now() + delais.pac * 86400000).toISOString(),
            delai_regularisation:  new Date(Date.now() + delais.regularisation * 86400000).toISOString(),
            inspecteur_ref_id:     surveillance.chef_id || '',
            created_at:            er.created_at || now,
            updated_at:            now,
          }

          // Ajouter au store local
          set((state: any) => ({ ecarts: [...state.ecarts, newEcart] }))

          // Persister dans Supabase
          const result = await datastore.createEcart(newEcart)
          if (result.error) {
            errors.push(`${newEcart.reference}: ${result.error}`)
            console.error('[reparerEcartsManquants] createEcart error:', result.error)
          } else {
            repaired++
          }
        }

        const msg = errors.length > 0
          ? `${repaired} écart(s) réparé(s). Erreurs: ${errors.join(', ')}`
          : `${repaired} écart(s) récupéré(s) et enregistré(s) en Supabase.`
        console.log('[reparerEcartsManquants]', msg)
        return { repaired, message: msg }
      },

      reparerEcartsTransmisPourAerodrome: async (aerodromeId) => {
        if (!aerodromeId) return { repaired: 0, surveillances: 0 }

        const surveillancesAReparer = get().surveillances.filter(s => {
          if (s.aerodrome_id !== aerodromeId) return false
          if (!['transmise', 'archivee'].includes(s.statut)) return false
          const aUnRapport = !!(s.rapport_html || s.rapport_fichier_url || s.rapport_sig_url)
          const aDesEcartsOfficiels = get().ecarts.some(e => e.surveillance_id === s.id)
          return aUnRapport && !aDesEcartsOfficiels
        })

        let repaired = 0
        for (const surveillance of surveillancesAReparer) {
          const result = await get().reparerEcartsManquants(surveillance.id)
          repaired += result.repaired
        }

        return { repaired, surveillances: surveillancesAReparer.length }
      },

      getProchaineEtape: (surveillance) => {
        const mapping: Record<Surveillance['statut'], { type: 'checklist' | 'ecarts' | 'rapport' | 'lettre' | 'transmission' | null; label: string }> = {
          'planifiee': { type: 'checklist', label: 'Démarrer la checklist' },
          'en_cours': { type: 'checklist', label: 'Continuer la checklist' },
          'checklist_signee': { type: 'ecarts', label: 'Rédiger les écarts' },
          'ecarts_signes': { type: 'rapport', label: 'Rédiger le rapport' },
          'rapport_signe': { type: 'lettre', label: 'Rédiger la lettre' },
          'lettre_signee': { type: 'transmission', label: 'Transmettre' },
          'transmise': { type: null, label: 'Terminée' },
          'archivee': { type: null, label: 'Archivée' }
        }
        return mapping[surveillance.statut]
      },
      
      peutPasserEtape: (surveillanceId) => {
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) return { peut: false, raison: 'Surveillance introuvable' }
        const items = get().checklistItems?.[surveillanceId] || []
        const ecarts = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
        const itemsNSNV = get().getItemsNSNV(surveillanceId)
        switch (surveillance.statut) {
          case 'planifiee': return { peut: true }
          case 'en_cours': {
            const progression = get().calculerProgression(surveillanceId)
            if (progression < 100) {
              return { peut: false, raison: `${100 - progression}% des items non renseignés` }
            }
            return { peut: true }
          }
          case 'checklist_signee': {
            if (itemsNSNV.length > 0 && ecarts.length === 0) {
              return { peut: false, raison: 'Des items NS/NV nécessitent la rédaction d\'écarts' }
            }
            return { peut: true }
          }
          case 'ecarts_signes': return { peut: true }
          case 'rapport_signe': {
            const signatures = surveillance.signatures_rapport || []
            if (signatures.length < surveillance.equipe_ids.length) {
              return { peut: false, raison: 'Tous les inspecteurs n\'ont pas signé' }
            }
            return { peut: true }
          }
          case 'lettre_signee': return { peut: surveillance.lettre_signee_url ? true : false }
          case 'transmise': {
            // Archivage possible quand tous les écarts sont clôturés
            const ecartsLies = get().ecarts.filter(e => e.surveillance_id === surveillanceId)
            if (ecartsLies.length > 0 && ecartsLies.some(e => e.statut !== 'cloture')) {
              return { peut: false, raison: 'Tous les écarts doivent être clôturés avant l\'archivage' }
            }
            return { peut: true }
          }
          default: return { peut: false }
        }
      },
      
      passerEtapeSuivante: async (surveillanceId) => {
        const { peut, raison } = get().peutPasserEtape(surveillanceId)
        if (!peut) {
          console.error('Impossible de passer à l\'étape suivante:', raison)
          return
        }
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) return
        const mappingStatut: Record<Surveillance['statut'], Surveillance['statut']> = {
          'planifiee': 'en_cours',
          'en_cours': 'checklist_signee',
          'checklist_signee': 'ecarts_signes',
          'ecarts_signes': 'rapport_signe',
          'rapport_signe': 'lettre_signee',
          'lettre_signee': 'transmise',
          'transmise': 'archivee',
          'archivee': 'archivee'
        }
        const nouveauStatut = mappingStatut[surveillance.statut]
        if (nouveauStatut) {
          if (nouveauStatut !== 'transmise') {
            await get().updateSurveillance(surveillanceId, { statut: nouveauStatut })
            return
          }

          // Quand la surveillance est transmise, convertir les ecartsRedaction en ecarts officiels puis basculer à pac_attendu
            const now = new Date().toISOString()
            // Lire depuis le store Zustand en priorité
            let ecartsRedaction = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
            // Fallback Supabase — si le store est vide (page rechargée entre la rédaction et la transmission)
            if (ecartsRedaction.length === 0) {
              console.log('[passerEtapeSuivante] ecartsRedaction vide en mémoire, chargement depuis Supabase...')
              ecartsRedaction = await datastore.fetchEcartsRedactionBySurveillance(surveillanceId)
              if (ecartsRedaction.length > 0) {
                // Remettre dans le store pour les prochains accès
                set((state: any) => ({
                  ecartsRedaction: [
                    ...state.ecartsRedaction.filter((e: any) => e.surveillance_id !== surveillanceId),
                    ...ecartsRedaction,
                  ],
                }))
              }
            }
            if (ecartsRedaction.length === 0) {
              ecartsRedaction = extractEcartsFromRapportHtml(surveillance) as EcartRedaction[]
              if (ecartsRedaction.length > 0) {
                console.log('[passerEtapeSuivante] Écarts reconstruits depuis le rapport signé')
              }
            }
            console.log(`[passerEtapeSuivante] ${ecartsRedaction.length} écarts(s) à convertir pour ${surveillanceId}`)
            
            // Convertir chaque ecartRedaction en ecart officiel
            for (const ecartRedaction of ecartsRedaction) {
              // Vérifier si l'écart existe déjà dans le tableau principal
              const ecartExistant = get().ecarts.find(e => e.id === ecartRedaction.id || e.reference === ecartRedaction.reference)
              
              if (!ecartExistant) {
                // Créer l'écart officiel dans le tableau principal
                // Garantir un UUID valide (les anciens ecartRedaction stockés en IndexedDB
                // pouvaient avoir un id au format "ecart-<ts>-<rand>" incompatible avec Supabase)
                const _isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                const ecartId = _isUUID.test(ecartRedaction.id) ? ecartRedaction.id : crypto.randomUUID()
                const newEcart: Ecart = {
                  id: ecartId,
                  aerodrome_id: surveillance.aerodrome_id,
                  surveillance_id: surveillanceId,
                  // Utiliser le domaine réel de l'écart (SGS, PHY, OLS…) ou fallback sur portée principale
                  domaine: ecartRedaction.domaine || surveillance.portee?.[0] || 'SGS',
                  reference: ecartRedaction.reference,
                  ref_reglementaire: ecartRedaction.ref_reglementaire,
                  libelle: ecartRedaction.libelle,
                  niveau_risque: ecartRedaction.niveau,
                  cellule_risque_oaci: ecartRedaction.cellule_risque_oaci,
                  probabilite_risque: ecartRedaction.probabilite_risque,
                  gravite_risque: ecartRedaction.gravite_risque,
                  justification_risque_ia: ecartRedaction.justification_risque_ia,
                  cellule_ia_suggeree: ecartRedaction.cellule_ia_suggeree,
                  statut: 'pac_attendu',
                  delai_pac: '',
                  delai_regularisation: '',
                  inspecteur_ref_id: surveillance.chef_id,
                  created_at: ecartRedaction.created_at,
                  updated_at: now,
                }

                // Calculer les délais selon le niveau de risque
                const delaisMap: Record<string, { pac: number; regularisation: number }> = {
                  'critique': { pac: 3, regularisation: 7 },
                  'eleve': { pac: 7, regularisation: 30 },
                  'moyen': { pac: 15, regularisation: 90 },
                  'faible': { pac: 30, regularisation: 180 },
                }
                const delais = delaisMap[ecartRedaction.niveau] || { pac: 15, regularisation: 90 }
                newEcart.delai_pac = new Date(Date.now() + delais.pac * 86400000).toISOString()
                newEcart.delai_regularisation = new Date(Date.now() + delais.regularisation * 86400000).toISOString()

                await get().addEcart(newEcart)

                // Notifier les operators
                const aerodrome = get().aerodromes.find(a => a.id === surveillance.aerodrome_id)
                const focalOperators = get().utilisateurs.filter(u => 
                  (u.role === 'focal_operator' || u.role === 'dg_operator') && 
                  u.aerodrome_id === surveillance.aerodrome_id
                )
                
                focalOperators.forEach(operator => {
                  get().addNotification({
                    user_id: operator.id,
                    type: 'warning',
                    title: 'Nouvel écart à traiter',
                    message: `Écart ${newEcart.reference} détecté lors de la surveillance ${surveillance.type}${aerodrome ? ` - ${aerodrome.code_oaci}` : ''}. Veuillez soumettre un PAC avant le ${new Date(newEcart.delai_pac).toLocaleDateString('fr-FR')}.`,
                    link: `/portail-exploitant/ecarts`,
                    canal: 'in_app'
                  })
                  
                  if (operator.notifications_email) {
                    fetch('/api/notifications/email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        to: operator.email,
                        subject: `SGDA - Écart ${newEcart.reference} - PAC requis`,
                        template: 'ecart-pac-requis',
                        data: {
                          reference: newEcart.reference,
                          aerodrome: aerodrome?.nom || '',
                          libelle: newEcart.libelle,
                          niveau: newEcart.niveau_risque,
                          delai: new Date(newEcart.delai_pac).toLocaleDateString('fr-FR'),
                          lien: `/portail-exploitant/ecarts`
                        }
                      })
                    })
                    .catch(error => console.error('[Notification] Erreur:', error))
                  }
                })
              } else if (ecartExistant.statut === 'ouvert') {
                // L'écart existe déjà mais est encore ouvert → basculer à pac_attendu
                await get().updateEcart(ecartExistant.id, { statut: 'pac_attendu' })
              }
            }

            // Aussi gérer les écarts déjà dans le tableau principal (cas legacy)
            const ecartsOuverts = get().ecarts.filter((e: Ecart) => 
              e.surveillance_id === surveillanceId && 
              e.statut === 'ouvert' &&
              !ecartsRedaction.some(er => er.id === e.id || er.reference === e.reference)
            )
            for (const ecart of ecartsOuverts) {
              await get().updateEcart(ecart.id, { statut: 'pac_attendu' })
            }

            await get().updateSurveillance(surveillanceId, { statut: nouveauStatut, transmitted_at: now })
        }
      },
      
      verifierAvantTransmission: (surveillanceId) => {
        const surveillance = get().surveillances.find(s => s.id === surveillanceId)
        if (!surveillance) {
          return {
            ok: false,
            checklistSignee: false,
            ecartsTraites: false,
            rapportSigne: false,
            lettreSigneeDG: false,
            manquants: ['Surveillance introuvable']
          }
        }
        const items = get().checklistItems?.[surveillanceId] || []
        const itemsNSNV = get().getItemsNSNV(surveillanceId)
        const ecarts = get().ecartsRedaction.filter(e => e.surveillance_id === surveillanceId)
        // La UI enregistre souvent une signature unique (tableau de taille 1) pour le signataire courant.
        // On valide donc sur l'existence d'au moins 1 signature, plutôt que sur (nombre signatures >= taille équipe).
        const checklistSignee = (surveillance.signatures_checklist?.length || 0) >= 1
        const ecartsTraites = itemsNSNV.length === ecarts.length
        const rapportSigne = (surveillance.signatures_rapport?.length || 0) >= 1
        const lettreSigneeDG = !!surveillance.lettre_signee_url
        const manquants: string[] = []
        if (!checklistSignee) manquants.push('Checklist non signée par toute l\'équipe')
        if (!ecartsTraites) manquants.push('Des écarts restent à traiter')
        if (!rapportSigne) manquants.push('Rapport non signé')
        if (!lettreSigneeDG) manquants.push('Lettre non signée par le DG')
        return {
          ok: checklistSignee && ecartsTraites && rapportSigne && lettreSigneeDG,
          checklistSignee,
          ecartsTraites,
          rapportSigne,
          lettreSigneeDG,
          manquants
        }
      },

      // ============================================================
      // RISQUE ANALYTICS SLICE (MODÈLES AVANCÉS)
      // ============================================================
      historiqueScores: {},
      predictionHistorique: [],
      actionOutcomes: [],
      changePoints: [],
      velocitySnapshots: [],
      stressHistory: [],
      proactiveAlerts: [],
      modelPerformances: [],

      addScoreHistoryPoint: (aerodromeId, point) => set((state) => {
        const existing = state.historiqueScores?.[aerodromeId] || []
        const exists = existing.some(p => p.date === point.date)
        if (exists) return state
        return {
          historiqueScores: {
            ...state.historiqueScores,
            [aerodromeId]: [...existing, point].sort((a, b) => 
              new Date(a.date).getTime() - new Date(b.date).getTime()
            )
          }
        }
      }),

      addPredictionHistory: (prediction) => set((state) => ({
        predictionHistorique: [...state.predictionHistorique, prediction]
      })),

      addActionOutcome: (outcome) => set((state) => ({
        actionOutcomes: [...state.actionOutcomes, outcome]
      })),

      addChangePoint: (changePoint) => set((state) => ({
        changePoints: [...state.changePoints, changePoint]
      })),

      addVelocitySnapshot: (snapshot) => set((state) => ({
        velocitySnapshots: [...state.velocitySnapshots, snapshot]
      })),

      addStressHistoryPoint: (point) => set((state) => ({
        stressHistory: [...state.stressHistory, point]
      })),

      addProactiveAlert: (alert) => set((state) => ({
        proactiveAlerts: [...state.proactiveAlerts, alert]
      })),

      acknowledgeProactiveAlert: (alertId) => set((state) => ({
        proactiveAlerts: state.proactiveAlerts.map(a => 
          a.id === alertId ? { ...a, acknowledged_at: new Date().toISOString() } : a
        )
      })),

      resolveAlert: (alertId) => set((state) => ({
        proactiveAlerts: state.proactiveAlerts.map(a => 
          a.id === alertId ? { ...a, resolved_at: new Date().toISOString() } : a
        )
      })),

      updateModelPerformance: (performance) => set((state) => {
        const existingIndex = state.modelPerformances.findIndex(m => m.model_name === performance.model_name)
        if (existingIndex >= 0) {
          const updated = [...state.modelPerformances]
          updated[existingIndex] = performance
          return { modelPerformances: updated }
        }
        return { modelPerformances: [...state.modelPerformances, performance] }
      }),

      getHistoricalScoresForAerodrome: (aerodromeId) => {
        return get().historiqueScores?.[aerodromeId] || []
      },

      getPredictionsForAerodrome: (aerodromeId) => {
        return get().predictionHistorique.filter(p => p.aerodrome_id === aerodromeId)
      },

      getActionsForAerodrome: (aerodromeId) => {
        return get().actionOutcomes.filter(a => a.aerodrome_id === aerodromeId)
      },

      computeEffectivenessScore: (aerodromeId) => {
        const actions = get().actionOutcomes.filter(a => a.aerodrome_id === aerodromeId && a.was_followed)
        if (actions.length === 0) return 50
        const avgEffectiveness = actions.reduce((sum, a) => sum + a.effectiveness, 0) / actions.length
        return Math.round(avgEffectiveness)
      },

      computeFullRiskProfile: async (aerodromeId) => {
        try {
          const state = get()
          const profil = state.profilsRisque?.[aerodromeId]
          if (!profil) return

          const historique = state.historiqueScores?.[aerodromeId] || []
          const ecartsAerodrome = state.ecarts.filter(e => e.aerodrome_id === aerodromeId)
          
          // Importer les modèles avancés
          const {
            computeVelocityMetrics,
            computeHawkesContagion,
            computeSystemStress,
            computeProactiveAlert,
            detectChangePoints
          } = await import('./risque')
          
          // Calculer les métriques avancées
          const velocityMetrics = computeVelocityMetrics(historique.map(h => ({ date: h.date, score: h.score })))
          const hawkes = computeHawkesContagion(ecartsAerodrome.map(e => ({ createdAt: e.created_at, niveau: e.niveau_risque })))
          const stress = computeSystemStress(profil, ecartsAerodrome, velocityMetrics)
          const proactiveAlert = computeProactiveAlert(profil, historique.map(h => ({ date: h.date, score: h.score })), hawkes)
          const changePoints = detectChangePoints(historique.map(h => ({ date: h.date, score: h.score })))
        
        // Stocker les snapshots
        state.addVelocitySnapshot({
          aerodrome_id: aerodromeId,
          captured_at: new Date().toISOString(),
          vitesse: velocityMetrics.vitesse,
          acceleration: velocityMetrics.acceleration,
          volatilite: velocityMetrics.volatilite,
          temps_avant_seuil_critique: velocityMetrics.tempsAvantSeuilCritique,
          niveau_vigilance: velocityMetrics.niveauVigilance
        })
        
        state.addStressHistoryPoint({
          aerodrome_id: aerodromeId,
          captured_at: new Date().toISOString(),
          stress_score: stress.score,
          niveau_stress: stress.niveauStress,
          facteurs: stress.facteursContributeurs
        })
        
        // Créer alerte proactive si nécessaire
        if (proactiveAlert.niveauUrgence !== 'info') {
          state.addProactiveAlert({
            id: crypto.randomUUID(),
            aerodrome_id: aerodromeId,
            created_at: new Date().toISOString(),
            niveau_urgence: proactiveAlert.niveauUrgence,
            probabilite_degradation_3m: proactiveAlert.probabiliteDegradation3m,
            probabilite_seuil30_3m: proactiveAlert.probabiliteSeuil30_3m,
            message_court: proactiveAlert.messageCourt,
            message_long: proactiveAlert.messageLong,
            action_suggerer: proactiveAlert.actionSuggerer,
            acknowledged_at: null,
            resolved_at: null
          })
        }
        
        // Ajouter les points de changement
        for (const cp of changePoints) {
          state.addChangePoint({
            id: crypto.randomUUID(),
            aerodrome_id: aerodromeId,
            detected_at: new Date().toISOString(),
            date_changement: cp.date,
            score_before: cp.scoreBefore,
            score_after: cp.scoreAfter,
            magnitude: cp.magnitude,
            direction: cp.direction,
            probable_cause: cp.probableCause || null,
            confirmed: false
          })
        }
        
        // Mettre à jour le profil avec les métriques avancées
        const profilAvance = {
          ...profil,
          velocity_metrics: {
            vitesse: velocityMetrics.vitesse,
            acceleration: velocityMetrics.acceleration,
            volatilite: velocityMetrics.volatilite,
            temps_avant_seuil_critique: velocityMetrics.tempsAvantSeuilCritique,
            niveau_vigilance: velocityMetrics.niveauVigilance
          },
          system_stress: {
            score: stress.score,
            niveau_stress: stress.niveauStress,
            facteurs_contributeurs: stress.facteursContributeurs,
            recommandation: stress.recommandationAction
          },
          proactive_alert: {
            niveau_urgence: proactiveAlert.niveauUrgence,
            probabilite_degradation_3m: proactiveAlert.probabiliteDegradation3m,
            probabilite_seuil30_3m: proactiveAlert.probabiliteSeuil30_3m,
            message_court: proactiveAlert.messageCourt,
            action_suggerer: proactiveAlert.actionSuggerer
          },
          hawkes_intensity: hawkes.currentIntensity,
          effectiveness_score: state.computeEffectivenessScore(aerodromeId),
          last_change_point: changePoints.length > 0 ? changePoints[0].date : profil.last_change_point
        }
        
        state.setProfilRisque(aerodromeId, profilAvance)
      } catch (error) {
        console.error('Erreur computeFullRiskProfile:', error)
        toast('error', 'Erreur calcul profil risque', `Aérodrome ${aerodromeId}`)
      }
      },

      // ============================================================
      // PAC LEARNING ENGINE SLICE
      // ============================================================

      pacFeedbacks: [],
      preuveFeedbacks: [],
      ponderationsCriteres: {
        pertinence: 1.0,
        exhaustivite: 1.0,
        precision: 1.0,
        specificite: 1.0,
        realisme: 1.0,
        coherence: 1.0,
      },
      ponderationsPriorisation: {
        score_critique: 30,
        tendance_baisse: 20,
        ecart_critique: 25,
        delai_expire: 25,
      },

      enregistrerFeedbackPAC: (
        ecartId, aerodromeId, contexte,
        criteresSuggere, criteresInspecteur,
        decisionSysteme, decisionInspecteur,
        utilite, commentaire
      ) => {
        const feedback = learningEnginePAC.enregistrerFeedbackPAC(
          ecartId, aerodromeId, contexte,
          criteresSuggere, criteresInspecteur,
          decisionSysteme, decisionInspecteur,
          utilite, commentaire
        );
        const stats = learningEnginePAC.getLearningStatsPAC();
        set((state) => ({
          pacFeedbacks: [feedback, ...state.pacFeedbacks],
          ponderationsCriteres: stats.ponderations_criteres ?? state.ponderationsCriteres,
          ponderationsPriorisation: stats.ponderations_priorisation ?? state.ponderationsPriorisation,
        }));
      },

      enregistrerFeedbackPreuves: (
        ecartId, aerodromeId, contexte,
        criteresSuggere, criteresInspecteur,
        decisionSysteme, decisionInspecteur,
        utilite, commentaire
      ) => {
        const feedback = learningEnginePAC.enregistrerFeedbackPreuves(
          ecartId, aerodromeId, contexte,
          criteresSuggere, criteresInspecteur,
          decisionSysteme, decisionInspecteur,
          utilite, commentaire
        );
        set((state) => ({
          preuveFeedbacks: [feedback, ...state.preuveFeedbacks],
        }));
      },

      getPACPriorite: (contexte) => {
        return learningEnginePAC.getPACPriorite(contexte);
      },

      getLearningStatsPAC: () => {
        return learningEnginePAC.getLearningStatsPAC();
      },

      // ============================================================
      // ADVANCED MODELS SLICE (Random Forest + Graph Network)
      // ============================================================
      getActiveEcarts: () => get().ecarts.filter((e: Ecart) => e.statut !== 'cloture'),
      getHawkesRiskForAerodrome: (aerodromeId) => {
        try {
          const ecartsAero = get().ecarts.filter((e: Ecart) => e.aerodrome_id === aerodromeId);
          const hawkesInput = ecartsAero.map((e: Ecart) => ({ createdAt: e.created_at, niveau: e.niveau_risque }));
          return risqueUtils.computeHawkesContagion(hawkesInput);
        }
        catch (e) { return { riskNext30Days: 50, currentIntensity: 0.5 }; }
      },
      getRecurrentPatterns: (aerodromeId) => {
        try {
          const ecartsAero = get().ecarts.filter(e => e.aerodrome_id === aerodromeId);
          return risqueUtils.detectChangePoints(ecartsAero.map(e => ({ date: e.date_detection || e.created_at, score: e.niveau_risque === 'critique' ? 90 : e.niveau_risque === 'eleve' ? 70 : e.niveau_risque === 'moyen' ? 50 : 30 })));
        } catch (e) { return []; }
      },
      getBanditRecommendation: (context) => {
        try { return risqueUtils.computeActionEffectiveness(context as unknown as { type: string; improvement: number; costDays: number }[]); }
        catch (e) { return null; }
      },
      updateBanditReward: (_context, _actionId, _reward) => {},
      getTransferPredictions: (_aerodromeId) => new Map(),
      ...createAdvancedModelsSlice(set, get),
    }),
    {
      storage: zustandIDBStorage,
      name: 'sgda-storage',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 3) return { aerodromes: [], utilisateurs: [], ecarts: [], profilsRisque: {}, historiqueScores: {}, proactiveAlerts: [] } as never
        return persistedState as never
      },
      partialize: (state) => ({
        // Données métier critiques — doivent survivre au rechargement
        aerodromes: state.aerodromes,
        surveillances: state.surveillances,
        ecarts: state.ecarts,
        ecartsRedaction: state.ecartsRedaction,
        historiqueEcarts: state.historiqueEcarts,
        utilisateurs: state.utilisateurs,
        profilsRisque: state.profilsRisque,
        certifications: state.certifications,
        homologations: state.homologations,
        exemptions: state.exemptions,
        plannings: state.plannings,
        propositionsN1: state.propositionsN1,
        dossiers: state.dossiers,
        formations: state.formations,
        inspecteurs: state.inspecteurs,
        evenements: state.evenements,
        enquetes: state.enquetes,
        codesAcces: state.codesAcces,
        registreEntries: state.registreEntries,
        delegations: state.delegations,
        alertesSecurite: state.alertesSecurite,
        fichesPresence: state.fichesPresence,
        kitDocuments: state.kitDocuments,
        masterChecklists: state.masterChecklists,
        // UI
        filters: state.filters,
        viewMode: state.viewMode,
        theme: state.theme,
        notifications: state.notifications,
        messages: state.messages,
        apiKeys: state.apiKeys,
        auditLogs: state.auditLogs,
      }),
      onRehydrateStorage: () => {
        let deferred = false
        return (state) => {
          if (!state) return
          useAppStore.setState({ _hydrated: true })
          if (!deferred) {
            deferred = true
            // Déférer la synchronisation ML après le rendu initial
            requestAnimationFrame(() => {
              syncLearningFromStore({
                learningFeedbacks: (state as any).learningFeedbacks || [],
                recalibrationAlerts: (state as any).recalibrationAlerts || [],
                currentModel: (state as any).currentModel || null,
              })
              syncPACFromStore({
                pacFeedbacks: (state as any).pacFeedbacks || [],
                preuveFeedbacks: (state as any).preuveFeedbacks || [],
                ponderationsCriteres: (state as any).ponderationsCriteres || {},
                ponderationsPriorisation: (state as any).ponderationsPriorisation || {},
              })
              if (typeof window !== 'undefined') {
                startScheduledLearningRecalibration(
                  () => ({ currentModel: (state as any).currentModel || null }),
                  (declencheur, initiePar) => {
                    const model = learningEngine.recalibrateModel(declencheur || 'auto', initiePar || 'system')
                    return model
                  }
                )
              }
            })
          }
        }
      },
    }
  )
)

// ============================================================
// Hooks utilitaires existants
// ============================================================

export const useAerodrome = (id: string) => {
  const aerodromes = useAppStore((state) => state.aerodromes)
  return aerodromes.find((a) => a.id === id)
}

export const useSurveillancesByAerodrome = (aerodromeId: string) => {
  const surveillances = useAppStore((state) => state.surveillances)
  return surveillances.filter((s) => s.aerodrome_id === aerodromeId)
}

export const useEcartsByAerodrome = (aerodromeId: string) => {
  const ecarts = useAppStore((state) => state.ecarts)
  return ecarts.filter((e) => e.aerodrome_id === aerodromeId)
}

export const useProfilRisque = (aerodromeId: string) => {
  const profilsRisque = useAppStore((state) => state.profilsRisque)
  return profilsRisque[aerodromeId]
}

export const useUnreadNotifications = () => {
  const notifications = useAppStore((state) => state.notifications)
  const unreadCount = useAppStore((state) => state.unreadCount)
  return {
    count: unreadCount,
    notifications: notifications.filter((n) => !n.read_at),
  }
}

export const useChecklistItems = (surveillanceId: string) => {
  const items = useAppStore((state) => state.checklistItems?.[surveillanceId] || [])
  return items
}

export const useProgressionChecklist = (surveillanceId: string) => {
  const calculerProgression = useAppStore((state) => state.calculerProgression)
  return calculerProgression(surveillanceId)
}

export const useItemsNSNV = (surveillanceId: string) => {
  const getItemsNSNV = useAppStore((state) => state.getItemsNSNV)
  return getItemsNSNV(surveillanceId)
}

export const useStatistiquesPAC = (aerodromeId?: string) => {
  const getStatistiquesPAC = useAppStore((state) => state.getStatistiquesPAC)
  return getStatistiquesPAC(aerodromeId)
}

// ============================================================
// NOUVEAUX HOOKS POUR MODÈLES AVANCÉS
// ============================================================

export const useHistoricalScores = (aerodromeId: string) => {
  const getHistoricalScoresForAerodrome = useAppStore((state) => state.getHistoricalScoresForAerodrome)
  return getHistoricalScoresForAerodrome(aerodromeId)
}

export const useVelocitySnapshots = (aerodromeId: string) => {
  const snapshots = useAppStore((state) => state.velocitySnapshots)
  return snapshots.filter(s => s.aerodrome_id === aerodromeId)
}

export const useStressHistory = (aerodromeId: string) => {
  const history = useAppStore((state) => state.stressHistory)
  return history.filter(h => h.aerodrome_id === aerodromeId)
}

export const useProactiveAlerts = (aerodromeId: string) => {
  const alerts = useAppStore((state) => state.proactiveAlerts)
  return alerts.filter(a => a.aerodrome_id === aerodromeId).sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export const useChangePoints = (aerodromeId: string) => {
  const changes = useAppStore((state) => state.changePoints)
  return changes.filter(c => c.aerodrome_id === aerodromeId)
}

export const useEffectivenessScore = (aerodromeId: string) => {
  const compute = useAppStore((state) => state.computeEffectivenessScore)
  return compute(aerodromeId)
}

// Timer pour vérifier les rappels toutes les heures
// Cleanup: call clearRappelsTimer() on component unmount to avoid leaks
let rappelsTimerId: ReturnType<typeof setInterval> | null = null
if (typeof window !== 'undefined') {
  rappelsTimerId = setInterval(() => {
    useAppStore.getState().verifierRappelsAutomatiques()
  }, 60 * 60 * 1000)
}
export const clearRappelsTimer = () => {
  if (rappelsTimerId !== null) {
    clearInterval(rappelsTimerId)
    rappelsTimerId = null
  }
}


// ============================================================
// NOUVEAUX HOOKS UTILITAIRES À AJOUTER
// ============================================================

// À ajouter après les hooks existants (vers la fin du fichier)

export const useDelegationsBySurveillance = (surveillanceId: string) => {
  const getDelegationsBySurveillance = useAppStore((state) => state.getDelegationsBySurveillance);
  return getDelegationsBySurveillance(surveillanceId);
};

export const useAlertesBySurveillance = (surveillanceId: string) => {
  const getAlertesBySurveillance = useAppStore((state) => state.getAlertesBySurveillance);
  return getAlertesBySurveillance(surveillanceId);
};

export const useAlertesActivesBySurveillance = (surveillanceId: string) => {
  const getAlertesActivesBySurveillance = useAppStore((state) => state.getAlertesActivesBySurveillance);
  return getAlertesActivesBySurveillance(surveillanceId);
};

export const useFichesBySurveillance = (surveillanceId: string) => {
  const getFichesBySurveillance = useAppStore((state) => state.getFichesBySurveillance);
  return getFichesBySurveillance(surveillanceId);
};

export const useRiskIndexFeedbacksByAerodrome = (aerodromeId: string) => {
  const getFeedbacksByAerodrome = useAppStore((state) => state.getFeedbacksByAerodrome);
  return getFeedbacksByAerodrome(aerodromeId);
};

// ============================================================
// 7. NOUVEAUX HOOKS UTILITAIRES À AJOUTER
// ============================================================

export const useDecisionChecklist = () => {
  const decision = useAppStore((state) => state.decisionChecklist);
  const determineChecklistType = useAppStore((state) => state.determineChecklistType);
  return { decision, determineChecklistType };
};

export const usePredictionForItem = (
  aerodrome_id: string,
  type_inspection: string,
  domaine: string,
  sous_domaine: string,
  sous_sous_domaine: string,
  item: { id: string; numero: string; point_verification: string },
  profil?: ProfilRisque
) => {
  const getPrediction = useAppStore((state) => state.getPredictionForItem);
  return getPrediction(aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item, profil);
};

export const useLearningAlerts = () => {
  const alerts = useAppStore((state) => state.getPendingAlerts())
  const acknowledge = useAppStore((state) => state.acknowledgeAlert)
  return { alerts, acknowledge }
}

export const useModelPerformance = () => {
  const performance = useAppStore((state) => state.calculatePerformance());
  const detailedStats = useAppStore((state) => state.getDetailedLearningStats());
  const recalibrate = useAppStore((state) => state.recalibrateModel);
  return { performance, detailedStats, recalibrate };
};

// ============================================================
// HOOKS PAC LEARNING ENGINE
// ============================================================

export const useLearningStatsPAC = () => {
  return useAppStore((state) => state.getLearningStatsPAC?.());
};

export const usePACPriorite = (contexte: PACLearningFeedback['contexte']) => {
  const getPriorite = useAppStore((state) => state.getPACPriorite);
  return getPriorite(contexte);
};

// ============================================================
// HOOKS EXEMPTIONS & ARCHIVAGE
// ============================================================

export const useExemptionsByParent = (parentId: string) => {
  const getExemptions = useAppStore((state) => state.getExemptionsByParent);
  return getExemptions(parentId);
};

export const useExemptionsByAerodrome = (aerodromeId: string) => {
  const exemptions = useAppStore((state) => state.exemptions);
  return exemptions.filter((e) => e.aerodrome_id === aerodromeId);
};

export const useCertificationsArchivees = () => {
  const certifications = useAppStore((state) => state.certifications);
  return certifications.filter((c) => c.statut_global === 'archive');
};

export const useHomologationsArchivees = () => {
  const homologations = useAppStore((state) => state.homologations);
  return homologations.filter((h) => h.statut_global === 'archive');
};

// Throttle pour les envois d'emails (max 1/30s par user)
const emailThrottle = new Map<string, number>()
