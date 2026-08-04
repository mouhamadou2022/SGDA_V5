// lib/ia/modelSelectorIA.ts
// Enrichissement IA de la recommandation de modèle d'analyse : traduit les
// raisons techniques (déterministes) en langage clair pour l'inspecteur.
// 0 API obligatoire : en cas d'échec, retombe sur le texte déterministe.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import {
  MODELE_LABELS,
  type ModeleAnalyseInput,
  type RecommandationModele,
  type ScoreModele,
} from './modelSelector'

export interface RecommandationClaire {
  justification: string
  scores: ScoreModele[]
  fallbackIA: boolean
}

function contexteReel(input: ModeleAnalyseInput): string {
  const profil = input.profil
  return JSON.stringify(
    {
      aerodrome: profil?.aerodrome_id ?? null,
      score_global: profil?.score_global ?? null,
      c1: profil?.c1 ?? null,
      c2: profil?.c2 ?? null,
      c3: profil?.c3 ?? null,
      c4: profil?.c4 ?? null,
      c5: profil?.c5 ?? null,
      nb_ecarts: input.ecarts.length,
      nb_surveillances: input.surveillances.length,
      nb_evenements: (input.evenements?.length ?? 0) + (input.evenement ? 1 : 0),
      evenement_grave: input.evenement?.gravite ?? null,
      nb_amdec: input.amdecAnalyses.length,
      amdec_non_corriges: input.amdecAnalyses.filter((a) => a.statut !== 'corrige').length,
      nb_fta: input.ftaAnalyses.length,
      // Modèles ML avancés — métriques réellement calculées et persistées
      hmm_transition: profil?.hmm_state?.isTransitioning ?? null,
      hmm_jours_critique: profil?.hmm_state?.daysToCritical ?? null,
      hmm_risque_transition: profil?.hmm_state?.transitionRisk ?? null,
      hazard_90j: profil?.survival_metrics ? Math.round(profil.survival_metrics.hazard90d * 100) : null,
      mediane_incident_j: profil?.survival_metrics?.medianDays ?? null,
      probabilite_extreme: profil?.extreme_risk ? Math.round(profil.extreme_risk.tailRisk * 100) : null,
      queue_lourde: profil?.extreme_risk?.isHeavyTailed ?? null,
      dependance_queue: profil?.copula_metrics ? Math.round(profil.copula_metrics.maxTailDependence * 100) : null,
      action_ts: profil?.ts_metrics?.recommendedAction ?? null,
      confiance_ts: profil?.ts_metrics?.bestProbability ?? null,
      probabilite_degradation: profil?.bayesian_posterior ?? null,
      cygne_noir: profil?.bayesian_black_swan ?? false,
      rf_entraine: !!input.rfModelInfo,
      rf_precision: input.rfModelInfo ? Math.round(input.rfModelInfo.accuracy * 100) : null,
    },
    null,
    2
  )
}

type TraductionIA = {
  justification: string
  raisons: Record<string, string[]>
}

export async function traduireRecommandationEnClair(
  input: ModeleAnalyseInput,
  rec: RecommandationModele,
  modeles: string[]
): Promise<RecommandationClaire> {
  const fallback: RecommandationClaire = {
    justification: rec.justification,
    scores: rec.scores,
    fallbackIA: true,
  }

  const traductionFallback: TraductionIA = {
    justification: rec.justification,
    raisons: Object.fromEntries(rec.scores.map((s) => [s.modele, s.raisons])),
  }

  const donnees = rec.scores.map((s) => ({
    modele: MODELE_LABELS[s.modele],
    pertinence: s.score,
    confiance: s.confiance,
    raisons_techniques: s.raisons,
  }))

  const userMessage = `Traduis en langage clair pour un inspecteur de la sécurité aérienne (ANACIM) la recommandation du modèle d'analyse de risque le plus adapté.

CONTEXTE RÉEL DE L'AÉRODROME (données du store) :
${contexteReel(input)}

RECOMMANDATION DÉTERMINISTE :
Modèle recommandé : ${MODELE_LABELS[rec.recommande]}
${JSON.stringify(donnees, null, 2)}

Retourne uniquement un JSON :
{
  "justification": "explication en 1-2 phrases, sans jargon, indiquant pourquoi ce modèle est le plus pertinent pour cet aérodrome",
  "raisons": {
    "${modeles[0] ?? 'bowtie'}": ["raison 1 claire", "raison 2 claire"],
    ...
  }
}
Chaque raison doit expliquer ce que l'inspecteur gagne à utiliser ce modèle, en fonction des données réelles (écarts, surveillances, événements, analyses existantes).`

  const result = await aiClient.callJSON<TraductionIA>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: 'json_object',
    },
    traductionFallback
  )

  const scores = rec.scores.map((s) => {
    const raisonsClaires = result.raisons?.[s.modele]
    return {
      ...s,
      raisons: Array.isArray(raisonsClaires) && raisonsClaires.length > 0 ? raisonsClaires : s.raisons,
    }
  })

  return {
    justification: result.justification || rec.justification,
    scores,
    fallbackIA: !result.justification || result.justification === rec.justification,
  }
}
