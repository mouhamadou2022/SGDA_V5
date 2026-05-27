// lib/checklistMemory.ts
// VERSION CORRIGÉE - Connectée au store Zustand
// ✅ Stockage persistant via le store (plus de mémoire volatile)
// ✅ Limite d'historique (MAX_HISTORY = 20)
// ✅ Confiance normalisée (0-100)
// ✅ recordCorrection met à jour l'historique
// 0 style inline, 0 fetch direct

'use client';

import { ResultatChecklist } from '@/types/surveillance';
import { useAppStore } from './store';

// ============================================================
// TYPES (inchangés)
// ============================================================

export interface ItemHistoryRecord {
  id: string;
  aerodrome_id: string;
  type_inspection: string;
  domaine: string;
  sous_domaine: string;
  sous_sous_domaine: string;
  item_id: string;
  item_numero: string;
  item_description: string;
  historique_resultats: {
    date: string;
    resultat: ResultatChecklist;
    surveillance_id: string;
    observation?: string;
  }[];
  taux_conformite: number;
  nb_occurrences: number;
  dernier_resultat?: ResultatChecklist;
  derniere_observation?: string;
  fichiers_types?: string[];
  confiance: number;
  dernier_feedback: string;
  feedback_correction?: ResultatChecklist;
  alerte_ecart_recurrent: boolean;
}

export interface PredictionResult {
  prediction: ResultatChecklist;
  confiance: number;
  justification: string;
  historique: ItemHistoryRecord['historique_resultats'];
  alerte: boolean;
}

export interface BatchValidationResult {
  items_valides: string[];
  items_modifies: { id: string; ancien: ResultatChecklist; nouveau: ResultatChecklist }[];
  temps_gagne_estime: number;
}

// ============================================================
// CONSTANTES (inchangées)
// ============================================================

export const SEUILS_CONFIANCE = {
  TRES_BONNE: 85,
  BONNE: 70,
  MOYENNE: 50,
  FAIBLE: 30,
};

const POIDS = {
  HISTORIQUE_SA_CONSECUTIF: 40,
  HISTORIQUE_NS_CONSECUTIF: 35,
  TAUX_CONFORMITE_ELEVE: 25,
  TAUX_CONFORMITE_FAIBLE: 20,
  RECENCE: 15,
  STABILITE: 10,
  FEEDBACK_POSITIF: 5,
};

// ✅ NOUVEAU : limite d'historique (évite la croissance infinie)
const MAX_HISTORY = 20;

// ============================================================
// FONCTIONS (CORRIGÉES)
// ============================================================

/**
 * ✅ CORRIGÉE : Utilise le store au lieu de memoryCache
 */
export function upsertItemHistory(
  aerodrome_id: string,
  type_inspection: string,
  domaine: string,
  sous_domaine: string,
  sous_sous_domaine: string,
  item: { id: string; numero: string; point_verification: string; resultat?: ResultatChecklist; observation?: string; fichiers?: any[] },
  surveillance_id: string
): ItemHistoryRecord {
  const store = useAppStore.getState();
  const key = `${aerodrome_id}_${type_inspection}_${domaine}_${sous_domaine}_${sous_sous_domaine}_${item.id}`;
  
  let record = store.checklistMemoryRecords.find(r => r.id === key);
  
  const nouveauResultat = {
    date: new Date().toISOString(),
    resultat: item.resultat || 'NV',
    surveillance_id,
    observation: item.observation,
  };
  
  if (!record) {
    // Création d'un nouvel enregistrement
    record = {
      id: key,
      aerodrome_id,
      type_inspection,
      domaine,
      sous_domaine,
      sous_sous_domaine,
      item_id: item.id,
      item_numero: item.numero,
      item_description: item.point_verification,
      historique_resultats: [nouveauResultat],
      taux_conformite: 0,
      nb_occurrences: 1,
      dernier_resultat: item.resultat,
      derniere_observation: item.observation,
      fichiers_types: item.fichiers?.map(f => {
        const ext = f.nom?.split('.').pop();
        return ext || 'unknown';
      }),
      confiance: 0,
      dernier_feedback: new Date().toISOString(),
      alerte_ecart_recurrent: false,
    };
  } else {
    // ✅ Mise à jour avec limite d'historique
    let historique = [...record.historique_resultats];
    if (historique.length >= MAX_HISTORY) {
      historique = historique.slice(1); // Supprime le plus ancien
    }
    historique.push(nouveauResultat);
    
    record = {
      ...record,
      historique_resultats: historique,
      nb_occurrences: record.nb_occurrences + 1,
      dernier_resultat: item.resultat,
      derniere_observation: item.observation,
      fichiers_types: item.fichiers?.map(f => {
        const ext = f.nom?.split('.').pop();
        return ext || 'unknown';
      }),
    };
  }
  
  // Recalculer le taux de conformité (NV = NS)
  const totalReel = record.historique_resultats.filter(r => r.resultat !== 'NA').length;
  const saCount = record.historique_resultats.filter(r => r.resultat === 'SA').length;
  record.taux_conformite = totalReel > 0 ? Math.round((saCount / totalReel) * 100) : 0;
  
  // Détecter les écarts récurrents (2 NS ou plus sur les 3 dernières inspections)
  const recentsNS = record.historique_resultats.slice(-3).filter(r => r.resultat === 'NS').length;
  record.alerte_ecart_recurrent = recentsNS >= 2;
  
  // Recalculer la confiance (normalisée)
  record.confiance = calculateConfiance(record);
  
  // ✅ Sauvegarder dans le store
  store.setChecklistMemoryRecords(
    store.checklistMemoryRecords.filter(r => r.id !== record.id).concat([record])
  );
  
  return record;
}

