// lib/config.ts
// SGDA V5 - Configuration centralisée
// Contient tous les seuils, rôles, permissions et configurations système
// 0 style inline, 0 fetch direct

// ============================================================
// RÔLES UTILISATEURS
// ============================================================

export const ROLES = [
  'admin',
  'inspector',
  'dg_anacim',
  'dg_operator',
  'focal_operator',
  'staff_operator',
  'guest'
] as const

export type Role = typeof ROLES[number]

export const ROLE_COLORS = {
  admin: { primary: '#1a237e', gradient: '#283593' },
  inspector: { primary: '#b45309', gradient: '#d97706' },
  dg_anacim: { primary: '#1b4332', gradient: '#166534' },
  dg_operator: { primary: '#065f46', gradient: '#047857' },
  focal_operator: { primary: '#0f766e', gradient: '#0d9488' },
  staff_operator: { primary: '#0d9488', gradient: '#14b8a6' },
  guest: { primary: '#475569', gradient: '#64748b' }
} as const

// ============================================================
// PERMISSIONS PAR MODULE
// ============================================================

export const PERMISSIONS = {
  admin: { all: true },
  
  inspector: {
    modules: [
      'dashboard', 'aerodromes', 'certification', 'homologation', 
      'planning', 'surveillance', 'registres', 'dossiers', 
      'formation', 'kit', 'evenements', 'enquetes', 'messagerie', 
      'risque', 'charge', 'plans-actions', 'ml-monitoring'
    ]
  },
  
  // DG ANACIM : vue stratégique nationale — pilotage et décision
  dg_anacim: {
    modules: [
      'dashboard',
      'dg-pilotage-securite',
      'dg-conformite-controle',
      'dg-decisions-impact',
    ],
  },
  
  // DG Exploitant : cockpit stratégique — pilotage, décision, impact
  dg_operator: {
    modules: [
      'dashboard',
      'aerodromes',
      'operator-situation-securite',
      'operator-conformite-echeances',
      'operator-impact-decisions',
      'operator-messagerie',
    ],
  },

  // Point Focal : interface opérationnelle avec ANACIM — toutes les actions en écriture
  focal_operator: {
    modules: [
      'dashboard', 'operator-dashboard',
      'aerodromes', 'risque',
      'operator-ecarts', 'operator-evenements',
      'operator-documentations', 'operator-enquetes', 'operator-messagerie',
      'operator-pac-consolide',
      'operator-planning',
      'operator-certification', 'operator-homologation',
    ],
  },

  // Personnel Exploitant : consultation + notifications événements
  staff_operator: {
    modules: [
      'dashboard', 'operator-dashboard',
      'risque',
      'operator-planning',
      'operator-evenements',
      'operator-documentations',
      'operator-certification', 'operator-homologation',
    ],
  },

  // Invité : consultation publique — aérodromes, statuts réglementaires, documentation
  guest: {
    modules: [
      'dashboard', 'guest-dashboard',
      'aerodromes',
      'certification', 'homologation',
      'dossiers',
    ],
  }
} as const

// ============================================================
// SEUILS DE RISQUE CENTRALISÉS (NORMALISÉS)
// ============================================================

export const RISK_THRESHOLDS = {
  EXCELLENT: { min: 80, max: 100, label: 'Excellent', niveau: 'faible', color: 'success', frequency: 1 },
  BON: { min: 60, max: 79, label: 'Bon', niveau: 'moyen', color: 'primary', frequency: 2 },
  MODERE: { min: 30, max: 59, label: 'Modéré', niveau: 'eleve', color: 'warning', frequency: 4 },
  CRITIQUE: { min: 0, max: 29, label: 'Critique', niveau: 'critique', color: 'danger', frequency: 12 }
} as const

export type NiveauRisqueGlobal = 'faible' | 'moyen' | 'eleve' | 'critique'
export type TendanceGlobale = 'hausse' | 'baisse' | 'stable'

// Helper pour obtenir le niveau à partir du score
export function getNiveauFromScore(score: number): NiveauRisqueGlobal {
  if (score >= 80) return 'faible'
  if (score >= 60) return 'moyen'
  if (score >= 30) return 'eleve'
  return 'critique'
}

// Helper pour obtenir le label à partir du score
export function getLabelFromScore(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Bon'
  if (score >= 30) return 'Modéré'
  return 'Critique'
}

// Helper pour obtenir la classe CSS du badge
export function getBadgeClassFromScore(score: number): string {
  if (score >= 80) return 'badge success'
  if (score >= 60) return 'badge primary'
  if (score >= 30) return 'badge warning'
  return 'badge danger'
}

