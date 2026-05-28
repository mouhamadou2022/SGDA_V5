// types/checklist.ts
// Shared types for checklist modules

export type ResultatChecklist = 'SA' | 'NS' | 'NA' | 'NV';
export type ModeSaisie = 'clavier' | 'stylet' | 'mixte' | 'ocr';

export interface ChecklistItem {
  id: string;
  numero: string;
  reference_reglementaire: string;
  point_verification: string;
  directive_preuve: string;
  resultat?: ResultatChecklist;
  observation?: string;
  observation_stylus_data?: string;
  fichiers?: { id: string; nom: string; url: string; dateUpload: string }[];
  ordre: number;
  prediction?: ResultatChecklist;
  confiance?: number;
  justification?: string;
  alerte?: boolean;
  prefilled?: boolean;
  mode_saisie_obs?: ModeSaisie;
  // ── Directives d'évaluation (une phrase par état) ──────────────────────────
  directive_sa?: string;   // Critère "Satisfaisant" : ce qui caractérise une réponse SA
  directive_ns?: string;   // Critère "Non Satisfaisant" : ce qui caractérise une réponse NS
  directive_nv?: string;   // Critère "Non Validé" : quand la vérification est impossible
  directive_na?: string;   // Critère "Non Applicable" : quand la question ne s'applique pas
}

export interface SousSousDomaine {
  id: string;
  nom: string;
  items: ChecklistItem[];
  isExpanded: boolean;
  ordre: number;
}

export interface SousDomaine {
  id: string;
  nom: string;
  items: ChecklistItem[];
  sousSousDomaines: SousSousDomaine[];
  isExpanded: boolean;
  ordre: number;
}

export interface DomaineChecklist {
  id: string;
  nom: string;
  description: string;
  items: ChecklistItem[];
  sousDomaines: SousDomaine[];
  isExpanded: boolean;
  assigne_a?: string;
  assigne_nom?: string;
  progression: number;
  ordre: number;
}

export interface EvaluationTerrain {
  evolutionCriticite: 'amelioree' | 'stable' | 'pire';
  defensesExistantes: boolean;
  facteursAggravants: boolean;
  recurrence: boolean;
  impactOperationnel: boolean;
  justificationAbsence: string;
  score: number;
  niveau: 'maitrise' | 'surveillance' | 'non_maitrise';
}

export function computeEvaluationTerrainScore(ev: Omit<EvaluationTerrain, 'score' | 'niveau'>): { score: number; niveau: 'maitrise' | 'surveillance' | 'non_maitrise' } {
  let favorables = 0;
  if (ev.evolutionCriticite === 'amelioree') favorables++;
  if (ev.defensesExistantes) favorables++;
  if (!ev.facteursAggravants) favorables++;
  if (!ev.recurrence) favorables++;
  if (!ev.impactOperationnel) favorables++;

  const score = Math.round((favorables / 5) * 100);
  const niveau = score >= 80 ? 'maitrise' : score >= 50 ? 'surveillance' : 'non_maitrise';
  return { score, niveau };
}

export interface EvaluationAction {
  realisation: boolean | null;
  conformitePAC: boolean | null;
  efficacite: boolean | null;
  perennite: boolean | null;
  preuves: boolean | null;
  effetsSecondaires: boolean | null;
  observation?: string;
  score: number;
  decision: 'validee' | 'partielle' | 'non_validee' | 'non_evaluee';
}

export function computeEvaluationActionScore(ev: Omit<EvaluationAction, 'score' | 'decision'>): { score: number; decision: 'validee' | 'partielle' | 'non_validee' | 'non_evaluee' } {
  const criteria = [ev.realisation, ev.conformitePAC, ev.efficacite, ev.perennite, ev.preuves, ev.effetsSecondaires];
  const allNull = criteria.every(c => c === null);
  if (allNull) return { score: 0, decision: 'non_evaluee' };

  const favorables = criteria.filter(c => c === true).length;
  const evaluated = criteria.filter(c => c !== null).length;
  const score = Math.round((favorables / 6) * 100);

  const nonValidees = criteria.filter(c => c === false).length;
  const hasCriticalFail = nonValidees >= 2 || (evaluated < 6 && nonValidees >= 1);

  let decision: 'validee' | 'partielle' | 'non_validee' | 'non_evaluee';
  if (favorables >= 5 && nonValidees === 0) decision = 'validee';
  else if (hasCriticalFail) decision = 'non_validee';
  else if (favorables >= 3) decision = 'partielle';
  else decision = 'non_validee';

  return { score, decision };
}

