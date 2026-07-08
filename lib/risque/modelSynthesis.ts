// lib/risque/modelSynthesis.ts
// Moteur de synthèse IA : agrège tous les modèles (C1-C5, bayésien, Hawkes, CUSUM,
// survie, EVT, copule, HMM, RF, ensemble, Naive Bayes C5) en un diagnostic unifié
// avec interprétation en langage naturel pour l'inspecteur.
//
// Principe : chaque modèle vote "dégradation" ou "stabilité" avec un poids fonction
// de sa confiance. Le consensus final alimente une recommandation unique.

import type { ProfilRisque } from '@/lib/store'

// ────────────────────────────────────────────
// TYPES DE SORTIE
// ────────────────────────────────────────────

export interface ModeleVote {
  nom: string
  indiceDegradation: number  // 0 (stable) → 100 (dégradation critique)
  confiance: number          // 0–100
  interpretation: string     // une phrase lisible
}

export interface DiagnosticUnifie {
  /** Niveau de dégradation global pondéré */
  indiceGlobal: number
  /** Interprétation textuelle courte (1 ligne) */
  interpretation: string
  /** Confiance globale dans le diagnostic */
  confianceGlobale: number
  /** Tendance consolidée */
  tendance: 'amelioration' | 'stable' | 'degradation_legere' | 'degradation_rapide'
  /** Détail des votes par modèle */
  votes: ModeleVote[]
  /** Signaux contradictoires entre modèles (si accord < 60%) */
  signauxContradictoires: string[]
  /** Recommandation principale */
  recommandation: string
  /** Éléments clés justifiant le diagnostic */
  elementsClefs: string[]
}

// ────────────────────────────────────────────
// MOTEUR DE SYNTHÈSE
// ────────────────────────────────��───────────

/**
 * Agrège tous les modèles disponibles sur le ProfilRisque pour produire
 * un diagnostic unifié. Chaque modèle qui a suffisamment de données émet
 * un vote. Le consensus final est calculé par moyenne pondérée par la confiance.
 */
export function synthetiserModeles(profil: ProfilRisque): DiagnosticUnifie {
  const votes: ModeleVote[] = []

  // ── 1. Score global C1-C5 ──
  votes.push(voterScoreGlobal(profil))

  // ── 2. Vélocité (vitesse de dégradation) ──
  if (profil.velocity_metrics) {
    votes.push(voterVelocite(profil.velocity_metrics))
  }

  // ── 3. Stress système ──
  if (profil.system_stress) {
    votes.push(voterStressSysteme(profil.system_stress))
  }

  // ── 4. Alerte proactive ──
  if (profil.proactive_alert) {
    votes.push(voterAlerteProactive(profil.proactive_alert))
  }

  // ── 5. Hawkes (contagion d'incidents) ──
  if (profil.hawkes_intensity !== undefined) {
    votes.push(voterHawkes(profil.hawkes_intensity))
  }

  // ── 6. HMM (transition silencieuse) ──
  if (profil.hmm_state) {
    votes.push(voterHMM(profil.hmm_state))
  }

  // ── 7. Survie (hazard 90j) ──
  if (profil.survival_metrics) {
    votes.push(voterSurvie(profil.survival_metrics))
  }

  // ── 8. Risque extrême (EVT) ──
  if (profil.extreme_risk) {
    votes.push(voterExtreme(profil.extreme_risk))
  }

  // ── 9. Bayésien (posterior) ──
  if (profil.bayesian_posterior !== undefined) {
    votes.push(voterBayesien(profil.bayesian_posterior, profil.bayesian_black_swan))
  }

  // ── 10. Copule (dépendance de queue) ──
  if (profil.copula_metrics) {
    votes.push(voterCopule(profil.copula_metrics))
  }

  // ── 11. Négatif binomial (surdimension) ──
  if (profil.negbin_metrics) {
    votes.push(voterNegBin(profil.negbin_metrics))
  }

  // ── 12. Prédiction d'incidents ──
  if (profil.incident_prediction_3m !== undefined) {
    votes.push(voterPredictionIncidents(profil))
  }

  // ── Agrégation pondérée par confiance ──
  const poidsTotal = votes.reduce((s, v) => s + v.confiance, 0) || 1
  const indiceGlobal = votes.reduce((s, v) => s + v.indiceDegradation * v.confiance, 0) / poidsTotal

  // Confiance globale : moyenne des confiances, pénalisée si les votes divergent
  const confianceMoyenne = votes.reduce((s, v) => s + v.confiance, 0) / votes.length
  const ecartIndices = Math.sqrt(votes.reduce((s, v) => s + (v.indiceDegradation - indiceGlobal) ** 2, 0) / votes.length)
  const penalties = Math.min(30, ecartIndices * 0.6) // écart-type de 50 pts → -30% confiance
  const confianceGlobale = Math.round(Math.max(20, confianceMoyenne - penalties))

  // Tendances contradictoires
  const signauxContradictoires: string[] = []
  if (votes.length >= 2 && ecartIndices > 25) {
    const extremes = [...votes].sort((a, b) => a.indiceDegradation - b.indiceDegradation)
    const [plusStable, plusDegrade] = [extremes[0], extremes[extremes.length - 1]]
    if (plusDegrade.indiceDegradation - plusStable.indiceDegradation > 40) {
      signauxContradictoires.push(
        `${plusStable.nom} (indice ${plusStable.indiceDegradation}) et ${plusDegrade.nom} (indice ${plusDegrade.indiceDegradation}) divergent — vérifier les données sous-jacentes`
      )
    }
  }

  // Tendance
  let tendance: DiagnosticUnifie['tendance'] = 'stable'
  if (profil.velocity_metrics) {
    const v = profil.velocity_metrics.vitesse
    if (v < -2) tendance = 'degradation_rapide'
    else if (v < -0.5) tendance = 'degradation_legere'
    else if (v > 1) tendance = 'amelioration'
  } else if (profil.tendance === 'baisse') {
    tendance = 'degradation_legere'
  } else if (profil.tendance === 'hausse') {
    tendance = 'amelioration'
  }

  // Interpretation, recommandation et elementsClefs sont generes par l'IA
  // (route /api/ai/synthesis) et affiches dans SyntheseTab
  const interpretation = `Analyse basee sur ${votes.length} modeles — indice global ${Math.round(indiceGlobal)}/100`
  const recommandation = 'Consulter la synthese IA pour les actions recommandees.'
  const elementsClefs: string[] = []

  return {
    indiceGlobal: Math.round(indiceGlobal),
    interpretation,
    confianceGlobale,
    tendance,
    votes,
    signauxContradictoires,
    recommandation,
    elementsClefs,
  }
}

