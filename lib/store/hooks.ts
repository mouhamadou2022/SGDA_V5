// lib/store/hooks.ts — Hooks React du store (extraits de lib/store.ts).
// Cycle store ↔ hooks sûr : useAppStore n est lu que dans les corps
// de fonctions (jamais à l évaluation du module).
// Point d'entree public : lib/store.ts (re-export).

import { useAppStore, type ProfilRisque } from '../store';
import type { PACLearningFeedback } from '../learningEnginePAC';
import type { TypeInspection } from '../checklistMemory';

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

export const useDecisionChecklist = () => {
  const decision = useAppStore((state) => state.decisionChecklist);
  const determineChecklistType = useAppStore((state) => state.determineChecklistType);
  return { decision, determineChecklistType };
};

export const usePredictionForItem = (
  aerodrome_id: string,
  type_inspection: TypeInspection,
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