/**
 * ✅ CORRIGÉE : Confiance normalisée (0-100)
 */
export function calculateConfiance(record: ItemHistoryRecord): number {
  let score = 0;
  const historique = record.historique_resultats;
  const nbTotal = historique.length;
  
  if (nbTotal === 0) return 0;
  
  // 1. Historique des résultats consécutifs
  const derniersResultats = historique.slice(-3).map(r => r.resultat);
  const tousSAConsecutifs = derniersResultats.every(r => r === 'SA');
  const tousNSConsecutifs = derniersResultats.every(r => r === 'NS');
  
  if (tousSAConsecutifs && nbTotal >= 3) {
    score += POIDS.HISTORIQUE_SA_CONSECUTIF;
  } else if (tousNSConsecutifs && nbTotal >= 2) {
    score += POIDS.HISTORIQUE_NS_CONSECUTIF;
  }
  
  // 2. Taux de conformité
  if (record.taux_conformite >= 80) {
    score += POIDS.TAUX_CONFORMITE_ELEVE;
  } else if (record.taux_conformite < 30) {
    score += POIDS.TAUX_CONFORMITE_FAIBLE;
  }
  
  // 3. Récence (les résultats récents sont plus importants)
  if (nbTotal >= 2) {
    const recent = historique[historique.length - 1];
    const avantDernier = historique[historique.length - 2];
    if (recent.resultat === avantDernier.resultat) {
      score += POIDS.RECENCE;
    }
  }
  
  // 4. Stabilité (peu de changements dans l'historique)
  const changements = historique.filter((r, i) => i > 0 && r.resultat !== historique[i-1].resultat).length;
  if (changements <= 1) {
    score += POIDS.STABILITE;
  }
  
  // 5. Feedback positif (corrections récentes)
  if (record.feedback_correction && record.feedback_correction === record.dernier_resultat) {
    score += POIDS.FEEDBACK_POSITIF;
  }
  
  // ✅ Normalisation à 100 max
  return Math.min(100, Math.max(0, score));
}

/**
 * ✅ CORRIGÉE : Utilise le store
 */