export interface EcartClosureStatus {
  totalActions: number;
  actionsEvaluees: number;
  actionsValidees: number;
  actionsPartielles: number;
  actionsNonValidees: number;
  actionsNonEvaluees: number;
  scoreAgrege: number;
  decision: 'cloturable' | 'conditionnelle' | 'non_cloturable' | 'en_attente';
  message: string;
}

export function computeEcartClosureStatus(evaluations: (EvaluationAction | undefined)[]): EcartClosureStatus {
  const total = evaluations.length;
  const evaluees = evaluations.filter(e => e && e.decision !== 'non_evaluee').length;
  const validees = evaluations.filter(e => e?.decision === 'validee').length;
  const partielles = evaluations.filter(e => e?.decision === 'partielle').length;
  const nonValidees = evaluations.filter(e => e?.decision === 'non_validee').length;
  const nonEvaluees = total - evaluees;

  const scores = evaluations.filter(e => e).map(e => e!.score);
  const scoreAgrege = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  let decision: 'cloturable' | 'conditionnelle' | 'non_cloturable' | 'en_attente';
  let message: string;

  if (nonEvaluees === total) {
    decision = 'en_attente';
    message = 'Aucune action évaluée';
  } else if (nonValidees > 0) {
    decision = 'non_cloturable';
    message = `${nonValidees} action(s) non validée(s) — PAC à reprendre`;
  } else if (partielles > 0) {
    decision = 'conditionnelle';
    message = `Clôture conditionnelle — ${partielles} action(s) avec réserves`;
  } else if (validees === total) {
    decision = 'cloturable';
    message = 'Toutes les actions validées — écart clôturable';
  } else {
    decision = 'en_attente';
    message = `${nonEvaluees} action(s) restante(s) à évaluer`;
  }

  return { totalActions: total, actionsEvaluees: evaluees, actionsValidees: validees, actionsPartielles: partielles, actionsNonValidees: nonValidees, actionsNonEvaluees: nonEvaluees, scoreAgrege, decision, message };
}

// ============================================================
// ÉVALUATION SGS — Modèle PAOE (OACI Annexe 19)
// ============================================================

export type PAOELevel = 'absent' | 'present' | 'approprie' | 'operationnel' | 'efficace';

export const PAOE_LABELS: Record<PAOELevel, string> = {
  absent: 'Absent',
  present: 'Présent (P)',
  approprie: 'Approprié (A)',
  operationnel: 'Opérationnel (O)',
  efficace: 'Efficace (E)',
};

export const PAOE_SCORES: Record<PAOELevel, number> = {
  absent: 0,
  present: 25,
  approprie: 50,
  operationnel: 75,
  efficace: 100,
};

export const PAOE_ORDER: PAOELevel[] = ['absent', 'present', 'approprie', 'operationnel', 'efficace'];
export const PAOE_LEVELS: PAOELevel[] = ['absent', 'present', 'approprie', 'operationnel', 'efficace'];

export interface SGSQuestion {
  id: string;
  ref: string;
  texte: string;
  niveau: PAOELevel;
  justification?: string;
  observation_stylus_data?: string;
  preuves?: { id: string; nom: string; url: string; dateUpload: string }[];
  observation?: string;
  prefilled?: boolean;
  suggestion?: { previousLevel: PAOELevel; adjustedLevel?: PAOELevel; raison?: string };
  sourceReglementaire?: string;
  generatedByIA?: boolean;
  statutIA?: 'nouvelle' | 'modifiee' | 'inchangee' | 'obsoletee';
}

export interface SGSDirectives {
  present: string[];
  approprie: string[];
  operationnel: string[];
  efficace: string[];
}

export interface SGSGuideEtape {
  etape: number;
  titre: string;
  actions: string[];
}

export interface SGSElementDef {
  id: string;
  label: string;
  questions: SGSQuestion[];
  directives: SGSDirectives;
  guideEtapes: SGSGuideEtape[];
}

