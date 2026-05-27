// lib/ia/orchestrator.ts
// ✅ Code COMPLET à remplacer

import EventEmitter from 'eventemitter3'

export type AgentId = 'risk' | 'checklist' | 'ecart' | 'report' | 'certification' | 'assistant' | 'learning'

export type TaskType =
  | 'analyze_risk'
  | 'predict_checklist'
  | 'generate_ecart'
  | 'evaluate_pac'
  | 'verify_preuves'
  | 'generate_report'
  | 'assess_certification'
  | 'chat'
  | 'suggest_action'
  | 'calibrate'

export interface Task {
  id: string
  type: TaskType
  agentId?: AgentId
  data: any
  priority: 'high' | 'normal' | 'low'
  createdAt: string
  retryCount?: number
}

export interface TaskResult {
  taskId: string
  success: boolean
  data?: any
  error?: string
  executionTime: number
  agentId: AgentId
  confidence?: number
}

export interface AgentInfo {
  id: AgentId
  name: string
  status: 'idle' | 'busy' | 'error'
  tasksCount: number
  lastTaskAt: string | null
  capabilities: TaskType[]
}

const DEFAULT_CONFIG = {
  maxConcurrentTasks: 5,
  defaultTimeout: 30000,
  retryCount: 3,
  retryDelay: 1000,
}

export class AgentOrchestrator extends EventEmitter {
  private agents: Map<AgentId, any> = new Map()
  private agentsInfo: Map<AgentId, AgentInfo> = new Map()
  private pendingTasks: Task[] = []
  private activeTasks: Map<string, Promise<TaskResult>> = new Map()
  private initialized: boolean = false
  private taskCounter: number = 0

  async init(): Promise<void> {
    if (this.initialized) return
    await this.loadAgents()
    this.initialized = true
    this.emit('ready')
    console.log('[Orchestrator] Initialisé')
  }

  private async loadAgents(): Promise<void> {
    const riskModule = await import('./agents/riskAgent')
    this.agents.set('risk', riskModule.riskAgent)
    this.agentsInfo.set('risk', { id: 'risk', name: 'Agent Profil Risque', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['analyze_risk'] })

    const checklistModule = await import('./agents/checklistAgent')
    this.agents.set('checklist', checklistModule.checklistAgent)
    this.agentsInfo.set('checklist', { id: 'checklist', name: 'Agent Checklist', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['predict_checklist'] })

    const ecartModule = await import('./agents/ecartAgent')
    this.agents.set('ecart', ecartModule.ecartAgent)
    this.agentsInfo.set('ecart', { id: 'ecart', name: 'Agent Écarts & PAC', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['generate_ecart', 'evaluate_pac', 'verify_preuves'] })

    const reportModule = await import('./agents/reportAgent')
    this.agents.set('report', reportModule.reportAgent)
    this.agentsInfo.set('report', { id: 'report', name: 'Agent Rapports', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['generate_report'] })

    const certificationModule = await import('./agents/certificationAgent')
    this.agents.set('certification', certificationModule.certificationAgent)
    this.agentsInfo.set('certification', { id: 'certification', name: 'Agent Certification', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['assess_certification'] })

    const assistantModule = await import('./agents/assistantAgent')
    this.agents.set('assistant', assistantModule.assistantAgent)
    this.agentsInfo.set('assistant', { id: 'assistant', name: 'Agent Assistant', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['chat', 'suggest_action'] })

    const learningModule = await import('./agents/learningAgent')
    this.agents.set('learning', learningModule.learningAgent)
    this.agentsInfo.set('learning', { id: 'learning', name: 'Agent Apprentissage', status: 'idle', tasksCount: 0, lastTaskAt: null, capabilities: ['calibrate'] })
  }

  async submitTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<string> {
    const taskId = `task_${Date.now()}_${++this.taskCounter}_${Math.random().toString(36).slice(2, 6)}`
    const fullTask: Task = { ...task, id: taskId, createdAt: new Date().toISOString(), retryCount: DEFAULT_CONFIG.retryCount }
    this.pendingTasks.push(fullTask)
    this.pendingTasks.sort((a, b) => ({ high: 3, normal: 2, low: 1 }[b.priority] - { high: 3, normal: 2, low: 1 }[a.priority]))
    this.processQueue()
    return taskId
  }