// Helper pour obtenir la classe CSS de la progression
export function getProgressClassFromScore(score: number): string {
  if (score >= 80) return 'progress-faible'
  if (score >= 60) return 'progress-moyen'
  if (score >= 30) return 'progress-eleve'
  return 'progress-critique'
}

// Helper pour obtenir la fréquence recommandée
export function getRecommendedFrequency(score: number): number {
  if (score >= 80) return 1
  if (score >= 60) return 2
  if (score >= 30) return 4
  return 12
}

// ============================================================
// AUTRES CONFIGURATIONS
// ============================================================

export const REGIONS = [
  'Dakar', 'Thiès', 'Saint-Louis', 'Louga', 'Matam', 'Tambacounda',
  'Kédougou', 'Kolda', 'Sédhiou', 'Ziguinchor', 'Diourbel', 'Fatick',
  'Kaffrine', 'Kaolack'
] as const

export const SURVEILLANCE_TYPES = [
  'programmee',
  'inopinee',
  'speciale',
  'suivi_ecarts',
  'mise_oeuvre_pac',
  'certification',
  'homologation',
  'audit_complet',
  'urgence',
  'periodique',
  'inopine',
  'maintien'
] as const

export const SURVEILLANCE_DOMAINS = [
  { code: 'SGS', label: 'Système de Gestion de la Sécurité', ras14: 'Section 14.1' },
  { code: 'SLI', label: 'Sauvetage et Lutte contre l\'Incendie', ras14: 'Section 9.2' },
  { code: 'PHY', label: 'Caractéristiques Physiques', ras14: 'Section 3' },
  { code: 'OLS', label: 'Surface de Limitation d\'Obstacles', ras14: 'Section 4' },
  { code: 'RA', label: 'Risque Animalier', ras14: 'Section 9.4' },
  { code: 'ELEC', label: 'Réseaux Électriques', ras14: 'Section 5' },
  { code: 'MFP', label: 'Marques, Feux et Panneaux', ras14: 'Section 5.3' },
  { code: 'COP', label: 'Compétences Organisationnelles et Personnels', ras14: 'Personnel' },
  { code: 'OPS', label: 'Procédures Opérationnelles', ras14: 'Procédures' },
  { code: 'AGA', label: 'Aérodromes et Aides au Sol (Tous les domaines)', ras14: 'Complet' },
] as const

export const NIVEAUX_RISQUE_ECART = {
  critique: { label: 'Critique', color: 'danger', icone: 'Flame', delai_pac: 3, delai_regularisation: 7 },
  eleve: { label: 'Élevé', color: 'warning', icone: 'AlertOctagon', delai_pac: 7, delai_regularisation: 30 },
  moyen: { label: 'Moyen', color: 'primary', icone: 'AlertCircle', delai_pac: 15, delai_regularisation: 90 },
  faible: { label: 'Faible', color: 'success', icone: 'Info', delai_pac: 30, delai_regularisation: 180 }
} as const

export const STATUTS_ECART = {
  ouvert: { label: 'Ouvert', color: 'danger', etape: 1 },
  pac_attendu: { label: 'PAC Attendu', color: 'warning', etape: 2 },
  pac_soumis: { label: 'PAC Soumis', color: 'primary', etape: 3 },
  pac_refuse: { label: 'PAC Refusé', color: 'danger', etape: 3 },
  pac_accepte: { label: 'PAC Accepté', color: 'success', etape: 4 },
  preuves_soumises: { label: 'Preuves Soumises', color: 'primary', etape: 5 },
  preuves_evaluees: { label: 'Preuves Évaluées', color: 'warning', etape: 5 },
  en_retard: { label: 'En Retard', color: 'danger', etape: 0 },
  cloture: { label: 'Clôturé', color: 'success', etape: 6 }
} as const

export const TYPES_EVENEMENT = [
  'Émission lasers ou feux non aéronautiques',
  'Facteurs humains',
  'Non mise en oeuvre des procédures',
  'Travaux en cours sur l\'aire de mouvement',
  'Travaux de maintenance',
  'Marchandises dangereuses',
  'Avitaillement en carburant de l\'avion',
  'FOD',
  'Utilisation des matériels de piste (choc avion…)',
  'Placement et stationnement de l\'avion',
  'Mise en route des moteurs et/ou roulage non conformes',
  'Présence indésirable sur une aire',
  'Infrastructures inadaptées',
  'Défaillance des interfaces sol-bord (incompréhension, inadaptation des infos transmises,…)',
  'Contamination de la piste',
  'Incursion sur piste',
  'Souffle causé par un aéronef',
  'Événement lié à des travaux/maintenance sur ou à proximité d\'une piste',
  'Péril animalier',
  'Événement de sûreté pouvant avoir un impact sur la sécurité',
  'Autre, précisez'
] as const

