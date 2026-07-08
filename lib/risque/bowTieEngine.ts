// lib/risque/bowTieEngine.ts
// Data-Driven Risk Assessment via Bow-Tie + OACI Matrix
// Calcule risque initial, résiduel, et trajectoire pour chaque écart

import type { Ecart, EvenementSecurite, Surveillance, ProfilRisque } from '@/lib/store'
import type { BowTieModele, Barriere, NiveauRisque } from './types'
import { getOACIRiskLevel } from './oaciReference'

// OACI Matrix references
type OACIProb = 1 | 2 | 3 | 4 | 5
type OACIGrav = 'A' | 'B' | 'C' | 'D' | 'E'

const DOMAINES_BT = ['SGS', 'PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS'] as const

export interface GenerateBowTieParams {
  c1: number
  c2: number
  c3: number
  c5: number
  scoreGlobal: number
  ecartsDom: Ecart[]
  surveillancesDom: Surveillance[]
  evenementsDom?: EvenementSecurite[]
  domaine: string
  lastAssessed?: string
  statut_sgs?: string
}

/**
 * Génère un modèle BowTie pour un domaine donné.
 * Extrait dans bowTieEngine.ts pour éviter la duplication store ↔ composant.
 */
export function generateDomaineBowTie(params: GenerateBowTieParams): BowTieModele {
  const { c1, c2, c3, c5, scoreGlobal, ecartsDom, surveillancesDom, evenementsDom, domaine, lastAssessed, statut_sgs } = params
  const c1Score = c1
  const c2Score = c2
  const c3Score = c3
  const nbCritiques = ecartsDom.filter(e => e.niveau_risque === 'critique').length

  // Si SGS non applicable, retourner un modèle vide/skippé
  if (domaine === 'SGS' && statut_sgs === 'non_applicable') {
    return {
      id: `bt-SGS`,
      domaine: 'SGS',
      danger: 'SGS non applicable — domaine exempté',
      defaillance: 'Non concerné',
      scenario: 'SGS non applicable pour cet aérodrome',
      consequence: 'Aucun impact — SGS non requis',
      barrieresPreventives: [],
      barrieresCorrectives: [],
      probabiliteResiduelle: 0,
      niveauRisqueResiduel: 'faible',
      lastAssessed: lastAssessed || new Date().toISOString(),
    }
  }

  // Danger basé sur les écarts réels
  const danger = domaine === 'SGS'
    ? `Maturité SGS : ${c1Score >= 80 ? 'Efficace' : c1Score >= 60 ? 'Opérationnel' : c1Score >= 40 ? 'Approprié' : c1Score >= 20 ? 'Présent' : 'Absent'}${c1Score < 40 ? ' — SGS à renforcer' : ''}`
    : ecartsDom.length > 0
      ? `${ecartsDom.length} écart(s) actif(s)${nbCritiques > 0 ? ` dont ${nbCritiques} critique(s)` : ''}`
      : `${domaine} — Conformité nominale`

  // Défaillance liée à la conformité technique (SGS = PAOE, standard = OACI)
  const defaillance = domaine === 'SGS'
    ? c1Score < 20 ? 'SGS inexistant — risque de non-conformité réglementaire majeure'
      : c1Score < 40 ? 'SGS insuffisant — documentation et processus à développer'
      : c1Score < 60 ? 'SGS partiel — procédures non systématiquement appliquées'
      : 'SGS opérationnel'
    : c3Score < 40 ? 'Maintenance insuffisante — score critique'
      : c3Score < 60 ? 'Surveillance sous-optimale'
      : 'Fonctionnement nominal'

  // Conséquence enrichie par les événements réels
  let consequence = ''
  const evenementsGraves = evenementsDom?.filter(e => e.gravite === 'CRITIQUE' || e.gravite === 'ORANGE') || []
  if (domaine === 'SGS') {
    consequence = c1Score < 40
      ? 'Non-conformité OACI Annexe 19 — risque de suspension de certification'
      : c1Score < 60
      ? 'Défaut de démonstration de la maîtrise des risques'
      : 'SGS conforme aux exigences Annexe 19'
  } else {
    if (c5 < 40) {
      consequence = `Incidents probables — impact sécurité (C5=${c5}/100)`
    } else if (c5 < 60) {
      consequence = 'Non-conformité documentaire'
    } else {
      consequence = 'Impact opérationnel mineur'
    }
  }
  if (evenementsGraves.length > 0) {
    consequence += ` — ${evenementsGraves.length} événement(s) grave(s) dans ce domaine`
  }

  // Barrières préventives
  const barrieresPreventives: Barriere[] = [
    { id: `prev-sgs-${domaine}`, nom: `Maturité SGS (C1)`, type: 'preventive', efficace: c1Score > 50, efficacite: c1Score, dernierTest: lastAssessed, remarque: c1Score < 40 ? 'Maturité insuffisante — documenter les processus' : c1Score < 60 ? 'En progression' : 'SGS efficace' },
    { id: `prev-audit-${domaine}`, nom: `Audits ${domaine}`, type: 'preventive', efficace: surveillancesDom.length > 0, efficacite: surveillancesDom.length > 0 ? 70 : 30, dernierTest: surveillancesDom[0]?.date_fin || lastAssessed, remarque: surveillancesDom.length > 0 ? `${surveillancesDom.length} inspection(s) réalisée(s)` : 'Aucune inspection — programmer une visite' },
  ]

  // Barrières correctives
  const barrieresCorrectives: Barriere[] = [
    { id: `corr-pac-${domaine}`, nom: `PAC existants`, type: 'corrective', efficace: c2Score > 50, efficacite: c2Score, dernierTest: lastAssessed, remarque: c2Score < 30 ? 'PAC inefficaces — accélérer' : c2Score < 60 ? 'Progression nécessaire' : 'PAC efficaces' },
    { id: `corr-new-${domaine}`, nom: `Nouvelles mesures (IA)`, type: 'corrective', efficace: true, efficacite: Math.min(90, c2Score + 15), dernierTest: undefined, remarque: 'Mesures suggérées par IA' },
  ]

  // Probabilité résiduelle combinée
  const barrierEffAvg = (c1Score + c2Score) / 2
  const probResiduelle = Math.max(5, Math.min(95, 100 - (scoreGlobal + barrierEffAvg) / 2))

  // Niveau de risque : PAOE pour SGS, OACI pour les autres domaines
  const niveauRisque: NiveauRisque = domaine === 'SGS'
    ? c1Score >= 80 ? 'faible' : c1Score >= 60 ? 'moyen' : c1Score >= 40 ? 'eleve' : 'critique'
    : probResiduelle > 60 ? 'critique' : probResiduelle > 40 ? 'eleve' : probResiduelle > 20 ? 'moyen' : 'faible'

  return {
    id: `bt-${domaine}`,
    domaine,
    danger,
    defaillance,
    scenario: `Si ${defaillance.toLowerCase()} alors incident de sécurité ${domaine}`,
    consequence,
    barrieresPreventives,
    barrieresCorrectives,
    probabiliteResiduelle: Math.round(probResiduelle),
    niveauRisqueResiduel: niveauRisque,
    lastAssessed: lastAssessed || new Date().toISOString(),
  }
}

