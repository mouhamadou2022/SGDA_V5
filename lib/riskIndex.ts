// lib/riskIndex.ts
'use client';

import { ProfilRisque, Ecart } from './store';
import { getRiskLevelFromCell } from './risque';
import { iaStorage } from '@/lib/persistence/iaStorage';

// Types
export type NiveauProbabilite = 1 | 2 | 3 | 4 | 5;
export type NiveauGravite = 'A' | 'B' | 'C' | 'D' | 'E';
export type NiveauRisqueGlobal = 'critique' | 'eleve' | 'moyen' | 'faible';

export interface RiskIndex {
  probabilite: NiveauProbabilite;
  gravite: NiveauGravite;
  niveau: NiveauRisqueGlobal;
  cellule: string;
  score: number;
  confidence: number;
  volatilite: number;
  tendance: 'hausse' | 'baisse' | 'stable';
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
  suggestion_systeme: RiskIndex;
  choix_inspecteur: RiskIndex;
  ecart: number;
  commentaire?: string;
}

export interface LearningModel {
  version: number;
  last_calibrated: string;
  thresholds: {
    c4_critique: number;
    c4_eleve: number;
    velocity_critique: number;
    velocity_eleve: number;
    nb_ecarts_critique: number;
    nb_ecarts_eleve: number;
  };
  adjustments: {
    probabilite_offset: Record<string, number>;
    gravite_offset: Record<string, number>;
  };
  observations_count: number;
}

// Configuration des cellules de la matrice OACI — utilise le mapping canonical de lib/risque
function getNiveauFromCellule(cellule: string): NiveauRisqueGlobal {
  const niveau = getRiskLevelFromCell(cellule);
  // Mapper 'tres_faible' → 'faible' pour la compatibilité avec NiveauRisqueGlobal (4 niveaux)
  return (niveau === 'tres_faible' ? 'faible' : niveau) as NiveauRisqueGlobal;
}

// Modèle d'apprentissage par défaut
const DEFAULT_LEARNING_MODEL: LearningModel = {
  version: 1,
  last_calibrated: new Date().toISOString(),
  thresholds: {
    c4_critique: 30,
    c4_eleve: 50,
    velocity_critique: -2.5,
    velocity_eleve: -1.5,
    nb_ecarts_critique: 2,
    nb_ecarts_eleve: 1,
  },
  adjustments: {
    probabilite_offset: {},
    gravite_offset: {},
  },
  observations_count: 0,
};

// Stockage des feedbacks pour l'apprentissage — persisté en IDB
let feedbacksStore: RiskIndexFeedback[] = [];
let learningModel: LearningModel = { ...DEFAULT_LEARNING_MODEL };
let riskIndexReady = false;

/** Charger feedbacks + modèle depuis IDB (appelé au démarrage) */
export async function initRiskIndexFromIDB(): Promise<void> {
  try {
    const stored = await iaStorage.get<RiskIndexFeedback[]>('feedbacks', 'risk_index_feedbacks');
    if (stored && stored.length > 0) feedbacksStore = stored;
    const model = await iaStorage.get<LearningModel>('feedbacks', 'risk_index_learning_model');
    if (model) learningModel = model;
  } catch { /* best effort */ }
  riskIndexReady = true;
}

function persistRiskIndex(): void {
  if (!riskIndexReady) return;
  try {
    iaStorage.set('feedbacks', 'risk_index_feedbacks', feedbacksStore.slice(-200).map(sanitizeFeedback));
    iaStorage.set('feedbacks', 'risk_index_learning_model', learningModel);
  } catch { /* best effort */ }
}

/**
 * Assainir un feedback avant persistance : ne conserver que des primitives
 * numériques/chaînes valides. Empêche qu'un objet non-clonable (ex. un
 * PointerEvent leaked par un handler React) ne fasse échouer structuredClone
 * d'indexedDB et ne corrompe le modèle d'apprentissage.
 */
