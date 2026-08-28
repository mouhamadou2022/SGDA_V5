// lib/__tests__/agentRegistry.test.ts
// Tests du registre central des agents IA (métadonnées) et du taskRunner :
// votes/corrections, stats d'apprentissage et tâches personnalisées.

import { AGENT_REGISTRY, findAgent } from '@/lib/ia/registry/agentRegistry'
import { taskRunner } from '@/lib/ia/registry/taskRunner'
import type { TaskExecutionRecord } from '@/lib/ia/registry/types'

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function seed(suffix: string = ''): TaskExecutionRecord[] {
  const base = `2026-08-19T10:00:00.000Z`
  return [
    {
      id: `r-assistant-1${suffix}`,
      taskId: `custom-1`,
      agentId: 'assistant',
      agentNom: 'Assistant conversationnel',
      date: base,
      params: { customTask: 'Aide' },
      output: 'Réponse A',
      summary: 'Réponse A',
      dureeMs: 120,
    },
    {
      id: `r-risk-1${suffix}`,
      taskId: `custom-2`,
      agentId: 'risk',
      agentNom: 'Profil de risque',
      date: base,
      params: { customTask: 'Analyse' },
      output: 'Réponse B',
      summary: 'Réponse B',
      confidence: 85,
      dureeMs: 200,
    },
  ]
}

describe('agentRegistry', () => {
  test('expose 9 agents structurés', () => {
    expect(AGENT_REGISTRY.length).toBe(9)
    for (const agent of AGENT_REGISTRY) {
      expect(agent.id).toMatch(/^[a-zA-Z]+$/)
      expect(agent.slug).toBeTruthy()
      expect(agent.nom).toBeTruthy()
      expect(agent.description).toBeTruthy()
      expect(agent.capacite).toBeTruthy()
    }
  })

  test('les identifiants d\u2019agents sont uniques', () => {
    const ids = AGENT_REGISTRY.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('findAgent résout une entrée connue et renvoie undefined sinon', () => {
    const agent = findAgent('risk')
    expect(agent?.nom).toBe('Profil de risque')
    expect(findAgent('n-existe-pas')).toBeUndefined()
  })
})

describe('taskRunner — votes, corrections et stats', () => {
  beforeEach(async () => {
    await taskRunner.chargerPourTests(seed())
  })

  test('enregistre un vote et ignore un vote inexistant', async () => {
    const record = taskRunner.getHistory()[0]
    const voted = await taskRunner.voter(record.id, 'up')
    expect(voted?.vote).toBe('up')

    const missing = await taskRunner.voter('id-inconnu', 'up')
    expect(missing).toBeUndefined()
  })

  test('enregistre une correction (force le vote down)', async () => {
    const record = taskRunner.getHistory()[0]
    const corrected = await taskRunner.corriger(record.id, 'Réponse attendue : vérifier la procédure.')
    expect(corrected?.vote).toBe('down')
    expect(corrected?.correction).toContain('vérifier')
  })

  test('ignore une correction vide', async () => {
    const record = taskRunner.getHistory()[0]
    const uncorrected = await taskRunner.corriger(record.id, '   ')
    expect(uncorrected).toBeUndefined()
  })

  test('calcule les stats par agent', async () => {
    await flush()
    const history = taskRunner.getHistory()
    await taskRunner.voter(history[0].id, 'up')
    await taskRunner.voter(history[1].id, 'down')
    await flush()

    const stats = await taskRunner.getStats()
    expect(stats.total).toBe(2)

    const assistant = stats.parAgent.find((a) => a.agentId === 'assistant')
    expect(assistant).toBeDefined()
    expect(assistant!.total).toBe(1)
    expect(assistant!.votesUp).toBe(1)
    expect(assistant!.tauxAcceptation).toBe(100)

    const risk = stats.parAgent.find((a) => a.agentId === 'risk')
    expect(risk!.total).toBe(1)
    expect(risk!.votesDown).toBe(1)
    expect(risk!.tauxAcceptation).toBe(0)
  })

  test('marque la maturité pour les agents sans historique', async () => {
    const stats = await taskRunner.getStats()
    for (const agent of stats.parAgent) {
      expect(agent.maturiteLabel).toMatch(/Non exploité|Découverte|Apprentissage|Confiance|Mature/)
    }
  })
})

describe('taskRunner — tâches personnalisées', () => {
  beforeEach(async () => {
    await taskRunner.chargerPourTests([])
  })

  test('crée, liste et supprime une tâche personnalisée', async () => {
    await taskRunner.creerTachePersonnalisee({
      nom: 'Audit rapide SGS',
      description: 'Question fermée SGS',
      agentId: 'inspecteur',
      prompt: 'Évaluez la conformité SGS en 2 phrases.',
    })

    let customs = taskRunner.getCustomTasks()
    expect(customs.length).toBe(1)
    expect(customs[0].agentId).toBe('inspecteur')
    expect(customs[0].nom).toBe('Audit rapide SGS')

    await taskRunner.supprimerTachePersonnalisee(customs[0].id)
    customs = taskRunner.getCustomTasks()
    expect(customs.length).toBe(0)
  })
})