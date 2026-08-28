// lib/ia/qualitativeChainIA.ts
// Interprétation AERORISQ en langage clair de la « chaîne qualitative » :
// le diagnostic combiné des quatre outils (AMDEC, BowTie, FTA, Bayésien).
// Chaque texte (fallback ou IA) est enregistré auprès d'AERORISQ pour
// l'apprentissage quotidien (voir aerorisqLearning).
// Le fallback déterministe est construit depuis les données réelles du
// DiagnosticQualitatif — aucun texte statique.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import { enregistrerLangageClair } from './aerorisqLearning'
import type { DiagnosticQualitatif, ScenarioQualitatif } from '@/lib/risque/qualitativeChain'

export interface ChaineQualitativeExplication {
  /** Ce que la combinaison des 4 outils dit globalement, en langage clair. */
  synthese: string
  /** Rôle de chaque outil et ce qu'il a apporté de spécifique ici. */
  outils: string
  /** Les barrières critiques identifiées et pourquoi. */
  barrieres: string
  /** Ce qu'il faut faire en priorité. */
  recommandation: string
  fallbackIA: boolean
}

export interface ChaineQualitativeInput {
  diagnostic: DiagnosticQualitatif | null | undefined
  aerodromeId?: string
}

const SEUIL_BARRIERE_CRITIQUE = 60
const SEUIL_PROBA_MENACE = 40

// ============================================================
// HELPERS — construits depuis les données, jamais de texte figé
// ============================================================

function labelDomaine(domaine: string): string {
  const c = domaine.toLowerCase()
  if (c === 'sgs') return 'SGS (maturité sécurité)'
  if (c === 'phy') return 'PHY (pistes et aires)'
  if (c === 'ols') return 'OLS (limitation d\'obstacles)'
  if (c === 'elec') return 'ELEC (balisage et alimentation)'
  if (c === 'mfp') return 'MFP (marquage et feux)'
  if (c === 'sli') return 'SLI (sauvetage et lutte incendie)'
  if (c === 'ra') return 'RA (risque animalier)'
  if (c === 'cop') return 'COP (compétences du personnel)'
  if (c === 'ops') return 'OPS (exploitation)'
  return domaine
}

function sourcesActives(s: ScenarioQualitatif): string[] {
  const map: Record<ScenarioQualitatif['sources'][number], string> = {
    amdec: 'AMDEC',
    fta: 'arbre de défaillance',
    bayes: 'réseau bayésien',
    bowtie: 'bow tie',
  }
  return s.sources.map((src) => map[src])
}

function barriereCritique(diag: DiagnosticQualitatif): ScenarioQualitatif[] {
  return diag.scenarios.filter((s) => s.barrieresCritiques.length > 0)
}

// ============================================================
// CONTEXTE RÉEL — injecté dans le prompt AERORISQ
// ============================================================

function contexteReel(input: ChaineQualitativeInput): string {
  const diag = input.diagnostic
  if (!diag) return '{}'
  return JSON.stringify(
    {
      indice_global: diag.indiceGlobal,
      confiance: diag.confiance,
      nb_domaines: diag.scenarios.length,
      barrieres_critiques_globales: diag.barrieresCritiquesGlobales,
      scenarios: diag.scenarios.map((s) => ({
        domaine: labelDomaine(s.domaine),
        danger: s.danger,
        evenement_redoute: s.defaillance,
        consequence: s.consequence,
        probabilite_menace: s.probabiliteMenace,
        probabilite_residuelle: s.probabiliteResiduelle,
        sources: sourcesActives(s),
        barrieres_critiques: s.barrieresCritiques,
        modes_amdec_critiques: s.modesCritiquesAmdec,
        coupes_fta: s.coupesMinimales.length,
      })),
    },
    null,
    2
  )
}

// ============================================================
// FALLBACK DÉTERMINISTE — 100 % dérivé des données
// ============================================================

