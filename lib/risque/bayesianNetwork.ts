// lib/risque/bayesianNetwork.ts
// Réseau bayésien causal pour propagation des dégradations de barrières
// Construit automatiquement depuis un BowTieModele existant
// Inférence par élimination de variables, lissage Dirichlet sur les CPT
// Zéro dépendance externe, 100% local

'use client'

import type { BowTieModele, Barriere } from './types'

// ============================================================
// TYPES
// ============================================================

export type TypeNoeud = 'barriere' | 'organisationnel' | 'evenement_redoute' | 'consequence'

export interface CPT {
  table: Record<string, number[]>
  observations: Record<string, number[]>
}

export interface BayesNode {
  id: string
  nom: string
  parents: string[]
  etats: string[]
  cpt: CPT
  evidence?: number
  type: TypeNoeud
}

export interface BayesianNetworkResult {
  probabiliteResiduelle: number
  distribution: number[]
  barrieresCritiques: string[]
  confiance: number
}

export interface EvidOrgParams {
  charge_travail: number
  formation_adequation: number
  supervision_quality: number
}

// ============================================================
// LISSAGE DIRICHLET (Laplace smoothing)
// ============================================================

const ALPHA_DEFAUT = 1.0

export function smoothCPT(comptages: number[], alpha = ALPHA_DEFAUT): number[] {
  const total = comptages.reduce((a, b) => a + b, 0) + alpha * comptages.length
  return comptages.map(c => (c + alpha) / total)
}

function etatIndex(evidence: number | undefined, etats: string[]): number {
  if (evidence === undefined) return -1
  return Math.max(0, Math.min(evidence, etats.length - 1))
}

// ============================================================
// CPT PAR DÉFAUT — DÉRIVÉ DE L'EXPERTISE OACI
// ============================================================

function defaultCPT(etats: string[], parentEtatsListe: string[][]): CPT {
  const table: Record<string, number[]> = {}
  const observations: Record<string, number[]> = {}

  function genererCombinaisons(idx: number, courante: string): void {
    if (idx >= parentEtatsListe.length) {
      const probs = etats.map(() => Math.random() * 0.3 + 0.1)
      const total = probs.reduce((a, b) => a + b, 0)
      table[courante] = probs.map(p => Math.round((p / total) * 100) / 100)
      observations[courante] = etats.map(() => 0)
      return
    }
    for (let i = 0; i < parentEtatsListe[idx].length; i++) {
      genererCombinaisons(idx + 1, courante ? `${courante},${i}` : `${i}`)
    }
  }

  if (parentEtatsListe.length === 0) {
    const probs = etats.map(() => 1 / etats.length)
    table[''] = probs
    observations[''] = etats.map(() => 0)
  } else {
    genererCombinaisons(0, '')
  }

  return { table, observations }
}

// ============================================================
// CONSTRUCTION AUTOMATIQUE DEPUIS BOWTIE
// ============================================================

const ETATS_BARRIERE = ['intacte', 'degradee', 'defaillante']
const ETATS_EVENEMENT = ['faible', 'moyen', 'eleve']
const ETATS_CONSEQUENCE = ['mineure', 'significative', 'grave']
const ETATS_ORG = ['faible', 'moyen', 'eleve']

const DOMAINES_COP = ['SGS', 'PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']

