// lib/ia/modelSelector.ts
// Sélecteur de modèle d'analyse : recommande le modèle (BowTie / FTA / AMDEC)
// le plus adapté aux données réelles disponibles, avec score, intervalle de
// confiance et raisons. Fonction 100% déterministe (fallback règle).

import type { ProfilRisque, Ecart, Surveillance, EvenementSecurite } from '@/lib/store'
import type { RandomForestModelStored } from '@/lib/store/models'
import type { AmdecAnalyse } from '@/lib/risque/amdecEngine'
import type { ArbreFTA } from '@/lib/risque/ftaEngine'
import { getTemplatePourEvenement } from '@/lib/risque/ftaEngine'

export type ModeleAnalyse =
  | 'bowtie'
  | 'fta'
  | 'amdec'
  // Modèles ML avancés (surveillés par le module ML Monitoring, métriques persistées par aérodrome)
  | 'hmm'
  | 'survie'
  | 'evt'
  | 'copula'
  | 'thompson'
  | 'bayes'
  | 'rf'

export const MODELE_LABELS: Record<ModeleAnalyse, string> = {
  bowtie: 'Bow-Tie',
  fta: 'Arbre de Défaillance (FTA)',
  amdec: 'AMDEC',
  hmm: 'HMM — Markov caché',
  survie: 'Analyse de survie',
  evt: 'Valeurs extrêmes (EVT)',
  copula: 'Copulas — dépendance',
  thompson: 'Thompson Sampling',
  bayes: 'Analyse bayésienne',
  rf: 'Random Forest',
}

export const MODELE_DESCRIPTIONS: Record<ModeleAnalyse, string> = {
  bowtie: 'Analyse systémique par barrières (préventives/correctives) sur l\'ensemble des domaines.',
  fta: 'Analyse causale top-down d\'un événement : portes ET/OU, probabilité sommet, coupes minimales.',
  amdec: 'Analyse bottom-up des modes de défaillance par équipement/système, IPR = G × P × D.',
  hmm: 'Chaîne de Markov cachée : détection d\'un glissement silencieux vers un état dégradé.',
  survie: 'Modèle de survie (Cox / Kaplan-Meier) : délai avant incident et hazard à 90/180 jours.',
  evt: 'Théorie des valeurs extrêmes : probabilité d\'événement extrême et queue lourde.',
  copula: 'Dépendance de queue entre domaines : propagation du risque en situation de stress.',
  thompson: 'Thompson Sampling : action de surveillance optimale entre audit, maintien et périodique.',
  bayes: 'Mise à jour bayésienne de la probabilité de défaillance, signal cygne noir.',
  rf: 'Random Forest entraîné sur les échantillons réels : prédiction du niveau de risque.',
}

export interface ScoreModele {
  modele: ModeleAnalyse
  /** Pertinence du modèle pour les données fournies (0-100) */
  score: number
  /** Fiabilité de la recommandation (0-100) — dépend de la richesse des données */
  confiance: number
  /** Intervalle de confiance du score (borne basse, haute) */
  intervalle: [number, number]
  raisons: string[]
}

export interface RecommandationModele {
  recommande: ModeleAnalyse
  scores: ScoreModele[]
  fallbackDeterministe: boolean
  justification: string
}

export interface ModeleAnalyseInput {
  profil?: ProfilRisque | null
  evenement?: EvenementSecurite | null
  evenements?: EvenementSecurite[]
  ecarts: Ecart[]
  surveillances: Surveillance[]
  amdecAnalyses: AmdecAnalyse[]
  ftaAnalyses: ArbreFTA[]
  /** Métadonnées du Random Forest entraîné (module ML Monitoring) */
  rfModelInfo?: RandomForestModelStored | null
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v))
}

function intervallePour(score: number, confiance: number): [number, number] {
  const marge = Math.round(((100 - confiance) / 100) * score * 0.5)
  return [clamp(score - marge), clamp(score + marge)]
}

