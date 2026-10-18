// lib/ia/codeRag.ts
// Recherche par mots-clés dans le codebase pour enrichir le contexte IA
// Approche : extraction de mots-clés → recherche dans un index statique → injection dans le prompt

import { retirerDiacritiques } from '@/lib/domaines'

export interface CodeIndexEntry {
  type: 'module' | 'route' | 'prompt'
  name: string
  path: string
  keywords: string[]
  description: string
}

const CODE_INDEX: CodeIndexEntry[] = [
  { type: 'module', name: 'profil-risque', path: 'components/modules/profil-risque/', keywords: ['risque', 'profil', 'score', 'critique', 'bayes', 'cygne', 'bowtie', 'amdec', 'fta', 'copula', 'scenario', 'prediction'], description: 'Module profil de risque : score global C1-C5, analyses bayésiennes, bow-tie, AMDEC, FTA, scénarios, prédictions ML' },
  { type: 'module', name: 'certification', path: 'components/modules/certification/', keywords: ['certification', 'certificat', 'phase', 'demande', 'verification', 'delivrance', 'publication', 'blocage', 'lettre'], description: 'Module certification : 5 phases, analyse de blocages, lettres officielles' },
  { type: 'module', name: 'homologation', path: 'components/modules/homologation/', keywords: ['homologation', 'homologue', 'agrement', 'approbation', 'piste', 'taxiway', 'balisage', 'eclairage', 'ols', 'slia', 'sslia', 'incendie', 'sauvetage'], description: 'Module homologation : agrément technique des aérodromes, pistes, balisage, OLS, SSLIA' },
  { type: 'module', name: 'surveillance', path: 'components/modules/surveillance/', keywords: ['surveillance', 'inspection', 'checklist', 'ecart', 'non-conformite', 'pac', 'rapport', 'lettre', 'transmission', 'signature', 'kit'], description: 'Module surveillance : checklists, rédaction d\'écarts, PAC, rapports, lettres, signatures' },
  { type: 'module', name: 'planning', path: 'components/modules/planning/', keywords: ['planning', 'planification', 'programmation', 'calendrier', 'gantt', 'charge', 'equipe', 'mission'], description: 'Module planning : programmation des surveillances, calendrier, charge de travail' },
  { type: 'module', name: 'plans-actions', path: 'components/modules/plans-actions/', keywords: ['pac', 'plan', 'action', 'corrective', 'soumission', 'evaluation', 'preuve', 'validation', 'delai'], description: 'Module plans d\'actions correctives : soumission, évaluation, validation chef' },
  { type: 'module', name: 'aerodromes', path: 'components/modules/aerodromes/', keywords: ['aerodrome', 'aeroport', 'oaci', 'localisation', 'carte', 'coordonnees', 'piste', 'sslia'], description: 'Module aérodromes : fiches, codes OACI, localisation, cartes' },
  { type: 'module', name: 'evenements', path: 'components/modules/evenements/', keywords: ['evenement', 'incident', 'accident', 'anomalie', 'rapport', 'fta', 'cause', 'prediction'], description: 'Module événements sécurité : incidents, FTA, causes, prédictions' },
  { type: 'module', name: 'formation', path: 'components/modules/formation/', keywords: ['formation', 'competence', 'habilitation', 'personnel', 'cours', 'qualification'], description: 'Module formation : compétences, habilitations, personnel' },
  { type: 'module', name: 'registres', path: 'components/modules/registres/', keywords: ['registre', 'reglementaire', 'ras', 'annexe', 'oaci', 'circulaire', 'norme'], description: 'Module registres : RAS 14, Annexe 14 OACI, circulaires ANACIM' },
  { type: 'module', name: 'dossiers', path: 'components/modules/dossiers/', keywords: ['dossier', 'document', 'piece', 'upload', 'ocr', 'extraction', 'analyse', 'etude'], description: 'Module dossiers : documents, pièces jointes, OCR, analyse' },
  { type: 'module', name: 'enquetes', path: 'components/modules/enquetes/', keywords: ['enquete', 'investigation', 'cause', 'racine', 'recommandation'], description: 'Module enquêtes : investigations, causes racines' },
  { type: 'module', name: 'portail-exploitant', path: 'components/modules/portail-exploitant/', keywords: ['exploitant', 'portail', 'operateur', 'documentation', 'archive'], description: 'Portail exploitant : vues côté exploitant' },
  { type: 'module', name: 'kit-inspecteur', path: 'components/modules/kit-inspecteur/', keywords: ['kit', 'inspecteur', 'checklist', 'preparation', 'mission', 'partage'], description: 'Module kit inspecteur : préparation de mission, checklists' },
  { type: 'module', name: 'charge-travail', path: 'components/modules/charge-travail/', keywords: ['charge', 'travail', 'workload', 'conflit', 'rapport', 'mensuel'], description: 'Module charge de travail : workload, conflits' },
  { type: 'prompt', name: 'CERT_SYSTEM_PROMPT', path: 'lib/ia/prompts.ts', keywords: ['certification', 'phase', 'demande', 'verification', 'delivrance', 'blocage', 'lettre'], description: 'Prompt certification : 5 phases, analyse blocages' },
  { type: 'prompt', name: 'SGS_ECART_SYSTEM_PROMPT', path: 'lib/ia/prompts.ts', keywords: ['sgs', 'ecart', 'paoe', 'absent', 'present', 'approprie', 'operationnel'], description: 'Prompt écarts SGS : modèle PAOE' },
  { type: 'prompt', name: 'PAC_SYSTEM_PROMPT', path: 'lib/ia/prompts.ts', keywords: ['pac', 'evaluation', 'critere', 'pertinence', 'exhaustivite', 'precision', 'realisme'], description: 'Prompt évaluation PAC : 6 critères' },
  { type: 'prompt', name: 'REGISTRE_SYSTEM_PROMPT', path: 'lib/ia/prompts.ts', keywords: ['registre', 'reglementaire', 'ras', 'annexe', 'oaci', 'circulaire'], description: 'Prompt registre : RAS 14, Annexe 14' },
]

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'en', 'dans', 'sur', 'sous',
  'avec', 'sans', 'pour', 'par', 'ce', 'cette', 'ces', 'je', 'tu', 'il', 'elle', 'nous', 'vous',
  'ils', 'elles', 'on', 'ne', 'pas', 'plus', 'moins', 'tres', 'bien', 'mal', 'oui', 'non', 'si',
  'que', 'qui', 'quoi', 'dont', 'est', 'sont', 'a', 'ont', 'faire', 'dire', 'donner', 'voir',
  'savoir', 'pouvoir', 'falloir', 'venir', 'aller', 'vouloir', 'devoir', 'prendre', 'mettre',
  'rendre', 'rester', 'sembler', 'devenir', 'entrer', 'sortir', 'partir', 'arriver', 'passer',
  'chercher', 'trouver', 'perdre', 'gagner', 'recevoir', 'appeler', 'penser', 'regarder',
  'ecouter', 'parler', 'demander', 'repondre', 'expliquer', 'montrer', 'essayer', 'servir',
  'approcher', 'quitter', 'occuper', 'porter', 'apporter', 'emmener', 'amener', 'empecher',
  'permettre', 'interdire', 'obliger', 'forcer', 'commencer', 'continuer', 'finir', 'arreter',
  'cesser', 'recommencer', 'ajouter', 'enlever', 'changer', 'remplacer', 'garder', 'conserver',
])

export function extractKeywords(texte: string): string[] {
  return retirerDiacritiques(texte.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(m => m.length >= 3 && !STOP_WORDS.has(m))
}

export function searchCodeRAG(question: string, maxResults = 3): string {
  const motsCles = extractKeywords(question)
  if (motsCles.length === 0) return ''

  const scored = CODE_INDEX.map(entry => {
    const score = motsCles.reduce((s, mot) => {
      if (entry.name.toLowerCase().includes(mot)) return s + 3
      if (entry.description.toLowerCase().includes(mot)) return s + 1
      if (entry.keywords.some(k => k.includes(mot) || mot.includes(k))) return s + 2
      return s
    }, 0)
    return { entry, score }
  })

  const resultats = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => `[${s.entry.type.toUpperCase()}] ${s.entry.name} — ${s.entry.description} (${s.entry.path})`)

  return resultats.length > 0 ? resultats.join('\n') : ''
}
