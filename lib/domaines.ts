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
    const domaine = (item.domaine || domaineParDefaut) as string;
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
  evenementsSecurite?: Array<{ domaine: string; type: string; gravite: string }>;
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
typesChecklist: ['suivi_ecarts', ...(params.ecartsActifs.some(e => e.pac) ? ['pac'] as const : [])],
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
      if (getDomaineInfo(e.domaine)) {
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
