// lib/ia/bulletinIA.ts
// Enrichissement IA du bulletin mensuel de sécurité : pour chaque aérodrome,
// une analyse narrative (synthèse, forces, faiblesses, signaux ML,
// recommandation, fiabilité) rédigée à partir des données réellement
// persistées au profil — aucun chiffre inventé.
// Suit le pattern du projet (explicabiliteIA.ts) : un seul appel IA global
// (mis en cache 7 jours via aiClient) + fallback déterministe chiffré si
// l'IA est indisponible.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'

export interface BulletinSignauxML {
  hmmTransition?: boolean
  hmmJoursAvantCritique?: number
  tailRisk?: number
  queueLourde?: boolean
  hazard90j?: number
  blackSwan?: boolean
  bowtieDomainesDegrades?: string[]
  scenarioPireNom?: string
  scenarioPireScore?: number
  scenarioPireProba?: number
  incidentPrediction3m?: number
}

/** Toutes les données réelles disponibles par aérodrome (source : store). */
export interface BulletinAerodromeInput {
  nom: string
  code: string
  scoreGlobal: number
  tendance: string
  niveauRisque: string
  ecartsCritiques: number
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  prediction3m?: number
  ecartsOuverts: number
  pacEnRetard: number
  evenements90j: number
  evenementsGraves90j: number
  qualityScore?: number
  qualite?: string
  signaux?: BulletinSignauxML
}

export interface BulletinAerodromeAnalyse {
  code: string
  synthese: string
  forces: string
  faiblesses: string
  signaux: string
  recommandation: string
  fiabilite: string
  fallbackIA: boolean
}

const SEUIL_VIGILANCE = 60

function tendanceLabel(tendance: string): string {
  if (tendance === 'baisse') return 'en dégradation'
  if (tendance === 'hausse') return 'en amélioration'
  return 'stable'
}

// ─────────────────────────────────────────────────────────────
// Fallback déterministe (construit depuis les données réelles)
// ─────────────────────────────────────────────────────────────

