// lib/risque.ts - VERSION FINALE COMPLÈTE OPTIMISÉE V2
// ============================================================
// Contient tous les modèles mathématiques : 
// - Régression linéaire (existant)
// - Hawkes univarié et multivarié
// - CUSUM détection rupture
// - Intervalle bayésien
// - Quantile regression
// - Stress système
// - Proactive alerts
// - GÉNÉRATION PLANNING N+1 OPTIMISÉE (nouvelle version)
// - MEMOIZATION avec TTL
// - C4 UNIFIÉ (logarithmique + linéaire)
// ============================================================

import type { Aerodrome, Planning, ProfilRisque, Ecart } from './store';

// Imports depuis les sous-modules pour éviter les duplications et la dépendance circulaire
import { computeProbabilityLevel, computeGravityLevel, getMatrixCell, getRiskLevelFromCell, getRiskLevelFromCell5, getCellColor, getOACIValue, getRiskLevelVariant, getRiskLevelBgColor, getRiskLevelClass, getRiskLevelColor, getRiskLevelBgVariant, getRiskLevelBorderVariant } from './risque/matrix'
import { computeBaseFrequency, computeMultipliers, computeFinalFrequency as computeFinalFrequencyObj, suggestMissionType, applyMultipliers } from './risque/frequency'
import { computeIncidentPredictions as _computeIncidentPredictions } from './risque/predictions'
import { detectAllTriggers, computeTriggersImpact } from './risque/triggers'
import { detectAllAggravators, computeAggravatorsMultiplier } from './risque/aggravators'
import type { ScoreHistoryPoint, BowTieModele } from './risque/types'
import { fitSeasonalModel } from './risque/seasonalForecast'
import { computeICaoMatrix, computeGlobalICaoRisk, getICaoLabels } from './risque/icaoMatrix'
// Re-exports pour que les consommateurs de '@/lib/risque' puissent y accéder
export { computeProbabilityLevel, computeGravityLevel, getMatrixCell, getRiskLevelFromCell, getRiskLevelFromCell5, getCellColor, getOACIValue, getRiskLevelVariant, getRiskLevelBgColor, getRiskLevelClass, getRiskLevelColor, getRiskLevelBgVariant, getRiskLevelBorderVariant }
export { computeBaseFrequency, computeMultipliers, suggestMissionType }
export { computeFinalFrequencyObj }
export { detectAllTriggers, computeTriggersImpact }
export { detectAllAggravators, computeAggravatorsMultiplier }
export { computeICaoMatrix, computeGlobalICaoRisk, getICaoLabels }

// Wrapper rétrocompatible : (baseFrequency, multipliers?) => number
// Les appelants historiques (PlanningModule, PlanningNPlus1) utilisent
// computeFinalFrequency(baseFreq, multipliers) et attendent un nombre
export function computeFinalFrequency(base: number, multipliers?: number[]): number {
  return applyMultipliers(base, multipliers || []);
}

import type { NiveauProbabilite, NiveauGravite, FacteurDeclencheur, FacteurAggravant, NiveauRisque } from './risque/types'
export type { NiveauProbabilite, NiveauGravite, FacteurDeclencheur, FacteurAggravant, NiveauRisque as NiveauRisqueMatrice }

// ============================================================
// MEMOIZATION AVEC TTL POUR OPTIMISATION PERFORMANCES
// ============================================================

/**
 * Utility de memoization avec TTL pour éviter les recalculs coûteux
 */
function memoizeWithTTL<T extends (...args: any[]) => any>(
  fn: T,
  ttl: number = 60000, // 1 minute par défaut
  resolver?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, { result: ReturnType<T>; timestamp: number }>();
  let cleanupCounter = 0;
  
  return ((...args: Parameters<T>) => {
    const key = resolver ? resolver(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.result;
    }
    
    const result = fn(...args);
    cache.set(key, { result, timestamp: Date.now() });
    
    // Nettoyage différé : 1 fois tous les 50 appels (évite boucler à chaque fois)
    if (++cleanupCounter % 50 === 0) {
      cache.forEach((value, cacheKey) => {
        if (Date.now() - value.timestamp > ttl * 2) {
          cache.delete(cacheKey);
        }
      });
    }
    
    return result;
  }) as T;
}

// Re-export advanced types from the new module structure so that
// `import { X } from '@/lib/risque'` keeps working.
export type { PredictionBayesienne, NiveauRisque, MatricePerformance, CorrectionModele, RisqueDomaine } from './risque/types'

// ============================================================
// Types pour le module risque avancé
// ============================================================

export interface RiskCriteria {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
}

export interface RiskPrediction {
  score3m: number;
  score6m: number;
  confidence: number;
  probabilityDegradation: number;
  trend: 'hausse' | 'baisse' | 'stable';
}

export interface IncidentPrediction {
  probability3m: number;
  probability6m: number;
  probability12m: number;
  expectedEventsPerMonth: number;
  severityTrend: 'hausse' | 'baisse' | 'stable';
  daysSinceLastIncident: number;
  confidence: number;
}

export interface EventTrendAnalysis {
  frequencyPerMonth: number;
  severityWeightedTrend: 'hausse' | 'baisse' | 'stable';
  monthsWithEvents: number;
  totalMonths: number;
  avgGravite: number;
  recentAcceleration: number;
}

// ============================================================
// NOUVEAUX TYPES POUR MODÈLES AVANCÉS
// ============================================================

export interface VelocityMetrics {
  vitesse: number;
  acceleration: number;
  volatilite: number;
  tempsAvantSeuilCritique: number | null;
  niveauVigilance: 'normal' | 'surveillance' | 'alerte' | 'critique';
}

export interface CUSUMResult {
  alerte: boolean;
  seuilDepasse: number;
  pointsCumules: number[];
  tempsDepuisDetection: number;
  magnitude: number;
}

export interface BayesianInterval {
  mean: number;
  lower5: number;
  upper95: number;
  lower25: number;
  upper75: number;
  credibleInterval: [number, number];
  skewness: number;
}

export interface HawkesIntensity {
  currentIntensity: number;
  riskNext30Days: number;
  expectedNewEcarts: number;
  contributions: {
    background: number;
    triggered: number;
  };
}

export interface HawkesMultivariateResult {
  intensities: {
    sgs: number;
    pac: number;
    conformite: number;
    critique: number;
    resilience: number;
  };
  propagationMatrix: number[][];
  nextWeekRisk: number;
  mostInfluentialDomain: string;
}

export interface QuantilePrediction {
  q10: number;
  q25: number;
  q50: number;
  q75: number;
  q90: number;
  asymetrie: 'haussiere' | 'baissiere' | 'symetrique';
  iqr: number;
}

export interface SystemStress {
  score: number;
  niveauStress: 'faible' | 'modere' | 'eleve' | 'critique';
  facteursContributeurs: string[];
  recommandationAction: string;
  stressIndicators: {
    velocityStress: number;
    ecartsStress: number;
    c4Stress: number;
    resilienceStress: number;
  };
}

export interface ProactiveAlert {
  niveauUrgence: 'info' | 'vigilance' | 'alerte' | 'critique';
  probabiliteDegradation3m: number;
  probabiliteSeuil30_3m: number;
  probabiliteSeuil30_6m: number;
  messageCourt: string;
  messageLong: string;
  actionSuggerer: string;
  delaiEstimeJours: number | null;
}

export interface CorrelationMatrix {
  c1_c2: number;
  c1_c3: number;
  c1_c4: number;
  c1_c5: number;
  c2_c3: number;
  c2_c4: number;
  c2_c5: number;
  c3_c4: number;
  c3_c5: number;
  c4_c5: number;
}

export interface ActionEffectiveness {
  actionType: string;
  observationCount: number;
  averageImprovement: number;
  averageCostDays: number;
  efficaciteTemporelle: number;
  confidence: number;
}

export interface ChangePoint {
  date: string;
  scoreBefore: number;
  scoreAfter: number;
  magnitude: number;
  direction: 'amelioration' | 'degradation';
  probableCause: string | null;
}

export const RISK_LEVELS = {
  FAIBLE: { min: 80, max: 100, label: 'Faible', color: 'success', frequency: 1 },
  MOYEN: { min: 60, max: 79, label: 'Moyen', color: 'primary', frequency: 2 },
  ELEVE: { min: 30, max: 59, label: 'Élevé', color: 'warning', frequency: 4 },
  CRITIQUE: { min: 0, max: 29, label: 'Critique', color: 'danger', frequency: 12 },
} as const;

/**
 * ATTENTION — deux échelles de niveau de risque coexistent dans le code :
 *
 * 1. RISK_LEVELS / getRiskLevel() (4 niveaux : FAIBLE/MOYEN/ELEVE/CRITIQUE)
 *    → Utilisé pour le score global agrégé 0-100 (ProfilRisque.score_global)
 *    → Seuils : ≥80 Faible, ≥60 Moyen, ≥30 Élevé, <30 Critique
 *
 * 2. NiveauRisque dans lib/risque/types.ts (5 niveaux : critique/eleve/moyen/faible/tres_faible)
 *    → Utilisé pour les cellules de la matrice OACI probabilité×gravité (1A à 5E)
 *    → Vient de getRiskLevelFromCell() dans matrix.ts
 *
 * Les labels sont visuellement proches mais les échelles ne sont PAS interchangeables :
 * - Un score_global=75 → getRiskLevel() → 'MOYEN', alors que la matrice OACI peut retourner
 *   'critique' ou 'tres_faible' selon la combinaison probabilité×gravité
 * - computeOptimalFrequency() assure la conversion entre les deux mondes via mapScoreToRiskLevel()
 *
 * Ne pas supposer que les labels de RISK_LEVELS correspondent aux NiveauRisque des types.
 */
export const getRiskLevel = (score: number): keyof typeof RISK_LEVELS => {
  if (score >= 80) return 'FAIBLE';
  if (score >= 60) return 'MOYEN';
  if (score >= 30) return 'ELEVE';
  return 'CRITIQUE';
};

// Fonction de conversion score_global → NiveauRisque (vocabulaire frequency.ts / OACI 5×5 4-niveaux)
// Centralisée pour éviter les mappings inline incohérents dans computeOptimalFrequency et ailleurs.
// Seuils alignés sur RISK_LEVELS : <30 critique, <50 eleve, <70 moyen, ≥70 faible.
export function mapScoreToRiskLevel(score: number): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (score < 30) return 'critique';
  if (score < 50) return 'eleve';
  if (score < 70) return 'moyen';
  return 'faible';
}

// Matrice de corrélation par défaut (hypothèses expertes — à recalibrer sur données réelles)
export const DEFAULT_CORRELATION_MATRIX: CorrelationMatrix = {
  c1_c2: 0.72,
  c1_c3: 0.58,
  c1_c4: -0.45,
  c1_c5: 0.68,
  c2_c3: 0.52,
  c2_c4: -0.63,
  c2_c5: 0.49,
  c3_c4: -0.59,
  c3_c5: 0.44,
  c4_c5: -0.55,
};

// ============================================================
// NOUVEAUX TYPES POUR EXEMPTIONS (AJOUT)
// ============================================================

export interface ExemptionImpact {
  exemptionId: string;
  domaine: string;
  bonus_c3: number;
  malus_c3: number;
  efficacite_validee: number;
}

export interface C3AdjustmentResult {
  c3_ajuste: number;
  impacts: ExemptionImpact[];
  raw_c3: number;
}

// ============================================================
// FONCTIONS EXISTANTES (conservées)
// ============================================================

