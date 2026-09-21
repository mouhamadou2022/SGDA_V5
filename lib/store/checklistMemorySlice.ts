// lib/store/checklistMemorySlice.ts — Phase 2 (monolithe modulaire)
// Tranche Mémoire checklist extraite du store monolithique, comportement identique.
// Délègue à lib/checklistMemory (singleton).

import type { StateCreator } from 'zustand'
import type { AppStore, ChecklistMemoryRecord } from '../store'
import { checklistMemory, type PredictionResult, type BatchValidationResult, type TypeInspection } from '../checklistMemory'
import type { ResultatChecklist } from '@/types/checklist'
import type { ProfilRisque } from '../store'
import type { SuggestionDetaillee } from '../checklistMemory'

export interface ChecklistMemorySlice {
  checklistMemoryRecords: ChecklistMemoryRecord[];
  setChecklistMemoryRecords: (records: ChecklistMemoryRecord[]) => void;
  upsertItemHistory: (
    aerodrome_id: string,
    type_inspection: TypeInspection,
    domaine: string,
    sous_domaine: string,
    sous_sous_domaine: string,
    item: { id: string; numero: string; point_verification: string; resultat?: string; observation?: string; fichiers?: { nom: string; url: string; dateUpload: string }[] },
    surveillance_id: string
  ) => void;
  getPredictionForItem: (
    aerodrome_id: string,
    type_inspection: TypeInspection,
    domaine: string,
    sous_domaine: string,
    sous_sous_domaine: string,
    item: { id: string; numero: string; point_verification: string },
    profil?: ProfilRisque
  ) => PredictionResult;
  recordCorrection: (
    aerodrome_id: string,
    type_inspection: TypeInspection,
    domaine: string,
    sous_domaine: string,
    sous_sous_domaine: string,
    item_id: string,
    prediction: string,
    correction: string,
    commentaire?: string
  ) => void;
  getProblematicItems: (aerodrome_id?: string, seuilErreur?: number) => { record: ChecklistMemoryRecord; taux_erreur: number }[];
  getSuggestionsWithAi?: (aerodromeId: string, type_inspection: TypeInspection) => Promise<SuggestionDetaillee[]>;
  getLearningStats: () => { total_items: number; items_avec_historique: number; confiance_moyenne: number; taux_ecart_recurrent: number; items_problematiques: number };
  validateBatchItems: (items: { id: string; prediction: ResultatChecklist; confiance: number }[], acceptAllSA?: boolean) => BatchValidationResult;
  addRapportVersion: (surveillanceId: string, sections: Record<string, unknown>, userId: string, userName: string) => void;
  addPlanningModification: (planningId: string, userId: string, userName: string, champ: string, ancien: string, nouveau: string) => void;
  importChecklistMemoryRecords: (items: {
    numero: string;
    reference_reglementaire: string;
    point_verification: string;
    directive_preuve: string;
    resultat?: 'SA' | 'NS' | 'NA';
    domaine: string;
  }[]) => void;
}

