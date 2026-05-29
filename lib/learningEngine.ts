// lib/learningEngine.ts
'use client';

import { ProfilRisque } from './store';
import { ResultatChecklist } from '@/types/surveillance';
import { checklistMemory, ItemHistoryRecord } from './checklistMemory';
import { riskEngine } from './riskEngine';

// Types
export interface LearningFeedback {
  id: string;
  date: string;
  aerodrome_id: string;
  item_id: string;
  domaine: string;
  sous_domaine: string;
  prediction: ResultatChecklist;
  confiance_avant: number;
  correction: ResultatChecklist;
  commentaire?: string;
  justesse: boolean;
  impact_confiance: number;
}

export interface ModelCalibration {
  version: number;
  date_calibration: string;
  dernier_recalibrage: string;
  version_modele: number;
  performances: {
    precision_globale: number;
    precision_par_domaine: Record<string, number>;
    taux_faux_positifs: number;
    taux_faux_negatifs: number;
    items_ameliores: number;
    items_degrades: number;
  };
  ajustements: {
    seuils_modifies: Record<string, number>;
    poids_ajustes: Record<string, number>;
  };
  declencheur: 'auto' | 'manuel' | 'admin';
  initie_par: string;
}

export interface RecalibrationAlert {
  id: string;
  date: string;
  niveau: 'info' | 'warning' | 'critical';
  message: string;
  details: {
    item_id?: string;
    domaine?: string;
    taux_erreur?: number;
    suggestions?: string[];
  };
  traitee: boolean;
  traitee_par?: string;
  traitee_le?: string;
}

// Stockage des feedbacks
let feedbacksStore: LearningFeedback[] = [];
let recalibrationAlerts: RecalibrationAlert[] = [];
let currentModel: ModelCalibration = {
  version: 1,
  date_calibration: new Date().toISOString(),
  dernier_recalibrage: new Date().toISOString(),
  version_modele: 1,
  performances: {
    precision_globale: 85,
    precision_par_domaine: {},
    taux_faux_positifs: 10,
    taux_faux_negatifs: 5,
    items_ameliores: 0,
    items_degrades: 0,
  },
  ajustements: {
    seuils_modifies: {},
    poids_ajustes: {},
  },
  declencheur: 'auto',
  initie_par: 'system',
};

// Seuils d'alerte
const SEUILS_ALERTE = {
  TAUX_ERREUR_CRITIQUE: 30,
  TAUX_ERREUR_ELEVE: 20,
  NB_FEEDBACKS_MIN: 10,
  DELAI_RECALIBRATION_JOURS: 30,
};

/**
 * Enregistrer un feedback de correction
 */
export function recordLearningFeedback(
  aerodrome_id: string,
  domaine: string,
  sous_domaine: string,
  item_id: string,
  prediction: ResultatChecklist,
  confiance_avant: number,
  correction: ResultatChecklist,
  commentaire?: string
): LearningFeedback {
  const justesse = prediction === correction;
  const impact_confiance = justesse ? 5 : -10;
  
  const feedback: LearningFeedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    date: new Date().toISOString(),
    aerodrome_id,
    item_id,
    domaine,
    sous_domaine,
    prediction,
    confiance_avant,
    correction,
    commentaire,
    justesse,
    impact_confiance,
  };
  
  feedbacksStore.push(feedback);
  
  // Mettre à jour la mémoire
  checklistMemory.recordCorrection(
    aerodrome_id,
    'programmee',
    domaine,
    sous_domaine,
    '',
    item_id,
    prediction,
    correction,
    commentaire
  );
  
  // Vérifier si une alerte est nécessaire
  checkForAlerts();

  // Réentraînement périodique du Random Forest (tous les 50 feedbacks)
  if (feedbacksStore.length % 50 === 0) {
    try {
      const { checklistPredictor } = require('@/lib/ia/models/randomForest')
      if (checklistPredictor) {
        const samples = feedbacksStore.map(f => ({
          features: [f.confiance_avant, f.impact_confiance || 0],
          label: f.correction,
        }))
        checklistPredictor.train(samples).catch(() => {})
        currentModel.dernier_recalibrage = new Date().toISOString()
        currentModel.version_modele += 1
      }
    } catch { /* RF unavailable */ }
  }
  
  return feedback;
}