// ────────────────────────────────────────────
// VOTES PAR MODÈLE
// ────────────────────────────────────────────

function voterScoreGlobal(profil: ProfilRisque): ModeleVote {
  const s = profil.score_global
  // score 0-100 inversé : 0 = pire, 100 = meilleur
  const indice = Math.round(100 - s)
  const confiance = profil.ensemble_confidence ?? 70
  return {
    nom: 'Score global C1-C5',
    indiceDegradation: Math.min(100, indice),
    confiance: Math.round(confiance),
    interpretation: s >= 70 ? 'Score global satisfaisant' :
      s >= 50 ? 'Score global modéré — vigilance' :
      s >= 30 ? 'Score global dégradé — risque élevé' :
      'Score global critique — action immédiate',
  }
}

function voterVelocite(vm: NonNullable<ProfilRisque['velocity_metrics']>): ModeleVote {
  const v = vm.vitesse
  const indice = v < -3 ? 95 : v < -2 ? 80 : v < -1 ? 60 : v < 0 ? 40 : v < 1 ? 20 : 10
  return {
    nom: 'Vélocité',
    indiceDegradation: indice,
    confiance: { normal: 60, surveillance: 70, alerte: 80, critique: 90 }[vm.niveau_vigilance] || 60,
    interpretation: v < -2 ? `Dégradation rapide (${v.toFixed(1)} pts/mois)` :
      v < 0 ? `Dégradation lente (${v.toFixed(1)} pts/mois)` :
      v > 1 ? `Amélioration (${v.toFixed(1)} pts/mois)` :
      'Stabilité',
  }
}

function voterStressSysteme(ss: NonNullable<ProfilRisque['system_stress']>): ModeleVote {
  const indice = ss.niveau_stress === 'critique' ? 90 : ss.niveau_stress === 'eleve' ? 70 : ss.niveau_stress === 'modere' ? 40 : 15
  return {
    nom: 'Stress système',
    indiceDegradation: indice,
    confiance: 75,
    interpretation: `Stress ${ss.niveau_stress} (${ss.score}/100) — ${ss.recommandation}`,
  }
}

function voterAlerteProactive(pa: NonNullable<ProfilRisque['proactive_alert']>): ModeleVote {
  const map = { info: 10, vigilance: 35, alerte: 70, critique: 95 } as const
  const indice = map[pa.niveau_urgence] ?? 10
  return {
    nom: 'Alerte proactive',
    indiceDegradation: indice,
    confiance: 70,
    interpretation: `Urgence ${pa.niveau_urgence} — ${pa.message_court}`,
  }
}

