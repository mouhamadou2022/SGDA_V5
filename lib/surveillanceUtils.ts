// lib/surveillanceUtils.ts
// Utilitaires pour le module Surveillance

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