function fallbackDeterministe(input: ChaineQualitativeInput): ChaineQualitativeExplication {
  const diag = input.diagnostic
  if (!diag || diag.scenarios.length === 0) {
    return {
      synthese: 'Aucun diagnostic qualitatif n\'est calculé pour cet aérodrome : les données nécessaires (BowTie, AMDEC, FTA ou Bayésien) ne sont pas disponibles.',
      outils: 'Aucun outil qualitatif n\'a pu être alimenté par les données actuelles.',
      barrieres: 'Aucune barrière critique à signaler.',
      recommandation: 'Compléter les auto-évaluations et les analyses par outil pour activer la chaîne qualitative.',
      fallbackIA: true,
    }
  }

  const pires = [...diag.scenarios].sort(
    (a, b) => b.probabiliteResiduelle - a.probabiliteResiduelle
  )
  const dominantes = [...diag.scenarios]
    .filter((s) => s.sources.length > 1)
    .sort((a, b) => b.sources.length - a.sources.length)
  const domainesBarrieres = barriereCritique(diag)
  const domainesMenace = diag.scenarios.filter(
    (s) => s.probabiliteMenace >= SEUIL_PROBA_MENACE
  )

  // Synthèse
  const partiesSynthese: string[] = []
  partiesSynthese.push(
    `l\'analyse croisée de ${diag.scenarios.length} domaine(s) donne un indice de dégradation de ${diag.indiceGlobal}/100 (confiance ${diag.confiance}%)`
  )
  if (pires[0]) {
    partiesSynthese.push(
      `le domaine le plus dégradé est ${labelDomaine(pires[0].domaine)} avec une probabilité résiduelle de ${pires[0].probabiliteResiduelle}%`
    )
  }
  if (diag.barrieresCritiquesGlobales.length > 0) {
    partiesSynthese.push(
      `${diag.barrieresCritiquesGlobales.length} barrière(s) critique(s) détectée(s)`
    )
  }
  const synthese = `En combinant les outils, ${partiesSynthese.join(' ; ')}.`

  // Outils — ce que chacun a apporté sur les domaines avec données
  const partiesOutils: string[] = []
  for (const s of dominantes.slice(0, 3)) {
    const apports: string[] = []
    if (s.sources.includes('amdec') && s.modesCritiquesAmdec.length > 0) {
      apports.push(`l\'AMDEC a signalé ${s.modesCritiquesAmdec.length} mode(s) de défaillance non corrigé(s)`)
    }
    if (s.sources.includes('fta') && s.coupesMinimales.length > 0) {
      apports.push(`l\'arbre de défaillance a trouvé ${s.coupesMinimales.length} combinaison(s) de causes possibles`)
    }
    if (s.sources.includes('bayes')) {
      apports.push('le réseau bayésien a ré-évalué la probabilité selon les indices C1-C5')
    }
    if (s.sources.includes('bowtie')) {
      apports.push('le bow tie a fourni le cadre barrières/danger')
    }
    partiesOutils.push(
      `sur ${labelDomaine(s.domaine)}, ${apports.length > 0 ? apports.join(' ; ') : 'les données qualitatives étaient limitées'}`
    )
  }
  const outils =
    partiesOutils.length > 0
      ? `Chaque outil répond à une question que les autres ne posent pas : ${partiesOutils.join(' ; ')}.`
      : 'Les données qualitatives sont insuffisantes pour exploiter les quatre outils sur ce profil.'

  // Barrières
  const barrieres =
    domainesBarrieres.length > 0
      ? `Barrières à surveiller en priorité : ${domainesBarrieres
          .flatMap((s) => {
            const noms = s.barrieres
              .filter((b) => b.efficaciteAjustee < SEUIL_BARRIERE_CRITIQUE)
              .map((b) => `${b.nom} (${b.efficaciteAjustee}/100)`)
            return noms.length > 0
              ? [`${labelDomaine(s.domaine)} : ${noms.join(' ; ')}`]
              : []
          })
          .slice(0, 5)
          .join(' · ')}.`
      : `Aucune barrière sous le seuil de vigilance (${SEUIL_BARRIERE_CRITIQUE}/100) : les protections sont globalement solides.`

  // Recommandation
  const recs: string[] = []
  if (diag.indiceGlobal >= 55) {
    recs.push('programmer une inspection rapprochée sur les domaines les plus dégradés')
  }
  if (domainesMenace.length > 0) {
    recs.push(
      `renforcer les barrières sur ${domainesMenace
        .slice(0, 3)
        .map((s) => labelDomaine(s.domaine))
        .join(', ')} où la probabilité de la menace dépasse ${SEUIL_PROBA_MENACE}%`
    )
  }
  if (diag.barrieresCritiquesGlobales.length > 0) {
    recs.push('corriger ou surveiller les barrières critiques identifiées')
  }
  const recommandation =
    recs.length > 0
      ? `Actions prioritaires : ${recs.join(' ; ')}.`
      : 'Aucune action immédiate : le niveau de dégradation reste sous contrôle.'

  return { synthese, outils, barrieres, recommandation, fallbackIA: true }
}