function voterHawkes(intensity: number): ModeleVote {
  const indice = intensity > 2 ? 85 : intensity > 1 ? 65 : intensity > 0.5 ? 45 : 20
  return {
    nom: 'Hawkes (contagion)',
    indiceDegradation: indice,
    confiance: 60,
    interpretation: intensity > 1
      ? `Intensité Hawkes élevée (${intensity.toFixed(2)}) — risque de contagion`
      : `Intensité Hawkes modérée (${intensity.toFixed(2)})`,
  }
}

function voterHMM(hmm: NonNullable<ProfilRisque['hmm_state']>): ModeleVote {
  const confiance = hmm.isTransitioning ? 75 : 60
  const indice = hmm.isTransitioning ? 85 : Math.round(hmm.transitionRisk)
  return {
    nom: 'HMM (Markov)',
    indiceDegradation: indice,
    confiance,
    interpretation: hmm.isTransitioning
      ? `Transition silencieuse vers ${hmm.currentStateName} — risque élevé`
      : `Risque transition ${hmm.transitionRisk.toFixed(0)}%`,
  }
}

function voterSurvie(sm: NonNullable<ProfilRisque['survival_metrics']>): ModeleVote {
  const hazard = sm.hazard90d
  const indice = hazard > 0.5 ? 85 : hazard > 0.3 ? 65 : hazard > 0.15 ? 40 : 15
  return {
    nom: 'Analyse de survie',
    indiceDegradation: indice,
    confiance: 70,
    interpretation: `Hazard 90j: ${(hazard * 100).toFixed(0)}% — médiane survie: ${sm.medianDays}j`,
  }
}

function voterExtreme(er: NonNullable<ProfilRisque['extreme_risk']>): ModeleVote {
  const indice = er.isHeavyTailed ? Math.round(er.tailRisk * 100) : Math.round(er.tailRisk * 50)
  return {
    nom: 'Risque extrême (EVT)',
    indiceDegradation: Math.min(100, indice),
    confiance: 55,
    interpretation: er.isHeavyTailed
      ? `Queue lourde — risque extrême: ${(er.tailRisk * 100).toFixed(0)}%`
      : `Risque extrême modéré (${(er.tailRisk * 100).toFixed(0)}%)`,
  }
}

function voterBayesien(posterior: number, blackSwan?: boolean): ModeleVote {
  const indice = Math.round(posterior)
  return {
    nom: 'Bayésien',
    indiceDegradation: indice,
    confiance: blackSwan ? 85 : 65,
    interpretation: blackSwan
      ? `Black swan détecté — probabilité défaillance ${posterior.toFixed(0)}%`
      : `Probabilité défaillance ${posterior.toFixed(0)}%`,
  }
}

function voterCopule(cm: NonNullable<ProfilRisque['copula_metrics']>): ModeleVote {
  const indice = Math.round(cm.worstCaseProbability * 100)
  return {
    nom: 'Copule (dépendance)',
    indiceDegradation: indice,
    confiance: 50,
    interpretation: `Scénario extrême: ${cm.worstCaseDescription} (${(cm.worstCaseProbability * 100).toFixed(0)}%)`,
  }
}

function voterNegBin(nm: NonNullable<ProfilRisque['negbin_metrics']>): ModeleVote {
  const indice = nm.isOverdispersed ? Math.round(Math.min(100, nm.dispersion * 20)) : 20
  return {
    nom: 'Négatif binomial',
    indiceDegradation: indice,
    confiance: 45,
    interpretation: nm.isOverdispersed
      ? `Surcharge détectée (dispersion ${nm.dispersion.toFixed(2)})`
      : 'Distribution normale',
  }
}

function voterPredictionIncidents(profil: ProfilRisque): ModeleVote {
  const p3 = (profil.incident_prediction_3m ?? 0) / 100
  const indice = Math.round(p3 * 100)
  return {
    nom: 'Prédiction incidents',
    indiceDegradation: indice,
    confiance: 60,
    interpretation: p3 > 0.5
      ? `Probabilité incident 3 mois élevée (${(p3 * 100).toFixed(0)}%)`
      : `Probabilité incident 3 mois modérée (${(p3 * 100).toFixed(0)}%)`,
  }
}

// Le texte (interpretation, recommandation, elementsClefs) est desormais
// genere par l'IA via /api/ai/synthesis — voir SyntheseTab.tsx