/**
 * Génère les modèles BowTie pour tous les domaines.
 */
export function generateBowTieModels(
  profil: ProfilRisque,
  ecarts: Ecart[],
  surveillances: Surveillance[],
  evenements?: EvenementSecurite[],
  statut_sgs?: string
): BowTieModele[] {
  const domaines = statut_sgs === 'non_applicable'
    ? DOMAINES_BT.filter(d => d !== 'SGS')
    : DOMAINES_BT
  return domaines.map(domaine => {
    const ecartsDom = ecarts.filter(e => e.domaine === domaine && e.statut !== 'cloture')
    const surveillancesDom = surveillances.filter(s => (s.portee || []).includes(domaine))
    const evenementsDom = evenements?.filter(e => {
      const typeMatch = e.type?.toLowerCase().includes(domaine.toLowerCase())
      return typeMatch
    })
    return generateDomaineBowTie({
      c1: profil.c1, c2: profil.c2, c3: profil.c3, c5: profil.c5,
      scoreGlobal: profil.score_global,
      ecartsDom, surveillancesDom, evenementsDom,
      domaine: domaine as string,
      lastAssessed: profil.computed_at,
      statut_sgs,
    })
  }).filter(b => b.barrieresPreventives.some(p => p.efficacite < 80) || b.probabiliteResiduelle > 30)
}