function fallbackAerodrome(input: BulletinAerodromeInput): BulletinAerodromeAnalyse {
  const dims = [
    { key: 'c1', label: 'C1 (maturité SGS)', v: input.c1 },
    { key: 'c2', label: 'C2 (efficacité PAC)', v: input.c2 },
    { key: 'c3', label: 'C3 (conformité)', v: input.c3 },
    { key: 'c4', label: 'C4 (charge critique)', v: input.c4 },
    { key: 'c5', label: 'C5 (résilience)', v: input.c5 },
  ].sort((a, b) => a.v - b.v)
  const plusFaible = dims[0]
  const plusForte = dims[dims.length - 1]

  const synthese =
    `Le score global de ${input.nom} (${input.code}) est de ${input.scoreGlobal}/100 ` +
    `(niveau ${input.niveauRisque.toLowerCase()}), tendance ${tendanceLabel(input.tendance)}.`

  const forces = plusForte.v >= SEUIL_VIGILANCE
    ? `Dimension la plus solide : ${plusForte.label} à ${plusForte.v}/100${input.evenementsGraves90j === 0 && input.evenements90j > 0 ? `, aucun événement grave sur ${input.evenements90j} événement(s) recensé(s) sur 90 jours` : ''}.`
    : `Aucune dimension n'atteint ${SEUIL_VIGILANCE}/100 : la moins dégradée est ${plusForte.label} (${plusForte.v}/100).`

  const faiblessesParts: string[] = []
  if (plusFaible.v < SEUIL_VIGILANCE) faiblessesParts.push(`${plusFaible.label} (${plusFaible.v}/100)`)
  if (input.ecartsCritiques > 0) faiblessesParts.push(`${input.ecartsCritiques} écart(s) critique(s) en cours`)
  if (input.pacEnRetard > 0) faiblessesParts.push(`${input.pacEnRetard} PAC en retard`)
  const faiblesses = faiblessesParts.length > 0
    ? `Points de vigilance : ${faiblessesParts.join(' ; ')}.`
    : 'Aucune dégradation majeure identifiée : les indicateurs sont maîtrisés.'

  const signauxParts: string[] = []
  const sg = input.signaux
  if (sg?.hmmTransition) {
    signauxParts.push(`transition de régime détectée${sg.hmmJoursAvantCritique !== undefined ? ` (bascule vers le critique estimée à ${sg.hmmJoursAvantCritique} jour(s))` : ''}`)
  }
  if (sg?.blackSwan) signauxParts.push('signature de « cygne noir » bayésien')
  if (sg?.queueLourde) {
    signauxParts.push(`distribution à queue lourde${sg.tailRisk !== undefined ? ` (perte extrême attendue : ${(sg.tailRisk * 100).toFixed(1)}%)` : ''}`)
  }
  if (sg?.hazard90j !== undefined) {
    signauxParts.push(`risque de défaillance à 90 jours de ${(sg.hazard90j * 100).toFixed(1)}%`)
  }
  if (sg?.bowtieDomainesDegrades && sg.bowtieDomainesDegrades.length > 0) {
    signauxParts.push(`domaine(s) Bow-Tie dégradé(s) : ${sg.bowtieDomainesDegrades.join(', ')}`)
  }
  if (input.prediction3m !== undefined) {
    const delta = input.prediction3m - input.scoreGlobal
    signauxParts.push(`prédiction du score à 3 mois : ${input.prediction3m}/100 (${delta >= 0 ? '+' : ''}${delta} pt)`)
  }
  const signaux = signauxParts.length > 0
    ? `${signauxParts.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('. ')}.`
    : 'Aucun signal de modélisation avancée n\'est calculé pour cette plateforme sur la période.'

  let recommandation: string
  if (input.ecartsCritiques > 0) {
    recommandation = `Engager une inspection ciblée sous 30 jours pour traiter les ${input.ecartsCritiques} écart(s) critique(s)${input.pacEnRetard > 0 ? ` et relancer les ${input.pacEnRetard} PAC en retard` : ''}.`
  } else if (input.pacEnRetard > 0) {
    recommandation = `Relancer les ${input.pacEnRetard} PAC en retard dans le mois et renforcer ${plusFaible.label} (${plusFaible.v}/100).`
  } else if (plusFaible.v < SEUIL_VIGILANCE) {
    recommandation = `Définir un plan d'action dédié à ${plusFaible.label} (${plusFaible.v}/100) pour ramener la dimension au-dessus de ${SEUIL_VIGILANCE}/100.`
  } else {
    recommandation = 'Maintenir la trajectoire actuelle et consolider les points forts identifiés.'
  }

  const fiabilite = input.qualityScore !== undefined
    ? `Fiabilité des données : ${input.qualityScore}/100${input.qualite ? ` (qualité ${input.qualite})` : ''} — ${input.qualityScore >= 70 ? 'suffisante pour l\'analyse' : 'à consolider pour fiabiliser l\'analyse'}.`
    : 'Fiabilité des données : non renseignée pour ce profil.'

  return {
    code: input.code,
    synthese,
    forces,
    faiblesses,
    signaux,
    recommandation,
    fiabilite,
    fallbackIA: true,
  }
}

// ─────────────────────────────────────────────────────────────
// Contexte réel envoyé à l'IA (données persistées uniquement)
// ─────────────────────────────────────────────────────────────

function contexteReel(inputs: BulletinAerodromeInput[]): string {
  const aerodromes = inputs.map(i => {
    const p = i.prediction3m
    const s = i.signaux
    return {
      nom: i.nom,
      code: i.code,
      score_global: i.scoreGlobal,
      niveau: i.niveauRisque,
      tendance: i.tendance,
      c1: i.c1, c2: i.c2, c3: i.c3, c4: i.c4, c5: i.c5,
      prediction_3m: p,
      delta_3m: p !== undefined ? Math.round(p - i.scoreGlobal) : undefined,
      ecarts_critiques: i.ecartsCritiques,
      ecarts_ouverts: i.ecartsOuverts,
      pac_en_retard: i.pacEnRetard,
      evenements_90j: i.evenements90j,
      evenements_graves_90j: i.evenementsGraves90j,
      quality_score: i.qualityScore,
      qualite: i.qualite,
      signaux: s
        ? {
            hmm_transition: s.hmmTransition,
            hmm_jours_avant_critique: s.hmmJoursAvantCritique,
            tail_risk: s.tailRisk,
            queue_lourde: s.queueLourde,
            hazard_90j: s.hazard90j,
            cygne_noir_bayesien: s.blackSwan,
            domaines_bowtie_degrades: s.bowtieDomainesDegrades,
            scenario_pire_nom: s.scenarioPireNom,
            scenario_pire_score: s.scenarioPireScore,
            scenario_pire_probabilite: s.scenarioPireProba,
            prediction_incidents_3m: s.incidentPrediction3m,
          }
        : null,
    }
  })
  return JSON.stringify({ aerodromes }, null, 2)
}

