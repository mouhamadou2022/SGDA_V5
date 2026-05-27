/**
 * Graph Network pour la propagation des risques entre domaines
 * Modélise les relations entre écarts, domaines et aérodromes
 */

export interface GraphNode {
  id: string
  type: 'aerodrome' | 'domaine' | 'ecart' | 'surveillance'
  weight: number
  metadata: { [key: string]: any }
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  type: 'influence' | 'propagation' | 'correlation' | 'causation'
}

export interface RiskGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  adjacencyList: Map<string, string[]>
}

export interface PropagationResult {
  sourceNode: string
  affectedNodes: Array<{ id: string; impact: number; path: string[] }>
  totalRisk: number
  criticalPaths: string[][]
}

/**
 * Crée un graphe de risque à partir des données
 */
export function createRiskGraph(params: {
  aerodromes: Array<{ id: string; score_risque: number; type: string }>
  domaines: Array<{ code: string; score: number }>
  ecarts: Array<{ id: string; niveau_risque: string; domaine?: string; aerodrome_id: string }>
  surveillances: Array<{ id: string; aerodrome_id: string; domaines: string[] }>
}): RiskGraph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const adjacencyList = new Map<string, string[]>()
  
  // Ajouter les noeuds aérodromes
  params.aerodromes.forEach(aero => {
    nodes.set(`aero_${aero.id}`, {
      id: `aero_${aero.id}`,
      type: 'aerodrome',
      weight: 100 - aero.score_risque, // Plus le score est bas, plus le poids est élevé
      metadata: { aerodromeId: aero.id, type: aero.type, scoreRisque: aero.score_risque }
    })
    adjacencyList.set(`aero_${aero.id}`, [])
  })
  
  // Ajouter les noeuds domaines
  params.domaines.forEach(dom => {
    nodes.set(`dom_${dom.code}`, {
      id: `dom_${dom.code}`,
      type: 'domaine',
      weight: 100 - dom.score,
      metadata: { code: dom.code, score: dom.score }
    })
    adjacencyList.set(`dom_${dom.code}`, [])
  })
  
  // Ajouter les noeuds écarts
  params.ecarts.forEach(ecart => {
    nodes.set(`ecart_${ecart.id}`, {
      id: `ecart_${ecart.id}`,
      type: 'ecart',
      weight: ecart.niveau_risque === 'critique' ? 4 : ecart.niveau_risque === 'eleve' ? 3 : ecart.niveau_risque === 'moyen' ? 2 : 1,
      metadata: { ecartId: ecart.id, niveau: ecart.niveau_risque, domaine: ecart.domaine, aerodromeId: ecart.aerodrome_id }
    })
    adjacencyList.set(`ecart_${ecart.id}`, [])
    
    // Lier l'écart à l'aérodrome
    if (ecart.aerodrome_id) {
      const aeroKey = `aero_${ecart.aerodrome_id}`
      if (nodes.has(aeroKey)) {
        edges.push({
          source: `ecart_${ecart.id}`,
          target: aeroKey,
          weight: ecart.niveau_risque === 'critique' ? 0.9 : ecart.niveau_risque === 'eleve' ? 0.7 : 0.5,
          type: 'influence'
        })
        addToAdjacency(adjacencyList, `ecart_${ecart.id}`, aeroKey)
        addToAdjacency(adjacencyList, aeroKey, `ecart_${ecart.id}`)
      }
    }
    
    // Lier l'écart au domaine
    if (ecart.domaine) {
      const domKey = `dom_${ecart.domaine}`
      if (nodes.has(domKey)) {
        edges.push({
          source: `ecart_${ecart.id}`,
          target: domKey,
          weight: 0.8,
          type: 'influence'
        })
        addToAdjacency(adjacencyList, `ecart_${ecart.id}`, domKey)
        addToAdjacency(adjacencyList, domKey, `ecart_${ecart.id}`)
      }
    }
  })
  
  // Créer les liens entre domaines (propagation)
  const domaineCodes = params.domaines.map(d => d.code)
  const propagationMatrix: { [key: string]: number } = {
    'SGS_PHY': 0.3, 'SGS_SLI': 0.4, 'SGS_OLS': 0.2,
    'PHY_SLI': 0.5, 'PHY_OLS': 0.6, 'PHY_RA': 0.3,
    'SLI_RA': 0.7, 'OLS_RA': 0.2
  }
  
  for (let i = 0; i < domaineCodes.length; i++) {
    for (let j = i + 1; j < domaineCodes.length; j++) {
      const key = `${domaineCodes[i]}_${domaineCodes[j]}`
      const keyRev = `${domaineCodes[j]}_${domaineCodes[i]}`
      const weight = propagationMatrix[key] || propagationMatrix[keyRev] || 0.1
      
      if (weight > 0.2) {
        const sourceKey = `dom_${domaineCodes[i]}`
        const targetKey = `dom_${domaineCodes[j]}`
        
        edges.push({
          source: sourceKey,
          target: targetKey,
          weight,
          type: 'propagation'
        })
        edges.push({
          source: targetKey,
          target: sourceKey,
          weight: weight * 0.8, // Propagation asymétrique
          type: 'propagation'
        })
        
        addToAdjacency(adjacencyList, sourceKey, targetKey)
        addToAdjacency(adjacencyList, targetKey, sourceKey)
      }
    }
  }
  
  return { nodes, edges, adjacencyList }
}

