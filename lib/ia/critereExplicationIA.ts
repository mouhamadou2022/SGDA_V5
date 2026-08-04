// lib/ia/critereExplicationIA.ts
// Explication IA en langage clair de la carte « Détail par critère » C1-C5.
// Le fallback déterministe (contexte/desc) reste affiché en cas d'échec ou si
// le modèle reste muet : le module ne requiert jamais l'API pour fonctionner.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, Ecart } from '@/lib/store'

export interface ExplicationCritere {
  [critere: string]: string
}

export interface ExplicationCriteresResult {
  explications: ExplicationCritere
  fallbackIA: boolean
}

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

function getMaturiteLabel(c1: number): string {
  if (c1 >= 85) return 'N5 — optimisée'
  if (c1 >= 70) return 'N4 — mesurée'
  if (c1 >= 50) return 'N3 — maîtrisée'
  if (c1 >= 30) return 'N2 — en développement'
  return 'N1 — inexistante'
}

export interface ExplicationCritereInput {
  profil: ProfilRisque
  ecarts: Ecart[]
  evenementsCount: number
}

function contexteReel(input: ExplicationCritereInput): string {
  const p = input.profil
  const ecartsCritiques = input.ecarts.filter((e) => e.niveau_risque === 'critique').length
  const ecartsMajeurs = input.ecarts.filter((e) => e.niveau_risque === 'eleve').length
  return JSON.stringify(
    {
      score_global: p.score_global ?? null,
      niveau_global: getNiveauLabel(getNiveau(p.score_global ?? 0)),
      c1_maturite_sgs: p.c1 ?? null,
      c1_maturite_niveau: getMaturiteLabel(p.c1 ?? 0),
      c2_efficacite_pac: p.c2 ?? null,
      c3_conformite_technique: p.c3 ?? null,
      c4_charge_critique: p.c4 ?? null,
      c5_resilience: p.c5 ?? null,
      nb_ecarts: input.ecarts.length,
      nb_ecarts_critiques: ecartsCritiques,
      nb_ecarts_majeurs: ecartsMajeurs,
      nb_evenements: input.evenementsCount,
      bayesian_prior: p.bayesian_prior ?? null,
      bayesian_posterior: p.bayesian_posterior ?? null,
    },
    null,
    2
  )
}

type ExplicationIA = {
  explications: ExplicationCritere
}

const EXPLICATION_FALLBACKS: Record<string, string> = {
  c1: 'Solidité du Système de Gestion de la Sécurité : politiques, documentation, formation et culture sécurité.',
  c2: "Taux de mise en œuvre et efficacité des Plans d'Actions Correctives suite aux audits.",
  c3: 'Respect des exigences réglementaires : infrastructures, équipements et aides visuelles.',
  c4: "Volume d'écarts critiques et majeurs en souffrance — alourdit le risque opérationnel.",
  c5: "Historique d'incidents, capacité de résilience et récurrence des événements.",
}

export async function expliquerCriteresEnClair(
  input: ExplicationCritereInput
): Promise<ExplicationCriteresResult> {
  const p = input.profil
  const fallback: ExplicationCriteresResult = {
    explications: {
      c1: EXPLICATION_FALLBACKS.c1,
      c2: EXPLICATION_FALLBACKS.c2,
      c3: EXPLICATION_FALLBACKS.c3,
      c4: EXPLICATION_FALLBACKS.c4,
      c5: EXPLICATION_FALLBACKS.c5,
    },
    fallbackIA: true,
  }

  const valeurs = [
    { critere: 'c1', label: 'Maturité SGS', score: p.c1 ?? 0, niveau: getNiveauLabel(getNiveau(p.c1 ?? 0)) },
    { critere: 'c2', label: 'Efficacité PAC', score: p.c2 ?? 0, niveau: getNiveauLabel(getNiveau(p.c2 ?? 0)) },
    { critere: 'c3', label: 'Conformité technique', score: p.c3 ?? 0, niveau: getNiveauLabel(getNiveau(p.c3 ?? 0)) },
    { critere: 'c4', label: 'Charge critique non résolue', score: p.c4 ?? 0, niveau: getNiveauLabel(getNiveau(p.c4 ?? 0)) },
    { critere: 'c5', label: 'Résilience & Historique', score: p.c5 ?? 0, niveau: getNiveauLabel(getNiveau(p.c5 ?? 0)) },
  ]

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), le détail par critère C1-C5 du profil de risque.

CONTEXTE RÉEL DE L'AÉRODROME (données du store) :
${contexteReel(input)}

SCORES PAR CRITÈRE (0 = risque faible, 100 = risque maîtrisé) :
${JSON.stringify(valeurs, null, 2)}

Pour CHACUN des 5 critères, rédige UNE phrase (2 max) en langage clair qui :
- traduit ce que le score signifie concrètement pour cet aérodrome,
- relie le score aux données réelles (écarts, événements, maturité, bayésien) quand c'est utile,
- reste lisible par un non-spécialiste, sans acronymes non expliqués.

Retourne uniquement un JSON :
{
  "explications": {
    "c1": "...",
    "c2": "...",
    "c3": "...",
    "c4": "...",
    "c5": "..."
  }
}`

  const iaFallback: ExplicationIA = {
    explications: EXPLICATION_FALLBACKS,
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

  const explications: ExplicationCritere = {}
  let anyFromIA = false
  for (const key of Object.keys(EXPLICATION_FALLBACKS)) {
    const fromIA = result.explications?.[key]
    const clean = typeof fromIA === 'string' ? fromIA.trim() : ''
    explications[key] = clean && clean !== EXPLICATION_FALLBACKS[key] ? clean : EXPLICATION_FALLBACKS[key]
    if (clean && clean !== EXPLICATION_FALLBACKS[key]) anyFromIA = true
  }

  return {
    explications,
    fallbackIA: !anyFromIA,
  }
}