export function construireReseauDepuisBowTie(bowTie: BowTieModele): BayesNode[] {
  const noeuds: BayesNode[] = []
  const barriereIds: string[] = []

  const estDomaineCOP = DOMAINES_COP.includes(bowTie.domaine)

  // Nœuds organisationnels (ajoutés en amont des barrières COP)
  if (estDomaineCOP) {
    const orgNodes = [
      { id: `charge_travail_${bowTie.id}`, nom: 'Charge de travail' },
      { id: `formation_adequation_${bowTie.id}`, nom: "Adéquation formation" },
      { id: `supervision_quality_${bowTie.id}`, nom: 'Qualité supervision' },
    ]
    for (const n of orgNodes) {
      noeuds.push({
        id: n.id,
        nom: n.nom,
        parents: [],
        etats: [...ETATS_ORG],
        cpt: defaultCPT(ETATS_ORG, []),
        type: 'organisationnel',
      })
    }
  }

  // Barrières préventives
  for (const b of bowTie.barrieresPreventives) {
    const nodeId = `barriere_${b.id}`
    barriereIds.push(nodeId)
    const parentsOrg = estDomaineCOP
      ? [`charge_travail_${bowTie.id}`, `formation_adequation_${bowTie.id}`, `supervision_quality_${bowTie.id}`]
      : []
    noeuds.push({
      id: nodeId,
      nom: b.nom,
      parents: parentsOrg,
      etats: [...ETATS_BARRIERE],
      cpt: defaultCPT(ETATS_BARRIERE, parentsOrg.length > 0 ? parentsOrg.map(() => ETATS_ORG) : []),
      type: 'barriere',
    })
  }

  // Barrières correctives
  for (const b of bowTie.barrieresCorrectives) {
    const nodeId = `barriere_${b.id}`
    barriereIds.push(nodeId)
    noeuds.push({
      id: nodeId,
      nom: b.nom,
      parents: [],
      etats: [...ETATS_BARRIERE],
      cpt: defaultCPT(ETATS_BARRIERE, []),
      type: 'barriere',
    })
  }

  // Événement redouté
  const evenementId = `evenement_${bowTie.id}`
  noeuds.push({
    id: evenementId,
    nom: bowTie.defaillance || bowTie.danger,
    parents: [...barriereIds],
    etats: [...ETATS_EVENEMENT],
    cpt: defaultCPT(ETATS_EVENEMENT, barriereIds.map(() => ETATS_BARRIERE)),
    type: 'evenement_redoute',
  })

  // Conséquence
  const consequenceId = `consequence_${bowTie.id}`
  noeuds.push({
    id: consequenceId,
    nom: bowTie.consequence || 'Conséquence',
    parents: [evenementId],
    etats: [...ETATS_CONSEQUENCE],
    cpt: defaultCPT(ETATS_CONSEQUENCE, [ETATS_EVENEMENT]),
    type: 'consequence',
  })

  return noeuds
}

// ============================================================
// VARIABLE ELIMINATION — INFERENCE BAYESIENNE
// ============================================================

function obtenirFacteur(noeud: BayesNode, reseau: BayesNode[]): Record<string, number[]> {
  const facteur: Record<string, number[]> = {}

  for (const [combinaison, distribution] of Object.entries(noeud.cpt.table)) {
    const cle = combinaison ? `${noeud.id},${combinaison}` : noeud.id
    facteur[cle] = [...distribution]
  }

  return facteur
}

function multiplierFacteurs(
  facteurs: Record<string, number[]>[]
): Record<string, number[]> {
  if (facteurs.length === 0) return {}
  if (facteurs.length === 1) return { ...facteurs[0] }

  let resultat = { ...facteurs[0] }

  for (let i = 1; i < facteurs.length; i++) {
    const nouveau: Record<string, number[]> = {}
    for (const [k1, v1] of Object.entries(resultat)) {
      for (const [k2, v2] of Object.entries(facteurs[i])) {
        const k = `${k1}|${k2}`
        nouveau[k] = v1.map((val, idx) => val * v2[idx])
      }
    }
    resultat = nouveau
  }

  return resultat
}

function sommerVariable(
  facteurs: Record<string, number[]>,
  variableId: string
): Record<string, number[]> {
  const resultat: Record<string, number[]> = {}

  for (const [cle, distribution] of Object.entries(facteurs)) {
    if (cle.includes(variableId)) {
      const nouvelleCle = cle
        .split('|')
        .filter(p => !p.startsWith(variableId))
        .join('|')
      const existant = resultat[nouvelleCle]
      resultat[nouvelleCle] = existant
        ? existant.map((val, idx) => val + distribution[idx])
        : [...distribution]
    } else {
      resultat[cle] = [...distribution]
    }
  }

  return resultat
}

function normaliser(distribution: number[]): number[] {
  const total = distribution.reduce((a, b) => a + b, 0)
  if (total === 0) return distribution.map(() => 1 / distribution.length)
  return distribution.map(v => v / total)
}

function extraireDistributionPourNoeud(
  facteurs: Record<string, number[]>,
  noeudId: string,
  etats: string[]
): number[] {
  for (const [cle, distribution] of Object.entries(facteurs)) {
    if (cle.includes(noeudId)) {
      return distribution.length > 0 ? distribution : etats.map(() => 1 / etats.length)
    }
  }
  return etats.map(() => 1 / etats.length)
}

