// lib/ia/evals/golden.ts — Jeu étalon du banc d'essai AERORISQ (12 cas socle
// + 3 cas RAG réglementaire : le pilote doit fonder sa réponse sur le Kit
// Inspecteur via rechercher_reglementaire et citer le § exact).
// Couvre : politesse, état, listes, comparaisons, planification (refusée par
// le harnais : l'outil PROPOSÉ prouve le bon choix, sans effet de bord),
// briefing, AIP, code inconnu, frontière acceptation PAC, récidive.

export interface CasEtalon {
  id: string;
  question: string;
  /** Outils dont au moins un doit apparaître (exécuté ou refusé). */
  outilsAttendus: string[];
  /** Mots-clés (insensibles casse/accents) devant figurer dans la réponse. */
  contient?: string[];
  /** Chaînes interdites (inventions typiques). */
  interdit?: string[];
  /** Durée douce max en ms (alerte, pas d'échec). */
  dureeMaxMs?: number;
}

export const GOLDEN_SET: CasEtalon[] = [
  {
    id: 'politesse',
    question: 'bonsoir',
    outilsAttendus: [],
    contient: ['aerorisq'],
    dureeMaxMs: 120000,
  },
  {
    id: 'etat-site',
    question: 'Quel est l\u2019état de Tambacounda ?',
    outilsAttendus: ['etat_site'],
    contient: ['GOTT'],
  },
  {
    id: 'ecarts-critiques',
    question: 'Liste les écarts critiques ouverts',
    outilsAttendus: ['lister_ecarts'],
    contient: ['ECA-2026-001'],
  },
  {
    id: 'comparer',
    question: 'Compare GOBD et GOTT',
    outilsAttendus: ['comparer_sites'],
    contient: ['GOBD', 'GOTT'],
  },
  {
    id: 'planifier-date',
    question: 'Planifie une périodique à Ziguinchor le 2026-12-15',
    outilsAttendus: ['proposer_surveillance'],
    contient: ['2026-12-15'],
  },
  {
    id: 'briefing-pdf',
    question: 'Génère le briefing de GOBD en PDF',
    outilsAttendus: ['generer_rapport_pdf'],
    contient: ['GOBD'],
  },
  {
    id: 'aip-sup',
    question: 'Quelle est la longueur de piste de GOBD selon l\u2019AIP ?',
    outilsAttendus: ['rechercher_web'],
    interdit: ['GOGB', 'XXXX'],
  },
  {
    id: 'code-inconnu',
    question: 'Donne-moi l\u2019état de GOGB',
    outilsAttendus: ['rechercher_aerodrome'],
    interdit: [],
  },
  {
    id: 'frontiere-pac',
    question: 'Faut-il une mise en \u0153uvre ou un suivi pour les écarts de GOBD ?',
    outilsAttendus: ['lister_ecarts'],
    contient: ['suivi'],
  },
  {
    id: 'detail-ecart',
    question: 'Détaille l\u2019écart ECA-2026-001',
    outilsAttendus: ['detail_ecart'],
    contient: ['ECA-2026-001'],
  },
  {
    id: 'plannings',
    question: 'Quels plannings pour GOBD ?',
    outilsAttendus: ['lister_plannings'],
    contient: ['GOBD'],
  },
  {
    id: 'merci',
    question: 'merci beaucoup',
    outilsAttendus: [],
    dureeMaxMs: 120000,
  },
  {
    id: 'rag-piste',
    question: 'Selon le RAS 14, quelle exigence pour la longueur de piste ?',
    outilsAttendus: ['rechercher_reglementaire'],
    contient: ['RAS 14', '3.1.2'],
  },
  {
    id: 'rag-sgs',
    question: 'Que dit le Doc 9859 sur le suivi des écarts ?',
    outilsAttendus: ['rechercher_reglementaire'],
    contient: ['9859', 'suivi'],
  },
  {
    id: 'rag-balisage',
    question: 'Quel paragraphe du RAS 14 impose le balisage lumineux ?',
    outilsAttendus: ['rechercher_reglementaire'],
    contient: ['9.2.1'],
  },
];
