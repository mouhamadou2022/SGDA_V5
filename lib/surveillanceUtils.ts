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

// ── Mapping type surveillance → abréviation pour références d'écarts ──
export const SURVEILLANCE_TYPE_ABBR: Record<string, string> = {
  certification: 'CERT',
  homologation: 'HOMOL',
  audit_complet: 'AUDIT',
  periodique: 'PERIO',
  suivi_ecarts: 'SUIVI',
  inopinee: 'INOP',
  inopine: 'INOP',
  mise_oeuvre_pac: 'MEP',
  speciale: 'SPEC',
  urgence: 'URG',
  programmee: 'PROG',
  maintien: 'MAINT',
};

export function getTypeAbbr(type: string): string {
  return SURVEILLANCE_TYPE_ABBR[type] || type.substring(0, 4).toUpperCase();
}

/**
 * Génère la référence d'un écart au nouveau format : YYYY-OACI-TYPE-PREFIX-NN
 */
export function generateEcartReference(
  aerodromeCode: string,
  year: number,
  typeAbbr: string,
  prefix: 'SDT' | 'SGS',
  numero: number
): string {
  return `${year}-${aerodromeCode}-${typeAbbr}-${prefix}-${String(numero).padStart(2, '0')}`;
}

/**
 * Calcule le prochain numéro de compteur pour une combinaison année+aéro+type+prefix
 */
export function computeNextEcartCounter(
  existingRedactions: { reference?: string }[],
  existingOfficialEcarts: { reference?: string }[],
  year: number,
  aerodromeCode: string,
  typeAbbr: string,
  prefix: 'SDT' | 'SGS'
): number {
  const pattern = `${year}-${aerodromeCode}-${typeAbbr}-${prefix}-`;
  const allExisting = [...existingRedactions, ...existingOfficialEcarts];
  const counters = allExisting
    .filter(e => e.reference?.startsWith(pattern))
    .map(e => {
      const num = parseInt(e.reference!.split('-').pop() || '0', 10);
      return isNaN(num) ? 0 : num;
    });
  return counters.length > 0 ? Math.max(...counters) + 1 : 1;
}

/**
 * Migre une référence d'écart de l'ancien format ECA-YYYY-NNN vers le nouveau format YYYY-OACI-TYPE-PREFIX-NN
 * Retourne la nouvelle référence ou l'ancienne si la migration n'est pas possible
 */
export function migrateEcartReference(
  oldReference: string,
  aerodromeCode: string,
  typeAbbr: string,
  prefix: 'SDT' | 'SGS',
  numero: number
): string {
  const yearMatch = oldReference.match(/ECA-(\d{4})-/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  return generateEcartReference(aerodromeCode, year, typeAbbr, prefix, numero);
}

/**
 * Fonction de migration en masse : parcourt tous les écarts officiels existants
 * et met à jour leur référence si elle est au format ECA-YYYY-NNN
 * @returns Nombre d'écarts migrés
 */
export async function migrateAllEcartsReferences(
  getEcarts: () => Ecart[],
  getSurveillance: (id: string) => Surveillance | undefined,
  getAerodrome: (id: string) => { code_oaci?: string } | undefined,
  updateEcartRef: (id: string, newReference: string) => Promise<boolean>
): Promise<number> {
  const ecarts = getEcarts();
  let migrated = 0;

  for (const ecart of ecarts) {
    if (!ecart.reference || !ecart.reference.startsWith('ECA-')) continue;

    const surveillance = getSurveillance(ecart.surveillance_id || '');
    if (!surveillance) continue;

    const aerodrome = getAerodrome(ecart.aerodrome_id || surveillance.aerodrome_id);
    if (!aerodrome?.code_oaci) continue;

    const typeAbbr = getTypeAbbr(surveillance.type);
    const prefix = ecart.domaine === 'SGS' ? 'SGS' : 'SDT';

    // Extraire le compteur actuel depuis l'ancienne référence
    const numMatch = ecart.reference.match(/(\d+)$/);
    const numero = numMatch ? parseInt(numMatch[1], 10) : 1;

    const newRef = migrateEcartReference(ecart.reference, aerodrome.code_oaci, typeAbbr, prefix, numero);
    if (newRef !== ecart.reference) {
      const success = await updateEcartRef(ecart.id, newRef);
      if (success) migrated++;
    }
  }

  return migrated;
}