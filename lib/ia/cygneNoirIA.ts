// lib/ia/cygneNoirIA.ts
// Explication IA en langage clair de l'« Alerte Cygne Noir » pour l'inspecteur.
// Le message est TOUJOURS construit à partir des données réelles du store :
// prior / posterior bayésiens, facteur de Bayes, tendance, écarts critiques,
// événements récents. Le fallback déterministe reflète les mêmes chiffres —
// aucun texte statique, aucune valeur inventée.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, Ecart } from '@/lib/store'

export interface CygneNoirExplication {
  explication: string
  actions: string[]
  fallbackIA: boolean
}

export interface CygneNoirInput {
  profil: ProfilRisque
  ecarts: Ecart[]
  evenementsCount: number
}

function round(v: number, d = 1): number {
  return Math.round(v * Math.pow(10, d)) / Math.pow(10, d)
}

// Facteur de Bayes (Jeffreys) — même logique que detectBlackSwan (lib/risque/bayesian.ts)
function bayesFactor(prior?: number, posterior?: number): number | null {
  if (prior == null || posterior == null) return null
  if (prior <= 0 || prior >= 1) return null
  if (posterior <= prior) return null
  const priorOdds = prior / (1 - prior)
  const posteriorOdds = posterior / (1 - posterior)
  return posteriorOdds / priorOdds
}

function getMaturiteLabel(c1: number): string {
  if (c1 >= 85) return 'N5 — optimisée'
  if (c1 >= 70) return 'N4 — mesurée'
  if (c1 >= 50) return 'N3 — maîtrisée'
  if (c1 >= 30) return 'N2 — en développement'
  return 'N1 — inexistante'
}

function contexteReel(input: CygneNoirInput): string {
  const p = input.profil
  const ecartsCritiques = input.ecarts.filter(
    (e) => e.niveau_risque === 'critique' && e.statut !== 'cloture'
  )
  const ecartsEleves = input.ecarts.filter(
    (e) => e.niveau_risque === 'eleve' && e.statut !== 'cloture'
  )
  return JSON.stringify(
    {
      score_global: p.score_global ?? null,
      niveau_global: p.niveau ?? null,
      tendance: p.tendance ?? null,
      maturite_sgs_c1: getMaturiteLabel(p.c1 ?? 0),
      bayesian_prior: p.bayesian_prior ?? null,
      bayesian_posterior: p.bayesian_posterior ?? null,
      bayesian_factor: bayesFactor(p.bayesian_prior, p.bayesian_posterior),
      nb_ecarts_critiques_ouverts: ecartsCritiques.length,
      nb_ecarts_eleves_ouverts: ecartsEleves.length,
      nb_evenements_recents: input.evenementsCount,
      jours_depuis_dernier_evenement: p.days_since_last_event ?? null,
      prediction_3m: p.prediction_3m ?? null,
      prediction_6m: p.prediction_6m ?? null,
      scénario_pire_cas: p.scenarios?.[3]
        ? { nom: p.scenarios[3].nom, probabilite: round((p.scenarios[3].probabilite ?? 0) * 100), score_projete: p.scenarios[3].scoreProjecte }
        : null,
    },
    null,
    2
  )
}

type ExplicationIA = {
  explication: string
  actions: string[]
}

