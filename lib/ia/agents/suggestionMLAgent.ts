// lib/ia/agents/suggestionMLAgent.ts
// Agent ML pour la recommandation de type de surveillance
// Modèle Bayésien avec apprentissage en ligne (online learning)
// Combine scoring pondéré + feedback loop pour améliorer les prédictions

import type { Ecart, ProfilRisque, SuggestionFeedback, Surveillance } from '@/lib/store';
import { iaStorage } from '@/lib/persistence/iaStorage';

// ============================================================
// TYPES
// ============================================================

export type SurveillanceType = 'mise_oeuvre_pac' | 'suivi_ecarts' | 'audit_complet' | 'programmee' | 'incident_critique' | 'incident_majeur';

export type IncidentType = 'incident_critique' | 'incident_majeur' | 'aucun_incident';

export interface MLFeatures {
  scoreGlobal: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  tendance: number;
  celluleOACI: number;
  probabilite: number;
  gravite: number;
  joursRetard: number;
  joursAvantEcheance: number;
  nbEcartsActifs: number;
  nbEcartsCritiques: number;
  nbEcartsEleves: number;
  hasPAC: boolean;
  pacActionsCount: number;
  pacFichiersCount: number;
  statutCycle: number;
  feedbackCount: number;
  feedbackAccuracy: number;
  historiqueNS: number;
  historiqueSA: number;
  saisonPluie: boolean;
  joursDernierEvenement: number;
  eventFrequency: number;
}

export interface MLPrediction {
  type: SurveillanceType;
  confiance: number;
  scoreSuiviEcarts: number;
  scoreMiseOeuvrePac: number;
  scoreAuditComplet: number;
  featuresImportantes: string[];
  estML: boolean;
  fallbackRuleBased: boolean;
  recommandation: string;
}

export interface MLModelWeights {
  version: number;
  updated_at: string;
  weights: Record<string, number>;
  biases: Record<string, number>;
  learning_rate: number;
  total_feedbacks: number;
  accuracy_history: number[];
  aerodrome_specific: Record<string, Record<string, number>>;
}

// ============================================================
// CONSTANTES
// ============================================================

const MIN_FEEDBACKS_FOR_ML = 5;
const DEFAULT_LEARNING_RATE = 0.05;
const WEIGHT_DECAY = 0.001;
const CONFIDENCE_THRESHOLD = 0.6;

const STATUT_CYCLE_MAP: Record<string, number> = {
  'ouvert': 0,
  'pac_attendu': 1,
  'pac_soumis': 2,
  'pac_refuse': 3,
  'pac_accepte': 4,
  'preuves_soumises': 5,
  'preuves_evaluees': 6,
  'cloture': 7,
};

const TENDANCE_MAP: Record<string, number> = {
  'hausse': 1,
  'stable': 0,
  'baisse': -1,
};

// ============================================================
// POIDS PAR DÉFAUT (initialisés par règles métier)
// ============================================================

const DEFAULT_WEIGHTS: Record<string, number> = {
  w_c2: 0.25,
  w_score_global: 0.15,
  w_cellule_oaci: 0.20,
  w_jours_retard: 0.15,
  w_statut_cycle: 0.10,
  w_tendance: 0.05,
  w_c4: 0.05,
  w_has_pac: 0.03,
  w_pac_actions: 0.02,
};

const DEFAULT_BIASES: Record<string, number> = {
  bias_suivi_ecarts: 0.3,
  bias_mise_oeuvre_pac: 0.1,
  bias_audit_complet: -0.2,
  bias_programmee: -0.4,
};

// ============================================================
// STOCKAGE DURABLE DES MODÈLES (IndexedDB + Supabase)
// ============================================================

const ML_STORAGE_KEY = 'sgda_ml_model_weights';

type SyncModelCallback = (model: MLModelWeights) => void

let syncCallback: SyncModelCallback | null = null

let cachedModel: MLModelWeights | null = null

export function onSyncModel(callback: SyncModelCallback) {
  syncCallback = callback
}

