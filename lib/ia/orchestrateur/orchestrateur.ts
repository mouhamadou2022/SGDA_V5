// lib/ia/orchestrateur/orchestrateur.ts
// Orchestrateur multi-agents AERORISQ : exécute une chaîne d'agents
// déterministes sur un profil de risque, fusionne les votes pondérés par la
// confiance et journalise chaque étape pour la traçabilité.
//
// Aucun workflow existant n'est modifié : le module lit uniquement les moteurs
// en place (synthetiserModeles, complianceEngine, inspecteurMonitoring,
// engineFeedback) et le modèle ML actif.

import { synthetiserModeles } from '@/lib/risque/modelSynthesis'
import { complianceEngine } from '@/lib/ia/engines/complianceEngine'
import { inspecteurMonitoring, type InspecteurMonitoringStats } from '@/lib/ia/engines/inspecteurMonitoring'
import { engineFeedback, type EngineLearningStats } from '@/lib/ia/engines/engineFeedback'
import { getRiskLevel } from '@/lib/risque'
import type {
  AgentVote,
  ContexteMLOrchestrateur,
  EtapeJournal,
  OrchestrateurInput,
  ResultatOrchestrateur,
} from './types'

const HISTORIQUE_KEY = 'sgda_orchestrateur_diagnostics'
const MAX_HISTORIQUE = 20

// ============================================================
// AGENTS DÉTERMINISTES
// ============================================================

function agentRisque(profil: OrchestrateurInput['profil']): AgentVote {
  const diag = synthetiserModeles(profil, profil.qualitative_metrics)
  const confiance = Math.round(diag.confianceGlobale)
  return {
    agent: 'risque',
    label: 'Analyse de risque (synthèse des modèles)',
    degradation: Math.round(diag.indiceGlobal),
    confiance,
    interpretation: diag.interpretation,
    detail: `${diag.votes.length} modèles en consensus — ${diag.tendance.replace(/_/g, ' ')}`,
    dataSupport: Math.round((diag.votes.length / 12) * 100),
    statut: 'ok',
  }
}

function agentConformite(input: OrchestrateurInput): AgentVote {
  const ecarts = input.ecarts ?? []
  const surveillances = input.surveillances ?? []
  if (ecarts.length === 0) {
    return {
      agent: 'conformite',
      label: 'Conformité OACI (écarts)',
      degradation: 0,
      confiance: 0,
      interpretation: 'Aucun écart fourni — agent non applicable.',
      detail: 'Transmettez la liste des écarts de l’aérodrome pour activer ce vote.',
      statut: 'erreur',
    }
  }
  const ca = complianceEngine.analyser(ecarts, surveillances, input.aerodromeId)
  const degradation = Math.max(0, 100 - ca.conformiteGlobale)
  const dataSupport = Math.min(100, 20 + ecarts.length * 8)
  return {
    agent: 'conformite',
    label: 'Conformité OACI (écarts)',
    degradation,
    confiance: Math.round(dataSupport),
    interpretation: ca.ecartsOuverts === 0
      ? 'Aucun écart ouvert sur cet aérodrome.'
      : `${ca.ecartsOuverts} écart(s) ouvert(s) dont ${ca.ecartsCritiques} critique(s) — résolution ${ca.tauxResolution}%.`,
    detail: ca.pointsBloquants.length > 0 ? ca.pointsBloquants.join(' · ') : `Tendance ${ca.tendanceConformite}.`,
    dataSupport,
    statut: 'ok',
  }
}

function agentModelesML(ctx?: ContexteMLOrchestrateur): AgentVote {
  const rfAccuracy = (ctx?.rfAccuracy ?? 0) * 100
  const benchmarkBest = ctx?.benchmarkMeilleurScore ?? 0
  const score = rfAccuracy > 0 ? Math.round((rfAccuracy + benchmarkBest) / 2) : 0
  return {
    agent: 'modeles_ml',
    label: 'Modèles ML (Random Forest, XGBoost, LightGBM, CatBoost, MLP)',
    degradation: score > 0 ? Math.max(0, 100 - score) : 0,
    confiance: score > 0 ? Math.max(30, score) : 0,
    interpretation: score > 0
      ? `Modèle actif « ${ctx?.modeleActifNom ?? '—'} » : précision RF ${rfAccuracy.toFixed(0)}%, meilleur score benchmark ${benchmarkBest}.`
      : 'Aucun modèle ML entraîné.',
    detail: score > 0 ? 'La performance ML soutient la fiabilité des prédictions de risque.' : 'Entraînez un modèle via le Monitoring ML.',
    dataSupport: score,
    statut: 'ok',
  }
}

