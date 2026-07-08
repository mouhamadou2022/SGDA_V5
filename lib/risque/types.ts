// lib/risque/types.ts
// Types partagés pour tous les modules risque avancé
// Normalisés pour être compatibles avec store.ts
// 0 style inline, 0 fetch direct

// ============================================================
// TYPES DE BASE (NORMALISÉS)
// ============================================================

export type NiveauProbabilite = 1 | 2 | 3 | 4 | 5
export type NiveauGravite = 'A' | 'B' | 'C' | 'D' | 'E'
export type NiveauRisque = 'critique' | 'eleve' | 'moyen' | 'faible' | 'tres_faible'
export type Tendance = 'hausse' | 'baisse' | 'stable'

// ============================================================
// TYPES POUR LA MATRICE OACI
// ============================================================

export interface CelluleMatrice {
  probabilite: NiveauProbabilite
  gravite: NiveauGravite
  niveau: NiveauRisque
  couleur: string
  intervalleConfiance: [number, number]
}

export interface RisqueDomaine {
  domaine: string
  sousDomaine?: string
  probabilite: NiveauProbabilite
  gravite: NiveauGravite
  niveau: NiveauRisque
  cellule: string
  confiance: number
  volatilite: number
  tendance: Tendance
}

export interface CalculProbabiliteParams {
  nbNS: number
  nbNV: number
  nbTotal: number
  nbEcarts: number
  nbIncidents: number
}

export interface CalculGraviteParams {
  nbEcartsCritiques: number
  nbEcartsEleves: number
  nbEcartsMoyens: number
  nbIncidentsGraves: number
}

// ============================================================
// TYPES POUR LES FACTEURS DÉCLENCHEURS ET AGGRAVANTS
// ============================================================

export type TypeTrigger = 
  | 'ecart_critique' 
  | 'delai_expire' 
  | 'incident' 
  | 'changement_exploitant' 
  | 'saison_pluies' 
  | 'post_inspection'

export type TypeAggravator = 
  | 'nc_recurrente' 
  | 'absence_barriere' 
  | 'surcharge' 
  | 'c1_bas' 
  | 'rotation_personnel' 
  | 'absence_formation' 
  | 'historique_incidents'

export interface FacteurDeclencheur {
  type: TypeTrigger
  actif: boolean
  poids: number
  description: string
  dateDetection?: string
}

export interface FacteurAggravant {
  type: TypeAggravator
  actif: boolean
  multiplicateur: number
  description: string
  preuve?: string
}

// ============================================================
// TYPES POUR LE MODÈLE BAYÉSIEN
// ============================================================

export interface PredictionBayesienne {
  posteriorProbability: number
  priorProbability: number
  likelihood: number
  credibleInterval: [number, number]
  estBlackSwan: boolean
  bayesFactor: number
}

// ============================================================
// TYPES POUR LES BARRIÈRES (BOW-TIE)
// ============================================================

export interface Barriere {
  id: string
  nom: string
  type: 'preventive' | 'corrective'
  efficace: boolean
  efficacite: number
  dernierTest?: string
  remarque?: string
}

export interface BowTieModele {
  id: string
  domaine: string
  danger: string
  defaillance: string
  scenario: string
  consequence: string
  barrieresPreventives: Barriere[]
  barrieresCorrectives: Barriere[]
  probabiliteResiduelle: number
  niveauRisqueResiduel: NiveauRisque
  lastAssessed: string
}

// ============================================================
// TYPES POUR LES SCÉNARIOS
// ============================================================

export type ScenarioType = 'optimiste' | 'pessimiste' | 'realiste' | 'catastrophe'

export interface Scenario {
  nom: ScenarioType
  description: string
  probabilite: number
  scoreProjecte: number
  intervalleConfiance: [number, number]
  actionsRecommandees: string[]
}

// ============================================================
// TYPES POUR LES RECOMMANDATIONS
// ============================================================

export interface Recommendation {
  id: string
  priorite: number
  type: 'surveillance' | 'action_immediate' | 'formation' | 'barriere'
  titre: string
  description: string
  domaineConcerne: string
  impactAttendu: number
  probabiliteSucces: number
  delaiEstimeJours: number
  sourceDonnees: string
}

// ============================================================
// TYPES POUR L'APPRENTISSAGE ET LA CALIBRATION
// ============================================================

export interface FeedbackInspecteur {
  id: string
  aerodrome_id: string
  domaine?: string
  type: 'prediction_3m' | 'prediction_6m' | 'alerte' | 'recommandation'
  valeurPredite: number
  valeurReelle: number
  erreur: number
  commentaire: string
  inspecteur_id: string
  createdAt: string
  submittedAt: string
}

export interface CorrectionModele {
  id: string
  modele: 'matrix' | 'bayesian' | 'triggers' | 'aggravators' | 'frequency'
  typeCorrection: 'seuil' | 'poids' | 'vraisemblance'
  ancienneValeur: number
  nouvelleValeur: number
  raison: string
  appliqueeLe: string
  appliqueePar: 'auto' | 'admin'
}

export interface MatricePerformance {
  mae3m: number | null
  mae6m: number | null
  biais3m: number | null
  biais6m: number | null
  coverage95: number | null
  derniereCalibration: string
  nbObservations: number
}

// ============================================================
// TYPES POUR LES MÉTRIQUES AVANCÉES
// ============================================================

export interface VelocityMetrics {
  vitesse: number
  acceleration: number
  volatilite: number
  tempsAvantSeuilCritique: number | null
  niveauVigilance: 'normal' | 'surveillance' | 'alerte' | 'critique'
}

export interface SystemStress {
  score: number
  niveauStress: 'faible' | 'modere' | 'eleve' | 'critique'
  facteursContributeurs: string[]
  recommandationAction: string
  stressIndicators: {
    velocityStress: number
    ecartsStress: number
    c4Stress: number
    resilienceStress: number
  }
}

export interface ProactiveAlert {
  niveauUrgence: 'info' | 'vigilance' | 'alerte' | 'critique'
  probabiliteDegradation3m: number
  probabiliteSeuil30_3m: number
  probabiliteSeuil30_6m: number
  messageCourt: string
  messageLong: string
  actionSuggerer: string
  delaiEstimeJours: number | null
}

// ============================================================
// TYPES POUR LES EXEMPTIONS ET MESURES
// ============================================================

// ExemptionImpact et C3AdjustmentResult sont définis dans lib/risque.ts (exportés)
// pour éviter la duplication. Importer depuis '@/lib/risque'.

// ============================================================
// TYPES POUR L'HISTORIQUE DES SCORES
// ============================================================

export interface ScoreHistoryPoint {
  date: string
  score: number
  c1?: number
  c2?: number
  c3?: number
  c4?: number
  c5?: number
}