const BULLETIN_USER_TEMPLATE = `Contexte ci-dessous : les données réelles, persistées dans le système AERORISQ, de chaque aérodrome sous surveillance pour le bulletin mensuel de sécurité. Utilise ces données comme UNIQUE source pour ta rédaction.

{CONTEXTE}

Pour CHAQUE aérodrome, rédige 6 rubriques en français :
- "synthese" : résumé chiffré (score /100, niveau, tendance, dimension(s) forte(s) et faible(s)).
- "forces" : ce qui est solide (dimensions >= 60/100, absence d'événements graves, PAC à jour) — cite les chiffres.
- "faiblesses" : ce qui est dégradé (dimensions < 60/100, écarts critiques, PAC en retard, événements récents).
- "signaux" : signaux des modèles avancés présents dans le contexte (transition HMM, risque de défaillance à 90 jours, queue lourde, cygne noir bayésien, domaines Bow-Tie dégradés, scénario le plus probable) en citant leurs valeurs.
- "recommandation" : action concrète et priorisée, avec délai de mise en œuvre, et référence réglementaire pertinente (RAS 14, Annexe 14 OACI, Doc 9859 SGS) lorsque justifiable.
- "fiabilite" : appréciation de la qualité et de la quantité des données de ce profil, et limite d'interprétation éventuelle.

Règles impératives :
- Base-toi UNIQUEMENT sur les chiffres fournis. N'invente AUCUN nombre, écart, PAC ou événement.
- Si une donnée manque, le mentionner explicitement plutôt que de la combler.
- Ton technique, rigoureux et factuel (registre administratif ANACIM).
- Une à trois phrases par rubrique, maximum.

Retourne UNIQUEMENT du JSON de la forme :
{"aerodromes": {"<CODE>": {"synthese": "...", "forces": "...", "faiblesses": "...", "signaux": "...", "recommandation": "...", "fiabilite": "..."}}}`

function pick(v: string | undefined, fb: string): string {
  const t = (v || '').trim()
  return t.length >= 20 ? t : fb
}

// ─────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────

/** Analyse IA de chaque aérodrome. Cache 7 jours côté client ; fallback déterministe en cas d'échec. */
export async function analyserAerodromesPourBulletin(
  inputs: BulletinAerodromeInput[],
): Promise<Record<string, BulletinAerodromeAnalyse>> {
  const fallbacks: Record<string, BulletinAerodromeAnalyse> = {}
  for (const i of inputs) fallbacks[i.code] = fallbackAerodrome(i)
  if (inputs.length === 0) return fallbacks

  const userMessage = BULLETIN_USER_TEMPLATE.replace('{CONTEXTE}', contexteReel(inputs))

  const result = await aiClient.callJSON<{
    aerodromes?: Record<string, Partial<BulletinAerodromeAnalyse>>
  }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 12000,
      responseFormat: 'json_object',
    },
    { aerodromes: {} },
  )

  const out: Record<string, BulletinAerodromeAnalyse> = {}
  for (const i of inputs) {
    const fb = fallbacks[i.code]
    const r = result?.aerodromes?.[i.code]
    if (!r) {
      out[i.code] = fb
      continue
    }
    const analyse: BulletinAerodromeAnalyse = {
      code: i.code,
      synthese: pick(r.synthese, fb.synthese),
      forces: pick(r.forces, fb.forces),
      faiblesses: pick(r.faiblesses, fb.faiblesses),
      signaux: pick(r.signaux, fb.signaux),
      recommandation: pick(r.recommandation, fb.recommandation),
      fiabilite: pick(r.fiabilite, fb.fiabilite),
      fallbackIA:
        !r.synthese && !r.forces && !r.faiblesses && !r.signaux && !r.recommandation && !r.fiabilite,
    }
    out[i.code] = analyse
  }
  return out
}
