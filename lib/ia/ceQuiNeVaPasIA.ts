// lib/ia/ceQuiNeVaPasIA.ts
// Agent AERORISQ « Ce qui ne va pas » : transforme les points de vigilance
// détectés dans les données réelles (critères, écarts, barrières, cygne noir…)
// en explications exploitables pour un inspecteur : cause, conséquence et action.
// Le fallback déterministe est construit depuis les mêmes données — aucun texte statique.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import type { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'
import type { Barriere, BowTieModele } from '@/lib/risque/types'

export type GraviteVigilance = 'critique' | 'eleve' | 'moyen'

export interface PointVigilance {
  /** Identifiant stable de la source du signal (critere_c1, ecarts_critiques, barrieres, cygne_noir, dependance, variabilite, scenario). */
  cle: string
  gravite: GraviteVigilance
  /** Résumé court de ce qui dysfonctionne, avec les chiffres réels. */
  constat: string
}

export interface PointVigilanceExplique extends PointVigilance {
  /** Pourquoi c'est grave — cause racine lisible par un inspecteur. */
  cause: string
  /** Ce qui peut arriver si on n'agit pas, chiffré si possible. */
  consequence: string
  /** Action prioritaire concrète à engager. */
  action: string
}

export interface CeQuiNeVaPasExplication {
  /** Une phrase qui hiérarchise les signaux (pire d'abord). */
  synthese: string
  points: PointVigilanceExplique[]
  fallbackIA: boolean
}

export interface CeQuiNeVaPasInput {
  profil: ProfilRisque
  ecarts: Ecart[]
  evenements?: EvenementSecurite[]
  surveillancesCount?: number
}

type GraviteX = 'critique' | 'eleve' | 'moyen'

const SEUIL_BARRIERE_FAIBLE = 50
const SEUIL_CRITERE_DEGRADE = 40
const SEUIL_DEPENDANCE_FORTE = 0.6

const LABEL_CRITERE: Record<string, string> = {
  c1: 'Maturité SGS', c2: 'Efficacité PAC', c3: 'Conformité technique',
  c4: 'Charge critique', c5: 'Résilience & Historique',
}

function getNiveau(score: number): GraviteX {
  if (score < 30) return 'critique'
  if (score < 60) return 'eleve'
  if (score < 80) return 'moyen'
  return 'moyen'
}

