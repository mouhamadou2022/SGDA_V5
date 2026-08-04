// lib/ia/ongletExplicationIA.ts
// Explication IA en langage clair de l'utilité de chaque onglet du profil de
// risque (Synthèse, Diagnostic, Anticipation, Actions) pour l'inspecteur.
// Le texte est TOUJOURS construit à partir des données réelles du profil et de
// l'historique des scores ; le fallback déterministe reflète les mêmes chiffres —
// aucun texte statique, aucune valeur inventée.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'

export type OngletProfilId = 'synthese' | 'diagnostic' | 'anticipation' | 'actions'

export interface OngletExplication {
  explication: string
  fallbackIA: boolean
}

export interface OngletExplicationInput {
  ongletId: OngletProfilId
  profil: ProfilRisque
  historiqueScores: ScoreHistoryPoint[]
}

export const ONGLETS_LABELS: Record<OngletProfilId, string> = {
  synthese: 'Synthèse',
  diagnostic: 'Diagnostic',
  anticipation: 'Anticipation',
  actions: 'Actions',
}

// Normalise une valeur vers un pourcentage 0-100 (accepte 0-1 ou 0-100)
function pct(v?: number | null): number | null {
  if (v === undefined || v === null || Number.isNaN(v)) return null
  const p = v <= 1 ? v * 100 : v
  return Math.min(100, Math.max(0, Math.round(p)))
}

function getMaturiteLabel(c1: number): string {
  if (c1 >= 85) return 'N5 — optimisée'
  if (c1 >= 70) return 'N4 — mesurée'
  if (c1 >= 50) return 'N3 — maîtrisée'
  if (c1 >= 30) return 'N2 — en développement'
  return 'N1 — inexistante'
}

function getTendanceLabel(t: ProfilRisque['tendance']): string {
  switch (t) {
    case 'baisse': return 'en dégradation'
    case 'hausse': return 'en amélioration'
    default: return 'stable'
  }
}

function contexteReel(input: OngletExplicationInput): string {
  const p = input.profil
  const scores = p.c1 !== undefined
    ? [
        { critere: 'c1', score: p.c1 },
        { critere: 'c2', score: p.c2 },
        { critere: 'c3', score: p.c3 },
        { critere: 'c4', score: p.c4 },
        { critere: 'c5', score: p.c5 },
      ]
    : []
  const minCritere = scores.length > 0
    ? [...scores].sort((a, b) => a.score - b.score)[0]
    : null
  const derniersScores = input.historiqueScores.slice(-6).map((h) => ({
    date: h.date,
    score: h.score,
  }))
  return JSON.stringify(
    {
      onglet: ONGLETS_LABELS[input.ongletId],
      score_global: p.score_global ?? null,
      niveau_global: p.niveau ?? null,
      tendance: p.tendance ? getTendanceLabel(p.tendance) : null,
      maturite_sgs_c1: getMaturiteLabel(p.c1 ?? 0),
      critere_plus_faible: minCritere
        ? { critere: minCritere.critere, score: minCritere.score }
        : null,
      prediction_3m: p.prediction_3m ?? null,
      prediction_6m: p.prediction_6m ?? null,
      prediction_12m: p.prediction_12m ?? null,
      incident_prediction_3m: p.incident_prediction_3m ?? null,
      incident_prediction_6m: p.incident_prediction_6m ?? null,
      incident_prediction_12m: p.incident_prediction_12m ?? null,
      risque_extreme_12m: p.extreme_risk ? {
        probabilite: pct(p.extreme_risk.tailRisk),
        queue_lourde: p.extreme_risk.isHeavyTailed ?? false,
      } : null,
      ensemble_confidence: pct(p.ensemble_confidence),
      jours_depuis_dernier_evenement: p.days_since_last_event ?? null,
      derniers_scores_historique: derniersScores,
    },
    null,
    2
  )
}

