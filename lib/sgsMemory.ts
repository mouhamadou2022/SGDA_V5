'use client';

import type { PAOELevel } from '@/types/checklist';
import type { AppStore } from './store';

let _storeState: AppStore | null = null
function getStoreState() {
  if (!_storeState) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAppStore } = require('./store')
    _storeState = useAppStore.getState()
  }
  return _storeState!
}
function refreshStore() {
  _storeState = null;
}

export interface SGSLevelCorrection {
  id: string;
  aerodrome_id: string;
  surveillance_id: string;
  composante_id: number;
  element_id: string;
  question_id: string;
  question_ref: string;
  question_texte: string;
  prediction: PAOELevel;
  correction: PAOELevel;
  date: string;
}

export interface SGSMemoryStats {
  total_corrections: number;
  confiance_moyenne: number;
  items_problematiques: number;
  elements_actifs: string[];
}

const MAX_RECORDS = 500;

export function recordSGSLevelCorrection(
  aerodrome_id: string,
  surveillance_id: string,
  composante_id: number,
  element_id: string,
  question_id: string,
  question_ref: string,
  question_texte: string,
  prediction: PAOELevel,
  correction: PAOELevel,
): void {
  if (prediction === correction) return;
  const store = getStoreState();
  const records = store.sgsMemoryRecords || [];

  const correctionRec: SGSLevelCorrection = {
    id: `${surveillance_id}_${question_id}_${Date.now()}`,
    aerodrome_id,
    surveillance_id,
    composante_id,
    element_id,
    question_id,
    question_ref,
    question_texte,
    prediction,
    correction,
    date: new Date().toISOString(),
  };

  const updated = [correctionRec, ...records].slice(0, MAX_RECORDS);
  store.setSgsMemoryRecords(updated);
  _storeState = null;
}

export function getSGSMemoryStats(aerodrome_id?: string): SGSMemoryStats {
  const store = getStoreState();
  const records = store.sgsMemoryRecords || [];
  const filtered = aerodrome_id ? records.filter(r => r.aerodrome_id === aerodrome_id) : records;

  if (filtered.length === 0) {
    return { total_corrections: 0, confiance_moyenne: 100, items_problematiques: 0, elements_actifs: [] };
  }

  // Confiance = 100 - taux de correction (plus on corrige, moins le modèle est fiable)
  const correctionsParElement: Record<string, { total: number; erreurs: number }> = {};
  for (const r of filtered) {
    if (!correctionsParElement[r.element_id]) correctionsParElement[r.element_id] = { total: 0, erreurs: 0 };
    correctionsParElement[r.element_id].total++;
    if (r.prediction !== r.correction) correctionsParElement[r.element_id].erreurs++;
  }

  const elements = Object.keys(correctionsParElement);
  const totErreurs = Object.values(correctionsParElement).reduce((s, e) => s + e.erreurs, 0);
  const totTotal = Object.values(correctionsParElement).reduce((s, e) => s + e.total, 0);
  const tauxErreurGlobal = totTotal > 0 ? totErreurs / totTotal : 0;
  const confiance = Math.round((1 - tauxErreurGlobal) * 100);

  const itemsProblematiques = Object.values(correctionsParElement).filter(e => e.total > 0 && e.erreurs / e.total > 0.3).length;

  return {
    total_corrections: filtered.length,
    confiance_moyenne: confiance,
    items_problematiques: itemsProblematiques,
    elements_actifs: elements.slice(0, 10),
  };
}

export function getSGSProblematicElements(aerodrome_id: string, seuil: number = 30): { element_id: string; taux_erreur: number; corrections: number }[] {
  const store = getStoreState();
  const records = (store.sgsMemoryRecords || []).filter(r => r.aerodrome_id === aerodrome_id);
  const parElement: Record<string, { total: number; erreurs: number }> = {};

  for (const r of records) {
    if (!parElement[r.element_id]) parElement[r.element_id] = { total: 0, erreurs: 0 };
    parElement[r.element_id].total++;
    if (r.prediction !== r.correction) parElement[r.element_id].erreurs++;
  }

  return Object.entries(parElement)
    .map(([element_id, d]) => ({
      element_id,
      taux_erreur: d.total > 0 ? Math.round((d.erreurs / d.total) * 100) : 0,
      corrections: d.total,
    }))
    .filter(e => e.taux_erreur >= seuil)
    .sort((a, b) => b.taux_erreur - a.taux_erreur)
    .slice(0, 10);
}