function detecterPoints(input: CeQuiNeVaPasInput): PointVigilance[] {
  const { profil, ecarts } = input
  const points: PointVigilance[] = []

  // Pire critère C1-C5 (score le plus bas = dégradation la plus critique)
  const pireCritere = (['c1', 'c2', 'c3', 'c4', 'c5'] as const)
    .map((key) => ({ key, score: profil[key] ?? 50 }))
    .sort((a, b) => a.score - b.score)[0]
  if (pireCritere && pireCritere.score < SEUIL_CRITERE_DEGRADE) {
    points.push({
      cle: `critere_${pireCritere.key}`,
      gravite: getNiveau(pireCritere.score),
      constat: `${LABEL_CRITERE[pireCritere.key]} à ${pireCritere.score}/100 — critère le plus dégradé du profil`,
    })
  }

  // Écarts non clôturés, par gravité
  const ouverts = ecarts.filter(e => e.statut !== 'cloture')
  const critiques = ouverts.filter(e => e.niveau_risque === 'critique')
  if (critiques.length > 0) {
    points.push({
      cle: 'ecarts_critiques',
      gravite: 'critique',
      constat: `${critiques.length} écart${critiques.length > 1 ? 's' : ''} critique${critiques.length > 1 ? 's' : ''} non clôturé${critiques.length > 1 ? 's' : ''}${critiques[0]?.domaine ? ` (ex. ${critiques[0].domaine})` : ''}`,
    })
  }
  const eleves = ouverts.filter(e => e.niveau_risque === 'eleve')
  if (eleves.length > 0) {
    points.push({
      cle: 'ecarts_eleves',
      gravite: 'eleve',
      constat: `${eleves.length} écart${eleves.length > 1 ? 's' : ''} élevé${eleves.length > 1 ? 's' : ''} en attente de traitement`,
    })
  }

  // Barrières Bow-Tie sous le seuil d'efficacité
  const barrieres = (profil.bowtie_metrics ?? []).flatMap((bt: BowTieModele) =>
    [...bt.barrieresPreventives, ...bt.barrieresCorrectives].map((b: Barriere) => ({ ...b, domaine: bt.domaine }))
  )
  const barrieresFaibles = barrieres.filter(b => b.efficacite < SEUIL_BARRIERE_FAIBLE)
  if (barrieresFaibles.length > 0) {
    const pireBarriere = barrieresFaibles.sort((a, b) => a.efficacite - b.efficacite)[0]
    points.push({
      cle: 'barrieres_faibles',
      gravite: 'eleve',
      constat: `${barrieresFaibles.length} barrière${barrieresFaibles.length > 1 ? 's' : ''} de sécurité sous ${SEUIL_BARRIERE_FAIBLE}% d'efficacité (pire : ${pireBarriere.nom} à ${pireBarriere.efficacite}%, domaine ${pireBarriere.domaine})`,
    })
  }

  // Cygne noir bayésien
  if (profil.bayesian_black_swan) {
    const prior = profil.bayesian_prior != null ? `${Math.round(profil.bayesian_prior * 100)}% → ${profil.bayesian_posterior != null ? Math.round(profil.bayesian_posterior * 100) : '?'}%` : 'signal détecté'
    points.push({
      cle: 'cygne_noir',
      gravite: 'critique',
      constat: `Signal cygne noir bayésien (probabilité d'événement extrême ${prior})`,
    })
  }

  // Dépendance forte entre domaines
  if (profil.copula_metrics && profil.copula_metrics.maxTailDependence > SEUIL_DEPENDANCE_FORTE) {
    points.push({
      cle: 'dependance',
      gravite: 'eleve',
      constat: `Forte dépendance entre domaines (tail dependence ${Math.round(profil.copula_metrics.maxTailDependence * 100)}%) — une défaillance peut en entraîner d'autres`,
    })
  }

  // Variabilité des incidents par grappes
  if (profil.negbin_metrics && profil.negbin_metrics.isOverdispersed) {
    points.push({
      cle: 'variabilite',
      gravite: 'moyen',
      constat: `Incidents fluctuant par grappes (dispersion ${profil.negbin_metrics.dispersion.toFixed(1)} — variance ${profil.negbin_metrics.variance.toFixed(1)} vs moyenne ${profil.negbin_metrics.mean.toFixed(1)})`,
    })
  }

  return points
}

function contexteReel(input: CeQuiNeVaPasInput): string {
  const { profil, ecarts, evenements, surveillancesCount } = input
  const points = detecterPoints(input)
  return JSON.stringify(
    {
      score_global: profil.score_global ?? null,
      niveau_global: getNiveau(profil.score_global ?? 50),
      criteres: (['c1', 'c2', 'c3', 'c4', 'c5'] as const).map((key) => ({
        critere: key, nom: LABEL_CRITERE[key], score: profil[key] ?? null,
      })),
      points_vigilance: points,
      ecarts_ouverts: ecarts.filter(e => e.statut !== 'cloture').map(e => ({
        reference: e.reference, libelle: e.libelle, domaine: e.domaine,
        niveau_risque: e.niveau_risque, statut: e.statut,
      })).slice(0, 12),
      barrieres_faibles: (profil.bowtie_metrics ?? [])
        .flatMap((bt: BowTieModele) =>
          [...bt.barrieresPreventives, ...bt.barrieresCorrectives].map((b: Barriere) => ({
            nom: b.nom, efficacite: b.efficacite, type: b.type, domaine: bt.domaine,
          }))
        )
        .filter(b => b.efficacite < SEUIL_BARRIERE_FAIBLE)
        .sort((a, b) => a.efficacite - b.efficacite)
        .slice(0, 8),
      cygne_noir: profil.bayesian_black_swan
        ? { prior: profil.bayesian_prior, posterior: profil.bayesian_posterior }
        : null,
      dependance: profil.copula_metrics
        ? { maxTailDependence: profil.copula_metrics.maxTailDependence, worstCase: profil.copula_metrics.worstCaseDescription }
        : null,
      variabilite: profil.negbin_metrics ?? null,
      scenario_pire_cas: profil.scenarios?.length
        ? profil.scenarios.reduce((pire, s) => (s.scoreProjecte > (pire?.scoreProjecte ?? -1) ? s : pire), profil.scenarios[0])
        : null,
      nb_evenements: evenements?.length ?? 0,
      nb_surveillances: surveillancesCount ?? 0,
    },
    null,
    2
  )
}

