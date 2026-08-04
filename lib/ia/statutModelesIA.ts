// lib/ia/statutModelesIA.ts
// Explication IA en langage clair de la carte « Statut des modèles » :
// quels modèles tournent, ce qu'ils indiquent, pourquoi les autres ne tournent
// pas (données manquantes) et comment lire la confiance / les intervalles.
// Le fallback déterministe reflète les mêmes chiffres — aucun texte statique.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque } from '@/lib/store'
import type { RandomForestModelStored } from '@/lib/store/models'
import { NOMBRE_MAX_VOTES, type DiagnosticUnifie } from '@/lib/risque/modelSynthesis'

export interface ModeleStatut {
  id: string
  nom: string
  actif: boolean
  indiceDegradation?: number
  confiance?: number
  interpretation?: string
  raisonInactif?: string
}

export interface StatutModelesExplication {
  /** Synthèse globale du consensus des modèles. */
  synthese: string
  /** Ce qu'indiquent les modèles actifs, en langage clair. */
  actifs: string
  /** Pourquoi les autres modèles ne tournent pas + implication. */
  inactifs: string
  /** Comment lire la confiance ensemble et les intervalles de prédiction. */
  confiance: string
  fallbackIA: boolean
}

const RAISON_HISTORIQUE = 'non calculé — nécessite ≥ 3 relevés d\'historique de score'

/** Inventaire data-driven des modèles suivis : actifs ou inactifs avec la raison. */
export function calculerStatutModeles(
  profil: ProfilRisque,
  rfModelInfo?: RandomForestModelStored | null
): ModeleStatut[] {
  const statuts: ModeleStatut[] = []

  statuts.push({ id: 'score', nom: 'Score global C1-C5', actif: true })

  if (profil.velocity_metrics) statuts.push({ id: 'velocity', nom: 'Vélocité', actif: true })
  else statuts.push({ id: 'velocity', nom: 'Vélocité', actif: false, raisonInactif: 'non calculée — données temporelles insuffisantes' })

  if (profil.system_stress && profil.system_stress.score !== undefined) statuts.push({ id: 'stress', nom: 'Stress système', actif: true })
  else statuts.push({ id: 'stress', nom: 'Stress système', actif: false, raisonInactif: 'non estimé — données de stress système absentes' })

  if (profil.proactive_alert) statuts.push({ id: 'alerte', nom: 'Alerte proactive', actif: true })
  else statuts.push({ id: 'alerte', nom: 'Alerte proactive', actif: false, raisonInactif: 'aucune alerte proactive active' })

  if (profil.hawkes_intensity !== undefined) statuts.push({ id: 'hawkes', nom: 'Hawkes (contagion)', actif: true })
  else statuts.push({ id: 'hawkes', nom: 'Hawkes (contagion)', actif: false, raisonInactif: 'non calculé — événements insuffisants pour estimer la contagion' })

  if (profil.hmm_state) statuts.push({ id: 'hmm', nom: 'HMM (Markov)', actif: true })
  else statuts.push({ id: 'hmm', nom: 'HMM (Markov)', actif: false, raisonInactif: RAISON_HISTORIQUE })

  if (profil.survival_metrics) statuts.push({ id: 'survie', nom: 'Analyse de survie', actif: true })
  else statuts.push({ id: 'survie', nom: 'Analyse de survie', actif: false, raisonInactif: RAISON_HISTORIQUE })

  if (profil.extreme_risk) statuts.push({ id: 'evt', nom: 'Risque extrême (EVT)', actif: true })
  else statuts.push({ id: 'evt', nom: 'Risque extrême (EVT)', actif: false, raisonInactif: RAISON_HISTORIQUE })

  if (profil.bayesian_posterior !== undefined) statuts.push({ id: 'bayes', nom: 'Bayésien', actif: true })
  else statuts.push({ id: 'bayes', nom: 'Bayésien', actif: false, raisonInactif: 'non calculé — mise à jour bayésienne absente' })

  if (profil.copula_metrics) statuts.push({ id: 'copula', nom: 'Copule (dépendance)', actif: true })
  else statuts.push({ id: 'copula', nom: 'Copule (dépendance)', actif: false, raisonInactif: RAISON_HISTORIQUE })

  if (profil.negbin_metrics) statuts.push({ id: 'negbin', nom: 'Négatif binomial', actif: true })
  else statuts.push({ id: 'negbin', nom: 'Négatif binomial', actif: false, raisonInactif: 'non estimé — surdispersion des incidents absente' })

  if (profil.incident_prediction_3m !== undefined) statuts.push({ id: 'pred', nom: 'Prédiction incidents', actif: true })
  else statuts.push({ id: 'pred', nom: 'Prédiction incidents', actif: false, raisonInactif: 'non calculée — incidents insuffisants' })

  if (profil.ts_metrics) statuts.push({ id: 'ts', nom: 'Thompson Sampling', actif: true })
  else statuts.push({ id: 'ts', nom: 'Thompson Sampling', actif: false, raisonInactif: RAISON_HISTORIQUE })

  if (rfModelInfo) statuts.push({ id: 'rf', nom: 'Random Forest', actif: true })
  else statuts.push({ id: 'rf', nom: 'Random Forest', actif: false, raisonInactif: 'non entraîné — échantillons d\'apprentissage insuffisants' })

  return statuts
}

/** Injecte les votes de la synthèse pour enrichir les statuts actifs. */
export function enrichirStatutsAvecVotes(statuts: ModeleStatut[], votes: DiagnosticUnifie['votes']): ModeleStatut[] {
  const parNom = new Map(votes.map((v) => [v.nom, v]))
  return statuts.map((s) => {
    const v = parNom.get(s.nom)
    return v ? { ...s, actif: true, indiceDegradation: v.indiceDegradation, confiance: v.confiance, interpretation: v.interpretation } : s
  })
}

