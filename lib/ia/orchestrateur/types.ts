// lib/ia/orchestrateur/types.ts
// Types du moteur d'orchestration multi-agents AERORISQ.
// Module strictement additif : compose des moteurs déterministes existants
// sans modifier aucun workflow en place.

import type { ProfilRisque, Ecart, Surveillance } from '@/lib/store'

export type NiveauOrchestrateur = 'critique' | 'eleve' | 'moyen' | 'faible'

export interface ContexteMLOrchestrateur {
  rfAccuracy?: number
  benchmarkMeilleurScore?: number
  modeleActifNom?: string | null
}

export interface OrchestrateurInput {
  aerodromeId: string
  aerodromeNom?: string
  profil: ProfilRisque
  ecarts?: Ecart[]
  surveillances?: Surveillance[]
  contexteML?: ContexteMLOrchestrateur
}

export interface AgentVote {
  agent: string
  label: string
  /** Indice de dégradation 0-100 (100 = situation critique). */
  degradation: number
  /** Confiance 0-100 dans le vote — pondère la fusion. */
  confiance: number
  interpretation: string
  detail?: string
  /** 0-100 : quantité de données derrière le vote. */
  dataSupport?: number
  statut: 'ok' | 'erreur'
}

export interface EtapeJournal {
  etape: string
  agent: string
  entree: string
  sortie: string
  dureeMs: number
  horodatage: string
}

export interface ResultatOrchestrateur {
  id: string
  aerodromeId: string
  aerodromeNom?: string
  horodatage: string
  /** Indice de dégradation global pondéré 0-100. */
  indiceGlobal: number
  niveau: NiveauOrchestrateur
  confianceGlobale: number
  interpretation: string
  votes: AgentVote[]
  recommandation: string
  journal: EtapeJournal[]
  donneesUtilisees: string[]
  modelesAppeles: string[]
}
