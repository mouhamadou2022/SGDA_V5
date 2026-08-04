// lib/ia/bayesExplicationIA.ts
// Explication IA en langage clair de la carte « Analyse bayésienne — de l'indice
// au risque ». Le message est TOUJOURS construit à partir des données réelles :
// a priori / a posteriori, delta, critères dégradés, événements, écarts, cygne noir.
// Le fallback déterministe reflète les mêmes chiffres — aucun texte statique.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'

export interface BayesExplication {
  /** Paragraphe d'introduction : la mécanique bayésienne appliquée à cet aérodrome. */
  explication: string
  /** Interprétation de la révision (hausse / stabilité) et de son sens. */
  interpretation: string
  /** Actions concrètes pour l'inspecteur. */
  actions: string[]
  fallbackIA: boolean
}

export interface BayesExplicationInput {
  profil: ProfilRisque
  ecarts: Ecart[]
  evenements?: EvenementSecurite[]
}

// Indices bayésiens : un critère C1-C5 dégradé (< 40) est un signal qui révisé
// la probabilité de défaillance. Cohérent avec computeBayesianPosterior.
export const CRITERE_INDICE: Record<string, { label: string; signal: string; likelihood: number }> = {
  c1: { label: 'C1 — Maturité SGS', signal: 'maturité SGS faible', likelihood: 0.7 },
  c2: { label: 'C2 — Efficacité PAC', signal: 'PAC inefficaces', likelihood: 0.6 },
  c3: { label: 'C3 — Conformité technique', signal: 'non-conformités techniques', likelihood: 0.5 },
  c4: { label: 'C4 — Charge critique', signal: 'écarts critiques en souffrance', likelihood: 0.8 },
  c5: { label: 'C5 — Résilience & historique', signal: 'incidents répétés', likelihood: 0.9 },
}

/** Normalise a priori / a posteriori : fractions (initialProfile) ou 0-100 (recalcul) → pourcentage. */
export function pctBayes(v: number | undefined): number | null {
  if (v == null) return null
  return v < 1 ? Math.round(v * 100) : Math.round(v)
}

function contexteReel(input: BayesExplicationInput): string {
  const p = input.profil
  const prior = pctBayes(p.bayesian_prior)
  const post = pctBayes(p.bayesian_posterior)
  const indices = (['c1', 'c2', 'c3', 'c4', 'c5'] as const)
    .filter((c) => (p[c] ?? 0) < 40)
    .map((c) => ({ critere: c, score: p[c], signal: CRITERE_INDICE[c].signal, vraisemblance: CRITERE_INDICE[c].likelihood }))
  const nbEvenements = input.evenements?.length ?? 0
  const dernierEvent = input.evenements && input.evenements.length > 0
    ? input.evenements.reduce((max, e) => (new Date(e.date) > max ? new Date(e.date) : max), new Date(0))
    : null
  const moisSansIncident = dernierEvent
    ? Math.max(0, Math.round((Date.now() - dernierEvent.getTime()) / (30 * 86400000)))
    : null
  return JSON.stringify(
    {
      score_global: p.score_global ?? null,
      a_priori_pct: prior,
      a_posteriori_pct: post,
      delta_pts: prior != null && post != null ? post - prior : null,
      cygne_noir: p.bayesian_black_swan ?? false,
      indices_observes: indices,
      nb_evenements: nbEvenements,
      mois_sans_incident: moisSansIncident,
      nb_ecarts_actifs: input.ecarts.length,
    },
    null,
    2
  )
}