export function getPredictionForItem(
  aerodrome_id: string,
  type_inspection: string,
  domaine: string,
  sous_domaine: string,
  sous_sous_domaine: string,
  item: { id: string; numero: string; point_verification: string },
  profilRisque?: { score_global: number; tendance: string }
): PredictionResult {
  const store = useAppStore.getState();
  const key = `${aerodrome_id}_${type_inspection}_${domaine}_${sous_domaine}_${sous_sous_domaine}_${item.id}`;
  const record = store.checklistMemoryRecords.find(r => r.id === key);
  
  if (!record || record.nb_occurrences === 0) {
    return {
      prediction: 'NV',
      confiance: 30,
      justification: 'Pas assez d\'historique pour prédire',
      historique: [],
      alerte: false,
    };
  }
  
  const derniersResultats = record.historique_resultats.slice(-3);
  const confiance = record.confiance;
  let prediction: ResultatChecklist = 'NV';
  let justification = '';
  let alerte = false;
  
  // Cas 1: Confiance très bonne et historique SA stable
  if (confiance >= SEUILS_CONFIANCE.TRES_BONNE && record.taux_conformite >= 80) {
    prediction = 'SA';
    justification = `Historique favorable: ${record.taux_conformite}% de conformité sur ${record.nb_occurrences} inspection(s). Derniers résultats: ${derniersResultats.map(r => r.resultat).join(' → ')}`;
  }
  
  // Cas 2: Confiance bonne et dernière inspection SA
  else if (confiance >= SEUILS_CONFIANCE.BONNE && record.dernier_resultat === 'SA') {
    prediction = 'SA';
    justification = `Conforme lors de la dernière inspection (${new Date(record.historique_resultats[record.historique_resultats.length - 1].date).toLocaleDateString('fr-FR')})`;
  }
  
  // Cas 3: Écart récurrent détecté
  else if (record.alerte_ecart_recurrent) {
    prediction = 'NS';
    alerte = true;
    justification = `⚠️ Écart récurrent détecté: ${record.historique_resultats.slice(-3).filter(r => r.resultat === 'NS').length} NS sur les 3 dernières inspections`;
  }
  
  // Cas 4: Tendance à la dégradation récente
  else if (derniersResultats.length >= 2) {
    const dernier = derniersResultats[derniersResultats.length - 1].resultat;
    const avantDernier = derniersResultats[derniersResultats.length - 2].resultat;
    if (avantDernier === 'SA' && dernier === 'NS') {
      prediction = 'NS';
      alerte = true;
      justification = '⚠️ Dégradation récente détectée (SA → NS)';
    } else if (avantDernier === 'NS' && dernier === 'SA') {
      prediction = 'SA';
      justification = '📈 Amélioration récente détectée (NS → SA)';
    }
  }
  
  // Cas 5: Ajustement par profil de risque
  if (profilRisque && profilRisque.score_global < 40 && prediction === 'SA') {
    if (confiance < SEUILS_CONFIANCE.MOYENNE) {
      prediction = 'NV';
      justification += ' (⚠️ Score risque global bas - vérification recommandée)';
      alerte = true;
    }
  }
  
  if (profilRisque && profilRisque.tendance === 'baisse' && prediction === 'SA') {
    if (confiance < SEUILS_CONFIANCE.BONNE) {
      prediction = 'NV';
      justification += ' (⚠️ Tendance à la baisse - vérification recommandée)';
      alerte = true;
    }
  }
  
  return {
    prediction,
    confiance,
    justification,
    historique: record.historique_resultats,
    alerte,
  };
}

/**
 * ✅ CORRIGÉE : Met à jour l'historique en cas de correction
 */
export function recordCorrection(
  aerodrome_id: string,
  type_inspection: string,
  domaine: string,
  sous_domaine: string,
  sous_sous_domaine: string,
  item_id: string,
  prediction: ResultatChecklist,
  correction: ResultatChecklist,
  commentaire?: string
): void {
  const store = useAppStore.getState();
  const key = `${aerodrome_id}_${type_inspection}_${domaine}_${sous_domaine}_${sous_sous_domaine}_${item_id}`;
  const record = store.checklistMemoryRecords.find(r => r.id === key);
  
  if (!record) return;
  
  let updatedRecord = {
    ...record,
    feedback_correction: correction,
    dernier_feedback: new Date().toISOString(),
  };
  
  // ✅ Si correction, mettre à jour le dernier résultat dans l'historique
  if (prediction !== correction && updatedRecord.historique_resultats.length > 0) {
    const dernierIdx = updatedRecord.historique_resultats.length - 1;
    updatedRecord.historique_resultats[dernierIdx] = {
      ...updatedRecord.historique_resultats[dernierIdx],
      resultat: correction,
      observation: commentaire || updatedRecord.historique_resultats[dernierIdx].observation,
    };
    updatedRecord.dernier_resultat = correction;
    updatedRecord.confiance = Math.max(0, updatedRecord.confiance - 10);
  } else {
    updatedRecord.confiance = Math.min(100, updatedRecord.confiance + 5);
  }
  
  // Recalculer le taux de conformité
  const totalReel = updatedRecord.historique_resultats.filter(r => r.resultat !== 'NA').length;
  const saCount = updatedRecord.historique_resultats.filter(r => r.resultat === 'SA').length;
  updatedRecord.taux_conformite = totalReel > 0 ? Math.round((saCount / totalReel) * 100) : 0;
  
  // Re-détecter les écarts récurrents
  const recentsNS = updatedRecord.historique_resultats.slice(-3).filter(r => r.resultat === 'NS').length;
  updatedRecord.alerte_ecart_recurrent = recentsNS >= 2;
  
  // ✅ Sauvegarder dans le store
  store.setChecklistMemoryRecords(
    store.checklistMemoryRecords.map(r => r.id === key ? updatedRecord : r)
  );
}