export const SGS_COMPOSANTES = [
  {
    id: 1 as const,
    label: 'Politique et objectifs de sécurité',
    poids: 0.20,
    prefixe: 'SGS',
    elements: [
      {
        id: '1.1',
        label: 'Engagement de la direction',
        questions: [
          { id: '1.1.q1', ref: 'SGS-01.1', texte: 'La politique de sécurité est-elle documentée dans le manuel SGS ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §3.2.1' },
          { id: '1.1.q2', ref: 'SGS-01.2', texte: 'La politique est-elle signée par le directeur de l\'aéroport ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §3.2.2' },
          { id: '1.1.q3', ref: 'SGS-01.3', texte: 'La politique est-elle communiquée à tout le personnel (affichage, réunions, intranet) ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §3.3.1' },
        ],
        directives: {
          present: ['Documentée dans le manuel SGS', 'Version contrôlée et datée', 'Accessible au personnel'],
          approprie: ['Adaptée à la taille et complexité de l\'aéroport', 'Couvre les risques spécifiques du site', 'Approuvée par la direction'],
          operationnel: ['Affichée dans les locaux', 'Présentée lors des réunions sécurité', 'Agents interrogés la connaissent'],
          efficace: ['Tous les agents peuvent la citer', 'Référencée dans les procédures', 'Impact sur la culture sécurité mesuré'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier la documentation', actions: ['Consulter le manuel SGS, section politique sécurité', 'Vérifier la date de dernière révision', 'Confirmer le contrôle de version'] },
          { etape: 2, titre: 'Vérifier la signature', actions: ['Demander le document original avec signature du DG', 'Confirmer que la signature est récente (< 2 ans)', 'Vérifier l\'authenticité'] },
          { etape: 3, titre: 'Vérifier la communication', actions: ['Observer les panneaux d\'affichage', 'Interroger 2-3 agents sur la politique', 'Demander les PV de réunions de présentation'] },
        ],
      },
      {
        id: '1.2',
        label: 'Obligation de rendre compte et responsabilités en matière de sécurité',
        questions: [
          { id: '1.2.q1', ref: 'SGS-02.1', texte: 'Des objectifs sécurité quantifiables sont-ils définis (ex: réduire les incidents de 10%) ?', niveau: 'absent' as PAOELevel },
          { id: '1.2.q2', ref: 'SGS-02.2', texte: 'Les objectifs sont-ils revus au moins annuellement par la direction ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'RAS 14 I §1.5.2' },
        ],
        directives: {
          present: ['Objectifs écrits et documentés', 'Indicateurs de performance définis', 'Cibles chiffrées'],
          approprie: ['Objectifs réalistes pour l\'aéroport', 'Alignés sur les risques identifiés', 'Ressources allouées pour les atteindre'],
          operationnel: ['Suivi régulier des indicateurs', 'Tableaux de bord mis à jour', 'Réunions de revue tenues'],
          efficace: ['Objectifs atteints ou en progression', 'Tendance d\'amélioration démontrée', 'Corrélation avec réduction d\'incidents'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Identifier les objectifs', actions: ['Demander la liste des objectifs sécurité de l\'année', 'Vérifier qu\'ils sont quantifiables', 'Confirmer qu\'ils sont documentés'] },
          { etape: 2, titre: 'Vérifier le suivi', actions: ['Consulter les tableaux de bord de suivi', 'Vérifier la fréquence des revues', 'Demander les PV de revue direction'] },
        ],
      },
      {
        id: '1.3',
        label: 'Nomination du personnel clé chargé de la sécurité',
        questions: [
          { id: '1.3.q1', ref: 'SGS-03.1', texte: 'Les rôles et responsabilités SGS sont-ils définis et documentés ?', niveau: 'absent' as PAOELevel },
          { id: '1.3.q2', ref: 'SGS-03.2', texte: 'Un responsable SGS est-il nommé avec l\'autorité nécessaire ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'RAS 14 I §1.5.3' },
        ],
        directives: {
          present: ['Organigramme SGS documenté', 'Fiches de poste incluant responsabilités sécurité', 'Responsable SGS identifié'],
          approprie: ['Responsabilités proportionnées au risque', 'Autorité suffisante du responsable SGS', 'Couverture de tous les services'],
          operationnel: ['Les responsables connaissent leurs rôles', 'Réunions SGS régulières tenues', 'Décisions SGS documentées'],
          efficace: ['Responsabilités exercées efficacement', 'Aucun gap identifié', 'Amélioration continue des rôles'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier la documentation', actions: ['Consulter l\'organigramme SGS', 'Vérifier les fiches de poste', 'Confirmer la nomination du responsable SGS'] },
          { etape: 2, titre: 'Vérifier la mise en oeuvre', actions: ['Interroger les responsables sur leurs rôles', 'Vérifier les PV de réunions SGS', 'Confirmer l\'autorité du responsable'] },
        ],
      },
      {
        id: '1.4',
        label: 'Coordination de la planification des interventions d\'urgence',
        questions: [
          { id: '1.4.q1', ref: 'SGS-04.1', texte: 'Un plan de réponse aux urgences est-il formalisé et à jour ?', niveau: 'absent' as PAOELevel },
          { id: '1.4.q2', ref: 'SGS-04.2', texte: 'Le plan est-il testé régulièrement (exercices) ?', niveau: 'absent' as PAOELevel },
        ],
        directives: {
          present: ['Plan d\'urgence écrit et documenté', 'Scénarios d\'urgence identifiés', 'Procédures d\'activation définies'],
          approprie: ['Plan adapté aux risques de l\'aéroport', 'Coordination avec services externes (pompiers, SAMU)', 'Ressources adéquates prévues'],
          operationnel: ['Exercices réalisés selon la planification', 'Comptes-rendus d\'exercices disponibles', 'Actions correctives issues des exercices'],
          efficace: ['Temps de réponse conformes aux objectifs', 'Amélioration continue des exercices', 'Aucune défaillance majeure lors d\'urgences réelles'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier le plan', actions: ['Consulter le plan de réponse aux urgences', 'Vérifier la date de dernière révision', 'Confirmer la couverture des scénarios'] },
          { etape: 2, titre: 'Vérifier les exercices', actions: ['Demander le planning des exercices', 'Consulter les comptes-rendus des 2 derniers exercices', 'Vérifier les actions correctives issues des exercices'] },
        ],
      },
      {
        id: '1.5',
        label: 'Documentation relative au SGS',
        questions: [
          { id: '1.5.q1', ref: 'SGS-05.1', texte: 'La direction démontre-t-elle un engagement visible envers la sécurité ?', niveau: 'absent' as PAOELevel },
          { id: '1.5.q2', ref: 'SGS-05.2', texte: 'La direction participe-t-elle aux revues de sécurité et aux enquêtes ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §3.2.3' },
        ],
        directives: {
          present: ['Déclarations de la direction sur la sécurité', 'Budget sécurité alloué', 'Participation aux réunions sécurité'],
          approprie: ['Engagement proportionné aux risques', 'Priorité sécurité affichée et réelle', 'Ressources suffisantes'],
          operationnel: ['Direction présente aux revues sécurité', 'Enquêtes dirigées ou suivies par la direction', 'Communications régulières'],
          efficace: ['Culture sécurité forte impulsée par la direction', 'Tendance positive des indicateurs', 'Retour positif du personnel'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Observer l\'engagement', actions: ['Vérifier la présence de la direction aux réunions sécurité', 'Consulter les communications de la direction', 'Vérifier le budget sécurité'] },
          { etape: 2, titre: 'Interroger le personnel', actions: ['Demander aux agents leur perception de l\'engagement', 'Vérifier si la direction participe aux enquêtes', 'Confirmer la priorité donnée à la sécurité'] },
        ],
      },
    ],
  },
  {
    id: 2 as const,
    label: 'Gestion des risques de sécurité',
    poids: 0.30,
    prefixe: 'SGR',
    elements: [
      {
        id: '2.1',
        label: 'Identification des dangers',
        questions: [
          { id: '2.1.q1', ref: 'SGR-01.1', texte: 'Un processus formel d\'identification des dangers est-il en place ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §4.1.1' },
          { id: '2.1.q2', ref: 'SGR-01.2', texte: 'Une base de données des dangers est-elle maintenue et mise à jour ?', niveau: 'absent' as PAOELevel },
        ],
        directives: {
          present: ['Procédure d\'identification documentée', 'Liste des dangers existante', 'Sources de données identifiées'],
          approprie: ['Méthode adaptée à l\'aéroport', 'Couverture de tous les domaines', 'Fréquence de mise à jour définie'],
          operationnel: ['Dangers identifiés régulièrement', 'Base de données accessible et utilisée', 'Nouveaux dangers enregistrés'],
          efficace: ['Dangers identifiés avant qu\'ils ne causent des incidents', 'Tendance de détection proactive', 'Corrélation avec réduction d\'incidents'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier le processus', actions: ['Consulter la procédure d\'identification des dangers', 'Vérifier la méthode utilisée', 'Confirmer la formation du personnel'] },
          { etape: 2, titre: 'Vérifier la base de données', actions: ['Accéder à la base de données des dangers', 'Vérifier la date de dernière mise à jour', 'Compter les dangers actifs'] },
        ],
      },
      {
        id: '2.2',
        label: 'Évaluation et atténuation des risques de sécurité',
        questions: [
          { id: '2.2.q1', ref: 'SGR-02.1', texte: 'Une méthodologie d\'analyse des risques est-elle définie et appliquée ?', niveau: 'absent' as PAOELevel },
          { id: '2.2.q2', ref: 'SGR-02.2', texte: 'Une matrice de risque est-elle utilisée pour évaluer les dangers ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §4.2.2' },
        ],
        directives: {
          present: ['Méthodologie documentée', 'Matrice de risque définie', 'Critères d\'acceptabilité établis'],
          approprie: ['Matrice adaptée au contexte aéroportuaire', 'Niveaux de risque réalistes', 'Seuils d\'acceptation définis'],
          operationnel: ['Analyses réalisées pour les dangers identifiés', 'Matrice utilisée systématiquement', 'Résultats documentés'],
          efficace: ['Analyses menant à des actions pertinentes', 'Réduction effective des risques', 'Décisions fondées sur les analyses'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier la méthodologie', actions: ['Consulter la procédure d\'analyse des risques', 'Vérifier la matrice de risque', 'Confirmer les critères d\'acceptabilité'] },
          { etape: 2, titre: 'Vérifier les analyses', actions: ['Demander les 3 dernières analyses de risque', 'Vérifier que la matrice est utilisée', 'Confirmer le lien avec les actions correctives'] },
        ],
      },
    ],
  },
  {
    id: 3 as const,
    label: 'Assurance de la sécurité',
    poids: 0.25,
    prefixe: 'SGA',
    elements: [
      {
        id: '3.1',
        label: 'Suivi et mesure de la performance de sécurité',
        questions: [
          { id: '3.1.q1', ref: 'SGA-01.1', texte: 'Des KPI sécurité sont-ils définis et suivis ?', niveau: 'absent' as PAOELevel },
          { id: '3.1.q2', ref: 'SGA-01.2', texte: 'Des tableaux de bord sécurité sont-ils produits régulièrement ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §5.1.2' },
        ],
        directives: {
          present: ['KPI définis et documentés', 'Tableaux de bord existants', 'Fréquence de production définie'],
          approprie: ['KPI pertinents pour l\'aéroport', 'Cibles réalistes', 'Couverture de tous les domaines'],
          operationnel: ['KPI mis à jour régulièrement', 'Tableaux de bord diffusés', 'Revues de performance tenues'],
          efficace: ['KPI utilisés pour prendre des décisions', 'Amélioration des performances', 'Corrélation avec réduction d\'incidents'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier les KPI', actions: ['Consulter la liste des KPI sécurité', 'Vérifier leur pertinence', 'Confirmer les cibles'] },
          { etape: 2, titre: 'Vérifier les tableaux de bord', actions: ['Demander les 3 derniers tableaux de bord', 'Vérifier la fréquence de production', 'Confirmer la diffusion'] },
        ],
      },
      {
        id: '3.2',
        label: 'La gestion du changement',
        questions: [
          { id: '3.2.q1', ref: 'SGA-02.1', texte: 'Un programme d\'audits internes est-il en place ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §5.2.1' },
          { id: '3.2.q2', ref: 'SGA-02.2', texte: 'Les audits sont-ils réalisés selon le planning ?', niveau: 'absent' as PAOELevel },
        ],
        directives: {
          present: ['Programme d\'audits documenté', 'Planning annuel défini', 'Auditeurs identifiés'],
          approprie: ['Programme couvrant tous les domaines', 'Auditeurs compétents', 'Fréquence adaptée aux risques'],
          operationnel: ['Audits réalisés selon le planning', 'Rapports d\'audits disponibles', 'Actions correctives issues des audits'],
          efficace: ['Audits menant à des améliorations', 'Fermeture des actions correctives', 'Amélioration continue'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier le programme', actions: ['Consulter le programme d\'audits', 'Vérifier le planning', 'Confirmer les auditeurs'] },
          { etape: 2, titre: 'Vérifier les audits', actions: ['Demander les 2 derniers rapports', 'Vérifier les actions correctives', 'Confirmer le suivi de fermeture'] },
        ],
      },
      {
        id: '3.3',
        label: 'Amélioration continue du SGS',
        questions: [
          { id: '3.3.q1', ref: 'SGA-03.1', texte: 'Un processus formel d\'amélioration continue est-il en place ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §5.3.1' },
          { id: '3.3.q2', ref: 'SGA-03.2', texte: 'Les retours d\'expérience sont-ils intégrés dans le SGS ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §5.3.2' },
        ],
        directives: {
          present: ['Processus documenté', 'Sources de retours identifiées', 'Méthode d\'intégration définie'],
          approprie: ['Processus adapté à l\'aéroport', 'Couverture de toutes les sources', 'Fréquence de revue définie'],
          operationnel: ['Retours collectés régulièrement', 'Intégration dans le SGS documentée', 'Améliorations mises en oeuvre'],
          efficace: ['Améliorations mesurables', 'Culture d\'amélioration continue', 'Tendance positive des indicateurs'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier le processus', actions: ['Consulter la procédure d\'amélioration continue', 'Vérifier les sources de retours', 'Confirmer la méthode d\'intégration'] },
          { etape: 2, titre: 'Vérifier les améliorations', actions: ['Demander les 3 dernières améliorations', 'Vérifier leur impact', 'Confirmer la tendance positive'] },
        ],
      },
    ],
  },
  {
    id: 4 as const,
    label: 'Promotion de la sécurité',
    poids: 0.15,
    prefixe: 'SGP',
    elements: [
      {
        id: '4.1',
        label: 'Formation et sensibilisation',
        questions: [
          { id: '4.1.q1', ref: 'SGP-01.1', texte: 'Un programme de formation sécurité est-il en place ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §6.1.1' },
          { id: '4.1.q2', ref: 'SGP-01.2', texte: 'Les habilitations sont-elles suivies et mises à jour ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §6.1.2' },
        ],
        directives: {
          present: ['Programme de formation documenté', 'Catalogue de formations sécurité', 'Planning de formation'],
          approprie: ['Formations adaptées aux postes', 'Fréquence adaptée aux risques', 'Contenu à jour'],
          operationnel: ['Formations réalisées selon le planning', 'Registre de formation maintenu', 'Habilitations suivies'],
          efficace: ['Personnel compétent et formé', 'Réduction d\'incidents liée aux formations', 'Satisfaction des participants'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier le programme', actions: ['Consulter le programme de formation', 'Vérifier le catalogue', 'Confirmer le planning'] },
          { etape: 2, titre: 'Vérifier les formations', actions: ['Demander le registre de formation', 'Vérifier les habilitations', 'Confirmer la mise à jour'] },
        ],
      },
      {
        id: '4.2',
        label: 'Communication en matière de sécurité',
        questions: [
          { id: '4.2.q1', ref: 'SGP-02.1', texte: 'Des canaux de communication sécurité sont-ils en place ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §6.2.1' },
          { id: '4.2.q2', ref: 'SGP-02.2', texte: 'Des newsletters ou bulletins sécurité sont-ils diffusés ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §6.2.2' },
        ],
        directives: {
          present: ['Canaux identifiés (affichage, intranet, réunions)', 'Newsletter existante', 'Fréquence de diffusion définie'],
          approprie: ['Canaux adaptés au personnel', 'Contenu pertinent', 'Accessibilité pour tous'],
          operationnel: ['Communication régulière', 'Personnel informé', 'Retours reçus'],
          efficace: ['Personnel conscient des enjeux', 'Augmentation des reports volontaires', 'Culture sécurité renforcée'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier les canaux', actions: ['Identifier les canaux de communication', 'Vérifier la fréquence', 'Confirmer l\'accessibilité'] },
          { etape: 2, titre: 'Vérifier l\'impact', actions: ['Interroger le personnel sur la communication', 'Vérifier les retours', 'Confirmer la conscientisation'] },
        ],
      },
    ],
  },
  {
    id: 5 as const,
    label: 'Gestion des interfaces',
    poids: 0.10,
    prefixe: 'SGI',
    elements: [
      {
        id: '5.1',
        label: 'Documentation des interfaces',
        questions: [
          { id: '5.1.q1', ref: 'SGI-01.1', texte: 'Les interfaces avec prestataires, sous-traitants et autorités sont-elles documentées ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §7.1.1' },
          { id: '5.1.q2', ref: 'SGI-01.2', texte: 'Les responsabilités de chaque partie sont-elles clairement définies ?', niveau: 'absent' as PAOELevel },
        ],
        directives: {
          present: ['Liste des interfaces documentée', 'Contrats avec prestataires incluant clauses sécurité', 'Contacts autorités identifiés'],
          approprie: ['Interfaces adaptées aux activités', 'Responsabilités claires', 'Coordination définie'],
          operationnel: ['Réunions de coordination tenues', 'Communication régulière', 'Problèmes d\'interface résolus'],
          efficace: ['Aucun incident lié aux interfaces', 'Collaboration fluide', 'Amélioration continue des interfaces'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier la documentation', actions: ['Consulter la liste des interfaces', 'Vérifier les contrats', 'Confirmer les contacts'] },
          { etape: 2, titre: 'Vérifier la coordination', actions: ['Demander les PV de réunions', 'Vérifier la communication', 'Confirmer la résolution des problèmes'] },
        ],
      },
      {
        id: '5.2',
        label: 'Coordinations',
        questions: [
          { id: '5.2.q1', ref: 'SGI-02.1', texte: 'Des réunions de coordination régulières sont-elles organisées ?', niveau: 'absent' as PAOELevel },
          { id: '5.2.q2', ref: 'SGI-02.2', texte: 'Des protocoles d\'échange d\'informations sont-ils en place ?', niveau: 'absent' as PAOELevel, sourceReglementaire: 'Doc 9859 §7.2.2' },
        ],
        directives: {
          present: ['Planning de réunions défini', 'Protocoles d\'échange documentés', 'Listes de diffusion établies'],
          approprie: ['Fréquence adaptée aux risques', 'Protocoles couvrant tous les scénarios', 'Acteurs identifiés'],
          operationnel: ['Réunions tenues selon le planning', 'Protocoles appliqués', 'Informations échangées régulièrement'],
          efficace: ['Coordination fluide', 'Aucun incident lié à un défaut de coordination', 'Amélioration continue'],
        },
        guideEtapes: [
          { etape: 1, titre: 'Vérifier les réunions', actions: ['Consulter le planning de réunions', 'Vérifier les PV', 'Confirmer la participation'] },
          { etape: 2, titre: 'Vérifier les protocoles', actions: ['Consulter les protocoles d\'échange', 'Vérifier leur application', 'Confirmer l\'efficacité'] },
        ],
      },
    ],
  },
];