function addToAdjacency(adjacencyList: Map<string, string[]>, from: string, to: string) {
  const neighbors = adjacencyList.get(from) || []
  if (!neighbors.includes(to)) {
    neighbors.push(to)
    adjacencyList.set(from, neighbors)
  }
}

/**
 * Calcule la propagation du risque depuis un noeud source
 */
export function calculateRiskPropagation(
  graph: RiskGraph,
  sourceNodeId: string,
  maxDepth: number = 3
): PropagationResult {
  const affectedNodes: Array<{ id: string; impact: number; path: string[] }> = []
  const criticalPaths: string[][] = []
  
  // BFS pour trouver les noeuds affectés
  const visited = new Set<string>()
  const queue: Array<{ id: string; impact: number; path: string[] }> = [
    { id: sourceNodeId, impact: 1.0, path: [sourceNodeId] }
  ]
  
  let totalRisk = 0
  
  while (queue.length > 0) {
    const current = queue.shift()!
    
    if (visited.has(current.id)) continue
    visited.add(current.id)
    
    const node = graph.nodes.get(current.id)
    
    // Ajouter aux nœuds affectés si ce n'est pas la source
    if (node && current.id !== sourceNodeId) {
      affectedNodes.push({
        id: current.id,
        impact: Math.round(current.impact * 100) / 100,
        path: current.path
      })
      
      totalRisk += current.impact * node.weight
      
      // Suivre les chemins critiques
      if (current.impact > 0.5 && current.path.length > 1) {
        criticalPaths.push([...current.path])
      }
    }
    
    // Explorer les voisins (toujours, même pour la source)
    const neighbors = graph.adjacencyList.get(current.id) || []
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue
      
      // Trouver le poids de l'arête (bidirectionnel)
      const edge = graph.edges.find(e =>
        (e.source === current.id && e.target === neighborId) ||
        (e.source === neighborId && e.target === current.id)
      )
      if (edge) {
        queue.push({
          id: neighborId,
          impact: current.impact * edge.weight,
          path: [...current.path, neighborId]
        })
      }
    }
  }
  
  // Trier par impact décroissant
  affectedNodes.sort((a, b) => b.impact - a.impact)
  
  return {
    sourceNode: sourceNodeId,
    affectedNodes,
    totalRisk: Math.round(totalRisk * 100) / 100,
    criticalPaths
  }
}

/**
 * Identifie les chemins critiques dans le graphe
 */
export function findCriticalPaths(
  graph: RiskGraph,
  threshold: number = 0.7
): string[][] {
  const criticalPaths: string[][] = []
  
  // Pour chaque paire de noeuds, trouver les chemins
  graph.nodes.forEach((node, nodeId) => {
    if (node.type === 'ecart' && node.weight >= 3) { // Écarts critiques ou élevés
      const result = calculateRiskPropagation(graph, nodeId, 2)
      criticalPaths.push(...result.criticalPaths)
    }
  })
  
  return criticalPaths.slice(0, 10) // Retourner les 10 premiers chemins critiques
}

/**
 * Calcule le score de centralité des noeuds
 */
export function calculateCentrality(graph: RiskGraph): Map<string, number> {
  const centrality = new Map<string, number>()
  
  graph.nodes.forEach((node, nodeId) => {
    const neighbors = graph.adjacencyList.get(nodeId) || []
    centrality.set(nodeId, neighbors.length * node.weight)
  })
  
  return centrality
}

/**
 * Recommande des actions basées sur l'analyse du graphe
 */
export function recommendActionsFromGraph(
  graph: RiskGraph,
  aerodromeId: string
): Array<{ action: string; priority: 'haute' | 'moyenne' | 'basse'; justification: string }> {
  const recommendations: Array<{ action: string; priority: 'haute' | 'moyenne' | 'basse'; justification: string }> = []
  
  const aeroNodeId = `aero_${aerodromeId}`
  const propagation = calculateRiskPropagation(graph, aeroNodeId)
  
  // Analyser les écarts critiques
  const ecartsCritiques = propagation.affectedNodes.filter(n => {
    const node = graph.nodes.get(n.id)
    return node?.type === 'ecart' && n.impact > 0.5
  })
  
  if (ecartsCritiques.length > 0) {
    recommendations.push({
      action: 'Traiter les écarts critiques en priorité',
      priority: 'haute',
      justification: `${ecartsCritiques.length} écart(s) critique(s) détecté(s) avec un impact élevé`
    })
  }
  
  // Analyser la propagation entre domaines
  const domainesAffectes = propagation.affectedNodes.filter(n => {
    const node = graph.nodes.get(n.id)
    return node?.type === 'domaine' && n.impact > 0.3
  })
  
  if (domainesAffectes.length >= 2) {
    recommendations.push({
      action: 'Audit transversal des domaines affectés',
      priority: 'haute',
      justification: `${domainesAffectes.length} domaines montrent des signes de propagation de risque`
    })
  }
  
  // Vérifier le risque total
  if (propagation.totalRisk > 50) {
    recommendations.push({
      action: 'Renforcer la surveillance globale',
      priority: 'haute',
      justification: `Score de risque de propagation: ${propagation.totalRisk}/100`
    })
  } else if (propagation.totalRisk > 25) {
    recommendations.push({
      action: 'Maintenir la vigilance sur les points critiques',
      priority: 'moyenne',
      justification: `Score de risque de propagation: ${propagation.totalRisk}/100`
    })
  }
  
  return recommendations
}