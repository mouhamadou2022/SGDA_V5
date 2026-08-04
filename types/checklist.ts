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
  /** Item ajouté/modifié par le Chat IA — en attente de validation par l'inspecteur */
  aiPropose?: boolean;
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
  /** Question ajoutée/modifiée par le Chat IA — en attente de validation par l'inspecteur */
  aiPropose?: boolean;
  /** Id de l'item checklist d'origine (pour propager la validation jusqu'à la source) */
  sourceItemId?: string;
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

export const SGS_COMPOSANTES_STRUCTURE = [
  { id: 1 as const, label: 'Politique et objectifs de sécurité', poids: 0.20, prefixe: 'SGS', elements: [
    { id: '1.1', label: 'Engagement de la direction' },
    { id: '1.2', label: 'Obligation de rendre compte et responsabilités en matière de sécurité' },
    { id: '1.3', label: 'Nomination du personnel clé chargé de la sécurité' },
    { id: '1.4', label: 'Coordination de la planification des interventions d\'urgence' },
    { id: '1.5', label: 'Documentation relative au SGS' },
  ]},
  { id: 2 as const, label: 'Gestion des risques de sécurité', poids: 0.30, prefixe: 'SGR', elements: [
    { id: '2.1', label: 'Identification des dangers' },
    { id: '2.2', label: 'Évaluation et atténuation des risques de sécurité' },
  ]},
  { id: 3 as const, label: 'Assurance de la sécurité', poids: 0.25, prefixe: 'SGA', elements: [
    { id: '3.1', label: 'Suivi et mesure de la performance de sécurité' },
    { id: '3.2', label: 'La gestion du changement' },
    { id: '3.3', label: 'Amélioration continue du SGS' },
  ]},
  { id: 4 as const, label: 'Promotion de la sécurité', poids: 0.15, prefixe: 'SGP', elements: [
    { id: '4.1', label: 'Formation et sensibilisation' },
    { id: '4.2', label: 'Communication en matière de sécurité' },
  ]},
  { id: 5 as const, label: 'Gestion des interfaces', poids: 0.10, prefixe: 'SGI', elements: [
    { id: '5.1', label: 'Documentation des interfaces' },
    { id: '5.2', label: 'Coordinations' },
  ]},
];

/** @deprecated Préférez SGS_COMPOSANTES_STRUCTURE + questions depuis aérodrome.sgs_checklist_template */
export const SGS_COMPOSANTES: {
  id: 1 | 2 | 3 | 4 | 5
  label: string
  poids: number
  prefixe: string
  elements: {
    id: string
    label: string
    questions: SGSQuestion[]
    directives: SGSDirectives
    guideEtapes: SGSGuideEtape[]
  }[]
}[] = SGS_COMPOSANTES_STRUCTURE.map(c => ({
  ...c,
  elements: c.elements.map(e => ({
    ...e,
    questions: [],
    directives: { present: [], approprie: [], operationnel: [], efficace: [] },
    guideEtapes: [],
  })),
}))

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
  const composantes: SGSComposante[] = SGS_COMPOSANTES_STRUCTURE.map(compDef => {
    const storedComp = maturite.composantes[compDef.id as 1 | 2 | 3 | 4 | 5];
    const elements = compDef.elements.map(elemDef => {
      const storedElem = storedComp?.elements.find(e => e.elementId === elemDef.id);
      const questions: SGSQuestion[] = (storedElem?.questions || []).map(q => ({
        id: q.questionId,
        ref: '',
        texte: '',
        niveau: (q.niveau ?? 'absent') as PAOELevel,
        justification: q.justification,
        prefilled: true,
        suggestion: { previousLevel: q.niveau as PAOELevel },
      }));
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
  if (score >= 20) return 'present';
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
  const composantes: SGSComposante[] = SGS_COMPOSANTES_STRUCTURE.map(compDef => {
    const elements = compDef.elements.map(elemDef => {
      const questions: SGSQuestion[] = questionsByElement[elemDef.id] || [];
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