export function expliquerStatutModeles(
  profil: ProfilRisque,
  diagnostic: DiagnosticUnifie,
  rfModelInfo?: RandomForestModelStored | null
): Promise<StatutModelesExplication> {
  const statuts = enrichirStatutsAvecVotes(calculerStatutModeles(profil, rfModelInfo), diagnostic.votes)
  const inactifs = statuts.filter((s) => !s.actif)
  const actifs = statuts.filter((s) => s.actif)

  const fallback: StatutModelesExplication = {
    synthese: `Les modèles actifs (${actifs.length} sur ${NOMBRE_MAX_VOTES}) convergent vers un indice global de dégradation de ${diagnostic.indiceGlobal}/100, avec une confiance ensemble de ${diagnostic.confianceGlobale}%.`,
    actifs: actifs.length > 0
      ? [...actifs]
          .sort((a, b) => (b.indiceDegradation ?? 0) - (a.indiceDegradation ?? 0))
          .slice(0, 3)
          .map((a) => `${a.nom} (${a.indiceDegradation}/100, confiance ${a.confiance}%) : ${a.interpretation}`)
          .join(' · ')
      : 'Aucun modèle ne signale actuellement de dégradation.',
    inactifs: inactifs.length > 0
      ? `${inactifs.length} modèle${inactifs.length > 1 ? 's' : ''} ne tourne${inactifs.length > 1 ? 'nt' : ''} pas faute de données : ${inactifs.map((i) => `${i.nom} (${i.raisonInactif})`).join(', ')}. Les modèles prédictifs (HMM, survie, EVT, copule, Thompson Sampling) nécessitent au moins 3 relevés d'historique de score.`
      : 'Tous les modèles suivis tournent sur ce profil.',
    confiance: diagnostic.confianceGlobale >= 70
      ? `La confiance ensemble de ${diagnostic.confianceGlobale}% indique un accord fort entre les modèles.`
      : diagnostic.confianceGlobale >= 40
        ? `La confiance ensemble de ${diagnostic.confianceGlobale}% indique un accord modéré — vérifier les données sous-jacentes.`
        : `La confiance ensemble de ${diagnostic.confianceGlobale}% indique une forte divergence entre les modèles : les données sont probablement hétérogènes.`,
    fallbackIA: true,
  }

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), le statut des modèles d'analyse du risque d'un aérodrome : quels modèles tournent, pourquoi les autres ne tournent pas, et comment lire la confiance.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(profil, diagnostic, statuts, rfModelInfo)}

Contraintes :
- « synthese » : résume le consensus des modèles avec l'indice global et la confiance réels.
- « actifs » : explique ce qu'indiquent concrètement les modèles qui tournent, avec leurs chiffres.
- « inactifs » : explique pourquoi les autres ne tournent pas (données manquantes) et ce que cela implique pour la détection précoce.
- « confiance » : explique ce que la confiance ensemble et les intervalles de prédiction signifient pour la fiabilité.
- 1-2 phrases par champ, sans jargon.

Retourne uniquement un JSON :
{
  "synthese": "...",
  "actifs": "...",
  "inactifs": "...",
  "confiance": "..."
}`

  const iaFallback = {
    synthese: fallback.synthese,
    actifs: fallback.actifs,
    inactifs: fallback.inactifs,
    confiance: fallback.confiance,
  }

  return aiClient.callJSON<{
    synthese?: string
    actifs?: string
    inactifs?: string
    confiance?: string
  }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: 'json_object',
    },
    iaFallback
  ).then((result) => ({
    synthese: pick(result.synthese, fallback.synthese),
    actifs: pick(result.actifs, fallback.actifs),
    inactifs: pick(result.inactifs, fallback.inactifs),
    confiance: pick(result.confiance, fallback.confiance),
    fallbackIA:
      result.synthese === fallback.synthese &&
      result.actifs === fallback.actifs &&
      result.inactifs === fallback.inactifs &&
      result.confiance === fallback.confiance,
  }))
}

function pick(v: unknown, fb: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb
}

function contexteReel(
  profil: ProfilRisque,
  diagnostic: DiagnosticUnifie,
  statuts: ModeleStatut[],
  rfModelInfo?: RandomForestModelStored | null
): string {
  return JSON.stringify(
    {
      aerodrome: profil.aerodrome_id ?? null,
      score_global: profil.score_global ?? null,
      indice_global_degradation: diagnostic.indiceGlobal,
      tendance: diagnostic.tendance,
      confiance_ensemble: diagnostic.confianceGlobale,
      nb_modeles_actifs: statuts.filter((s) => s.actif).length,
      modeles_actifs: statuts
        .filter((s) => s.actif)
        .map((s) => ({ nom: s.nom, indice_degradation: s.indiceDegradation, confiance: s.confiance, interpretation: s.interpretation })),
      modeles_inactifs: statuts
        .filter((s) => !s.actif)
        .map((s) => ({ nom: s.nom, raison_inactif: s.raisonInactif })),
      intervalle_prediction_3m: profil.prediction_interval_3m ?? null,
      intervalle_prediction_6m: profil.prediction_interval_6m ?? null,
      rf_entraine: !!rfModelInfo,
      rf_precision: rfModelInfo ? Math.round(rfModelInfo.accuracy * 100) : null,
      rf_echantillons: rfModelInfo?.training_samples ?? null,
    },
    null,
    2
  )
}