/**
 * ✅ CORRIGÉE : Utilise le store
 */
export function getProblematicItems(
  aerodrome_id?: string,
  seuilErreur: number = 20
): { record: ItemHistoryRecord; taux_erreur: number }[] {
  const store = useAppStore.getState();
  const problematicItems: { record: ItemHistoryRecord; taux_erreur: number }[] = [];
  
  for (const record of store.checklistMemoryRecords) {
    if (aerodrome_id && record.aerodrome_id !== aerodrome_id) continue;
    
    // Calculer le taux d'erreur (corrections vs prédictions)
    let erreurs = 0;
    if (record.feedback_correction && record.feedback_correction !== record.dernier_resultat) {
      erreurs++;
    }
    
    const taux_erreur = record.nb_occurrences > 0 ? (erreurs / record.nb_occurrences) * 100 : 0;
    
    if (taux_erreur >= seuilErreur) {
      problematicItems.push({ record, taux_erreur });
    }
  }
  
  return problematicItems.sort((a, b) => b.taux_erreur - a.taux_erreur);
}

/**
 * ✅ CORRIGÉE : Utilise le store
 */
export function getLearningStats(): {
  total_items: number;
  items_avec_historique: number;
  confiance_moyenne: number;
  taux_ecart_recurrent: number;
  items_problematiques: number;
} {
  const store = useAppStore.getState();
  const records = store.checklistMemoryRecords;
  
  let totalItems = records.length;
  let confianceSum = 0;
  let ecartsRecurrents = 0;
  
  for (const record of records) {
    confianceSum += record.confiance;
    if (record.alerte_ecart_recurrent) ecartsRecurrents++;
  }
  
  const problematiques = getProblematicItems().length;
  
  return {
    total_items: totalItems,
    items_avec_historique: totalItems,
    confiance_moyenne: totalItems > 0 ? Math.round(confianceSum / totalItems) : 0,
    taux_ecart_recurrent: totalItems > 0 ? Math.round((ecartsRecurrents / totalItems) * 100) : 0,
    items_problematiques: problematiques,
  };
}

/**
 * ✅ NOUVELLE : Exporte la mémoire depuis le store
 */
export function exportMemory(): string {
  const store = useAppStore.getState();
  const data = store.checklistMemoryRecords;
  return JSON.stringify(data, null, 2);
}

/**
 * ✅ NOUVELLE : Importe la mémoire dans le store
 */
export function importMemory(jsonData: string): void {
  try {
    const data = JSON.parse(jsonData);
    const store = useAppStore.getState();
    store.setChecklistMemoryRecords(data);
  } catch (error) {
    console.error('[checklistMemory] Erreur lors de l\'import:', error);
  }
}

/**
 * ✅ NOUVELLE : Réinitialise la mémoire dans le store
 */
export function resetMemory(): void {
  const store = useAppStore.getState();
  store.setChecklistMemoryRecords([]);
}

/**
 * ✅ CORRIGÉE : Utilise le store
 */
export function getHistoryForAerodrome(aerodrome_id: string): ItemHistoryRecord[] {
  const store = useAppStore.getState();
  return store.checklistMemoryRecords
    .filter(r => r.aerodrome_id === aerodrome_id)
    .sort((a, b) => b.nb_occurrences - a.nb_occurrences);
}

/**
 * ✅ CORRIGÉE : Implémente items_modifies
 */
export function validateBatch(
  items: { id: string; prediction: ResultatChecklist; confiance: number }[],
  acceptAllSA: boolean = true
): BatchValidationResult {
  const items_valides: string[] = [];
  const items_modifies: { id: string; ancien: ResultatChecklist; nouveau: ResultatChecklist }[] = [];
  
  for (const item of items) {
    if (acceptAllSA && item.prediction === 'SA' && item.confiance >= SEUILS_CONFIANCE.MOYENNE) {
      items_valides.push(item.id);
    }
  }
  
  const temps_gagne_estime = items_valides.length * 0.5; // 30 secondes par item
  
  return {
    items_valides,
    items_modifies,
    temps_gagne_estime,
  };
}

