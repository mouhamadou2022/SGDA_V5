// lib/ia/registry/agentRegistry.ts
// Registre central des agents IA : expose la métadonnée de chaque agent
// (identité, capacité, icône) utilisée par l'UI du module Agents
// (onglet Apprentissage) et l'exécution des tâches personnalisées.
// Les capacités détaillées sont désormais accessibles en dialogue libre
// via le copilote — plus de « tâches » à formulaires pré-encadrées.

'use client'

import { assistantAgent } from '@/lib/ia/agents/assistantAgent'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import { ecartAgent } from '@/lib/ia/agents/ecartAgent'
import { reportAgent } from '@/lib/ia/agents/reportAgent'
import { registreAgent } from '@/lib/ia/agents/registreAgent'
import { certificationAgent } from '@/lib/ia/agents/certificationAgent'
import { checklistAgent } from '@/lib/ia/agents/checklistAgent'
import { inspecteurVirtuel } from '@/lib/ia/agents/inspecteurVirtuelAgent'
import { suggestionMLAgent } from '@/lib/ia/agents/suggestionMLAgent'
import type { AgentDefinition } from './types'

// ============================================================
// DÉPENDANCES D'EXÉCUTION (singletons réutilisés)
// ============================================================

/** Point d'accès des runners vers les singletons d'agents. */
export interface AgentRunDeps {
  assistantAgent: typeof assistantAgent
  riskAgent: typeof riskAgent
  ecartAgent: typeof ecartAgent
  reportAgent: typeof reportAgent
  registreAgent: typeof registreAgent
  certificationAgent: typeof certificationAgent
  checklistAgent: typeof checklistAgent
  inspecteurVirtuel: typeof inspecteurVirtuel
  suggestionMLAgent: typeof suggestionMLAgent
}

// ============================================================
// REGISTRE — MÉTADONNÉES DES AGENTS
// ============================================================

export const AGENT_REGISTRY: AgentDefinition[] = [
  {
    id: 'assistant',
    slug: 'assistantAgent',
    nom: 'Assistant conversationnel',
    description: 'Discussion, aide contextuelle et suggestions proactives.',
    capacite: 'general',
    icone: 'Bot',
  },
  {
    id: 'risk',
    slug: 'riskAgent',
    nom: 'Profil de risque',
    description: 'Analyse quantitative C1-C5, narratif IA et comparaison multi-aérodromes.',
    capacite: 'general',
    icone: 'Gauge',
  },
  {
    id: 'ecart',
    slug: 'ecartAgent',
    nom: 'Écarts & PAC',
    description: 'Évaluation PAC, actions correctives, vérification des preuves, prioritisation.',
    capacite: 'ecart',
    icone: 'AlertTriangle',
  },
  {
    id: 'rapport',
    slug: 'reportAgent',
    nom: 'Rapport de surveillance',
    description: 'Analyse, génération et comparaison des rapports.',
    capacite: 'rapport',
    icone: 'FileText',
  },
  {
    id: 'registre',
    slug: 'registreAgent',
    nom: 'Registre réglementaire',
    description: 'Recherche sémantique, impact réglementaire et besoins en formation.',
    capacite: 'general',
    icone: 'BookOpen',
  },
  {
    id: 'certification',
    slug: 'certificationAgent',
    nom: 'Certification & homologation',
    description: 'Analyse des processus, blocages, suggestions de phases et lettres.',
    capacite: 'certification',
    icone: 'BadgeCheck',
  },
  {
    id: 'checklist',
    slug: 'checklistAgent',
    nom: 'Checklist terrain',
    description: 'Items prioritaires, patterns récurrents et prédictions de résultats.',
    capacite: 'checklist',
    icone: 'ClipboardCheck',
  },
  {
    id: 'inspecteur',
    slug: 'inspecteurVirtuel',
    nom: 'Inspecteur virtuel AERORISQ',
    description: 'Supervision globale : analyse AERORISQ, évaluation SGS, directives et guides.',
    capacite: 'general',
    icone: 'ShieldCheck',
  },
  {
    id: 'suggestionML',
    slug: 'suggestionMLAgent',
    nom: 'Recommandation ML',
    description: 'Prédiction du type et du timing des surveillances, modèle auto-apprenant.',
    capacite: 'general',
    icone: 'Brain',
  },
]

/** Accès des runners aux singletons (utile pour l'exécution des tâches personnalisées). */
export const agentRunDeps: AgentRunDeps = {
  assistantAgent,
  riskAgent,
  ecartAgent,
  reportAgent,
  registreAgent,
  certificationAgent,
  checklistAgent,
  inspecteurVirtuel,
  suggestionMLAgent,
}

export const findAgent = (id: string): AgentDefinition | undefined =>
  AGENT_REGISTRY.find(a => a.id === id)