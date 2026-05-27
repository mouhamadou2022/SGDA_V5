// lib/adaptativeChecklist.ts
'use client';

import { ProfilRisque, Ecart, Surveillance, ChecklistItem } from './store';

// Types
export type ResultatChecklist = 'SA' | 'NS' | 'NA' | 'NV';

export interface BaseChecklistItem {
  id: string;
  numero: string;
  reference_reglementaire: string;
  point_verification: string;
  directive_preuve: string;
  domaine: string;
  sous_domaine: string;
  ordre: number;
  type: 'standard' | 'adaptatif';
  condition?: string;
  poids?: number;
}

export interface AdaptativeChecklistOptions {
  inclureHistorique?: boolean;
  maxItemsParDomaine?: number;
  prioriserDomainesCritiques?: boolean;
  niveauAdaptation?: 'minimal' | 'modere' | 'maximal';
}

// Checklist de base (RAS 14)
const BASE_CHECKLIST: BaseChecklistItem[] = [
  // SGS
  {
    id: 'sgs-001',
    numero: '1.1',
    reference_reglementaire: 'RAS 14 - 14.1.1',
    point_verification: 'Le gestionnaire d\'aérodrome dispose d\'un SGS formalisé et documenté',
    directive_preuve: 'Manuel SGS, organigramme, politique de sécurité signée par le DG',
    domaine: 'SGS',
    sous_domaine: 'SGS',
    ordre: 1,
    type: 'standard',
  },
  {
    id: 'sgs-002',
    numero: '1.2',
    reference_reglementaire: 'RAS 14 - 14.1.2',
    point_verification: 'Une politique de sécurité est diffusée et comprise par tout le personnel',
    directive_preuve: 'Affichage de la politique, compte-rendu de diffusion, quiz personnel',
    domaine: 'SGS',
    sous_domaine: 'SGS',
    ordre: 2,
    type: 'standard',
  },
  {
    id: 'sgs-003',
    numero: '1.3',
    reference_reglementaire: 'RAS 14 - 14.1.3',
    point_verification: 'Les objectifs de sécurité sont mesurables et suivis périodiquement',
    directive_preuve: 'Tableau de bord sécurité, PV de revue de direction, KPIs définis',
    domaine: 'SGS',
    sous_domaine: 'SGS',
    ordre: 3,
    type: 'standard',
  },
  // SLI
  {
    id: 'sli-001',
    numero: '2.1',
    reference_reglementaire: 'RAS 14 - 14.2.1',
    point_verification: 'Le plan de sauvetage et de lutte contre l\'incendie (SLI) est à jour',
    directive_preuve: 'Plan SLI daté et signé, dernière révision < 12 mois',
    domaine: 'SLI',
    sous_domaine: 'SLI',
    ordre: 4,
    type: 'standard',
  },
  {
    id: 'sli-002',
    numero: '2.2',
    reference_reglementaire: 'RAS 14 - 14.2.2',
    point_verification: 'Les véhicules d\'intervention sont disponibles, entretenus et conformes',
    directive_preuve: 'Carnet d\'entretien des véhicules, certificats de conformité',
    domaine: 'SLI',
    sous_domaine: 'SLI',
    ordre: 5,
    type: 'standard',
  },
  {
    id: 'sli-003',
    numero: '2.3',
    reference_reglementaire: 'RAS 14 - 14.2.3',
    point_verification: 'Les exercices d\'urgence sont organisés selon la fréquence réglementaire',
    directive_preuve: 'PV des exercices, liste de présence, rapport d\'évaluation',
    domaine: 'SLI',
    sous_domaine: 'SLI',
    ordre: 6,
    type: 'standard',
  },
  // PHY
  {
    id: 'phy-001',
    numero: '3.1',
    reference_reglementaire: 'RAS 14 - 14.3.1',
    point_verification: 'Les aires de mouvement sont inspectées quotidiennement',
    directive_preuve: 'Registre d\'inspections quotidiennes, fiche de contrôle signée',
    domaine: 'PHY',
    sous_domaine: 'PHY',
    ordre: 7,
    type: 'standard',
  },
  {
    id: 'phy-002',
    numero: '3.2',
    reference_reglementaire: 'RAS 14 - 14.3.2',
    point_verification: 'Le balisage lumineux de piste est fonctionnel et conforme',
    directive_preuve: 'Rapport de contrôle PAPI, VASIS, seuils et axes',
    domaine: 'PHY',
    sous_domaine: 'PHY',
    ordre: 8,
    type: 'standard',
  },
  {
    id: 'phy-003',
    numero: '3.3',
    reference_reglementaire: 'RAS 14 - 14.3.3',
    point_verification: 'Les clôtures et périmètre de sûreté sont intègres',
    directive_preuve: 'Rapport d\'inspection du périmètre, registre des anomalies',
    domaine: 'PHY',
    sous_domaine: 'PHY',
    ordre: 9,
    type: 'standard',
  },
  // OPS
  {
    id: 'ops-001',
    numero: '4.1',
    reference_reglementaire: 'RAS 14 - 14.4.1',
    point_verification: 'Les procédures opérationnelles sont documentées et accessibles',
    directive_preuve: 'Manuel d\'exploitation, liste des procédures en vigueur',
    domaine: 'OPS',
    sous_domaine: 'OPS',
    ordre: 10,
    type: 'standard',
  },
  {
    id: 'ops-002',
    numero: '4.2',
    reference_reglementaire: 'RAS 14 - 14.4.2',
    point_verification: 'La coordination avec les services de navigation aérienne est formalisée',
    directive_preuve: 'Protocole de coordination ANA-exploitant, comptes-rendus',
    domaine: 'OPS',
    sous_domaine: 'OPS',
    ordre: 11,
    type: 'standard',
  },
];

