// lib/learningPersistence.ts
// Bridge entre le store Zustand (persistant) et les moteurs d'apprentissage (mémoire)
// Assure la synchronisation des données au chargement de l'application

'use client';

import { learningEngine } from './learningEngine';
import { learningEnginePAC } from './learningEnginePAC';
import type { LearningFeedbackRecord, RecalibrationAlertRecord, ModelCalibrationRecord, PACLearningFeedbackRecord, PreuveLearningFeedbackRecord } from './store';

/**
 * Réimporte les données persistées du store vers le moteur learningEngine
 * Appeler au démarrage de l'application après hydratation du store
 */
export function syncLearningFromStore(data: {
  learningFeedbacks: LearningFeedbackRecord[]
  recalibrationAlerts: RecalibrationAlertRecord[]
  currentModel: ModelCalibrationRecord | null
}) {
  if (!data || data.learningFeedbacks.length === 0) return

  // Exporter les données du store au format JSON et les réimporter dans le moteur
  // On utilise importLearningData qui initialise les arrays du moteur
  const storeData = {
    feedbacks: data.learningFeedbacks,
    alerts: data.recalibrationAlerts,
    model: data.currentModel || undefined,
    exported_at: new Date().toISOString(),
  }

  learningEngine.importLearningData(JSON.stringify(storeData))
}

/**
 * Réimporte les données persistées du PAC learning engine
 */
export function syncPACFromStore(data: {
  pacFeedbacks: PACLearningFeedbackRecord[]
  preuveFeedbacks: PreuveLearningFeedbackRecord[]
  ponderationsCriteres: Record<string, number>
  ponderationsPriorisation: Record<string, number>
}) {
  if (!data || data.pacFeedbacks.length === 0) return

  // Réinjecter les feedbacks PAC dans le moteur
  // Le moteur PAC utilise des arrays in-memory, on les repeuple
  for (const fb of data.pacFeedbacks) {
    learningEnginePAC.enregistrerFeedbackPAC(
      fb.ecart_id,
      fb.aerodrome_id,
      fb.contexte as any,
      fb.criteres_suggere,
      fb.criteres_inspecteur,
      fb.decision_systeme,
      fb.decision_inspecteur,
      fb.feedback_utilite,
      fb.commentaire
    )
  }

  for (const fb of data.preuveFeedbacks) {
    learningEnginePAC.enregistrerFeedbackPreuves(
      fb.ecart_id,
      fb.aerodrome_id,
      fb.contexte as any,
      fb.criteres_suggere,
      fb.criteres_inspecteur,
      fb.decision_systeme,
      fb.decision_inspecteur,
      fb.feedback_utilite,
      fb.commentaire
    )
  }
}

/**
 * Planifie la recalibration automatique du learning engine
 */
export function startScheduledLearningRecalibration(
  getState: () => { currentModel: ModelCalibrationRecord | null },
  recalibrateModel: (declencheur?: 'auto' | 'manuel' | 'admin', initiePar?: string) => ModelCalibrationRecord
) {
  const INTERVAL_CHECK_MS = 60 * 60 * 1000 // 1 heure
  const RECALIBRATION_DAYS = 30

  setInterval(() => {
    const state = getState()
    const model = state.currentModel

    if (!model) return

    const lastCalib = new Date(model.date_calibration)
    const daysSince = (Date.now() - lastCalib.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince >= RECALIBRATION_DAYS) {
      console.log(`[LearningPersistence] Recalibration automatique déclenchée (${Math.floor(daysSince)} jours sans mise à jour)`)
      recalibrateModel('auto', 'system')
    }
  }, INTERVAL_CHECK_MS)

  console.log('[LearningPersistence] Scheduled learning recalibration active (check every hour)')
}
