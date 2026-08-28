// lib/risque/qualitativeChain.ts
// Chaîne qualitative — combine les quatre outils d'analyse de risque sans les opposer.
//
// Chaque outil répond à une question que les autres ne posent pas, et sa sortie
// alimente l'outil suivant :
//
//   AMDEC    → « Que peut-il arriver à chaque fonction du processus ? »
//              Les modes de défaillance critiques non corrigés (IPR élevé) affaiblissent
//              l'efficacité des barrières préventives du BowTie du même domaine.
//
//   BowTie   → « Quelles barrières entre le danger et l'accident ? »
//              Définit le cadre structural : danger, barrières, événement redouté, conséquence.
//
//   FTA      → « Quelles combinaisons de causes mènent au sommet ? »
//              Recalibre la probabilité de la menace (côté gauche) pour chaque domaine,
//              et fournit les coupes minimales = combinaisons de causes racines.
//
//   Bayésien → « Comment la probabilité évolue à chaque indice ? »
//              Ré-infère la probabilité résiduelle selon l'état réel des barrières
//              (evidences C1/C2/C3/C5), via un réseau construit depuis le BowTie.
//
// Le résultat est un DiagnosticQualitatif par domaine, qui peut alimenter
// synthetiserModeles() comme vote supplémentaire.
//
// 'use client' impossible ici (logique pure) — aucun import React.

import type { Barriere, BowTieModele } from './types'
import type { AmdecAnalyse } from './amdecEngine'
import type { ArbreFTA } from './ftaEngine'
import { getMalusC3Details } from './amdecEngine'
import { calculerCoupesMinimales, calculerProbabiliteSommet } from './ftaEngine'

// ============================================================
// TYPES DE SORTIE
// ============================================================

/** Barrière du BowTie, avec l'impact AMDEC appliqué. */
export interface BarriereQualitative {
  id: string
  nom: string
  type: 'preventive' | 'corrective'
  efficaciteBase: number
  efficaciteAjustee: number
  efficace: boolean
}

/** Regroupement par domaine des quatre outils. */
export interface ScenarioQualitatif {
  domaine: string
  danger: string
  defaillance: string
  consequence: string
  /** Probabilité de la menace (FTA si disponible, sinon valeur BowTie). */
  probabiliteMenace: number
  /** Probabilité résiduelle après ré-Inférence bayésienne (sinon BowTie). */
  probabiliteResiduelle: number
  /** Coupes minimales FTA = combinaisons de causes racines du sommet. */
  coupesMinimales: string[][]
  barrieres: BarriereQualitative[]
  /** ids des barrières dont l'efficacité ajustée est < 60. */
  barrieresCritiques: string[]
  /** Outils ayant contribué au scénario. */
  sources: ('amdec' | 'fta' | 'bayes' | 'bowtie')[]
  /** Modes AMDEC critiques non corrigés qui ont affaibli les barrières. */
  modesCritiquesAmdec: string[]
  confiance: number
}

export interface DiagnosticQualitatif {
  scenarios: ScenarioQualitatif[]
  /** Indice de dégradation global 0-100 (cohérent avec les votes de synthetiserModeles). */
  indiceGlobal: number
  confiance: number
  /** Noms des barrières critiques présentes dans au moins un scénario. */
  barrieresCritiquesGlobales: string[]
  interpretation: string
}

/** Résultat bayésien pré-calculé par domaine (sortie de computeBayesianNetworkRisk). */
export interface BayesParDomaine {
  probabiliteResiduelle: number
  barrieresCritiques: string[]
  confiance: number
}

const SEUIL_BARRIERE_CRITIQUE = 60

// ============================================================
// PONT FTA → BOWTIE
// ============================================================

/**
 * Probabilité de la menace pour un domaine : max des probabilités sommet des
 * arbres FTA terminés du domaine. Fallback sur la valeur du BowTie si aucun
 * arbre terminé n'existe.
 */
