// lib/domaines.ts — SGDA V5
// Définition centralisée des domaines de surveillance et types de surveillance

// ─────────────────────────────────────────────────────
// DOMAINES DE SURVEILLANCE (hiérarchie AGA + domaines individuels)
// ─────────────────────────────────────────────────────

// Sous-domaines AGA (4 groupes fonctionnels)
export const SOUS_DOMAINES_AGA = [
  { code: 'AGA/EXPLOIT', label: 'Exploitation (SGS, Compétences, Procédures)', 
    domaines: ['SGS', 'COP', 'OPS'] },
  { code: 'AGA/GENIE_CIV', label: 'Génie Civil (PHY, OLS)', 
    domaines: ['PHY', 'OLS'] },
  { code: 'AGA/GENIE_ELEC', label: 'Génie Électrique (ELEC, MFP)', 
    domaines: ['ELEC', 'MFP'] },
  { code: 'AGA/SLI_RA', label: 'SLI et Risque Animalier (SLI, RA)', 
    domaines: ['SLI', 'RA'] },
] as const;

export const DOMAINES_SURVEILLANCE = [
  // Domaines individuels (8 domaines techniques)
  { code: 'SGS', label: 'Système de Gestion de la Sécurité', description: 'Manuel SGS, politiques, documentation, audits internes' },
  { code: 'SLI', label: 'Sauvetage et Lutte contre l\'Incendie', description: 'Service SSLIA, véhicules, équipements, temps d\'intervention' },
  { code: 'PHY', label: 'Caractéristiques Physiques', description: 'Piste, taxiway, aire de stationnement, dégagements' },
  { code: 'OLS', label: 'Surface de Limitation d\'Obstacles', description: 'Surfaces OLS, obstacles, marquage des obstacles' },
  { code: 'RA', label: 'Risque Animalier', description: 'Gestion de la faune, péril animalier, prévention' },
  { code: 'ELEC', label: 'Réseaux Électriques', description: 'Balisage lumineux, centrales, réseaux électriques aérodromes' },
  { code: 'MFP', label: 'Marques, Feux et Panneaux', description: 'Marquage au sol, signalisation lumineuse et panneaux' },
  { code: 'COP', label: 'Compétences Organisationnelles et Personnels', description: 'Formation, habilitations, compétences du personnel' },
  { code: 'OPS', label: 'Procédures Opérationnelles', description: 'Procédures d\'exploitation, coordination, communication' },
  // Domaine global AGA (parent - sélection exclusive)
  { code: 'AGA', label: 'Aérodromes et Aides au Sol', description: 'Tous les domaines (sélection exclusive)', estGlobal: true },
] as const;

export type DomaineCode = typeof DOMAINES_SURVEILLANCE[number]['code'];

// ─────────────────────────────────────────────────────
// RÈGLE MÉTIER VERROUILLÉE — checklist PAC vs checklist écarts
// La checklist PAC (mise en œuvre) ne concerne QUE les PAC déjà ACCEPTÉS
// par l'inspecteur (surveiller un PAC non accepté n'a aucun sens).
// Tout le reste (ouvert → pac refusé) relève de la checklist écarts.
// ─────────────────────────────────────────────────────

/** Statuts dont le PAC est accepté (et aval) : éligibles checklist PAC. */
export const STATUTS_PAC_ACCEPTES = ['pac_accepte', 'preuves_soumises', 'preuves_evaluees'] as const

/** Statuts avant acceptation : relèvent de la checklist Écarts. */
export const STATUTS_PRE_ACCEPTATION = ['ouvert', 'pac_attendu', 'pac_soumis', 'pac_refuse'] as const

export interface EcartAvecPac {
  aerodrome_id?: string
  statut?: string
  niveau_risque?: string
  delai_regularisation?: string
  pac?: { actions?: Array<{ date_prevue?: string }> } | null
  evaluation_pac?: { decision?: string } | null
}

/**
 * En retard MAIS avec PAC accepté : l'accord existe, c'est l'exécution qui
 * est en retard → relève de la checklist PAC (pas des écarts).
 */