export function initModelFromSupabase(model: MLModelWeights) {
  if (!model) return
  const existing = cachedModel || loadModelDefaults()
  if (model.total_feedbacks > existing.total_feedbacks) {
    cachedModel = model
    saveModelWeights(model)
  }
}

function loadModelDefaults(): MLModelWeights {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    weights: { ...DEFAULT_WEIGHTS },
    biases: { ...DEFAULT_BIASES },
    learning_rate: DEFAULT_LEARNING_RATE,
    total_feedbacks: 0,
    accuracy_history: [],
    aerodrome_specific: {},
  }
}

function loadModelWeights(): MLModelWeights {
  if (cachedModel) return cachedModel
  if (typeof window === 'undefined') return loadModelDefaults()
  // Déclenche un chargement async depuis IndexedDB (cache en mémoire par la suite)
  iaStorage.get<MLModelWeights>('ml_weights', ML_STORAGE_KEY).then(stored => {
    if (stored) cachedModel = stored
  })
  return loadModelDefaults()
}

function saveModelWeights(model: MLModelWeights): void {
  cachedModel = model
  iaStorage.set('ml_weights', ML_STORAGE_KEY, model)
  syncCallback?.(model)
}

// ============================================================
// EXTRACTION DE FEATURES
// ============================================================

export function extractFeatures(
  ecart: Ecart,
  profil?: ProfilRisque,
  ecartsActifs?: Ecart[],
  feedbacks?: SuggestionFeedback[],
): MLFeatures {
  const maintenant = new Date();
  const delaiDate = new Date(ecart.delai_pac || ecart.delai_regularisation);
  const joursAvantEcheance = Math.ceil((delaiDate.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24));
  const joursRetard = joursAvantEcheance < 0 ? Math.abs(joursAvantEcheance) : 0;

  const prob = ecart.probabilite_risque ?? 3;
  const grav = ecart.gravite_risque ?? 3;
  const graviteNum = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 }[ecart.gravite_risque || 'C'] ?? 3;
  const celluleScore = prob * graviteNum;

  const aerodromeFeedbacks = feedbacks?.filter(f => f.aerodrome_id === ecart.aerodrome_id) || [];
  const pertinents = aerodromeFeedbacks.filter(f => f.etait_pertinent).length;
  const total = aerodromeFeedbacks.length;

  const ecartsAero = ecartsActifs?.filter(e => e.aerodrome_id === ecart.aerodrome_id && e.statut !== 'cloture') || [];
  const nbCritiques = ecartsAero.filter(e => e.niveau_risque === 'critique').length;
  const nbEleves = ecartsAero.filter(e => e.niveau_risque === 'eleve').length;

  const mois = new Date().getMonth();
  const saisonPluie = mois >= 6 && mois <= 9;

  const joursDernierEvenement = profil?.days_since_last_event ?? 90;
  const eventFrequency = profil?.event_frequency ?? 0;

  return {
    scoreGlobal: profil?.score_global ?? 50,
    c1: profil?.c1 ?? 50,
    c2: profil?.c2 ?? 50,
    c3: profil?.c3 ?? 50,
    c4: profil?.c4 ?? 50,
    c5: profil?.c5 ?? 50,
    tendance: TENDANCE_MAP[profil?.tendance || 'stable'] ?? 0,
    celluleOACI: celluleScore,
    probabilite: prob,
    gravite: graviteNum,
    joursRetard,
    joursAvantEcheance,
    nbEcartsActifs: ecartsAero.length,
    nbEcartsCritiques: nbCritiques,
    nbEcartsEleves: nbEleves,
    hasPAC: !!ecart.pac,
    pacActionsCount: ecart.pac?.actions?.length || 0,
    pacFichiersCount: ecart.pac?.fichiers?.length || 0,
    statutCycle: STATUT_CYCLE_MAP[ecart.statut] ?? 0,
    feedbackCount: total,
    feedbackAccuracy: total > 0 ? pertinents / total : 1,
    historiqueNS: aerodromeFeedbacks.filter(f => !f.etait_pertinent).length,
    historiqueSA: pertinents,
    saisonPluie,
    joursDernierEvenement,
    eventFrequency,
  };
}