export { DOMAINES_BT }

/**
 * Résultat enrichi par IA (sous-ensemble éditable)
 */
export interface AIBowTieResult {
  source: 'groq_llm' | 'deterministic_fallback' | 'error_fallback'
  domaine: string
  danger: string
  defaillance: string
  scenario: string
  consequence: string
  barrieresPreventives: { nom: string; efficacite: number; remarque?: string }[]
  barrieresCorrectives: { nom: string; efficacite: number; remarque?: string }[]
}

/**
 * Appelle l'API route /api/ai/bowtie pour enrichir un domaine.
 * Utilisable côté client (fetch) comme côté serveur (via le même endpoint).
 * Fallback automatique sur generateDomaineBowTie si l'API échoue ou n'est pas disponible.
 */
export async function generateAIBowTieDomain(
  params: GenerateBowTieParams & { aerodrome_nom?: string }
): Promise<AIBowTieResult> {
  try {
    const baseUrl = typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/ai/bowtie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`API bowtie status ${res.status}`)
    const data = await res.json()
    if (data.source === 'error_fallback') throw new Error(data.error || 'Fallback demandé')
    return data as AIBowTieResult
  } catch {
    // Fallback déterministe
    const fb = generateDomaineBowTie(params)
    return {
      source: 'deterministic_fallback',
      domaine: fb.domaine,
      danger: fb.danger,
      defaillance: fb.defaillance,
      scenario: fb.scenario,
      consequence: fb.consequence,
      barrieresPreventives: fb.barrieresPreventives.map(b => ({ nom: b.nom, efficacite: b.efficacite, remarque: b.remarque })),
      barrieresCorrectives: fb.barrieresCorrectives.map(b => ({ nom: b.nom, efficacite: b.efficacite, remarque: b.remarque })),
    }
  }
}

export interface OACICell {
  probabilite: OACIProb
  gravite: OACIGrav
  cellule: string  // "4A", "2B", etc.
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  couleur: string
}

export interface RiskAssessment {
  celluleInitiale: OACICell
  justificationInitiale: string
  celluleResiduelle?: OACICell  // Après PAC
  gainPAC?: string
  celluleApresPreuves?: OACICell  // Après validation preuves
  gainPreuves?: string
  celluleFinale?: OACICell  // Après clôture
}

// OACI Matrix — gravity never changes for a given danger
const GRAVITE_MAP: Record<string, OACIGrav> = {
  critique: 'A', eleve: 'B', moyen: 'C', faible: 'D',
}

// Cell → risk level (délègue à la référence canonique oaciReference.ts)
function getCellNiveau(p: number, g: string): 'critique' | 'eleve' | 'moyen' | 'faible' {
  const { niveau } = getOACIRiskLevel(`${p}${g}`)
  return niveau as any
}

const CELL_COLORS: Record<string, string> = {
  critique: '#dc2626', eleve: '#ea580c', moyen: '#eab308', faible: '#16a34a',
}

/**
 * Calcule la cellule OACI initiale pour un écart
 * Basé sur les données réelles : niveau de risque de l'écart, domaine, récurrence
 */