// Items adaptatifs basés sur le profil de risque
const ADAPTATIVE_ITEMS: Record<string, BaseChecklistItem[]> = {
  // Si C4 faible (charge critique élevée)
  c4_faible: [
    {
      id: 'adapt-c4-001',
      numero: 'A.1',
      reference_reglementaire: 'RAS 14 - Suivi écarts',
      point_verification: 'Vérification de l\'avancement des PAC pour les écarts critiques',
      directive_preuve: 'Tableau de suivi des PAC, preuves de levée des écarts',
      domaine: 'SGS',
      sous_domaine: 'Suivi écarts',
      ordre: 100,
      type: 'adaptatif',
      condition: 'c4 < 40',
    },
    {
      id: 'adapt-c4-002',
      numero: 'A.2',
      reference_reglementaire: 'RAS 14 - Écarts critiques',
      point_verification: 'Examen des délais de traitement des écarts critiques',
      directive_preuve: 'Historique des écarts, dates de soumission des PAC',
      domaine: 'SGS',
      sous_domaine: 'Délais écarts',
      ordre: 101,
      type: 'adaptatif',
      condition: 'c4 < 30',
    },
  ],
  // Si tendance baisse rapide
  tendance_baisse: [
    {
      id: 'adapt-trend-001',
      numero: 'B.1',
      reference_reglementaire: 'Analyse tendance',
      point_verification: 'Identification des causes de la dégradation rapide des indicateurs',
      directive_preuve: 'Analyse des tendances, entretiens avec le management',
      domaine: 'SGS',
      sous_domaine: 'Tendance',
      ordre: 102,
      type: 'adaptatif',
      condition: 'tendance_baisse && velocity < -1.5',
    },
    {
      id: 'adapt-trend-002',
      numero: 'B.2',
      reference_reglementaire: 'Plan de redressement',
      point_verification: 'Existence d\'un plan d\'action pour inverser la tendance',
      directive_preuve: 'Plan d\'action, suivi des actions, indicateurs de pilotage',
      domaine: 'SGS',
      sous_domaine: 'Plan action',
      ordre: 103,
      type: 'adaptatif',
      condition: 'tendance_baisse && score_global < 50',
    },
  ],
  // Si Hawkes intensity élevée (contagion)
  hawkes_eleve: [
    {
      id: 'adapt-hawkes-001',
      numero: 'C.1',
      reference_reglementaire: 'Analyse contagion',
      point_verification: 'Évaluation du risque de propagation des non-conformités',
      directive_preuve: 'Analyse des corrélations entre écarts, arbre des causes',
      domaine: 'SGS',
      sous_domaine: 'Risque systémique',
      ordre: 104,
      type: 'adaptatif',
      condition: 'hawkes_intensity > 0.6',
    },
    {
      id: 'adapt-hawkes-002',
      numero: 'C.2',
      reference_reglementaire: 'Barrières préventives',
      point_verification: 'Vérification de l\'efficacité des barrières existantes',
      directive_preuve: 'Documentation des barrières, tests d\'efficacité',
      domaine: 'SGS',
      sous_domaine: 'Barrières',
      ordre: 105,
      type: 'adaptatif',
      condition: 'hawkes_intensity > 0.7',
    },
  ],
  // Si système stress élevé
  stress_eleve: [
    {
      id: 'adapt-stress-001',
      numero: 'D.1',
      reference_reglementaire: 'Évaluation stress système',
      point_verification: 'Analyse des facteurs de stress sur l\'organisation',
      directive_preuve: 'Entretiens, questionnaire de climat sécurité',
      domaine: 'COP',
      sous_domaine: 'Climat sécurité',
      ordre: 106,
      type: 'adaptatif',
      condition: 'stress_score > 60',
    },
    {
      id: 'adapt-stress-002',
      numero: 'D.2',
      reference_reglementaire: 'Plan de réduction stress',
      point_verification: 'Vérification des actions pour réduire le stress',
      directive_preuve: 'Plan d\'action, suivi des indicateurs de compétences',
      domaine: 'COP',
      sous_domaine: 'Bien-être',
      ordre: 107,
      type: 'adaptatif',
      condition: 'stress_score > 70',
    },
  ],
  // Si aéroport international
  international: [
    {
      id: 'adapt-intl-001',
      numero: 'E.1',
      reference_reglementaire: 'Normes internationales',
      point_verification: 'Conformité aux standards OACI supplémentaires',
      directive_preuve: 'Certificats, audits de conformité',
      domaine: 'SGS',
      sous_domaine: 'International',
      ordre: 108,
      type: 'adaptatif',
      condition: 'type_aeroport === "international"',
    },
  ],
  // Si C1 faible (maturité SGS)
  c1_faible: [
    {
      id: 'adapt-c1-001',
      numero: 'F.1',
      reference_reglementaire: 'Maturité SGS',
      point_verification: 'Évaluation détaillée de la maturité SGS',
      directive_preuve: 'Grille d\'évaluation maturité, plan de progression',
      domaine: 'SGS',
      sous_domaine: 'Maturité',
      ordre: 109,
      type: 'adaptatif',
      condition: 'c1 < 50',
    },
  ],
};

