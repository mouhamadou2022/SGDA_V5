// lib/surveillanceUtils.ts
// Utilitaires pour le module Surveillance

import { Surveillance, Ecart } from './store';

export interface SurveillanceStats {
  total: number;
  enCours: number;
  terminees: number;
  ecartsOuverts: number;
  checklistsSignees: number;
  rapportsSignes: number;
  tauxConformite: number;
}

export interface ChecklistItem {
  id: string;
  categorie: string;
  reference: string;
  description: string;
  resultat: 'SA' | 'NS' | 'NA' | 'NV';
  observation?: string;
  preuve_url?: string;
}

/**
 * Calcule le score de conformité d'une checklist
 * @param items Items de la checklist
 * @returns Score en pourcentage
 */
export function calculateChecklistScore(items: ChecklistItem[]): number {
  const totalItems = items.length;
  const saItems = items.filter(i => i.resultat === 'SA').length;
  return totalItems > 0 ? Math.round((saItems / totalItems) * 100) : 0;
}

/**
 * Filtre les items non conformes (NS et NV)
 * @param items Items de la checklist
 * @returns Items non conformes
 */
export function getNonConformItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter(i => i.resultat === 'NS' || i.resultat === 'NV');
}

/**
 * Vérifie si une surveillance peut être transmise
 * @param surveillance Surveillance à vérifier
 * @param ecarts Liste des écarts
 * @returns true si toutes les conditions sont remplies
 */
export function canTransmitSurveillance(surveillance: Surveillance, ecarts: Ecart[]): boolean {
  // Vérifier que la checklist est signée
  if (!surveillance.rapport_signe_par) return false;
  
  // Vérifier que tous les écarts sont traités
  const ecartsNonTraites = ecarts.filter(e => 
    e.statut !== 'cloture' && e.statut !== 'pac_accepte'
  );
  
  return ecartsNonTraites.length === 0;
}

/**
 * Génère la référence d'un écart
 * @param aerodromeCode Code OACI
 * @param year Année
 * @param numero Numéro séquentiel
 * @returns Référence formatée
 */
export function generateEcartReference(aerodromeCode: string, year: number, numero: number): string {
  const paddedNumero = numero.toString().padStart(3, '0');
  return `ECA-${year}-${paddedNumero}`;
}