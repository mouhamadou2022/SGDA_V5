// lib/ia/facteursExplicationIA.ts
// Explication IA en langage clair des facteurs déclencheurs (TriggersSection)
// et des risques saisonniers (ExogenousFactorsCard).
// Les textes d'explication sont construits à partir des données réelles du store
// (triggers actifs, profil, mois courant) ; le fallback déterministe conserve les
// libellés contextuels actuels — aucun texte n'est inventé hors contexte réel.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque } from '@/lib/store'
import type { FacteurDeclencheur } from '@/lib/risque/types'

// Fallback déterministe — insights contextuels actuels (par type de trigger)
export const LEAD_LAG_INSIGHTS: Record<string, string> = {
  ecart_critique: 'Les écarts critiques non résolus dégradent le score C4 et, en cascade, le score global dans les 30 à 60 jours.',
  delai_expire: 'Les délais expirés sur les PAC indiquent une perte de réactivité — C2 est généralement le premier impacté.',
  incident: 'Les incidents récents sont un indicateur avancé fiable : une hausse des incidents précède une baisse du score global de 15-30 jours.',
  changement_exploitant: 'Un changement d\'exploitant introduit une période de vulnérabilité de 6 mois — C1 (maturité SGS) en pâtit le premier.',
  saison_pluies: 'Facteur exogène majeur au Sénégal : juillet-septembre voit une hausse des FOD, birdstrikes et infiltrations.',
  post_inspection: 'Période post-inspection : les écarts identifiés sont en cours de traitement, le score peut temporairement baisser avant de s\'améliorer.',
}

// Fallback déterministe — risques saisonniers par mois (0-indexé)
export const RISQUES_SAISONNIERS: Record<number, string[]> = {
  0: ['Harmattan — visibilité réduite', 'Poussière et FOD sur piste'],
  1: ['Pic harmattan — poussière', 'Vents secs — FOD'],
  2: ['Transition saisonnière', 'Début vents de sable'],
  3: ['Orages isolés', 'Birdstrike modéré'],
  4: ['Conditions stables', 'FOD modéré'],
  5: ['Début saison des pluies', 'Piste glissante'],
  6: ['Pic pluies — contamination piste', 'Risque foudre', 'FOD très élevé'],
  7: ['Pluies — inondations localisées', 'Birdstrike accru (migration)'],
  8: ['Fin pluies — herbes hautes', 'Pic birdstrike', 'Risque animalier'],
  9: ['Vérification drainage', 'Birdstrike en baisse'],
  10: ['Saison sèche — FOD sable', 'Brume sèche'],
  11: ['Conditions stables', 'Risque modéré'],
}

export const MOIS_LABELS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export interface TriggerExplication {
  insights: Record<string, string>
  fallbackIA: boolean
}

export interface SaisonExplication {
  risques: string[]
  fallbackIA: boolean
}

function contexteProfil(p: ProfilRisque): string {
  return JSON.stringify(
    {
      score_global: p.score_global ?? null,
      niveau: p.niveau ?? null,
      tendance: p.tendance ?? null,
      c1: p.c1 ?? null,
      c2: p.c2 ?? null,
      c3: p.c3 ?? null,
      c4: p.c4 ?? null,
      c5: p.c5 ?? null,
      bayesian_posterior: p.bayesian_posterior ?? null,
      bayesian_black_swan: p.bayesian_black_swan ?? false,
    },
    null,
    2
  )
}

export async function expliquerTriggersEnClair(
  triggers: FacteurDeclencheur[],
  profil: ProfilRisque
): Promise<TriggerExplication> {
  const actifs = triggers.filter((t) => t.actif)

  const fallback: TriggerExplication = {
    insights: Object.fromEntries(triggers.map((t) => [t.type, LEAD_LAG_INSIGHTS[t.type] ?? t.description])),
    fallbackIA: true,
  }

  if (actifs.length === 0) return fallback

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), l'impact réel de chaque facteur déclencheur actif détecté.

CONTEXTE RÉEL DE L'AÉRODROME (données du store) :
${contexteProfil(profil)}

FACTEURS ACTIFS DÉTECTÉS :
${JSON.stringify(
  actifs.map((t) => ({ type: t.type, description: t.description, poids: t.poids })),
  null,
  2
)}

Pour CHACUN des facteurs actifs, rédige UNE phrase en langage clair qui :
- traduit pourquoi ce facteur est à surveiller concrètement pour cet aérodrome,
- relie le facteur aux données réelles du profil (scores C1-C5, tendance, bayésien),
- reste lisible par un non-spécialiste.

Retourne uniquement un JSON :
{
  "insights": {
    "${actifs[0].type}": "explication claire 1",
    ...
  }
}`

  const result = await aiClient.callJSON<{ insights: Record<string, string> }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: 'json_object',
    },
    { insights: fallback.insights }
  )

  const insights: Record<string, string> = { ...fallback.insights }
  let anyFromIA = false
  for (const t of triggers) {
    const fromIA = result.insights?.[t.type]
    const clean = typeof fromIA === 'string' ? fromIA.trim() : ''
    if (clean && clean !== LEAD_LAG_INSIGHTS[t.type]) {
      insights[t.type] = clean
      anyFromIA = true
    }
  }

  return { insights, fallbackIA: !anyFromIA }
}

export async function expliquerRisquesSaisoniersEnClair(
  mois: number,
  profil: ProfilRisque
): Promise<SaisonExplication> {
  const fallbackRisques = RISQUES_SAISONNIERS[mois] ?? []
  const fallback: SaisonExplication = { risques: fallbackRisques, fallbackIA: true }

  const userMessage = `Décris, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), les risques saisonniers du mois de ${MOIS_LABELS[mois]} pour un aérodrome du Sénégal.

CONTEXTE RÉEL DE L'AÉRODROME (données du store) :
${contexteProfil(profil)}

Contraintes :
- Retourne 2 à 3 risques saisonniers concrets et réalistes pour ce mois au Sénégal (saison des pluies = juillet-septembre, harmattan = décembre-février).
- Chaque risque est une phrase courte (max 10 mots), en langage clair.
- Ne pas inventer de chiffres non fournis.

Retourne uniquement un JSON :
{
  "risques": ["risque 1", "risque 2", "risque 3"]
}`

  const result = await aiClient.callJSON<{ risques: string[] }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: 'json_object',
    },
    { risques: fallbackRisques }
  )

  const risques =
    Array.isArray(result.risques) && result.risques.length > 0
      ? result.risques.filter((r) => typeof r === 'string' && r.trim().length > 0).slice(0, 3)
      : fallbackRisques

  const estFallback =
    risques.length === fallbackRisques.length &&
    risques.every((r, i) => r === fallbackRisques[i])

  return { risques, fallbackIA: estFallback }
}