/**
 * Évaluer si une condition est vraie
 */
function evaluateCondition(condition: string, profil: ProfilRisque, context?: {
  typeAeroport?: string;
  nbEcartsCritiques?: number;
}): boolean {
  if (!condition) return false;

  // Conditions simples
  if (condition === 'c4 < 40') return profil.c4 < 40;
  if (condition === 'c4 < 30') return profil.c4 < 30;
  if (condition === 'tendance_baisse && velocity < -1.5') {
    const vitesse = profil.velocity_metrics?.vitesse || 0;
    return profil.tendance === 'baisse' && vitesse < -1.5;
  }
  if (condition === 'tendance_baisse && score_global < 50') {
    return profil.tendance === 'baisse' && profil.score_global < 50;
  }
  if (condition === 'hawkes_intensity > 0.6') {
    return (profil.hawkes_intensity || 0) > 0.6;
  }
  if (condition === 'hawkes_intensity > 0.7') {
    return (profil.hawkes_intensity || 0) > 0.7;
  }
  if (condition === 'stress_score > 60') {
    const stressScore = profil.system_stress?.score || 0;
    return stressScore > 60;
  }
  if (condition === 'stress_score > 70') {
    const stressScore = profil.system_stress?.score || 0;
    return stressScore > 70;
  }
  if (condition === 'type_aeroport === "international"') {
    return context?.typeAeroport === 'international';
  }
  if (condition === 'c1 < 50') return profil.c1 < 50;

  return false;
}

/**
 * Calculer les scores de priorité par domaine
 */