function pick(v: unknown, fb: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb
}

// ============================================================
// AGENT PRINCIPAL
// ============================================================

export async function expliquerChaineQualitative(input: ChaineQualitativeInput): Promise<ChaineQualitativeExplication> {
  const fallback = fallbackDeterministe(input)

  const userMessage = `Explique, en langage clair pour un inspecteur de la sécurité aérienne (ANACIM), le diagnostic qualitatif combinant quatre outils d'analyse du risque d'un aérodrome : AMDEC, BowTie, arbre de défaillance (FTA) et réseau bayésien. Chaque outil répond à une question que les autres ne posent pas : on les combine, on ne les oppose pas.

CONTEXTE RÉEL DE L'AÉRODROME (ne jamais réinventer ces chiffres) :
${contexteReel(input)}

Contraintes :
- « synthese » : ce que la combinaison des outils révèle globalement, avec l'indice et les chiffres réels.
- « outils » : ce que chacun des quatre outils a apporté de spécifique sur ce profil (sur quels domaines il a trouvé des signaux), en une phrase par domaine concerné.
- « barrieres » : les barrières critiques (nom + efficacité ajustée) à surveiller, ou la confirmation qu'aucune barrière n'est sous le seuil de vigilance.
- « recommandation » : l'action prioritaire concrète, selon le niveau de dégradation et les domaines à plus forte menace.
- 1-2 phrases par champ, sans jargon, sans inventer de chiffres.

Retourne uniquement un JSON :
{
  "synthese": "...",
  "outils": "...",
  "barrieres": "...",
  "recommandation": "..."
}`

  const iaFallback = {
    synthese: fallback.synthese,
    outils: fallback.outils,
    barrieres: fallback.barrieres,
    recommandation: fallback.recommandation,
  }

  const result = await aiClient.callJSON<{
    synthese?: string
    outils?: string
    barrieres?: string
    recommandation?: string
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

  const explication: ChaineQualitativeExplication = {
    synthese: pick(result.synthese, fallback.synthese),
    outils: pick(result.outils, fallback.outils),
    barrieres: pick(result.barrieres, fallback.barrieres),
    recommandation: pick(result.recommandation, fallback.recommandation),
    fallbackIA:
      result.synthese === fallback.synthese &&
      result.outils === fallback.outils &&
      result.barrieres === fallback.barrieres &&
      result.recommandation === fallback.recommandation,
  }

  enregistrerLangageClair({
    module: 'qualitative-chain',
    aerodromeId: input.aerodromeId,
    contexte: input.diagnostic
      ? {
          indice_global: input.diagnostic.indiceGlobal,
          confiance: input.diagnostic.confiance,
          nb_domaines: input.diagnostic.scenarios.length,
          barrieres_critiques: input.diagnostic.barrieresCritiquesGlobales,
        }
      : {},
    texte: `${explication.synthese} ${explication.recommandation}`,
    fallbackIA: explication.fallbackIA,
  })

  return explication
}