/**
 * Vérifier si des alertes doivent être déclenchées
 */
export function checkForAlerts(): RecalibrationAlert[] {
  const nouvellesAlertes: RecalibrationAlert[] = [];
  
  // 1. Vérifier les items problématiques
  const problematicItems = checklistMemory.getProblematicItems();
  
  for (const { record, taux_erreur } of problematicItems) {
    if (taux_erreur >= SEUILS_ALERTE.TAUX_ERREUR_CRITIQUE) {
      const alerteExistante = recalibrationAlerts.find(
        a => a.details.item_id === record.item_id && !a.traitee
      );
      
      if (!alerteExistante) {
        nouvellesAlertes.push({
          id: `alert-${Date.now()}-${record.item_id}`,
          date: new Date().toISOString(),
          niveau: 'critical',
          message: `Taux d'erreur critique sur l'item ${record.item_numero} (${taux_erreur}%)`,
          details: {
            item_id: record.item_id,
            domaine: record.domaine,
            taux_erreur,
            suggestions: [
              'Vérifier la pertinence de l\'item',
              'Revoir les critères d\'évaluation',
              'Former les inspecteurs sur ce point',
            ],
          },
          traitee: false,
        });
      }
    } else if (taux_erreur >= SEUILS_ALERTE.TAUX_ERREUR_ELEVE) {
      const alerteExistante = recalibrationAlerts.find(
        a => a.details.item_id === record.item_id && !a.traitee
      );
      
      if (!alerteExistante) {
        nouvellesAlertes.push({
          id: `alert-${Date.now()}-${record.item_id}`,
          date: new Date().toISOString(),
          niveau: 'warning',
          message: `Taux d'erreur élevé sur l'item ${record.item_numero} (${taux_erreur}%)`,
          details: {
            item_id: record.item_id,
            domaine: record.domaine,
            taux_erreur,
            suggestions: ['Revoir la prédiction automatique pour cet item'],
          },
          traitee: false,
        });
      }
    }
  }
  
  // 2. Vérifier si une recalibration est nécessaire (périodique)
  const dernierRecalibrage = new Date(currentModel.date_calibration);
  const joursDepuisRecalibrage = (Date.now() - dernierRecalibrage.getTime()) / (1000 * 60 * 60 * 24);
  
  if (joursDepuisRecalibrage >= SEUILS_ALERTE.DELAI_RECALIBRATION_JOURS) {
    const alerteExistante = recalibrationAlerts.find(
      a => a.message.includes('recalibration') && !a.traitee
    );
    
    if (!alerteExistante) {
      nouvellesAlertes.push({
        id: `alert-calib-${Date.now()}`,
        date: new Date().toISOString(),
        niveau: 'info',
        message: `Recalibration du modèle recommandée (${Math.floor(joursDepuisRecalibrage)} jours sans mise à jour)`,
        details: {
          suggestions: ['Lancer une recalibration automatique', 'Vérifier les performances actuelles'],
        },
        traitee: false,
      });
    }
  }
  
  // Ajouter les nouvelles alertes
  recalibrationAlerts.push(...nouvellesAlertes);
  
  return nouvellesAlertes;
}

/**
 * Obtenir toutes les alertes non traitées
 */
export function getPendingAlerts(): RecalibrationAlert[] {
  return recalibrationAlerts.filter(a => !a.traitee);
}

/**
 * Marquer une alerte comme traitée
 */
export function acknowledgeAlert(alertId: string, traiteePar: string): void {
  const alert = recalibrationAlerts.find(a => a.id === alertId);
  if (alert) {
    alert.traitee = true;
    alert.traitee_par = traiteePar;
    alert.traitee_le = new Date().toISOString();
  }
}

