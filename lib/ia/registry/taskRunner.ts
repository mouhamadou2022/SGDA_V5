// lib/ia/registry/taskRunner.ts
// Historique et apprentissage des agents : enregistrement des résultats
// d'agents (exécution de tâches personnalisées), vote/correction, statistiques
// d'apprentissage et alimentation best-effort du canal ia_training_dataset.

'use client'

import { useAppStore } from '@/lib/store'
import { iaStorage } from '@/lib/persistence/iaStorage'
import {
  AGENT_REGISTRY,
  findAgent,
  agentRunDeps,
} from './agentRegistry'
import type {
  AgentLearningStats,
  TaskExecutionRecord,
  TaskHistoryStats,
  TaskVote,
} from './types'

const IDB_STORE = 'feedbacks'
const HISTORY_KEY = 'sgda_task_history_v1'
const CUSTOM_TASKS_KEY = 'sgda_custom_tasks_v1'
const MAX_HISTORY = 200

const VOCABULAIRE_AGENT_ID: Record<string, string> = {
  assistant: 'assistant',
  risk: 'risk-agent',
  ecart: 'ecart-agent',
  rapport: 'report-agent',
  registre: 'registre-agent',
  certification: 'certification-agent',
  checklist: 'checklist-agent',
  inspecteur: 'inspecteur-virtuel',
  suggestionML: 'ml-agent',
}