export function estEnRetardAccepte(e: EcartAvecPac | undefined | null): boolean {
  if (!e || e.statut !== 'en_retard') return false
  const decision = e.evaluation_pac?.decision
  return (decision === 'accepte' || decision === 'reserve') &&
    (e.pac?.actions?.length || 0) > 0
}

/** Écart relevant de la checklist PAC (accepté, aval preuves, ou retard-accepté). */
export function releveChecklistPAC(e: EcartAvecPac | undefined | null): boolean {
  if (!e) return false
  if ((e.pac?.actions?.length || 0) > 0 &&
    (STATUTS_PAC_ACCEPTES as readonly string[]).includes(e.statut || '')) return true
  return estEnRetardAccepte(e)
}

/**
 * Écart relevant de la checklist Écarts : pas de PAC accepté (absence,
 * attente, refus) ou retard sans acceptation. Exclut la clôture et
 * l'arbitrage chef (pas de terrain pendant ces phases).
 */
export function releveChecklistEcarts(e: EcartAvecPac | undefined | null): boolean {
  if (!e || e.statut === 'cloture' || e.statut === 'en_attente_validation_chef') return false
  if (releveChecklistPAC(e)) return false
  return (STATUTS_PRE_ACCEPTATION as readonly string[]).includes(e.statut || '') ||
    e.statut === 'en_retard'
}

/** Vrai si au moins un écart a un PAC accepté (avec actions, retard-accepté inclus). */
export function aPACAccepte(ecarts: readonly EcartAvecPac[] | undefined | null): boolean {
  return (ecarts || []).some(releveChecklistPAC)
}

// ─────────────────────────────────────────────────────
// ÉCHÉANCES — déclenchement de la surveillance PAC
// Fenêtre d'anticipation par risque (jours avant échéance) : plus le
// risque est grand, plus tôt on déclenche (temps d'organiser la mission).
// Le dépassé déclenche toujours, quel que soit le niveau.
// ─────────────────────────────────────────────────────

/** Fenêtre d'anticipation (jours) par niveau de risque. */
export const FENETRE_VERIF_PAR_RISQUE: Record<string, number> = {
  critique: 30,
  eleve: 21,
  moyen: 14,
  faible: 7,
}

export function fenetreVerification(niveauRisque?: string): number {
  return FENETRE_VERIF_PAR_RISQUE[niveauRisque || ''] ?? 14
}

/**
 * Priorité d'affichage par niveau (le retard prime toujours — voir
 * prioriteEcart —, le risque tranche à retard égal).
 */
export const PRIORITE_RISQUE: Record<string, number> = {
  critique: 4,
  eleve: 3,
  moyen: 2,
  faible: 1,
}

/**
 * Camp qui doit jouer sur un écart en suivi : l'exploitant (soumettre ou
 * resoumettre son PAC) ou l'inspecteur (évaluer — la balle est chez lui).
 */
export function campEnSuivi(e: { statut?: string; retard_inspecteur?: boolean } | undefined | null): 'exploitant' | 'inspecteur' {
  if (!e) return 'exploitant'
  if (e.statut === 'pac_soumis') return 'inspecteur'
  if (e.statut === 'en_retard' && e.retard_inspecteur) return 'inspecteur'
  return 'exploitant'
}

export interface AttenteEcart {
  camp: 'exploitant' | 'inspecteur' | 'chef' | null
  action: string
}

/**
 * Qualité d'un acteur ANACIM : seuls titulaires et principaux évaluent et
 * signent. Stagiaires et cadres techniques = observateurs (voient tout,
 * ne signent rien). Règle verrouillée, source unique.
 */
export type QualiteInspecteur = 'titulaire' | 'principal' | 'observateur';

/** Mapping brut (fiche inspecteur ou compte) → qualité. */
export function qualiteDepuisType(
  typeBrut: string | undefined | null,
): QualiteInspecteur {
  if (typeBrut === 'inspecteur_titulaire') return 'titulaire';
  if (typeBrut === 'inspecteur_principal') return 'principal';
  return 'observateur';
}