// Fallback déterministe : construit un message explicite à partir des chiffres réels.
function fallbackDeterministe(input: CygneNoirInput): CygneNoirExplication {
  const p = input.profil
  const prior = p.bayesian_prior
  const posterior = p.bayesian_posterior
  const bf = bayesFactor(prior, posterior)
  const ecartsCritiques = input.ecarts.filter(
    (e) => e.niveau_risque === 'critique' && e.statut !== 'cloture'
  )
  const ecartsEleves = input.ecarts.filter(
    (e) => e.niveau_risque === 'eleve' && e.statut !== 'cloture'
  )

  const parties: string[] = []

  if (prior != null && posterior != null) {
    parties.push(
      `la probabilité de survenue d'un événement grave est passée de ${round(prior * 100)} % (estimation historique) à ${round(posterior * 100)} % (situation actuelle)`
    )
    if (bf != null) {
      parties.push(
        `soit un facteur de Bayes de ${round(bf)} — la hausse est statistiquement significative`
      )
    }
  } else if (posterior != null) {
    parties.push(
      `la probabilité de survenue d'un événement grave est estimée à ${round(posterior * 100)} %`
    )
  }

  if (p.tendance) {
    parties.push(
      p.tendance === 'baisse'
        ? 'la tendance globale du score est en dégradation'
        : p.tendance === 'hausse'
          ? 'la tendance globale du score est en amélioration malgré le signal'
          : 'la tendance globale du score est stable'
    )
  }

  if (ecartsCritiques.length > 0) {
    parties.push(
      `${ecartsCritiques.length} écart(s) critique(s) non clôturé(s) ${ecartsEleves.length > 0 ? `et ${ecartsEleves.length} écart(s) élevé(s) ` : ''}restent en souffrance`
    )
  } else if (ecartsEleves.length > 0) {
    parties.push(`${ecartsEleves.length} écart(s) élevé(s) restent en souffrance`)
  }

  if (input.evenementsCount > 0) {
    parties.push(
      `${input.evenementsCount} événement(s) récent(s) observé(s)${p.days_since_last_event != null ? ` (dernier il y a ${p.days_since_last_event} jour(s))` : ''}`
    )
  }

  const scene = p.scenarios?.[3]
  const explication =
    parties.length > 0
      ? `Le modèle bayésien détecte un risque de type « cygne noir » : ${parties.join(' ; ')}. Ce signal correspond à un événement rare mais à impact potentiellement catastrophique, inhabituel pour cet aérodrome.${scene ? ` Le scénario « ${scene.nom} » projette un score de ${scene.scoreProjecte}/100 en cas de réalisation.` : ''}`
      : `Le modèle bayésien détecte un risque de type « cygne noir » : un événement rare mais à impact potentiellement catastrophique, inhabituel pour cet aérodrome.`

  const actions: string[] = []
  if (ecartsCritiques.length > 0) {
    actions.push(
      `Traiter sans délai les ${ecartsCritiques.length} écart(s) critique(s) non clôturé(s) (délai PAC 3 jours, procédure SGDA-PAC-001)`
    )
  }
  actions.push('Déclencher une surveillance renforcée ciblée sur les domaines les plus dégradés')
  actions.push(`Vérifier que le SGS (maturité ${getMaturiteLabel(p.c1 ?? 0)}) dispose de barrières proportionnées au risque détecté`)

  return { explication, actions, fallbackIA: true }
}

export async function expliquerCygneNoirEnClair(
  input: CygneNoirInput
): Promise<CygneNoirExplication> {
  const fallback = fallbackDeterministe(input)
  const p = input.profil

  const userMessage = `L'alerte « cygne noir » a été déclenchée par le modèle bayésien pour un aérodrome. Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), ce qui se passe réellement et ce qu'il faut faire.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(input)}

Contraintes :
- Explique ce que le signal signifie concrètement avec les chiffres réels fournis (prior, posterior, facteur de Bayes, écarts, événements).
- Ne recopie pas de phrase générique : rends l'explication spécifique à cette situation.
- 1-2 phrases de synthèse maximum, sans jargon inutile.
- Liste 2-3 actions concrètes, hiérarchisées, adaptées aux données (écarts critiques, maturité SGS, événements).

Retourne uniquement un JSON :
{
  "explication": "ce qui se passe réellement, avec les chiffres du contexte, en langage clair",
  "actions": ["action 1", "action 2", "action 3"]
}`

  const iaFallback: ExplicationIA = {
    explication: fallback.explication,
    actions: fallback.actions,
  }

  const result = await aiClient.callJSON<ExplicationIA>(
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

  const actions =
    Array.isArray(result.actions) && result.actions.length > 0
      ? result.actions.filter((a) => typeof a === 'string' && a.trim().length > 0)
      : fallback.actions

  return {
    explication,
    actions,
    fallbackIA: explication === fallback.explication,
  }
}
