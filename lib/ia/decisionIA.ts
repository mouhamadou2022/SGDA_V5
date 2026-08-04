// lib/ia/decisionIA.ts
// Explication IA en langage clair de la vue DG (DecisionTab) du profil de
// risque : traduit la synthèse et chaque carte en langage très simple pour un
// décideur non-expert en modèles statistiques.
// Les textes sont TOUJOURS construits à partir des données réelles persistées
// du profil ; le fallback déterministe reflète les mêmes chiffres — aucun texte
// statique, aucune valeur inventée.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, EvenementSecurite } from '@/lib/store'

export interface DecisionDGExplication {
  synthese: string
  score: string
  projections: string
  actions: string
  ecarts: string
  fallbackIA: boolean
}

export interface DecisionDGInput {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  nbEcartsCritiques: number
  ecartsActifs: any[]
  prochainesSurveillances?: any[]
  evenements?: EvenementSecurite[]
}

// Normalise une valeur vers un pourcentage 0-100 (accepte 0-1 ou 0-100)
function pct(v?: number | null): number | null {
  if (v === undefined || v === null || Number.isNaN(v)) return null
  const p = v <= 1 ? v * 100 : v
  return Math.min(100, Math.max(0, Math.round(p)))
}

function niveauLabel(n: ProfilRisque['niveau'] | undefined, score: number): string {
  switch (n) {
    case 'critique': return 'critique'
    case 'eleve': return 'élevé'
    case 'moyen': return 'moyen'
    case 'faible': return 'faible'
    case 'tres_faible': return 'très faible'
    default: return score >= 80 ? 'faible' : score >= 60 ? 'moyen' : score >= 30 ? 'élevé' : 'critique'
  }
}

function tendanceLabel(t: ProfilRisque['tendance'] | undefined): string {
  switch (t) {
    case 'baisse': return 'en dégradation'
    case 'hausse': return 'en amélioration'
    default: return 'stable'
  }
}

export function contexteDecisionDG(input: DecisionDGInput): string {
  const p = input.profil
  const nbPacAttendu = input.ecartsActifs.filter((e: any) => e.statut === 'pac_attendu').length
  const nbPacAccepte = input.ecartsActifs.filter((e: any) => e.statut === 'pac_accepte').length
  const nbEcartActifs = input.ecartsActifs.filter((e: any) => e.statut !== 'cloture').length
  return JSON.stringify(
    {
      aerodrome: { code: input.aerodromeCode, nom: input.aerodromeName },
      score_global: p.score_global ?? null,
      niveau: p.niveau ?? null,
      tendance: p.tendance ?? null,
      maturite_sgs_c1: p.c1 ?? null,
      criteres: [
        { code: 'C1', nom: 'maturité SGS', score: p.c1 ?? null },
        { code: 'C2', nom: 'efficacité PAC', score: p.c2 ?? null },
        { code: 'C3', nom: 'conformité technique', score: p.c3 ?? null },
        { code: 'C4', nom: 'charge critique', score: p.c4 ?? null },
        { code: 'C5', nom: 'résilience', score: p.c5 ?? null },
      ],
      prediction_3m: p.prediction_3m ?? null,
      prediction_6m: p.prediction_6m ?? null,
      prediction_12m: p.prediction_12m ?? null,
      intervalle_3m: p.prediction_interval_3m ?? null,
      intervalle_6m: p.prediction_interval_6m ?? null,
      incident_3m: pct(p.incident_prediction_3m),
      incident_6m: pct(p.incident_prediction_6m),
      incident_12m: pct(p.incident_prediction_12m),
      scenario_pire_cas: p.scenarios?.[3]?.scoreProjecte ?? null,
      cygne_noir: p.bayesian_black_swan ?? false,
      transition_hmm: p.hmm_state?.isTransitioning
        ? { jours_avant_critique: p.hmm_state.daysToCritical }
        : null,
      risque_extreme: p.extreme_risk
        ? { probabilite_pct: pct(p.extreme_risk.tailRisk), queue_lourde: p.extreme_risk.isHeavyTailed ?? false }
        : null,
      risque_incident_90j: p.survival_metrics ? pct(p.survival_metrics.hazard90d) : null,
      confiance_modeles: pct(p.ensemble_confidence),
      fiabilite_donnees: p.qualityScore ?? null,
      qualite_donnees: p.qualite ?? null,
      nb_ecarts_critiques: input.nbEcartsCritiques ?? 0,
      nb_pac_attendu: nbPacAttendu,
      nb_pac_accepte: nbPacAccepte,
      nb_ecarts_actifs: nbEcartActifs,
      nb_evenements: input.evenements?.length ?? 0,
      nb_surveillances_prochaines: input.prochainesSurveillances?.length ?? 0,
    },
    null,
    2
  )
}