function scoreBowTie(input: ModeleAnalyseInput): ScoreModele {
  const { profil, ecarts, surveillances } = input
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 6

  if (profil) {
    score += 40
    signaux += 1
    raisons.push('Profil de risque disponible (vue systémique aérodrome)')
    if (profil.copula_metrics || profil.bayesian_posterior != null || profil.bowtie_metrics?.length) {
      score += 15
      signaux += 1
      raisons.push('Métriques avancées (copulas, bayésien, BowTie HIRM) présentes')
    }
  }
  if (ecarts.length > 0) {
    score += 10
    signaux += 1
    raisons.push(`${ecarts.length} écart(s) actif(s) à relier aux barrières`)
  }
  if (surveillances.length > 0) {
    score += 10
    signaux += 1
    raisons.push(`${surveillances.length} surveillance(s) historisée(s)`)
  }
  if (input.evenements && input.evenements.length > 0) {
    score += 5
    signaux += 1
    raisons.push('Événements passés disponibles pour calibrer les conséquences')
  }  if (profil?.qualityScore && profil.qualityScore >= 60) {
    score += 5
    signaux += 1
    raisons.push(`Qualité des données bonne (${profil.qualityScore}/100)`)
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'bowtie', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreFTA(input: ModeleAnalyseInput): ScoreModele {
  const { evenement } = input
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 6

  if (evenement) {
    score += 50
    signaux += 1
    raisons.push('Événement ciblé : analyse causale top-down pertinente')
    if (evenement.description && evenement.description.length > 40) {
      score += 10
      signaux += 1
      raisons.push('Description détaillée disponible')
    }
    if (evenement.causes && evenement.causes.length > 0) {
      score += 10
      signaux += 1
      raisons.push(`${evenement.causes.length} cause(s) déclarée(s) à valider sur l'arbre`)
    }
    const template = getTemplatePourEvenement(evenement)
    if (template.id !== 'generique') {
      score += 10
      signaux += 1
      raisons.push(`Template FTA correspondant trouvé (« ${template.libelle} »)`)
    }
    if (evenement.gravite === 'critique' || evenement.gravite === 'eleve') {
      score += 10
      signaux += 1
      raisons.push(`Gravité élevée (${evenement.gravite}) : investigation approfondie requise`)
    }
  }
  if (input.ftaAnalyses.length > 0) {
    score += 5
    signaux += 1
    raisons.push(`${input.ftaAnalyses.length} arbre(s) FTA déjà existant(s)`)
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'fta', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreAMDEC(input: ModeleAnalyseInput): ScoreModele {
  const { profil, amdecAnalyses, ecarts } = input
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 6

  if (amdecAnalyses.length > 0) {
    score += 40
    signaux += 1
    raisons.push(`${amdecAnalyses.length} analyse(s) AMDEC déjà initialisée(s)`)
    const nonCorriges = amdecAnalyses.filter((a) => a.statut !== 'corrige')
    if (nonCorriges.some((a) => a.niveau === 'critique' || a.niveau === 'eleve')) {
      score += 10
      signaux += 1
      raisons.push('Modes critiques/élevés non corrigés à traiter (malus C3)')
    }
  }
  if (profil?.infrastructure) {
    score += 15
    signaux += 1
    raisons.push('Infrastructure connue (catalogue d\'équipements/systèmes applicable)')
  }
  if (ecarts.length > 0) {
    score += 10
    signaux += 1
    raisons.push('Écarts existants : chaînage écart ↔ mode de défaillance possible')
  }
  if (profil && profil.c3 < 60) {
    score += 10
    signaux += 1
    raisons.push(`C3 faible (${profil.c3}/100) : AMDEC prioritaire sur la conformité technique`)
  }
  if (amdecAnalyses.length === 0 && profil) {
    score += 5
    signaux += 1
    raisons.push('AMDEC non initialisée : le catalogue est prêt à générer l\'analyse')
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'amdec', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreHMM(input: ModeleAnalyseInput): ScoreModele {
  const hmm = input.profil?.hmm_state
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 4

  if (hmm) {
    score += 55
    signaux += 1
    raisons.push('HMM (Markov caché) calculé pour cet aérodrome')
    if (hmm.isTransitioning) {
      score += 15
      signaux += 1
      raisons.push('Transition silencieuse détectée vers un état dégradé')
    } else if (hmm.transitionRisk > 50) {
      score += 10
      signaux += 1
      raisons.push(`Risque de transition élevé (${Math.round(hmm.transitionRisk)}%)`)
    }
    if (hmm.daysToCritical > 0 && hmm.daysToCritical < 90) {
      score += 10
      signaux += 1
      raisons.push(`Compte à rebours avant le seuil critique : ${hmm.daysToCritical} j`)
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'hmm', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreSurvie(input: ModeleAnalyseInput): ScoreModele {
  const survie = input.profil?.survival_metrics
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 3

  if (survie) {
    score += 55
    signaux += 1
    raisons.push('Modèle de survie (Cox / Kaplan-Meier) calculé')
    if (survie.hazard90d > 0.5) {
      score += 15
      signaux += 1
      raisons.push(`Hazard 90j élevé (${Math.round(survie.hazard90d * 100)}%)`)
    } else if (survie.hazard90d > 0.3) {
      score += 10
      signaux += 1
      raisons.push(`Hazard 90j modéré (${Math.round(survie.hazard90d * 100)}%)`)
    }
    if (survie.medianDays > 0 && survie.medianDays < 100) {
      score += 10
      signaux += 1
      raisons.push(`Médiane avant incident : ${survie.medianDays} j`)
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'survie', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreEVT(input: ModeleAnalyseInput): ScoreModele {
  const evt = input.profil?.extreme_risk
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 4

  if (evt) {
    score += 55
    signaux += 1
    raisons.push('Théorie des valeurs extrêmes calculée (GEV / Hill)')
    if (evt.isHeavyTailed) {
      score += 15
      signaux += 1
      raisons.push('Distribution à queue lourde : extrêmes significativement plus fréquents')
    }
    if (evt.tailRisk > 0.3) {
      score += 10
      signaux += 1
      raisons.push(`Probabilité d'événement extrême élevée (${Math.round(evt.tailRisk * 100)}%)`)
    }
    if (evt.maxExpected12m > 0) {
      score += 5
      signaux += 1
      raisons.push(`Maximum attendu sur 12 mois : ${evt.maxExpected12m} incidents`)
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'evt', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreCopulas(input: ModeleAnalyseInput): ScoreModele {
  const copula = input.profil?.copula_metrics
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 4

  if (copula) {
    score += 55
    signaux += 1
    raisons.push('Dépendance copulas calculée entre domaines')
    if (copula.maxTailDependence > 0.6) {
      score += 15
      signaux += 1
      raisons.push(`Forte dépendance de queue (${Math.round(copula.maxTailDependence * 100)}%)`)
    }
    if (copula.worstCaseProbability > 0.5) {
      score += 10
      signaux += 1
      raisons.push(`Probabilité de scénario extrême élevée (${Math.round(copula.worstCaseProbability * 100)}%)`)
    }
    if (copula.worstCaseDescription) {
      score += 5
      signaux += 1
      raisons.push('Scénario pire cas modélisé')
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'copula', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreThompson(input: ModeleAnalyseInput): ScoreModele {
  const ts = input.profil?.ts_metrics
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 3

  if (ts) {
    score += 55
    signaux += 1
    raisons.push('Thompson Sampling calculé (exploration / exploitation)')
    if (ts.recommendedAction) {
      score += 10
      signaux += 1
      raisons.push(`Action de surveillance recommandée : ${ts.recommendedAction}`)
    }
    if (ts.bestProbability > 60) {
      score += 15
      signaux += 1
      raisons.push(`Confiance élevée sur l'action (${Math.round(ts.bestProbability)}%)`)
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'thompson', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreBayes(input: ModeleAnalyseInput): ScoreModele {
  const { profil } = input
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 3

  if (profil?.bayesian_posterior != null) {
    score += 55
    signaux += 1
    raisons.push('Mise à jour bayésienne de la probabilité de défaillance disponible')
    if (profil.bayesian_black_swan) {
      score += 15
      signaux += 1
      raisons.push('Signal cygne noir détecté')
    }
    if (profil.bayesian_prior != null && profil.bayesian_posterior > profil.bayesian_prior) {
      score += 10
      signaux += 1
      raisons.push('Hausse de la probabilité a posteriori vs a priori')
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'bayes', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

function scoreRandomForest(input: ModeleAnalyseInput): ScoreModele {
  const rf = input.rfModelInfo
  const raisons: string[] = []
  let score = 20
  let signaux = 0
  let totalSignaux = 4

  if (rf) {
    score += 55
    signaux += 1
    raisons.push('Random Forest entraîné sur des données réelles')
    if (rf.accuracy >= 0.7) {
      score += 15
      signaux += 1
      raisons.push(`Précision élevée du modèle (${Math.round(rf.accuracy * 100)}%)`)
    }
    if (rf.training_samples >= 10) {
      score += 10
      signaux += 1
      raisons.push(`Entraîné sur ${rf.training_samples} échantillons`)
    }
    if (rf.feature_importance && Object.keys(rf.feature_importance).length > 0) {
      score += 5
      signaux += 1
      raisons.push('Importance des caractéristiques disponible')
    }
  }

  score = clamp(score)
  const confiance = Math.round((signaux / totalSignaux) * 100)
  return { modele: 'rf', score, confiance, intervalle: intervallePour(score, confiance), raisons }
}

/**
 * Recommande le modèle d'analyse le plus adapté aux données fournies.
 * Déterministe (aucun appel LLM) — sert de base au workflow de l'inspecteur
 * et au DiagnosticTab du profil de risque.
 */
export function recommanderModeleAnalyse(input: ModeleAnalyseInput): RecommandationModele {
  const scores: ScoreModele[] = [
    scoreBowTie(input),
    scoreFTA(input),
    scoreAMDEC(input),
    scoreHMM(input),
    scoreSurvie(input),
    scoreEVT(input),
    scoreCopulas(input),
    scoreThompson(input),
    scoreBayes(input),
    scoreRandomForest(input),
  ]
  const meilleur = scores.reduce((acc, s) => (s.score > acc.score ? s : acc), scores[0])
  const exAequo = scores.some(
    (s) => s.modele !== meilleur.modele && s.score === meilleur.score && s.score > 30,
  )
  const fallbackDeterministe = meilleur.score < 35 || exAequo
  const recommande: ModeleAnalyse = exAequo ? 'bowtie' : meilleur.modele

  const justification = fallbackDeterministe
    ? `Données insuffisantes pour trancher — modèle Bow-Tie par défaut (${meilleur.score}/100). `
      + `Complétez les données pour affiner la recommandation.`
    : `${MODELE_LABELS[recommande]} est le modèle le plus adapté (score ${meilleur.score}/100, `
      + `confiance ${meilleur.confiance}%). ${meilleur.raisons[0] || ''}`

  return { recommande, scores, fallbackDeterministe, justification }
}

/**
 * Version allégée pour les cas sans AMDEC/FTA (ex. vue exploitant) :
 * ne compare que les modèles réellement disponibles.
 */
export function recommanderParmi(input: ModeleAnalyseInput, modeles: ModeleAnalyse[]): RecommandationModele {
  const tous = recommanderModeleAnalyse(input)
  return {
    ...tous,
    scores: tous.scores.filter((s) => modeles.includes(s.modele)),
    recommande: modeles.includes(tous.recommande) ? tous.recommande : modeles[0],
  }
}

/**
 * Détermine les modèles réellement disponibles pour les données fournies,
 * à partir des données du store (aucun codage en dur des contextes).
 */
export function getModelesDisponibles(input: ModeleAnalyseInput): ModeleAnalyse[] {
  const dispo: ModeleAnalyse[] = []

  // Bow-Tie : analyse systémique de l'aérodrome — dispo dès qu'un profil existe
  // ou qu'il y a des écarts / surveillances à relier aux barrières.
  if (input.profil || input.ecarts.length > 0 || input.surveillances.length > 0 || (input.evenements?.length ?? 0) > 0) {
    dispo.push('bowtie')
  }

  // FTA : analyse causale top-down d'UN événement — dispo uniquement si un
  // événement est ciblé (contexte workflow). Jamais dans le profil sans cible.
  if (input.evenement) {
    dispo.push('fta')
  }

  // AMDEC : bottom-up par équipement/système — dispo si des analyses existent
  // ou si l'infrastructure est connue (catalogue d'équipements applicable).
  if (input.amdecAnalyses.length > 0 || input.profil?.infrastructure) {
    dispo.push('amdec')
  }

  // Modèles ML avancés — dispo dès que leurs métriques sont réellement
  // calculées et persistées pour cet aérodrome (aucun codage en dur).
  if (input.profil?.hmm_state) dispo.push('hmm')
  if (input.profil?.survival_metrics) dispo.push('survie')
  if (input.profil?.extreme_risk) dispo.push('evt')
  if (input.profil?.copula_metrics) dispo.push('copula')
  if (input.profil?.ts_metrics) dispo.push('thompson')
  if (input.profil?.bayesian_posterior != null) dispo.push('bayes')
  if (input.rfModelInfo) dispo.push('rf')

  return dispo
}