function probabiliteMenaceDepuisFTA(
  arbres: ArbreFTA[],
  domaine: string,
  fallback: number
): { probabilite: number; coupesMinimales: string[][]; source: boolean } {
  const arbresDomaine = arbres.filter(
    (a) => a.domaine === domaine && a.statut === 'termine' && a.noeuds.length > 0
  )
  if (arbresDomaine.length === 0) return { probabilite: fallback, coupesMinimales: [], source: false }

  const avecProba = arbresDomaine.map((a) => {
    const probabilite = a.probabilite_sommet ?? calculerProbabiliteSommet(a.noeuds, a.sommetId)
    const coupes = calculerCoupesMinimales(a.noeuds, a.sommetId)
    return { a, probabilite, coupes }
  })

  let probabilite = -1
  for (const { probabilite: p } of avecProba) {
    if (p > probabilite) {
      probabilite = p
    }
  }
  const meilleur = avecProba.find(({ probabilite: p }) => p === probabilite)
  return {
    probabilite: Math.round(probabilite),
    coupesMinimales: meilleur?.coupes ?? [],
    source: probabilite > 0,
  }
}

// ============================================================
// PONT AMDEC → BOWTIE
// ============================================================

/**
 * Malus AMDEC appliqué aux barrières préventives d'un domaine.
 * Reprend le barème de calculeMalusC3 (critique -5, élevé -2, plafond 20)
 * mais limité aux modes non corrigés du domaine du BowTie.
 */
function impactAmdecSurBarrieres(
  analyses: AmdecAnalyse[],
  domaine: string
): { malus: number; modesCritiques: string[] } {
  const locales = analyses.filter((a) => a.domaine === domaine && a.statut !== 'corrige')
  const { malus } = getMalusC3Details(locales)
  const modesCritiques = locales
    .filter((a) => a.niveau === 'critique' || a.niveau === 'eleve')
    .map((a) => `${a.systeme} — ${a.mode_defaillance}`)
  return { malus, modesCritiques }
}

function appliqueMalus(barriere: Barriere, malus: number): BarriereQualitative {
  return {
    id: barriere.id,
    nom: barriere.nom,
    type: barriere.type,
    efficaciteBase: barriere.efficacite,
    efficaciteAjustee: Math.max(0, Math.min(100, barriere.efficacite - malus)),
    efficace: barriere.efficacite - malus >= SEUIL_BARRIERE_CRITIQUE ? barriere.efficace : false,
  }
}

// ============================================================
// MOTEUR DE LA CHAÎNE
// ============================================================

export interface ChaineQualitativeParams {
  bowties: BowTieModele[]
  amdecAnalyses: AmdecAnalyse[]
  ftaArbres: ArbreFTA[]
  /** Résultats bayésiens pré-calculés par domaine (computeBayesianNetworkRisk). */
  bayesParDomaine?: Record<string, BayesParDomaine>
}

/**
 * Enchaîne les quatre outils pour chaque domaine du profil.
 * 1. AMDEC → affaiblit les barrières préventives (modes critiques non corrigés).
 * 2. FTA → recalibre la probabilité de la menace (max des arbres du domaine).
 * 3. Bayésien → ré-infère la probabilité résiduelle selon l'état des barrières.
 * 4. BowTie → fournit le cadre structural si les 2/3 manquent de données.
 */
