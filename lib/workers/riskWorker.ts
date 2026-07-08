/**
 * Web Worker pour les calculs lourds de risque
 * Déporte les calculs intensifs (Hawkes, CUSUM, Monte Carlo) hors du thread principal
 */

export type WorkerMessageType = 
  | 'computeHawkes' 
  | 'computeHawkesMultivariate'
  | 'computeCUSUM' 
  | 'computeBayesian' 
  | 'computeStress' 
  | 'computeProactiveAlert'
  | 'computeVelocity'
  | 'computeHMM'
  | 'computeSurvival'

export interface WorkerMessage {
  type: WorkerMessageType
  payload: any
  id: string // Pour corréler réponse
}

export interface WorkerResponse {
  id: string
  type: string
  result: any
  error?: string
  duration: number
}

// Import des fonctions de calcul (seront exécutées dans le worker)
import {
  computeHawkesContagion,
  computeHawkesMultivariate,
  detectChangePointCUSUM,
  computeBayesianCredibleInterval,
  computeSystemStress,
  computeProactiveAlert,
  computeVelocityMetrics
} from '../risque'
import { predictHMM } from '../risque/hmm'
import { predictSurvival } from '../risque/survival'

// Gestion des messages entrants
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data
  const startTime = performance.now()
  
  try {
    let result: any
    
    switch (type) {
      case 'computeHawkes':
        result = computeHawkesContagion(payload.ecarts, payload.params)
        break
        
      case 'computeHawkesMultivariate':
        result = computeHawkesMultivariate(payload.ecartsParDomaine)
        break
        
      case 'computeCUSUM':
        result = detectChangePointCUSUM(payload.valeurs, payload.seuil, payload.driftAutorise)
        break
        
      case 'computeBayesian':
        result = computeBayesianCredibleInterval(payload.observations, payload.priorMean, payload.priorCertainty)
        break
        
      case 'computeStress':
        result = computeSystemStress(payload.profil, payload.ecartsActifs, payload.velocity)
        break
        
      case 'computeProactiveAlert':
        result = computeProactiveAlert(payload.profil, payload.historiqueScores, payload.hawkes)
        break
        
      case 'computeVelocity':
        result = computeVelocityMetrics(payload.historique)
        break

      case 'computeHMM':
        result = predictHMM(payload.historiqueScores, payload.nEtats)
        break

      case 'computeSurvival':
        result = predictSurvival(payload.dureesAvantIncident, payload.dureesCensurees)
        break
        
      default:
        throw new Error(`Type de message inconnu: ${type}`)
    }
    
    const duration = performance.now() - startTime
    
    const response: WorkerResponse = {
      id,
      type,
      result,
      duration
    }
    
    self.postMessage(response)
    
  } catch (error) {
    const duration = performance.now() - startTime
    
    const response: WorkerResponse = {
      id,
      type,
      result: null,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      duration
    }
    
    self.postMessage(response)
  }
}

export {}