export function calculateC1(
  maturiteSgs: number,
  scoreEnquetes?: number,
  statut_sgs?: 'complet' | 'simplifie' | 'non_applicable',
): number {
  // SGS non applicable → score neutre (ne pénalise pas le profil global)
  if (statut_sgs === 'non_applicable') return 100
  if (typeof maturiteSgs !== 'number' || isNaN(maturiteSgs)) maturiteSgs = 50
  const sgsScore = maturiteSgs <= 5 ? (maturiteSgs - 1) * 25 : maturiteSgs;
  let score = sgsScore;
  if (scoreEnquetes) {
    const enqueteScore = (scoreEnquetes / 5) * 100;
    score = sgsScore * 0.7 + enqueteScore * 0.3;
  }
  if (isNaN(score)) score = 50
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calcule le score C2 (Efficacité du traitement des PAC)
 * @returns 100 = tous les écarts traités à temps (parfait), 0 = tous en retard (critique)
 */
export function calculateC2(ecartsClotures: Array<{ created_at: string; cloture_le: string; delai_regularisation: string }>): number {
  if (ecartsClotures.length === 0) return 100; // Pas d'écarts = parfait par défaut
  let totalRatio = 0;
  ecartsClotures.forEach(ecart => {
    const emission = new Date(ecart.created_at).getTime();        
    const cloture = new Date(ecart.cloture_le).getTime();         
    const echeance = new Date(ecart.delai_regularisation).getTime(); 
    const dureeReelle = Math.max(1, (cloture - emission) / (1000 * 3600 * 24));
    const dureeMax = Math.max(1, (echeance - emission) / (1000 * 3600 * 24));
    // ratio = 1 si traité à temps ou en avance, < 1 si en retard
    const ratio = Math.min(1, dureeMax / Math.max(1, dureeReelle));
    totalRatio += ratio;
  });
  const ratioMoyen = totalRatio / ecartsClotures.length;
  // 100 = parfait (tous à temps), 0 = catastrophique (tous très en retard)
  return Math.round(ratioMoyen * 100);
}

export function calculateC3(surveillances: Array<{ score: number; date: string }>): number {
  if (surveillances.length === 0) return 30;
  const recentes = surveillances
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  let total = 0;
  let poidsTotal = 0;
  recentes.forEach((surv, index) => {
    const poids = index === 0 ? 2 : 1;
    total += surv.score * poids;
    poidsTotal += poids;
  });
  return Math.round(total / poidsTotal);
}

export function calculateC4(ecartsActifs: Array<{ niveau: string }>, seuilMax: number = 50): number {
  if (ecartsActifs.length === 0) return 100;
  let charge = 0;
  ecartsActifs.forEach(ecart => {
    switch (ecart.niveau) {
      case 'critique': charge += 4; break;
      case 'eleve': charge += 2; break;
      case 'moyen': charge += 1; break;
      case 'faible': charge += 0.5; break;
    }
  });
  
  if (charge <= seuilMax) {
    return Math.round(100 - (charge / seuilMax * 100));
  }
  
  // Formule logarithmique pour les charges élevées (évite score 0 trop tôt)
  const excess = charge - seuilMax;
  const penalite = 100 * (1 - Math.exp(-excess / seuilMax));
  return Math.round(Math.max(0, 100 - penalite));
}

const GRAVITE_C5_WEIGHTS: Record<string, number> = {
  critique: 40, orange: 20, jaune: 10, gris: 5, bleu: 3,
  accident: 40, incident_grave: 20, incident: 10, panne: 5,
}

export function calculateC5(evenements: Array<{ gravite: string; date?: string }>): number {
  if (evenements.length === 0) return 100;
  const now = Date.now();
  let chargeSecurite = 0;
  evenements.forEach(evt => {
    const poids = GRAVITE_C5_WEIGHTS[evt.gravite.toLowerCase()] || 5;
    // Dégradation temporelle : événements > 12 mois = poids réduit de moitié
    let recencyFactor = 1;
    if (evt.date) {
      const ageJours = (now - new Date(evt.date).getTime()) / 86400000;
      if (ageJours > 365) recencyFactor = 0.5;
      else if (ageJours > 180) recencyFactor = 0.75;
    }
    chargeSecurite += poids * recencyFactor;
  });

  // Ajustement saisonnier : si le mois courant est historiquement à risque, pénalité de 2 pts
  try {
    const eventsWithMois = (evenements as Array<{ gravite: string; date: string }>)
      .filter(e => e.date)
      .map(e => ({ mois: new Date(e.date).getMonth(), value: GRAVITE_C5_WEIGHTS[e.gravite.toLowerCase()] || 5 }))
    if (eventsWithMois.length >= 6) {
      const model = fitSeasonalModel(eventsWithMois)
      const currentMonth = new Date().getMonth()
      const seasonalFactor = model.seasonalFactors[currentMonth] || 0
      // Si le facteur saisonnier dépasse +1 sigma, le mois est anormalement risqué → pénalité
      if (seasonalFactor > model.sigma) {
        chargeSecurite += 2
      }
    }
  } catch { /* seasonal non disponible */ }

  const score = Math.max(0, 100 - chargeSecurite);
  return Math.min(100, Math.round(score));
}

export function calculateGlobalScore(criteria: RiskCriteria): number {
  return Math.round(
    criteria.c1 * 0.20 +
    criteria.c2 * 0.20 +
    criteria.c3 * 0.20 +
    criteria.c4 * 0.15 +
    criteria.c5 * 0.25
  );
}

export function predictRiskScore(historique: Array<{ date: string; score: number }>): RiskPrediction {
  const n = historique.length

  // Données insuffisantes (< 2 points) → valeur par défaut, confiance faible
  if (n < 2) {
    const score = historique[0]?.score || 50
    return { score3m: score, score6m: score, confidence: 20, probabilityDegradation: 50, trend: 'stable' }
  }

  // Échantillon trop petit (2-4 points) → régression possible mais confiance limitée
  if (n < 5) {
    const score = Math.round(historique.reduce((s, h) => s + h.score, 0) / n)
    return { score3m: score, score6m: score, confidence: 25, probabilityDegradation: 50, trend: 'stable' }
  }

  const points = historique
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((h, index) => ({ x: index, y: h.score }))
  
  const sumX = points.reduce((acc, p) => acc + p.x, 0)
  const sumY = points.reduce((acc, p) => acc + p.y, 0)
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0)
  const sumXX = points.reduce((acc, p) => acc + p.x * p.x, 0)
  const meanX = sumX / n
  const meanY = sumY / n
  const denom = n * sumXX - sumX * sumX

  if (Math.abs(denom) < 1e-10) {
    return { score3m: Math.min(100, Math.max(0, Math.round(meanY))), score6m: Math.min(100, Math.max(0, Math.round(meanY))), confidence: 30, probabilityDegradation: 50, trend: 'stable' }
  }
  
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  
  const score3m = Math.min(100, Math.max(0, Math.round(intercept + slope * (n + 3))))
  const score6m = Math.min(100, Math.max(0, Math.round(intercept + slope * (n + 6))))
  
  const predicted = points.map(p => intercept + slope * p.x)
  const residuals = points.map((p, i) => Math.pow(p.y - predicted[i], 2))
  const variance = residuals.reduce((a, b) => a + b, 0) / n
  const std = Math.sqrt(variance)
  
  // Confiance basée sur le CV (coefficient de variation) de l'erreur
  const cv = std / Math.max(Math.abs(meanY), 1)
  const confidence = Math.max(20, Math.min(95, Math.round(100 - cv * 50)))
  
  // Probabilité de dégradation : basée sur la pente relative + std résidus
  const penteRelative = slope / Math.max(Math.abs(meanY), 1)
  const probabilityDegradation = Math.max(5, Math.min(95, Math.round(
    (penteRelative < 0 ? Math.abs(penteRelative) * 100 : Math.max(0, 50 - penteRelative * 50)) +
    (std > 10 ? 10 : 0) // incertitude élevée = risque de dégradation
  )))
  
  const trend = slope > 0.5 * std / 10 ? 'hausse' : slope < -0.5 * std / 10 ? 'baisse' : 'stable'
  
  return { score3m, score6m, confidence, probabilityDegradation, trend }
}

// ============================================================
// PRÉDICTION COMBINÉE — Régression linéaire + EWMA (ensemble)
// ============================================================

export function predictWithEnsemble(
  historique: Array<{ date: string; score: number }>
): { score3m: number; score6m: number; confidence: number } {
  if (historique.length < 2) {
    return { score3m: historique[0]?.score || 50, score6m: historique[0]?.score || 50, confidence: 30 }
  }

  // Régression linéaire
  const regression = predictRiskScore(historique)

  // EWMA (lambda = 0.3, lisse mais réactif)
  const ewma3m = predictWithEWMA(historique, 0.3, 3)
  const ewma6m = predictWithEWMA(historique, 0.3, 6)

  // Pondération inverse de la variance : chaque modèle pèse selon la confiance qu'on a en lui
  // La confiance de la régression est basée sur la variance des résidus (dans predictRiskScore)
  // Pour EWMA, on estime l'incertitude via la volatilité récente
  const scores = historique.sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  ).map(h => h.score)
  const recent = scores.slice(-3)
  const ewmaUncertainty = recent.length > 1
    ? Math.sqrt(recent.reduce((sq, v, _, arr) => sq + Math.pow(v - arr.reduce((s, x) => s + x, 0) / arr.length, 2), 0) / recent.length)
    : 10
  const regUncertainty = Math.max(1, 100 - regression.confidence) // plus confiance = moins d'incertitude

  const invVarEwma = 1 / Math.max(1, ewmaUncertainty * ewmaUncertainty)
  const invVarReg = 1 / Math.max(1, regUncertainty * regUncertainty)
  const wEwma = invVarEwma / (invVarEwma + invVarReg)
  const wReg = invVarReg / (invVarEwma + invVarReg)

  const score3m = Math.round(ewma3m * wEwma + regression.score3m * wReg)
  const score6m = Math.round(ewma6m * wEwma + regression.score6m * wReg)

  // Confiance d'ensemble : combinée via la variance de l'estimation pondérée
  const ensembleVariance = 1 / (invVarEwma + invVarReg)
  const ensembleStd = Math.sqrt(ensembleVariance)
  const confidence = Math.min(95, Math.max(20, Math.round(100 - ensembleStd * 5)))

  return { score3m, score6m, confidence }
}

// ============================================================
// WRAPPER BAYÉSIEN — Pont entre ProfilRisque et le module bayesian.ts
// ============================================================

export async function computeBayesianPosterior(
  profil: ProfilRisque | null,
  evenements: Array<{ gravite: string; date: string }>
): Promise<{ posteriorProbability: number; priorProbability: number; estBlackSwan: boolean } | null> {
  try {
    const { computeBayesianPrediction } = await import('@/lib/risque/bayesian')
    const incidentsCount = evenements.length
    const dernierEvent = evenements.length > 0
      ? new Date(evenements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date)
      : null
    const moisSansIncident = dernierEvent
      ? Math.round((Date.now() - dernierEvent.getTime()) / (30 * 86400000))
      : 12

    // Signaux : déduits des critères C1-C5 dégradés
    const signaux: Array<{ type: string; likelihood?: number }> = []
    if (profil) {
      if (profil.c1 < 40) signaux.push({ type: 'maturite_faible', likelihood: 0.7 })
      if (profil.c2 < 40) signaux.push({ type: 'pac_inefficace', likelihood: 0.6 })
      if (profil.c3 < 40) signaux.push({ type: 'conformite_insuffisante', likelihood: 0.5 })
      if (profil.c4 < 40) signaux.push({ type: 'charge_elevee', likelihood: 0.8 })
      if (profil.c5 < 40) signaux.push({ type: 'incidents_repetes', likelihood: 0.9 })
    }

    const result = computeBayesianPrediction(
      'securite_aerodrome',
      signaux,
      incidentsCount,
      moisSansIncident,
      0.3,
      50
    )
    return {
      posteriorProbability: result.posteriorProbability,
      priorProbability: result.priorProbability,
      estBlackSwan: result.estBlackSwan,
    }
  } catch {
    return null
  }
}

/**
 * Pont vers le réseau bayésien causal (bow-tie + nœuds org)
 * Appelée à côté de computeBayesianPosterior — ne remplace pas le score C1-C5
 */