export interface SGSElement {
  id: string;
  composante: 1 | 2 | 3 | 4 | 5;
  numero: string;
  label: string;
  description: string;
  questions: SGSQuestion[];
  niveau: PAOELevel;
  justification?: string;
  preuves?: string[];
}

export function computeSGSElementScore(questions: SGSQuestion[]): { score: number; niveauGlobal: PAOELevel } {
  if (questions.length === 0) return { score: 0, niveauGlobal: 'absent' };

  const scores = questions.map(q => PAOE_SCORES[q.niveau]);
  const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const heterogeneite = maxScore > 0 ? (maxScore - minScore) / maxScore : 0;
  const facteurProgression = 1 - (heterogeneite * 0.3);

  const score = Math.round(moyenne * facteurProgression);
  const niveauGlobal = getPAOENiveauFromScore(score);

  return { score, niveauGlobal };
}

export interface SGSComposante {
  id: 1 | 2 | 3 | 4 | 5;
  label: string;
  poids: number;
  prefixe: string;
  elements: { elementId: string; label: string; questions: SGSQuestion[]; score: number; niveauGlobal: PAOELevel }[];
  score: number;
  niveauGlobal: PAOELevel;
}

export interface SGSElementNotes {
  questions?: string;   // Note libre sur les questions de l'élément
  directives?: string;  // Note libre sur les directives d'évaluation
  guide?: string;       // Note libre sur le guide étape par étape
}