function fallbackDeterministe(input: BayesExplicationInput): BayesExplication {
  const p = input.profil
  const prior = pctBayes(p.bayesian_prior)
  const post = pctBayes(p.bayesian_posterior)
  const delta = prior != null && post != null ? post - prior : null
  const hausse = delta != null && delta > 0
  const indices = (['c1', 'c2', 'c3', 'c4', 'c5'] as const)
    .filter((c) => (p[c] ?? 0) < 40)
    .map((c) => ({ ...CRITERE_INDICE[c], score: p[c] }))
  const nbEcarts = input.ecarts.length

  const explication =
    "La probabilité de défaillance est révisée dès qu'un indice arrive : chaque observation (incident, critère dégradé, écart en souffrance) ajuste le risque. Mécanique bayésienne : probabilité A PRIORI (départ, historique) → indice observé → probabilité A POSTERIORI (révisée)."

  const parties: string[] = []
  if (prior != null && post != null) {
    parties.push(
      hausse
        ? `la probabilité a été révisée à la hausse, de ${prior}% à ${post}% (+${delta} pts) : les indices observés plaident pour une dégradation des barrières`
        : `la probabilité n'a pas augmenté (${prior}% → ${post}%) : les observations récentes ne plaident pas pour une dégradation supplémentaire`
    )
  }
  if (nbEcarts > 0) {
    parties.push(`${nbEcarts} écart(s) actif(s) en attente de traitement — chaque PAC soumis réduit la probabilité révisée`)
  }
  if (p.bayesian_black_swan) {
    parties.push('signal cygne noir : la révision dépasse le seuil — risque de défaillance soudaine et disproportionnée')
  }
  const interpretation = parties.length > 0 ? parties.join('. ') + '.' : 'Aucune dégradation bayésienne détectée.'

  const actions: string[] = []
  if (nbEcarts > 0) {
    actions.push('Traiter les écarts actifs : chaque PAC soumis réduit la probabilité révisée')
  }
  if (indices.length > 0) {
    actions.push(`Renforcer la surveillance sur ${indices[0].label.split(' — ')[0]} (critère le plus dégradé à ${indices[0].score}/100)`)
  }
  actions.push('Poursuivre le suivi des indices : chaque nouvel événement ou écart révisera la probabilité')

  return { explication, interpretation, actions, fallbackIA: true }
}

export async function expliquerBayesEnClair(input: BayesExplicationInput): Promise<BayesExplication> {
  const fallback = fallbackDeterministe(input)

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), l'analyse bayésienne du risque d'un aérodrome : la probabilité de défaillance est révisée dès qu'un indice arrive.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(input)}

Contraintes :
- Rends l'explication spécifique à cet aérodrome : utilise les chiffres réels (a priori, a posteriori, delta, critères dégradés, événements, écarts).
- « explication » : décris la mécanique bayésienne appliquée à la situation réelle (départ → indices observés → révision), sans jargon inutile.
- « interpretation » : explique ce que la révision (hausse ou stabilité) signifie concrètement et ce que l'inspecteur doit en retenir.
- Liste 2-3 actions concrètes, hiérarchisées, adaptées aux données (écarts, critères dégradés, cygne noir).

Retourne uniquement un JSON :
{
  "explication": "la mécanique bayésienne appliquée aux données réelles, en langage clair",
  "interpretation": "ce que la révision de probabilité signifie pour cet aérodrome",
  "actions": ["action 1", "action 2", "action 3"]
}`

  const iaFallback = {
    explication: fallback.explication,
    interpretation: fallback.interpretation,
    actions: fallback.actions,
  }

  const result = await aiClient.callJSON<{
    explication?: string
    interpretation?: string
    actions?: string[]
  }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: 'json_object',
    },
    iaFallback
  )

  const explication = typeof result.explication === 'string' && result.explication.trim()
    ? result.explication.trim()
    : fallback.explication
  const interpretation = typeof result.interpretation === 'string' && result.interpretation.trim()
    ? result.interpretation.trim()
    : fallback.interpretation
  const actions =
    Array.isArray(result.actions) && result.actions.length > 0
      ? result.actions.filter((a) => typeof a === 'string' && a.trim().length > 0)
      : fallback.actions

  return {
    explication,
    interpretation,
    actions,
    fallbackIA: explication === fallback.explication && interpretation === fallback.interpretation,
  }
}
