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

import { Aerodrome, Planning, ProfilRisque, Ecart } from './store';

// Imports depuis les sous-modules pour éviter les duplications et la dépendance circulaire
import { computeProbabilityLevel, computeGravityLevel, getMatrixCell, getRiskLevelFromCell, getCellColor } from './risque/matrix'
import { computeBaseFrequency, computeMultipliers, computeFinalFrequency as computeFinalFrequencyObj, suggestMissionType, applyMultipliers } from './risque/frequency'
import { detectAllTriggers, computeTriggersImpact } from './risque/triggers'
import { detectAllAggravators, computeAggravatorsMultiplier } from './risque/aggravators'
// Re-exports pour que les consommateurs de '@/lib/risque' puissent y accéder
export { computeProbabilityLevel, computeGravityLevel, getMatrixCell, getRiskLevelFromCell, getCellColor }
export { computeBaseFrequency, computeMultipliers, suggestMissionType }
export { computeFinalFrequencyObj }
export { detectAllTriggers, computeTriggersImpact }
export { detectAllAggravators, computeAggravatorsMultiplier }

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
  
  return ((...args: Parameters<T>) => {
    const key = resolver ? resolver(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.result;
    }
    
    const result = fn(...args);
    cache.set(key, { result, timestamp: Date.now() });
    
    // Nettoyage des anciennes entrées
    cache.forEach((value, cacheKey) => {
      if (Date.now() - value.timestamp > ttl * 2) {
        cache.delete(cacheKey);
      }
    });
    
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
  roi: number;
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

export const getRiskLevel = (score: number): keyof typeof RISK_LEVELS => {
  if (score >= 80) return 'FAIBLE';
  if (score >= 60) return 'MOYEN';
  if (score >= 30) return 'ELEVE';
  return 'CRITIQUE';
};

// Matrice de corrélation par défaut (calibrée sur données aviation)
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

export function calculateC1(maturiteSgs: number, scoreEnquetes?: number): number {
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
  if (historique.length < 2) {
    return {
      score3m: historique[0]?.score || 50,
      score6m: historique[0]?.score || 50,
      confidence: 30,
      probabilityDegradation: 50,
      trend: 'stable'
    };
  }

  const points = historique
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((h, index) => ({ x: index, y: h.score }));
  
  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumXX = points.reduce((acc, p) => acc + p.x * p.x, 0);

  const denom = (n * sumXX - sumX * sumX)
  if (Math.abs(denom) < 1e-10) {
    const meanY = sumY / n
    return { score3m: Math.min(100, Math.max(0, Math.round(meanY))), score6m: Math.min(100, Math.max(0, Math.round(meanY))), confidence: 30, probabilityDegradation: 50, trend: 'stable' }
  }
  
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  
  const score3m = Math.min(100, Math.max(0, Math.round(intercept + slope * (n + 3))));
  const score6m = Math.min(100, Math.max(0, Math.round(intercept + slope * (n + 6))));
  
  const predicted = points.map(p => intercept + slope * p.x);
  const residuals = points.map((p, i) => Math.pow(p.y - predicted[i], 2));
  const variance = residuals.reduce((a, b) => a + b, 0) / n;
  const confidence = Math.max(20, Math.min(95, Math.round(100 - Math.sqrt(variance))));
  
  const probabilityDegradation = slope < 0 
    ? Math.min(90, Math.round(Math.abs(slope) * 20))
    : Math.max(10, 100 - Math.round(slope * 20));
  
  const trend = slope > 0.5 ? 'hausse' : slope < -0.5 ? 'baisse' : 'stable';
  
  return { score3m, score6m, confidence, probabilityDegradation, trend };
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

  // Ensemble : 60% EWMA + 40% régression (pondération inverse de la variance)
  const score3m = Math.round(ewma3m * 0.6 + regression.score3m * 0.4)
  const score6m = Math.round(ewma6m * 0.6 + regression.score6m * 0.4)

  const confidence = Math.min(95, regression.confidence + 5) // léger bonus d'ensemble

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

  // Analyse saisonnière (nouvelle fonction partagée)
  let seasonalBoost = 1.0
  try {
    const { computeIncidentPredictions } = require('./risque/predictions')
    const seasonal = computeIncidentPredictions(evenements)
    if (seasonal.prediction3m > prob3m) seasonalBoost = Math.min(seasonal.prediction3m / Math.max(prob3m, 0.01), 1.5)
  } catch { /* predictions indisponible */ }

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
  let alpha = 0.3;
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
  
  // Skewness estimation
  let skewness = 0;
  if (observations.length > 2) {
    const m3 = observations.reduce((sum, val) => sum + Math.pow(val - obsMean, 3), 0) / observations.length;
    const m2 = obsVariance;
    skewness = m3 / Math.pow(m2, 1.5);
  }
  
  return {
    mean: Math.round(posteriorMean),
    lower5,
    upper95,
    lower25,
    upper75,
    credibleInterval: [lower5, upper95],
    skewness: Math.round(skewness * 100) / 100
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
  let backgroundContribution = mu;
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
  const currentScore = profil.score_global;
  const historiques = historiqueScores.map(h => h.score);
  const predictions = predictRiskScore(historiqueScores);
  
  // Probabilités
  let probabiliteDegradation3m = predictions.probabilityDegradation;
  let probabiliteSeuil30_3m = 0;
  let probabiliteSeuil30_6m = 0;
  
  // Calcul probabilité d'atteindre seuil 30
  const prediction3m = predictions.score3m;
  const prediction6m = predictions.score6m;
  
  if (prediction3m <= 30) probabiliteSeuil30_3m = 80;
  else if (prediction3m <= 40) probabiliteSeuil30_3m = 40;
  else if (prediction3m <= 50) probabiliteSeuil30_3m = 15;
  
  if (prediction6m <= 30) probabiliteSeuil30_6m = 70;
  else if (prediction6m <= 40) probabiliteSeuil30_6m = 35;
  else if (prediction6m <= 50) probabiliteSeuil30_6m = 10;
  
  // Ajustement par Hawkes
  if (hawkes.riskNext30Days > 50) {
    probabiliteDegradation3m = Math.min(95, probabiliteDegradation3m + 15);
    probabiliteSeuil30_3m = Math.min(90, probabiliteSeuil30_3m + 10);
  }
  
  // Niveau d'urgence
  let niveauUrgence: ProactiveAlert['niveauUrgence'] = 'info';
  let messageCourt = '';
  let messageLong = '';
  let actionSuggerer = '';
  let delaiEstimeJours: number | null = null;
  
  if (currentScore < 30) {
    niveauUrgence = 'critique';
    messageCourt = 'Score critique - Action immédiate requise';
    messageLong = `Le score actuel est de ${currentScore}/100, en dessous du seuil critique. Une surveillance inopinée doit être déclenchée dans les 7 jours.`;
    actionSuggerer = 'Déclencher mission inopinée immédiate';
    delaiEstimeJours = 7;
  } else if (probabiliteSeuil30_3m > 60 || (predictions.trend === 'baisse' && currentScore < 45)) {
    niveauUrgence = 'alerte';
    messageCourt = 'Risque élevé de bascule en critique';
    messageLong = `Le modèle prédit ${probabiliteSeuil30_3m}% de chances d\'atteindre le seuil critique dans 3 mois. La tendance est à la ${predictions.trend === 'baisse' ? 'dégradation' : 'stabilité précaire'}.`;
    actionSuggerer = 'Programmer surveillance renforcée dans les 30 jours';
    delaiEstimeJours = 30;
  } else if (predictions.trend === 'baisse' && currentScore < 55) {
    niveauUrgence = 'vigilance';
    messageCourt = 'Tendance à la dégradation';
    messageLong = `Le score diminue progressivement (${predictions.score3m}/100 prévu dans 3 mois). Une vigilance accrue est recommandée.`;
    actionSuggerer = 'Surveillance programmée maintenue, suivi mensuel';
    delaiEstimeJours = 60;
  } else if (hawkes.riskNext30Days > 60) {
    niveauUrgence = 'alerte';
    messageCourt = 'Risque de cascade d\'écarts';
    messageLong = `Le modèle Hawkes détecte un risque de ${hawkes.riskNext30Days}% de nouveaux écarts dans les 30 jours.`;
    actionSuggerer = 'Renforcer le suivi des écarts ouverts';
    delaiEstimeJours = 30;
  } else {
    messageCourt = 'Profil stable';
    messageLong = 'Aucune alerte particulière à signaler. Maintenir le planning de surveillance existant.';
    actionSuggerer = 'Poursuivre le programme en cours';
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
  };
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
    const roi = avgImprovement / Math.max(1, avgCost);
    
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
      roi: Math.round(roi * 10) / 10,
      confidence: Math.round(confidence)
    });
  }
  
  return results.sort((a,b) => b.roi - a.roi);
}

