// lib/store/learningEnginesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Apprentissage (moteur générique) extraite du store monolithique,
// comportement identique. Délègue à lib/learningEngine (singleton).

import type { StateCreator } from 'zustand'
import type { AppStore, LearningFeedbackRecord, RecalibrationAlertRecord, ModelCalibrationRecord } from '../store'
import type { ResultatChecklist } from '@/types/checklist'
import { learningEngine, type LearningFeedback, type ModelCalibration, type RecalibrationAlert } from '../learningEngine'

export interface LearningEngineSlice {
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

export const createLearningEnginesSlice: StateCreator<AppStore, [], [], LearningEngineSlice> = (set, get) => ({
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
}
})