export interface EvaluationSGS {
  aerodromeId: string;
  surveillanceId: string;
  date: string;
  inspecteurId: string;
  inspecteurNom: string;
  composantes: SGSComposante[];
  scoreGlobal: number;
  observations?: string;
  elementNotes?: Record<string, SGSElementNotes>; // notes inspecteur par élément
}

export interface MaturiteSGSDetaillee {
  composantes: {
    [K in 1 | 2 | 3 | 4 | 5]?: {
      score: number;
      niveauGlobal: PAOELevel;
      elements: { elementId: string; niveau: PAOELevel; questions: { questionId: string; niveau: PAOELevel; justification?: string }[] }[];
    };
  };
  scoreGlobal: number;
  evalueLe: string;
  evaluePar: string;
}

export function buildEvaluationFromMaturiteDetaillee(
  maturite: MaturiteSGSDetaillee,
  aerodromeId: string,
  surveillanceId: string,
  inspecteurId: string,
  inspecteurNom: string,
): EvaluationSGS {
  const composantes: SGSComposante[] = SGS_COMPOSANTES.map(compDef => {
    const storedComp = maturite.composantes[compDef.id as 1 | 2 | 3 | 4 | 5];
    const elements = compDef.elements.map(elemDef => {
      const storedElem = storedComp?.elements.find(e => e.elementId === elemDef.id);
      const questions = elemDef.questions.map(q => {
        const storedQ = storedElem?.questions.find(sq => sq.questionId === q.id);
        return {
          ...q,
          niveau: (storedQ?.niveau ?? q.niveau) as PAOELevel,
          justification: storedQ?.justification,
          prefilled: !!storedQ,
          suggestion: storedQ ? { previousLevel: storedQ.niveau as PAOELevel } : undefined,
        };
      });
      return {
        elementId: elemDef.id,
        label: elemDef.label,
        questions,
        score: 0,
        niveauGlobal: (storedElem?.niveau ?? 'absent') as PAOELevel,
      };
    });
    return {
      id: compDef.id,
      label: compDef.label,
      poids: compDef.poids,
      prefixe: compDef.prefixe,
      elements,
      score: storedComp?.score ?? 0,
      niveauGlobal: (storedComp?.niveauGlobal ?? 'absent') as PAOELevel,
    };
  });

  return {
    aerodromeId,
    surveillanceId,
    date: maturite.evalueLe,
    inspecteurId,
    inspecteurNom: maturite.evaluePar || inspecteurNom,
    composantes,
    scoreGlobal: maturite.scoreGlobal,
    observations: '',
  };
}