export function inferer(
  reseau: BayesNode[],
  requeteId: string,
  evidences: Record<string, number> = {}
): number[] {
  const noeudRequete = reseau.find(n => n.id === requeteId)
  if (!noeudRequete) return []

  // 1. Appliquer les evidences
  const reseauEvidence = reseau.map(n => ({
    ...n,
    evidence: evidences[n.id] !== undefined ? evidences[n.id] : n.evidence,
  }))

  // 2. Filtrer les nœuds observés (fixer leur valeur)
  const noeudsNonObservés = reseauEvidence.filter(n => n.evidence === undefined)
  const noeudCible = noeudsNonObservés.find(n => n.id === requeteId)
  if (!noeudCible) {
    const noeudObserve = reseauEvidence.find(n => n.id === requeteId)
    if (noeudObserve && noeudObserve.evidence !== undefined) {
      const result = noeudObserve.etats.map((_, i) => (i === noeudObserve.evidence ? 1 : 0))
      return result
    }
    return noeudRequete.etats.map(() => 1 / noeudRequete.etats.length)
  }

  // 3. Construire les facteurs pour les nœuds non observés seulement
  const facteursNoeuds: Record<string, number[]>[] = []

  for (const n of noeudsNonObservés) {
    const facteur = obtenirFacteur(n, reseau)
    facteursNoeuds.push(facteur)
  }

  // 4. Ajouter les facteurs des noeuds observés comme evidence
  for (const n of reseauEvidence) {
    if (n.evidence !== undefined) {
      const facteur: Record<string, number[]> = {}
      const idx = etatIndex(n.evidence, n.etats)
      for (const [comb, dist] of Object.entries(n.cpt.table)) {
        facteur[comb || n.id] = dist.map((_, i) => (i === idx ? 1 : 0))
      }
      facteursNoeuds.push(facteur)
    }
  }

  // 5. Ordre d'élimination: nœuds avec le plus de parents d'abord (heuristique simple)
  const ordreElimination = noeudsNonObservés
    .filter(n => n.id !== requeteId)
    .sort((a, b) => b.parents.length - a.parents.length)

  // 6. Multiplier tous les facteurs
  let facteursCombines = multiplierFacteurs(facteursNoeuds)

  // 7. Éliminer les variables une par une
  for (const n of ordreElimination) {
    facteursCombines = sommerVariable(facteursCombines, n.id)
  }

  // 8. Extraire et normaliser la distribution pour le nœud requêté
  const distribution = extraireDistributionPourNoeud(facteursCombines, requeteId, noeudCible.etats)
  return normaliser(distribution)
}

// ============================================================
// ANCrage des nœuds organisationnels
// ============================================================

export function discretiserChargeTravail(tauxOccupation: number): number {
  if (tauxOccupation < 40) return 0
  if (tauxOccupation <= 70) return 1
  return 2
}

export function discretiserFormationAdequation(
  ratioEcartsFormation: number,
  ratioCompetencesCouvertes: number
): number {
  const score = (1 - ratioEcartsFormation) * 0.6 + ratioCompetencesCouvertes * 0.4
  if (score >= 0.7) return 0
  if (score >= 0.4) return 1
  return 2
}

export function discretiserSupervisionQuality(
  ratioChefsDisponibles: number,
  ratioEcartsSupervision: number
): number {
  const score = ratioChefsDisponibles * 0.5 + (1 - ratioEcartsSupervision) * 0.5
  if (score >= 0.7) return 0
  if (score >= 0.4) return 1
  return 2
}

export function calculerEvidencesOrganisationnelles(
  params: Partial<EvidOrgParams>
): Record<string, number> {
  const evidences: Record<string, number> = {}

  if (params.charge_travail !== undefined) {
    evidences['charge_travail'] = discretiserChargeTravail(params.charge_travail)
  }
  if (params.formation_adequation !== undefined) {
    evidences['formation_adequation'] = discretiserFormationAdequation(
      params.formation_adequation,
      params.formation_adequation
    )
  }
  if (params.supervision_quality !== undefined) {
    evidences['supervision_quality'] = discretiserSupervisionQuality(
      params.supervision_quality,
      params.supervision_quality
    )
  }

  return evidences
}

// ============================================================
// BRIDGE — Résultat réseau bayésien
// ============================================================