function sanitizeFeedback<T extends RiskIndexFeedback>(fb: T): T {
  const num = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : fallback;
  const char = (v: unknown, fallback: string): string =>
    typeof v === 'string' && /^[A-E]$/.test(v.toUpperCase()) ? v.toUpperCase() : fallback;

  const riskIndex = (r: unknown): RiskIndex => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    return {
      probabilite: (num(o.probabilite) as NiveauProbabilite),
      gravite: char(o.gravite, 'C') as NiveauGravite,
      niveau: str(o.niveau, 'faible') as NiveauRisqueGlobal,
      cellule: str(o.cellule),
      score: num(o.score),
      confidence: num(o.confidence),
      volatilite: num(o.volatilite),
      tendance: (str(o.tendance, 'stable') as RiskIndex['tendance']),
    };
  };

  return {
    id: str((fb as any).id),
    aerodrome_id: str((fb as any).aerodrome_id),
    date: str((fb as any).date),
    contexte: {
      score_global: num(fb.contexte?.score_global),
      c1: num(fb.contexte?.c1),
      c2: num(fb.contexte?.c2),
      c3: num(fb.contexte?.c3),
      c4: num(fb.contexte?.c4),
      c5: num(fb.contexte?.c5),
      velocity: num(fb.contexte?.velocity),
      nb_ecarts_critiques: num(fb.contexte?.nb_ecarts_critiques),
      nb_nv: num(fb.contexte?.nb_nv),
      nb_ns: num(fb.contexte?.nb_ns),
    },
    suggestion_systeme: riskIndex(fb.suggestion_systeme),
    choix_inspecteur: riskIndex(fb.choix_inspecteur),
    ecart: num((fb as any).ecart),
    commentaire: (fb as any).commentaire != null ? String((fb as any).commentaire) : undefined,
  } as unknown as T;
}

/** Accès public au modèle d'apprentissage (lecture seule) */
export function getLearningModel(): LearningModel {
  return learningModel;
}

/**
 * Calculer le niveau de probabilité basé sur le profil de risque
 */
export function computeProbabilityLevel(
  profil: ProfilRisque,
  nbEcartsCritiques: number = 0,
  nbNS: number = 0,
  nbNV: number = 0
): NiveauProbabilite {
  let score = 0;

  // Score basé sur le score global
  if (profil.score_global < 30) score += 0.8;
  else if (profil.score_global < 50) score += 0.6;
  else if (profil.score_global < 70) score += 0.4;
  else score += 0.2;

  // Score basé sur C4 (charge critique)
  if (profil.c4 < learningModel.thresholds.c4_critique) score += 0.3;
  else if (profil.c4 < learningModel.thresholds.c4_eleve) score += 0.2;
  else score += 0.1;

  // Score basé sur la vélocité
  const velocity = profil.velocity_metrics?.vitesse || 0;
  if (velocity < learningModel.thresholds.velocity_critique) score += 0.3;
  else if (velocity < learningModel.thresholds.velocity_eleve) score += 0.2;
  else if (velocity < 0) score += 0.1;

  // Score basé sur les écarts critiques
  if (nbEcartsCritiques >= learningModel.thresholds.nb_ecarts_critique) score += 0.3;
  else if (nbEcartsCritiques >= learningModel.thresholds.nb_ecarts_eleve) score += 0.2;

  // Score basé sur NS/NV
  const totalNSNV = nbNS + nbNV;
  if (totalNSNV > 10) score += 0.3;
  else if (totalNSNV > 5) score += 0.2;
  else if (totalNSNV > 2) score += 0.1;

  // Appliquer les ajustements du modèle d'apprentissage
  const profilKey = getProfilKey(profil);
  const offset = learningModel.adjustments.probabilite_offset[profilKey] || 0;
  score = Math.min(0.95, Math.max(0.05, score + offset));

  // Conversion en niveau 1-5
  if (score >= 0.8) return 5;
  if (score >= 0.6) return 4;
  if (score >= 0.4) return 3;
  if (score >= 0.2) return 2;
  return 1;
}

/**
 * Calculer le niveau de gravité basé sur le profil de risque
 */