// ============================================================
// MODÈLE ML — SCORING BAYÉSIEN
// ============================================================

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function computeRawScore(features: MLFeatures, weights: Record<string, number>, biases: Record<string, number>): Record<string, number> {
  const {
    scoreGlobal, c2, celluleOACI, joursRetard, statutCycle,
    tendance, c4, hasPAC, pacActionsCount, pacFichiersCount,
    nbEcartsCritiques, nbEcartsEleves, feedbackAccuracy,
    saisonPluie, joursDernierEvenement, eventFrequency,
  } = features;

  const w = weights;

  const x_suivi = (
    biases.bias_suivi_ecarts +
    (w.w_c2 || 0) * ((100 - c2) / 100) +
    (w.w_score_global || 0) * ((100 - scoreGlobal) / 100) +
    (w.w_cellule_oaci || 0) * (celluleOACI / 25) +
    (w.w_jours_retard || 0) * Math.min(joursRetard / 30, 1) +
    (w.w_statut_cycle || 0) * (statutCycle < 3 ? 0.8 : statutCycle < 5 ? 0.4 : 0.1) +
    (w.w_tendance || 0) * Math.max(0, -tendance) +
    (w.w_c4 || 0) * ((100 - c4) / 100) +
    (nbEcartsCritiques > 0 ? 0.15 : 0) +
    (nbEcartsEleves > 0 ? 0.08 : 0) +
    (saisonPluie ? 0.05 : 0) +
    (joursDernierEvenement < 30 ? 0.1 : 0) +
    eventFrequency * 0.02
  );

  const x_pac = (
    biases.bias_mise_oeuvre_pac +
    (w.w_c2 || 0) * (c2 < 45 ? 0.8 : c2 < 70 ? 0.4 : 0.1) +
    (w.w_has_pac || 0) * (hasPAC ? 0.9 : 0) +
    (w.w_pac_actions || 0) * Math.min(pacActionsCount / 5, 1) +
    (w.w_statut_cycle || 0) * (statutCycle >= 4 ? 0.9 : statutCycle >= 2 ? 0.5 : 0.1) +
    (w.w_score_global || 0) * ((100 - scoreGlobal) / 100) * 0.5 +
    (pacFichiersCount === 0 && hasPAC ? 0.2 : 0) +
    (feedbackAccuracy < 0.5 ? 0.1 : 0)
  );

  const x_audit = (
    biases.bias_audit_complet +
    (w.w_score_global || 0) * ((100 - scoreGlobal) / 100) * 1.5 +
    (w.w_c4 || 0) * ((100 - c4) / 100) * 1.2 +
    (nbEcartsCritiques >= 3 ? 0.3 : nbEcartsCritiques >= 2 ? 0.2 : nbEcartsCritiques >= 1 ? 0.1 : 0) +
    (w.w_tendance || 0) * Math.max(0, -tendance) * 1.5 +
    (c2 < 30 ? 0.2 : 0) +
    (eventFrequency > 0.5 ? 0.15 : 0)
  );

  const x_programmee = (
    biases.bias_programmee +
    (w.w_score_global || 0) * (scoreGlobal / 100) +
    (w.w_c2 || 0) * (c2 / 100) +
    (w.w_tendance || 0) * Math.max(0, tendance) +
    (statutCycle >= 6 ? 0.5 : 0) +
    (feedbackAccuracy > 0.8 ? 0.1 : 0) +
    (joursRetard === 0 ? 0.1 : 0)
  );

  return {
    suivi_ecarts: sigmoid(x_suivi),
    mise_oeuvre_pac: sigmoid(x_pac),
    audit_complet: sigmoid(x_audit),
    programmee: sigmoid(x_programmee),
  };
}

// ============================================================
// APPRENTISSAGE EN LIGNE (Online Learning)
// ============================================================