function fallbackDeterministe(input: CeQuiNeVaPasInput): CeQuiNeVaPasExplication {
  const points = detecterPoints(input)
  const detail: Record<string, { cause: string; consequence: string; action: string }> = {}

  for (const p of points) {
    if (p.cle.startsWith('critere_')) {
      const key = p.cle.replace('critere_', '')
      const score = input.profil[key as 'c1'] ?? 50
      detail[p.cle] = {
        cause: `${LABEL_CRITERE[key]} est le critère le plus dégradé (${score}/100, seuil de vigilance ${SEUIL_CRITERE_DEGRADE}/100), tirant le score global vers le bas.`,
        consequence: score < 30
          ? 'Ce niveau critique expose l\'aérodrome à un risque élevé non maîtrisé, avec impact direct sur le score global.'
          : 'Cette faiblesse limite la performance globale du profil SGS et aggrave le risque opérationnel.',
        action: `Engager un plan d'action sur ${LABEL_CRITERE[key]} en priorité (objectif ≥ ${SEUIL_CRITERE_DEGRADE}/100) avant le prochain recalage du profil.`,
      }
    } else if (p.cle === 'ecarts_critiques') {
      detail[p.cle] = {
        cause: 'Des écarts critiques restent ouverts au-delà du délai : ils représentent une non-conformité grave non corrigée.',
        consequence: 'Tant qu\'ils restent ouverts, le risque associé à ces écarts reste pleinement présent et bloque le redressement du score C4.',
        action: 'Traiter chaque écart critique immédiatement : assigner un responsable, fixer un délai court et suivre la levée via la PAC.',
      }
    } else if (p.cle === 'ecarts_eleves') {
      detail[p.cle] = {
        cause: 'Des écarts de niveau élevé sont en attente de traitement et s\'accumulent avec le temps.',
        consequence: 'Sans traitement, ils peuvent basculer en écarts critiques et dégrader davantage le critère C4.',
        action: 'Programmer leur résolution dans les échéances PAC, en priorisant ceux dont la date limite est proche.',
      }
    } else if (p.cle === 'barrieres_faibles') {
      detail[p.cle] = {
        cause: `${p.constat.split('— ')[1] ?? 'Plusieurs barrières de sécurité sont sous le seuil d\'efficacité.'}`,
        consequence: 'Une barrière sous les 50% d\'efficacité laisse la menace pénétrer le dispositif de prévention — risque de perte de maîtrise.',
        action: 'Réévaluer et renforcer ces barrières (test, maintenance, remplacement) avant la prochaine évaluation Bow-Tie.',
      }
    } else if (p.cle === 'cygne_noir') {
      detail[p.cle] = {
        cause: 'Le modèle bayésien détecte une probabilité élevée d\'événement extrême peu visible dans l\'historique.',
        consequence: 'Un événement extrême peut survenir sans antécédent direct, mettant en défaut les barrières existantes.',
        action: 'Réaliser une revue ciblée des scénarios extrêmes et renforcer les dispositifs de récupération (barrières correctives).',
      }
    } else if (p.cle === 'dependance') {
      detail[p.cle] = {
        cause: `${input.profil.copula_metrics?.worstCaseDescription ?? 'La corrélation de queue entre domaines est élevée.'}`,
        consequence: 'Une défaillance critique dans un domaine peut en entraîner d\'autres — le risque systémique dépasse la somme des risques individuels.',
        action: 'Piloter les domaines comme un ensemble : surveiller les signaux croisés et mutualiser les plans de traitement.',
      }
    } else if (p.cle === 'variabilite') {
      detail[p.cle] = {
        cause: 'La distribution des incidents montre une variance nettement supérieure à la moyenne — des grappes d\'événements.',
        consequence: 'Les périodes de forte intensité sont difficiles à anticiper et peuvent saturer les ressources.',
        action: 'Renforcer la surveillance en continu et planifier des marges de capacité pour absorber les pics.',
      }
    }
  }

  const synthese = points.length > 0
    ? `Le profil présente ${points.length} signal${points.length > 1 ? 's' : ''} de vigilance : d'abord ${points[0].constat.toLowerCase()}, puis ${points.slice(1, 4).map(p => p.constat.toLowerCase()).join(', ') || 'rien d\'autre de critique'}.`
    : 'Aucun signal de vigilance prioritaire : critères, écarts, barrières et signaux avancés sont sous contrôle.'

  return {
    synthese,
    points: points.map(p => ({ ...p, ...(detail[p.cle] ?? { cause: p.constat, consequence: 'Risque non maîtrisé si non traité.', action: 'Traiter ce point en priorité' }) })),
    fallbackIA: true,
  }
}