export function computeGravityLevel(
  profil: ProfilRisque,
  nbEcartsCritiques: number = 0,
  nbEcartsEleves: number = 0,
  nbIncidentsGraves: number = 0
): NiveauGravite {
  let scoreMax = 0;

  // Incidents graves
  if (nbIncidentsGraves > 0) scoreMax = Math.max(scoreMax, 5);

  // Écarts critiques
  if (nbEcartsCritiques > 0) scoreMax = Math.max(scoreMax, 4);
  if (nbEcartsCritiques > 2) scoreMax = Math.max(scoreMax, 5);

  // Écarts élevés
  if (nbEcartsEleves > 2) scoreMax = Math.max(scoreMax, 3);
  if (nbEcartsEleves > 4) scoreMax = Math.max(scoreMax, 4);

  // Score global
  if (profil.score_global < 30) scoreMax = Math.max(scoreMax, 4);
  if (profil.score_global < 20) scoreMax = Math.max(scoreMax, 5);

  // C4 critique
  if (profil.c4 < 30) scoreMax = Math.max(scoreMax, 3);
  if (profil.c4 < 20) scoreMax = Math.max(scoreMax, 4);

  // Appliquer les ajustements du modèle d'apprentissage
  const profilKey = getProfilKey(profil);
  const offset = learningModel.adjustments.gravite_offset[profilKey] || 0;
  let adjustedMax = scoreMax + offset;
  adjustedMax = Math.min(5, Math.max(1, adjustedMax));

  const mapping: Record<number, NiveauGravite> = {
    5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E',
  };
  return mapping[adjustedMax];
}

/**
 * Obtenir le niveau de risque global à partir de la cellule
 */
export function getRiskLevelFromCellIdx(cellule: string): NiveauRisqueGlobal {
  return getRiskLevelFromCell(cellule) as NiveauRisqueGlobal;
}

/**
 * Obtenir la couleur de cellule pour l'affichage
 */
export function getCellColor(cellule: string): string {
  const niveau = getRiskLevelFromCell(cellule);
  switch (niveau) {
    case 'critique': return 'bg-red-600 text-white';
    case 'eleve': return 'bg-orange-500 text-white';
    case 'moyen': return 'bg-yellow-500 text-black';
    default: return 'bg-green-500 text-white';
  }
}

/**
 * Calculer l'indice de risque complet
 */
export function computeRiskIndex(
  profil: ProfilRisque,
  options?: {
    nbEcartsCritiques?: number;
    nbEcartsEleves?: number;
    nbNS?: number;
    nbNV?: number;
    nbIncidentsGraves?: number;
    typeAeroport?: 'international' | 'national';
  }
): RiskIndex {
  const nbEcartsCritiques = options?.nbEcartsCritiques || 0;
  const nbEcartsEleves = options?.nbEcartsEleves || 0;
  const nbNS = options?.nbNS || 0;
  const nbNV = options?.nbNV || 0;
  const nbIncidentsGraves = options?.nbIncidentsGraves || 0;

  const probabilite = computeProbabilityLevel(profil, nbEcartsCritiques, nbNS, nbNV);
  const gravite = computeGravityLevel(profil, nbEcartsCritiques, nbEcartsEleves, nbIncidentsGraves);
  const cellule = `${probabilite}${gravite}`;
  const niveau = getNiveauFromCellule(cellule);

  // Calcul du score (0-100)
  let score = 100;
  if (niveau === 'critique') score = 20;
  else if (niveau === 'eleve') score = 45;
  else if (niveau === 'moyen') score = 65;
  else score = 85;

  // Ajustement du score basé sur la tendance
  const velocity = profil.velocity_metrics?.vitesse || 0;
  if (velocity < -1.5) score -= 15;
  else if (velocity < -0.5) score -= 8;
  else if (velocity > 1) score += 8;
  else if (velocity > 0.5) score += 4;

  // Score final borné
  score = Math.min(100, Math.max(0, score));

  // Calcul de la confiance
  let confidence = 70;
  if (nbNS + nbNV > 20) confidence = 85;
  else if (nbNS + nbNV > 10) confidence = 75;
  else if (nbNS + nbNV === 0) confidence = 50;

  // Volatilité (variance des derniers scores)
  let volatilite = 15;
  if (profil.velocity_metrics?.volatilite) {
    volatilite = Math.min(50, Math.round(profil.velocity_metrics.volatilite));
  }

  // Tendance
  let tendance: 'hausse' | 'baisse' | 'stable' = 'stable';
  if (velocity < -0.5) tendance = 'baisse';
  else if (velocity > 0.5) tendance = 'hausse';

  return {
    probabilite,
    gravite,
    niveau,
    cellule,
    score,
    confidence,
    volatilite,
    tendance,
  };
}

