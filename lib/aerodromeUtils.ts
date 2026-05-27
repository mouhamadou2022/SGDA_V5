// lib/aerodromeUtils.ts
// Utilitaires pour la gestion des aérodromes

import { Aerodrome } from './store';

export interface AerodromeFilters {
  search?: string;
  region?: string[];
  type?: string[];
  statut?: string[];
  niveauRisque?: string[];
}

export interface AerodromeStats {
  total: number;
  internationaux: number;
  nationaux: number;
  enService: number;
  suspendus: number;
  fermes: number;
  brouillons: number;
}

/**
 * Calcule les statistiques globales des aérodromes
 * @param aerodromes Liste des aérodromes
 * @returns Statistiques calculées
 */
export function calculateAerodromeStats(aerodromes: Aerodrome[]): AerodromeStats {
  return {
    total: aerodromes.length,
    internationaux: aerodromes.filter(a => a.type === 'international').length,
    nationaux: aerodromes.filter(a => a.type === 'national').length,
    enService: aerodromes.filter(a => a.statut === 'actif').length,
    suspendus: aerodromes.filter(a => a.statut === 'suspendu').length,
    fermes: aerodromes.filter(a => a.statut === 'ferme').length,
    brouillons: aerodromes.filter(a => a.statut === 'brouillon').length
  };
}

/**
 * Filtre les aérodromes selon les critères
 * @param aerodromes Liste des aérodromes
 * @param filters Critères de filtrage
 * @returns Aérodromes filtrés
 */
export function filterAerodromes(aerodromes: Aerodrome[], filters: AerodromeFilters): Aerodrome[] {
  return aerodromes.filter(a => {
    // Recherche texte
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        a.nom.toLowerCase().includes(searchLower) ||
        a.code_oaci.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Filtre région
    if (filters.region && filters.region.length > 0 && !filters.region.includes(a.region)) {
      return false;
    }

    // Filtre type
    if (filters.type && filters.type.length > 0) {
      const typeMatches = filters.type.some(t => {
        if (t === 'international') return a.type === 'international';
        if (t === 'national') return a.type === 'national';
        return false;
      });
      if (!typeMatches) return false;
    }

    // Filtre statut
    if (filters.statut && filters.statut.length > 0 && !filters.statut.includes(a.statut)) {
      return false;
    }

    return true;
  });
}

/**
 * Valide le format du code OACI
 * @param code Code OACI à valider
 * @returns true si valide, false sinon
 */
export function validateCodeOACI(code: string): boolean {
  const regex = /^[A-Z]{4}$/;
  return regex.test(code);
}

/**
 * Génère un code OACI unique basé sur le nom de l'aérodrome
 * @param nom Nom de l'aérodrome
 * @returns Code OACI proposé
 */
export function generateCodeOACI(nom: string): string {
  const mots = nom.split(' ');
  let code = '';
  
  if (mots.length >= 2) {
    // Prendre les premières lettres des deux premiers mots
    code = (mots[0][0] + mots[1][0]).toUpperCase();
  } else {
    // Prendre les deux premières lettres du mot
    code = nom.substring(0, 2).toUpperCase();
  }
  
  // Ajouter un suffixe aléatoire pour garantir l'unicité
  const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `GO${code}${suffix}`;
}

/**
 * Calcule le niveau de risque d'un aérodrome en fonction de son profil
 * @param maturiteSGS Niveau de maturité SGS (0-100)
 * @param nbEcartsCritiques Nombre d'écarts critiques
 * @param nbSurveillances Nombre de surveillances
 * @returns Niveau de risque calculé
 */
export function calculateRiskLevel(
  maturiteSGS: number,
  nbEcartsCritiques: number,
  nbSurveillances: number
): 'excellent' | 'bon' | 'modere' | 'critique' {
  let score = maturiteSGS <= 5 ? maturiteSGS * 20 : maturiteSGS;
  
  score -= nbEcartsCritiques * 10;
  
  score += Math.min(nbSurveillances * 2, 10);
  
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'bon';
  if (score >= 30) return 'modere';
  return 'critique';
}

/**
 * Vérifie si l'aérodrome a tous les documents requis
 * @param aerodrome Aérodrome à vérifier
 * @returns Liste des documents manquants
 */
export function getMissingDocuments(aerodrome: Aerodrome): string[] {
  const required = [
    'Certificat',
    'Manuel d\'aérodrome',
    'Plan de masse',
    'Procédures d\'exploitation'
  ];
  
  const missing: string[] = [];
  
  // Cette fonction serait complétée avec les vraies données du store
  if (!aerodrome.contacts || aerodrome.contacts.length === 0) {
    missing.push('Contact principal');
  }
  
  return missing;
}