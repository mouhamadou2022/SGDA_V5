// lib/flux.ts — Monolithe modulaire (contrats de flux inter-workflows)
// Source unique des règles partagées par les transferts
// planning → surveillance → écart. Les deux conversions brouillon→officiel
// (transmission dans passerEtapeSuivante, réparation dans
// reparerEcartsManquants) gardent leurs différences métier voulues, mais
// partagent le barème des délais — une seule table à maintenir.
//
// Règle : tout nouveau transfert inter-workflow s'appuie sur ce module
// (types + helpers purs testés), jamais sur du code copié.

export type NiveauEcartFlux = 'critique' | 'eleve' | 'moyen' | 'faible';

/** Barème unique des délais PAC / régularisation par niveau (jours). */
export const DELAI_PAR_NIVEAU: Record<NiveauEcartFlux, { pac: number; regularisation: number }> = {
  critique: { pac: 3,  regularisation: 7   },
  eleve:    { pac: 7,  regularisation: 30  },
  moyen:    { pac: 15, regularisation: 90  },
  faible:   { pac: 30, regularisation: 180 },
};

/** Niveau inconnu/absent → 'moyen' (même repli des deux conversions). */
export function normaliserNiveauEcart(niveau: unknown): NiveauEcartFlux {
  return niveau === 'critique' || niveau === 'eleve' || niveau === 'moyen' || niveau === 'faible'
    ? niveau
    : 'moyen';
}

/**
 * Calcule les échéances ISO d'un écart à partir de son niveau.
 * `maintenant` injectable pour les tests (défaut : Date.now()).
 */
export function calculerDelaisEcart(
  niveau: unknown,
  maintenant: number = Date.now(),
): { delai_pac: string; delai_regularisation: string } {
  const delais = DELAI_PAR_NIVEAU[normaliserNiveauEcart(niveau)];
  const jour = 86400000;
  return {
    delai_pac: new Date(maintenant + delais.pac * jour).toISOString(),
    delai_regularisation: new Date(maintenant + delais.regularisation * jour).toISOString(),
  };
}

/** Champs minimaux qu'un brouillon doit fournir pour devenir officiel. */
export interface FluxBrouillonEcart {
  id: string;
  reference?: string;
  ref_reglementaire?: string;
  libelle?: string;
  niveau?: string;
  niveau_risque?: string;
  domaine?: string;
  cellule_risque_oaci?: string;
  probabilite_risque?: 1 | 2 | 3 | 4 | 5;
  gravite_risque?: 'A' | 'B' | 'C' | 'D' | 'E';
  justification_risque_ia?: string;
  cellule_ia_suggeree?: string;
  created_at?: string;
  created_by?: string;
}

/** Contexte de la surveillance d'origine (jamais réinventé). */
export interface FluxContexteSurveillance {
  surveillance_id: string;
  aerodrome_id: string;
  portee?: string[];
  chef_id?: string;
}

/** UUID valide (les vieux brouillons IDB utilisaient "ecart-<ts>-<rand>"). */
export function normaliserIdEcart(id: string | undefined, generer: () => string): string {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return id && UUID.test(id) ? id : generer();
}
