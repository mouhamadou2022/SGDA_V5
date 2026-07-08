/**
 * Hook pour utiliser le Web Worker de calculs de risque
 * Gère automatiquement la création, la communication et le nettoyage du worker
 */

'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { WorkerMessage, WorkerResponse, WorkerMessageType } from '../lib/workers/riskWorker'

interface UseRiskWorkerResult<T = any> {
  result: T | null
  isLoading: boolean
  error: string | null
  duration: number | null
  compute: (type: WorkerMessageType, payload: any) => Promise<T>
  cancel: () => void
}

let workerInstance: Worker | null = null
const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>()

export function useRiskWorker(): UseRiskWorkerResult {
  const [result, setResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)

  useEffect(() => {
    // Initialiser le worker une seule fois
    if (!workerInstance) {
      workerInstance = new Worker(new URL('../lib/workers/riskWorker.ts', import.meta.url))
      
      workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, result, error, duration } = e.data
        
        const pending = pendingRequests.get(id)
        if (pending) {
          pendingRequests.delete(id)
          if (error) {
            pending.reject(new Error(error))
          } else {
            setResult(result)
            setDuration(duration)
            pending.resolve(result)
          }
        }
      }
      
      workerInstance.onerror = (error) => {
        console.error('Worker error:', error)
        setError('Erreur du Web Worker')
        // Rejeter toutes les requêtes en attente
        pendingRequests.forEach((pending) => {
          pending.reject(new Error('Worker error'))
        })
        pendingRequests.clear()
      }
    }
    
    return () => {
      // Ne pas terminer le worker ici, il est partagé
    }
  }, [])

  const compute = useCallback(async <T = any>(type: WorkerMessageType, payload: any): Promise<T> => {
    const worker = workerInstance
    if (!worker) {
      throw new Error('Worker non initialisé')
    }
    
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject })
      
      const message: WorkerMessage = { type, payload, id }
      worker.postMessage(message)
      
      setIsLoading(true)
      setError(null)
    })
  }, [])

  const cancel = useCallback(() => {
    pendingRequests.forEach((pending) => {
      pending.reject(new Error('Cancelled'))
    })
    pendingRequests.clear()
    setIsLoading(false)
  }, [])

  return {
    result,
    isLoading,
    error,
    duration,
    compute,
    cancel
  }
}

// Fonction utilitaire pour terminer le worker (à appeler lors de la déconnexion)
export function terminateRiskWorker() {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
    pendingRequests.clear()
  }
}