function agentInspecteur(stats?: InspecteurMonitoringStats | null): AgentVote {
  const maturite = stats?.maturiteGlobale ?? 0
  const nb = stats?.totalFeedbacks ?? 0
  return {
    agent: 'inspecteur',
    label: 'Inspecteur virtuel (maturité par capacité)',
    degradation: nb > 0 ? 100 - maturite : 0,
    confiance: nb > 0 ? Math.min(90, 30 + nb * 5) : 0,
    interpretation: nb > 0
      ? `Maturité ${maturite}/100 (${stats?.maturiteGlobaleLabel ?? 'N1'}) sur ${nb} retours.`
      : 'Aucun retour inspecteur — maturité non évaluable.',
    detail: nb > 0 ? 'L’acceptation des suggestions inspecteur renforce la confiance dans le module.' : 'Acceptez ou corrigez les suggestions dans les checklists.',
    dataSupport: nb > 0 ? Math.min(100, 20 + nb * 4) : 0,
    statut: 'ok',
  }
}

function agentFeedback(stats?: EngineLearningStats | null): AgentVote {
  const pertinence = stats?.pertinenceRate ?? 0
  const nb = stats?.totalFeedbacks ?? 0
  return {
    agent: 'feedback',
    label: 'Pertinence des décisions AERORISQ',
    degradation: nb > 0 ? 100 - pertinence : 0,
    confiance: nb > 0 ? Math.min(90, 30 + nb * 3) : 0,
    interpretation: nb > 0
      ? `${pertinence}% de décisions pertinentes sur ${nb} feedbacks.`
      : 'Aucun feedback décisionnel enregistré.',
    detail: nb > 0 ? 'La pertinence des recommandations valide la qualité du raisonnement.' : 'Évaluez les recommandations pour activer ce vote.',
    dataSupport: nb > 0 ? Math.min(100, 15 + nb * 4) : 0,
    statut: 'ok',
  }
}

// ============================================================
// FUSION ET RECOMMANDATION
// ============================================================

function fusionnerVotes(votes: AgentVote[]): { indiceGlobal: number; confianceGlobale: number } {
  const exploitables = votes.filter(v => v.statut === 'ok' && v.confiance > 0)
  if (exploitables.length === 0) return { indiceGlobal: 0, confianceGlobale: 0 }
  const sommePoids = exploitables.reduce((s, v) => s + v.confiance, 0)
  const indiceGlobal = Math.round(
    exploitables.reduce((s, v) => s + v.degradation * v.confiance, 0) / sommePoids,
  )
  const confianceGlobale = Math.round(
    exploitables.reduce((s, v) => s + v.confiance, 0) / exploitables.length,
  )
  return { indiceGlobal, confianceGlobale }
}

function construireRecommandation(votes: AgentVote[], indiceGlobal: number): string {
  const parties: string[] = []
  const conformite = votes.find(v => v.agent === 'conformite' && v.statut === 'ok')
  if (conformite && conformite.detail && indiceGlobal >= 40) {
    parties.push(`Traiter en priorité : ${conformite.detail}`)
  }
  const risque = votes.find(v => v.agent === 'risque' && v.statut === 'ok')
  const inspecteur = votes.find(v => v.agent === 'inspecteur' && v.statut === 'ok')
  if (inspecteur && inspecteur.degradation >= 40) {
    parties.push('Renforcer la supervision : maturité de l’inspecteur virtuel insuffisante pour fiabiliser les constats.')
  }
  if (indiceGlobal >= 55) {
    parties.push('Programmer une inspection rapprochée et renforcer la surveillance sur les critères dégradés.')
  } else if (indiceGlobal >= 35) {
    parties.push('Maintenir la surveillance en cours et suivre la résolution des écarts.')
  } else {
    parties.push('Poursuivre la surveillance planifiée — la situation ne justifie pas de mesure immédiate.')
  }
  const dernierePartie = parties[parties.length - 1]
  const debut = risque ? `${risque.interpretation}.` : 'Diagnostic calculé à partir des données disponibles.'
  return [debut, dernierePartie, parties.length > 2 ? parties.slice(0, -1).join(' ') : ''].filter(Boolean).join(' ')
}

// ============================================================
// MOTEUR PRINCIPAL
// ============================================================

/**
 * Lance un diagnostic multi-agents sur un aérodrome : exécute chaque agent,
 * fusionne les votes et journalise le raisonnement complet.
 * Déterministe (aucun appel réseau) — testable.
 */