export async function computeBayesianNetworkRisk(
  bowTieId: string,
  aerodromeId?: string,
  evidences: Record<string, number> = {}
): Promise<{ probabiliteResiduelle: number; barrieresCritiques: string[]; confiance: number } | null> {
  try {
    const { construireReseauDepuisBowTie, computeBayesianNetworkRisk: compute } = await import('@/lib/risque/bayesianNetwork')
    const bt: BowTieModele = {
      id: bowTieId,
      domaine: aerodromeId || 'SGS',
      danger: `Danger ${bowTieId}`,
      defaillance: `Défaillance ${bowTieId}`,
      scenario: `Scénario ${bowTieId}`,
      consequence: `Conséquence ${bowTieId}`,
      barrieresPreventives: [
        { id: `${bowTieId}_prev1`, nom: 'Barrière préventive 1', type: 'preventive', efficace: true, efficacite: 80 },
        { id: `${bowTieId}_prev2`, nom: 'Barrière préventive 2', type: 'preventive', efficace: true, efficacite: 75 },
      ],
      barrieresCorrectives: [
        { id: `${bowTieId}_corr1`, nom: 'Barrière corrective 1', type: 'corrective', efficace: true, efficacite: 70 },
        { id: `${bowTieId}_corr2`, nom: 'Barrière corrective 2', type: 'corrective', efficace: true, efficacite: 65 },
      ],
      probabiliteResiduelle: 50,
      niveauRisqueResiduel: 'moyen',
      lastAssessed: new Date().toISOString(),
    }
    const result = compute(construireReseauDepuisBowTie(bt), `consequence_${bowTieId}`, evidences)
    return {
      probabiliteResiduelle: result.probabiliteResiduelle,
      barrieresCritiques: result.barrieresCritiques,
      confiance: result.confiance,
    }
  } catch {
    return null
  }
}

// ============================================================
// INCIDENT PREDICTION — probabilité d'incident futur basée sur
// l'historique des événements de sécurité (fréquence, gravité, récence)
// ============================================================

const INCIDENT_GRAVITY_WEIGHTS: Record<string, number> = {
  critique: 4, orange: 3, jaune: 2, gris: 1, bleu: 0.5,
  accident: 4, incident_grave: 3, incident: 2, panne: 1,
}

