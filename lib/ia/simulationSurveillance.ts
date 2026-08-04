// lib/ia/simulationSurveillance.ts
// Moteur de simulation de surveillance AERORISQ.
// À partir des données réelles (profil de risque C1-C5, écarts, historique des
// scores, items générés depuis le Kit Inspecteur), il construit une checklist
// simulée pré-remplie (SA/NS/NA/NV) avec confiance et justification, dérive les
// écarts probables, calcule les statistiques de conformité et produit les
// sections du rapport de surveillance — sans créer ni modifier aucune donnée.
//
// Purement déterministe et testable : aucune dépendance UI ni réseau. La
// prédiction locale est purement basée sur les données passées en paramètres ;
// une fonction de prédiction externe (ex. checklistMemory.getPredictionForItem)
// peut être injectée pour exploiter l'historique réel item par item.

import { getRiskLevel } from '@/lib/risque'
import { expandDomaines, getDomaineLabel } from '@/lib/domaines'
import { getSgsMaturiteLabel } from '@/lib/utils'
import type { Aerodrome, Ecart, ProfilRisque, ScoreHistoryPoint, KitChecklistItemGenere } from '@/lib/store'
import type { RapportSurveillanceData } from '@/lib/services/rapportSurveillancePdf'

// ============================================================
// TYPES
// ============================================================

export type ResultatSimule = 'SA' | 'NS' | 'NA' | 'NV'

export interface ItemSimule {
  id: string
  numero: string
  reference_reglementaire: string
  point_verification: string
  directive_preuve: string
  domaine: string
  sous_domaine?: string
  type_entite_cible: string
  prediction: ResultatSimule
  confiance: number
  justification: string
  alerte: boolean
  /** Source : 'kit' (réel, issu du Kit Inspecteur) | 'generique' (fallback) */
  source: 'kit' | 'generique'
}

export interface EcartPropose {
  id: string
  reference: string
  ref_reglementaire: string
  libelle: string
  domaine: string
  niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible'
  item_id: string
  justification: string
}

export interface StatsDomaine {
  sa: number
  ns: number
  na: number
  nv: number
  taux: number
}

export interface StatsSimulation {
  total: number
  sa: number
  ns: number
  na: number
  nv: number
  tauxConformite: number
  parDomaine: Record<string, StatsDomaine>
}

export interface ContexteSimulation {
  scoreGlobal: number | null
  niveau: string
  tendance: string
  maturiteSgs: string
  ecartsOuvertsReels: number
  evenementsRecents: number
}

export interface ResultatSimulation {
  aerodromeId: string
  typeSurveillance: string
  portee: string[]
  dateSimulation: string
  items: ItemSimule[]
  ecartsProposes: EcartPropose[]
  stats: StatsSimulation
  contexte: ContexteSimulation
  sections: Record<string, string>
  reference: string
}

export interface SimulationSurveillanceParams {
  aerodrome?: Aerodrome | null
  profil?: ProfilRisque | null
  ecartsReels: Ecart[]
  /** Nombre d'événements de sécurité réels de l'aérodrome. */
  evenementsReels?: number
  historique: ScoreHistoryPoint[]
  /** Items générés depuis le Kit Inspecteur (référentiel réel). */
  kitItems: KitChecklistItemGenere[]
  typeSurveillance: string
  portee: string[]
  typeEntite: string
  utilisateurs?: Array<{ id: string; prenom?: string; nom?: string }>
  prefixNumero?: string
  dateSimulation?: string
  /** Fonction de prédiction injectable (historique réel) — défaut : prédiction locale. */
  predireItem?: (item: {
    id: string
    numero: string
    point_verification: string
    domaine: string
    sous_domaine?: string
  }) => { prediction: ResultatSimule; confiance: number; justification: string; alerte: boolean } | null
}

/** Paramètres pour construire le rapport PDF (réutilise le builder ANACIM existant). */
export interface RapportSimulationData {
  rapport: RapportSurveillanceData
}

// ============================================================
// CONSTANTES
// ============================================================