/**
 * Calculer les performances actuelles du modèle
 */
export function calculatePerformance(): {
  precision_globale: number;
  precision_par_domaine: Record<string, number>;
  taux_faux_positifs: number;
  taux_faux_negatifs: number;
  total_feedbacks: number;
  feedbacks_recents: number;
} {
  if (feedbacksStore.length === 0) {
    return {
      precision_globale: 0,
      precision_par_domaine: {},
      taux_faux_positifs: 0,
      taux_faux_negatifs: 0,
      total_feedbacks: 0,
      feedbacks_recents: 0,
    };
  }
  
  // Feedbacks des 30 derniers jours
  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() - 30);
  const feedbacksRecents = feedbacksStore.filter(f => new Date(f.date) >= dateLimite);
  
  // Précision globale
  const justes = feedbacksStore.filter(f => f.justesse).length;
  const precisionGlobale = Math.round((justes / feedbacksStore.length) * 100);
  
  // Précision par domaine
  const domaines = [...new Set(feedbacksStore.map(f => f.domaine))];
  const precisionParDomaine: Record<string, number> = {};
  
  for (const domaine of domaines) {
    const feedbacksDomaine = feedbacksStore.filter(f => f.domaine === domaine);
    const justesDomaine = feedbacksDomaine.filter(f => f.justesse).length;
    precisionParDomaine[domaine] = feedbacksDomaine.length > 0 ? Math.round((justesDomaine / feedbacksDomaine.length) * 100) : 0;
  }
  
  // Taux de faux positifs (prédiction SA mais correction NS)
  const fauxPositifs = feedbacksStore.filter(f => f.prediction === 'SA' && f.correction === 'NS').length;
  const totalPredictionsSA = feedbacksStore.filter(f => f.prediction === 'SA').length;
  const tauxFauxPositifs = totalPredictionsSA > 0 ? Math.round((fauxPositifs / totalPredictionsSA) * 100) : 0;
  
  // Taux de faux négatifs (prédiction NS mais correction SA)
  const fauxNegatifs = feedbacksStore.filter(f => f.prediction === 'NS' && f.correction === 'SA').length;
  const totalPredictionsNS = feedbacksStore.filter(f => f.prediction === 'NS').length;
  const tauxFauxNegatifs = totalPredictionsNS > 0 ? Math.round((fauxNegatifs / totalPredictionsNS) * 100) : 0;
  
  return {
    precision_globale: precisionGlobale,
    precision_par_domaine: precisionParDomaine,
    taux_faux_positifs: tauxFauxPositifs,
    taux_faux_negatifs: tauxFauxNegatifs,
    total_feedbacks: feedbacksStore.length,
    feedbacks_recents: feedbacksRecents.length,
  };
}

/**
 * Recalibrer le modèle (automatique ou manuel)
 */
export function recalibrateModel(
  declencheur: 'auto' | 'manuel' | 'admin' = 'auto',
  initiePar: string = 'system'
): ModelCalibration {
  const performances = calculatePerformance();
  const problematicItems = checklistMemory.getProblematicItems(undefined, 15);
  
  // Ajuster les seuils en fonction des performances
  const seuilsModifies: Record<string, number> = {};
  const poidsAjustes: Record<string, number> = {};
  
  // Si le taux de faux positifs est élevé, augmenter le seuil de confiance pour SA
  if (performances.taux_faux_positifs > 15) {
    seuilsModifies['confiance_SA'] = 75;
  } else {
    seuilsModifies['confiance_SA'] = 70;
  }
  
  // Si le taux de faux négatifs est élevé, augmenter la vigilance sur NS
  if (performances.taux_faux_negatifs > 10) {
    seuilsModifies['vigilance_NS'] = 2;
  }
  
  // Mettre à jour le modèle
  currentModel = {
    version: currentModel.version + 1,
    date_calibration: new Date().toISOString(),
    dernier_recalibrage: new Date().toISOString(),
    version_modele: currentModel.version_modele,
    performances: {
      precision_globale: performances.precision_globale,
      precision_par_domaine: performances.precision_par_domaine,
      taux_faux_positifs: performances.taux_faux_positifs,
      taux_faux_negatifs: performances.taux_faux_negatifs,
      items_ameliores: problematicItems.filter(i => i.taux_erreur < 15).length,
      items_degrades: problematicItems.filter(i => i.taux_erreur > 25).length,
    },
    ajustements: {
      seuils_modifies: seuilsModifies,
      poids_ajustes: poidsAjustes,
    },
    declencheur,
    initie_par: initiePar,
  };
  
  return currentModel;
}

