// lib/ia/explicabiliteIA.ts
// Explication IA en langage clair de la carte « Explicabilité du score » :
// pourquoi le score global est à son niveau, quels critères pèsent le plus,
// ce qui a évolué depuis le mois dernier et les priorités d'action.
// Le fallback déterministe est construit depuis les données réelles
// (contributions, importance, deltas) — aucun texte statique.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'
import type { MLRiskCorrelationData } from '@/lib/store/advancedModelsSlice'
import { computeFeatureContributions, computeBayesianExplainability } from '@/lib/risque/explanability'

export interface ExplicabiliteExplication {
  /** Pourquoi le score global est à son niveau actuel. */
  synthese: string
  /** Critères qui pèsent le plus (importance) et leur état. */
  facteurs: string
  /** Ce qui a changé depuis le mois dernier (deltas) ou la stabilité. */
  evolutions: string
  /** Critères sous le seuil de vigilance à traiter en priorité. */
  priorites: string
  fallbackIA: boolean
}

export interface ExplicabiliteInput {
  profil: ProfilRisque
  ecarts: Ecart[]
  evenements?: EvenementSecurite[]
  correlation: MLRiskCorrelationData | null
}

const SEUIL_VIGILANCE = 60

function getNiveau(score: number): string {
  if (score >= 80) return 'faible'
  if (score >= 60) return 'moyen'
  if (score >= 30) return 'eleve'
  return 'critique'
}

function getNiveauLabel(n: string): string {
  switch (n) {
    case 'critique': return 'Critique'
    case 'eleve': return 'Élevé'
    case 'moyen': return 'Moyen'
    default: return 'Faible'
  }
}

function contexteReel(input: ExplicabiliteInput): string {
  const { profil, correlation, ecarts, evenements } = input
  const contributions = computeFeatureContributions(profil, correlation)
  const bayes = computeBayesianExplainability(profil)
  return JSON.stringify(
    {
      score_global: profil.score_global ?? null,
      niveau_global: getNiveauLabel(getNiveau(profil.score_global ?? 0)),
      criteres: contributions.map((c) => ({
        critere: c.key,
        nom: c.name,
        score: c.currentValue,
        importance_pct: Math.round(c.importance * 100),
        delta_pts: c.delta,
      })),
      alignement_ml: correlation?.alignmentScore ?? null,
      convergence_ml: correlation?.convergenceScore ?? null,
      precision_rf: correlation?.rfAccuracy ? Math.round(correlation.rfAccuracy * 100) : null,
      c5_infere_bayesien: bayes ? bayes.predictedC5 : null,
      confiance_c5: bayes ? Math.round(bayes.confidence * 100) : null,
      configuration_anormale: bayes?.isAnomalous ?? false,
      nb_ecarts_actifs: ecarts.length,
      nb_evenements: evenements?.length ?? 0,
    },
    null,
    2
  )
}