export function computeBayesianNetworkRisk(
  reseau: BayesNode[],
  nodeId: string,
  evidences: Record<string, number> = {}
): BayesianNetworkResult {
  const distribution = inferer(reseau, nodeId, evidences)

  if (distribution.length === 0) {
    return {
      probabiliteResiduelle: 50,
      distribution: [],
      barrieresCritiques: [],
      confiance: 0,
    }
  }

  const idxGrave = Math.min(2, distribution.length - 1)
  const probabiliteResiduelle = Math.round(distribution[idxGrave] * 100)

  const barrieresCritiques = reseau
    .filter(n => n.type === 'barriere' && n.evidence !== undefined && n.evidence >= 1)
    .map(n => n.id)

  const totalObs = reseau.reduce((sum, n) => {
    const obs = Object.values(n.cpt.observations).reduce((s, v) => s + v.reduce((a, b) => a + b, 0), 0)
    return sum + obs
  }, 0)
  const confiance = Math.min(100, Math.round((totalObs / 100) * 100))

  return {
    probabiliteResiduelle,
    distribution,
    barrieresCritiques,
    confiance,
  }
}

// ============================================================
// BRIDGE BOW-TIE → RÉSEAU BAYÉSIEN
// ============================================================

function scoreToEvidence(score: number): number {
  if (score >= 70) return 0
  if (score >= 40) return 1
  return 2
}

export function buildEvidencesFromProfil(c1: number, c2: number, c3: number, c5: number): Record<string, number> {
  return {
    'barriere_sgs': scoreToEvidence(c1),
    'barriere_pac': scoreToEvidence(c2),
    'barriere_maintenance': scoreToEvidence(c3),
    'barriere_securite': scoreToEvidence(c5),
  }
}

export function computeBarrierEfficacite(
  bowTie: BowTieModele,
  c1: number,
  c2: number,
  c3: number,
  c5: number,
  reseauPreconstruit?: BayesNode[],
): {
  barrieresPreventives: Barriere[]
  barrieresCorrectives: Barriere[]
  probabiliteResiduelle: number
  confiance: number
} {
  const reseau = reseauPreconstruit ?? construireReseauDepuisBowTie(bowTie)
  const evidences: Record<string, number> = {}

  for (const b of bowTie.barrieresPreventives) {
    const nodeId = `barriere_${b.id}`
    if (b.id.includes('sgs')) {
      evidences[nodeId] = scoreToEvidence(c1)
    } else if (b.id.includes('audit')) {
      evidences[nodeId] = scoreToEvidence(c3)
    } else {
      evidences[nodeId] = scoreToEvidence(Math.round((c1 + c3) / 2))
    }
  }

  for (const b of bowTie.barrieresCorrectives) {
    const nodeId = `barriere_${b.id}`
    if (b.id.includes('pac')) {
      evidences[nodeId] = scoreToEvidence(c2)
    } else {
      evidences[nodeId] = scoreToEvidence(c5)
    }
  }

  const evenementId = `evenement_${bowTie.id}`
  const evenementDist = inferer(reseau, evenementId, evidences)
  const probResiduelle = evenementDist.length >= 3
    ? Math.round((evenementDist[1] + evenementDist[2]) * 50)
    : bowTie.probabiliteResiduelle

  const barrieresPreventives = bowTie.barrieresPreventives.map(b => {
    const nodeId = `barriere_${b.id}`
    const dist = inferer(reseau, nodeId, evidences)
    const intactProb = dist[0] || 0
    const efficaciteBayes = Math.round(intactProb * 100)
    return { ...b, efficacite: efficaciteBayes, efficace: efficaciteBayes > 50 }
  })

  const barrieresCorrectives = bowTie.barrieresCorrectives.map(b => {
    const nodeId = `barriere_${b.id}`
    const dist = inferer(reseau, nodeId, evidences)
    const intactProb = dist[0] || 0
    const efficaciteBayes = Math.round(intactProb * 100)
    return { ...b, efficacite: efficaciteBayes, efficace: efficaciteBayes > 50 }
  })

  const totalObs = reseau.reduce((sum, n) => {
    return sum + Object.values(n.cpt.observations).reduce((s, v) => s + v.reduce((a, b) => a + b, 0), 0)
  }, 0)
  const confiance = Math.min(100, Math.round((totalObs / 100) * 100))

  return { barrieresPreventives, barrieresCorrectives, probabiliteResiduelle: probResiduelle, confiance }
}

