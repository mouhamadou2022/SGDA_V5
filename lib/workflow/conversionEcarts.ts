// lib/workflow/conversionEcarts.ts — Logique pure du workflow (saga)
// Construction d'un écart officiel depuis un brouillon de rédaction.
// Déplacé depuis lib/store/workflowSlice.ts : UUID garanti + barème via
// le contrat de flux (lib/flux.ts) — les vieux brouillons IDB utilisaient
// "ecart-<ts>-<rand>", incompatible avec Supabase.

import type { Surveillance } from '../store/surveillancesSlice';
import type { Ecart } from '../store';
import type { EcartRedaction } from '../store/ecartsRedactionSlice';
import { calculerDelaisEcart, normaliserIdEcart } from '../flux';

export function buildEcartOfficiel(
  ecartRedaction: EcartRedaction,
  surveillance: Surveillance,
  now: string,
  genererId: () => string = () => crypto.randomUUID(),
): Ecart {
  const newEcart: Ecart = {
    id: normaliserIdEcart(ecartRedaction.id, genererId),
    aerodrome_id: surveillance.aerodrome_id,
    surveillance_id: surveillance.id,
    // Domaine réel de l'écart (SGS, PHY, OLS…) ou portée principale.
    domaine: ecartRedaction.domaine || surveillance.portee?.[0] || 'SGS',
    reference: ecartRedaction.reference,
    ref_reglementaire: ecartRedaction.ref_reglementaire,
    libelle: ecartRedaction.libelle,
    niveau_risque: ecartRedaction.niveau,
    cellule_risque_oaci: ecartRedaction.cellule_risque_oaci,
    probabilite_risque: ecartRedaction.probabilite_risque,
    gravite_risque: ecartRedaction.gravite_risque,
    justification_risque_ia: ecartRedaction.justification_risque_ia,
    cellule_ia_suggeree: ecartRedaction.cellule_ia_suggeree,
    statut: 'pac_attendu',
    delai_pac: '',
    delai_regularisation: '',
    inspecteur_ref_id: surveillance.chef_id,
    created_at: ecartRedaction.created_at,
    updated_at: now,
  }

  // Délais selon le niveau de risque (barème unique lib/flux.ts).
  const delais = calculerDelaisEcart(ecartRedaction.niveau)
  newEcart.delai_pac = delais.delai_pac
  newEcart.delai_regularisation = delais.delai_regularisation
  return newEcart
}