export function computeIncidentPrediction(
  evenements: Array<{ gravite: string; date: string }>
): IncidentPrediction {
  const now = Date.now()
  const sixMonthsAgo = now - 180 * 86400000
  const oneYearAgo = now - 365 * 86400000

  const recent6m = evenements.filter(e => new Date(e.date).getTime() >= sixMonthsAgo)
  const recent12m = evenements.filter(e => new Date(e.date).getTime() >= oneYearAgo)

  const eventsPerMonth6m = recent6m.length / 6
  const eventsPerMonth12m = recent12m.length / 12

  // Sévérité moyenne pondérée des 6 derniers mois
  let weightedSeverity6m = 0
  for (const e of recent6m) {
    weightedSeverity6m += INCIDENT_GRAVITY_WEIGHTS[(e.gravite || '').toLowerCase()] || 1
  }
  const avgSeverity6m = recent6m.length > 0 ? weightedSeverity6m / recent6m.length : 0

  // Jours depuis le dernier incident
  const sorted = [...evenements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const lastEventDate = sorted.length > 0 ? new Date(sorted[0].date).getTime() : now
  const daysSinceLastIncident = Math.round((now - lastEventDate) / 86400000)

  // Tendance de sévérité (comparaison 6m récents vs 6m avant)
  const before6m = evenements.filter(e => {
    const t = new Date(e.date).getTime()
    return t >= oneYearAgo && t < sixMonthsAgo
  })
  let weightedSeverityBefore = 0
  for (const e of before6m) {
    weightedSeverityBefore += INCIDENT_GRAVITY_WEIGHTS[(e.gravite || '').toLowerCase()] || 1
  }
  const avgSeverityBefore = before6m.length > 0 ? weightedSeverityBefore / before6m.length : 0

  const severityTrend: 'hausse' | 'baisse' | 'stable' =
    avgSeverity6m > avgSeverityBefore * 1.1 ? 'hausse' :
    avgSeverity6m < avgSeverityBefore * 0.9 ? 'baisse' : 'stable'

  // Hawkes-like intensity pour incidents
  const baseRate = Math.max(0.01, eventsPerMonth12m)
  const recencyBonus = Math.max(0, 1 - daysSinceLastIncident / 365) * 0.5
  const severityBonus = avgSeverity6m > 2 ? 0.3 : avgSeverity6m > 1.5 ? 0.15 : 0
  const intensity = baseRate + recencyBonus * baseRate + severityBonus * baseRate

  // Probabilité qu'au moins 1 incident survienne dans N mois (poisson)
  const prob3m = 1 - Math.exp(-intensity * 3)
  const prob6m = 1 - Math.exp(-intensity * 6)
  const prob12m = 1 - Math.exp(-intensity * 12)

  // Confiance basée sur la quantité de données
  const dataPoints = recent12m.length
  const confidence = Math.min(95, Math.max(20, 40 + dataPoints * 5))

  // Analyse saisonnière (heuristique) : seasonal.prediction3m est un score normalisé (0-1) par la
  // moyenne historique, prob3m est une probabilité Poissonienne Hawkes-like — ce sont deux questions
  // différentes (criticité projetée vs probabilité de survenue). Le ratio seasonalBoost est donc un
  // facteur correctif heuristique, pas un calcul probabiliste rigoureux. À ne pas présenter comme
  // "probabilité bayésienne" dans les rapports.
  let seasonalBoost = 1.0
  try {
    const seasonal = _computeIncidentPredictions(evenements)
    if (seasonal.prediction3m > prob3m) seasonalBoost = Math.min(seasonal.prediction3m / Math.max(prob3m, 0.01), 1.5)
  } catch { /* predictions optionnel */ }

  return {
    probability3m: Math.round(prob3m * seasonalBoost * 100),
    probability6m: Math.round(prob6m * seasonalBoost * 100),
    probability12m: Math.round(prob12m * seasonalBoost * 100),
    expectedEventsPerMonth: Math.round(intensity * 100) / 100,
    severityTrend,
    daysSinceLastIncident,
    confidence,
  }
}

// ============================================================
// EVENT TREND ANALYSIS — tendance fréquence/gravité des événements
// ============================================================

export function computeEventTrendAnalysis(
  evenements: Array<{ gravite: string; date: string }>
): EventTrendAnalysis {
  const now = Date.now()
  const totalMonths = 12
  const oneYearAgo = now - 365 * 86400000

  // Regrouper par mois
  const months: Record<string, { count: number; totalWeight: number }> = {}
  for (let i = 0; i < totalMonths; i++) {
    const d = new Date(now - i * 30 * 86400000)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    months[key] = { count: 0, totalWeight: 0 }
  }

  const recent12m = evenements.filter(e => new Date(e.date).getTime() >= oneYearAgo)
  for (const e of recent12m) {
    const d = new Date(e.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (months[key]) {
      months[key].count++
      months[key].totalWeight += INCIDENT_GRAVITY_WEIGHTS[e.gravite.toLowerCase()] || 1
    }
  }

  const monthKeys = Object.keys(months).sort()
  const counts = monthKeys.map(k => months[k].count)
  const weights = monthKeys.map(k => months[k].totalWeight)

  const totalEvents = recent12m.length
  const frequencyPerMonth = Math.round((totalEvents / totalMonths) * 100) / 100
  const monthsWithEvents = counts.filter(c => c > 0).length
  const avgGravite = weights.reduce((a, b) => a + b, 0) / Math.max(1, totalEvents)

  // Tendance (pente sur les 6 derniers mois)
  const recent6Counts = counts.slice(-6)
  const n = recent6Counts.length
  const indices = recent6Counts.map((_, i) => i)
  const sumX = indices.reduce((a, b) => a + b, 0)
  const sumY = recent6Counts.reduce((a, b) => a + b, 0)
  const sumXY = indices.reduce((a, i) => a + i * recent6Counts[i], 0)
  const sumXX = indices.reduce((a, i) => a + i * i, 0)
  const denom = n * sumXX - sumX * sumX;
  const slope = Math.abs(denom) > 1e-10
    ? (n * sumXY - sumX * sumY) / denom
    : 0

  const severityWeightedTrend: 'hausse' | 'baisse' | 'stable' =
    slope > 0.3 ? 'hausse' : slope < -0.3 ? 'baisse' : 'stable'

  const recentAcceleration = Math.round(slope * 100) / 100

  return {
    frequencyPerMonth,
    severityWeightedTrend,
    monthsWithEvents,
    totalMonths,
    avgGravite: Math.round(avgGravite * 100) / 100,
    recentAcceleration,
  }
}

// ============================================================
// 1. VELOCITY METRICS (Vitesse, accélération, volatilité)
// ============================================================

export function computeVelocityMetrics(
  historique: { date: string; score: number }[]
): VelocityMetrics {
  if (historique.length < 3) {
    return {
      vitesse: 0,
      acceleration: 0,
      volatilite: 0,
      tempsAvantSeuilCritique: null,
      niveauVigilance: 'normal'
    };
  }

  const scores = historique.sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  ).map(s => s.score);
  
  const n = scores.length;
  
  // Dérivée première (lissage exponentiel)
  let vitesse = 0;
  const alpha = 0.3;
  for (let i = 1; i < n; i++) {
    const delta = scores[i] - scores[i-1];
    vitesse = alpha * delta + (1 - alpha) * vitesse;
  }
  
  // Dérivée seconde (accélération)
  let acceleration = 0;
  if (n >= 3) {
    const vitesses: number[] = [];
    for (let i = 2; i < n; i++) {
      vitesses.push((scores[i] - scores[i-1]) - (scores[i-1] - scores[i-2]));
    }
    if (vitesses.length > 0) {
      acceleration = vitesses.reduce((a, b) => a + b, 0) / vitesses.length;
    }
  }
  
  // Volatilité (écart-type glissant sur 3 derniers points)
  let volatilite = 0;
  const derniersPoints = scores.slice(-3);
  if (derniersPoints.length >= 2) {
    const mean = derniersPoints.reduce((a,b) => a+b,0) / derniersPoints.length;
    volatilite = Math.sqrt(derniersPoints.reduce((sq, val) => sq + Math.pow(val - mean, 2), 0) / derniersPoints.length);
  }
  
  // Temps avant seuil critique (30)
  let tempsAvantSeuilCritique: number | null = null;
  if (vitesse < 0 && scores[scores.length-1] > 30) {
    const pointsPerMonth = Math.abs(vitesse);
    const distanceToCritical = scores[scores.length-1] - 30;
    tempsAvantSeuilCritique = Math.round(distanceToCritical / pointsPerMonth);
  }
  
  // NaN guards
  if (isNaN(vitesse)) vitesse = 0
  if (isNaN(acceleration)) acceleration = 0
  if (isNaN(volatilite)) volatilite = 0

  // Niveau de vigilance
  let niveauVigilance: VelocityMetrics['niveauVigilance'] = 'normal';
  if (vitesse < -2 && acceleration < 0) niveauVigilance = 'critique';
  else if (vitesse < -1.5) niveauVigilance = 'alerte';
  else if (vitesse < -0.8) niveauVigilance = 'surveillance';
  
  return {
    vitesse: Math.round(vitesse * 10) / 10,
    acceleration: Math.round(acceleration * 10) / 10,
    volatilite: Math.round(volatilite * 10) / 10,
    tempsAvantSeuilCritique,
    niveauVigilance
  };
}

// ============================================================
// 2. CUSUM - Détection de rupture
// ============================================================

export function detectChangePointCUSUM(
  valeurs: number[],
  seuil: number = 5,
  driftAutorise: number = 0.5
): CUSUMResult {
  if (valeurs.length < 4) {
    return {
      alerte: false,
      seuilDepasse: 0,
      pointsCumules: [],
      tempsDepuisDetection: 0,
      magnitude: 0
    };
  }

  // La référence CUSUM est la moyenne historique, pas le dernier point
  // (utiliser le dernier point comme target biaiserait toutes les déviations)
  const historique = valeurs.slice(0, -1);
  const target = historique.reduce((a, b) => a + b, 0) / historique.length;
  
  let cumulPositif = 0;
  let cumulNegatif = 0;
  const pointsCumules: number[] = [];
  
  for (let i = 0; i < historique.length; i++) {
    const deviation = historique[i] - target - driftAutorise;
    cumulPositif = Math.max(0, cumulPositif + deviation);
    cumulNegatif = Math.min(0, cumulNegatif + deviation);
    pointsCumules.push(Math.max(cumulPositif, -cumulNegatif));
  }
  
  const maxCumul = Math.max(...pointsCumules);
  const alerte = maxCumul > seuil;
  const seuilDepasse = Math.round(maxCumul);
  
  const dernierEcart = Math.abs(valeurs[valeurs.length-1] - valeurs[valeurs.length-2]);
  const magnitude = Math.min(100, Math.round((maxCumul / seuil) * 100));
  
  return {
    alerte,
    seuilDepasse,
    pointsCumules,
    tempsDepuisDetection: alerte ? 1 : 0,
    magnitude
  };
}

// ============================================================
// 3. INTERVALLE BAYÉSIEN
// ============================================================

export function computeBayesianCredibleInterval(
  observations: number[],
  priorMean: number = 50,
  priorCertainty: number = 10
): BayesianInterval {
  if (observations.length === 0) {
    return {
      mean: priorMean,
      lower5: Math.max(0, priorMean - 25),
      upper95: Math.min(100, priorMean + 25),
      lower25: Math.max(0, priorMean - 12),
      upper75: Math.min(100, priorMean + 12),
      credibleInterval: [Math.max(0, priorMean - 25), Math.min(100, priorMean + 25)],
      skewness: 0
    };
  }

  const obsMean = observations.length > 0 ? observations.reduce((a, b) => a + b, 0) / observations.length : 0
  const obsVariance = observations.length > 1
    ? observations.reduce((sum, v) => sum + (v - obsMean) ** 2, 0) / (observations.length - 1)
    : 0
  
  // Conjugate prior Normal-Normal
  const posteriorPrecision = priorCertainty + observations.length;
  const posteriorMean = (priorCertainty * priorMean + observations.length * obsMean) / posteriorPrecision;
  const posteriorVariance = (obsVariance * observations.length + priorCertainty * 25) / posteriorPrecision;
  const posteriorStd = Math.sqrt(posteriorVariance);
  
  const lower5 = Math.max(0, Math.round(posteriorMean - 1.645 * posteriorStd));
  const upper95 = Math.min(100, Math.round(posteriorMean + 1.645 * posteriorStd));
  const lower25 = Math.max(0, Math.round(posteriorMean - 0.674 * posteriorStd));
  const upper75 = Math.min(100, Math.round(posteriorMean + 0.674 * posteriorStd));
  
  return {
    mean: Math.round(posteriorMean),
    lower5,
    upper95,
    lower25,
    upper75,
    credibleInterval: [lower5, upper95],
    skewness: 0
  };
}

// ============================================================
// 4. HAWKES UNIVARIÉ (Contagion des écarts)
// ============================================================

export function computeHawkesContagion(
  ecarts: Array<{ createdAt: string; niveau?: string }>,
  params?: { mu?: number; alpha?: number; beta?: number }
): HawkesIntensity {
  // Paramètres Hawkes : stationnarité requiert alpha/beta < 1
  // mu = taux de base (événements/jour), alpha = excitation, beta = décroissance
  const mu = params?.mu ?? 0.03;
  const alpha = params?.alpha ?? 0.40;  // réduit depuis 0.65 (alpha/beta était 1.44 > 1, explosif)
  const beta = params?.beta ?? 0.60;    // augmenté depuis 0.45 → alpha/beta = 0.67 < 1 ✓
  
  const now = Date.now();
  let intensity = mu;
  const backgroundContribution = mu;
  let triggeredContribution = 0;
  
  const recentEcarts = ecarts.filter(e => {
    const age = (now - new Date(e.createdAt).getTime()) / (1000 * 3600 * 24);
    return age <= 90;
  });
  
  for (const ecart of recentEcarts) {
    const ageJours = (now - new Date(ecart.createdAt).getTime()) / (1000 * 3600 * 24);
    let contribution = alpha * beta * Math.exp(-beta * ageJours);
    
    if (ecart.niveau === 'critique') {
      contribution *= 1.8;
    } else if (ecart.niveau === 'eleve') {
      contribution *= 1.3;
    }
    
    intensity += contribution;
    triggeredContribution += contribution;
  }
  
  const proba30j = 1 - Math.exp(-intensity * 30);
  const expectedNewEcarts = intensity * 30;
  
  return {
    currentIntensity: Math.round(intensity * 100) / 100,
    riskNext30Days: Math.min(100, Math.round(proba30j * 100)),
    expectedNewEcarts: Math.round(expectedNewEcarts * 10) / 10,
    contributions: {
      background: Math.round(backgroundContribution * 100) / 100,
      triggered: Math.round(triggeredContribution * 100) / 100
    }
  };
}

// ============================================================
// 5. HAWKES MULTIVARIÉ (Propagation entre domaines)
// ============================================================

export function computeHawkesMultivariate(
  ecartsParDomaine: {
    sgs: Array<{ createdAt: string }>;
    pac: Array<{ createdAt: string }>;
    conformite: Array<{ createdAt: string }>;
    critique: Array<{ createdAt: string }>;
    resilience: Array<{ createdAt: string }>;
  }
): HawkesMultivariateResult {
  const now = Date.now();
  const beta = 0.5;
  
  // Matrice de propagation (domaine i -> domaine j)
  const propagationMatrix: number[][] = [
    [0.6, 0.2, 0.1, 0.05, 0.05], // sgs influence
    [0.3, 0.5, 0.1, 0.05, 0.05], // pac influence
    [0.1, 0.2, 0.5, 0.1, 0.1],  // conformite influence
    [0.05, 0.1, 0.2, 0.6, 0.05], // critique influence
    [0.1, 0.1, 0.1, 0.1, 0.6]   // resilience influence
  ];
  
  const domains = ['sgs', 'pac', 'conformite', 'critique', 'resilience'];
  const intensities: { [key: string]: number; sgs: number; pac: number; conformite: number; critique: number; resilience: number } = {
    sgs: 0.02, pac: 0.02, conformite: 0.02, critique: 0.02, resilience: 0.02
  };
  
  const domainData = [
    ecartsParDomaine.sgs,
    ecartsParDomaine.pac,
    ecartsParDomaine.conformite,
    ecartsParDomaine.critique,
    ecartsParDomaine.resilience
  ];
  
  // Calcul des intensités
  for (let i = 0; i < 5; i++) {
    let total = 0.02;
    for (let j = 0; j < 5; j++) {
      const alphaij = propagationMatrix[j][i];
      for (const ecart of domainData[j]) {
        const age = (now - new Date(ecart.createdAt).getTime()) / (1000 * 3600 * 24);
        if (age <= 90) {
          total += alphaij * beta * Math.exp(-beta * age);
        }
      }
    }
    intensities[domains[i]] = Math.round(total * 100) / 100;
  }
  
  // Risque dans les 7 prochains jours
  const totalIntensity = Object.values(intensities).reduce((a,b) => a+b, 0);
  const nextWeekRisk = Math.min(100, Math.round((1 - Math.exp(-totalIntensity * 7)) * 100));
  
  // Domaine le plus influent
  let mostInfluentialDomain = domains[0];
  let maxIntensity = intensities[mostInfluentialDomain];
  for (const d of domains) {
    if (intensities[d] > maxIntensity) {
      maxIntensity = intensities[d];
      mostInfluentialDomain = d;
    }
  }
  
  const domainMap: Record<string, string> = {
    sgs: 'C1 Maturité SGS',
    pac: 'C2 Efficacité PAC',
    conformite: 'C3 Conformité',
    critique: 'C4 Charge Critique',
    resilience: 'C5 Résilience'
  };
  
  return {
    intensities,
    propagationMatrix,
    nextWeekRisk,
    mostInfluentialDomain: domainMap[mostInfluentialDomain] || mostInfluentialDomain
  };
}

// ============================================================
// 6. QUANTILE REGRESSION (Prédiction avec distribution)
// ============================================================

export function predictQuantiles(
  historique: number[],
  horizon: number
): QuantilePrediction {
  if (historique.length < 4) {
    const mean = historique.length > 0 ? historique[historique.length-1] : 50;
    return {
      q10: Math.max(0, mean - 15),
      q25: Math.max(0, mean - 8),
      q50: mean,
      q75: Math.min(100, mean + 8),
      q90: Math.min(100, mean + 15),
      asymetrie: 'symetrique',
      iqr: 16
    };
  }
  
  const n = historique.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a,b) => a+b, 0);
  const sumY = historique.reduce((a,b) => a+b, 0);
  const sumXY = x.reduce((a,b,i) => a + b * historique[i], 0);
  const sumXX = x.reduce((a,b) => a + b * b, 0);

  const denom = (n * sumXX - sumX * sumX)
  if (Math.abs(denom) < 1e-10) {
    const mean = historique[historique.length - 1]
    return {
      q10: Math.max(0, mean - 15),
      q25: Math.max(0, mean - 8),
      q50: mean,
      q75: Math.min(100, mean + 8),
      q90: Math.min(100, mean + 15),
      asymetrie: 'symetrique',
      iqr: 16
    }
  }
  
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  
  const prediction = Math.min(100, Math.max(0, intercept + slope * (n + horizon - 1)));
  
  // Bootstrap residuals
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    residuals.push(historique[i] - pred);
  }
  
  const sortedResiduals = [...residuals].sort((a,b) => a-b);
  const getPercentile = (p: number) => {
    const idx = Math.floor(p * sortedResiduals.length);
    return sortedResiduals[Math.min(idx, sortedResiduals.length-1)];
  };
  
  const asym = slope > 0 ? 'haussiere' : slope < 0 ? 'baissiere' : 'symetrique';
  const iqr = getPercentile(0.75) - getPercentile(0.25);
  
  return {
    q10: Math.min(100, Math.max(0, Math.round(prediction + getPercentile(0.1)))),
    q25: Math.min(100, Math.max(0, Math.round(prediction + getPercentile(0.25)))),
    q50: Math.min(100, Math.max(0, Math.round(prediction + getPercentile(0.5)))),
    q75: Math.min(100, Math.max(0, Math.round(prediction + getPercentile(0.75)))),
    q90: Math.min(100, Math.max(0, Math.round(prediction + getPercentile(0.9)))),
    asymetrie: asym,
    iqr: Math.round(iqr * 10) / 10
  };
}

// ============================================================
// 7. STRESS SYSTÈME
// ============================================================