function calculateDomainePriorities(profil: ProfilRisque): Record<string, number> {
  const priorities: Record<string, number> = {
    SGS: 100 - profil.c1,
    SLI: 100 - profil.c5,
    PHY: 100 - profil.c3,
    OPS: 100 - profil.c3,
    ELEC: 100 - profil.c3,
    MFP: 100 - profil.c3,
    COP: 100 - profil.c5,
    OLS: 100 - profil.c3,
    RA: 100 - profil.c5,
  };

  return priorities;
}

/**
 * Trier les items par ordre de priorité basée sur le profil
 */
function sortItemsByPriority(
  items: BaseChecklistItem[],
  priorities: Record<string, number>
): BaseChecklistItem[] {
  return [...items].sort((a, b) => {
    const priorityA = priorities[a.domaine] || 0;
    const priorityB = priorities[b.domaine] || 0;
    if (priorityB !== priorityA) return priorityB - priorityA;
    return a.ordre - b.ordre;
  });
}

/**
 * Préremplir les résultats basés sur l'historique
 */
function prefillFromHistory(
  items: BaseChecklistItem[],
  historique: Surveillance[]
): Partial<Record<string, ResultatChecklist>> {
  const prefill: Partial<Record<string, ResultatChecklist>> = {};

  // Si l'historique est vide, retourner vide
  if (historique.length === 0) return prefill;

  // Récupérer la dernière checklist similaire
  const derniereSurveillance = historique[0];
  
  // Simuler un préremplissage basé sur l'historique
  // Dans une vraie implémentation, on récupérerait les résultats réels du store
  items.forEach(item => {
    // Par défaut, NV
    prefill[item.id] = 'NV';
  });

  return prefill;
}

/**
 * Générer une checklist adaptative basée sur le profil de risque
 */
export function generateAdaptativeChecklist(
  profil: ProfilRisque,
  baseItems: BaseChecklistItem[] = BASE_CHECKLIST,
  options: AdaptativeChecklistOptions = {},
  context?: {
    typeAeroport?: string;
    nbEcartsCritiques?: number;
    historique?: Surveillance[];
  }
): {
  items: BaseChecklistItem[];
  prefill: Partial<Record<string, ResultatChecklist>>;
  justification: string[];
} {
  const {
    inclureHistorique = true,
    maxItemsParDomaine = 20,
    prioriserDomainesCritiques = true,
    niveauAdaptation = 'modere',
  } = options;

  const justification: string[] = [];
  let items = [...baseItems];

  // Ajouter les items adaptatifs selon les conditions
  if (niveauAdaptation !== 'minimal') {
    for (const [key, adaptItems] of Object.entries(ADAPTATIVE_ITEMS)) {
      for (const item of adaptItems) {
        const condition = item.condition || '';
        if (evaluateCondition(condition, profil, context)) {
          items.push(item);
          justification.push(`Ajout de l'item adaptatif ${item.numero}: ${item.point_verification.substring(0, 50)}... (condition: ${condition})`);
        }
      }
    }
  }

  // Calculer les priorités par domaine
  const priorities = calculateDomainePriorities(profil);
  
  // Trier par priorité si demandé
  if (prioriserDomainesCritiques) {
    items = sortItemsByPriority(items, priorities);
    justification.push(`Tri des items par priorité des domaines (basé sur profil risque)`);
  }

  // Limiter le nombre d'items par domaine
  if (maxItemsParDomaine < 20) {
    const groupedByDomaine: Record<string, BaseChecklistItem[]> = {};
    items.forEach(item => {
      if (!groupedByDomaine[item.domaine]) groupedByDomaine[item.domaine] = [];
      groupedByDomaine[item.domaine].push(item);
    });
    
    const limitedItems: BaseChecklistItem[] = [];
    for (const [domaine, domaineItems] of Object.entries(groupedByDomaine)) {
      const limit = maxItemsParDomaine;
      limitedItems.push(...domaineItems.slice(0, limit));
      if (domaineItems.length > limit) {
        justification.push(`Limitation des items du domaine ${domaine} à ${limit} (${domaineItems.length} disponibles)`);
      }
    }
    items = limitedItems;
  }

  // Préremplir les résultats
  let prefill: Partial<Record<string, ResultatChecklist>> = {};
  if (inclureHistorique && context?.historique) {
    prefill = prefillFromHistory(items, context.historique);
    justification.push(`Préremplissage basé sur l'historique des surveillances (${context.historique.length} précédentes)`);
  }

  // Ajout de justification sur le score global
  justification.push(`Score global: ${profil.score_global}/100 (${profil.tendance === 'baisse' ? 'tendance à la baisse' : 'tendance stable'})`);
  
  if (profil.c4 < 40) {
    justification.push(`Charge critique élevée (C4=${profil.c4}/100) - items adaptatifs ajoutés`);
  }
  
  const vitesse = profil.velocity_metrics?.vitesse ?? 0;
  if (vitesse < -1) {
    justification.push(`Dégradation rapide (${Math.abs(vitesse).toFixed(1)} pts/mois) - surveillance renforcée`);
  }

  return { items, prefill, justification };
}