/** Mapping domaine → critère de risque (aligné sur kitDocAgent.appliquerPrediction). */
const DOMAINE_CRITERE: Record<string, keyof ProfilRisque> = {
  SGS: 'c1', COP: 'c1',
  OPS: 'c2',
  PHY: 'c3', OLS: 'c3', ELEC: 'c3', MFP: 'c3',
  SLI: 'c5', RA: 'c5',
}

const NIVEAU_LABEL: Record<string, string> = {
  FAIBLE: 'faible', MOYEN: 'moyen', ELEVE: 'eleve', CRITIQUE: 'critique',
}

// ============================================================
// PRÉDICTION LOCALE (purement à partir des données réelles)
// ============================================================

/** Détermine la non-applicabilité d'un item selon le type d'entité. */
function estNonApplicable(typeEntite: string, typeCible?: string): boolean {
  if (!typeCible || typeCible === 'tous') return false
  if (typeCible === 'aerodrome' && typeEntite === 'helistation') return true
  if (typeCible === 'helistation' && typeEntite === 'aerodrome') return true
  return false
}

function predireLocal(
  item: { id: string; numero: string; point_verification: string; domaine: string; sous_domaine?: string; type_entite_cible?: string },
  ctx: { profil?: ProfilRisque | null; ecartsReels: Ecart[]; typeEntite: string }
): { prediction: ResultatSimule; confiance: number; justification: string; alerte: boolean } {
  const { profil, ecartsReels, typeEntite } = ctx

  if (estNonApplicable(typeEntite, item.type_entite_cible)) {
    return {
      prediction: 'NA',
      confiance: 98,
      justification: `Non applicable — entité de type ${typeEntite}, item réservé à un autre type`,
      alerte: false,
    }
  }

  const score = profil?.score_global
  const critere = (DOMAINE_CRITERE[item.domaine] ?? 'c1') as keyof ProfilRisque
  const critereScore = profil ? (profil[critere] as number) : undefined

  // Écarts réels ouverts sur ce domaine → non-conformité probable
  const ecartsDomaine = ecartsReels.filter(e => e.domaine === item.domaine && e.statut === 'ouvert')
  const ecartsCritiques = ecartsDomaine.filter(e => e.niveau_risque === 'critique')

  if (ecartsCritiques.length > 0) {
    return {
      prediction: 'NS',
      confiance: 90,
      justification: `${ecartsCritiques.length} écart(s) critique(s) réel(s) ouvert(s) sur le domaine ${getDomaineLabel(item.domaine)}`,
      alerte: true,
    }
  }
  if (ecartsDomaine.length > 0) {
    return {
      prediction: 'NS',
      confiance: 70,
      justification: `${ecartsDomaine.length} écart(s) réel(s) ouvert(s) sur le domaine ${getDomaineLabel(item.domaine)}`,
      alerte: true,
    }
  }

  if (score != null && score < 30) {
    return {
      prediction: 'NS',
      confiance: 80,
      justification: `Score global critique (${score}/100) — non-conformité probable`,
      alerte: true,
    }
  }
  if (score != null && score < 50) {
    return {
      prediction: 'NS',
      confiance: 55,
      justification: `Score global élevé (${score}/100) — vérification renforcée nécessaire`,
      alerte: true,
    }
  }
  if (score != null && score >= 80 && (critereScore ?? 0) >= 70) {
    return {
      prediction: 'SA',
      confiance: 75,
      justification: `Profil favorable (score ${score}/100, ${critere.toUpperCase()} ${critereScore}/100)`,
      alerte: false,
    }
  }
  if (score != null && score >= 60 && (critereScore ?? 0) >= 60) {
    return {
      prediction: 'SA',
      confiance: 60,
      justification: `Score moyen — conformité probable (${score}/100)`,
      alerte: true,
    }
  }

  return {
    prediction: 'NV',
    confiance: 50,
    justification: 'Résultat incertain — à vérifier lors de la surveillance',
    alerte: false,
  }
}

// ============================================================
// CONSTRUCTION DES ITEMS
// ============================================================