export function updateModelWithFeedback(
  feedback: SuggestionFeedback,
  features: MLFeatures,
  model?: MLModelWeights,
): MLModelWeights {
  const m = model || loadModelWeights();
  const lr = m.learning_rate;

  const scores = computeRawScore(features, m.weights, m.biases);
  const predictedType = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const actualType = feedback.mission_type_effectif || feedback.mission_type_suggeree;

  const isCorrect = predictedType === actualType || feedback.etait_pertinent;

  if (!isCorrect) {
      const targetScores: Record<string, number> = {
        suivi_ecarts: 0,
        mise_oeuvre_pac: 0,
        audit_complet: 0,
        programmee: 0,
        incident_critique: 0,
        incident_majeur: 0,
      };
    targetScores[actualType as keyof typeof targetScores] = 1;

    // Gradient calculé par classe : chaque classe a un coefficient de dérivée différent
    // pour un même poids, puisque computeRawScore utilise chaque poids différemment
    for (const [key, weight] of Object.entries(m.weights)) {
      let gradient = 0;
      for (const classType of ['suivi_ecarts', 'mise_oeuvre_pac', 'audit_complet', 'programmee'] as const) {
        const perClassDerivative = getGradientCoefficient(key, features, classType);
        gradient += (scores[classType] - targetScores[classType]) * perClassDerivative;
      }
      m.weights[key] = Math.max(-1, Math.min(1, weight - lr * gradient - WEIGHT_DECAY * weight));
    }

    // Chaque biais est mis à jour par l'erreur de sa propre classe uniquement
    for (const [key, bias] of Object.entries(m.biases)) {
      const classType = key.replace('bias_', '') as keyof typeof scores;
      const gradient = scores[classType] - targetScores[classType];
      m.biases[key] = bias - lr * gradient;
    }

    // Ajustement adaptatif du learning rate
    if (m.accuracy_history && m.accuracy_history.length >= 10) {
      const recentAccuracy = m.accuracy_history.slice(-10).reduce((a, b) => a + b, 0) / 10
      if (recentAccuracy < 0.60) m.learning_rate = Math.min(0.15, lr * 1.2)
      else if (recentAccuracy > 0.85) m.learning_rate = Math.max(0.01, lr * 0.9)
    }
  }

  m.total_feedbacks += 1;
  m.accuracy_history.push(feedback.etait_pertinent ? 1 : 0);
  if (m.accuracy_history.length > 100) m.accuracy_history = m.accuracy_history.slice(-100);

  const recentAccuracy = m.accuracy_history.slice(-20).reduce((a, b) => a + b, 0) / Math.min(m.accuracy_history.length, 20);
  m.learning_rate = Math.max(0.005, DEFAULT_LEARNING_RATE * (1 - recentAccuracy));

  m.updated_at = new Date().toISOString();
  m.version += 1;

  saveModelWeights(m);
  return m;
}

function getFeatureValue(weightKey: string, features: MLFeatures): number {
  switch (weightKey) {
    case 'w_c2': return (100 - features.c2) / 100;
    case 'w_score_global': return (100 - features.scoreGlobal) / 100;
    case 'w_cellule_oaci': return features.celluleOACI / 25;
    case 'w_jours_retard': return Math.min(features.joursRetard / 30, 1);
    case 'w_statut_cycle': return features.statutCycle / 7;
    case 'w_tendance': return features.tendance;
    case 'w_c4': return (100 - features.c4) / 100;
    case 'w_has_pac': return features.hasPAC ? 1 : 0;
    case 'w_pac_actions': return Math.min(features.pacActionsCount / 5, 1);
    default: return 0;
  }
}

/** Retourne ∂(rawScore_class)/∂(weight) — la dérivée du score brut d'une classe
 *  par rapport à un poids donné. Puisque computeRawScore utilise chaque poids
 *  différemment selon la classe (transformation linéaire distincte), le gradient
 *  correct est la somme sur toutes les classes de (sigmoid_k - target_k) × ∂x_k/∂w. */