export const createChecklistMemorySlice: StateCreator<AppStore, [], [], ChecklistMemorySlice> = (set, get) => ({
checklistMemoryRecords: [],
setChecklistMemoryRecords: (records) => set({ checklistMemoryRecords: records }),
upsertItemHistory: (aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item, surveillance_id) => {
  const record = checklistMemory.upsertItemHistory(
    aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine,
    { id: item.id, numero: item.numero, point_verification: item.point_verification, resultat: item.resultat as ResultatChecklist | undefined, observation: item.observation, fichiers: item.fichiers },
    surveillance_id
  );
  set((state) => ({
    checklistMemoryRecords: state.checklistMemoryRecords.filter(r => r.id !== record.id).concat([record])
  }));
},
getPredictionForItem: (aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item, profil) => {
  return checklistMemory.getPredictionForItem(
    aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine,
    { id: item.id, numero: item.numero, point_verification: item.point_verification },
    profil
  );
},
recordCorrection: (aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine, item_id, prediction, correction, commentaire) => {
  checklistMemory.recordCorrection(
    aerodrome_id, type_inspection, domaine, sous_domaine, sous_sous_domaine,
    item_id, prediction as ResultatChecklist, correction as ResultatChecklist, commentaire
  );
  // Mettre à jour le store si nécessaire
  const record = get().checklistMemoryRecords.find(r => r.item_id === item_id);
  if (record) {
    set((state) => ({
      checklistMemoryRecords: state.checklistMemoryRecords.map(r =>
        r.item_id === item_id ? { ...r, feedback_correction: correction as ResultatChecklist, dernier_feedback: new Date().toISOString() } : r
      )
    }));
  }
},
getProblematicItems: (aerodrome_id, seuilErreur = 20) => {
  return checklistMemory.getProblematicItems(aerodrome_id, seuilErreur);
},
getLearningStats: () => {
  return checklistMemory.getLearningStats();
},
  validateBatchItems: (items: { id: string; prediction: ResultatChecklist; confiance: number }[], acceptAllSA = true) => {
  return checklistMemory.validateBatch(items, acceptAllSA);
},
importChecklistMemoryRecords: (items) => {
  const records: ChecklistMemoryRecord[] = items.map(item => {
    const resultat = item.resultat === 'NA' ? 'NA' : item.resultat === 'NS' ? 'NS' : item.resultat === 'SA' ? 'SA' : undefined;
    const key = `anacim_legacy_periodique_${item.domaine}__${item.numero}`;
    return {
      id: key,
      aerodrome_id: 'anacim_legacy',
      type_inspection: 'periodique',
      domaine: item.domaine,
      sous_domaine: '',
      sous_sous_domaine: '',
      item_id: item.numero,
      item_numero: item.numero,
      item_description: JSON.stringify({
        pv: item.point_verification,
        ref: item.reference_reglementaire,
        dir: item.directive_preuve,
      }),
      historique_resultats: resultat ? [{
        date: new Date().toISOString(),
        resultat,
        surveillance_id: 'anacim_legacy',
      }] : [],
      taux_conformite: resultat === 'SA' ? 100 : resultat === 'NS' ? 0 : 50,
      nb_occurrences: resultat ? 1 : 0,
      dernier_resultat: resultat,
      confiance: 95,
      feedback_ajustement: 0,
      dernier_feedback: new Date().toISOString(),
      alerte_ecart_recurrent: false,
      nb_corrections: 0,
      nb_erreurs_correction: 0,
    };
  });
  set((state) => {
    const existing = state.checklistMemoryRecords.filter(r => r.aerodrome_id !== 'anacim_legacy');
    return { checklistMemoryRecords: [...existing, ...records] };
  });
},

getSuggestionsWithAi: async (aerodromeId, type_inspection) => {
  const { getSuggestionsDetaillees } = await import('@/lib/checklistMemory');
  const suggestions = getSuggestionsDetaillees(aerodromeId, type_inspection);
  return suggestions;
},

addRapportVersion: (surveillanceId, sections, userId, userName) => {
  set((state) => {
    const surv = state.surveillances.find(s => s.id === surveillanceId);
    if (!surv) return state;
    const versions = surv.rapport_versions ? JSON.parse(surv.rapport_versions) : [];
    const prevSections = surv.rapport_sections ? JSON.parse(surv.rapport_sections) : {};
    const diff: Record<string, { ancien: string; nouveau: string }> = {};
    for (const [key, val] of Object.entries(sections)) {
      if (JSON.stringify(prevSections[key]) !== JSON.stringify(val)) {
        diff[key] = { ancien: String(prevSections[key] || ''), nouveau: String(val || '') };
      }
    }
    if (Object.keys(diff).length === 0) return state;
    const version = {
      version: versions.length + 1,
      modifie_le: new Date().toISOString(),
      modifie_par: userId,
      modifie_par_nom: userName,
      sections_modifiees: Object.keys(diff),
      diff,
    };
    versions.push(version);
    if (versions.length > 50) versions.splice(0, versions.length - 50);
    return {
      surveillances: state.surveillances.map(s =>
        s.id === surveillanceId ? { ...s, rapport_versions: JSON.stringify(versions) } : s
      )
    };
  });
},

addPlanningModification: (planningId, userId, userName, champ, ancien, nouveau) => {
  set((state) => {
    const planning = state.plannings.find(p => p.id === planningId);
    if (!planning) return state;
    const mods = planning.planning_modifications ? JSON.parse(planning.planning_modifications) : [];
    mods.push({
      date: new Date().toISOString(),
      utilisateur_id: userId,
      utilisateur_nom: userName,
      champ,
      ancien: String(ancien),
      nouveau: String(nouveau),
    });
    if (mods.length > 100) mods.splice(0, mods.length - 100);
    return {
      plannings: state.plannings.map(p =>
        p.id === planningId ? { ...p, planning_modifications: JSON.stringify(mods) } : p
      )
    };
  });
}
})