export function computeSystemStress(
  profil: ProfilRisque,
  ecartsActifs: Ecart[],
  velocity: VelocityMetrics
): SystemStress {
  const stressIndicators = {
    velocityStress: 0,
    ecartsStress: 0,
    c4Stress: 0,
    resilienceStress: 0
  };
  
  // Score stress par vélocité (0-100)
  if (velocity.vitesse < -2.5) stressIndicators.velocityStress = 100;
  else if (velocity.vitesse < -1.5) stressIndicators.velocityStress = 75;
  else if (velocity.vitesse < -0.5) stressIndicators.velocityStress = 50;
  else if (velocity.vitesse < 0) stressIndicators.velocityStress = 25;
  else stressIndicators.velocityStress = 0;
  
  // Ecarts stress
  const ecarts = ecartsActifs || [];
  const nbEcartsCritiques = ecarts.filter(e => e.niveau_risque === 'critique').length;
  const nbEcartsTotaux = ecarts.length;
  if (nbEcartsCritiques > 3) stressIndicators.ecartsStress = 100;
  else if (nbEcartsCritiques > 1) stressIndicators.ecartsStress = 70;
  else if (nbEcartsTotaux > 5) stressIndicators.ecartsStress = 50;
  else if (nbEcartsCritiques > 0) stressIndicators.ecartsStress = 40;
  else if (nbEcartsTotaux > 2) stressIndicators.ecartsStress = 20;
  else stressIndicators.ecartsStress = 0;
  
  // C4 stress
  stressIndicators.c4Stress = Math.max(0, 100 - (profil.c4 || 70));
  
  // Résilience stress
  stressIndicators.resilienceStress = Math.max(0, 100 - (profil.c5 || 70));
  
  const totalStress = (
    stressIndicators.velocityStress * 0.35 +
    stressIndicators.ecartsStress * 0.25 +
    stressIndicators.c4Stress * 0.25 +
    stressIndicators.resilienceStress * 0.15
  );
  
  let niveauStress: SystemStress['niveauStress'] = 'faible';
  let recommandationAction = '';
  const facteursContributeurs: string[] = [];
  
  if (totalStress >= 70) {
    niveauStress = 'critique';
    recommandationAction = 'Déclencher immédiatement un audit inopiné et activer le plan d\'urgence';
    if (stressIndicators.velocityStress > 70) facteursContributeurs.push('Dégradation accélérée');
    if (stressIndicators.ecartsStress > 70) facteursContributeurs.push('Accumulation d\'écarts critiques');
    if (stressIndicators.c4Stress > 70) facteursContributeurs.push('Charge critique non résolue');
  } else if (totalStress >= 50) {
    niveauStress = 'eleve';
    recommandationAction = 'Programmer surveillance ciblée dans les 30 jours';
    if (stressIndicators.velocityStress > 50) facteursContributeurs.push('Tendance baissière soutenue');
    if (stressIndicators.ecartsStress > 50) facteursContributeurs.push('Écarts en cours');
  } else if (totalStress >= 30) {
    niveauStress = 'modere';
    recommandationAction = 'Surveillance programmée maintenue, suivi renforcé des indicateurs';
    if (stressIndicators.velocityStress > 30) facteursContributeurs.push('Légère dégradation');
  } else {
    recommandationAction = 'Poursuivre la surveillance programmée';
  }
  
  return {
    score: Math.round(totalStress),
    niveauStress,
    facteursContributeurs,
    recommandationAction,
    stressIndicators
  };
}

// ============================================================
// 8. ALERTE PROACTIVE
// ============================================================

export function computeProactiveAlert(
  profil: ProfilRisque,
  historiqueScores: { date: string; score: number }[],
  hawkes: HawkesIntensity
): ProactiveAlert {
  if (!historiqueScores || historiqueScores.length === 0) {
    return {
      niveauUrgence: 'info',
      probabiliteDegradation3m: 50,
      probabiliteSeuil30_3m: 0,
      probabiliteSeuil30_6m: 0,
      messageCourt: 'Profil stable',
      messageLong: 'Aucune alerte particulière à signaler. Maintenir le planning de surveillance existant.',
      actionSuggerer: 'Poursuivre le programme en cours',
      delaiEstimeJours: null
    }
  }
  const currentScore = profil.score_global
  const historiques = historiqueScores.map(h => h.score)
  const predictions = predictRiskScore(historiqueScores)
  const ic = computePredictionInterval(predictions.score3m, historiques, 0.9)

  // Probabilité de dégradation : combine pente + incertitude + Hawkes
  let probabiliteDegradation3m = predictions.probabilityDegradation
  const incertitude = ic.margin / Math.max(Math.abs(predictions.score3m), 1) * 50
  probabiliteDegradation3m = Math.min(95, probabiliteDegradation3m + Math.round(incertitude * 0.3))

  // Probabilité d'atteindre le seuil 30 : basée sur IC bas + tendance
  const zoneRouge3m = ic.lower < 30 ? 1 : ic.lower < 40 ? 0.6 : ic.lower < 50 ? 0.3 : 0
  const tendanceRisque = predictions.trend === 'baisse' ? 0.2 : 0
  const hawkesRisque = hawkes.riskNext30Days > 50 ? 0.1 : 0
  const probabiliteSeuil30_3m = Math.min(90, Math.round((zoneRouge3m + tendanceRisque + hawkesRisque) * 100))
  const probabiliteSeuil30_6m = Math.min(85, Math.round((zoneRouge3m * 0.8 + 0.1) * 100))

  if (hawkes.riskNext30Days > 50) {
    probabiliteDegradation3m = Math.min(95, probabiliteDegradation3m + 5)
  }

  // Niveau d'urgence basé sur le score + proba de seuil 30
  let niveauUrgence: ProactiveAlert['niveauUrgence'] = 'info'
  let messageCourt = ''
  let messageLong = ''
  let actionSuggerer = ''
  let delaiEstimeJours: number | null = null

  if (currentScore < 30) {
    niveauUrgence = 'critique'
    messageCourt = 'Score critique — action immédiate requise'
    messageLong = `Score ${currentScore}/100 — IC bas à ${ic.lower}. Surveillance inopinée requise sous 7 jours.`
    actionSuggerer = 'Déclencher mission inopinée immédiate'
    delaiEstimeJours = 7
  } else if (probabiliteSeuil30_3m > 55) {
    niveauUrgence = 'alerte'
    messageCourt = 'Risque élevé de bascule en critique'
    messageLong = `IC90 bas à ${ic.lower} et tendance ${predictions.trend}. Probabilité estimée à ${probabiliteSeuil30_3m}% d\'atteindre le seuil critique.`
    actionSuggerer = 'Programmer surveillance renforcée dans les 30 jours'
    delaiEstimeJours = 30
  } else if (predictions.trend === 'baisse' && currentScore < 55) {
    niveauUrgence = 'vigilance'
    messageCourt = 'Tendance à la dégradation'
    messageLong = `Score ${currentScore}/100 → ${predictions.score3m}/100 prévu (IC90: ${ic.lower}-${ic.upper}). Suivi mensuel recommandé.`
    actionSuggerer = 'Surveillance programmée maintenue, suivi mensuel'
    delaiEstimeJours = 60
  } else if (hawkes.riskNext30Days > 60) {
    niveauUrgence = 'alerte'
    messageCourt = 'Risque de cascade d\'écarts'
    messageLong = `Modèle Hawkes : ${hawkes.riskNext30Days}% de nouveaux écarts dans les 30 jours.`
    actionSuggerer = 'Renforcer le suivi des écarts ouverts'
    delaiEstimeJours = 30
  } else {
    messageCourt = 'Profil stable'
    messageLong = 'Aucune alerte particulière. Maintenir le planning de surveillance existant.'
    actionSuggerer = 'Poursuivre le programme en cours'
  }

  return {
    niveauUrgence,
    probabiliteDegradation3m: Math.round(probabiliteDegradation3m),
    probabiliteSeuil30_3m: Math.round(probabiliteSeuil30_3m),
    probabiliteSeuil30_6m: Math.round(probabiliteSeuil30_6m),
    messageCourt,
    messageLong,
    actionSuggerer,
    delaiEstimeJours
  }
}

// ============================================================
// 9. MATRICE DE CORRÉLATION (calcul dynamique)
// ============================================================

export function computeCorrelationMatrix(
  historiqueProfils: ProfilRisque[]
): CorrelationMatrix {
  if (historiqueProfils.length < 5) {
    return DEFAULT_CORRELATION_MATRIX;
  }
  
  const extractValues = (key: keyof Pick<ProfilRisque, 'c1' | 'c2' | 'c3' | 'c4' | 'c5'>) =>
    historiqueProfils.map(p => p[key] as number);
  
  const c1 = extractValues('c1');
  const c2 = extractValues('c2');
  const c3 = extractValues('c3');
  const c4 = extractValues('c4');
  const c5 = extractValues('c5');
  
  const correlation = (a: number[], b: number[]) => {
    const n = a.length;
    const meanA = a.reduce((s,x) => s+x, 0) / n;
    const meanB = b.reduce((s,x) => s+x, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - meanA) * (b[i] - meanB);
      denA += Math.pow(a[i] - meanA, 2);
      denB += Math.pow(b[i] - meanB, 2);
    }
    const denom = Math.sqrt(denA * denB);
    if (Math.abs(denom) < 1e-10) return 0;
    return Math.round((num / denom) * 100) / 100;
  };
  
  return {
    c1_c2: correlation(c1, c2),
    c1_c3: correlation(c1, c3),
    c1_c4: correlation(c1, c4),
    c1_c5: correlation(c1, c5),
    c2_c3: correlation(c2, c3),
    c2_c4: correlation(c2, c4),
    c2_c5: correlation(c2, c5),
    c3_c4: correlation(c3, c4),
    c3_c5: correlation(c3, c5),
    c4_c5: correlation(c4, c5)
  };
}

// ============================================================
// 10. EFFICACITÉ DES ACTIONS
// ============================================================

export function computeActionEffectiveness(
  actionsHistoriques: Array<{
    type: string;
    improvement: number;
    costDays: number;
  }>
): ActionEffectiveness[] {
  const grouped = new Map<string, { improvements: number[]; costs: number[] }>();
  
  for (const action of actionsHistoriques) {
    if (!grouped.has(action.type)) {
      grouped.set(action.type, { improvements: [], costs: [] });
    }
    const group = grouped.get(action.type)!;
    group.improvements.push(action.improvement);
    group.costs.push(action.costDays);
  }
  
  const results: ActionEffectiveness[] = [];
  
  for (const [type, data] of grouped) {
    const avgImprovement = data.improvements.reduce((a,b) => a+b, 0) / data.improvements.length;
    const avgCost = data.costs.reduce((a,b) => a+b, 0) / data.costs.length;
    const efficaciteTemporelle = avgImprovement / Math.max(1, avgCost);
    
    const stdDev = Math.sqrt(
      data.improvements.reduce((sq, val) => sq + Math.pow(val - avgImprovement, 2), 0) / data.improvements.length
    );
    const confidence = avgImprovement > 0
      ? Math.max(30, Math.min(95, 100 - (stdDev / avgImprovement) * 50))
      : 50;
    
    results.push({
      actionType: type,
      observationCount: data.improvements.length,
      averageImprovement: Math.round(avgImprovement * 10) / 10,
      averageCostDays: Math.round(avgCost),
      efficaciteTemporelle: Math.round(efficaciteTemporelle * 10) / 10,
      confidence: Math.round(confidence)
    });
  }
  
  return results.sort((a,b) => b.efficaciteTemporelle - a.efficaciteTemporelle);
}

// ============================================================
// 11. DÉTECTION DE POINTS DE CHANGEMENT
// ============================================================

/**
 * Détection de points de changement par fenêtre glissante avant/après.
 * Complémentaire à detectChangePointCUSUM :
 * - CUSUM = détection cumulative précoce (alerte en temps réel dès que la dérive dépasse un seuil)
 * - detectChangePoints = confirmation a posteriori plus robuste au bruit ponctuel (seuil 8 pts)
 * Les deux peuvent donner des résultats différents sur la même série : CUSUM peut détecter une
 * rupture avant que la fenêtre glissante ne la confirme, et inversement la fenêtre glissante
 * peut lisser un pic isolé que CUSUM signale comme rupture. À présenter comme complémentaires
 * dans l'interface (CUSUM en alerte précoce, detectChangePoints en analyse rétrospective).
 */
export function detectChangePoints(
  historique: { date: string; score: number }[]
): ChangePoint[] {
  const changePoints: ChangePoint[] = [];
  if (historique.length < 5) return changePoints;
  
  const scores = historique.map(h => h.score);
  const dates = historique.map(h => h.date);
  const seuilChangement = 8;
  
  for (let i = 2; i < scores.length - 2; i++) {
    const beforeWindow = scores.slice(Math.max(0, i-2), i);
    const afterWindow = scores.slice(i, Math.min(scores.length, i+3));
    const beforeAvg = beforeWindow.reduce((a,b) => a+b, 0) / beforeWindow.length;
    const afterAvg = afterWindow.reduce((a,b) => a+b, 0) / afterWindow.length;
    const delta = afterAvg - beforeAvg;
    
    if (Math.abs(delta) >= seuilChangement) {
      changePoints.push({
        date: dates[i],
        scoreBefore: Math.round(beforeAvg),
        scoreAfter: Math.round(afterAvg),
        magnitude: Math.round(Math.abs(delta)),
        direction: delta > 0 ? 'amelioration' : 'degradation',
        probableCause: null
      });
    }
  }
  
  return changePoints;
}

// ============================================================
// 12. FONCTIONS UTILITAIRES POUR STORE (adaptées Ecart)
// ============================================================