/** Retire le domaine global AGA (ne garde que les domaines individuels). */
function porteeIndividuelle(portee: string[]): string[] {
  return expandDomaines(portee).filter(d => d !== 'AGA')
}

/** Construit les items simulés depuis le Kit Inspecteur (ou fallback générique). */
function construireItems(
  params: SimulationSurveillanceParams
): ItemSimule[] {
  const { profil, ecartsReels, typeEntite, prefixNumero } = params
  const domaines = porteeIndividuelle(params.portee)
  const prefix = prefixNumero || (params.typeSurveillance === 'certification' ? 'CERT' : params.typeSurveillance === 'homologation' ? 'HMG' : 'QSC')

  // Items réels issus du Kit Inspecteur, filtrés par portée et dédoublonnés
  const vus = new Set<string>()
  const kit = params.kitItems.filter(ig => {
    const code = (ig.domaine || '').toUpperCase()
    if (domaines.length > 0 && !domaines.includes(code)) return false
    const key = ig.point_verification.toLowerCase().trim()
    if (vus.has(key)) return false
    vus.add(key)
    return true
  })

  const ctx = { profil, ecartsReels, typeEntite }

  const items: ItemSimule[] = kit.map((ig, i) => {
    const id = `${ig.domaine}_SIM_${String(i + 1).padStart(2, '0')}`
    const pred = predireItemAvecInjection(params, {
      id,
      numero: `${prefix}-${String(i + 1).padStart(2, '0')}`,
      point_verification: ig.point_verification,
      domaine: (ig.domaine || '').toUpperCase(),
      sous_domaine: ig.sous_domaine,
      type_entite_cible: ig.type_entite_cible,
    }, ctx)
    return {
      id,
      numero: `${prefix}-${String(i + 1).padStart(2, '0')}`,
      reference_reglementaire: ig.reference_reglementaire || `RAS 14 I — ${getDomaineLabel(ig.domaine)}`,
      point_verification: ig.point_verification,
      directive_preuve: ig.directive_preuve || '',
      domaine: (ig.domaine || '').toUpperCase(),
      sous_domaine: ig.sous_domaine,
      type_entite_cible: ig.type_entite_cible || 'tous',
      prediction: pred.prediction,
      confiance: pred.confiance,
      justification: pred.justification,
      alerte: pred.alerte,
      source: 'kit',
    }
  })

  // Fallback générique : aucun item Kit pour les domaines ciblés
  if (items.length === 0) {
    for (const code of domaines) {
      const label = getDomaineLabel(code)
      const i = items.length
      const item: ItemSimule = {
        id: `${code}_SIM_FB_${String(i + 1).padStart(2, '0')}`,
        numero: `${prefix}-${String(i + 1).padStart(2, '0')}`,
        reference_reglementaire: `RAS 14 I — ${label}`,
        point_verification: `Le domaine ${label} est-il conforme aux exigences réglementaires ?`,
        directive_preuve: `1. Demander la documentation ${label}\n2. Vérifier la conformité aux spécifications\n3. Observer les installations sur site`,
        domaine: code,
        type_entite_cible: 'tous',
        prediction: 'NV',
        confiance: 30,
        justification: `Aucun document réglementaire chargé pour ${code} — item générique`,
        alerte: false,
        source: 'generique',
      }
      items.push({ ...item, prediction: predireItemAvecInjection(params, item, ctx).prediction })
    }
  }

  return items
}

function predireItemAvecInjection(
  params: SimulationSurveillanceParams,
  item: { id: string; numero: string; point_verification: string; domaine: string; sous_domaine?: string; type_entite_cible?: string },
  ctx: { profil?: ProfilRisque | null; ecartsReels: Ecart[]; typeEntite: string }
): { prediction: ResultatSimule; confiance: number; justification: string; alerte: boolean } {
  if (params.predireItem) {
    const externe = params.predireItem({
      id: item.id,
      numero: item.numero,
      point_verification: item.point_verification,
      domaine: item.domaine,
      sous_domaine: item.sous_domaine,
    })
    if (externe) return externe
  }
  return predireLocal(item, ctx)
}

