// lib/store/riskEnginesSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Moteur de risque (décisions checklist) extraite du store
// monolithique, comportement identique. Délègue à lib/riskEngine.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { riskEngine, type DecisionChecklist, type DomainDegradation, type EcartUrgent } from '../riskEngine'
import type { Ecart, ProfilRisque } from '../store'

export interface RiskEngineSlice {
  decisionChecklist: DecisionChecklist | null;
  setDecisionChecklist: (decision: DecisionChecklist) => void;
  determineChecklistType: (profil: ProfilRisque, ecarts: Ecart[], typePlanning: string) => Promise<DecisionChecklist>;
  detectDomainDegradations: (profilActuel: ProfilRisque, profilPrecedent?: ProfilRisque) => DomainDegradation[];
  detectUrgentEcarts: (ecarts: Ecart[], profil: ProfilRisque) => EcartUrgent[];
  needsFullDomainAudit: (profil: ProfilRisque, degradations: DomainDegradation[], nbEcartsCritiques: number) => { necessaire: boolean; domaine: string; raison: string };
  calculateGlobalPriority: (profil: ProfilRisque) => 'critique' | 'haute' | 'moyenne' | 'basse';
  calculateRecommendedDelay: (profil: ProfilRisque, type: string) => number;
}

export const createRiskEnginesSlice: StateCreator<AppStore, [], [], RiskEngineSlice> = (set, get) => ({
decisionChecklist: null,
setDecisionChecklist: (decision) => set({ decisionChecklist: decision }),
determineChecklistType: async (profil, ecarts, typePlanning) => {
  const urgents = riskEngine.detectUrgentEcards(ecarts, profil);
  const degradations = riskEngine.detectDomainDegradations(profil);
  const decision = riskEngine.determineChecklistType(profil, urgents, degradations, typePlanning);
  set({ decisionChecklist: decision });
  return decision;
},
detectDomainDegradations: (profilActuel, profilPrecedent) => {
  return riskEngine.detectDomainDegradations(profilActuel, profilPrecedent);
},
detectUrgentEcarts: (ecarts, profil) => {
  return riskEngine.detectUrgentEcards(ecarts, profil);
},
needsFullDomainAudit: (profil, degradations, nbEcartsCritiques) => {
  return riskEngine.needsFullDomainAudit(profil, degradations, nbEcartsCritiques);
},
calculateGlobalPriority: (profil) => {
  return riskEngine.calculateGlobalPriority(profil);
},
calculateRecommendedDelay: (profil, type) => {
  return riskEngine.calculateRecommendedDelay(profil, type as 'programmee' | 'suivi_ecarts' | 'mise_oeuvre_pac' | 'audit_complet');
}
})
