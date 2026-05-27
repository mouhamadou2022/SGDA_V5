// lib/ia/workerPool.ts
// Pool de Web Workers pour déporter les calculs lourds (Hawkes, CUSUM, Bayesian, Stress)
// hors du thread principal — évite le jank UI pendant les analyses de risque

'use client'

import type { WorkerMessage, WorkerMessageType, WorkerResponse } from '@/lib/workers/riskWorker'

type TaskCallback = (result: any) => void
type TaskErrorCallback = (error: string) => void

interface QueuedTask {
  type: WorkerMessageType
  payload: any
  id: string
  resolve: TaskCallback
  reject: TaskErrorCallback
}

class WorkerPool {
  private worker: Worker | null = null
  private taskId = 0
  private pending = new Map<string, { resolve: TaskCallback; reject: TaskErrorCallback }>()
  private queue: QueuedTask[] = []
  private busy = false
  private maxRetries = 2

  private getWorker(): Worker | null {
    if (typeof window === 'undefined') return null
    if (this.worker) return this.worker

    try {
      this.worker = new Worker(
        new URL('@/lib/workers/riskWorker', import.meta.url)
      )

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.busy = false
        const { id, result, error } = e.data
        const pending = this.pending.get(id)
        if (pending) {
          this.pending.delete(id)
          if (error) {
            pending.reject(error)
          } else {
            pending.resolve(result)
          }
        }
        this.processQueue()
      }

      this.worker.onerror = (err) => {
        this.busy = false
        console.error('[WorkerPool] Worker error:', err)
        this.worker?.terminate()
        this.worker = null
        // Rejeter toutes les tâches en attente
        for (const [id, pending] of this.pending) {
          pending.reject('Worker error')
          this.pending.delete(id)
        }
      }
    } catch (err) {
      console.warn('[WorkerPool] Failed to create worker:', err)
      return null
    }

    return this.worker
  }

  private processQueue() {
    if (this.busy || this.queue.length === 0) return
    const task = this.queue.shift()!
    this.busy = true
    const worker = this.getWorker()
    if (!worker) {
      this.busy = false
      task.reject('Worker not available')
      this.processQueue()
      return
    }
    const msg: WorkerMessage = { type: task.type, payload: task.payload, id: task.id }
    worker.postMessage(msg)
  }

  async run<T>(type: WorkerMessageType, payload: any): Promise<T> {
    const worker = this.getWorker()
    if (!worker) {
      throw new Error('Web Workers non supportés dans cet environnement')
    }

    return new Promise<T>((resolve, reject) => {
      const id = `task_${++this.taskId}`
      this.pending.set(id, { resolve, reject })

      this.queue.push({ type, payload, id, resolve, reject })

      // Limiter la taille de la file d'attente
      if (this.queue.length > 50) {
        const dropped = this.queue.shift()!
        this.pending.delete(dropped.id)
        dropped.reject('Queue full — task dropped')
      }

      this.processQueue()
    })
  }

  async runWithRetry<T>(type: WorkerMessageType, payload: any, retries = this.maxRetries): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.run<T>(type, payload)
      } catch (err) {
        if (attempt === retries) throw err
        console.warn(`[WorkerPool] Retry ${attempt + 1}/${retries} for ${type}`)
        await new Promise(r => setTimeout(r, 100 * (attempt + 1)))
      }
    }
    throw new Error('Max retries exceeded')
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.queue = []
    for (const [id, pending] of this.pending) {
      pending.reject('Worker terminated')
      this.pending.delete(id)
    }
  }

  isAvailable(): boolean {
    return typeof Worker !== 'undefined'
  }
}

export const workerPool = new WorkerPool()