/**
 * Générer une clé unique pour le profil (utilisée pour l'apprentissage)
 */
function getProfilKey(profil: ProfilRisque): string {
  const scoreBucket = Math.floor(profil.score_global / 10) * 10;
  const c4Bucket = Math.floor(profil.c4 / 10) * 10;
  const tendance = profil.tendance;
  return `${scoreBucket}_${c4Bucket}_${tendance}`;
}

/**
 * Enregistrer le feedback de l'inspecteur pour l'apprentissage
 */
export function recordRiskIndexFeedback(
  aerodromeId: string,
  contexte: RiskIndexFeedback['contexte'],
  suggestionSysteme: RiskIndex,
  choixInspecteur: RiskIndex,
  commentaire?: string
): RiskIndexFeedback {
  const feedback: RiskIndexFeedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    aerodrome_id: aerodromeId,
    date: new Date().toISOString(),
    contexte,
    suggestion_systeme: suggestionSysteme,
    choix_inspecteur: choixInspecteur,
    ecart: Math.abs(
      (suggestionSysteme.probabilite - choixInspecteur.probabilite) +
      (suggestionSysteme.gravite.charCodeAt(0) - choixInspecteur.gravite.charCodeAt(0))
    ),
    commentaire,
  };

  feedbacksStore.push(feedback);

  // Persister en IDB
  persistRiskIndex();

  // Mettre à jour le modèle d'apprentissage après suffisamment d'observations
  if (feedbacksStore.length >= 10 && feedbacksStore.length % 5 === 0) {
    calibrateLearningModel();
  }

  return feedback;
}

/**
 * Calibrer le modèle d'apprentissage basé sur les feedbacks
 */
export function calibrateLearningModel(): LearningModel {
  if (feedbacksStore.length < 10) return learningModel;

  // Analyser les écarts par type de profil
  const adjustmentsByKey: Record<string, { prob: number[]; grav: number[] }> = {};

  for (const fb of feedbacksStore) {
    const key = getProfilKeyFromContext(fb.contexte);
    if (!adjustmentsByKey[key]) {
      adjustmentsByKey[key] = { prob: [], grav: [] };
    }
    adjustmentsByKey[key].prob.push(fb.choix_inspecteur.probabilite - fb.suggestion_systeme.probabilite);
    adjustmentsByKey[key].grav.push(
      fb.choix_inspecteur.gravite.charCodeAt(0) - fb.suggestion_systeme.gravite.charCodeAt(0)
    );
  }

  // Calculer la médiane des ajustements
  const probabiliteOffset: Record<string, number> = {};
  const graviteOffset: Record<string, number> = {};

  for (const [key, values] of Object.entries(adjustmentsByKey)) {
    if (values.prob.length >= 3) {
      probabiliteOffset[key] = median(values.prob);
    }
    if (values.grav.length >= 3) {
      graviteOffset[key] = median(values.grav);
    }
  }

  // Mettre à jour le modèle
  learningModel = {
    ...learningModel,
    version: learningModel.version + 1,
    last_calibrated: new Date().toISOString(),
    adjustments: {
      probabilite_offset: probabiliteOffset,
      gravite_offset: graviteOffset,
    },
    observations_count: feedbacksStore.length,
  };

  // Persister le modèle mis à jour
  persistRiskIndex();

  return learningModel;
}

/**
 * Calculer la médiane d'un tableau de nombres
 */
function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Générer une clé à partir du contexte
 */
function getProfilKeyFromContext(contexte: RiskIndexFeedback['contexte']): string {
  const scoreBucket = Math.floor(contexte.score_global / 10) * 10;
  const c4Bucket = Math.floor(contexte.c4 / 10) * 10;
  return `${scoreBucket}_${c4Bucket}`;
}

/**
 * Obtenir les statistiques d'apprentissage
 */
export function getLearningStats(): {
  totalFeedbacks: number;
  modelVersion: number;
  lastCalibrated: string;
  adjustmentsCount: number;
} {
  return {
    totalFeedbacks: feedbacksStore.length,
    modelVersion: learningModel.version,
    lastCalibrated: learningModel.last_calibrated,
    adjustmentsCount: Object.keys(learningModel.adjustments.probabilite_offset).length,
  };
}