// ============================================================
// 11. DÉTECTION DE POINTS DE CHANGEMENT
// ============================================================

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
    const delaiEffectif = Math.max(1, Math.ceil((dateCloture.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24)));
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
  
  let baseFrequency = 2
  if (profilRisque.score_global < 30) {
    baseFrequency = 12
    justification.push(`Score critique (${profilRisque.score_global}/100) → base mensuelle`)
  } else if (profilRisque.score_global < 50) {
    baseFrequency = 6
    justification.push(`Score faible (${profilRisque.score_global}/100) → base bimestrielle`)
  } else if (profilRisque.score_global < 70) {
    baseFrequency = 3
    justification.push(`Score modéré (${profilRisque.score_global}/100) → base trimestrielle`)
  } else {
    baseFrequency = 1
    justification.push(`Score bon (${profilRisque.score_global}/100) → base annuelle`)
  }
  
  let trendFactor = 1
  if (profilRisque.tendance === 'baisse') {
    trendFactor = 1.3
    justification.push(`Tendance à la baisse → facteur ×1.3`)
  } else if (profilRisque.tendance === 'hausse') {
    trendFactor = 0.8
    justification.push(`Tendance à la hausse → facteur ×0.8`)
  } else {
    justification.push(`Tendance stable → facteur ×1.0`)
  }
  
  let c4Factor = 1
  if (profilRisque.c4 < 30) {
    c4Factor = 1.5
    justification.push(`Charge critique élevée (C4=${profilRisque.c4}/100) → facteur ×1.5`)
  } else if (profilRisque.c4 < 50) {
    c4Factor = 1.2
    justification.push(`Charge critique modérée (C4=${profilRisque.c4}/100) → facteur ×1.2`)
  } else {
    justification.push(`Charge critique normale (C4=${profilRisque.c4}/100) → facteur ×1.0`)
  }
  
  let typeFactor = 1
  if (aerodromeType === 'international') {
    typeFactor = 1.2
    justification.push(`Aéroport international → facteur ×1.2`)
  } else {
    justification.push(`Aéroport national → facteur ×1.0`)
  }
  
  let velocityFactor = 1
  if (profilRisque.velocity_metrics) {
    const vitesse = profilRisque.velocity_metrics.vitesse
    if (vitesse < -2) {
      velocityFactor = 1.5
      justification.push(`Dégradation rapide (${Math.abs(vitesse).toFixed(1)} pts/mois) → facteur ×1.5`)
    } else if (vitesse < -1) {
      velocityFactor = 1.2
      justification.push(`Dégradation modérée (${Math.abs(vitesse).toFixed(1)} pts/mois) → facteur ×1.2`)
    } else if (vitesse > 1) {
      velocityFactor = 0.8
      justification.push(`Amélioration (${vitesse.toFixed(1)} pts/mois) → facteur ×0.8`)
    } else {
      justification.push(`Stabilité → facteur ×1.0`)
    }
  }
  
  let ecartsFactor = 1
  if (nbEcartsCritiquesActifs > 2) {
    ecartsFactor = 1.5
    justification.push(`${nbEcartsCritiquesActifs} écarts critiques actifs → facteur ×1.5`)
  } else if (nbEcartsCritiquesActifs > 0) {
    ecartsFactor = 1.2
    justification.push(`${nbEcartsCritiquesActifs} écart(s) critique(s) actif(s) → facteur ×1.2`)
  }
  
  let incidentsFactor = 1
  if (hasActiveIncidents) {
    incidentsFactor = 1.3
    justification.push(`Incident(s) récent(s) → facteur ×1.3`)
  }
  
  let predictionFactor = 1
  if (profilRisque.prediction_3m && profilRisque.prediction_3m < 40) {
    predictionFactor = 1.2
    justification.push(`Prédiction N+1 défavorable (${profilRisque.prediction_3m}/100) → facteur ×1.2`)
  }
  if (profilRisque.prediction_6m && profilRisque.prediction_6m < 35) {
    predictionFactor = 1.1
    justification.push(`Prédiction N+2 défavorable (${profilRisque.prediction_6m}/100) → facteur ×1.1`)
  }
  
  let triggersFactor = 1
  if (triggers) {
    const triggerImpact = computeTriggersImpact(triggers)
    triggersFactor = triggerImpact
    if (triggerImpact > 1) {
      justification.push(`Présence de facteurs déclencheurs (${triggers.filter(t => t.actif).length} actif(s)) → facteur ×${triggersFactor.toFixed(1)}`)
    }
  }
  
  let aggravatorsFactor = 1
  if (aggravators) {
    const aggMultiplier = computeAggravatorsMultiplier(aggravators)
    aggravatorsFactor = aggMultiplier
    if (aggMultiplier > 1) {
      justification.push(`Présence de facteurs aggravants (${aggravators.filter(a => a.actif).length} actif(s)) → facteur ×${aggravatorsFactor.toFixed(1)}`)
    }
  }
  
  let finalFrequency = baseFrequency * trendFactor * c4Factor * typeFactor * velocityFactor * ecartsFactor * incidentsFactor * predictionFactor * triggersFactor * aggravatorsFactor
  finalFrequency = Math.min(12, Math.max(1, Math.round(finalFrequency)))
  
  let label = ''
  if (finalFrequency >= 12) label = 'Mensuelle (×12/an)'
  else if (finalFrequency >= 6) label = 'Bimensuelle (×6/an)'
  else if (finalFrequency >= 4) label = 'Trimestrielle (×4/an)'
  else if (finalFrequency >= 2) label = 'Semestrielle (×2/an)'
  else label = 'Annuelle (×1/an)'
  
  return { frequency: finalFrequency, label, justification }
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
    // Fallback (valeurs par défaut si pas de checklist)
    if (profilRisque.c3 < 50) {
      sousDomaines.push('PHY/Piste')
      sousDomaines.push('PHY/Balisege')
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

export function genererPlanningN1(
  aerodromeId: string,
  annee: number,
  profilRisque: ProfilRisque,
  historiqueSurveillances: Array<{ type: string; date: string; domaines: string[] }>,
  ecartsActifs?: { niveau_risque: string; domaine?: string }[],
  evenementsRecents?: { gravite: string }[],
  aerodromeType?: 'international' | 'national',
  triggers?: FacteurDeclencheur[],
  aggravators?: FacteurAggravant[],
  inspecteurs?: { id: string; nom: string; prenom: string; competences?: { domaine: string; niveau: string }[]; statut?: string }[]
): Partial<Planning>[] {
  const propositions: Partial<Planning>[] = [];
  
  const nbEcartsCritiquesActifs = ecartsActifs?.filter(e => e.niveau_risque === 'critique').length || 0
  const hasPendingPac = ecartsActifs?.some(e => e.niveau_risque === 'eleve' || e.niveau_risque === 'critique') || false
  const hasActiveIncidents = evenementsRecents?.some(e => e.gravite === 'CRITIQUE' || e.gravite === 'ORANGE') || false
  const typeAero = aerodromeType || 'national'
  
  const { frequency: frequence, label: frequenceLabel, justification: freqJustification } = computeOptimalFrequency(
    profilRisque,
    typeAero,
    nbEcartsCritiquesActifs,
    hasActiveIncidents,
    triggers,
    aggravators
  )
  
  const isCertificationPhase = historiqueSurveillances.some(h => h.type === 'certification')
  const { type: typeMission, justification: typeJustification } = computeOptimalMissionType(
    profilRisque,
    nbEcartsCritiquesActifs,
    hasPendingPac,
    isCertificationPhase,
    triggers
  )
  
  const domainesPrioritaires = getDomainesPrioritairesOptimises(profilRisque, ecartsActifs)
  const sousDomainesCritiques = getSousDomainesCritiquesOptimises(profilRisque)
  const equipeSuggerer = getEquipeSuggererOptimisee(domainesPrioritaires, inspecteurs || [])
  
  const moisDansAnnee = 12
  const intervalle = Math.floor(moisDansAnnee / frequence)
  
  for (let i = 0; i < frequence; i++) {
    const mois = i * intervalle + 1
    const dateDebut = new Date(annee, mois - 1, 1)
    const dateFin = new Date(annee, mois - 1, 3)
    
    const domainesSelectionnes = domainesPrioritaires.slice(0, 3)
    
    const objectifs = genererObjectifsOptimises(
      typeMission,
      domainesSelectionnes,
      profilRisque,
      freqJustification,
      typeJustification
    )
    
    propositions.push({
      aerodrome_id: aerodromeId,
      type: typeMission as Planning['type'],
      date_debut: dateDebut.toISOString(),
      date_fin: dateFin.toISOString(),
      portee: domainesSelectionnes,
      equipe_ids: equipeSuggerer.map(m => m.id),
      chef_id: equipeSuggerer[0]?.id || '',
      statut: 'planifiee',
      priorite: profilRisque.score_global < 30 ? 'critique' : 
                profilRisque.score_global < 50 ? 'haute' : 
                profilRisque.score_global < 70 ? 'moyenne' : 'basse',
      objectifs,
      est_proposition: true,
      annee_cible: annee,
    })
  }
  
  return propositions
}

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

export interface ScoreHistoryPoint {
  date: string;
  score: number;
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
  if (t > 3) return 0.999
  if (t < -3) return 0.001
  return 0.5 + t / 6
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
  if (historique.length < 3) {
    const margin = 15;
    return {
      lower: Math.max(0, prediction - margin),
      upper: Math.min(100, prediction + margin),
      margin
    };
  }
  
  const errors: number[] = [];
  for (let i = 1; i < historique.length; i++) {
    errors.push(Math.abs(historique[i] - historique[i-1]));
  }
  
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const z = confidence === 0.95 ? 1.96 : confidence === 0.9 ? 1.645 : 1.28;
  const margin = meanError * z;
  
  return {
    lower: Math.max(0, prediction - margin),
    upper: Math.min(100, prediction + margin),
    margin: Math.round(margin)
  };
}

/**
 * Calcule le niveau de confiance d'une prédiction basé sur l'historique
 */
export function computePredictionConfidence(
  historique: number[],
  prediction: number
): number {
  if (historique.length < 3) return 50;
  
  const lastValues = historique.slice(-3);
  const mean = lastValues.reduce((a, b) => a + b, 0) / lastValues.length;
  const deviation = Math.abs(prediction - mean);
  
  if (deviation <= 5) return 90;
  if (deviation <= 10) return 75;
  if (deviation <= 15) return 60;
  if (deviation <= 25) return 45;
  return 30;
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
  genererPlanningN1,
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
};