export function fallbackDecisionDG(input: DecisionDGInput): DecisionDGExplication {
  const p = input.profil
  const score = p.score_global ?? 0
  const tendance = tendanceLabel(p.tendance)

  const criteres = [
    { code: 'C1', nom: 'la maturité du SGS', score: p.c1 },
    { code: 'C2', nom: "l'efficacité des PAC", score: p.c2 },
    { code: 'C3', nom: 'la conformité technique', score: p.c3 },
    { code: 'C4', nom: 'la charge critique', score: p.c4 },
    { code: 'C5', nom: 'la résilience', score: p.c5 },
  ].filter((c) => c.score !== undefined)
  const plusFaible = [...criteres].sort((a, b) => a.score! - b.score!)[0]
  const plusFort = [...criteres].sort((a, b) => b.score! - a.score!)[0]

  // Synthèse globale
  const syntheseParties: string[] = [
    `le score de risque de l'aérodrome ${input.aerodromeCode} est de ${score}/100, soit un niveau ${niveauLabel(p.niveau, score)}`,
    `la tendance est ${tendance}`,
  ]
  if (p.bayesian_black_swan) {
    syntheseParties.push('le modèle signale un risque rare mais grave (« cygne noir »)')
  }
  const pireCas = p.scenarios?.[3]?.scoreProjecte
  if (pireCas != null) {
    syntheseParties.push(`dans le pire scénario, le score pourrait descendre à ${Math.round(pireCas)}/100`)
  }
  const synthese = `En résumé : ${syntheseParties.join(', ')}.`

  // Carte score principal
  const scoreParties: string[] = []
  if (plusFaible) {
    scoreParties.push(`le point le plus fragile est ${plusFaible.nom} (${plusFaible.score}/100)`)
  }
  if (plusFort && plusFort.code !== plusFaible?.code) {
    scoreParties.push(`le point le plus solide est ${plusFort.nom} (${plusFort.score}/100)`)
  }
  const scoreTexte = scoreParties.length > 0
    ? `Ce score reflète les 5 critères de surveillance : ${scoreParties.join(' ; ')}.`
    : 'Les détails par critère C1-C5 sont présentés dans les jauges ci-dessous.'

  // Carte projections
  const projParties: string[] = []
  if (p.prediction_3m != null && p.prediction_6m != null) {
    projParties.push(`le score est projeté à ${Math.round(p.prediction_3m)}/100 à 3 mois et ${Math.round(p.prediction_6m)}/100 à 6 mois`)
  } else if (p.prediction_3m != null) {
    projParties.push(`le score est projeté à ${Math.round(p.prediction_3m)}/100 à 3 mois`)
  }
  const inc3 = pct(p.incident_prediction_3m)
  const inc6 = pct(p.incident_prediction_6m)
  const inc12 = pct(p.incident_prediction_12m)
  const incParties: string[] = []
  if (inc3 !== null) incParties.push(`${inc3} % sur 3 mois`)
  if (inc6 !== null) incParties.push(`${inc6} % sur 6 mois`)
  if (inc12 !== null) incParties.push(`${inc12} % sur 12 mois`)
  if (incParties.length > 0) {
    projParties.push(`la probabilité d'incident est estimée à ${incParties.join(', ')}`)
  }
  const conf = pct(p.ensemble_confidence)
  if (conf !== null) {
    projParties.push(`la fiabilité des prévisions est de ${conf} %`)
  }
  const projections = projParties.length > 0
    ? `Pour l'avenir : ${projParties.join(' ; ')}.`
    : 'Les projections à 3, 6 et 12 mois seront affichées quand les données seront disponibles.'

  // Carte actions
  const actionsParties: string[] = []
  if (input.nbEcartsCritiques > 0) {
    actionsParties.push(`${input.nbEcartsCritiques} écart(s) critique(s) exigent un plan d'action`)
  }
  const nbPacAttendu = input.ecartsActifs.filter((e: any) => e.statut === 'pac_attendu').length
  const nbPacAccepte = input.ecartsActifs.filter((e: any) => e.statut === 'pac_accepte').length
  if (nbPacAttendu > 0) {
    actionsParties.push(`${nbPacAttendu} PAC sont en attente de soumission`)
  }
  if (nbPacAccepte > 0) {
    actionsParties.push(`${nbPacAccepte} PAC acceptés attendent leurs preuves`)
  }
  if (p.hmm_state?.isTransitioning) {
    actionsParties.push(`l'aérodrome glisse vers un état critique (J-${p.hmm_state.daysToCritical})`)
  }
  if (p.extreme_risk?.isHeavyTailed) {
    actionsParties.push('un risque extrême est détecté')
  }
  const actions = actionsParties.length > 0
    ? `Actions prioritaires : ${actionsParties.join(' ; ')}.`
    : 'Aucune action critique immédiate — maintenir le niveau actuel et préparer les prochaines surveillances.'

  // Carte écarts & surveillances
  const nbActifs = input.ecartsActifs.filter((e: any) => e.statut !== 'cloture').length
  const ecarts = input.ecartsActifs.length > 0
    ? `${input.ecartsActifs.length} écart(s) actif(s) sont suivis (dont ${nbActifs} non clos) ; ${input.prochainesSurveillances?.length ?? 0} surveillance(s) planifiée(s).`
    : 'Aucun écart actif pour le moment ; les prochaines surveillances seront listées ci-dessous.'

  return { synthese, score: scoreTexte, projections, actions, ecarts, fallbackIA: true }
}