export function chainerModelesQualitatifs(params: ChaineQualitativeParams): DiagnosticQualitatif {
  const { bowties, amdecAnalyses, ftaArbres, bayesParDomaine } = params

  const scenarios: ScenarioQualitatif[] = bowties.map((bt) => {
    const { malus, modesCritiques } = impactAmdecSurBarrieres(amdecAnalyses, bt.domaine)
    const amdecActif = malus > 0

    const fta = probabiliteMenaceDepuisFTA(ftaArbres, bt.domaine, bt.probabiliteResiduelle)
    const ftaActif = fta.source

    const bayes = bayesParDomaine?.[bt.domaine]
    const bayesActif = bayes !== undefined

    const probabiliteResiduelle = bayesActif
      ? bayes!.probabiliteResiduelle
      : bt.probabiliteResiduelle

    const barrieresQuali = [
      ...bt.barrieresPreventives.map((b) => appliqueMalus(b, malus)),
      ...bt.barrieresCorrectives.map((b) => appliqueMalus(b, 0)),
    ]
    // Barrières critiques : efficacité ajustée < seuil, fusionnées avec les
    // barrières signalées par l'inférence bayésienne (ids du réseau « barriere_<id> »).
    const barrieresCritiques = new Set<string>(
      barrieresQuali
        .filter((b) => b.efficaciteAjustee < SEUIL_BARRIERE_CRITIQUE)
        .map((b) => b.id)
    )
    if (bayesActif) {
      for (const nodeId of bayes!.barrieresCritiques) {
        const idBarriere = nodeId.startsWith('barriere_') ? nodeId.slice('barriere_'.length) : nodeId
        if (idBarriere) barrieresCritiques.add(idBarriere)
      }
    }

    const sources: ScenarioQualitatif['sources'] = ['bowtie']
    if (amdecActif) sources.push('amdec')
    if (ftaActif) sources.push('fta')
    if (bayesActif) sources.push('bayes')

    const confiance = bayesActif
      ? Math.max(50, bayes!.confiance)
      : ftaActif
      ? 55
      : amdecActif
      ? 50
      : 40

    return {
      domaine: bt.domaine,
      danger: bt.danger,
      defaillance: bt.defaillance,
      consequence: bt.consequence,
      probabiliteMenace: fta.probabilite,
      probabiliteResiduelle,
      coupesMinimales: fta.coupesMinimales,
      barrieres: barrieresQuali,
      barrieresCritiques: Array.from(barrieresCritiques),
      sources,
      modesCritiquesAmdec: modesCritiques,
      confiance,
    }
  })

  if (scenarios.length === 0) {
    return {
      scenarios: [],
      indiceGlobal: 0,
      confiance: 0,
      barrieresCritiquesGlobales: [],
      interpretation: 'Aucun scénario qualitatif calculable — données BowTie manquantes.',
    }
  }

  const indices = scenarios.map((s) => {
    const degradationBarrieres = (s.barrieresCritiques.length / Math.max(1, s.barrieres.length)) * 100
    return Math.round(0.4 * s.probabiliteResiduelle + 0.3 * s.probabiliteMenace + 0.3 * degradationBarrieres)
  })
  const poids = scenarios.map((s) => s.confiance)
  const poidsTotal = poids.reduce((a, b) => a + b, 0) || 1
  const indiceGlobal = Math.round(
    indices.reduce((acc, idx, i) => acc + idx * poids[i], 0) / poidsTotal
  )

  const confiance = Math.round(
    poids.reduce((a, b) => a + b, 0) / Math.max(1, poids.length)
  )

  const barrieresCritiquesGlobales = Array.from(
    new Set(
      scenarios.flatMap((s) =>
        s.barrieres
          .filter((b) => b.efficaciteAjustee < SEUIL_BARRIERE_CRITIQUE)
          .map((b) => b.nom)
      )
    )
  )

  const indiceFinal = Math.max(0, Math.min(100, indiceGlobal))
  return {
    scenarios,
    indiceGlobal: indiceFinal,
    confiance,
    barrieresCritiquesGlobales,
    interpretation: `Chaîne qualitative sur ${scenarios.length} domaine(s) — indice ${indiceFinal}/100`,
  }
}

// ============================================================
// VOTE POUR LA SYNTHÈSE MODÈLES
// ============================================================

/**
 * Convertit le DiagnosticQualitatif en vote compatible ModeleVote
 * (sans importer modelSynthesis — évite la dépendance circulaire).
 */
export function voterChaineQualitative(diag: DiagnosticQualitatif): {
  nom: string
  indiceDegradation: number
  confiance: number
  interpretation: string
} {
  const nbSources = new Set(diag.scenarios.flatMap((s) => s.sources)).size
  return {
    nom: 'Chaîne qualitative (BowTie+FTA+AMDEC)',
    indiceDegradation: diag.indiceGlobal,
    confiance: diag.confiance,
    interpretation:
      diag.scenarios.length === 0
        ? 'Chaîne qualitative non calculée'
        : `4 outils combinés sur ${diag.scenarios.length} domaine(s) — ${nbSources} types d\'analyse actifs, indice ${diag.indiceGlobal}/100`,
  }
}