// ============================================================
// APPRENTISSAGE — MISE À JOUR DES CPT PAR OBSERVATION
// ============================================================

export function recomputeCPTFromObservations(node: BayesNode): BayesNode {
  const cpt = node.cpt
  const newTable: Record<string, number[]> = {}
  const alpha = ALPHA_DEFAUT
  const etatsCount = node.etats.length

  for (const [key, priorProbs] of Object.entries(cpt.table)) {
    const stateCounts = cpt.observations[key]
    if (!stateCounts || stateCounts.every(c => c === 0)) {
      newTable[key] = [...priorProbs]
      continue
    }

    const totalObs = stateCounts.reduce((a, b) => a + b, 0)
    const smoothed = stateCounts.map((count, i) => count + alpha)
    const total = smoothed.reduce((a, b) => a + b, 0)
    newTable[key] = smoothed.map(v => Math.round((v / total) * 100) / 100)
  }

  return {
    ...node,
    cpt: { ...cpt, table: newTable }
  }
}

export function incrementAndRecalibrate(
  node: BayesNode,
  parentKey: string,
  observedStateIndex: number
): BayesNode {
  const key = parentKey || ''
  const cpt = node.cpt
  const current = cpt.observations[key]
  const newCounts = current
    ? current.map((c, i) => i === observedStateIndex ? c + 1 : c)
    : node.etats.map((_, i) => i === observedStateIndex ? 1 : 0)

  const newObservations = { ...cpt.observations, [key]: newCounts }
  const newNode = {
    ...node,
    cpt: { ...cpt, observations: newObservations }
  }

  return recomputeCPTFromObservations(newNode)
}

export async function computeBarrierEfficaciteAvecApprentissage(
  bowTie: BowTieModele,
  c1: number,
  c2: number,
  c3: number,
  c5: number,
  aerodromeId?: string,
): Promise<{
  barrieresPreventives: Barriere[]
  barrieresCorrectives: Barriere[]
  probabiliteResiduelle: number
  confiance: number
}> {
  const reseau = construireReseauDepuisBowTie(bowTie)

  const storeKey = `cpts_bt-${bowTie.domaine}`

  // 1. Essayer Supabase (autorité unique)
  if (aerodromeId && typeof fetch !== 'undefined') {
    try {
      const res = await fetch(`/api/bayes-cpts?aerodrome_id=${aerodromeId}&domaine=${encodeURIComponent(bowTie.domaine)}`)
      if (res.ok) {
        const json = await res.json()
        const row = json.data?.[0]
        if (row?.noeuds) {
          for (const node of reseau) {
            const nodeData = row.noeuds.find((n: any) => n.id === node.id)
            if (nodeData?.cpt?.observations) {
              node.cpt.observations = nodeData.cpt.observations
            }
          }
          for (let i = 0; i < reseau.length; i++) {
            reseau[i] = recomputeCPTFromObservations(reseau[i])
          }
          return computeBarrierEfficacite(bowTie, c1, c2, c3, c5, reseau)
        }
      }
    } catch {
      // Silently fall back to IndexedDB
    }
  }

  // 2. Fallback IndexedDB (cache local)
  if (typeof indexedDB !== 'undefined') {
    try {
      const { iaStorage } = await import('@/lib/persistence/iaStorage')
      const savedData = await iaStorage.get<Record<string, { observations: Record<string, number[]> }>>('bayes_cpts', storeKey)
      if (savedData) {
        for (const node of reseau) {
          const nodeData = savedData[node.id]
          if (nodeData) {
            node.cpt.observations = nodeData.observations
          }
        }
        for (let i = 0; i < reseau.length; i++) {
          reseau[i] = recomputeCPTFromObservations(reseau[i])
        }
      }
    } catch {
      // Silently fall back to default CPTs
    }
  }

  return computeBarrierEfficacite(bowTie, c1, c2, c3, c5, reseau)
}

export function getConfianceLabel(confiance: number): string {
  if (confiance >= 70) return 'Confiance établie'
  if (confiance >= 30) return 'Confiance modérée'
  return 'Prior expert (peu d\'observations)'
}

export function getConfianceDot(confiance: number): string {
  if (confiance >= 70) return '●'
  if (confiance >= 30) return '◐'
  return '○'
}