export const GRAVITE_EVENEMENT = {
  LASERS: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  FACTEURS_HUMAINS: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 168, sms: false },
  NON_MISE_EN_OEUVRE_PROCEDURES: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  TRAVAUX_AIRE_MOUVEMENT: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 168, sms: false },
  TRAVAUX_MAINTENANCE: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 360, sms: false },
  MARCHANDISES_DANGEREUSES: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 48, sms: true },
  AVITAILLEMENT_CARBURANT: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  FOD: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 168, sms: false },
  UTILISATION_MATERIELS_PISTE: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  PLACEMENT_STATIONNEMENT: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 168, sms: false },
  MISE_EN_ROUTE_ROULAGE_NON_CONFORME: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  PRESENCE_INDESIRABLE: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  INFRASTRUCTURES_INADAPTEES: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 168, sms: false },
  DEFAILLANCE_INTERFACES_SOL_BORD: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  CONTAMINATION_PISTE: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: false },
  INCURSION_PISTE: { niveau: 'CRITIQUE', couleur: 'danger', delai_notification: 24, sms: true },
  SOUFFLE_AERONEF: { niveau: 'JAUNE', couleur: 'primary', delai_notification: 168, sms: false },
  TRAVAUX_PROXIMITE_PISTE: { niveau: 'CRITIQUE', couleur: 'danger', delai_notification: 24, sms: true },
  PERIL_ANIMALIER: { niveau: 'ORANGE', couleur: 'warning', delai_notification: 72, sms: true },
  SURETE_IMPACT_SECURITE: { niveau: 'CRITIQUE', couleur: 'danger', delai_notification: 24, sms: true },
  AUTRE: { niveau: 'BLEU', couleur: 'info', delai_notification: 720, sms: false }
} as const

export const TYPES_ENQUETE = [
  'Culture SGS',
  'Satisfaction',
  'Évaluation',
  'Suivi'
] as const

export const TYPES_QUESTION = [
  'texte_libre',
  'choix_unique',
  'choix_multiple',
  'likert_5',
  'note_10',
  'oui_non',
  'date'
] as const

export const CANAUX_MESSAGERIE = {
  INTERNE: 'interne',
  EXPLOITANT: 'exploitant'
} as const

// ============================================================
// CONFIGURATION DE L'APPRENTISSAGE
// ============================================================

export const LEARNING_CONFIG = {
  MAX_HISTORY_ITEMS: 20,
  CONFIDENCE_THRESHOLDS: {
    TRES_BONNE: 85,
    BONNE: 70,
    MOYENNE: 50,
    FAIBLE: 30,
  },
  ALERT_THRESHOLDS: {
    TAUX_ERREUR_CRITIQUE: 30,
    TAUX_ERREUR_ELEVE: 20,
    NB_FEEDBACKS_MIN: 10,
    DELAI_RECALIBRATION_JOURS: 30,
  },
  WEIGHTS: {
    HISTORIQUE_SA_CONSECUTIF: 40,
    HISTORIQUE_NS_CONSECUTIF: 35,
    TAUX_CONFORMITE_ELEVE: 25,
    TAUX_CONFORMITE_FAIBLE: 20,
    RECENCE: 15,
    STABILITE: 10,
    FEEDBACK_POSITIF: 5,
  }
} as const

// ============================================================
// CONFIGURATION DE LA MATRICE OACI
// ============================================================

export const MATRICE_CELLULES: Record<string, { niveau: NiveauRisqueGlobal; couleur: string }> = {
  '5A': { niveau: 'critique', couleur: 'bg-red-600' },
  '5B': { niveau: 'critique', couleur: 'bg-red-600' },
  '5C': { niveau: 'critique', couleur: 'bg-red-600' },
  '4A': { niveau: 'critique', couleur: 'bg-red-600' },
  '4B': { niveau: 'critique', couleur: 'bg-red-600' },
  '3A': { niveau: 'critique', couleur: 'bg-red-600' },
  '5D': { niveau: 'eleve', couleur: 'bg-orange-500' },
  '4C': { niveau: 'eleve', couleur: 'bg-orange-500' },
  '3B': { niveau: 'eleve', couleur: 'bg-orange-500' },
  '2A': { niveau: 'eleve', couleur: 'bg-orange-500' },
  '5E': { niveau: 'moyen', couleur: 'bg-yellow-500' },
  '4D': { niveau: 'moyen', couleur: 'bg-yellow-500' },
  '3C': { niveau: 'moyen', couleur: 'bg-yellow-500' },
  '2B': { niveau: 'moyen', couleur: 'bg-yellow-500' },
  '1A': { niveau: 'moyen', couleur: 'bg-yellow-500' },
}