// ============================================================
// ÉCARTS PROPOSÉS
// ============================================================

function construireEcartsProposes(items: ItemSimule[], contexte: ContexteSimulation, ecartsReels: Ecart[]): EcartPropose[] {
  const ecarts: EcartPropose[] = []
  let n = 0
  for (const item of items) {
    if (item.prediction !== 'NS') continue
    n++
    // Niveau dérivé : écart réel critique sur le domaine, score global critique,
    // sinon élevé si alerte (écart ouvert réel / score défavorable), sinon moyen
    const aUnCritiqueReel = ecartsReels.some(e => e.domaine === item.domaine && e.statut === 'ouvert' && e.niveau_risque === 'critique')
    const niveau = aUnCritiqueReel || (contexte.scoreGlobal != null && contexte.scoreGlobal < 30)
      ? 'critique'
      : item.alerte
        ? 'eleve'
        : 'moyen'
    ecarts.push({
      id: `sim_ecart_${n}`,
      reference: `SIM-${String(n).padStart(2, '0')}`,
      ref_reglementaire: item.reference_reglementaire,
      libelle: item.point_verification,
      domaine: item.domaine,
      niveau_risque: niveau,
      item_id: item.id,
      justification: item.justification,
    })
  }
  return ecarts
}

// ============================================================
// STATISTIQUES
// ============================================================

function construireStats(items: ItemSimule[]): StatsSimulation {
  const stats: StatsSimulation = {
    total: items.length,
    sa: 0, ns: 0, na: 0, nv: 0,
    tauxConformite: 0,
    parDomaine: {},
  }

  for (const item of items) {
    const d = item.domaine
    if (!stats.parDomaine[d]) stats.parDomaine[d] = { sa: 0, ns: 0, na: 0, nv: 0, taux: 0 }
    const sd = stats.parDomaine[d]
    if (item.prediction === 'SA') { stats.sa++; sd.sa++ }
    else if (item.prediction === 'NS') { stats.ns++; sd.ns++ }
    else if (item.prediction === 'NA') { stats.na++; sd.na++ }
    else { stats.nv++; sd.nv++ }
  }

  const evalues = stats.sa + stats.ns + stats.nv
  stats.tauxConformite = evalues > 0 ? Math.round((stats.sa / evalues) * 100) : 0

  for (const d of Object.keys(stats.parDomaine)) {
    const sd = stats.parDomaine[d]
    const dEvalues = sd.sa + sd.ns + sd.nv
    sd.taux = dEvalues > 0 ? Math.round((sd.sa / dEvalues) * 100) : 0
  }

  return stats
}

// ============================================================
// SECTIONS DU RAPPORT (langage clair, déterministe, 0 API)
// ============================================================

