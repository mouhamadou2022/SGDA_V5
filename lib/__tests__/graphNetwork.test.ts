// lib/__tests__/graphNetwork.test.ts
import { createRiskGraph, calculateRiskPropagation, calculateCentrality, recommendActionsFromGraph } from '../risque/graphNetwork'

describe('GraphNetwork', () => {
  const sampleParams = {
    aerodromes: [
      { id: 'aero-1', score_risque: 70, type: 'international' },
      { id: 'aero-2', score_risque: 40, type: 'national' },
    ],
    domaines: [
      { code: 'SGS', score: 75 },
      { code: 'PHY', score: 50 },
      { code: 'SLI', score: 65 },
    ],
    ecarts: [
      { id: 'ecart-1', niveau_risque: 'critique', domaine: 'SGS', aerodrome_id: 'aero-1' },
      { id: 'ecart-2', niveau_risque: 'moyen', domaine: 'PHY', aerodrome_id: 'aero-1' },
    ],
    surveillances: [],
  }

  describe('createRiskGraph', () => {
    it('devrait créer un graphe avec des nœuds et arêtes', () => {
      const graph = createRiskGraph(sampleParams)
      expect(graph.nodes.size).toBeGreaterThan(0)
      expect(graph.edges.length).toBeGreaterThan(0)
      expect(graph.nodes.has('aero_aero-1')).toBe(true)
      expect(graph.nodes.has('dom_SGS')).toBe(true)
      expect(graph.nodes.has('ecart_ecart-1')).toBe(true)
    })
  })

  describe('calculateRiskPropagation', () => {
    it('devrait propager le risque depuis un nœud', () => {
      const graph = createRiskGraph(sampleParams)
      const propagation = calculateRiskPropagation(graph, 'ecart_ecart-1')

      expect(propagation.sourceNode).toBe('ecart_ecart-1')
      expect(propagation.affectedNodes.length).toBeGreaterThan(0)
      expect(propagation.totalRisk).toBeGreaterThan(0)
    })
  })

  describe('calculateCentrality', () => {
    it('devrait calculer la centralité', () => {
      const graph = createRiskGraph(sampleParams)
      const centrality = calculateCentrality(graph)

      expect(centrality.size).toBe(graph.nodes.size)
      centrality.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('recommendActionsFromGraph', () => {
    it('devrait recommander des actions', () => {
      const graph = createRiskGraph(sampleParams)
      const recommendations = recommendActionsFromGraph(graph, 'aero-1')

      expect(recommendations.length).toBeGreaterThan(0)
      expect(recommendations[0]).toHaveProperty('action')
      expect(recommendations[0]).toHaveProperty('priority')
      expect(recommendations[0]).toHaveProperty('justification')
    })
  })
})