export interface SourceQualite {
  /** Type fiche inspecteur (prioritaire) ou compte (type_inspecteur). */
  type?: string;
  type_inspecteur?: string;
}

/** Qualité depuis une fiche ou un compte (fiche prioritaire si fournie). */
export function qualiteInspecteur(
  fiche: SourceQualite | undefined | null,
  compte?: SourceQualite | undefined | null,
): QualiteInspecteur {
  const brut = fiche?.type || compte?.type_inspecteur || compte?.type || null;
  return qualiteDepuisType(brut);
}

/** Vrai si l'acteur peut évaluer et signer (titulaire ou principal). */
export function aQualiteSignature(
  fiche: SourceQualite | undefined | null,
  compte?: SourceQualite | undefined | null,
): boolean {
  return qualiteInspecteur(fiche, compte) !== 'observateur';
}

/** Fiche inspecteur liée à un compte (inspecteur_id prioritaire, sinon user_id). */
export function trouverFicheInspecteur<T extends { id?: string; user_id?: string }>(
  fiches: readonly T[] | undefined | null,
  compte: { id?: string; inspecteur_id?: string } | undefined | null,
): T | undefined {
  if (!compte) return undefined;
  return (fiches || []).find(f =>
    (!!compte.inspecteur_id && f.id === compte.inspecteur_id) ||
    (f.user_id != null && f.user_id === compte.id));
}

/** Qualité de signature d'un compte (fiche liée prioritaire, compte en repli). */
export function qualiteCompte<T extends { id?: string; user_id?: string } & SourceQualite>(
  fiches: readonly T[] | undefined | null,
  compte: ({ id?: string; inspecteur_id?: string } & SourceQualite) | undefined | null,
): QualiteInspecteur {
  return qualiteInspecteur(trouverFicheInspecteur(fiches, compte) || undefined, compte);
}

export interface CompteDelegable extends SourceQualite {
  id?: string;
  inspecteur_id?: string;
  role?: string;
  statut?: string;
  prenom?: string;
  nom?: string;
}

/**
 * Retire accents et diacritiques (propriété Unicode, aucun caractère
 * invisible dans le code). Source unique pour toutes les comparaisons
 * insensibles aux accents (recherche, récidive, matching).
 */
export function retirerDiacritiques(texte: string): string {
  return (texte || '').normalize('NFD').replace(/\p{M}/gu, '');
}