export function calculateC2FromEcarts(ecarts: Ecart[], aerodromeId?: string): number {
  const ecartsClotures = ecarts.filter(e => 
    (!aerodromeId || e.aerodrome_id === aerodromeId) && 
    e.statut === 'cloture' && 
    e.cloture_le
  );

  if (ecartsClotures.length === 0) return 100;

  const maintenant = new Date();
  const douzeMois = new Date(maintenant.setMonth(maintenant.getMonth() - 12));
  const ecartsPeriode = ecartsClotures.filter(e => 
    new Date(e.cloture_le || e.updated_at) >= douzeMois
  );

  if (ecartsPeriode.length === 0) return 100;

  const scoresDelai = ecartsPeriode.map(ecart => {
    const dateCreation = new Date(ecart.created_at);
    const dateCloture = new Date(ecart.cloture_le || ecart.updated_at);
    const dateEcheance = new Date(ecart.delai_regularisation);
    const delaiTotal = Math.max(1, Math.ceil((dateCloture.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24)));
    // Soustraire le temps d'attente inspecteur (si l'écart a été retardé par l'évaluation)
    let tempsAttenteInsp = 0
    if (ecart.retard_inspecteur && ecart.evaluation_pac?.deadline && ecart.evaluation_pac?.evalue_le) {
      const deadline = new Date(ecart.evaluation_pac.deadline)
      const evalueLe = new Date(ecart.evaluation_pac.evalue_le)
      tempsAttenteInsp += Math.max(0, Math.ceil((evalueLe.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)))
    }
    if (ecart.retard_inspecteur && ecart.validation_preuves?.deadline && ecart.validation_preuves?.valide_le) {
      const deadline = new Date(ecart.validation_preuves.deadline)
      const valideLe = new Date(ecart.validation_preuves.valide_le)
      tempsAttenteInsp += Math.max(0, Math.ceil((valideLe.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)))
    }
    const delaiEffectif = Math.max(1, delaiTotal - tempsAttenteInsp);
    const delaiEcheance = Math.max(1, Math.ceil((dateEcheance.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24)));
    const ratio = Math.min(1, delaiEcheance / Math.max(1, delaiEffectif));
    return ratio * 100;
  });

  const avgDelai = scoresDelai.reduce((a, b) => a + b, 0) / scoresDelai.length;

  const pacScores: number[] = [];
  ecartsPeriode.forEach(ecart => {
    if (ecart.pac?.actions && ecart.pac.actions.length > 0) {
      ecart.pac.actions.forEach(action => {
        if ((action as any).evaluation_score) {
          pacScores.push((action as any).evaluation_score);
        }
      });
    }
    if ((ecart as any).pac_evaluation_score) {
      pacScores.push((ecart as any).pac_evaluation_score);
    }
  });

  if (pacScores.length > 0) {
    const avgPAC = pacScores.reduce((a, b) => a + b, 0) / pacScores.length;
    return Math.round(avgDelai * 0.5 + avgPAC * 0.5);
  }

  return Math.round(avgDelai);
}

export function calculateC4FromEcarts(ecarts: Ecart[], aerodromeId?: string): number {
  const ecartsActifs = ecarts.filter(e => 
    (!aerodromeId || e.aerodrome_id === aerodromeId) && 
    e.statut !== 'cloture'
  );

  if (ecartsActifs.length === 0) return 100;

  const poids: Record<string, number> = {
    critique: 4,
    eleve: 2,
    moyen: 1,
    faible: 0.5
  };

  const scorePenalite = ecartsActifs.reduce((acc, ecart) => {
    return acc + (poids[ecart.niveau_risque] || 0);
  }, 0);

  return Math.max(0, 100 - Math.min(100, (scorePenalite / 50) * 100));
}

export function mettreAJourProfilRisque(
  profilExistant: ProfilRisque | null,
  ecarts: Ecart[],
  aerodromeId: string
): ProfilRisque {
  const newC2 = calculateC2FromEcarts(ecarts, aerodromeId);
  const newC4 = calculateC4FromEcarts(ecarts, aerodromeId);

  // Fenêtre glissante de 12 mois : utiliser directement les nouveaux scores
  const c2 = newC2;
  const c4 = newC4;

  const nouveauProfil: ProfilRisque = {
    aerodrome_id: aerodromeId,
    score_global: profilExistant?.score_global || 70,
    niveau: profilExistant?.niveau || 'moyen', // 'bon' n'est pas un niveau valide, utiliser 'moyen'
    c1: profilExistant?.c1 || 70,
    c2: c2,
    c3: profilExistant?.c3 || 70,
    c4: c4,
    c5: profilExistant?.c5 || 70,
    prediction_3m: profilExistant?.prediction_3m || 70,
    prediction_6m: profilExistant?.prediction_6m || 70,
    tendance: profilExistant?.tendance || 'stable',
    computed_at: new Date().toISOString()
  };

  nouveauProfil.score_global = calculateGlobalScore({
    c1: nouveauProfil.c1,
    c2: nouveauProfil.c2,
    c3: nouveauProfil.c3,
    c4: nouveauProfil.c4,
    c5: nouveauProfil.c5
  });

  const niveauKey = getRiskLevel(nouveauProfil.score_global);
  const niveauMapping: Record<keyof typeof RISK_LEVELS, 'critique' | 'eleve' | 'moyen' | 'faible'> = {
    FAIBLE: 'faible',
    MOYEN: 'moyen',
    ELEVE: 'eleve',
    CRITIQUE: 'critique'
  };
  nouveauProfil.niveau = niveauMapping[niveauKey] as ProfilRisque['niveau'];

  return nouveauProfil;
}

// ============================================================
// 13. GÉNÉRATION PLANNING N+1 - VERSION OPTIMISÉE (conservée)
// ============================================================

/**
 * Calcule la fréquence de surveillance optimale basée sur le profil de risque complet
 */
function computeOptimalFrequency(
  profilRisque: ProfilRisque,
  aerodromeType: 'international' | 'national',
  nbEcartsCritiquesActifs: number,
  hasActiveIncidents: boolean,
  triggers?: FacteurDeclencheur[],
  aggravators?: FacteurAggravant[]
): { frequency: number; label: string; justification: string[] } {
  const justification: string[] = []

  // Déléguer le calcul de base à frequency.ts (source unique)
  const riskLevel = mapScoreToRiskLevel(profilRisque.score_global)

  const { frequencyPerYear, recommendations } = computeFinalFrequencyObj({
    riskLevel,
    typeAeroport: aerodromeType,
    hasCriticalEcarts: nbEcartsCritiquesActifs > 0,
    tendance: profilRisque.tendance === 'baisse' ? 'baisse' : profilRisque.tendance === 'hausse' ? 'hausse' : 'stable',
    hasTriggers: (triggers?.length || 0) > 0,
    hasAggravators: (aggravators?.length || 0) > 0,
  })
  justification.push(...recommendations)

  // NOTE : vélocité retirée — elle mesurait le même signal que la tendance (via profondeur et direction
  // de la pente), déjà prise en compte par frequency.ts (×1.3 si 'baisse'). Le double comptage
  // amplifIAIT artificiellement la fréquence (jusqu'à ×1.95 cumulé). frequency.ts est désormais
  // la seule source de vérité pour l'effet tendance sur la fréquence.

  // finalFreq vient de computeFinalFrequencyObj, déjà clampé dans [1,12] par applyMultipliers.
  // Pas de second clamp — éviter la cascade rounding/clamping qui complique le débogage.
  const finalFreq = frequencyPerYear

  let label = ''
  if (finalFreq >= 12) label = 'Mensuelle (×12/an)'
  else if (finalFreq >= 6) label = 'Bimensuelle (×6/an)'
  else if (finalFreq >= 4) label = 'Trimestrielle (×4/an)'
  else if (finalFreq >= 2) label = 'Semestrielle (×2/an)'
  else label = 'Annuelle (×1/an)'
  
  return { frequency: finalFreq, label, justification }
}

function computeOptimalMissionType(
  profilRisque: ProfilRisque,
  nbEcartsCritiquesActifs: number,
  hasPendingPac: boolean,
  isCertificationPhase: boolean,
  triggers?: FacteurDeclencheur[]
): { type: string; justification: string } {
  if (profilRisque.score_global < 30) {
    return { 
      type: 'audit_complet', 
      justification: 'Score critique - audit complet requis immédiatement' 
    }
  }
  if (nbEcartsCritiquesActifs > 0) {
    return { 
      type: 'suivi_ecarts', 
      justification: `${nbEcartsCritiquesActifs} écart(s) critique(s) actif(s) - suivi prioritaire` 
    }
  }
  if (profilRisque.c2 < 45 && hasPendingPac) {
    return { 
      type: 'mise_oeuvre_pac', 
      justification: `Efficacité PAC faible (C2=${profilRisque.c2}/100) - vérification des plans d'actions` 
    }
  }
  if (isCertificationPhase) {
    return { 
      type: 'certification', 
      justification: 'Processus de certification en cours - audit requis' 
    }
  }
  if (profilRisque.tendance === 'baisse' && profilRisque.score_global < 60) {
    return { 
      type: 'programmee', 
      justification: 'Tendance baissière - surveillance programmée renforcée' 
    }
  }
  if (triggers && triggers.some(t => t.actif && t.type === 'saison_pluies')) {
    return { 
      type: 'programmee', 
      justification: 'Saison des pluies - surveillance préventive recommandée' 
    }
  }
  return { 
    type: 'programmee', 
    justification: 'Surveillance programmée standard' 
  }
}

import { DOMAINES_SURVEILLANCE, getDomainesIndividuelsCodes, DomaineCode } from './domaines'

function getDomainesPrioritairesOptimises(
  profilRisque: ProfilRisque,
  ecartsActifs?: { niveau_risque: string; domaine?: string }[]
): string[] {
  const domaines: { nom: string; score: number; priorite: number }[] = []
  
  if (profilRisque.c1 < 70) {
    domaines.push({ nom: 'SGS', score: profilRisque.c1, priorite: 100 - profilRisque.c1 })
  }
  if (profilRisque.c5 < 70) {
    domaines.push({ nom: 'SLI', score: profilRisque.c5, priorite: 100 - profilRisque.c5 })
  }
  if (profilRisque.c3 < 70) {
    domaines.push({ nom: 'PHY', score: profilRisque.c3, priorite: 100 - profilRisque.c3 })
  }
  
  // Écarts actifs par domaine — les domaines des écarts sont des domaines de surveillance réels
  if (ecartsActifs) {
    const domainesEcarts = new Set(ecartsActifs.map(e => e.domaine).filter(Boolean))
    domainesEcarts.forEach(domaine => {
      const existing = domaines.find(d => d.nom === domaine)
      if (existing) {
        existing.priorite += 20
      } else {
        domaines.push({ nom: domaine as string, score: 50, priorite: 50 })
      }
    })
  }
  
  return domaines
    .sort((a, b) => b.priorite - a.priorite)
    .slice(0, 4)
    .map(d => d.nom)
}