function getGradientCoefficient(weightKey: string, features: MLFeatures, classType: string): number {
  const { c2, scoreGlobal, celluleOACI, joursRetard, statutCycle, tendance, c4, hasPAC, pacActionsCount } = features
  switch (weightKey) {
    case 'w_c2':
      switch (classType) {
        case 'suivi_ecarts': return (100 - c2) / 100
        case 'mise_oeuvre_pac': return c2 < 45 ? 0.8 : c2 < 70 ? 0.4 : 0.1
        case 'audit_complet': return 0
        case 'programmee': return c2 / 100
        default: return 0
      }
    case 'w_score_global':
      switch (classType) {
        case 'suivi_ecarts': return (100 - scoreGlobal) / 100
        case 'mise_oeuvre_pac': return ((100 - scoreGlobal) / 100) * 0.5
        case 'audit_complet': return ((100 - scoreGlobal) / 100) * 1.5
        case 'programmee': return scoreGlobal / 100
        default: return 0
      }
    case 'w_cellule_oaci':
      return classType === 'suivi_ecarts' ? celluleOACI / 25 : 0
    case 'w_jours_retard':
      return classType === 'suivi_ecarts' ? (joursRetard < 30 ? 1 / 30 : 0) : 0
    case 'w_statut_cycle':
      switch (classType) {
        case 'suivi_ecarts': return statutCycle < 3 ? 0.8 : statutCycle < 5 ? 0.4 : 0.1
        case 'mise_oeuvre_pac': return statutCycle >= 4 ? 0.9 : statutCycle >= 2 ? 0.5 : 0.1
        default: return 0
      }
    case 'w_tendance':
      switch (classType) {
        case 'suivi_ecarts': return tendance <= 0 ? -1 : 0
        case 'audit_complet': return tendance <= 0 ? -1.5 : 0
        case 'programmee': return tendance >= 0 ? 1 : 0
        default: return 0
      }
    case 'w_c4':
      switch (classType) {
        case 'suivi_ecarts': return (100 - c4) / 100
        case 'audit_complet': return ((100 - c4) / 100) * 1.2
        default: return 0
      }
    case 'w_has_pac':
      return classType === 'mise_oeuvre_pac' ? (hasPAC ? 0.9 : 0) : 0
    case 'w_pac_actions':
      return classType === 'mise_oeuvre_pac' ? (pacActionsCount < 5 ? 1 / 5 : 0) : 0
    default: return 0
  }
}

// ============================================================
// PRÉDICTION ML
// ============================================================

export function predictSurveillanceType(
  ecart: Ecart,
  profil?: ProfilRisque,
  ecartsActifs?: Ecart[],
  feedbacks?: SuggestionFeedback[],
): MLPrediction {
  const features = extractFeatures(ecart, profil, ecartsActifs, feedbacks);
  const model = loadModelWeights();
  const hasEnoughData = model.total_feedbacks >= MIN_FEEDBACKS_FOR_ML;

  const scores = computeRawScore(features, model.weights, model.biases);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const bestType = sorted[0][0] as SurveillanceType;
  const bestScore = sorted[0][1];
  const secondScore = sorted[1]?.[1] || 0;

  const margin = bestScore - secondScore;
  const dataConfidence = Math.min(1, model.total_feedbacks / 50);
  const rawConfidence = bestScore * (0.5 + 0.5 * margin) * (0.3 + 0.7 * dataConfidence);
  const confiance = Math.max(0.3, Math.min(0.95, rawConfidence));

  const featuresImportantes = getImportantFeatures(features, model.weights);

  const recommandation = generateRecommandation(bestType, features, confiance, hasEnoughData);

  const totalScores = scores.suivi_ecarts + scores.mise_oeuvre_pac + (scores.audit_complet || 0);
  const sumScores = totalScores > 0 ? totalScores : 1;

  return {
    type: bestType,
    confiance: Math.round(confiance * 100),
    scoreSuiviEcarts: Math.round((scores.suivi_ecarts / sumScores) * 100),
    scoreMiseOeuvrePac: Math.round((scores.mise_oeuvre_pac / sumScores) * 100),
    scoreAuditComplet: Math.round(((scores.audit_complet || 0) / sumScores) * 100),
    featuresImportantes,
    estML: hasEnoughData,
    fallbackRuleBased: !hasEnoughData,
    recommandation,
  };
}