export async function expliquerDecisionDG(input: DecisionDGInput): Promise<DecisionDGExplication> {
  const fallback = fallbackDecisionDG(input)
  const fb = {
    synthese: fallback.synthese,
    score: fallback.score,
    projections: fallback.projections,
    actions: fallback.actions,
    ecarts: fallback.ecarts,
  }

  const userMessage = `Explique en langage clair et très simple, pour le Directeur Général de l'ANACIM (non-expert en modèles statistiques), ce que signifie la situation de risque de l'aérodrome affichée.

CONTEXTE RÉEL (données persistées du système, ne jamais les réinventer ni en ajouter) :
${contexteDecisionDG(input)}

Contraintes :
- « synthese » : 2 phrases maximum qui résument la situation globale : score, tendance, signal à surveiller (cygne noir, pire scénario) et ce qu'il faut retenir.
- « score » : 1-2 phrases : quels critères tirent le score vers le bas et lesquels le soutiennent, en toutes lettres (ex. « la maturité du SGS »), avec les chiffres réels.
- « projections » : 1-2 phrases : ce que prévoient les modèles (score à 3/6/12 mois, probabilité d'incident, fiabilité des prévisions). Une forte probabilité d'incident doit justifier une décision.
- « actions » : 1-2 phrases : les actions prioritaires à décider (écarts critiques, PAC en attente, transition silencieuse, risque extrême), sans jargon.
- « ecarts » : 1 phrase : état des écarts actifs et des surveillances planifiées.
- Langage très simple, phrases courtes, aucun acronyme technique sans explication immédiate.
- Ne pas inventer de données absentes du contexte.

Retourne uniquement un JSON :
{
  "synthese": "...",
  "score": "...",
  "projections": "...",
  "actions": "...",
  "ecarts": "..."
}`

  const result = await aiClient.callJSON<Record<string, string>>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: 'json_object',
    },
    fb
  )

  const clean = (key: keyof DecisionDGExplication): string => {
    const v = result[key]
    return typeof v === 'string' && v.trim() ? v.trim() : String(fallback[key])
  }

  const texte: DecisionDGExplication = {
    synthese: clean('synthese'),
    score: clean('score'),
    projections: clean('projections'),
    actions: clean('actions'),
    ecarts: clean('ecarts'),
    fallbackIA: false,
  }

  const toutFallback =
    texte.synthese === fallback.synthese &&
    texte.score === fallback.score &&
    texte.projections === fallback.projections &&
    texte.actions === fallback.actions &&
    texte.ecarts === fallback.ecarts

  return { ...texte, fallbackIA: toutFallback }
}