function getSousDomainesCritiquesOptimises(
  profilRisque: ProfilRisque,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checklistHierarchy?: any[]
): string[] {
  const sousDomaines: string[] = []

  // Si on a la hiérarchie de checklist, on récupère dynamiquement
  if (checklistHierarchy && checklistHierarchy.length > 0) {
    checklistHierarchy.forEach(domaine => {
      // Vérifier si ce domaine est critique (C1, C3, C5 selon le domaine)
      const isCritique = 
        (domaine.nom === 'SGS' && profilRisque.c1 < 50) ||
        (domaine.nom === 'PHY' && profilRisque.c3 < 50) ||
        (domaine.nom === 'SLI' && profilRisque.c5 < 50) ||
        (domaine.nom === 'OLS' && profilRisque.c1 < 50) ||
        (domaine.nom === 'RA' && profilRisque.c1 < 50)

      if (isCritique) {
        domaine.sousDomaines.forEach((sd: { nom: string; sousSousDomaines?: { nom: string }[] }) => {
          sousDomaines.push(`${domaine.nom}/${sd.nom}`)
          
          // Ajouter aussi les sous-sous-domaines s'ils existent
          if (sd.sousSousDomaines && sd.sousSousDomaines.length > 0) {
            sd.sousSousDomaines.forEach((ssd: { nom: string }) => {
              sousDomaines.push(`${domaine.nom}/${sd.nom}/${ssd.nom}`)
            })
          }
        })
      }
    })
  } else {
    console.warn('[getSousDomainesCritiquesOptimises] Fallback utilisé — pas de checklistHierarchy. Les sous-domaines par défaut peuvent ne plus correspondre à la structure réelle.')
    // Fallback (valeurs par défaut si pas de checklist)
    if (profilRisque.c3 < 50) {
      sousDomaines.push('PHY/Piste')
      sousDomaines.push('PHY/Balisage')
    }
    if (profilRisque.c1 < 50) {
      sousDomaines.push('SGS/Documentation')
      sousDomaines.push('SGS/Formation')
    }
    if (profilRisque.c5 < 50) {
      sousDomaines.push('SLI/Véhicules')
      sousDomaines.push('SLI/Temps intervention')
    }
    if (profilRisque.c1 < 50) {
      sousDomaines.push('OLS/Obstacles')
      sousDomaines.push('RA/Péril animalier')
    }
  }

  return [...new Set(sousDomaines)].slice(0, 5)
}

function getEquipeSuggererOptimisee(
  domainesPrioritaires: string[],
  inspecteurs: { id: string; nom: string; prenom: string; competences?: { domaine: string; niveau: string }[]; statut?: string }[]
): { id: string; nom: string; prenom: string; competences: string[] }[] {
  // Filtrer les inspecteurs disponibles (pas en congé, mission, ou absent)
  const inspecteursDisponibles = inspecteurs.filter(insp => 
    !insp.statut || (insp.statut !== 'en_conge' && insp.statut !== 'en_mission' && insp.statut !== 'absent')
  )
  
  // Convertir les compétences au format attendu et mapper les domaines AGA/XXX vers les domaines individuels
  const inspecteursAvecCompetences = inspecteursDisponibles.map(insp => {
    let competencesDomaines: string[] = []
    
    if (insp.competences && insp.competences.length > 0) {
      competencesDomaines = insp.competences.map(c => {
        // Si c'est un code AGA/XXX, expandre vers les domaines individuels
        if (c.domaine.startsWith('AGA/')) {
          const sousDomaine = ['AGA/EXPLOIT', 'AGA/GENIE_CIV', 'AGA/GENIE_ELEC', 'AGA/SLI_RA'].find(d => d === c.domaine)
          if (sousDomaine) {
            // Mapper vers les domaines individuels
            const mapping: Record<string, string[]> = {
              'AGA/EXPLOIT': ['SGS', 'COP', 'OPS'],
              'AGA/GENIE_CIV': ['PHY', 'OLS'],
              'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
              'AGA/SLI_RA': ['SLI', 'RA'],
            }
            return mapping[c.domaine] || [c.domaine]
          }
        }
        return [c.domaine]
      }).flat()
    }
    
    return {
      id: insp.id,
      nom: insp.nom,
      prenom: insp.prenom,
      competences: competencesDomaines
    }
  })
  
  // Calculer le score de correspondance avec les domaines prioritaires
  const avecScore = inspecteursAvecCompetences.map(insp => {
    const matchCount = insp.competences.filter(c => 
      domainesPrioritaires.some(d => c === d || d.includes(c) || c.includes(d))
    ).length
    return { ...insp, matchScore: matchCount }
  })
  
  return avecScore
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3) // Retourner les 3 meilleurs candidats
}

function genererObjectifsOptimises(
  type: string,
  domaines: string[],
  profilRisque: ProfilRisque,
  freqJustification: string[],
  typeJustification: string
): string {
  let baseObjectif = ''
  switch (type) {
    case 'audit_complet':
      baseObjectif = `Audit complet de l'aérodrome - Évaluation générale de la conformité`
      break
    case 'suivi_ecarts':
      baseObjectif = `Suivi des écarts critiques - Vérification de la mise en œuvre des actions correctives`
      break
    case 'mise_oeuvre_pac':
      baseObjectif = `Vérification de la mise en œuvre des PAC acceptés`
      break
    case 'certification':
      baseObjectif = `Audit de certification - Vérification des exigences réglementaires`
      break
    default:
      baseObjectif = `Surveillance programmée des domaines ${domaines.join(', ')} - Vérification de routine`
  }
  
  const justification = `Basé sur analyse du profil de risque (score ${profilRisque.score_global}/100, tendance ${profilRisque.tendance})`
  
  return `${baseObjectif} / ${justification} / ${typeJustification}`
}

// genererPlanningN1 supprimé — remplacé par planningGenerator.ts dans store.ts

// ============================================================
// NOUVELLE FONCTION : CALCUL C3 AVEC EXEMPTIONS (AJOUT)
// ============================================================

export function calculateC3WithExemptions(
  baseC3: number,
  exemptionsActives: Array<{
    id: string;
    domaines_concerne: string[];
    mesures: Array<{ statut: string; efficacite_validee?: number }>;
  }>
): C3AdjustmentResult {
  let totalBonus = 0;
  let totalMalus = 0;
  const impacts: ExemptionImpact[] = [];
  
  for (const exemption of exemptionsActives) {
    // Bonus : 0 à 20 pts selon le nombre de domaines concernés
    const bonus = Math.min(20, exemption.domaines_concerne.length * 5);
    
    // Malus : -5 pts par mesure en retard
    const mesuresEnRetard = exemption.mesures.filter(m => m.statut === 'en_retard').length;
    const malus = Math.min(15, mesuresEnRetard * 5);
    
    // Efficacité moyenne validée par l'inspecteur
    const efficacitesValidees = exemption.mesures
      .filter(m => m.efficacite_validee !== undefined)
      .map(m => m.efficacite_validee || 0);
    const efficaciteMoyenne = efficacitesValidees.length > 0 
      ? efficacitesValidees.reduce((a, b) => a + b, 0) / efficacitesValidees.length
      : 70;
    
    totalBonus += bonus;
    totalMalus += malus;
    
    impacts.push({
      exemptionId: exemption.id,
      domaine: exemption.domaines_concerne.join(', '),
      bonus_c3: bonus,
      malus_c3: malus,
      efficacite_validee: efficaciteMoyenne,
    });
  }
  
  const c3_ajuste = Math.min(100, Math.max(0, baseC3 + totalBonus - totalMalus));
  
  return {
    c3_ajuste,
    impacts,
    raw_c3: baseC3
  };
}

// ============================================================
// NOUVEAUX MODÈLES (à ajouter à la fin du fichier)
// ============================================================

// 1. CONTEXTUAL BANDIT (Apprentissage par renforcement)
export interface BanditAction {
  id: string
  type: 'surveillance' | 'ecart_prioritaire' | 'formation' | 'barriere'
  description: string
}

export interface BanditContext {
  score_global: number
  tendance: 'hausse' | 'baisse' | 'stable'
  c4: number
  nbEcartsCritiques: number
  aDesExemptions: boolean
  aDesMesuresEnRetard: boolean
  saison: 'pluies' | 'seche'
}

class ContextualBandit {
  private weights: Map<string, number[]> = new Map()
  private learningRate: number = 0.1
  private explorationRate: number = 0.2

  getContextKey(context: BanditContext): string {
    const scoreBucket = Math.floor(context.score_global / 10) * 10
    return `${scoreBucket}_${context.tendance}_${context.c4 > 50 ? 1 : 0}_${context.nbEcartsCritiques}_${context.aDesExemptions}_${context.aDesMesuresEnRetard ? 1 : 0}_${context.saison}`
  }

  chooseAction(context: BanditContext, actions: BanditAction[]): BanditAction {
    const key = this.getContextKey(context)
    if (!this.weights.has(key)) {
      this.weights.set(key, actions.map(() => 50))
    }
    const actionWeights = this.weights.get(key)!
    
    if (Math.random() < this.explorationRate) {
      return actions[Math.floor(Math.random() * actions.length)]
    }
    const bestIndex = actionWeights.indexOf(Math.max(...actionWeights))
    return actions[bestIndex]
  }

  updateReward(context: BanditContext, actionId: string, reward: number): void {
    const key = this.getContextKey(context)
    const actionWeights = this.weights.get(key)
    if (!actionWeights) return
    const actionIndex = parseInt(actionId.split('-')[1]) || 0
    actionWeights[actionIndex] = (1 - this.learningRate) * actionWeights[actionIndex] + this.learningRate * reward
  }
}

export const bandit = new ContextualBandit()

// 2. TRANSFER LEARNING
export function findSimilarAerodromes(
  targetId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aerodromes: any[],
  profilsRisque: Record<string, ProfilRisque>
): string[] {
  const target = aerodromes.find(a => a.id === targetId)
  if (!target) return []
  
  return aerodromes
    .filter(a => a.id !== targetId)
    .filter(a => a.type === target.type)
    .filter(a => a.region === target.region)
    .sort((a, b) => {
      const scoreA = profilsRisque[a.id]?.score_global || 0
      const scoreB = profilsRisque[b.id]?.score_global || 0
      return Math.abs(scoreB - (profilsRisque[targetId]?.score_global || 0)) -
             Math.abs(scoreA - (profilsRisque[targetId]?.score_global || 0))
    })
    .slice(0, 3)
}

// 3. CONFORMAL PREDICTION
export interface ConformalInterval {
  lower: number
  upper: number
  coverageGuarantee: number
  calibrationSetSize: number
}

export function computeConformalInterval(
  predictions: number[],
  actuals: number[],
  newPrediction: number,
  confidence: number = 0.95
): ConformalInterval {
  const nonConformities = predictions.map((pred, i) => Math.abs(pred - actuals[i]))
  nonConformities.sort((a, b) => a - b)
  const quantileIndex = Math.ceil((1 - confidence) * (nonConformities.length + 1))
  const q = nonConformities[quantileIndex - 1] || nonConformities[nonConformities.length - 1]
  return {
    lower: Math.max(0, newPrediction - q),
    upper: Math.min(100, newPrediction + q),
    coverageGuarantee: confidence * 100,
    calibrationSetSize: nonConformities.length
  }
}

// 4. TEMPORAL PATTERNS
export interface TemporalPattern {
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  amplitude: number
  phase: number
  confidence: number
}

export function detectSeasonalPatterns(historiqueScores: ScoreHistoryPoint[]): TemporalPattern[] {
  if (historiqueScores.length < 12) return []
  const patterns: TemporalPattern[] = []
  const monthlyAverages = new Array(12).fill(0)
  const monthlyCounts = new Array(12).fill(0)
  for (const point of historiqueScores) {
    const month = new Date(point.date).getMonth()
    monthlyAverages[month] += point.score
    monthlyCounts[month]++
  }
  for (let i = 0; i < 12; i++) {
    if (monthlyCounts[i] > 0) monthlyAverages[i] /= monthlyCounts[i]
  }
  const overallAvg = monthlyAverages.reduce((a, b) => a + b, 0) / 12
  const maxAmp = Math.max(...monthlyAverages.map(v => Math.abs(v - overallAvg)))
  if (maxAmp > 10) {
    patterns.push({
      type: 'monthly',
      amplitude: maxAmp,
      phase: monthlyAverages.indexOf(Math.max(...monthlyAverages)),
      confidence: 70
    })
  }
  return patterns
}

// 5. HYPOTHESIS TESTING
export interface CorrelationHypothesis {
  variableA: string
  variableB: string
  correlation: number
  pValue: number
  significant: boolean
  strength: 'forte' | 'moderee' | 'faible'
}

