// lib/planningUtils.ts
// Utilitaires pour la gestion des plannings de surveillance

import { Planning } from './store';

export interface PlanningStats {
  total: number;
  planifiees: number;
  enCours: number;
  realisees: number;
  annulees: number;
  enRetard: number;
  tauxRealisation: number;
}

export interface PlanningFilters {
  aerodromeId?: string;
  type?: string;
  statut?: string;
  annee?: number;
  priorite?: string;
  inspecteurId?: string;
}

/**
 * Calcule les statistiques globales des plannings
 * @param plannings Liste des plannings
 * @returns Statistiques calculées
 */
export function calculatePlanningStats(plannings: Planning[]): PlanningStats {
  const total = plannings.length;
  const planifiees = plannings.filter(p => p.statut === 'planifiee').length;
  const enCours = plannings.filter(p => p.statut === 'en_cours').length;
  const realisees = plannings.filter(p => p.statut === 'realisee').length;
  const annulees = plannings.filter(p => p.statut === 'annulee').length;
  const enRetard = plannings.filter(p => p.statut === 'en_retard').length;
  
  const tauxRealisation = total > 0 ? Math.round((realisees / total) * 100) : 0;

  return {
    total,
    planifiees,
    enCours,
    realisees,
    annulees,
    enRetard,
    tauxRealisation
  };
}

/**
 * Filtre les plannings selon les critères
 * @param plannings Liste des plannings
 * @param filters Critères de filtrage
 * @returns Plannings filtrés
 */
export function filterPlannings(plannings: Planning[], filters: PlanningFilters): Planning[] {
  return plannings.filter(p => {
    if (filters.aerodromeId && p.aerodrome_id !== filters.aerodromeId) return false;
    if (filters.type && p.type !== filters.type) return false;
    if (filters.statut && p.statut !== filters.statut) return false;
    if (filters.priorite && p.priorite !== filters.priorite) return false;
    if (filters.annee && new Date(p.date_debut).getFullYear() !== filters.annee) return false;
    if (filters.inspecteurId && !p.equipe_ids.includes(filters.inspecteurId)) return false;
    return true;
  });
}

/**
 * Vérifie si un planning est en retard
 * @param planning Planning à vérifier
 * @returns true si en retard, false sinon
 */
export function isPlanningEnRetard(planning: Planning): boolean {
  if (planning.statut === 'realisee' || planning.statut === 'annulee') return false;
  const now = new Date();
  const dateFin = new Date(planning.date_fin);
  return dateFin < now;
}

/**
 * Calcule la durée d'un planning en jours
 * @param planning Planning
 * @returns Nombre de jours
 */
export function getPlanningDuration(planning: Planning): number {
  const start = new Date(planning.date_debut);
  const end = new Date(planning.date_fin);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
}

/**
 * Groupe les plannings par aérodrome
 * @param plannings Liste des plannings
 * @returns Map des plannings groupés par aérodrome
 */
export function groupPlanningsByAerodrome(plannings: Planning[]): Map<string, Planning[]> {
  const grouped = new Map<string, Planning[]>();
  
  plannings.forEach(planning => {
    if (!grouped.has(planning.aerodrome_id)) {
      grouped.set(planning.aerodrome_id, []);
    }
    grouped.get(planning.aerodrome_id)!.push(planning);
  });
  
  return grouped;
}

/**
 * Calcule la charge de travail par inspecteur
 * @param plannings Liste des plannings
 * @returns Map de la charge par inspecteur (en jours)
 */
export function calculateInspectorLoad(plannings: Planning[]): Map<string, number> {
  const loadMap = new Map<string, number>();
  
  plannings.forEach(planning => {
    const duration = getPlanningDuration(planning);
    planning.equipe_ids.forEach(inspId => {
      const currentLoad = loadMap.get(inspId) || 0;
      loadMap.set(inspId, currentLoad + duration);
    });
  });
  
  return loadMap;
}

/**
 * Génère le planning N+1 basé sur le profil de risque
 * @param aerodromeId ID de l'aérodrome
 * @param niveauRisque Niveau de risque (excellent, bon, modere, critique)
 * @param annee Année cible
 * @returns Proposition de planning
 */
export function genererPlanningN1(
  aerodromeId: string, 
  niveauRisque: string, 
  annee: number
): Partial<Planning>[] {
  const propositions: Partial<Planning>[] = [];
  
  // Définir la fréquence selon le niveau de risque
  const frequences = {
    excellent: { nb: 1, mois: [3] }, // 1 fois/an
    bon: { nb: 2, mois: [2, 8] }, // 2 fois/an
    modere: { nb: 4, mois: [1, 4, 7, 10] }, // 4 fois/an
    critique: { nb: 12, mois: Array.from({ length: 12 }, (_, i) => i) } // 1 fois/mois
  };
  
  const freq = frequences[niveauRisque as keyof typeof frequences] || frequences.bon;
  
  freq.mois.forEach(mois => {
    const dateDebut = new Date(annee, mois, 15);
    const dateFin = new Date(annee, mois, 17);
    
    propositions.push({
      aerodrome_id: aerodromeId,
      type: 'programmee',
      date_debut: dateDebut.toISOString(),
      date_fin: dateFin.toISOString(),
      statut: 'planifiee',
      priorite: niveauRisque === 'critique' ? 'critique' : 'moyenne',
      est_proposition: true,
      annee_cible: annee,
      objectifs: `Surveillance ${niveauRisque === 'critique' ? 'renforcée' : 'de routine'}`
    });
  });
  
  return propositions;
}