function construireSections(
  params: SimulationSurveillanceParams,
  resultat: Omit<ResultatSimulation, 'sections' | 'reference'>
): Record<string, string> {
  const { aerodrome } = params
  const { items, ecartsProposes, stats, contexte } = resultat
  const nomAero = aerodrome ? `${aerodrome.nom} (${aerodrome.code_oaci})` : (params.profil?.aerodrome_id || params.aerodrome?.id || 'aérodrome')
  const crits = ecartsProposes.filter(e => e.niveau_risque === 'critique')
  const eleves = ecartsProposes.filter(e => e.niveau_risque === 'eleve')

  const resume = [
    `<p>Simulation de surveillance de l'aérodrome <strong>${nomAero}</strong> (${getDomaineLabel('AGA')}), type « ${params.typeSurveillance} », réalisée sur la base des données réelles : profil de risque (score ${contexte.scoreGlobal ?? 'N/A'}/100, niveau ${contexte.niveau}, tendance ${contexte.tendance}, maturité SGS ${contexte.maturiteSgs}).</p>`,
    `<p>La checklist simulée de <strong>${stats.total} items</strong> donne un taux de conformité estimé de <strong>${stats.tauxConformite}%</strong> (${stats.sa} SA, ${stats.ns} NS, ${stats.na} NA, ${stats.nv} NV). ${stats.ns} non-conformité(s) probable(s) conduisent à la proposition de ${ecartsProposes.length} écart(s), dont ${crits.length} critique(s) et ${eleves.length} élevé(s).</p>`,
  ].join('\n')

  const introduction = [
    `<p>Cette simulation s'inscrit dans la préparation de la surveillance « ${params.typeSurveillance} » du référentiel ANACIM. Elle exploite exclusivement les données réelles déjà renseignées : profil de risque C1-C5, écarts ouverts (${contexte.ecartsOuvertsReels}), événements de sécurité récents (${contexte.evenementsRecents}) et historique des scores.</p>`,
    `<p>Domaines couverts : ${params.portee.map(getDomaineLabel).join(', ')}.</p>`,
  ].join('\n')

  const methodologie = [
    `<p>La checklist simulée est construite à partir des items générés du Kit Inspecteur (documents réglementaires ANACIM / OACI en vigueur), filtrés par la portée et le type d'entité. Chaque item reçoit une prédiction SA/NS/NA/NV avec un niveau de confiance et une justification, dérivée des données réelles de l'aérodrome (écarts ouverts par domaine, score global, critères C1-C5).</p>`,
    `<p>Aucune donnée n'est créée ni modifiée : il s'agit d'une projection en lecture seule.</p>`,
  ].join('\n')

  const deroulement = {
    preparation: `<p>Préparation documentaire sur la base du profil de risque et des items à fort enjeu (${items.filter(i => i.alerte).length} item(s) en alerte).</p>`,
    reunionOuverture: '<p>Présentation de la simulation, de la portée et des attendus à l\'exploitant.</p>',
    verificationSite: `<p>Vérifications simulées des ${stats.total} points. Non-conformités probables concentrées sur ${Object.keys(stats.parDomaine).filter(d => stats.parDomaine[d].ns > 0).join(', ') || 'aucun domaine'}.</p>`,
    reunionCloture: `<p>Présentation des ${ecartsProposes.length} écarts proposés et des recommandations prioritaires.</p>`,
  }

  const preoccupations = crits.length > 0
    ? `<p>${crits.length} écart(s) de niveau critique sont proposés — action immédiate requise. Éléments : ${crits.slice(0, 3).map(e => e.libelle).join(' ; ')}.</p>`
    : eleves.length > 0
      ? `<p>${eleves.length} écart(s) de niveau élevé sont proposés — suivi renforcé recommandé.</p>`
      : '<p>Aucune préoccupation majeure identifiée dans la simulation.</p>'

  const recommandations = (() => {
    const recs: string[] = []
    if (crits.length > 0) recs.push(`Traiter en priorité les ${crits.length} écart(s) critique(s) proposés`)
    if (eleves.length > 0) recs.push(`Mettre en place des actions correctives pour les ${eleves.length} écart(s) élevé(s)`)
    if (contexte.scoreGlobal != null && contexte.scoreGlobal < 50) recs.push(`Renforcer le profil de risque (score ${contexte.scoreGlobal}/100) — niveau ${contexte.niveau}`)
    if (contexte.scoreGlobal != null && contexte.scoreGlobal >= 60 && stats.ns === 0) recs.push(`Maintenir les bonnes pratiques — conformité estimée ${stats.tauxConformite}%`)
    if (recs.length === 0) recs.push('Planifier la surveillance réelle pour confirmer les résultats simulés')
    return `<ul>${recs.map(r => `<li>${r}</li>`).join('')}</ul>`
  })()

  const conclusion = [
    `<p>La simulation confirme un état de conformité ${stats.tauxConformite >= 80 ? 'satisfaisant' : stats.tauxConformite >= 50 ? 'moyen' : 'dégradé'} (${stats.tauxConformite}%) pour ${nomAero}. ${ecartsProposes.length === 0 ? 'Aucun écart n\'est proposé à ce stade.' : `${ecartsProposes.length} écart(s) sont à confirmer lors de la surveillance réelle.`}</p>`,
    '<p>Ces résultats sont indicatifs et doivent être validés par l\'inspection sur site.</p>',
  ].join('\n')

  return {
    resume,
    introduction,
    methodologie,
    deroulement: JSON.stringify(deroulement),
    preoccupations,
    recommandations,
    conclusion,
  }
}