function getImportantFeatures(features: MLFeatures, weights: Record<string, number>): string[] {
  const importance: { name: string; value: number }[] = [
    { name: `Score C2 (${features.c2})`, value: Math.abs((weights.w_c2 || 0) * (100 - features.c2) / 100) },
    { name: `Score global (${features.scoreGlobal})`, value: Math.abs((weights.w_score_global || 0) * (100 - features.scoreGlobal) / 100) },
    { name: `Cellule OACI (${features.celluleOACI})`, value: Math.abs((weights.w_cellule_oaci || 0) * features.celluleOACI / 25) },
    { name: `Retard (${features.joursRetard}j)`, value: Math.abs((weights.w_jours_retard || 0) * Math.min(features.joursRetard / 30, 1)) },
    { name: `Statut cycle (${features.statutCycle})`, value: Math.abs((weights.w_statut_cycle || 0) * features.statutCycle / 7) },
    { name: `Tendance (${features.tendance > 0 ? 'hausse' : features.tendance < 0 ? 'baisse' : 'stable'})`, value: Math.abs((weights.w_tendance || 0) * features.tendance) },
    { name: `Charge critique C4 (${features.c4})`, value: Math.abs((weights.w_c4 || 0) * (100 - features.c4) / 100) },
  ];

  return importance
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(f => f.name);
}

function generateRecommandation(
  type: SurveillanceType,
  features: MLFeatures,
  confiance: number,
  estML: boolean,
): string {
  const typeLabel = type === 'mise_oeuvre_pac' ? 'Vérification PAC' :
                    type === 'suivi_ecarts' ? 'Suivi écarts' :
                    type === 'audit_complet' ? 'Audit complet' : 'Surveillance programmée';

  const base = `Recommandation ML : ${typeLabel} (${Math.round(confiance * 100)}% confiance)`;

  const raisons: string[] = [];
  if (features.c2 < 45) raisons.push(`C2 faible (${features.c2}) — efficacité PAC insuffisante`);
  if (features.scoreGlobal < 30) raisons.push(`Score critique (${features.scoreGlobal}/100)`);
  if (features.joursRetard > 0) raisons.push(`Retard de ${features.joursRetard} jours sur le délai`);
  if (features.nbEcartsCritiques > 0) raisons.push(`${features.nbEcartsCritiques} écart(s) critique(s) actif(s)`);
  if (features.tendance < 0) raisons.push('Tendance en baisse');
  if (features.saisonPluie) raisons.push('Saison des pluies — risque accru');
  if (features.joursDernierEvenement < 30) raisons.push(`Dernier événement il y a ${features.joursDernierEvenement}j`);

  const source = estML ? 'Modèle ML entraîné' : 'Règles métier (pas assez de données ML)';

  return `${base}\nSource: ${source}\nFacteurs: ${raisons.length > 0 ? raisons.join(', ') : 'Aucun facteur aggravant'}`;
}

// ============================================================
// ENSEMBLE — Combine ML + Rule-based
// ============================================================

export interface EnsemblePrediction {
  type: SurveillanceType;
  confiance: number;
  mlType?: SurveillanceType;
  mlConfiance?: number;
  ruleType?: SurveillanceType;
  ruleConfiance?: number;
  source: 'ml' | 'rule' | 'ensemble';
  recommandation: string;
  featuresImportantes: string[];
}