/**
 * Adapter la checklist existante en fonction des résultats en temps réel
 */
export function adaptChecklistDuringMission(
  currentItems: BaseChecklistItem[],
  results: Record<string, ResultatChecklist>,
  profil: ProfilRisque
): {
  itemsAlerte: string[];
  itemsCritiques: string[];
  recommandations: string[];
} {
  const itemsAlerte: string[] = [];
  const itemsCritiques: string[] = [];
  const recommandations: string[] = [];

  // Identifier les items NS/NV
  const itemsNS = Object.entries(results).filter(([_, r]) => r === 'NS');
  const itemsNV = Object.entries(results).filter(([_, r]) => r === 'NV');

  // Compter par domaine
  const domainesWithIssues: Record<string, number> = {};
  const itemsWithIssues = [...itemsNS, ...itemsNV];
  
  for (const [itemId, _] of itemsWithIssues) {
    const item = currentItems.find(i => i.id === itemId);
    if (item) {
      domainesWithIssues[item.domaine] = (domainesWithIssues[item.domaine] || 0) + 1;
    }
  }

  // Générer des alertes
  for (const [domaine, count] of Object.entries(domainesWithIssues)) {
    if (count >= 3) {
      itemsAlerte.push(domaine);
      recommandations.push(`Alerte: ${count} non-conformités dans le domaine ${domaine} - investigation approfondie requise`);
    }
    if (count >= 5) {
      itemsCritiques.push(domaine);
      recommandations.push(`Critique: ${count} non-conformités dans le domaine ${domaine} - arrêt de l'activité à envisager`);
    }
  }

  // Recommandations basées sur le profil
  const vitesse2 = profil.velocity_metrics?.vitesse ?? 0;
  if (vitesse2 < -2 && itemsNS.length > 3) {
    recommandations.push(`Dégradation rapide détectée (${Math.abs(vitesse2).toFixed(1)} pts/mois) + ${itemsNS.length} NS - alerte immédiate au chef d'équipe`);
  }

  return { itemsAlerte, itemsCritiques, recommandations };
}

/**
 * Obtenir la priorité recommandée pour la surveillance
 */
export function getRecommendedPriority(profil: ProfilRisque): 'basse' | 'moyenne' | 'haute' | 'critique' {
  if (profil.score_global < 30) return 'critique';
  if (profil.score_global < 50) return 'haute';
  if (profil.score_global < 70) return 'moyenne';
  return 'basse';
}

/**
 * Obtenir la fréquence recommandée
 */
export function getRecommendedFrequency(profil: ProfilRisque): {
  months: number;
  label: string;
} {
  if (profil.score_global < 30) return { months: 1, label: 'Mensuelle' };
  if (profil.score_global < 50) return { months: 3, label: 'Trimestrielle' };
  if (profil.score_global < 70) return { months: 6, label: 'Semestrielle' };
  return { months: 12, label: 'Annuelle' };
}

/**
 * Exporter les fonctions utilitaires
 */
export const adaptativeChecklistUtils = {
  generateAdaptativeChecklist,
  adaptChecklistDuringMission,
  getRecommendedPriority,
  getRecommendedFrequency,
  evaluateCondition,
  calculateDomainePriorities,
  sortItemsByPriority,
  prefillFromHistory,
  BASE_CHECKLIST,
  ADAPTATIVE_ITEMS,
};