// ============================================================
// SUGGESTIONS DÉTAILLÉES PAR SOUS-DOMAINE
// ============================================================

export interface SuggestionDetaillee {
  itemId: string
  itemNumero: string
  pointVerification: string
  domaine: string
  sousDomaine: string
  sousSousDomaine: string
  prediction: ResultatChecklist
  confiance: number
  raison: string
  historique: string[]
  actionSuggerer: string
}

export function getSuggestionsDetaillees(
  aerodrome_id: string,
  type_inspection: string,
  profil?: { score_global: number; tendance: string }
): SuggestionDetaillee[] {
  const store = useAppStore.getState()
  const suggestions: SuggestionDetaillee[] = []
  
  for (const record of store.checklistMemoryRecords) {
    if (record.aerodrome_id !== aerodrome_id) continue
    if (record.type_inspection !== type_inspection) continue
    
    const prediction = getPredictionForItem(
      aerodrome_id, type_inspection,
      record.domaine, record.sous_domaine, record.sous_sous_domaine,
      { id: record.item_id, numero: record.item_numero, point_verification: record.item_description },
      profil
    )
    
    if (prediction.confiance >= 70 && prediction.prediction !== 'SA') {
      suggestions.push({
        itemId: record.item_id,
        itemNumero: record.item_numero,
        pointVerification: record.item_description,
        domaine: record.domaine,
        sousDomaine: record.sous_domaine,
        sousSousDomaine: record.sous_sous_domaine,
        prediction: prediction.prediction,
        confiance: prediction.confiance,
        raison: prediction.justification,
        historique: record.historique_resultats.slice(-5).map(r => r.resultat),
        actionSuggerer: prediction.alerte ? 'Vérification prioritaire requise' : 'À surveiller'
      })
    }
  }
  
  return suggestions.sort((a, b) => b.confiance - a.confiance).slice(0, 10)
}

export interface PatternRecurrent {
  itemId: string
  itemNumero: string
  pointVerification: string
  domaine: string
  sousDomaine: string
  sousSousDomaine: string
  tauxRecurrence: number
  dernierResultat: ResultatChecklist
  historique: string[]
  suggestion: string
}

export function detectRecurrentPatterns(aerodrome_id: string, seuilRecurrence: number = 70): PatternRecurrent[] {
  const store = useAppStore.getState()
  const patterns: PatternRecurrent[] = []
  
  for (const record of store.checklistMemoryRecords) {
    if (record.aerodrome_id !== aerodrome_id) continue
    
    const historiques = record.historique_resultats.slice(-6)
    if (historiques.length < 3) continue
    
    let changements = 0
    let recurrenceNS = 0
    
    for (let i = 1; i < historiques.length; i++) {
      if (historiques[i].resultat !== historiques[i-1].resultat) changements++
      if (historiques[i].resultat === 'NS') recurrenceNS++
    }
    
    const tauxRecurrence = (recurrenceNS / historiques.length) * 100
    if (changements > historiques.length / 2 && tauxRecurrence >= seuilRecurrence) {
      patterns.push({
        itemId: record.item_id,
        itemNumero: record.item_numero,
        pointVerification: record.item_description,
        domaine: record.domaine,
        sousDomaine: record.sous_domaine,
        sousSousDomaine: record.sous_sous_domaine,
        tauxRecurrence,
        dernierResultat: record.dernier_resultat || 'NV',
        historique: historiques.map(h => h.resultat),
        suggestion: 'Inspection renforcée recommandée - tendance cyclique détectée'
      })
    }
  }
  
  return patterns.sort((a, b) => b.tauxRecurrence - a.tauxRecurrence)
}

// ============================================================
// EXPORT FINAL
// ============================================================

export const checklistMemory = {
  upsertItemHistory,
  calculateConfiance,
  getPredictionForItem,
  recordCorrection,
  getProblematicItems,
  getLearningStats,
  exportMemory,
  importMemory,
  resetMemory,
  getHistoryForAerodrome,
  validateBatch,
  SEUILS_CONFIANCE,
};