/** Normalisation de recherche : minuscules, sans accents, espaces condensés. */
export function normaliserRecherche(texte: string): string {
  return retirerDiacritiques((texte || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nom affichable d'un compte (jamais d'UUID brut). */
export function nomCompteDelegable(compte: CompteDelegable | undefined | null): string {
  const nom = `${compte?.prenom || ''} ${compte?.nom || ''}`.trim();
  return nom || compte?.id?.slice(0, 8) || 'Inconnu';
}

/**
 * R2 — résultat d'item valable pour le workflow : renseigné PAR un
 * signataire. Un résultat posé par un observateur = brouillon (visible,
 * reprisable, mais invisible des progressions, signatures et clôtures).
 * Rétrocompatibilité : sans auteur tracé (données anciennes), ça compte.
 */
export function estResultatValide<
  TFiche extends { id?: string; user_id?: string } & SourceQualite,
  TCpte extends CompteDelegable,
>(
  item: { resultat?: string | null; conclusion?: string | null; modified_by?: string } | undefined | null,
  fiches: readonly TFiche[] | undefined,
  comptes: readonly TCpte[] | undefined,
): boolean {
  const valeur = item?.resultat ?? item?.conclusion;
  if (!valeur || valeur === 'NV') return false;
  if (!item?.modified_by) return true;
  const compte = (comptes || []).find(c => c.id === item.modified_by);
  return qualiteCompte(fiches, compte) !== 'observateur';
}

/**
 * Item terminé pour la signature : résultat valide (signataire) OU Non
 * Vérifié avec motif écrit (on sait pourquoi : reporté, inaccessible…).
 * Un NV muet ou un brouillon = travail restant. Règle canonique des
 * progressions, restants et gates de signature.
 */
export function estItemTermine<
  TFiche extends { id?: string; user_id?: string } & SourceQualite,
  TCpte extends CompteDelegable,
>(
  item: {
    resultat?: string | null;
    conclusion?: string | null;
    observation?: string | null;
    observation_stylus_data?: string | null;
    commentaire?: string | null;
    modified_by?: string;
  } | undefined | null,
  fiches: readonly TFiche[] | undefined,
  comptes: readonly TCpte[] | undefined,
): boolean {
  const valeur = (item?.resultat ?? item?.conclusion ?? '').toUpperCase();
  if (!valeur) return false;
  if (valeur === 'NV') {
    return !!((item?.observation || '').trim() ||
      (item?.observation_stylus_data || '').trim() ||
      (item?.commentaire || '').trim());
  }
  return estResultatValide(
    { resultat: item?.resultat, conclusion: item?.conclusion, modified_by: item?.modified_by },
    fiches, comptes);
}

/**
 * Signataires requis pour le rapport : titulaires et principaux de l'équipe
 * (chef compris), observateurs exclus. Règle R3, source unique.
 */
export function signatairesRequisRapport<
  TFiche extends { id?: string; user_id?: string } & SourceQualite,
  TCpte extends CompteDelegable,
>(
  equipeIds: readonly string[] | undefined,
  chefId: string | undefined | null,
  fiches: readonly TFiche[] | undefined,
  comptes: readonly TCpte[] | undefined,
): string[] {
  return [...new Set([...(equipeIds || []), ...(chefId ? [chefId] : [])])]
    .filter(Boolean)
    .filter(id => {
      const compte = (comptes || []).find(c => c.id === id);
      return qualiteCompte(fiches, compte) !== 'observateur';
    });
}

/**
 * Peut recevoir une délégation : inspecteur en activité ET qualité
 * signataire (titulaire ou principal). Stagiaires et cadres techniques =
 * observateurs, jamais proposés.
 */
export function peutRecevoirDelegation<T extends { id?: string; user_id?: string } & SourceQualite>(
  fiches: readonly T[] | undefined | null,
  compte: CompteDelegable | undefined | null,
): boolean {
  if (!compte || compte.role !== 'inspector') return false;
  if (compte.statut === 'inactif') return false;
  return qualiteCompte(fiches, compte) !== 'observateur';
}

/**
 * Qui doit jouer sur un écart (tous statuts) et quoi : affiché dans
 * l'historique et réutilisable (portail exploitant, relances).
 */
export function quiDoitJouer(statut?: string, retardInspecteur?: boolean): AttenteEcart {
  switch (statut) {
    case 'ouvert':
    case 'pac_attendu':
      return { camp: 'exploitant', action: 'Soumettre le PAC' }
    case 'pac_soumis':
      return { camp: 'inspecteur', action: 'Évaluer le PAC soumis' }
    case 'pac_refuse':
      return { camp: 'exploitant', action: 'Resoumettre un PAC révisé' }
    case 'pac_accepte':
      return { camp: 'exploitant', action: 'Réaliser les actions et déposer les preuves' }
    case 'preuves_soumises':
      return { camp: 'inspecteur', action: 'Vérifier et valider les preuves' }
    case 'preuves_evaluees':
      return { camp: 'chef', action: 'Arbitrer (réserves ou refus)' }
    case 'en_attente_validation_chef':
      return { camp: 'chef', action: "Valider l'évaluation" }
    case 'en_retard':
      return retardInspecteur
        ? { camp: 'inspecteur', action: 'Évaluation en retard — régulariser sans délai' }
        : { camp: 'exploitant', action: 'Régulariser sans délai' }
    case 'cloture':
      return { camp: null, action: 'Dossier clôturé' }
    default:
      return { camp: 'exploitant', action: 'Faire avancer le dossier' }
  }
}

/** Retard avéré d'un écart : régularisation dépassée (référence unique). */
export function estEnRetardReglementaire(
  delaiRegularisation: string | undefined | null,
  maintenant: number = Date.now(),
): boolean {
  const t = new Date(delaiRegularisation || '').getTime()
  return !isNaN(t) && t < maintenant
}

/** Échéance vérifiable : échue ou dans la fenêtre d'anticipation du risque. */
export function estEcheanceVerifiable(
  datePrevue: string | undefined | null,
  niveauRisque?: string,
  maintenant: number = Date.now(),
): boolean {
  const t = new Date(datePrevue || '').getTime()
  if (isNaN(t)) return false
  return t < maintenant + fenetreVerification(niveauRisque) * 86400000
}

/** Plus proche échéance des actions d'un PAC (ISO) ou null. */
export function prochaineEcheanceActions(pac: EcartAvecPac['pac']): string | null {
  const dates = (pac?.actions || [])
    .map(a => new Date(a?.date_prevue || '').getTime())
    .filter(t => !isNaN(t))
  if (dates.length === 0) return null
  return new Date(Math.min(...dates)).toISOString()
}

export interface JustificationSurveillancePAC {
  justifiee: boolean
  motif: string
  prochaineEcheance: string | null
}

/**
 * Une surveillance PAC se justifie seulement s'il y a quelque chose à
 * vérifier : preuves en attente, régularisation dépassée, ou action à
 * échéance proche/dépassée. Sinon : planifiée, pas lancée.
 */
export function justifierSurveillancePAC(
  ecarts: readonly EcartAvecPac[] | undefined | null,
  aerodromeId: string,
  maintenant: number = Date.now(),
): JustificationSurveillancePAC {
  const acceptes = (ecarts || []).filter(e =>
    e.aerodrome_id === aerodromeId && releveChecklistPAC(e))
  if (acceptes.length === 0) {
    return {
      justifiee: false,
      prochaineEcheance: null,
      motif: 'Aucun PAC accepté sur ce site — utilisez une surveillance de suivi des écarts tant que les PAC ne sont pas acceptés.',
    }
  }
  const preuvesEnAttente = acceptes.filter(e => e.statut === 'preuves_soumises')
  if (preuvesEnAttente.length > 0) {
    return {
      justifiee: true,
      prochaineEcheance: null,
      motif: `${preuvesEnAttente.length} preuve(s) en attente de vérification terrain.`,
    }
  }
  const regularisationDepassee = acceptes.filter(e => {
    const t = new Date(e.delai_regularisation || '').getTime()
    return !isNaN(t) && t < maintenant
  })
  if (regularisationDepassee.length > 0) {
    return {
      justifiee: true,
      prochaineEcheance: null,
      motif: `Délai de régularisation dépassé pour ${regularisationDepassee.length} écart(s) à PAC accepté.`,
    }
  }
  const avecEcheance = acceptes.filter(e =>
    (e.pac?.actions || []).some(a => estEcheanceVerifiable(a?.date_prevue, e.niveau_risque, maintenant)))
  if (avecEcheance.length > 0) {
    return {
      justifiee: true,
      prochaineEcheance: null,
      motif: `${avecEcheance.length} action(s) à échéance proche ou dépassée.`,
    }
  }
  const prochaines = acceptes
    .map(e => prochaineEcheanceActions(e.pac))
    .filter((d): d is string => !!d)
    .sort()
  const prochaine = prochaines.length > 0 ? prochaines[0] : null
  return {
    justifiee: false,
    prochaineEcheance: prochaine,
    motif: prochaine
      ? `Rien à vérifier pour l'instant — prochaine échéance le ${new Date(prochaine).toLocaleDateString('fr-FR')}.`
      : `Rien à vérifier pour l'instant — aucune échéance d'action à venir.`,
  }
}

// Domaines individuels (sans AGA)
export const DOMAINES_INDIVIDUELS = DOMAINES_SURVEILLANCE.filter(d => !('estGlobal' in d && d.estGlobal));

// Vérifier si un domaine est AGA (global)
export const isDomaineGlobal = (code: string): boolean => code === 'AGA';

// Obtenir tous les codes de domaines individuels
export const getDomainesIndividuelsCodes = (): DomaineCode[] =>
  DOMAINES_INDIVIDUELS.map(d => d.code as DomaineCode);

// Obtenir les infos d'un domaine par son code
export const getDomaineInfo = (code: string) =>
  DOMAINES_SURVEILLANCE.find(d => d.code === code);

// Obtenir le label d'un domaine par son code
export const getDomaineLabel = (code: string): string =>
  getDomaineInfo(code)?.label ?? code;

// Obtenir le sigle d'un domaine (code) — gère aussi le cas où la valeur stockée est le label
export function getDomaineCode(value: string): string {
  const byCode = DOMAINES_SURVEILLANCE.find(d => d.code === value);
  if (byCode) return byCode.code;
  const byLabel = DOMAINES_SURVEILLANCE.find(d => d.label === value);
  if (byLabel) return byLabel.code;
  return value;
}

// Si AGA est sélectionné, retourne tous les domaines individuels
// Si AGA/XXX est sélectionné, retourne les domaines correspondants
export const expandDomaines = (domaines: string[]): string[] => {
  const result: string[] = [];
  
  domaines.forEach(code => {
    if (code === 'AGA') {
      // AGA seul → tous les domaines individuels
      result.push(...getDomainesIndividuelsCodes());
    } else if (code.startsWith('AGA/')) {
      // AGA/XXX → domaines spécifiques du sous-groupe
      const sousDomaine = SOUS_DOMAINES_AGA.find(d => d.code === code);
      if (sousDomaine) {
        result.push(...sousDomaine.domaines);
      }
    } else {
      result.push(code);
    }
  });
  
  return [...new Set(result)]; // dédupliquer
};

// ─────────────────────────────────────────────────────────────
// TYPES DE SURVEILLANCE CONTINUE
// ─────────────────────────────────────────────────────────────

export const TYPES_SURVEILLANCE = [
  { code: 'periodique', label: 'Inspection Périodique', description: 'Inspection programmée couvrant un ou plusieurs domaines' },
  { code: 'inopine', label: 'Inspection Inopinée', description: 'Inspection non annoncée déclenchée par événement ou décision' },
  { code: 'maintien', label: 'Suivi du Maintien de la Sécurité', description: 'Vérification combinée : conformité persistante, écarts, PAC' },
] as const;

export type TypeSurveillanceContinue = typeof TYPES_SURVEILLANCE[number]['code'];

// Types de checklist utilisés dans une surveillance
export type TypeChecklist = 'standard' | 'suivi_ecarts' | 'pac';

export const getTypeSurveillanceInfo = (code: string) =>
  TYPES_SURVEILLANCE.find(t => t.code === code);

export const getTypeSurveillanceLabel = (code: string): string =>
  getTypeSurveillanceInfo(code)?.label ?? code;

// ─────────────────────────────────────────────────────────────
// STRUCTURE UNIFIÉE POUR DÉLÉGATION
// ─────────────────────────────────────────────────────────────

export interface EntiteDelegable {
  id: string;
  type: TypeSurveillanceContinue;
  domaine: DomaineCode;
  nom: string;
  description?: string;
  itemsCount: number;
  itemsIds: string[];
  priorite: 'haute' | 'moyenne' | 'basse';
  sourceId?: string; // ID de l'écart pour PAC/Suivi écarts
}

// ─────────────────────────────────────────────────────────────
// REGROUPEMENT PAR DOMAINE (pour PAC et Écarts)
// ─────────────────────────────────────────────────────────────

export interface DomaineItems<T> {
  domaine: DomaineCode;
  domaineLabel: string;
  items: T[];
}

// Regrouper des items par domaine
export function grouperParDomaine<T extends { domaine?: string }>(
  items: T[],
  domaineParDefaut: DomaineCode = 'SGS',
): DomaineItems<T>[] {
  const groupes: Map<string, T[]> = new Map();

  items.forEach(item => {
    const domaine = getDomaineCode((item.domaine || domaineParDefaut) as string);
    if (!groupes.has(domaine)) {
      groupes.set(domaine, []);
    }
    groupes.get(domaine)!.push(item);
  });

  return Array.from(groupes.entries()).map(([code, items]) => ({
    domaine: code as DomaineCode,
    domaineLabel: getDomaineLabel(code),
    items,
  }));
}

// ─────────────────────────────────────────────────────────────
// SUGGESTIONS POUR MAINTIEN DE LA SÉCURITÉ
// ─────────────────────────────────────────────────────────────

export interface SuggestionMaintien {
  domaines: DomaineCode[];
  typesChecklist: TypeChecklist[];
  raison: string;
  source: 'ecart_actif' | 'evenement_securite' | 'conformite_baisse' | 'domaine_critique' | 'historique' | 'lanceur_alerte';
  confiance: number; // 0-100
}

// Générer des suggestions pour le maintien de la sécurité
export function genererSuggestionsMaintien(params: {
  ecartsActifs?: Array<{ domaine: string; niveau_risque: string; pac?: any }>;
  evenementsSecurite?: Array<{ domaine?: string; type: string; gravite: string }>;
  profilRisque?: { c1: number; c3: number; c4: number; c5: number };
  domainesDerniereInspection?: Record<string, string>; // domaine -> date
  alertesLanceurs?: Array<{ domaine: string; description: string }>;
}): SuggestionMaintien[] {
  const suggestions: SuggestionMaintien[] = [];

  // 1. Écarts actifs → suggérer suivi écarts + PAC sur le domaine concerné
  if (params.ecartsActifs && params.ecartsActifs.length > 0) {
    const domainesEcarts = new Set<DomaineCode>();
    params.ecartsActifs.forEach(e => {
      if (getDomaineInfo(e.domaine)) {
        domainesEcarts.add(e.domaine as DomaineCode);
      }
    });
    if (domainesEcarts.size > 0) {
      suggestions.push({
        domaines: [...domainesEcarts],
typesChecklist: ['suivi_ecarts', ...(aPACAccepte(params.ecartsActifs) ? ['pac'] as const : [])],
        raison: `${params.ecartsActifs.length} écart(s) actif(s) nécessitent un suivi`,
        source: 'ecart_actif',
        confiance: 90,
      });
    }
  }

  // 2. Événements de sécurité → inspection inopinée sur les domaines impactés
  if (params.evenementsSecurite && params.evenementsSecurite.length > 0) {
    const domainesEvents = new Set<DomaineCode>();
    params.evenementsSecurite.forEach(e => {
      if (e.domaine && getDomaineInfo(e.domaine)) {
        domainesEvents.add(e.domaine as DomaineCode);
      }
    });
    if (domainesEvents.size > 0) {
      suggestions.push({
        domaines: [...domainesEvents],
        typesChecklist: ['standard', 'suivi_ecarts'],
        raison: `${params.evenementsSecurite.length} événement(s) de sécurité à investiguer`,
        source: 'evenement_securite',
        confiance: 85,
      });
    }
  }

  // 3. Profil de risque dégradé → suggérer vérification des domaines critiques
  if (params.profilRisque) {
    const domainesCritiques: DomaineCode[] = [];
    if (params.profilRisque.c1 < 50) domainesCritiques.push('SGS');
    if (params.profilRisque.c3 < 50) domainesCritiques.push('PHY', 'OLS', 'ELEC', 'MFP');
    if (params.profilRisque.c5 < 50) domainesCritiques.push('SLI', 'RA', 'COP');

    if (domainesCritiques.length > 0) {
      suggestions.push({
        domaines: [...new Set(domainesCritiques)],
        typesChecklist: ['standard'],
        raison: 'Dégradation du profil de risque sur certains domaines',
        source: 'conformite_baisse',
        confiance: 75,
      });
    }
  }

  // 4. Alertes des lanceurs d'alerte
  if (params.alertesLanceurs && params.alertesLanceurs.length > 0) {
    const domainesAlertes = new Set<DomaineCode>();
    params.alertesLanceurs.forEach(a => {
      if (getDomaineInfo(a.domaine)) {
        domainesAlertes.add(a.domaine as DomaineCode);
      }
    });
    if (domainesAlertes.size > 0) {
      suggestions.push({
        domaines: [...domainesAlertes],
        typesChecklist: ['standard', 'suivi_ecarts'],
        raison: `Alerte(s) de lanceur(s) à vérifier`,
        source: 'lanceur_alerte',
        confiance: 80,
      });
    }
  }

  // 5. Domaines non inspectés récemment (> 90 jours)
  if (params.domainesDerniereInspection) {
    const now = Date.now();
    const domainesOublies: DomaineCode[] = [];
    Object.entries(params.domainesDerniereInspection).forEach(([code, dateStr]) => {
      const daysSince = (now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 90 && getDomaineInfo(code)) {
        domainesOublies.push(code as DomaineCode);
      }
    });
    if (domainesOublies.length > 0) {
      suggestions.push({
        domaines: domainesOublies,
        typesChecklist: ['standard'],
        raison: `${domainesOublies.length} domaine(s) non inspecté(s) depuis plus de 90 jours`,
        source: 'historique',
        confiance: 70,
      });
    }
  }

  return suggestions.sort((a, b) => b.confiance - a.confiance);
}

// ── Spécialités métier des inspecteurs (réalité terrain) ──────────
export const SPECIALITES_INSPECTEUR: Array<{ code: string; label: string; domaines: string[] }> = [
  { code: 'EXPL',   label: 'Exploitation',          domaines: ['COP', 'OPS', 'OLS', 'SGS'] },
  { code: 'GC',     label: 'Génie Civil',           domaines: ['PHY'] },
  { code: 'GE',     label: 'Génie Électrique',      domaines: ['ELEC', 'MFP'] },
  { code: 'SLI_RA', label: 'SLI et Risque Animalier', domaines: ['SLI', 'RA'] },
];

export type SpecialiteCode = 'EXPL' | 'GC' | 'GE' | 'SLI_RA';

export function getDomainesFromSpecialites(specialites: string[]): string[] {
  return specialites.flatMap(sp => {
    const found = SPECIALITES_INSPECTEUR.find(s => s.code === sp)
    return found ? found.domaines : []
  })
}

export function couvertureSuffisante(
  domainesRequis: string[],
  specialitesEquipe: string[],
): { couvert: boolean; manquants: string[]; message: string } {
  const domainesCouverts = getDomainesFromSpecialites(specialitesEquipe)
  const manquants = domainesRequis.filter(d => !domainesCouverts.includes(d))
  if (manquants.length === 0) {
    return { couvert: true, manquants: [], message: '' }
  }
  return {
    couvert: false,
    manquants,
    message: `Domaines non couverts par l'équipe : ${manquants.join(', ')}`,
  }
}

export function verifierCompositionEquipe(
  equipeIds: string[],
  utilisateurs: any[],
  domainesRequis: string[],
): { valide: boolean; erreurs: string[] } {
  const erreurs: string[] = []
  const equipe = utilisateurs.filter(u => equipeIds.includes(u.id))
  const specialitesEquipe = equipe.flatMap(u => (u as any).specialites || [])
  const aUnExpl = specialitesEquipe.includes('EXPL')
  if (!aUnExpl) {
    erreurs.push('L\'équipe doit contenir au moins un inspecteur Exploitation (EXPL)')
  }
  const { couvert, manquants } = couvertureSuffisante(domainesRequis, specialitesEquipe)
  if (!couvert) {
    erreurs.push(`Couverture insuffisante — domaines manquants : ${manquants.join(', ')}`)
  }
  return { valide: erreurs.length === 0, erreurs }
}