export function computeInitialCell(ecart: Partial<Ecart>, ecartsSimilaires: Ecart[] = []): RiskAssessment {
  const niveauSaisie = ecart.niveau_risque || 'moyen'

  // Si l'inspecteur a déjà saisi une cellule OACI explicite, la respecter
  if (ecart.cellule_risque_oaci) {
    const cellule = ecart.cellule_risque_oaci
    const prob = parseInt(cellule[0]) as OACIProb || 3
    const grav = cellule[1] as OACIGrav || 'C'
    const niveau = getCellNiveau(prob, grav)
    return {
      celluleInitiale: { probabilite: prob, gravite: grav, cellule, niveau, couleur: CELL_COLORS[niveau] },
      justificationInitiale: `Cellule OACI déclarée par l'inspecteur (${cellule})`,
    }
  }

  // Gravité basée sur le niveau déclaré par l'inspecteur
  const gravite: OACIGrav = GRAVITE_MAP[niveauSaisie] || 'C'

  // Probabilité initiale basée sur :
  // 1. Nombre d'écarts similaires (même domaine) dans l'historique
  // 2. Niveau de risque déclaré
  const nbSimilaires = ecartsSimilaires.length
  let prob: OACIProb = 3 // défaut moyen
  if (niveauSaisie === 'critique') prob = 4
  else if (niveauSaisie === 'eleve') prob = 3
  else if (niveauSaisie === 'moyen' || niveauSaisie === 'tres_faible') prob = 2

  // Bonus de probabilité si récurrent
  if (nbSimilaires >= 5) prob = Math.min(5, prob + 2) as OACIProb
  else if (nbSimilaires >= 3) prob = Math.min(5, prob + 1) as OACIProb

  const cellule = `${prob}${gravite}`
  const calcule = getCellNiveau(prob, gravite)
  const inspecteurLevel: Record<string, string> = { critique: 'critique', eleve: 'eleve', moyen: 'moyen', faible: 'faible', tres_faible: 'tres_faible' }

  const reasons: string[] = []
  if (niveauSaisie === 'critique') reasons.push('niveau critique déclaré par l\'inspecteur')
  if (nbSimilaires > 0) reasons.push(`${nbSimilaires} écart(s) similaire(s) sur ce domaine`)

  // Détection de contradiction : si le niveau calculé ne correspond pas au niveau déclaré
  const niveauDeclare = inspecteurLevel[niveauSaisie] || 'moyen'
  if (calcule !== niveauDeclare) {
    reasons.push(`⚠️ Attention : le niveau calculé (${calcule}) diffère du niveau déclaré (${niveauSaisie}). L'inspecteur peut forcer la cellule OACI manuellement.`)
  }

  return {
    celluleInitiale: { probabilite: prob, gravite, cellule, niveau: calcule, couleur: CELL_COLORS[calcule] },
    justificationInitiale: reasons.length > 0 ? reasons.join(' — ') : 'Écart isolé, risque modéré',
  }
}

/**
 * Évalue le risque résiduel après soumission d'un PAC
 * Chaque action du PAC = une barrière qui réduit la probabilité
 */