export function ensemblePredict(
  ecart: Ecart,
  profil?: ProfilRisque,
  ecartsActifs?: Ecart[],
  feedbacks?: SuggestionFeedback[],
  ruleBasedType?: SurveillanceType,
  ruleBasedConfiance?: number,
): EnsemblePrediction {
  const ml = predictSurveillanceType(ecart, profil, ecartsActifs, feedbacks);

  if (!ruleBasedType || !ml.estML) {
    return {
      type: ml.type,
      confiance: ml.confiance,
      mlType: ml.type,
      mlConfiance: ml.confiance,
      ruleType: ruleBasedType,
      ruleConfiance: ruleBasedConfiance,
      source: ml.estML ? 'ml' : 'rule',
      recommandation: ml.recommandation,
      featuresImportantes: ml.featuresImportantes,
    };
  }

  const mlWeight = ml.confiance / 100;
  const ruleWeight = 1 - mlWeight;

  const scores: Record<SurveillanceType, number> = {
    mise_oeuvre_pac: 0,
    suivi_ecarts: 0,
    audit_complet: 0,
    programmee: 0,
    incident_critique: 0,
    incident_majeur: 0,
  };

  scores[ml.type] = (scores[ml.type] || 0) + mlWeight;
  scores[ruleBasedType] = (scores[ruleBasedType] || 0) + ruleWeight;

  const bestType = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as SurveillanceType;
  const ensembleConfiance = Math.round((scores[bestType] / (mlWeight + ruleWeight)) * 100);

  const source = ml.type === ruleBasedType ? 'ensemble' : ml.confiance > (ruleBasedConfiance || 50) ? 'ml' : 'rule';

  return {
    type: bestType,
    confiance: ensembleConfiance,
    mlType: ml.type,
    mlConfiance: ml.confiance,
    ruleType: ruleBasedType,
    ruleConfiance: ruleBasedConfiance,
    source,
    recommandation: source === 'ensemble'
      ? `ML (${ml.type}, ${ml.confiance}%) + Règles (${ruleBasedType}, ${ruleBasedConfiance}%) → ${bestType} (${ensembleConfiance}%)`
      : ml.recommandation,
    featuresImportantes: ml.featuresImportantes,
  };
}

// ============================================================
// STATISTIQUES DU MODÈLE
// ============================================================

export function getModelStats(): {
  version: number;
  totalFeedbacks: number;
  accuracy: number;
  learningRate: number;
  lastUpdate: string;
  isReady: boolean;
  topWeights: { name: string; value: number }[];
} {
  const model = loadModelWeights();
  const accuracy = model.accuracy_history.length > 0
    ? model.accuracy_history.reduce((a, b) => a + b, 0) / model.accuracy_history.length
    : 1;

  const topWeights = Object.entries(model.weights)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([name, value]) => ({ name, value: Math.round(value * 1000) / 1000 }));

  return {
    version: model.version,
    totalFeedbacks: model.total_feedbacks,
    accuracy: Math.round(accuracy * 100),
    learningRate: Math.round(model.learning_rate * 10000) / 10000,
    lastUpdate: model.updated_at,
    isReady: model.total_feedbacks >= MIN_FEEDBACKS_FOR_ML,
    topWeights,
  };
}

// ============================================================
// RESET DU MODÈLE
// ============================================================

export function resetModel(): void {
  cachedModel = null
  iaStorage.remove('ml_weights', ML_STORAGE_KEY)
}

// ============================================================
// TIMING — Prédiction du meilleur moment pour la surveillance
// ============================================================

export interface TimingPrediction {
  joursRecommande: number
  fenetreDebut: number
  fenetreFin: number
  confiance: number
  facteurs: string[]
}

