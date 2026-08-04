// lib/ia/anticipationIA.ts
// Explication IA en langage clair des cartes « Prédictions temporelles » et
// « Risques incidents & extrêmes » de l'onglet Anticipation, pour l'inspecteur.
// Les textes sont TOUJOURS construits à partir des données réelles du profil
// (prédictions, intervalle de confiance, probabilités d'incident, risque
// extrême EVT). Le fallback déterministe reflète les mêmes chiffres normalisés —
// aucun texte statique, aucune valeur inventée.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque } from '@/lib/store'

export interface AnticipationExplication {
  texte: string
  fallbackIA: boolean
}

// Normalise une valeur vers un pourcentage 0-100 (accepte 0-1 ou 0-100)
function pct(v?: number | null): number | null {
  if (v === undefined || v === null || Number.isNaN(v)) return null
  const p = v <= 1 ? v * 100 : v
  return Math.min(100, Math.max(0, Math.round(p)))
}

export interface PredictionsContexte {
  prediction_3m: number | null
  prediction_6m: number | null
  prediction_12m: number | null
  intervalle_3m: { lower: number; upper: number } | null
  intervalle_6m: { lower: number; upper: number } | null
  confiance_ensemble: number | null
  tendance: string | null
}

export function contextePredictions(profil: ProfilRisque): PredictionsContexte {
  return {
    prediction_3m: profil.prediction_3m != null ? Math.round(profil.prediction_3m) : null,
    prediction_6m: profil.prediction_6m != null ? Math.round(profil.prediction_6m) : null,
    prediction_12m: profil.prediction_12m != null ? Math.round(profil.prediction_12m) : null,
    intervalle_3m: profil.prediction_interval_3m
      ? { lower: pct(profil.prediction_interval_3m.lower) ?? 0, upper: pct(profil.prediction_interval_3m.upper) ?? 100 }
      : null,
    intervalle_6m: profil.prediction_interval_6m
      ? { lower: pct(profil.prediction_interval_6m.lower) ?? 0, upper: pct(profil.prediction_interval_6m.upper) ?? 100 }
      : null,
    confiance_ensemble: pct(profil.ensemble_confidence),
    tendance: profil.tendance ?? null,
  }
}

export function fallbackPredictions(profil: ProfilRisque): AnticipationExplication {
  const c = contextePredictions(profil)
  const parties: string[] = []
  if (c.prediction_3m != null && c.prediction_6m != null) {
    parties.push(
      `le score de risque devrait passer de ${Math.round(profil.score_global)}/100 à environ ${c.prediction_3m}/100 dans 3 mois puis ${c.prediction_6m}/100 dans 6 mois`
    )
  } else if (c.prediction_3m != null) {
    parties.push(`le score de risque devrait évoluer vers ${c.prediction_3m}/100 dans 3 mois`)
  }
  if (c.intervalle_3m) {
    parties.push(`intervalle de confiance à 95 % de ${c.intervalle_3m.lower}–${c.intervalle_3m.upper} points à 3 mois`)
  }
  if (c.confiance_ensemble != null) {
    parties.push(`fiabilité des modèles estimée à ${c.confiance_ensemble} %`)
  }
  const texte = parties.length > 0
    ? `Ces projections à partir des données réelles indiquent que ${parties.join(' ; ')}. Elles aident à planifier la prochaine échéance de surveillance.`
    : `Les prédictions temporelles à 3, 6 et 12 mois projettent l'évolution probable du score de risque pour planifier la surveillance.`
  return { texte, fallbackIA: true }
}

export interface IncidentsContexte {
  incident_3m: number | null
  incident_6m: number | null
  incident_12m: number | null
  risque_extreme: number | null
  queue_lourde: boolean | null
  max_attendu_12m: number | null
  jours_depuis_dernier_evenement: number | null
}

export function contexteIncidents(profil: ProfilRisque): IncidentsContexte {
  return {
    incident_3m: pct(profil.incident_prediction_3m),
    incident_6m: pct(profil.incident_prediction_6m),
    incident_12m: pct(profil.incident_prediction_12m),
    risque_extreme: profil.extreme_risk ? pct(profil.extreme_risk.tailRisk) : null,
    queue_lourde: profil.extreme_risk?.isHeavyTailed ?? null,
    max_attendu_12m: profil.extreme_risk?.maxExpected12m ?? null,
    jours_depuis_dernier_evenement: profil.days_since_last_event ?? null,
  }
}