export function fallbackOnglet(input: OngletExplicationInput): OngletExplication {
  const p = input.profil
  const scores: Array<[string, string, number]> = [
    ['c1', 'maturité du SGS', p.c1],
    ['c2', 'efficacité des PAC', p.c2],
    ['c3', 'conformité technique', p.c3],
    ['c4', 'charge critique', p.c4],
    ['c5', 'résilience', p.c5],
  ]
  const plusFaible = scores.reduce((min, s) => (s[2] <= min[2] ? s : min), scores[0])
  const historique = input.historiqueScores

  switch (input.ongletId) {
    case 'synthese': {
      const parties: string[] = [
        `le score global de risque est de ${p.score_global}/100 (niveau ${p.niveau ?? 'non défini'})`,
      ]
      if (p.tendance) parties.push(`avec une tendance ${getTendanceLabel(p.tendance)}`)
      if (p.c1 !== undefined) parties.push(`une maturité SGS de niveau ${getMaturiteLabel(p.c1)}`)
      return {
        explication: `Cet onglet résume la situation globale de l'aérodrome : ${parties.join(', ')}. Les indicateurs affichés (score, niveaux, tendance, cartes de détail) proviennent tous des données réelles de surveillance — rien n'est estimé à la main.`,
        fallbackIA: true,
      }
    }
    case 'diagnostic': {
      const parties: string[] = []
      if (plusFaible) {
        parties.push(`le point le plus fragile est ${plusFaible[1]} (${plusFaible[2]}/100)`)
      }
      if (historique.length > 0) {
        parties.push(`${historique.length} points d'historique de scores sont analysés pour repérer les bascules`)
      }
      if (p.bayesian_black_swan) {
        parties.push('le modèle bayésien signale une configuration de type « cygne noir » à surveiller')
      }
      return {
        explication: `Cet onglet explique pourquoi le score est à ${p.score_global}/100 : ${parties.join(' ; ') || 'le détail par critère C1-C5 et les alertes statistiques sont présentés ici'}. C'est la vue « causes » du profil de risque.`,
        fallbackIA: true,
      }
    }
    case 'anticipation': {
      const parties: string[] = []
      if (p.prediction_3m != null && p.prediction_6m != null) {
        parties.push(`le score est projeté à ${Math.round(p.prediction_3m)} à 3 mois et ${Math.round(p.prediction_6m)} à 6 mois`)
      } else if (p.prediction_3m != null) {
        parties.push(`le score est projeté à ${Math.round(p.prediction_3m)} à 3 mois`)
      }
      if (p.incident_prediction_6m != null) {
        parties.push(`un risque d'incident estimé à ${p.incident_prediction_6m} % sur 6 mois`)
      }
      if (p.extreme_risk) {
        const tailPct = pct(p.extreme_risk.tailRisk)
        if (tailPct != null) {
          parties.push(`un risque extrême à ${tailPct} % sur 12 mois`)
        }
      }
      return {
        explication: `Cet onglet projette l'évolution future de l'aérodrome à partir des données réelles : ${parties.join(' ; ') || 'prédictions temporelles, risques d\u2019incidents et scénarios what-if'}. Il alimente aussi les points de vigilance partagés avec l'onglet « Actions ».`,
        fallbackIA: true,
      }
    }
    case 'actions': {
      return {
        explication: `Cet onglet convertit le profil de risque (score ${p.score_global}/100) en plan d'action opérationnel : actions correctives priorisées générées par l'IA, suivi, filtres et export. C'est la seule source du plan d'action — les points de vigilance visibles dans l'onglet « Anticipation » s'y réfèrent.`,
        fallbackIA: true,
      }
    }
  }
}

type ExplicationIA = {
  explication: string
}

export async function expliquerOngletProfil(
  input: OngletExplicationInput
): Promise<OngletExplication> {
  const fallback = fallbackOnglet(input)

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), à quoi sert l'onglet « ${ONGLETS_LABELS[input.ongletId]} » du profil de risque, en t'appuyant sur les données réelles de cet aérodrome.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(input)}

Contraintes :
- Décris précisément ce que l'inspecteur va trouver et tirer de cet onglet (indicateurs, prédictions, actions).
- Relie le texte aux chiffres réels fournis (score, tendance, prédictions, risque extrême) quand c'est utile.
- 2-3 phrases maximum, en langage simple, sans jargon non expliqué.
- Ne pas inventer de données absentes du contexte.

Retourne uniquement un JSON :
{
  "explication": "à quoi sert cet onglet, avec les chiffres réels du contexte, en langage clair"
}`

  const result = await aiClient.callJSON<ExplicationIA>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: 'json_object',
    },
    { explication: fallback.explication }
  )

  const explication =
    typeof result.explication === 'string' && result.explication.trim()
      ? result.explication.trim()
      : fallback.explication

  return {
    explication,
    fallbackIA: explication === fallback.explication,
  }
}