export function predictTiming(
  profil: ProfilRisque | null,
  ecartsActifs: Ecart[],
  surveillances: Surveillance[],
  domainesCibles: string[],
): TimingPrediction | null {
  if (!profil) return null

  const nbCritiques = ecartsActifs.filter(e => e.niveau_risque === 'critique').length
  const nbEleves = ecartsActifs.filter(e => e.niveau_risque === 'eleve').length
  const c4Charge = profil.c4 // 0 = surchargé, 100 = disponible
  const scoreGlobal = profil.score_global
  const tendance = profil.tendance
  const mois = new Date().getMonth()
  const saisonPluie = mois >= 6 && mois <= 9

  // Intervalle moyen basé sur l'historique
  let intervalleMoyen = 365 // défaut 1 an
  if (surveillances.length >= 2) {
    const dates = surveillances.map(s => new Date(s.created_at).getTime()).sort((a, b) => a - b)
    const ecartsDates: number[] = []
    for (let i = 1; i < dates.length; i++) {
      ecartsDates.push(Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)))
    }
    if (ecartsDates.length > 0) {
      intervalleMoyen = Math.round(ecartsDates.reduce((a, b) => a + b, 0) / ecartsDates.length)
    }
  }

  // Poids des facteurs
  const facteurs: string[] = []
  let facteurDegradation = 0
  let facteurUrgence = 0
  let facteurCharge = 0
  let facteurSaison = 0

  if (tendance === 'baisse') {
    facteurDegradation += 30
    facteurs.push(`Tendance baissière: délai réduit de 30j`)
  } else if (tendance === 'hausse') {
    facteurDegradation -= 30
    facteurs.push(`Tendance haussière: délai allongé de 30j`)
  }

  if (scoreGlobal < 30) {
    facteurUrgence += 60
    facteurs.push(`Score critique (${scoreGlobal}): urgence +60j`)
  } else if (scoreGlobal < 50) {
    facteurUrgence += 30
    facteurs.push(`Score dégradé (${scoreGlobal}): urgence +30j`)
  }

  if (nbCritiques >= 3) {
    facteurUrgence += 45
    facteurs.push(`${nbCritiques} écarts critiques: urgence +45j`)
  } else if (nbCritiques >= 1) {
    facteurUrgence += 20
    facteurs.push(`${nbCritiques} écart critique: urgence +20j`)
  }
  if (nbEleves >= 5) {
    facteurUrgence += 15
    facteurs.push(`${nbEleves} écarts élevés: urgence +15j`)
  }

  // C4 charge équipe (0 = surchargé)
  if (c4Charge < 30) {
    facteurCharge += 30
    facteurs.push(`Équipe surchargée (C4=${c4Charge}): délai +30j`)
  } else if (c4Charge < 50) {
    facteurCharge += 15
    facteurs.push(`Équipe modérément chargée (C4=${c4Charge}): délai +15j`)
  }

  // Saison
  const domainesPHY_OLS = domainesCibles.some(d => d === 'PHY' || d === 'OLS')
  if (saisonPluie && domainesPHY_OLS) {
    facteurSaison += 30
    facteurs.push('Saison des pluies + domaines PHY/OLS: urgence +30j')
  } else if (saisonPluie) {
    facteurSaison += 15
    facteurs.push('Saison des pluies: urgence +15j')
  }

  const ajustement = facteurUrgence + facteurSaison - facteurCharge
  const degradationNet = facteurDegradation

  let joursRecommande = Math.max(30, intervalleMoyen - degradationNet - ajustement)
  joursRecommande = Math.min(365, joursRecommande)

  // Fenêtre de ±15%
  const fenetre = Math.round(joursRecommande * 0.15)
  const fenetreDebut = Math.max(1, joursRecommande - fenetre)
  const fenetreFin = joursRecommande + fenetre

  // Confiance
  const nbSurveillances = surveillances.length
  const confianceBase = nbSurveillances >= 5 ? 80 : nbSurveillances >= 2 ? 60 : 40
  const confiance = Math.min(95, confianceBase + (profil ? 10 : 0) - (facteurCharge > 0 ? 10 : 0))

  return {
    joursRecommande,
    fenetreDebut,
    fenetreFin,
    confiance,
    facteurs,
  }
}

// ============================================================
// EXPORT
// ============================================================

export const suggestionMLAgent = {
  predictSurveillanceType,
  ensemblePredict,
  extractFeatures,
  updateModelWithFeedback,
  getModelStats,
  resetModel,
  loadModelWeights,
  saveModelWeights,
  predictTiming,
  onSyncModel,
  initModelFromSupabase,
};