export function lancerDiagnosticOrchestrateur(input: OrchestrateurInput): ResultatOrchestrateur {
  const horodatage = new Date().toISOString()
  const journal: EtapeJournal[] = []
  const etapes: Array<{ etape: string; entree: string; exec: () => AgentVote }> = [
    { etape: 'Agrégation des modèles de risque', entree: `profil ${input.aerodromeId} — score_global ${input.profil.score_global}`, exec: () => agentRisque(input.profil) },
    { etape: 'Vérification de conformité OACI', entree: `${input.ecarts?.length ?? 0} écarts transmis`, exec: () => agentConformite(input) },
    { etape: 'Évaluation des modèles ML', entree: 'métadonnées du modèle actif et du dernier benchmark', exec: () => agentModelesML(input.contexteML) },
    { etape: 'Mesure de la maturité inspecteur', entree: 'statistiques inspecteurMonitoring', exec: () => agentInspecteur(inspecteurMonitoring.getStats()) },
    { etape: 'Mesure de la pertinence décisionnelle', entree: 'statistiques engineFeedback', exec: () => agentFeedback(engineFeedback.getStats()) },
  ]

  const votes: AgentVote[] = []
  for (const etape of etapes) {
    const debut = performance.now()
    try {
      const vote = etape.exec()
      votes.push(vote)
      journal.push({
        etape: etape.etape,
        agent: vote.agent,
        entree: etape.entree,
        sortie: `${vote.label} → dégradation ${vote.degradation} (confiance ${vote.confiance})`,
        dureeMs: Math.round(performance.now() - debut),
        horodatage: new Date().toISOString(),
      })
    } catch (error) {
      journal.push({
        etape: etape.etape,
        agent: etape.etape,
        entree: etape.entree,
        sortie: `ERREUR : ${error instanceof Error ? error.message : String(error)}`,
        dureeMs: Math.round(performance.now() - debut),
        horodatage: new Date().toISOString(),
      })
    }
  }

  const { indiceGlobal, confianceGlobale } = fusionnerVotes(votes)
  const niveauMaj = getRiskLevel(Math.max(0, Math.min(100, 100 - indiceGlobal)))
  const niveau = niveauMaj.toLowerCase() as Lowercase<typeof niveauMaj>

  const resultat: ResultatOrchestrateur = {
    id: `orch-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    aerodromeId: input.aerodromeId,
    aerodromeNom: input.aerodromeNom,
    horodatage,
    indiceGlobal,
    niveau,
    confianceGlobale,
    interpretation: indiceGlobal <= 15
      ? 'La situation est maîtrisée : les modèles convergent vers une stabilité.'
      : indiceGlobal <= 40
        ? 'Des signaux de vigilance existent mais restent sous contrôle.'
        : indiceGlobal <= 65
          ? 'La dégradation est marquée : plusieurs indicateurs appellent une action.'
          : 'La situation est critique : les indicateurs convergent vers un risque élevé.',
    votes,
    recommandation: construireRecommandation(votes, indiceGlobal),
    journal,
    donneesUtilisees: [
      'profil_risque (score C1-C5, modèles probabilistes)',
      ...(input.ecarts && input.ecarts.length > 0 ? ['ecarts (conformité OACI)'] : []),
      ...(input.surveillances && input.surveillances.length > 0 ? ['surveillances'] : []),
      'modèle ML actif + dernier benchmark',
      'retours inspecteur virtuel',
      'feedback des décisions AERORISQ',
    ],
    modelesAppeles: [
      'synthetiserModeles (12 modèles)',
      'complianceEngine',
      'inspecteurMonitoring',
      'engineFeedback',
      ...(input.contexteML?.modeleActifNom ? [input.contexteML.modeleActifNom] : []),
    ],
  }

  persister(resultat)
  return resultat
}

// ============================================================
// PERSISTANCE (localStorage — journal de traçabilité)
// ============================================================

function lireStockage(): Record<string, ResultatOrchestrateur[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(HISTORIQUE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ResultatOrchestrateur[]>) : {}
  } catch { return {} }
}

function persister(resultat: ResultatOrchestrateur): void {
  if (typeof window === 'undefined') return
  try {
    const stock = lireStockage()
    const liste = stock[resultat.aerodromeId] ?? []
    stock[resultat.aerodromeId] = [resultat, ...liste].slice(0, MAX_HISTORIQUE)
    localStorage.setItem(HISTORIQUE_KEY, JSON.stringify(stock))
  } catch { /* localStorage indisponible */ }
}

export function historiqueOrchestrateur(aerodromeId: string): ResultatOrchestrateur[] {
  return lireStockage()[aerodromeId] ?? []
}

export function lireDernierDiagnostic(aerodromeId: string): ResultatOrchestrateur | null {
  return historiqueOrchestrateur(aerodromeId)[0] ?? null
}

export function effacerHistoriqueOrchestrateur(aerodromeId?: string): void {
  if (typeof window === 'undefined') return
  try {
    if (aerodromeId) {
      const stock = lireStockage()
      delete stock[aerodromeId]
      localStorage.setItem(HISTORIQUE_KEY, JSON.stringify(stock))
    } else {
      localStorage.removeItem(HISTORIQUE_KEY)
    }
  } catch { /* localStorage indisponible */ }
}
