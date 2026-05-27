// lib/operatorUtils.ts
// Utilitaires spécifiques au portail exploitant

import { Ecart, Surveillance } from './store';

export const operatorUtils = {
  /**
   * Filtre les écarts accessibles à l'exploitant
   */
  getEcartsExploitant(ecarts: Ecart[], aerodromeId: string): Ecart[] {
    return ecarts.filter(e => e.aerodrome_id === aerodromeId);
  },

  /**
   * Calcule le nombre d'écarts par niveau de risque
   */
  getStatsEcarts(ecarts: Ecart[]): {
    critiques: number;
    eleves: number;
    moyens: number;
    faibles: number;
    total: number;
    enRetard: number;
  } {
    return {
      critiques: ecarts.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length,
      eleves: ecarts.filter(e => e.niveau_risque === 'eleve' && e.statut !== 'cloture').length,
      moyens: ecarts.filter(e => e.niveau_risque === 'moyen' && e.statut !== 'cloture').length,
      faibles: ecarts.filter(e => e.niveau_risque === 'faible' && e.statut !== 'cloture').length,
      total: ecarts.length,
      enRetard: ecarts.filter(e => e.statut === 'en_retard').length,
    };
  },

  /**
   * Vérifie si un exploitant peut soumettre un PAC
   */
  peutSoumettrePAC(ecart: Ecart, userRole: string): boolean {
    const rolesPermis = ['dg_operator', 'focal_operator'];
    const statutsPermis = ['ouvert', 'pac_attendu', 'pac_refuse'];
    
    return rolesPermis.includes(userRole) && statutsPermis.includes(ecart.statut);
  },

  /**
   * Vérifie si un exploitant peut soumettre des preuves
   */
  peutSoumettrePreuves(ecart: Ecart, userRole: string): boolean {
    const rolesPermis = ['dg_operator', 'focal_operator'];
    return rolesPermis.includes(userRole) && ecart.statut === 'pac_accepte';
  },

  /**
   * Génère un résumé des actions pour le tableau de bord exploitant
   */
  getActionsRequises(ecarts: Ecart[]): {
    pacASoumettre: number;
    preuvesASoumettre: number;
    total: number;
  } {
    return {
      pacASoumettre: ecarts.filter(e => ['ouvert', 'pac_attendu', 'pac_refuse'].includes(e.statut)).length,
      preuvesASoumettre: ecarts.filter(e => e.statut === 'pac_accepte').length,
      total: ecarts.filter(e => !['cloture', 'preuves_evaluees'].includes(e.statut)).length,
    };
  },

  /**
   * Formate le rôle pour affichage
   */
  formatRole(role: string): string {
    const map: Record<string, string> = {
      'dg_operator': 'Directeur d\'Exploitation',
      'focal_operator': 'Point Focal',
      'staff_operator': 'Personnel',
    };
    return map[role] || role;
  },

  /**
   * Détermine si l'exploitant a accès en écriture
   */
  hasWriteAccess(userRole: string): boolean {
    return ['dg_operator', 'focal_operator'].includes(userRole);
  },
};