  private async processQueue(): Promise<void> {
    if (this.activeTasks.size >= DEFAULT_CONFIG.maxConcurrentTasks || this.pendingTasks.length === 0) return
    const task = this.pendingTasks.shift()!
    const agentId = task.agentId || this.resolveAgentForTask(task.type)
    if (!agentId || !this.agents.has(agentId)) {
      this.failTask(task.id, `Agent non disponible`)
      this.processQueue()
      return
    }
    const agent = this.agents.get(agentId)
    this.updateAgentStatus(agentId, 'busy')
    const promise = this.executeTask(task, agent, agentId)
    this.activeTasks.set(task.id, promise)
    promise.finally(() => {
      this.activeTasks.delete(task.id)
      this.updateAgentStatus(agentId, 'idle')
      this.processQueue()
    })
  }

  private async executeTask(task: Task, agent: any, agentId: AgentId): Promise<TaskResult> {
    const startTime = Date.now()
    this.emit('task_started', { taskId: task.id, agentId })
    try {
      const storeData = this.getFreshStoreData()
      let resultData: any
      switch (task.type) {
        case 'analyze_risk': resultData = await agent.analyzeRisk(task.data, storeData); break
        case 'predict_checklist': resultData = await agent.predictChecklist(task.data, storeData); break
        case 'generate_ecart': resultData = await agent.generateEcart(task.data, storeData); break
        case 'evaluate_pac': resultData = await agent.evaluatePAC(task.data, storeData); break
        case 'verify_preuves': resultData = await agent.verifyPreuves(task.data, storeData); break
        case 'generate_report': resultData = await agent.generateReport(task.data, storeData); break
        case 'assess_certification': resultData = await agent.assessCertification(task.data, storeData); break
        case 'chat': resultData = await agent.chat(task.data, storeData); break
        case 'suggest_action': resultData = await agent.suggestAction(task.data, storeData); break
        case 'calibrate': resultData = await agent.calibrate(task.data, storeData); break
        default: throw new Error(`Type non supporté: ${task.type}`)
      }
      const result: TaskResult = { taskId: task.id, success: true, data: resultData, executionTime: Date.now() - startTime, agentId, confidence: resultData?.confidence }
      this.emit('task_completed', result)
      return result
    } catch (error) {
      const result: TaskResult = { taskId: task.id, success: false, error: error instanceof Error ? error.message : String(error), executionTime: Date.now() - startTime, agentId }
      this.emit('task_failed', result)
      if (task.retryCount && task.retryCount > 0) {
        this.pendingTasks.unshift({ ...task, retryCount: task.retryCount - 1 })
        setTimeout(() => this.processQueue(), DEFAULT_CONFIG.retryDelay)
      }
      return result
    }
  }

  private getFreshStoreData(): any {
    const { useAppStore } = require('../store')
    const store = useAppStore.getState()
    return {
      aerodromes: store.aerodromes,
      profilsRisque: store.profilsRisque,
      historiqueScores: store.historiqueScores,
      ecarts: store.ecarts,
      surveillances: store.surveillances,
      checklistMemoryRecords: store.checklistMemoryRecords,
      checklistItems: store.checklistItems,
      utilisateurs: store.utilisateurs,
      formations: store.formations,
      plannings: store.plannings,
      certifications: store.certifications,
      homologations: store.homologations,
      registreEntries: store.registreEntries,
    }
  }

  private resolveAgentForTask(taskType: TaskType): AgentId | undefined {
    const mapping: Record<TaskType, AgentId> = {
      analyze_risk: 'risk',
      predict_checklist: 'checklist',
      generate_ecart: 'ecart',
      evaluate_pac: 'ecart',
      verify_preuves: 'ecart',
      generate_report: 'report',
      assess_certification: 'certification',
      chat: 'assistant',
      suggest_action: 'assistant',
      calibrate: 'learning',
    }
    return mapping[taskType]
  }

  private failTask(taskId: string, error: string): void {
    this.emit('task_failed', { taskId, success: false, error, executionTime: 0, agentId: 'assistant' })
  }

  private updateAgentStatus(agentId: AgentId, status: AgentInfo['status']): void {
    const info = this.agentsInfo.get(agentId)
    if (info) {
      info.status = status
      if (status === 'busy') { info.tasksCount++; info.lastTaskAt = new Date().toISOString() }
      this.emit('agent_status_changed', { agentId, status })
    }
  }

  getAgent(agentId: AgentId): AgentInfo | undefined { return this.agentsInfo.get(agentId) }
  getAllAgents(): AgentInfo[] { return Array.from(this.agentsInfo.values()) }

  getStats() {
    const agents = Array.from(this.agentsInfo.values())
    return { totalAgents: agents.length, activeAgents: agents.filter(a => a.status === 'busy').length, pendingTasks: this.pendingTasks.length, activeTasks: this.activeTasks.size, totalTasks: this.taskCounter }
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(Array.from(this.activeTasks.values()))
    this.initialized = false
    this.emit('shutdown')
  }

  isReady(): boolean { return this.initialized }
}

export const orchestrator = new AgentOrchestrator()