export function evaluatePAC(initialCell: OACICell, nbActions: number, actionsDetail: { description: string; responsable: string; date_prevue: string }[] = []): RiskAssessment {
  // Chaque action réduit la probabilité (maximum -2)
  let probReduction = Math.min(2, Math.floor(nbActions / 2))
  if (nbActions >= 5) probReduction = 2
  if (nbActions >= 3 && nbActions < 5) probReduction = 1
  if (nbActions <= 0) probReduction = 0

  const nouvelleProb = Math.max(1, initialCell.probabilite - probReduction) as OACIProb
  const cellule = `${nouvelleProb}${initialCell.gravite}`
  const niveau = getCellNiveau(nouvelleProb, initialCell.gravite)

  const gain = probReduction > 0
    ? `-${probReduction} niveau de probabilité grâce à ${nbActions} action(s) corrective(s)`
    : 'Aucune réduction — PAC insuffisant'

  const reasons: string[] = []
  if (probReduction > 0) reasons.push(`${nbActions} barrières ajoutées, BSV consolidé réduit la probabilité de ${probReduction} niveau(x)`)
  if (actionsDetail.length > 0) reasons.push(`${actionsDetail.length} action(s) documentée(s) avec responsable et échéance`)

  return {
    celluleInitiale: initialCell,
    justificationInitiale: '',
    celluleResiduelle: { probabilite: nouvelleProb, gravite: initialCell.gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
    gainPAC: `${gain}${reasons.length > 0 ? ' — ' + reasons.join(' ; ') : ''}`,
  }
}

/**
 * Évalue après soumission des preuves
 * Les preuves confirment (ou non) les barrières
 */
export function evaluatePreuves(
  celluleResiduelle: OACICell,
  nbPreuves: number,
  preuvesConformes: number,
  barriereInitiale?: OACICell
): RiskAssessment {
  const ratio = nbPreuves > 0 ? preuvesConformes / nbPreuves : 0
  // Ratio > 80% → -1 probabilité supplémentaire
  // Ratio 50-80% → stable
  // Ratio < 50% → +1 probabilité (dégradation)
  let probAjustement = 0
  if (ratio >= 0.8) probAjustement = -1
  else if (ratio < 0.5) probAjustement = 1

  const nouvelleProb = Math.max(1, Math.min(5, celluleResiduelle.probabilite + probAjustement)) as OACIProb
  const cellule = `${nouvelleProb}${celluleResiduelle.gravite}`
  const niveau = getCellNiveau(nouvelleProb, celluleResiduelle.gravite)

  const gain = ratio >= 0.8
    ? `Preuves confirmées (${Math.round(ratio * 100)}%) — probabilité réduite`
    : ratio < 0.5
    ? `Preuves insuffisantes (${Math.round(ratio * 100)}%) — risque de dégradation`
    : `Preuves partiellement validées (${Math.round(ratio * 100)}%)`

  return {
    celluleInitiale: barriereInitiale || celluleResiduelle,
    justificationInitiale: '',
    celluleResiduelle: celluleResiduelle,
    celluleApresPreuves: { probabilite: nouvelleProb, gravite: celluleResiduelle.gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
    gainPreuves: gain,
    celluleFinale: { probabilite: nouvelleProb, gravite: celluleResiduelle.gravite, cellule, niveau, couleur: CELL_COLORS[niveau] },
  }
}

/**
 * Récupère la trajectoire complète pour un écart
 */
export function getRiskTrajectory(ecart: any): {
  initial: string
  afterPAC?: string
  afterPreuves?: string
  final: string
  trend: 'improving' | 'stable' | 'degrading'
} {
  const initial = ecart.cellule_risque_oaci || ecart.cellule_risque || `${ecart.probabilite_risque || 3}${ecart.gravite_risque || 'C'}`
  const afterPAC = ecart.cellule_pac_evaluee || ecart.cellule_risque_oaci || undefined
  const afterPreuves = ecart.cellule_preuves_evaluee || undefined

  // Determine trend — extrait de manière robuste le premier chiffre de la cellule OACI
  const getProb = (cell: string) => {
    if (!cell || typeof cell !== 'string') return 3
    const match = cell.match(/^(\d)/)
    const val = match ? parseInt(match[1]) : NaN
    return !isNaN(val) && val >= 1 && val <= 5 ? val : 3
  }
  const initProb = getProb(initial)
  const finalProb = afterPreuves ? getProb(afterPreuves) : afterPAC ? getProb(afterPAC) : initProb

  let trend: 'improving' | 'stable' | 'degrading' = 'stable'
  if (finalProb < initProb) trend = 'improving'
  else if (finalProb > initProb) trend = 'degrading'

  return {
    initial,
    afterPAC,
    afterPreuves,
    final: afterPreuves || afterPAC || initial,
    trend,
  }
}