function fallbackDeterministe(input: ExplicabiliteInput): ExplicabiliteExplication {
  const { profil, correlation } = input
  const score = profil.score_global ?? 0
  const niveau = getNiveauLabel(getNiveau(score))
  const contributions = computeFeatureContributions(profil, correlation)

  const pires = contributions.filter((c) => c.currentValue < SEUIL_VIGILANCE).sort((a, b) => a.currentValue - b.currentValue)
  const meilleurs = contributions.filter((c) => c.currentValue >= SEUIL_VIGILANCE).sort((a, b) => b.currentValue - a.currentValue)
  const parImportance = [...contributions].sort((a, b) => b.importance - a.importance).slice(0, 3)
  const evolutions = contributions
    .filter((c) => c.delta !== null && Math.abs(c.delta as number) >= 2)
    .sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number))

  const partiesSynthese: string[] = []
  partiesSynthese.push(`le score global de cet aérodrome est de ${score}/100 (niveau ${niveau.toLowerCase()})`)
  if (pires.length > 0) {
    partiesSynthese.push(
      `tiré vers le bas par ${pires[0].name} (${pires[0].currentValue}/100)${pires[1] ? ` puis ${pires[1].name} (${pires[1].currentValue}/100)` : ''}`
    )
  }
  if (meilleurs.length > 0) {
    partiesSynthese.push(`soutenu par ${meilleurs[0].name} (${meilleurs[0].currentValue}/100)`)
  }
  const alignML = correlation && correlation.alignmentScore != null ? `, avec un alignement ML de ${correlation.alignmentScore}%` : ''
  const synthese = `Pour rappel, ${partiesSynthese.join(' ; ')}${alignML}.`

  const facteurs = parImportance.length > 0
    ? `Les critères qui pèsent le plus sur ce score : ${parImportance
        .map((c) => `${c.name} (importance ${Math.round(c.importance * 100)}%, à ${c.currentValue}/100)`)
        .join(' ; ')}.`
    : 'Aucun critère pondéré n\'est disponible pour ce profil.'

  const evolutionsText = evolutions.length > 0
    ? `Depuis le mois dernier, ${evolutions
        .slice(0, 3)
        .map((c) => `${c.name} a ${(c.delta as number) < 0 ? 'perdu' : 'gagné'} ${Math.abs(c.delta as number)} pt${Math.abs(c.delta as number) > 1 ? 's' : ''} (${c.currentValue}/100)`)
        .join(' ; ')}.`
    : 'Aucune évolution significative des critères depuis le mois dernier : le profil est stable.'

  const priorites = pires.length > 0
    ? `À traiter en priorité : ${pires.map((c) => `${c.name} (${c.currentValue}/100)`).join(' ; ')} — ces critères sont sous le seuil de vigilance de ${SEUIL_VIGILANCE}/100.`
    : `Aucun critère sous le seuil de vigilance (${SEUIL_VIGILANCE}/100) : les barrières sont globalement solides.`

  return { synthese, facteurs, evolutions: evolutionsText, priorites, fallbackIA: true }
}

function pick(v: unknown, fb: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb
}

export async function expliquerScoreEnClair(input: ExplicabiliteInput): Promise<ExplicabiliteExplication> {
  const fallback = fallbackDeterministe(input)

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), pourquoi le score de risque de cet aérodrome est à son niveau actuel.

CONTEXTE RÉEL DE L'AÉRODROME (données du store, ne jamais les réinventer) :
${contexteReel(input)}

Contraintes :
- « synthese » : une phrase qui résume le niveau du score et ce qui le tire vers le bas / le soutient, avec les chiffres réels.
- « facteurs » : les 2-3 critères qui pèsent le plus (importance et score actuels), et ce qu'ils signifient concrètement pour l'aérodrome.
- « evolutions » : ce qui a changé depuis le mois dernier (critères en hausse ou en baisse, en points) ou la stabilité du profil.
- « priorites » : les critères sous le seuil de vigilance (60/100) à traiter en premier, ou la confirmation qu'aucun critère n'est critique.
- 1-2 phrases par champ, sans jargon, sans inventer de chiffres.

Retourne uniquement un JSON :
{
  "synthese": "...",
  "facteurs": "...",
  "evolutions": "...",
  "priorites": "..."
}`

  const iaFallback = {
    synthese: fallback.synthese,
    facteurs: fallback.facteurs,
    evolutions: fallback.evolutions,
    priorites: fallback.priorites,
  }

  const result = await aiClient.callJSON<{
    synthese?: string
    facteurs?: string
    evolutions?: string
    priorites?: string
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

  return {
    synthese: pick(result.synthese, fallback.synthese),
    facteurs: pick(result.facteurs, fallback.facteurs),
    evolutions: pick(result.evolutions, fallback.evolutions),
    priorites: pick(result.priorites, fallback.priorites),
    fallbackIA:
      result.synthese === fallback.synthese &&
      result.facteurs === fallback.facteurs &&
      result.evolutions === fallback.evolutions &&
      result.priorites === fallback.priorites,
  }
}