export function fallbackIncidents(profil: ProfilRisque): AnticipationExplication {
  const c = contexteIncidents(profil)
  const plages: string[] = []
  if (c.incident_3m != null) plages.push(`${c.incident_3m} % sur 3 mois`)
  if (c.incident_6m != null) plages.push(`${c.incident_6m} % sur 6 mois`)
  if (c.incident_12m != null) plages.push(`${c.incident_12m} % sur 12 mois`)
  const phraseIncidents = plages.length > 0
    ? `La probabilité qu'au moins un incident survienne est estimée à ${plages.join(', ')}.`
    : "Les probabilités d'incident ne sont pas encore calculées pour cet aérodrome."
  const extreme = c.risque_extreme != null
    ? `Le risque d'événement extrême est évalué à ${c.risque_extreme} % avec une distribution ${c.queue_lourde ? 'à queue lourde (événements rares plus fréquents que la normale)' : 'normale'}${c.max_attendu_12m != null ? `, pour un maximum attendu de ${c.max_attendu_12m} incidents sur 12 mois` : ''}.`
    : null
  const dernierEvenement = c.jours_depuis_dernier_evenement != null && c.jours_depuis_dernier_evenement >= 0
    ? `Le dernier événement remonte à ${c.jours_depuis_dernier_evenement} jour(s).`
    : null
  const texte = [phraseIncidents, extreme, dernierEvenement].filter(Boolean).join(' ')
  return { texte, fallbackIA: true }
}

function contexteReel(profil: ProfilRisque, type: 'predictions' | 'incidents'): string {
  const base = {
    score_global: profil.score_global ?? null,
    tendance: profil.tendance ?? null,
  }
  const data = type === 'predictions'
    ? { ...base, ...contextePredictions(profil) }
    : { ...base, ...contexteIncidents(profil) }
  return JSON.stringify(data, null, 2)
}

export async function expliquerPredictionsEnClair(profil: ProfilRisque): Promise<AnticipationExplication> {
  const fallback = fallbackPredictions(profil)

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), ce que signifient les prédictions temporelles du profil de risque.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(profil, 'predictions')}

Contraintes :
- Traduis les chiffres en conséquence pratique : le score attendu à 3/6/12 mois, l'intervalle de confiance à 95 %, et la fiabilité de l'ensemble des modèles.
- Relie le texte à la situation réelle (tendance, score actuel) quand c'est utile.
- 2-3 phrases maximum, en langage simple, sans jargon.
- Ne pas inventer de données absentes du contexte.

Retourne uniquement un JSON :
{
  "texte": "ce que signifient ces prédictions pour la surveillance, en langage clair"
}`

  const result = await aiClient.callJSON<{ texte: string }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: 'json_object',
    },
    { texte: fallback.texte }
  )

  const texte = typeof result.texte === 'string' && result.texte.trim()
    ? result.texte.trim()
    : fallback.texte

  return { texte, fallbackIA: texte === fallback.texte }
}

export async function expliquerRisquesIncidentsEnClair(profil: ProfilRisque): Promise<AnticipationExplication> {
  const fallback = fallbackIncidents(profil)

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), ce que signifient les risques d'incidents et d'événements extrêmes du profil de risque.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(profil, 'incidents')}

Contraintes :
- Traduis les probabilités d'incident (3, 6, 12 mois) en conséquence pratique pour la surveillance.
- Explique le risque d'événement extrême (EVT) : probabilité, queue lourde ou normale, maximum attendu sur 12 mois.
- Relie le texte aux données réelles (dernier événement, score) quand c'est utile.
- 2-3 phrases maximum, en langage simple, sans jargon.
- Ne pas inventer de données absentes du contexte.

Retourne uniquement un JSON :
{
  "texte": "ce que signifient ces risques pour la surveillance, en langage clair"
}`

  const result = await aiClient.callJSON<{ texte: string }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: 'json_object',
    },
    { texte: fallback.texte }
  )

  const texte = typeof result.texte === 'string' && result.texte.trim()
    ? result.texte.trim()
    : fallback.texte

  return { texte, fallbackIA: texte === fallback.texte }
}