export function testCorrelation(dataA: number[], dataB: number[], alpha: number = 0.05): CorrelationHypothesis {
  const n = dataA.length
  const meanA = dataA.reduce((a, b) => a + b, 0) / n
  const meanB = dataB.reduce((a, b) => a + b, 0) / n
  let covariance = 0, varA = 0, varB = 0
  for (let i = 0; i < n; i++) {
    const diffA = dataA[i] - meanA
    const diffB = dataB[i] - meanB
    covariance += diffA * diffB
    varA += diffA * diffA
    varB += diffB * diffB
  }
  const correlation = covariance / Math.sqrt(varA * varB + 0.001)
  const tStat = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation + 0.001))
  const pValue = 2 * (1 - studentTCDF(Math.abs(tStat), n - 2))
  let strength: 'forte' | 'moderee' | 'faible' = 'faible'
  if (Math.abs(correlation) >= 0.7) strength = 'forte'
  else if (Math.abs(correlation) >= 0.4) strength = 'moderee'
  return {
    variableA: 'cible',
    variableB: 'source',
    correlation: Math.round(correlation * 100) / 100,
    pValue: Math.round(pValue * 1000) / 1000,
    significant: pValue < alpha,
    strength
  }
}

function studentTCDF(t: number, df: number): number {
  if (t < 0) return 1 - studentTCDF(-t, df)
  if (df < 1) return 0.5
  if (Math.abs(t) < 1e-12) return 0.5
  if (t > 15) return 1 - 1e-12

  const x = df / (df + t * t)
  const a = df / 2
  const b = 0.5
  const ibeta = regularizedIncompleteBeta(x, a, b)
  return 1 - 0.5 * ibeta
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return 0
  if (x === 0 || x === 1) return x === 0 ? 0 : 1

  // Symétrie pour stabilité numérique
  if (x > (a + 1) / (a + b + 2)) return 1 - regularizedIncompleteBeta(1 - x, b, a)

  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b)
  const logTerm = Math.log(x) * a + Math.log(1 - x) * b - lbeta
  const front = Math.exp(logTerm) / a

  const MAX_ITER = 200
  const EPS = 3e-12

  let f = 1.0
  let c = 1.0
  let d = 1.0 - (a + b) * x / (a + 1)
  if (Math.abs(d) < EPS) d = EPS
  d = 1.0 / d
  f = d

  for (let m = 1; m <= MAX_ITER; m++) {
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1.0 + numerator * d
    if (Math.abs(d) < EPS) d = EPS
    c = 1.0 + numerator / c
    if (Math.abs(c) < EPS) c = EPS
    d = 1.0 / d
    f *= d * c

    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1.0 + numerator * d
    if (Math.abs(d) < EPS) d = EPS
    c = 1.0 + numerator / c
    if (Math.abs(c) < EPS) c = EPS
    d = 1.0 / d
    const delta = d * c
    f *= delta

    if (Math.abs(delta - 1.0) < EPS) break
  }

  return front * f
}

function lgamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  }
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7
  ]
  let x = c[0]
  const zp = z - 1
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (zp + i)
  }
  const t = zp + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (zp + 0.5) * Math.log(t) - t + Math.log(x)
}

// 6. GENERIC BOWTIE + AI
export interface GenericBowTie {
  id: string
  danger: string
  topEvent: string
  consequences: string[]
  barriers: {
    id: string
    type: 'preventive' | 'corrective'
    description: string
    effectivenessScore: number
    lastAssessed: string
    evidenceLinks: string[]
  }[]
  degradationFactors: string[]
}

export function assessBarrierEffectiveness(
  barrierId: string,
  relevantData: {
    nsCount: number
    ecartsCount: number
    inspectionsPassed: boolean
    lastAuditScore: number
  }
): number {
  let score = 70
  if (relevantData.nsCount > 0) score -= relevantData.nsCount * 5
  if (relevantData.ecartsCount > 0) score -= relevantData.ecartsCount * 10
  if (relevantData.inspectionsPassed) score += 15
  if (relevantData.lastAuditScore < 50) score -= 20
  return Math.min(100, Math.max(0, score))
}

// ============================================================
// NOUVELLES FONCTIONS POUR IA (AJOUT)
// ============================================================

/**
 * Calcule le risque d'une prédiction avec intervalle de confiance
 */
export function computePredictionInterval(
  prediction: number,
  historique: number[],
  confidence: number = 0.95
): { lower: number; upper: number; margin: number } {
  const n = historique.length
  if (n < 2) {
    const margin = Math.max(10, Math.round(Math.abs(prediction) * 0.2))
    return {
      lower: Math.max(0, prediction - margin),
      upper: Math.min(100, prediction + margin),
      margin
    }
  }
  
  // Écart-type des résidus (différences successives)
  const diffs: number[] = []
  for (let i = 1; i < n; i++) {
    diffs.push(historique[i] - historique[i-1])
  }
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const variance = diffs.reduce((a, b) => a + (b - meanDiff) ** 2, 0) / diffs.length
  const sigma = Math.sqrt(variance) || Math.max(1, Math.abs(prediction) * 0.1)
  
  const z = confidence >= 0.95 ? 1.96 : confidence >= 0.9 ? 1.645 : 1.28
  // Erreur standard de la prédiction : sigma * sqrt(1 + 1/n)
  const se = sigma * Math.sqrt(1 + 1 / n)
  const margin = Math.round(se * z)
  
  return {
    lower: Math.max(0, prediction - margin),
    upper: Math.min(100, prediction + margin),
    margin
  }
}

/**
 * Calcule le niveau de confiance d'une prédiction basé sur l'historique
 */
export function computePredictionConfidence(
  historique: number[],
  prediction: number
): number {
  const n = historique.length
  if (n < 2) return 40 + (n === 1 ? 5 : 0)

  const mean = historique.reduce((a, b) => a + b, 0) / n
  const residuals = historique.map(v => Math.pow(v - mean, 2))
  const variance = residuals.reduce((a, b) => a + b, 0) / n
  const std = Math.sqrt(variance)
  const cv = std / Math.max(Math.abs(mean), 1)

  // Confiance basée sur le coefficient de variation
  let confidence = Math.round(100 - cv * 60)
  confidence = Math.max(20, Math.min(95, confidence))

  // Pénalité si prédiction s'éloigne de la moyenne
  const zScore = std > 0 ? Math.abs(prediction - mean) / std : 0
  if (zScore > 2) confidence -= 15
  else if (zScore > 1.5) confidence -= 8

  return Math.max(15, confidence)
}

// ============================================================
// EWMA (Exponentially Weighted Moving Average) pour prédictions
// ============================================================

/**
 * Calcule une prédiction EWMA (Exponentially Weighted Moving Average)
 * @param historique - Historique des scores (avec dates)
 * @param lambda - Facteur de lissage (entre 0 et 1, plus élevé = plus de poids aux récents)
 * @param periodsAhead - Nombre de périodes à prédire
 * @returns Score prédit
 */
export function predictWithEWMA(
  historique: { date: string; score: number }[],
  lambda: number,
  periodsAhead: number = 1
): number {
  if (!historique || historique.length === 0) return 70
  
  // Trier par date
  const scores = [...historique]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(h => h.score)
  
  let ewma = scores[0]
  for (let i = 1; i < scores.length; i++) {
    ewma = lambda * scores[i] + (1 - lambda) * ewma
  }
  
  // Pour les prédictions futures, on suppose que la tendance se maintient
  if (scores.length >= 2) {
    const recentTrend = (scores[scores.length - 1] - scores[scores.length - 2]) * lambda
    return Math.min(100, Math.max(0, ewma + recentTrend * periodsAhead))
  }
  
  return Math.min(100, Math.max(0, ewma))
}

/**
 * Version alternative avec historique de scores simple (pour compatibilité)
 */
export function predictWithEWMASimple(
  scores: number[],
  lambda: number,
  periodsAhead: number = 1
): number {
  if (!scores || scores.length === 0) return 70
  
  let ewma = scores[0]
  for (let i = 1; i < scores.length; i++) {
    ewma = lambda * scores[i] + (1 - lambda) * ewma
  }
  
  if (scores.length >= 2) {
    const recentTrend = (scores[scores.length - 1] - scores[scores.length - 2]) * lambda
    return Math.min(100, Math.max(0, ewma + recentTrend * periodsAhead))
  }
  
  return Math.min(100, Math.max(0, ewma))
}

/**
 * Calcule la volatilité historique d'une série de scores
 */
export function computeHistoricalVolatility(scores: number[]): number {
  if (scores.length < 2) return 10
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
  return Math.sqrt(variance)
}

// ============================================================
// QUALITÉ / FIABILITÉ DES DONNÉES
// ============================================================

/**
 * Évalue la fiabilité des données qui alimentent le profil de risque.
 * Se base sur la complétude des PAC, le respect des délais, et la fraîcheur des écarts.
 */
export function computeQualityScore(ecarts: Ecart[]): { qualityScore: number; qualite: 'excellente' | 'bonne' | 'moyenne' | 'faible' } {
  if (ecarts.length === 0) return { qualityScore: 100, qualite: 'excellente' }

  let score = 0
  let totalWeight = 0

  // 1. Complétude PAC (35%)
  const ecartsNonOuverts = ecarts.filter(e => e.statut !== 'ouvert')
  if (ecartsNonOuverts.length > 0) {
    const avecPAC = ecartsNonOuverts.filter(e =>
      ['pac_soumis', 'pac_accepte', 'pac_refuse', 'preuves_soumises', 'preuves_evaluees', 'cloture', 'en_attente_validation_chef'].includes(e.statut)
    ).length
    score += (avecPAC / ecartsNonOuverts.length) * 35
    totalWeight += 35
  }

  // 2. Respect délais évaluation PAC (25%)
  const ecartsAvecEval = ecarts.filter(e => e.evaluation_pac?.deadline && e.evaluation_pac?.evalue_le)
  if (ecartsAvecEval.length > 0) {
    const dansLesTemps = ecartsAvecEval.filter(e =>
      new Date(e.evaluation_pac!.evalue_le!) <= new Date(e.evaluation_pac!.deadline!)
    ).length
    score += (dansLesTemps / ecartsAvecEval.length) * 25
    totalWeight += 25
  }

  // 3. Fraîcheur des données (20%)
  const douzeMois = new Date()
  douzeMois.setFullYear(douzeMois.getFullYear() - 1)
  const recents = ecarts.filter(e => new Date(e.created_at) >= douzeMois).length
  if (recents > 0) {
    score += (recents / ecarts.length) * 20
    totalWeight += 20
  }

  // 4. Ratio clôturé / total (20%)
  const clotures = ecarts.filter(e => e.statut === 'cloture').length
  score += (clotures / ecarts.length) * 20
  totalWeight += 20

  const qualityScore = totalWeight > 0 ? Math.round(score / totalWeight * 100) : 100
  const qualite =
    qualityScore >= 90 ? 'excellente' as const
    : qualityScore >= 70 ? 'bonne' as const
    : qualityScore >= 40 ? 'moyenne' as const
    : 'faible'

  return { qualityScore, qualite }
}

// ============================================================
// EXPORT FINAL (conservé + ajout des nouvelles fonctions)
// ============================================================

export const risqueUtils = {
  calculateC1,
  calculateC2,
  calculateC3,
  calculateC4,
  calculateC5,
  calculateGlobalScore,
  getRiskLevel,
  predictRiskScore,
  calculateC2FromEcarts,
  calculateC4FromEcarts,
  mettreAJourProfilRisque,
  computeVelocityMetrics,
  detectChangePointCUSUM,
  computeBayesianCredibleInterval,
  computeHawkesContagion,
  computeHawkesMultivariate,
  predictQuantiles,
  computeSystemStress,
  computeProactiveAlert,
  computeCorrelationMatrix,
  computeActionEffectiveness,
  detectChangePoints,
  // Nouvelles fonctions ajoutées
  calculateC3WithExemptions,
  detectAllTriggers,
  detectAllAggravators,
  computeTriggersImpact,
  computeAggravatorsMultiplier,
  computeBaseFrequency,
  computeMultipliers,
  computeFinalFrequency,
  suggestMissionType,
  computeProbabilityLevel,
  computeGravityLevel,
  getMatrixCell,
  getRiskLevelFromCell,
  getCellColor,
  // Nouvelles fonctions d'analyse prédictive
  computeIncidentPrediction,
  computeEventTrendAnalysis,
  predictWithEnsemble,
  predictWithEWMA,
  // Quality / Données
  computeQualityScore,
  // ICAO matrix
  computeICaoMatrix,
  computeGlobalICaoRisk,
  getICaoLabels,
};