export function getNiveauFromCellule(cellule: string): NiveauRisqueGlobal {
  return MATRICE_CELLULES[cellule]?.niveau || 'faible'
}

export function getCouleurFromCellule(cellule: string): string {
  return MATRICE_CELLULES[cellule]?.couleur || 'bg-green-500'
}

// ============================================================
// SEUILS DYNAMIQUES POUR RISQUE (AJOUT V5.1)
// ============================================================

/**
 * Configuration des seuils dynamiques basés sur le contexte
 * Ces seuils s'adaptent automatiquement selon le type d'aérodrome,
 * la saison, et les conditions opérationnelles
 */
export const DYNAMIC_THRESHOLDS = {
  // Seuil C4 (charge critique) ajustable selon le type d'aérodrome
  C4_SEUIL_BASE: 50,
  C4_SEUIL_INTERNATIONAL: 40, // Plus strict pour les aéroports internationaux
  C4_SEUIL_NATIONAL: 60,      // Plus flexible pour les aéroports nationaux
  
  // Seuil C2 (efficacité PAC) selon la criticité
  C2_SEUIL_EXCELLENT: 80,
  C2_SEUIL_BON: 60,
  C2_SEUIL_MODERE: 40,
  
  // Seuil de vélocité pour alertes
  VELOCITY_SEUIL_ALERT: -1.5,    // Points/mois
  VELOCITY_SEUIL_CRITIQUE: -2.5, // Points/mois
  
  // Seuil Hawkes pour contagion
  HAWKES_ALPHA_MAX: 0.67, // alpha/beta doit être < 1 pour stationnarité
  HAWKES_BETA_MIN: 0.5,   // Décroissance minimale
  
  // Seuil CUSUM pour détection de rupture
  CUSUM_SEUIL_DEFAUT: 5,
  CUSUM_DRIFT_AUTORISE: 0.5,
  
  // Seuil de stress système
  STRESS_SEUIL_FAIBLE: 30,
  STRESS_SEUIL_MODERE: 50,
  STRESS_SEUIL_ELEVE: 70,
  STRESS_SEUIL_CRITIQUE: 85,
  
  // Facteurs saisonniers (mois de la saison des pluies)
  SAISON_PLUIES_MOIS: [6, 7, 8] as const as unknown as number[],
  FACTEUR_SAISON_PLUIES: 1.25,
  
  // Seuil de confiance pour prédictions
  CONFIDENCE_SEUIL_FIABLE: 70,
  CONFIDENCE_SEUIL_MOYEN: 50,
  CONFIDENCE_SEUIL_FAIBLE: 30,
} as const

/**
 * Obtient le seuil C4 approprié selon le type d'aérodrome
 */
export function getC4Threshold(aerodromeType: 'international' | 'national'): number {
  return aerodromeType === 'international' 
    ? DYNAMIC_THRESHOLDS.C4_SEUIL_INTERNATIONAL 
    : DYNAMIC_THRESHOLDS.C4_SEUIL_NATIONAL
}

/**
 * Obtient le niveau de stress à partir d'un score
 */
export function getStressLevel(score: number): 'faible' | 'modere' | 'eleve' | 'critique' {
  if (score >= DYNAMIC_THRESHOLDS.STRESS_SEUIL_CRITIQUE) return 'critique'
  if (score >= DYNAMIC_THRESHOLDS.STRESS_SEUIL_ELEVE) return 'eleve'
  if (score >= DYNAMIC_THRESHOLDS.STRESS_SEUIL_MODERE) return 'modere'
  return 'faible'
}

/**
 * Flag production : évite d'utiliser les données mock en production
 * Passez NEXT_PUBLIC_IS_PRODUCTION=true dans l'environnement de production
 */
export const IS_PRODUCTION = process.env.NEXT_PUBLIC_IS_PRODUCTION === 'true'

/**
 * Vérifie si nous sommes en saison des pluies
 */
export function isSaisonPluies(date: Date = new Date()): boolean {
  const month = date.getMonth()
  return DYNAMIC_THRESHOLDS.SAISON_PLUIES_MOIS.includes(month)
}

/**
 * Obtient le facteur multiplicateur selon la saison
 */
export function getSaisonMultiplier(date: Date = new Date()): number {
  return isSaisonPluies(date) ? DYNAMIC_THRESHOLDS.FACTEUR_SAISON_PLUIES : 1.0
}