export function getPAOENiveauFromScore(score: number): PAOELevel {
  if (score >= 90) return 'efficace';
  if (score >= 65) return 'operationnel';
  if (score >= 40) return 'approprie';
  if (score >= 15) return 'present';
  return 'absent';
}

export function computeSGSComposanteScore(elements: { questions: SGSQuestion[] }[]): { score: number; niveauGlobal: PAOELevel } {
  if (elements.length === 0) return { score: 0, niveauGlobal: 'absent' };

  const elementScores = elements.map(e => computeSGSElementScore(e.questions).score);
  const moyenne = elementScores.reduce((a, b) => a + b, 0) / elementScores.length;

  const minScore = Math.min(...elementScores);
  const maxScore = Math.max(...elementScores);
  const heterogeneite = maxScore > 0 ? (maxScore - minScore) / maxScore : 0;
  const facteurProgression = 1 - (heterogeneite * 0.2);

  const score = Math.round(moyenne * facteurProgression);
  const niveauGlobal = getPAOENiveauFromScore(score);

  return { score, niveauGlobal };
}

export function computeMaturiteSGS(composantes: { id: 1 | 2 | 3 | 4 | 5; elements: { questions: SGSQuestion[] }[]; poids: number }[]): number {
  if (composantes.length === 0) return 0;

  let scoreTotal = 0;
  let poidsTotal = 0;

  for (const comp of composantes) {
    const { score } = computeSGSComposanteScore(comp.elements);
    scoreTotal += score * comp.poids;
    poidsTotal += comp.poids;
  }

  return poidsTotal > 0 ? Math.round(scoreTotal / poidsTotal) : 0;
}