function pick(v: unknown, fb: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb
}

export async function expliquerCeQuiNeVaPas(input: CeQuiNeVaPasInput): Promise<CeQuiNeVaPasExplication> {
  const fallback = fallbackDeterministe(input)

  if (fallback.points.length === 0) {
    return { synthese: fallback.synthese, points: [], fallbackIA: true }
  }

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), chacun des points de vigilance détectés sur cet aérodrome.

CONTEXTE RÉEL (données du store — ne jamais les réinventer) :
${contexteReel(input)}

Pour CHAQUE point de "points_vigilance", retourne une entrée avec :
- « cle » : identique au point.
- « constat » : le même constat chiffré.
- « cause » : pourquoi c'est grave (cause racine, ce que signifie concrètement ce défaut pour l'aérodrome).
- « consequence » : ce qui peut arriver si on n'agit pas, chiffré si possible.
- « action » : l'action prioritaire concrète à engager (responsable, échéance courte).

Contraintes :
- 1-2 phrases par champ, sans jargon, ancrées sur les chiffres réels du contexte.
- Ne pas inventer de données absentes (prior/posterior null → le mentionner tel quel).
- « synthese » (racine du JSON) : une phrase qui hiérarchise les signaux, du plus critique au moins critique.

Retourne uniquement un JSON :
{
  "synthese": "...",
  "points": [
    { "cle": "...", "constat": "...", "cause": "...", "consequence": "...", "action": "..." }
  ]
}`

  const result = await aiClient.callJSON<{
    synthese?: string
    points?: Array<{
      cle?: string
      constat?: string
      cause?: string
      consequence?: string
      action?: string
    }>
  }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 1600,
      responseFormat: 'json_object',
    },
    {
      synthese: fallback.synthese,
      points: fallback.points.map(p => ({ cle: p.cle, constat: p.constat, cause: p.cause, consequence: p.consequence, action: p.action })),
    }
  )

  const pointsIA = (result.points ?? []).filter(p => p.cle && p.cle.trim())
  const fusion: PointVigilanceExplique[] = fallback.points.map(fb => {
    const ia = pointsIA.find(p => p.cle === fb.cle)
    return {
      ...fb,
      cause: pick(ia?.cause, fb.cause),
      consequence: pick(ia?.consequence, fb.consequence),
      action: pick(ia?.action, fb.action),
    }
  })

  return {
    synthese: pick(result.synthese, fallback.synthese),
    points: fusion,
    fallbackIA:
      result.synthese === fallback.synthese &&
      fusion.every((p, i) => p.cause === fallback.points[i].cause && p.consequence === fallback.points[i].consequence && p.action === fallback.points[i].action),
  }
}