// lib/ia/registry/types.ts
// Registre central des agents IA — types déclaratifs exposant la métadonnée
// de chaque agent (identité, capacité) utilisée pour l'UI du module Agents
// (états d'apprentissage) et l'exécution des tâches personnalisées.

import type { CapaciteInspecteur } from '@/lib/ia/engines/inspecteurMonitoring'

/** Définition d'un agent du système. */
export interface AgentDefinition {
  id: string
  /** Identifiant exporté du singleton (ex. `riskAgent`). */
  slug: string
  nom: string
  description: string
  /** Capacité de supervision AERORISQ (voir inspecteurMonitoring). */
  capacite: CapaciteInspecteur | 'general'
  /** Icône lucide (nom de composant). */
  icone?: string
}

/** Vote utilisateur sur un résultat (boucle d'apprentissage). */
export type TaskVote = 'up' | 'down'

/** Enregistrement d'un historique d'exécution. */
export interface TaskExecutionRecord {
  id: string
  taskId: string
  agentId: string
  agentNom: string
  date: string
  params: Record<string, unknown>
  output: string
  summary?: string
  fallbackIA?: boolean
  confidence?: number
  dureeMs: number
  vote?: TaskVote
  /** Correction utilisateur (texte) : alimente l'entraînement. */
  correction?: string
}

/** Statistiques d'apprentissage par agent. */
export interface AgentLearningStats {
  agentId: string
  agentNom: string
  total: number
  votesUp: number
  votesDown: number
  corrections: number
  fallbackCount: number
  tauxAcceptation: number
  confianceMoyenne: number
  maturite: number
  maturiteLabel: string
  derniereExecution?: string
}

/** Vue complète pour l'UI du module Agents. */
export interface TaskHistoryStats {
  total: number
  parAgent: AgentLearningStats[]
  derniersResultats: TaskExecutionRecord[]
}