export function buildEvaluationSGS(
  aerodromeId: string,
  surveillanceId: string,
  inspecteurId: string,
  inspecteurNom: string,
  questionsByElement: { [elementId: string]: SGSQuestion[] }
): EvaluationSGS {
  const composantes: SGSComposante[] = SGS_COMPOSANTES.map(compDef => {
    const elements = compDef.elements.map(elemDef => {
      const questions = questionsByElement[elemDef.id] || elemDef.questions;
      const { score, niveauGlobal } = computeSGSElementScore(questions);
      return {
        elementId: elemDef.id,
        label: elemDef.label,
        questions,
        score,
        niveauGlobal,
      };
    });

    const { score: compScore, niveauGlobal: compNiveau } = computeSGSComposanteScore(elements);

    return {
      id: compDef.id,
      label: compDef.label,
      poids: compDef.poids,
      prefixe: compDef.prefixe,
      elements,
      score: compScore,
      niveauGlobal: compNiveau,
    };
  });

  const scoreGlobal = computeMaturiteSGS(
    composantes.map(c => ({ id: c.id, elements: c.elements.map(e => ({ questions: e.questions })), poids: c.poids }))
  );

  return {
    aerodromeId,
    surveillanceId,
    date: new Date().toISOString(),
    inspecteurId,
    inspecteurNom,
    composantes,
    scoreGlobal,
  };
}