/**
 * Réinitialiser le modèle d'apprentissage
 */
export function resetLearningModel(): void {
  feedbacksStore = [];
  learningModel = { ...DEFAULT_LEARNING_MODEL };
}

/**
 * Obtenir les feedbacks pour un aérodrome
 */
export function getFeedbacksForAerodrome(aerodromeId: string): RiskIndexFeedback[] {
  return feedbacksStore.filter(f => f.aerodrome_id === aerodromeId);
}

/**
 * Obtenir les N dernières corrections d'indice (où inspecteur a modifié la suggestion)
 * Utile pour injecter des exemples few-shot dans les prompts IA
 */
export function getRecentCorrections(limit: number = 5): Array<{
  itemsNS: number
  itemsNV: number
  scoreGlobal: number
  suggestionCellule: string
  correctionCellule: string
}> {
  return feedbacksStore
    .filter(f => f.ecart > 0) // Seulement les cas où inspecteur a corrigé
    .slice(-limit)
    .map(f => ({
      itemsNS: f.contexte.nb_ns,
      itemsNV: f.contexte.nb_nv,
      scoreGlobal: f.contexte.score_global,
      suggestionCellule: f.suggestion_systeme.cellule,
      correctionCellule: f.choix_inspecteur.cellule,
    }));
}

/**
 * Suggérer un indice de risque avec justification
 */
export function suggestRiskIndexWithJustification(
  profil: ProfilRisque,
  options?: {
    nbEcartsCritiques?: number;
    nbEcartsEleves?: number;
    nbNS?: number;
    nbNV?: number;
    nbIncidentsGraves?: number;
    typeAeroport?: 'international' | 'national';
  }
): {
  riskIndex: RiskIndex;
  justification: string[];
  suggestionAcceptee?: boolean;
} {
  const riskIndex = computeRiskIndex(profil, options);
  const justification: string[] = [];

  // Justifications
  if (profil.score_global < 30) {
    justification.push(`Score global critique (${profil.score_global}/100) → risque élevé`);
  } else if (profil.score_global < 50) {
    justification.push(`Score global faible (${profil.score_global}/100) → risque modéré à élevé`);
  }

  if (profil.c4 < 30) {
    justification.push(`Charge critique élevée (C4=${profil.c4}/100) → impact sur la gravité`);
  } else if (profil.c4 < 50) {
    justification.push(`Charge critique modérée (C4=${profil.c4}/100)`);
  }

  const velocity = profil.velocity_metrics?.vitesse || 0;
  if (velocity < -2) {
    justification.push(`Dégradation rapide (${Math.abs(velocity).toFixed(1)} pts/mois) → augmentation de la probabilité`);
  } else if (velocity < -1) {
    justification.push(`Dégradation modérée (${Math.abs(velocity).toFixed(1)} pts/mois)`);
  }

  const nbEcartsCritiques = options?.nbEcartsCritiques || 0;
  if (nbEcartsCritiques > 0) {
    justification.push(`${nbEcartsCritiques} écart(s) critique(s) actif(s) → augmentation de la gravité`);
  }

  const nbNSNV = (options?.nbNS || 0) + (options?.nbNV || 0);
  if (nbNSNV > 10) {
    justification.push(`${nbNSNV} items NS/NV → probabilité élevée de non-conformités`);
  } else if (nbNSNV > 5) {
    justification.push(`${nbNSNV} items NS/NV`);
  }

  justification.push(`Cellule matrice: ${riskIndex.cellule} → ${riskIndex.niveau.toUpperCase()}`);

  return { riskIndex, justification };
}

/**
 * Exporter les fonctions utilitaires
 */
export const riskIndexUtils = {
  computeProbabilityLevel,
  computeGravityLevel,
  getRiskLevelFromCell,
  getCellColor,
  computeRiskIndex,
  recordRiskIndexFeedback,
  calibrateLearningModel,
  getLearningStats,
  resetLearningModel,
  getFeedbacksForAerodrome,
  suggestRiskIndexWithJustification,
};