function now(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Tâches personnalisées créées par l'utilisateur (entraînement). */
export interface CustomTask {
  id: string
  nom: string
  description: string
  agentId: string
  prompt?: string
  created_at: string
  created_by?: string
}

// ============================================================
// CLASS TASKRUNNER
// ============================================================

class TaskRunnerImpl {
  private history: TaskExecutionRecord[] = []
  private customTasks: CustomTask[] = []
  private ready: boolean = false
  private pending: Array<() => void> = []

  constructor() {
    this.init().catch(console.error)
  }

  private async init(): Promise<void> {
    try {
      const [h, c] = await Promise.all([
        iaStorage.get<TaskExecutionRecord[]>(IDB_STORE, HISTORY_KEY),
        iaStorage.get<CustomTask[]>(IDB_STORE, CUSTOM_TASKS_KEY),
      ])
      this.history = Array.isArray(h) ? h : []
      this.customTasks = Array.isArray(c) ? c : []
    } catch {
      this.history = []
      this.customTasks = []
    }
    this.ready = true
    const queue = this.pending
    this.pending = []
    queue.forEach((fn) => fn())
  }

  private lorsPrets(fn: () => void): void {
    if (this.ready) fn()
    else this.pending.push(fn)
  }

  private async persist(): Promise<void> {
    await Promise.all([
      iaStorage.set(IDB_STORE, HISTORY_KEY, this.history.slice(0, MAX_HISTORY)),
      iaStorage.set(IDB_STORE, CUSTOM_TASKS_KEY, this.customTasks),
    ])
  }

  /** Réinitialise l'état en mémoire (utilisé par les tests). */
  async chargerPourTests(history: TaskExecutionRecord[]): Promise<void> {
    this.history = [...history]
    this.customTasks = []
    this.ready = true
    this.pending = []
  }

  // ── Historique ──

  getHistory(): TaskExecutionRecord[] {
    return [...this.history]
  }

  async getStats(): Promise<TaskHistoryStats> {
    const historique = this.getHistory()
    const parAgent: AgentLearningStats[] = AGENT_REGISTRY.map((agent) => {
      const recs = historique.filter((r) => r.agentId === agent.id)
      const votesUp = recs.filter((r) => r.vote === 'up').length
      const votesDown = recs.filter((r) => r.vote === 'down').length
      const corrections = recs.filter((r) => !!r.correction).length
      const fallbackCount = recs.filter((r) => r.fallbackIA).length
      const confiances = recs.map((r) => r.confidence).filter((c): c is number => typeof c === 'number')
      const dernier = recs[0]
      return {
        agentId: agent.id,
        agentNom: agent.nom,
        total: recs.length,
        votesUp,
        votesDown,
        corrections,
        fallbackCount,
        tauxAcceptation:
          votesUp + votesDown > 0 ? Math.round((votesUp / (votesUp + votesDown)) * 100) : 0,
        confianceMoyenne:
          confiances.length > 0
            ? Math.round(confiances.reduce((s, c) => s + c, 0) / confiances.length)
            : 0,
        maturite: recs.length,
        maturiteLabel: this.maturiteLabel(recs.length),
        derniereExecution: dernier?.date,
      }
    })
    return {
      total: historique.length,
      parAgent,
      derniersResultats: historique.slice(0, 20),
    }
  }

  private maturiteLabel(executions: number): string {
    if (executions === 0) return 'Non exploité'
    if (executions < 10) return 'Découverte'
    if (executions < 30) return 'Apprentissage'
    if (executions < 80) return 'Confiance'
    return 'Mature'
  }

  // ── Vote / correction ──

  async voter(recordId: string, vote: TaskVote): Promise<TaskExecutionRecord | undefined> {
    const record = this.history.find((r) => r.id === recordId)
    if (!record) return undefined
    record.vote = vote
    await this.persist()
    this.envoyerEntrainement(record, vote).catch(console.error)
    return record
  }

  async corriger(recordId: string, correction: string): Promise<TaskExecutionRecord | undefined> {
    const record = this.history.find((r) => r.id === recordId)
    if (!record || !correction?.trim()) return undefined
    record.correction = correction.trim()
    record.vote = 'down'
    await this.persist()
    this.envoyerEntrainement(record, 'down').catch(console.error)
    return record
  }

  // ── Entraînement best-effort (ia_training_dataset) ──

  private async envoyerEntrainement(
    record: TaskExecutionRecord,
    vote: TaskVote | undefined
  ): Promise<void> {
    if (typeof fetch === 'undefined') return
    try {
      const nomModule = `agent-${record.agentId}`
      const texte = record.summary ?? record.output.slice(0, 500)
      await fetch('/api/ia/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: nomModule,
          texte,
          contexte: {
            taskId: record.taskId,
            agentId: record.agentId,
            agentNom: record.agentNom,
            params: record.params,
            fallbackIA: record.fallbackIA,
          },
          fallbackIA: record.fallbackIA,
          vote,
          agentId: record.agentId,
        }),
      }).catch(() => {
        // best-effort : jamais bloquant pour l'UI
      })
    } catch {
      // ignoré
    }
  }

  // ── Tâches personnalisées (entraînement) ──

  async creerTachePersonnalisee(input: {
    nom: string
    description: string
    agentId: string
    prompt?: string
  }): Promise<CustomTask> {
    const task: CustomTask = {
      id: id('custom'),
      nom: input.nom.trim(),
      description: input.description.trim(),
      agentId: input.agentId,
      prompt: input.prompt?.trim(),
      created_at: now(),
      created_by: useAppStore.getState().user?.role,
    }
    this.lorsPrets(() => {
      this.customTasks.push(task)
      this.persist().catch(console.error)
    })
    return task
  }

  getCustomTasks(): CustomTask[] {
    return [...this.customTasks]
  }

  async supprimerTachePersonnalisee(taskId: string): Promise<void> {
    this.lorsPrets(() => {
      this.customTasks = this.customTasks.filter((t) => t.id !== taskId)
      this.persist().catch(console.error)
    })
  }

  /** Exécute une tâche personnalisée (via l'assistant conversationnel). */
  async executerTachePersonnalisee(custom: CustomTask): Promise<TaskExecutionRecord> {
    const agent = findAgent(custom.agentId)
    const start = performance.now()
    const message = [custom.nom, custom.description, custom.prompt].filter(Boolean).join('\n')
    const res = await agentRunDeps.assistantAgent.chat({
      message,
      contexte: { module: VOCABULAIRE_AGENT_ID[custom.agentId] ?? custom.agentId },
      userRole: useAppStore.getState().user?.role ?? 'user',
    })
    const output = {
      content: res.message,
      summary: res.message.slice(0, 160),
      confidence: res.confidence,
    }
    const dureeMs = Math.round(performance.now() - start)
    const record: TaskExecutionRecord = {
      id: id('task'),
      taskId: custom.id,
      agentId: custom.agentId,
      agentNom: agent?.nom ?? custom.agentId,
      date: now(),
      params: { customTask: custom.nom },
      output: output.content,
      summary: output.summary,
      confidence: output.confidence,
      dureeMs,
    }
    this.lorsPrets(() => {
      this.history.unshift(record)
      if (this.history.length > MAX_HISTORY) this.history = this.history.slice(0, MAX_HISTORY)
      this.persist().catch(console.error)
    })
    return record
  }

  // ── Méta-données pour l'UI ──

  getAgents() {
    return AGENT_REGISTRY
  }
}

export const taskRunner = new TaskRunnerImpl()

export type { TaskExecutionRecord, TaskVote }