// ============================================================
// SIMULATION PRINCIPALE
// ============================================================

export function simulerSurveillance(params: SimulationSurveillanceParams): ResultatSimulation {
  const aerodromeId = params.aerodrome?.id || params.profil?.aerodrome_id || 'aerodrome'
  const dateSimulation = params.dateSimulation || new Date().toISOString()
  const score = params.profil?.score_global ?? null
  const niveau = score != null ? NIVEAU_LABEL[getRiskLevel(score)] || 'faible' : 'N/A'

  const contexte: ContexteSimulation = {
    scoreGlobal: score,
    niveau,
    tendance: params.profil?.tendance || 'stable',
    maturiteSgs: params.profil ? getSgsMaturiteLabel(params.profil.c1) : 'N/A',
    ecartsOuvertsReels: params.ecartsReels.filter(e => e.statut === 'ouvert').length,
    evenementsRecents: params.evenementsReels ?? 0,
  }

  const items = construireItems(params)
  const stats = construireStats(items)
  const ecartsProposes = construireEcartsProposes(items, contexte, params.ecartsReels)

  const base = {
    aerodromeId,
    typeSurveillance: params.typeSurveillance,
    portee: params.portee,
    dateSimulation,
    items,
    ecartsProposes,
    stats,
    contexte,
  }

  const sections = construireSections(params, base)

  const codeOaci = params.aerodrome?.code_oaci || 'XXX'
  const d = new Date(dateSimulation)
  const reference = `SIM_${codeOaci}_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_SURV`

  return {
    ...base,
    sections,
    reference,
  }
}

// ============================================================
// CONSTRUCTION DES DONNÉES DU RAPPORT PDF
// ============================================================

export function construireRapportSimulation(params: SimulationSurveillanceParams): RapportSimulationData {
  const resultat = simulerSurveillance(params)
  const now = new Date().toISOString()
  const dateSim = new Date(resultat.dateSimulation)

  const surveillance = {
    id: `sim_${params.aerodrome?.id || 'aerodrome'}_${Date.now()}`,
    aerodrome_id: resultat.aerodromeId,
    type: resultat.typeSurveillance,
    portee: resultat.portee,
    equipe_ids: [],
    chef_id: '',
    date_debut: dateSim.toISOString(),
    date_fin: dateSim.toISOString(),
    statut: 'planifiee' as const,
    created_at: now,
    updated_at: now,
  }

  let sections: { preparation?: string; reunionOuverture?: string; verificationSite?: string; reunionCloture?: string }
  try {
    sections = JSON.parse(resultat.sections.deroulement || '{}')
  } catch {
    sections = {}
  }

  const rapport: RapportSurveillanceData = {
    surveillance,
    aerodrome: params.aerodrome,
    profil: params.profil || undefined,
    items: resultat.items.map(i => ({
      id: i.id,
      numero: i.numero,
      domaine: i.domaine,
      reference_ras14: i.reference_reglementaire,
      point_verification: i.point_verification,
      description: i.point_verification,
      resultat: i.prediction,
      justification: i.justification,
      confiance: i.confiance,
      alerte: i.alerte,
    })),
    ecarts: resultat.ecartsProposes.map(e => ({
      id: e.id,
      reference: e.reference,
      libelle: e.libelle,
      domaine: e.domaine,
      ref_reglementaire: e.ref_reglementaire,
      niveau_risque: e.niveau_risque,
      statut: 'ouvert' as const,
    })),
    utilisateurs: params.utilisateurs || [],
    reference: resultat.reference,
    sections: {
      resume: resultat.sections.resume,
      introduction: resultat.sections.introduction,
      methodologie: resultat.sections.methodologie,
      deroulement: sections,
      preoccupations: resultat.sections.preoccupations,
      recommandations: resultat.sections.recommandations,
      conclusion: resultat.sections.conclusion,
    },
  }

  return { rapport }
}