/**
 * Obtenir le modèle actuel
 */
export function getCurrentModel(): ModelCalibration {
  return currentModel;
}

/**
 * Obtenir tous les feedbacks
 */
export function getAllFeedbacks(): LearningFeedback[] {
  return [...feedbacksStore];
}

/**
 * Obtenir les feedbacks pour un aérodrome
 */
export function getFeedbacksForAerodrome(aerodrome_id: string): LearningFeedback[] {
  return feedbacksStore.filter(f => f.aerodrome_id === aerodrome_id);
}

/**
 * Obtenir les statistiques d'apprentissage détaillées
 */
export function getDetailedLearningStats(): {
  total_feedbacks: number;
  taux_justesse: number;
  alertes_pending: number;
  dernier_recalibrage: string;
  version_modele: number;
  precision_par_domaine: Record<string, number>;
  items_ameliores: number;
  items_degrades: number;
  confiance_moyenne: number;
} {
  const performances = calculatePerformance();
  const learningStats = checklistMemory.getLearningStats();
  const pendingAlerts = getPendingAlerts();
  
  return {
    total_feedbacks: performances.total_feedbacks,
    taux_justesse: performances.precision_globale,
    alertes_pending: pendingAlerts.length,
    dernier_recalibrage: currentModel.date_calibration,
    version_modele: currentModel.version,
    precision_par_domaine: performances.precision_par_domaine,
    items_ameliores: currentModel.performances.items_ameliores,
    items_degrades: currentModel.performances.items_degrades,
    confiance_moyenne: learningStats.confiance_moyenne,
  };
}

/**
 * Exporter toutes les données d'apprentissage
 */
export function exportLearningData(): string {
  const data = {
    feedbacks: feedbacksStore,
    alerts: recalibrationAlerts,
    model: currentModel,
    exported_at: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Importer des données d'apprentissage
 */
export function importLearningData(jsonData: string): void {
  try {
    const data = JSON.parse(jsonData);
    if (data.feedbacks) feedbacksStore = data.feedbacks;
    if (data.alerts) recalibrationAlerts = data.alerts;
    if (data.model) currentModel = data.model;
  } catch (error) {
    console.error('[learningEngine] Erreur lors de l\'import:', error);
  }
}

/**
 * Réinitialiser les données d'apprentissage
 */
export function resetLearningData(): void {
  feedbacksStore = [];
  recalibrationAlerts = [];
  currentModel = {
    version: 1,
    date_calibration: new Date().toISOString(),
    dernier_recalibrage: new Date().toISOString(),
    version_modele: 1,
    performances: {
      precision_globale: 85,
      precision_par_domaine: {},
      taux_faux_positifs: 10,
      taux_faux_negatifs: 5,
      items_ameliores: 0,
      items_degrades: 0,
    },
    ajustements: {
      seuils_modifies: {},
      poids_ajustes: {},
    },
    declencheur: 'auto',
    initie_par: 'system',
  };
}

/**
 * Exporter les fonctions utilitaires
 */
export const learningEngine = {
  recordLearningFeedback,
  checkForAlerts,
  getPendingAlerts,
  acknowledgeAlert,
  calculatePerformance,
  recalibrateModel,
  getCurrentModel,
  getAllFeedbacks,
  getFeedbacksForAerodrome,
  getDetailedLearningStats,
  exportLearningData,
  importLearningData,
  resetLearningData,
  SEUILS_ALERTE,
};